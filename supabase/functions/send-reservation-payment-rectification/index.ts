// Sends a "rectificación de pago" email after an admin corrects the AMOUNT or CURRENCY
// of a reservation payment that had previously been notified by email ("pago_registrado").
// - Admin only (JWT + public.user_roles / is_super_admin).
// - Old/new values are read from the server-side audit (reservation_payment_changes),
//   never from the browser. Only edits made in the last 30 minutes qualify (no retro sends).
// - Idempotent per audit change (notify-reservation enforces unique idempotency_key).
// - Delegates queueing + logging to notify-reservation (tipo 'pago_rectificado').
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const fmtMoney = (n: number, c: string) => {
  const cur = (c || "ARS").toUpperCase();
  const sym = cur === "USD" ? "USD " : cur === "EUR" ? "EUR " : "$ ";
  return `${sym}${Number(n || 0).toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
};
const fmtDate = (d?: string | null) => {
  if (!d) return "";
  const [y, m, dd] = d.slice(0, 10).split("-");
  return `${dd}/${m}/${y}`;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ error: "No autenticado" }, 401);
    const sb = createClient(SUPABASE_URL, SERVICE);
    const { data: u } = await sb.auth.getUser(jwt);
    const uid = u?.user?.id;
    if (!uid) return json({ error: "Sesión inválida" }, 401);
    const { data: roles } = await sb.from("user_roles").select("role").eq("user_id", uid);
    let isAdmin = (roles || []).some((r: any) => r.role === "admin");
    if (!isAdmin) {
      const { data: sa } = await sb.rpc("is_super_admin", { _user_id: uid });
      isAdmin = sa === true;
    }
    if (!isAdmin) return json({ error: "Solo administración" }, 403);

    const { payment_id } = await req.json();
    if (!payment_id) return json({ error: "Falta payment_id" }, 400);

    const { data: p } = await sb.from("reservation_payments")
      .select("id, reservation_id, amount, currency, original_amount, original_currency, equivalent_amount_event_currency, payment_date, payment_method, payment_reference, created_at, anulado_at")
      .eq("id", payment_id).maybeSingle();
    if (!p) return json({ error: "Pago no encontrado" }, 404);
    if (p.anulado_at) return json({ sent: false, reason: "payment_annulled" });

    // Latest amount/currency correction from the server-side audit.
    const since = new Date(Date.now() - 30 * 60000).toISOString();
    const { data: changes } = await sb.from("reservation_payment_changes")
      .select("id, field_changed, old_value, new_value, created_at")
      .eq("payment_id", p.id).eq("action", "edicion").in("field_changed", ["amount", "currency"])
      .gte("created_at", since).order("created_at", { ascending: false }).limit(4);
    if (!changes || changes.length === 0) return json({ sent: false, reason: "no_recent_amount_change" });
    const latestAt = new Date(changes[0].created_at).getTime();
    const batch = changes.filter((c: any) => latestAt - new Date(c.created_at).getTime() < 15000);
    const amtCh = batch.find((c: any) => c.field_changed === "amount");
    const curCh = batch.find((c: any) => c.field_changed === "currency");
    const newAmt = Number(p.original_amount ?? p.amount);
    const newCur = String(p.original_currency ?? p.currency);
    const oldAmt = amtCh ? Number(amtCh.old_value) : newAmt;
    const oldCur = curCh ? String(curCh.old_value) : newCur;
    if (oldAmt === newAmt && oldCur === newCur) return json({ sent: false, reason: "no_effective_change" });

    // Was the original payment notified by email?
    const createdMs = new Date(p.created_at).getTime();
    const { data: notifs } = await sb.from("reservation_notifications")
      .select("id, created_at, metadata")
      .eq("reservation_id", p.reservation_id).eq("tipo", "pago_registrado").eq("canal", "email")
      .order("created_at", { ascending: true });
    const sentOk = (notifs || []).filter((n: any) => n.metadata?.email_sent !== false);
    let original = p.payment_reference
      ? sentOk.find((n: any) => n.metadata?.payment_reference === p.payment_reference)
      : undefined;
    if (!original) {
      original = sentOk
        .filter((n: any) => {
          const t = new Date(n.created_at).getTime();
          return t >= createdMs - 2 * 60000 && t <= createdMs + 30 * 60000;
        })
        .sort((a: any, b: any) => Math.abs(new Date(a.created_at).getTime() - createdMs) - Math.abs(new Date(b.created_at).getTime() - createdMs))[0];
    }
    if (!original) return json({ sent: false, reason: "no_original_notification" });

    const { data: r } = await sb.from("event_reservations")
      .select("id, alumno_id, external_participant_id, event_id, amount_paid, balance_due, currency_snapshot, moneda")
      .eq("id", p.reservation_id).maybeSingle();
    if (!r) return json({ error: "Reserva no encontrada" }, 404);
    const evCur = r.currency_snapshot || r.moneda || "ARS";

    let nombre = "ciclista";
    if (r.alumno_id) {
      const { data: a } = await sb.from("alumnos").select("nombre, apellido").eq("id", r.alumno_id).maybeSingle();
      if (a) nombre = `${a.nombre || ""} ${a.apellido || ""}`.trim() || nombre;
    } else if (r.external_participant_id) {
      const { data: x } = await sb.from("event_external_participants").select("nombre, apellido").eq("id", r.external_participant_id).maybeSingle();
      if (x) nombre = `${x.nombre || ""} ${x.apellido || ""}`.trim() || nombre;
    }
    const { data: ev } = await sb.from("events").select("title").eq("id", r.event_id).maybeSingle();
    const evento = ev?.title || "tu viaje";

    // Amount previously informed: what the original email said; fallback to the audited old value.
    const informedRaw = Number(original.metadata?.monto);
    const informado = Number.isFinite(informedRaw) && informedRaw > 0 ? fmtMoney(informedRaw, evCur) : fmtMoney(oldAmt, oldCur);
    const corregido = fmtMoney(newAmt, newCur);
    const fecha = fmtDate(p.payment_date);
    const ident = p.payment_reference ? `${p.payment_reference}` : `Pago del ${fecha}`;
    const abonado = fmtMoney(Number(r.amount_paid || 0), evCur);
    const saldo = fmtMoney(Number(r.balance_due || 0), evCur);

    const asunto = `Rectificación de tu pago — ${evento}`;
    const texto = `Hola ${nombre},\n\nTe escribimos para corregir el aviso de pago que te enviamos antes para ${evento}. Este correo reemplaza esa comunicación.\n\nImporte informado anteriormente: ${informado}\nImporte correcto: ${corregido}\nFecha del pago: ${fecha}\nIdentificación del pago: ${ident}\n\nAbonado hasta ahora: ${abonado}\nSaldo pendiente actualizado: ${saldo}\n\nDisculpá la confusión. Ante cualquier duda, respondé este correo.\nCiclismo Reybaud`;
    const row = (k: string, v: string, strong = false) =>
      `<tr><td style="padding:8px;border:1px solid #e5e7eb">${k}</td><td style="padding:8px;border:1px solid #e5e7eb;${strong ? "font-weight:bold" : ""}">${esc(v)}</td></tr>`;
    const html = `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px"><h2 style="color:#1a1a2e">Rectificación de pago</h2><p>Hola <strong>${esc(nombre)}</strong>,</p><p>Te escribimos para corregir el aviso de pago que te enviamos antes para <strong>${esc(evento)}</strong>. <strong>Este correo reemplaza esa comunicación.</strong></p><table style="width:100%;border-collapse:collapse;margin:16px 0">${row("Importe informado anteriormente", informado)}${row("Importe correcto", corregido, true)}${row("Fecha del pago", fecha)}${row("Identificación del pago", ident)}${row("Abonado hasta ahora", abonado)}${row("Saldo pendiente actualizado", saldo, true)}</table><p>Disculpá la confusión. Ante cualquier duda, respondé este correo.</p><p style="color:#6b7280;font-size:12px">Ciclismo Reybaud</p></div>`;

    const changeId = (amtCh || curCh)!.id;
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/notify-reservation`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE}` },
      body: JSON.stringify({
        reservation_id: r.id,
        alumno_id: r.alumno_id,
        tipo: "pago_rectificado",
        asunto,
        contenido_html: html,
        contenido_texto: texto,
        enviado_por: uid,
        enviado_por_email: u?.user?.email || "admin",
        metadata: {
          payment_id: p.id,
          change_id: changeId,
          original_notification_id: original.id,
          monto_informado: informedRaw || oldAmt,
          monto_anterior: oldAmt, moneda_anterior: oldCur,
          monto_corregido: newAmt, moneda_corregida: newCur,
          nuevo_abonado: Number(r.amount_paid || 0), nuevo_saldo: Number(r.balance_due || 0),
        },
        idempotency_key: `pago-rectificacion-${p.id}-${changeId}`,
        canal: "email",
      }),
    });
    const body = await resp.json().catch(() => ({}));
    if (!resp.ok) return json({ email_sent: false, error: body?.error || `HTTP ${resp.status}` });
    return json(body);
  } catch (e: any) {
    console.error("send-reservation-payment-rectification error:", e);
    return json({ email_sent: false, error: e.message }, 500);
  }
});
