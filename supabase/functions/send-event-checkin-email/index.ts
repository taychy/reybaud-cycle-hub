import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, first_name, token } = await req.json();

    if (!email || !first_name || !token) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      console.error("RESEND_API_KEY not set");
      return new Response(
        JSON.stringify({ error: "Email service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
    // Derive the app domain from the Supabase URL or use a hardcoded one
    const appDomain = "https://reybaud-cycle-hub.lovable.app";
    const resultsUrl = `${appDomain}/eventos/record-del-ahora/mi-resultados?token=${token}`;

    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="margin:0;padding:0;background-color:#ffffff;font-family:Arial,Helvetica,sans-serif;">
        <div style="max-width:480px;margin:0 auto;padding:32px 20px;">
          <div style="text-align:center;margin-bottom:24px;">
            <h1 style="font-size:22px;color:#121212;margin:0;font-weight:700;text-transform:uppercase;letter-spacing:2px;">
               Record de la Hora
            </h1>
            <p style="font-size:13px;color:#888;margin:8px 0 0;">
              Competencia interna – 29/02/2026 – KDT, Palermo
            </p>
          </div>

          <p style="font-size:15px;color:#333;line-height:1.5;">
            ¡Hola <strong>${first_name}</strong>!
          </p>
          <p style="font-size:15px;color:#333;line-height:1.5;">
            Tu check-in fue registrado exitosamente. Usá el siguiente link para consultar tus resultados cuando estén disponibles:
          </p>

          <div style="text-align:center;margin:28px 0;">
            <a href="${resultsUrl}" style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#E8832A,#F0A05C);color:#fff;text-decoration:none;border-radius:8px;font-size:15px;font-weight:600;text-transform:uppercase;letter-spacing:1px;">
              Ver mis resultados
            </a>
          </div>

          <p style="font-size:12px;color:#999;text-align:center;margin-top:32px;">
            Ciclismo Reybaud – Este link es personal y válido por 30 días.
          </p>
        </div>
      </body>
      </html>
    `;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Ciclismo Reybaud <no-reply@ciclismoreybaud.com>",
        to: [email],
        subject: "Tu acceso a resultados – Record de la Hora",
        html: emailHtml,
      }),
    });

    const resData = await res.json();
    console.log("Email sent:", resData);

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Error sending check-in email:", err);
    return new Response(
      JSON.stringify({ error: "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
