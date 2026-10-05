// Email "Ya abrimos las inscripciones" para preinscriptos de un programa.
// Envía UN email a UN beneficio (program_preinscripcion_benefits) con su link personal.
// - Beneficios de prueba (es_prueba=true): se pueden enviar una sola vez sin sesión.
// - Beneficios reales: sólo admin/super_admin. No hay envío masivo en esta función.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendLegacyEmailPayload } from "../_shared/send-managed-email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const SENDER_DOMAIN = "notify.reybaud-app.com";
const FROM_NAME = "Ciclismo Reybaud";
const APP_DOMAIN = "https://reybaud-app.com";

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const money = (n: number) => `$${Number(n).toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;
const esc = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const DIAS = ["domingos", "lunes", "martes", "miércoles", "jueves", "viernes", "sábados"];
const MESES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const benefitId = typeof body?.benefit_id === "string" ? body.benefit_id : "";
    if (!/^[0-9a-f-]{36}$/i.test(benefitId)) return json({ error: "benefit_id inválido" }, 400);

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: b } = await sb.from("program_preinscripcion_benefits").select("*").eq("id", benefitId).maybeSingle();
    if (!b) return json({ error: "Beneficio no encontrado" }, 404);
    if (!b.activo) return json({ error: "Beneficio inactivo" }, 400);

    if (!b.es_prueba) {
      const auth = req.headers.get("Authorization") ?? "";
      const token = auth.replace("Bearer ", "");
      const { data: u } = await sb.auth.getUser(token);
      const uid = u?.user?.id;
      const { data: isSuper } = uid ? await sb.rpc("is_super_admin", { _user_id: uid }) : { data: false };
      const { data: isAdmin } = uid && !isSuper ? await sb.rpc("has_role", { _user_id: uid, _role: "admin" }) : { data: false };
      if (!isSuper && !isAdmin) return json({ error: "Sólo administradores pueden enviar a preinscriptos reales" }, 403);
    }
    if (b.email_sent_at && !body?.resend) return json({ error: "Ya enviado", sent_at: b.email_sent_at }, 409);

    const { data: plan } = await sb.from("planes").select("id, cohort_slug").eq("id", b.plan_id).single();
    const { data: sedes } = await sb
      .from("planes_sedes")
      .select("dia_semana, hora_inicio, hora_fin, cupo_maximo, sedes(nombre)")
      .eq("plan_id", b.plan_id).eq("activa", true);

    const link = `${APP_DOMAIN}/formacion-inicial?cohort=${encodeURIComponent(plan!.cohort_slug)}&beneficio=${b.token}`;
    const [y, m, d] = String(b.valid_until).split("-").map(Number);
    const hasta = `${d} de ${MESES[m - 1]}`;
    const sedeLines = (sedes ?? []).map((s: any) =>
      `${s.sedes?.nombre} — ${DIAS[s.dia_semana] ?? ""} de ${String(s.hora_inicio).slice(0, 5)} a ${String(s.hora_fin).slice(0, 5)}`);
    const cupos = [...new Set((sedes ?? []).map((s: any) => s.cupo_maximo))];
    const cupoTxt = cupos.length === 1 && cupos[0] ? `Cada sede tiene ${cupos[0]} cupos, así que las vacantes se manejan de forma independiente.` : "Cada sede tiene cupos propios, así que las vacantes se manejan de forma independiente.";
    const cuotasTxt = b.precio_cuota && b.cuotas_cantidad > 1 ? `o ${b.cuotas_cantidad} cuotas de ${money(b.precio_cuota)}` : "";

    const subject = `${b.es_prueba ? "PRUEBA · " : ""}Ya abrimos las inscripciones al Programa de Iniciación 🚴‍♀️`;
    const p = (t: string) => `<p style="font-size:15px;color:#333;line-height:1.6;margin:0 0 14px;">${t}</p>`;
    const html = `<!doctype html><html><body style="margin:0;padding:0;background:#ffffff;font-family:Arial,sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:32px 24px;">
${p("Hola, ¿cómo estás?")}
${p("Te escribimos porque te preinscribiste al Programa de Iniciación al Ciclismo de octubre y ya abrimos oficialmente las inscripciones.")}
${p("Por haberte preinscripto, tenés un precio exclusivo reservado:")}
<div style="border:1px solid #fed7aa;background:#fff7ed;border-radius:10px;padding:16px 18px;margin:0 0 16px;">
<div style="font-size:26px;font-weight:700;color:#ea580c;">${money(b.precio_total)}</div>
${cuotasTxt ? `<div style="font-size:15px;color:#333;margin-top:4px;">${esc(cuotasTxt)}</div>` : ""}
</div>
${p("Podés elegir entre dos sedes:")}
${p(sedeLines.map(esc).join("<br/>"))}
${p(esc(cupoTxt))}
${p(`Tu precio especial estará disponible hasta el <strong>${esc(hasta)}</strong>.`)}
<div style="text-align:center;margin:26px 0;">
<a href="${esc(link)}" style="display:inline-block;background:#f97316;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:700;font-size:16px;">Confirmá tu lugar acá</a>
<div style="font-size:12px;color:#888;margin-top:10px;word-break:break-all;">Si el botón no funciona, copiá este enlace:<br/><a href="${esc(link)}" style="color:#ea580c;">${esc(link)}</a></div>
</div>
${p("Una vez que completes la inscripción, vas a recibir por email toda la información para comenzar.")}
${p("Nos vemos en la bici 💙<br/>Equipo Ciclismo Reybaud")}
</div></body></html>`;
    const text = `Hola, ¿cómo estás?\n\nTe escribimos porque te preinscribiste al Programa de Iniciación al Ciclismo de octubre y ya abrimos oficialmente las inscripciones.\n\nPor haberte preinscripto, tenés un precio exclusivo reservado:\n\n${money(b.precio_total)}\n${cuotasTxt}\n\nPodés elegir entre dos sedes:\n${sedeLines.join("\n")}\n\n${cupoTxt}\n\nTu precio especial estará disponible hasta el ${hasta}.\n\nConfirmá tu lugar acá: ${link}\n\nUna vez que completes la inscripción, vas a recibir por email toda la información para comenzar.\n\nNos vemos en la bici 💙\nEquipo Ciclismo Reybaud`;

    const messageId = `prog-apertura-${b.id}-${Date.now()}`;
    const res = await sendLegacyEmailPayload({
      message_id: messageId,
      to: b.email,
      from: `${FROM_NAME} <programas@${SENDER_DOMAIN}>`,
      subject, html, text,
      label: "programa_apertura_preinscriptos",
      idempotency_key: body?.resend ? messageId : `prog-apertura-${b.id}`,
    }, sb);

    const status = res.sent ? "sent" : res.reason ?? "failed";
    await sb.from("program_preinscripcion_benefits").update({
      email_status: status,
      email_message_id: messageId,
      ...(res.sent ? { email_sent_at: new Date().toISOString() } : {}),
      updated_at: new Date().toISOString(),
    }).eq("id", b.id);

    return json({ ok: res.sent, status, error: res.error?.message });
  } catch (e: any) {
    return json({ error: e?.message ?? String(e) }, 500);
  }
});
