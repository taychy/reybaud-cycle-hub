// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SENDER_DOMAIN = "notify.reybaud-app.com";
const FROM_NAME = "Ciclismo Reybaud";
const APP_URL = "https://reybaud-app.com";
const BRAND = "#FF6B1A";

// Reminder schedule (hours after created_at): 1st @ 48h, 2nd @ 168h (7d). Max 2.
const SCHEDULE_HOURS = [48, 168];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    let only_id: string | null = null;
    let manual = false;
    try {
      const body = await req.json();
      only_id = body?.preorder_id || null;
      manual = !!body?.manual;
    } catch (_) {}

    // Manual single send: fetch by id, autodetect seña vs saldo
    if (only_id) {
      const { data: r, error: e1 } = await supabase
        .from("store_preorders")
        .select("id, alumno_nombre, alumno_email, producto_nombre, cantidad, sena_monto, saldo_pendiente, precio_total, moneda, estado, estado_pago_sena, created_at, sena_reminder_count, cancelada_at")
        .eq("id", only_id)
        .maybeSingle();
      if (e1 || !r) throw new Error(e1?.message || "Preventa no encontrada");
      if (!r.alumno_email) throw new Error("La preventa no tiene email del cliente");
      if (r.cancelada_at) throw new Error("La preventa está cancelada");

      const isSaldo = r.estado_pago_sena === "confirmada" && Number(r.saldo_pendiente || 0) > 0;
      const isSena = r.estado_pago_sena !== "confirmada";
      if (!isSaldo && !isSena) throw new Error("Esta preventa ya está totalmente pagada");

      const monto = isSaldo ? Number(r.saldo_pendiente || 0) : Number(r.sena_monto || 0);

      // Generate fresh MP checkout link
      let payUrl = `${APP_URL}/pagar-preventa/${r.id}`;
      try {
        const fnName = isSaldo ? "create-preorder-saldo-mp-preference" : "create-preorder-mp-preference";
        const mpResp = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/${fnName}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({ preorder_id: r.id }),
        });
        const mp = await mpResp.json();
        if (mp?.init_point) payUrl = mp.init_point;
      } catch (e) { console.error("mp pref error", r.id, e); }

      const html = renderEmail({
        nombre: (r.alumno_nombre || "").split(" ")[0] || "hola",
        producto: r.producto_nombre,
        cantidad: r.cantidad,
        monto: formatMoney(monto, r.moneda || "ARS"),
        payUrl,
        isSecond: false,
        mode: isSaldo ? "saldo" : "sena",
      });

      const subject = isSaldo
        ? `Te queda saldo pendiente de tu ${r.producto_nombre}`
        : `Te queda pendiente la seña de tu ${r.producto_nombre}`;

      const messageId = crypto.randomUUID();
      const idemSuffix = isSaldo ? `saldo-${Date.now()}` : `sena-manual-${Date.now()}`;
      const { error: enqErr } = await supabase.rpc("enqueue_email", {
        queue_name: "transactional_emails",
        payload: {
          message_id: messageId,
          to: r.alumno_email,
          from: `${FROM_NAME} <noreply@${SENDER_DOMAIN}>`,
          sender_domain: SENDER_DOMAIN,
          subject,
          html,
          text: "",
          purpose: "transactional",
          label: "preorder_payment_reminder_manual",
          idempotency_key: `preorder-remind-${r.id}-${idemSuffix}`,
          queued_at: new Date().toISOString(),
        },
      });
      if (enqErr) throw enqErr;

      await supabase.from("store_preorders")
        .update({ sena_last_reminder_at: new Date().toISOString() } as any)
        .eq("id", r.id);

      return new Response(JSON.stringify({ ok: true, sent: 1, mode: isSaldo ? "saldo" : "sena" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Cron path: only seña pending, respecting schedule
    const { data: rows, error } = await supabase
      .from("store_preorders")
      .select("id, alumno_nombre, alumno_email, producto_nombre, cantidad, sena_monto, moneda, estado, estado_pago_sena, created_at, sena_reminder_count, sena_last_reminder_at, cancelada_at")
      .eq("estado_pago_sena", "pendiente")
      .in("estado", ["pendiente_pago_sena", "reservada"])
      .is("cancelada_at", null)
      .lt("sena_reminder_count", SCHEDULE_HOURS.length);
    if (error) throw error;

    const now = Date.now();
    const results: any[] = [];

    for (const r of rows || []) {
      if (!r.alumno_email) { results.push({ id: r.id, skipped: "no email" }); continue; }
      const created = new Date(r.created_at).getTime();
      const hours = (now - created) / 3600000;
      const nextIdx = r.sena_reminder_count || 0;
      const due = hours >= SCHEDULE_HOURS[nextIdx];
      if (!due) { results.push({ id: r.id, skipped: `wait ${SCHEDULE_HOURS[nextIdx]}h` }); continue; }

      let payUrl = `${APP_URL}/pagar-preventa/${r.id}`;
      try {
        const mpResp = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/create-preorder-mp-preference`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({ preorder_id: r.id }),
        });
        const mp = await mpResp.json();
        if (mp?.init_point) payUrl = mp.init_point;
      } catch (e) { console.error("mp pref error", r.id, e); }

      const isSecond = nextIdx === 1;
      const html = renderEmail({
        nombre: (r.alumno_nombre || "").split(" ")[0] || "hola",
        producto: r.producto_nombre,
        cantidad: r.cantidad,
        monto: formatMoney(Number(r.sena_monto || 0), r.moneda || "ARS"),
        payUrl,
        isSecond,
        mode: "sena",
      });

      const subject = isSecond
        ? `Último recordatorio: completá la seña de tu ${r.producto_nombre}`
        : `Te queda pendiente la seña de tu ${r.producto_nombre}`;

      const messageId = crypto.randomUUID();
      const { error: enqErr } = await supabase.rpc("enqueue_email", {
        queue_name: "transactional_emails",
        payload: {
          message_id: messageId,
          to: r.alumno_email,
          from: `${FROM_NAME} <noreply@${SENDER_DOMAIN}>`,
          sender_domain: SENDER_DOMAIN,
          subject,
          html,
          text: "",
          purpose: "transactional",
          label: "preorder_payment_reminder",
          idempotency_key: `preorder-remind-${r.id}-${nextIdx}`,
          queued_at: new Date().toISOString(),
        },
      });
      if (enqErr) { results.push({ id: r.id, error: enqErr.message }); continue; }

      await supabase.from("store_preorders")
        .update({
          sena_reminder_count: nextIdx + 1,
          sena_last_reminder_at: new Date().toISOString(),
        } as any)
        .eq("id", r.id);

      results.push({ id: r.id, sent: nextIdx + 1 });
    }

    return new Response(JSON.stringify({ ok: true, processed: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("preorder-payment-reminders error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function formatMoney(n: number, m: string) {
  const sym = m === "USD" ? "US$ " : m === "EUR" ? "€ " : "$ ";
  return sym + n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function escapeHtml(s: string) {
  return (s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function renderEmail(d: { nombre: string; producto: string; cantidad: number; monto: string; payUrl: string; isSecond: boolean; mode: "sena" | "saldo" }) {
  const intro = d.mode === "saldo"
    ? "Te escribimos para recordarte que tu pedido tiene un saldo pendiente. Para coordinar la entrega o el retiro necesitamos que completes el pago."
    : (d.isSecond
        ? "Te escribimos por última vez para recordarte que tu reserva sigue pendiente de pago. Si no acreditamos la seña en las próximas horas, vamos a tener que liberar la unidad."
        : "Vimos que dejaste tu reserva iniciada pero la seña todavía no llegó a nuestra cuenta. Para confirmarla, necesitamos que completes el pago.");
  const ctaLabel = d.mode === "saldo" ? "Pagar saldo ahora" : "Pagar seña ahora";
  const montoLabel = d.mode === "saldo" ? "Saldo pendiente" : "Seña pendiente";
  return `<!doctype html><html><body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1a1a1a;">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;">
    <div style="border-top:4px solid ${BRAND};padding-top:24px;">
      <h1 style="font-size:22px;margin:0 0 8px;">Hola ${escapeHtml(d.nombre)},</h1>
      <p style="margin:0 0 20px;color:#555;font-size:14px;line-height:1.6;">${intro}</p>

      <div style="background:#fafafa;border:1px solid #eee;border-radius:12px;padding:20px;margin-bottom:24px;">
        <table style="width:100%;font-size:14px;border-collapse:collapse;">
          <tr><td style="padding:6px 0;color:#777;">Producto</td><td style="padding:6px 0;font-weight:600;text-align:right;">${escapeHtml(d.producto)}</td></tr>
          <tr><td style="padding:6px 0;color:#777;">Cantidad</td><td style="padding:6px 0;text-align:right;">${d.cantidad}</td></tr>
          <tr><td style="padding:6px 0;color:#777;">${montoLabel}</td><td style="padding:6px 0;font-weight:700;color:${BRAND};text-align:right;">${escapeHtml(d.monto)}</td></tr>
        </table>
      </div>

      <div style="text-align:center;margin:28px 0;">
        <a href="${escapeHtml(d.payUrl)}" style="display:inline-block;background:${BRAND};color:#fff;text-decoration:none;padding:14px 28px;border-radius:10px;font-weight:600;font-size:14px;">${ctaLabel}</a>
      </div>

      <p style="font-size:13px;color:#666;line-height:1.6;margin:24px 0 12px;text-align:center;">
        ¿Ya pagaste por transferencia o efectivo?
      </p>
      <div style="text-align:center;margin:0 0 8px;">
        <a href="${APP_URL}/perfil?section=tienda" style="display:inline-block;background:transparent;color:${BRAND};text-decoration:none;padding:10px 22px;border:1.5px solid ${BRAND};border-radius:10px;font-weight:600;font-size:13px;">Informar pago</a>
      </div>

      <hr style="border:0;border-top:1px solid #eee;margin:32px 0 16px;" />
      <p style="font-size:11px;color:#999;margin:0;">Si ya pagaste y te llegó este mail, escribinos para verificar la acreditación.</p>
    </div>
  </div>
</body></html>`;
}
