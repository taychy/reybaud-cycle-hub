import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Validate caller is admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) {
      return new Response(JSON.stringify({ error: "No autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: user.id,
      _role: "admin",
    });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Solo administradores" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { alumno_id } = await req.json();
    if (!alumno_id) {
      return new Response(JSON.stringify({ error: "alumno_id requerido" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: alumno, error: alumnoError } = await supabase
      .from("alumnos")
      .select("id, nombre, email")
      .eq("id", alumno_id)
      .single();

    if (alumnoError || !alumno) {
      return new Response(JSON.stringify({ error: "Alumno no encontrado" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build email
    const appUrl = Deno.env.get("APP_URL") || "https://reybaud-cycle-hub.lovable.app";
    const dashboardLink = `${appUrl}/alumno?section=apto-fisico`;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #333;">Solicitud de Apto Físico</h2>
        <p>Hola <strong>${alumno.nombre}</strong>,</p>
        <p>Desde Ciclismo Reybaud te solicitamos que cargues tu <strong>apto físico</strong> actualizado en tu perfil.</p>
        <p>Es un requisito fundamental para participar de las actividades y entrenamientos.</p>
        <p style="margin: 24px 0;">
          <a href="${dashboardLink}" style="background-color: #c9a53a; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold; display: inline-block;">
            Cargar mi apto físico
          </a>
        </p>
        <p style="color: #666; font-size: 14px;">Una vez dentro de tu perfil, andá a la sección <strong>Trámites → Apto físico</strong> y subí el archivo (PDF, JPG o PNG, máximo 5MB).</p>
        <p style="color: #666; font-size: 14px;">Si tenés dudas, contactanos.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
        <p style="color: #999; font-size: 12px;">Ciclismo Reybaud · Este mail fue enviado a ${alumno.email}</p>
      </div>
    `;

    // Send email via Resend API directly
    if (!resendApiKey) {
      console.warn("No RESEND_API_KEY configured, skipping email");
      throw new Error("RESEND_API_KEY no configurada");
    }

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: "Ciclismo Reybaud <onboarding@resend.dev>",
        to: [alumno.email],
        subject: "Solicitud de Apto Físico - Ciclismo Reybaud",
        html,
      }),
    });

    if (!emailResponse.ok) {
      const errText = await emailResponse.text();
      console.error("Email send error:", errText);
      throw new Error("Error al enviar email");
    }

    // Update requested_at
    await supabase
      .from("alumnos")
      .update({ medical_certificate_requested_at: new Date().toISOString() })
      .eq("id", alumno_id);

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Error:", err);
    return new Response(JSON.stringify({ error: err.message || "Error interno" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
