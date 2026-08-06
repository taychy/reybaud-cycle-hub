// Pide vincular un email nuevo a una ficha de alumno existente.
// Envía un email de confirmación a la casilla PRINCIPAL de la ficha.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SENDER_DOMAIN = "notify.reybaud-app.com";
const FROM_NAME = "Ciclismo Reybaud";
const APP_URL = "https://reybaud-app.com";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { email, telefono, documento } = await req.json();
    if (!email) {
      return new Response(JSON.stringify({ error: "Email requerido" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data, error } = await supabase.rpc("request_alumno_email_link", {
      p_nuevo_email: String(email).toLowerCase().trim(),
      p_telefono: telefono || null,
      p_documento: documento || null,
    });

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row) {
      return new Response(JSON.stringify({ error: "No encontramos una ficha con esos datos" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const link = `${APP_URL}/vincular-email?token=${row.token}`;
    const nuevoEmail = String(email).toLowerCase().trim();

    const html = `
      <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; background:#0b0b0d; padding:24px;">
        <div style="max-width:520px; margin:0 auto; background:#141417; border-radius:12px; padding:24px; color:#e5e7eb;">
          <h2 style="color:#f59e0b; margin:0 0 12px; font-size:20px;">Vincular un nuevo email a tu ficha</h2>
          <p style="margin:0 0 12px;">Hola ${row.nombre_completo || ""},</p>
          <p style="margin:0 0 12px;">
            Alguien pidió vincular el email <strong>${nuevoEmail}</strong> a tu ficha de alumno
            (coincidencia por ${row.motivo === "documento" ? "documento" : "teléfono"}).
          </p>
          <p style="margin:0 0 20px;">
            Si fuiste vos, confirmá para usar ese email además del principal.
            Tu ficha, suscripciones, pagos y cuenta corriente se mantienen igual: no se crea una cuenta nueva.
          </p>
          <p style="text-align:center; margin:24px 0;">
            <a href="${link}" style="background:#f59e0b; color:#111; text-decoration:none; padding:12px 22px; border-radius:8px; font-weight:600;">
              Confirmar vinculación
            </a>
          </p>
          <p style="color:#9ca3af; font-size:12px; margin:0;">
            El enlace vence en 48 horas. Si no reconocés este pedido, ignorá este mensaje: no se hará ningún cambio.
          </p>
        </div>
      </div>
    `;

    const messageId = crypto.randomUUID();
    const { error: qErr } = await supabase.rpc("enqueue_email", {
      queue_name: "transactional_emails",
      payload: {
        message_id: messageId,
        to: row.destino_email,
        from: `${FROM_NAME} <noreply@${SENDER_DOMAIN}>`,
        sender_domain: SENDER_DOMAIN,
        subject: "Confirmá la vinculación de tu nuevo email",
        html,
        text: `Confirmá la vinculación de ${nuevoEmail} a tu ficha: ${link}`,
        purpose: "transactional",
        label: "alumno_email_link_request",
        idempotency_key: messageId,
        queued_at: new Date().toISOString(),
      },
    });

    if (qErr) {
      return new Response(JSON.stringify({ error: qErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ ok: true, destino_enmascarado: row.destino_enmascarado, motivo: row.motivo }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
