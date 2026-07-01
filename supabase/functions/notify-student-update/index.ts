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
    const { alumno_id, type, grupo, fecha_vencimiento, plan_nombre, plan_precio, plan_moneda, pausa_fecha_regreso } = await req.json();

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
    } else if (type === "pago_vencido") {
      let periodo = "";
      let mes = "";
      let year = "";
      if (fecha_vencimiento) {
        const [y, m, d] = fecha_vencimiento.split("-").map(Number);
        const periodDate = new Date(y, m - 1, d);
        periodo = periodDate.toLocaleDateString("es-AR", { month: "long", year: "numeric" });
        mes = periodDate.toLocaleDateString("es-AR", { month: "long" });
        year = String(y);
      }
      subject = `🚴 ¡Arrancó un nuevo mes de entrenamiento!`;
      emailHtml = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 500px; margin: 0 auto; padding: 24px;">
          <h2 style="color: #d4820a; margin-bottom: 6px;">🚴 ¡Arrancó un nuevo mes de entrenamiento!</h2>
          <p style="color: #666; font-size: 13px; margin: 0 0 22px; text-transform: capitalize;">${periodo ? `Nuevo período — ${periodo}` : "Nuevo período"}</p>

          <p style="color: #333; margin-bottom: 16px;">
            Hola <strong>${firstName}</strong> 👋
          </p>
          <p style="color: #333; margin-bottom: 16px;">
            Empezó ${mes || "el nuevo mes"} y con él, un nuevo mes de entrenamientos.
          </p>
          <p style="color: #333; margin-bottom: 16px;">
            Para que sigas con acceso completo a la app y tus entrenamientos sin interrupciones, podés abonar tu mensualidad de ${mes || "este mes"} directamente acá:
          </p>
          <div style="text-align: center; margin-top: 24px;">
            <a href="https://reybaud-cycle-hub.lovable.app/alumno/pagos" style="display: inline-block; padding: 12px 28px; background: #d4820a; color: white; text-decoration: none; border-radius: 8px; font-weight: 600;">
              Abonar mensualidad de ${mes || "este mes"}
            </a>
          </div>
          <p style="color: #333; margin-top: 24px; margin-bottom: 0; font-size: 14px;">
            También podés hacerlo desde la app o contactando a administración.
          </p>
          <p style="color: #999; font-size: 12px; margin-top: 24px; text-align: center;">
            Ciclismo Reybaud — Escuela de ciclismo
          </p>
        </div>
      `;
    } else if (type === "plan_cambiado") {
      const precioText = plan_precio ? ` (${plan_moneda || "ARS"} ${plan_precio})` : "";
      subject = `📋 Tu plan fue actualizado`;
      emailHtml = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 500px; margin: 0 auto; padding: 24px;">
          <h2 style="color: #d4820a; margin-bottom: 16px;">📋 Plan actualizado</h2>
          <p style="color: #333; margin-bottom: 16px;">
            Hola <strong>${firstName}</strong>, te informamos que tu plan en Ciclismo Reybaud fue actualizado.
          </p>
          <p style="color: #333; margin-bottom: 16px;">
            Tu nuevo plan es: <strong>${plan_nombre || "Plan actualizado"}${precioText}</strong>
          </p>
          <p style="color: #333; margin-bottom: 16px;">
            Si tenés alguna duda, no dudes en contactarnos.
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
    } else if (type === "pausa_activada") {
      const fechaTxt = pausa_fecha_regreso ? new Date(pausa_fecha_regreso + "T00:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "long", year: "numeric" }) : "—";
      subject = `⏸️ Tu plan quedó en pausa`;
      emailHtml = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 500px; margin: 0 auto; padding: 24px;">
          <h2 style="color: #d4820a; margin-bottom: 16px;">⏸️ Pausa activada</h2>
          <p style="color: #333; margin-bottom: 12px;">Hola <strong>${firstName}</strong>, tu plan en Ciclismo Reybaud quedó en pausa.</p>
          <p style="color: #333; margin-bottom: 12px;"><strong>Fecha estimada de regreso:</strong> ${fechaTxt}</p>
          <p style="color: #333; margin-bottom: 12px;">Durante este tiempo seguís en la comunidad de WhatsApp y podés ver eventos. No tenés acceso a entrenamientos, clases, Pista ni Asesoría.</p>
          <p style="color: #333; margin-bottom: 16px;">Cuando quieras volver antes, abrí la app y reactivá tu plan en un toque.</p>
          <div style="text-align: center; margin-top: 24px;">
            <a href="https://reybaud-cycle-hub.lovable.app" style="display: inline-block; padding: 12px 28px; background: #d4820a; color: white; text-decoration: none; border-radius: 8px; font-weight: 600;">Abrir la app</a>
          </div>
          <p style="color: #999; font-size: 12px; margin-top: 24px; text-align: center;">Ciclismo Reybaud — Escuela de ciclismo</p>
        </div>
      `;
    } else if (type === "pausa_por_vencer_15d") {
      const fechaTxt = pausa_fecha_regreso ? new Date(pausa_fecha_regreso + "T00:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "long", year: "numeric" }) : "—";
      subject = `⏰ Tu pausa vence en 15 días`;
      emailHtml = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 500px; margin: 0 auto; padding: 24px;">
          <h2 style="color: #d4820a; margin-bottom: 16px;">⏰ Quedan 15 días</h2>
          <p style="color: #333; margin-bottom: 12px;">Hola <strong>${firstName}</strong>, tu pausa vence el <strong>${fechaTxt}</strong>.</p>
          <p style="color: #333; margin-bottom: 12px;">Si querés volver a entrenar, abrí la app y elegí tu plan. Si no reactivás antes de esa fecha, tu cuenta pasa a inactiva y vas a tener que contratar un plan nuevo.</p>
          <div style="text-align: center; margin-top: 24px;">
            <a href="https://reybaud-cycle-hub.lovable.app" style="display: inline-block; padding: 12px 28px; background: #d4820a; color: white; text-decoration: none; border-radius: 8px; font-weight: 600;">Reactivar mi plan</a>
          </div>
          <p style="color: #999; font-size: 12px; margin-top: 24px; text-align: center;">Ciclismo Reybaud — Escuela de ciclismo</p>
        </div>
      `;
    } else if (type === "pausa_vencida") {
      subject = `Tu pausa venció — elegí un plan para volver`;
      emailHtml = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 500px; margin: 0 auto; padding: 24px;">
          <h2 style="color: #d4820a; margin-bottom: 16px;">Tu pausa terminó</h2>
          <p style="color: #333; margin-bottom: 12px;">Hola <strong>${firstName}</strong>, llegó la fecha de regreso y tu pausa quedó cerrada. Tu cuenta está inactiva.</p>
          <p style="color: #333; margin-bottom: 16px;">Te esperamos. Elegí tu plan y volvemos a rodar.</p>
          <div style="text-align: center; margin-top: 24px;">
            <a href="https://reybaud-cycle-hub.lovable.app" style="display: inline-block; padding: 12px 28px; background: #d4820a; color: white; text-decoration: none; border-radius: 8px; font-weight: 600;">Elegir un plan</a>
          </div>
          <p style="color: #999; font-size: 12px; margin-top: 24px; text-align: center;">Ciclismo Reybaud — Escuela de ciclismo</p>
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
