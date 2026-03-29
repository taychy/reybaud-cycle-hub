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
    const { alumno_id, event_id, reservation_id } = await req.json();

    if (!alumno_id || !event_id) {
      return new Response(JSON.stringify({ error: "Missing fields" }), {
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
      .single();

    const { data: event } = await supabaseAdmin
      .from("events")
      .select("title, price, currency, date")
      .eq("id", event_id)
      .single();

    if (!alumno || !event) {
      return new Response(JSON.stringify({ error: "Datos no encontrados" }), {
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

    const currencySymbol = event.currency === "USD" ? "US$" : event.currency === "EUR" ? "€" : "$";
    const adminEmails = ["scarlettbonatto@gmail.com"];

    const emailHtml = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 500px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #b8860b; margin-bottom: 16px;">🏕️ Reserva en efectivo — Evento</h2>
        <p style="color: #333; margin-bottom: 16px;">Un alumno informó que realizó un pago en efectivo para un evento. <strong>Requiere tu verificación.</strong></p>
        <table style="width: 100%; border-collapse: collapse;">
          <tr><td style="padding: 8px 0; color: #666;">Alumno</td><td style="padding: 8px 0; font-weight: 600;">${alumno.nombre}</td></tr>
          <tr><td style="padding: 8px 0; color: #666;">Email</td><td style="padding: 8px 0;">${alumno.email}</td></tr>
          <tr><td style="padding: 8px 0; color: #666;">Evento</td><td style="padding: 8px 0; font-weight: 600;">${event.title}</td></tr>
          <tr><td style="padding: 8px 0; color: #666;">Fecha</td><td style="padding: 8px 0;">${event.date}</td></tr>
          <tr><td style="padding: 8px 0; color: #666;">Precio</td><td style="padding: 8px 0; font-weight: 600; color: #b8860b;">${currencySymbol}${event.price?.toLocaleString() || "—"}</td></tr>
        </table>
        <p style="color: #666; font-size: 14px; margin-top: 20px;">
          Ingresá al panel de administración para confirmar o rechazar esta reserva.
        </p>
      </div>
    `;

    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "Ciclismo Reybaud <onboarding@resend.dev>",
        to: adminEmails,
        subject: `🏕️ Reserva efectivo: ${alumno.nombre} — ${event.title}`,
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
