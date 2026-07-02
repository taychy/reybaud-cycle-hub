import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Envía un mail al alumno pidiendo que complete la autorización de
 * la renovación automática en Mercado Pago.
 *
 * Se dispara cuando el flujo cae al modo "redirect" (MP devuelve init_point)
 * y el alumno todavía no confirmó la autorización.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { alumno_id, init_point, plan_nombre } = await req.json();

    if (!alumno_id || !init_point) {
      return new Response(JSON.stringify({ error: "Faltan parámetros" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: alumno } = await supabaseAdmin
      .from("alumnos")
      .select("nombre, email")
      .eq("id", alumno_id)
      .maybeSingle();

    if (!alumno?.email) {
      return new Response(JSON.stringify({ error: "Alumno sin email" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      console.warn("[notify-pending-autorenewal] RESEND_API_KEY not configured");
      return new Response(JSON.stringify({ ok: true, skipped: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const firstName = (alumno.nombre || "").split(" ")[0] || "Ciclista";
    const planTxt = plan_nombre ? ` para <strong>${plan_nombre}</strong>` : "";

    const subject = "🔁 Terminá de activar tu renovación automática";
    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 520px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #d4820a; margin-bottom: 16px;">Un paso más 🔁</h2>
        <p style="color: #333; margin-bottom: 12px;">
          Hola <strong>${firstName}</strong>, tu pago se acreditó correctamente${planTxt}.
        </p>
        <p style="color: #333; margin-bottom: 12px;">
          Nos falta que <strong>autorices la renovación automática</strong> en Mercado Pago para que el próximo mes se cobre solo y no tengas que hacer nada.
        </p>
        <div style="text-align: center; margin: 24px 0;">
          <a href="${init_point}"
             style="display: inline-block; padding: 14px 28px; background: #d4820a; color: white; text-decoration: none; border-radius: 8px; font-weight: 600;">
            Autorizar en Mercado Pago
          </a>
        </div>
        <p style="color: #666; font-size: 13px; margin-bottom: 8px;">
          Es rápido: te va a pedir confirmar tu tarjeta y listo. Si no lo hacés, el mes que viene tenés que pagar de nuevo manualmente.
        </p>
        <p style="color: #666; font-size: 13px;">
          Podés desactivarla cuando quieras desde tu perfil en la app.
        </p>
        <p style="color: #999; font-size: 12px; margin-top: 24px; text-align: center;">
          Ciclismo Reybaud — Escuela de ciclismo
        </p>
      </div>
    `;

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "Ciclismo Reybaud <no-reply@ciclismoreybaud.com>",
        to: [alumno.email],
        subject,
        html,
      }),
    });

    if (!resendRes.ok) {
      const txt = await resendRes.text().catch(() => "");
      console.error("[notify-pending-autorenewal] resend error:", resendRes.status, txt);
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[notify-pending-autorenewal] error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
