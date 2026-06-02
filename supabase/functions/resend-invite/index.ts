import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY")!;

    // Verify caller is admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) throw new Error("No autorizado");

    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token);
    const callerId = claimsData?.claims?.sub;
    if (claimsError || !callerId) throw new Error("No autorizado");

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: hasAdmin } = await adminClient.rpc("has_role", {
      _user_id: callerId,
      _role: "admin",
    });
    if (!hasAdmin) throw new Error("Solo administradores pueden reenviar invitaciones");

    const { user_type, email } = await req.json();

    if (!user_type || !email) {
      throw new Error("Faltan campos requeridos (user_type, email)");
    }

    if (!["alumno", "coach", "admin"].includes(user_type)) {
      throw new Error("Tipo de usuario inválido");
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Determine redirect URL (always prefer public app URL to avoid auth-bridge/preview login)
    const origin = req.headers.get("origin") || req.headers.get("referer")?.replace(/\/+$/, "") || "";
    const configuredAppUrl = Deno.env.get("PUBLIC_APP_URL")?.replace(/\/+$/, "");
    const defaultPublicAppUrl = "https://reybaud-cycle-hub.lovable.app";
    const isPreviewOrPrivateUrl = /-preview--|\.lovableproject\.com/.test(origin);
    const baseAppUrl = configuredAppUrl || (origin && !isPreviewOrPrivateUrl ? origin : defaultPublicAppUrl);
    const redirectTo = `${baseAppUrl}/activar-cuenta`;

    // Look up user profile based on type
    let profileTable: string;
    let profileData: any;

    if (user_type === "alumno") {
      profileTable = "alumnos";
      const { data } = await adminClient.from("alumnos").select("*").eq("email", normalizedEmail).maybeSingle();
      profileData = data;
    } else if (user_type === "coach") {
      profileTable = "coaches";
      const { data } = await adminClient.from("coaches").select("*").eq("email", normalizedEmail).maybeSingle();
      profileData = data;
    } else {
      profileTable = "admin_profiles";
      const { data } = await adminClient.from("admin_profiles").select("*").eq("email", normalizedEmail).maybeSingle();
      profileData = data;
    }

    if (!profileData) {
      throw new Error(`No se encontró perfil de ${user_type} con email ${normalizedEmail}`);
    }

    // Check if password already set
    if (profileData.password_set) {
      throw new Error("Este usuario ya activó su cuenta");
    }

    // Check if user is disabled
    if (user_type === "admin" && profileData.status !== "active") {
      throw new Error("Usuario deshabilitado");
    }
    if ((user_type === "alumno" || user_type === "coach") && profileData.estado === "inactivo") {
      throw new Error("Usuario deshabilitado");
    }

    // Spam prevention: check last_invite_sent_at
    if (profileData.last_invite_sent_at) {
      const lastSent = new Date(profileData.last_invite_sent_at).getTime();
      const now = Date.now();
      if (now - lastSent < 60_000) {
        throw new Error("Esperá 1 minuto antes de reenviar la invitación");
      }
    }

    // Generate a new invite link (always creates a new token)
    const nombre = profileData.nombre || `${profileData.first_name || ""} ${profileData.last_name || ""}`.trim();

    // Use "recovery" type - works for existing users and redirects to /activar-cuenta for password setup
    const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: "recovery",
      email: normalizedEmail,
      options: {
        redirectTo,
      },
    });

    if (linkError) {
      console.error("generateLink error:", linkError);
      throw new Error("Error al generar link de invitación: " + linkError.message);
    }

    // The action_link from generateLink contains the token
    const actionLink = linkData.properties?.action_link;
    if (!actionLink) {
      throw new Error("No se pudo generar el link de activación");
    }

    // Replace the default redirect with our activar-cuenta page
    // The action_link goes to Supabase's verify endpoint which then redirects
    const confirmationUrl = actionLink;

    // Send email via Resend
    const logoUrl = `${supabaseUrl}/storage/v1/object/public/email-assets/logo.png`;

    const buildEmailHtml = (userType: string, link: string, name: string) => {
      if (userType === "coach") {
        return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8" /></head>
<body style="background-color:#ffffff;font-family:'Inter',Arial,sans-serif;">
  <div style="padding:30px 25px;max-width:480px;margin:0 auto;">
    <img src="${logoUrl}" alt="Ciclismo Reybaud" width="60" height="60" style="margin:0 auto 20px;display:block;" />
    <h1 style="font-size:22px;font-weight:bold;font-family:'Oswald',Arial,sans-serif;color:#1A1A1A;margin:0 0 20px;text-align:center;text-transform:uppercase;letter-spacing:1px;">
      ¡BIENVENIDO AL EQUIPO DE COACHES!
    </h1>
    <p style="font-size:14px;color:#555555;line-height:1.6;margin:0 0 16px;">
      Fuiste invitado a formar parte del equipo de Coaches de Ciclismo Reybaud.
    </p>
    <p style="font-size:14px;color:#555555;line-height:1.6;margin:0 0 8px;">
      A partir de ahora vas a poder:
    </p>
    <ul style="font-size:14px;color:#555555;line-height:1.8;margin:0 0 16px;padding-left:20px;">
      <li>Gestionar tus clases</li>
      <li>Ver tus grupos asignados</li>
      <li>Acceder a la información de tus alumnos</li>
    </ul>
    <p style="font-size:14px;color:#555555;line-height:1.6;margin:0 0 16px;">
      Hacé clic en el botón de abajo para crear tu contraseña.<br/>
      Este enlace es válido por <strong>24 horas</strong>.
    </p>
    <a href="${link}" style="background-color:#E8832A;color:#ffffff;font-size:14px;font-weight:bold;border-radius:8px;padding:14px 28px;text-decoration:none;display:block;text-align:center;margin:8px 0 24px;">
      Crear mi contraseña
    </a>
    <p style="font-size:13px;color:#777777;line-height:1.5;margin:0 0 20px;border-top:1px solid #eeeeee;padding-top:16px;">
      Una vez que crees tu contraseña, vas a poder acceder al panel de coach con tu email y la clave que elijas.
    </p>
    <p style="font-size:12px;color:#999999;margin:0;text-align:center;">
      Si no esperabas esta invitación, podés ignorar este email de forma segura.
    </p>
  </div>
</body>
</html>`;
      }

      if (userType === "alumno") {
        return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8" /></head>
<body style="background-color:#ffffff;font-family:'Inter',Arial,sans-serif;">
  <div style="padding:30px 25px;max-width:480px;margin:0 auto;">
    <img src="${logoUrl}" alt="Ciclismo Reybaud" width="60" height="60" style="margin:0 auto 20px;display:block;" />
    <h1 style="font-size:22px;font-weight:bold;font-family:'Oswald',Arial,sans-serif;color:#1A1A1A;margin:0 0 20px;text-align:center;text-transform:uppercase;letter-spacing:1px;">
      ¡BIENVENIDO A CICLISMO REYBAUD!
    </h1>
    <p style="font-size:14px;color:#555555;line-height:1.6;margin:0 0 16px;">
      Ya podés activar tu cuenta para acceder a tu plan de entrenamiento y toda la información del equipo.
    </p>
    <p style="font-size:14px;color:#555555;line-height:1.6;margin:0 0 16px;">
      Hacé clic en el botón de abajo para crear tu contraseña.<br/>
      Este enlace es válido por <strong>24 horas</strong>.
    </p>
    <a href="${link}" style="background-color:#E8832A;color:#ffffff;font-size:14px;font-weight:bold;border-radius:8px;padding:14px 28px;text-decoration:none;display:block;text-align:center;margin:8px 0 24px;">
      Crear mi contraseña
    </a>
    <p style="font-size:13px;color:#777777;line-height:1.5;margin:0 0 20px;border-top:1px solid #eeeeee;padding-top:16px;">
      Una vez que crees tu contraseña, vas a poder acceder al panel de entrenamientos con tu email y la clave que elijas.
    </p>
    <p style="font-size:12px;color:#999999;margin:0;text-align:center;">
      Si no esperabas esta invitación, podés ignorar este email de forma segura.
    </p>
  </div>
</body>
</html>`;
      }

      // admin (default)
      return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8" /></head>
<body style="background-color:#ffffff;font-family:'Inter',Arial,sans-serif;">
  <div style="padding:30px 25px;max-width:480px;margin:0 auto;">
    <img src="${logoUrl}" alt="Ciclismo Reybaud" width="60" height="60" style="margin:0 auto 20px;display:block;" />
    <h1 style="font-size:22px;font-weight:bold;font-family:'Oswald',Arial,sans-serif;color:#1A1A1A;margin:0 0 20px;text-align:center;text-transform:uppercase;letter-spacing:1px;">
      ¡BIENVENIDO AL EQUIPO!
    </h1>
    <p style="font-size:14px;color:#555555;line-height:1.6;margin:0 0 16px;">
      Fuiste invitado a formar parte del equipo de administración de Ciclismo Reybaud.
    </p>
    <p style="font-size:14px;color:#555555;line-height:1.6;margin:0 0 16px;">
      Hacé clic en el botón de abajo para crear tu contraseña.<br/>
      Este enlace es válido por <strong>24 horas</strong>.
    </p>
    <a href="${link}" style="background-color:#E8832A;color:#ffffff;font-size:14px;font-weight:bold;border-radius:8px;padding:14px 28px;text-decoration:none;display:block;text-align:center;margin:8px 0 24px;">
      Crear mi contraseña
    </a>
    <p style="font-size:13px;color:#777777;line-height:1.5;margin:0 0 20px;border-top:1px solid #eeeeee;padding-top:16px;">
      Una vez que crees tu contraseña, vas a poder acceder al panel de administración con tu email y la clave que elijas.
    </p>
    <p style="font-size:12px;color:#999999;margin:0;text-align:center;">
      Si no esperabas esta invitación, podés ignorar este email de forma segura.
    </p>
  </div>
</body>
</html>`;
    };

    const SUBJECT_MAP: Record<string, string> = {
      admin: "Activá tu cuenta de administrador – Ciclismo Reybaud",
      coach: "Activá tu cuenta de Coach – Ciclismo Reybaud",
      alumno: "Activá tu cuenta – Ciclismo Reybaud",
    };

    const emailHtml = buildEmailHtml(user_type, confirmationUrl, nombre);
    const emailSubject = SUBJECT_MAP[user_type] || SUBJECT_MAP.alumno;
    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Ciclismo Reybaud <no-reply@ciclismoreybaud.com>",
        to: [normalizedEmail],
        subject: emailSubject,
        html: emailHtml,
      }),
    });

    if (!resendResponse.ok) {
      const resendError = await resendResponse.text();
      console.error("Resend error:", resendError);
      throw new Error("Error al enviar el email de invitación");
    }

    // Update tracking fields
    const now = new Date().toISOString();
    const currentCount = profileData.invite_send_count || 0;

    await adminClient
      .from(profileTable)
      .update({
        invited_at: now,
        last_invite_sent_at: now,
        invite_send_count: currentCount + 1,
      } as any)
      .eq("id", profileData.id);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Invitación reenviada a ${normalizedEmail}`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("resend-invite error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
