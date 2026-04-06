import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { alumno_id } = await req.json();
    if (!alumno_id) {
      return new Response(JSON.stringify({ error: "alumno_id requerido" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Get student info
    const { data: alumno, error: alumnoError } = await supabase
      .from("alumnos")
      .select("id, nombre, apellido, email, medical_certificate_signature_date, medical_certificate_expiration_date, medical_certificate_uploaded_at")
      .eq("id", alumno_id)
      .single();

    if (alumnoError || !alumno) {
      return new Response(JSON.stringify({ error: "Alumno no encontrado" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get all active admin/super_admin emails
    const { data: admins } = await supabase
      .from("admin_profiles")
      .select("email, first_name, role")
      .eq("status", "active");

    if (!admins || admins.length === 0) {
      return new Response(JSON.stringify({ ok: true, message: "No admins to notify" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminEmails = admins.map((a: any) => a.email);
    const alumnoName = [alumno.nombre, alumno.apellido].filter(Boolean).join(" ");
    const sigDate = alumno.medical_certificate_signature_date
      ? new Date(alumno.medical_certificate_signature_date).toLocaleDateString("es-AR", { day: "2-digit", month: "long", year: "numeric" })
      : "No especificada";
    const expDate = alumno.medical_certificate_expiration_date
      ? new Date(alumno.medical_certificate_expiration_date).toLocaleDateString("es-AR", { day: "2-digit", month: "long", year: "numeric" })
      : "No especificada";
    const uploadDate = alumno.medical_certificate_uploaded_at
      ? new Date(alumno.medical_certificate_uploaded_at).toLocaleDateString("es-AR", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })
      : "Ahora";

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: #1a1a2e; border-radius: 12px; padding: 24px; color: #ffffff;">
          <h2 style="color: #f59e0b; margin-top: 0;">🔔 Nuevo Apto Físico Cargado</h2>
          <p style="color: #d1d5db;">El alumno <strong style="color: #ffffff;">${alumnoName}</strong> ha subido su apto físico y requiere auditoría.</p>
          
          <div style="background: #2d2d44; border-radius: 8px; padding: 16px; margin: 16px 0;">
            <h3 style="color: #f59e0b; margin-top: 0; font-size: 14px;">📋 Detalles para auditoría</h3>
            <table style="width: 100%; color: #d1d5db; font-size: 14px;">
              <tr>
                <td style="padding: 4px 0; color: #9ca3af;">Alumno:</td>
                <td style="padding: 4px 0; text-align: right;"><strong>${alumnoName}</strong></td>
              </tr>
              <tr>
                <td style="padding: 4px 0; color: #9ca3af;">Email:</td>
                <td style="padding: 4px 0; text-align: right;">${alumno.email}</td>
              </tr>
              <tr>
                <td style="padding: 4px 0; color: #9ca3af;">Fecha de carga:</td>
                <td style="padding: 4px 0; text-align: right;">${uploadDate}</td>
              </tr>
              <tr>
                <td style="padding: 4px 0; color: #9ca3af;">Fecha de firma del médico:</td>
                <td style="padding: 4px 0; text-align: right;"><strong>${sigDate}</strong></td>
              </tr>
              <tr>
                <td style="padding: 4px 0; color: #9ca3af;">Vencimiento (12 meses):</td>
                <td style="padding: 4px 0; text-align: right;"><strong>${expDate}</strong></td>
              </tr>
            </table>
          </div>

          <div style="background: #3b2f1a; border: 1px solid #f59e0b40; border-radius: 8px; padding: 12px; margin: 16px 0;">
            <p style="margin: 0; color: #fbbf24; font-size: 13px;">
              ⚠️ <strong>Acción requerida:</strong> Verificá el documento cargado, corroborando que los datos del certificado, la firma del médico y la fecha coincidan. Accedé a la ficha del alumno en el panel de administración para revisar y descargar el archivo.
            </p>
          </div>

          <p style="color: #6b7280; font-size: 12px; margin-bottom: 0;">
            Este es un mensaje automático del sistema de gestión de Ciclismo Reybaud.
          </p>
        </div>
      </div>
    `;

    if (resendApiKey) {
      const emailResponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${resendApiKey}`,
        },
        body: JSON.stringify({
          from: "Ciclismo Reybaud <onboarding@resend.dev>",
          to: adminEmails,
          subject: `🔔 Apto Físico cargado — ${alumnoName} — Requiere auditoría`,
          html,
        }),
      });

      const emailResult = await emailResponse.json();

      if (!emailResponse.ok) {
        console.error("Error sending email:", emailResult);
        return new Response(JSON.stringify({ error: "Error al enviar email", details: emailResult }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      console.warn("RESEND_API_KEY not configured, skipping email notification");
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
