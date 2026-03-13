import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { alumno_id, type, grupo, fecha_vencimiento } = await req.json();

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: alumno } = await supabaseAdmin
      .from("alumnos")
      .select("nombre, email")
      .eq("id", alumno_id)
      .single();

    if (!alumno) {
      return new Response(JSON.stringify({ error: "Alumno no encontrado" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      console.warn("RESEND_API_KEY not configured, skipping email");
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let subject = "";
    let emailHtml = "";
    const firstName = alumno.nombre.split(" ")[0];

    if (type === "grupo_asignado") {
      subject = `🚴 ¡Te asignamos al grupo ${grupo}!`;
      emailHtml = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 500px; margin: 0 auto; padding: 24px;">
          <h2 style="color: #d4820a; margin-bottom: 16px;">🚴 ¡Grupo asignado!</h2>
          <p style="color: #333; margin-bottom: 16px;">
            Hola <strong>${firstName}</strong>, te informamos que fuiste asignado/a al grupo <strong>${grupo}</strong> en Ciclismo Reybaud.
          </p>
          <p style="color: #333; margin-bottom: 16px;">
            Ya podés ingresar a la app para ver tus entrenamientos semanales.
          </p>
          <div style="text-align: center; margin-top: 24px;">
            <a href="https://reybaud-cycle-hub.lovable.app" style="display: inline-block; padding: 12px 28px; background: #d4820a; color: white; text-decoration: none; border-radius: 8px; font-weight: 600;">
              Abrir la app
            </a>
          </div>
          <p style="color: #999; font-size: 12px; margin-top: 24px; text-align: center;">
            Ciclismo Reybaud — Escuela de ciclismo
          </p>
        </div>
      `;
    } else if (type === "habilitado") {
      const fechaText = fecha_vencimiento
        ? new Date(fecha_vencimiento + "T12:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "long", year: "numeric" })
        : null;
      subject = `✅ ¡Tu cuenta fue habilitada!`;
      emailHtml = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 500px; margin: 0 auto; padding: 24px;">
          <h2 style="color: #d4820a; margin-bottom: 16px;">✅ ¡Cuenta habilitada!</h2>
          <p style="color: #333; margin-bottom: 16px;">
            Hola <strong>${firstName}</strong>, tu cuenta en Ciclismo Reybaud fue habilitada exitosamente.
          </p>
          ${fechaText ? `<p style="color: #333; margin-bottom: 16px;">
            Tu plan está activo hasta el <strong>${fechaText}</strong>.
          </p>` : ""}
          <p style="color: #333; margin-bottom: 16px;">
            Ya podés acceder a la app e ingresar con tu email para ver tus entrenamientos.
          </p>
          <div style="text-align: center; margin-top: 24px;">
            <a href="https://reybaud-cycle-hub.lovable.app" style="display: inline-block; padding: 12px 28px; background: #d4820a; color: white; text-decoration: none; border-radius: 8px; font-weight: 600;">
              Ingresar a la app
            </a>
          </div>
          <p style="color: #999; font-size: 12px; margin-top: 24px; text-align: center;">
            Ciclismo Reybaud — Escuela de ciclismo
          </p>
        </div>
      `;
    } else if (type === "pago_confirmado") {
      const fechaText = fecha_vencimiento
        ? new Date(fecha_vencimiento + "T12:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "long", year: "numeric" })
        : null;
      subject = `✅ ¡Tu pago fue confirmado!`;
      emailHtml = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 500px; margin: 0 auto; padding: 24px;">
          <h2 style="color: #d4820a; margin-bottom: 16px;">✅ Pago confirmado</h2>
          <p style="color: #333; margin-bottom: 16px;">
            Hola <strong>${firstName}</strong>, tu pago fue confirmado por administración.
          </p>
          ${fechaText ? `<p style="color: #333; margin-bottom: 16px;">
            Tu plan está activo hasta el <strong>${fechaText}</strong>.
          </p>` : ""}
          <p style="color: #333; margin-bottom: 16px;">
            Ya podés acceder a la app y ver tus entrenamientos normalmente.
          </p>
          <div style="text-align: center; margin-top: 24px;">
            <a href="https://reybaud-cycle-hub.lovable.app" style="display: inline-block; padding: 12px 28px; background: #d4820a; color: white; text-decoration: none; border-radius: 8px; font-weight: 600;">
              Abrir la app
            </a>
          </div>
          <p style="color: #999; font-size: 12px; margin-top: 24px; text-align: center;">
            Ciclismo Reybaud — Escuela de ciclismo
          </p>
        </div>
      `;
    } else if (type === "pago_rechazado") {
      subject = `❌ Pago no confirmado`;
      emailHtml = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 500px; margin: 0 auto; padding: 24px;">
          <h2 style="color: #cc3333; margin-bottom: 16px;">❌ Pago no confirmado</h2>
          <p style="color: #333; margin-bottom: 16px;">
            Hola <strong>${firstName}</strong>, hubo un problema con el pago que informaste en Ciclismo Reybaud.
          </p>
          <p style="color: #333; margin-bottom: 16px;">
            Por favor, revisalo o contactá a administración para más información.
          </p>
          <div style="text-align: center; margin-top: 24px;">
            <a href="https://reybaud-cycle-hub.lovable.app" style="display: inline-block; padding: 12px 28px; background: #d4820a; color: white; text-decoration: none; border-radius: 8px; font-weight: 600;">
              Ir a la app
            </a>
          </div>
          <p style="color: #999; font-size: 12px; margin-top: 24px; text-align: center;">
            Ciclismo Reybaud — Escuela de ciclismo
          </p>
        </div>
      `;
    } else {
      return new Response(JSON.stringify({ error: "Tipo no válido" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "Ciclismo Reybaud <no-reply@ciclismoreybaud.com>",
        to: [alumno.email],
        subject,
        html: emailHtml,
      }),
    });

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
