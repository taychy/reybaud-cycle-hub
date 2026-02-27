import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function buildEmailHtml(userType: string, link: string, logoUrl: string) {
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

  // alumno
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY")!;

    // Verify caller is an admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No autorizado");

    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: caller } } = await anonClient.auth.getUser();
    if (!caller) throw new Error("No autorizado");

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Verify caller has admin role
    const { data: hasAdmin } = await adminClient.rpc("has_role", {
      _user_id: caller.id,
      _role: "admin",
    });
    if (!hasAdmin) throw new Error("Solo administradores pueden invitar usuarios");

    const { type, nombre, email, telefono, documento, grupos } = await req.json();

    if (!type || !nombre || !email) {
      throw new Error("Faltan campos requeridos (type, nombre, email)");
    }

    if (!["alumno", "coach"].includes(type)) {
      throw new Error("Tipo inválido. Use 'alumno' o 'coach'");
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Always use the public app URL to avoid auth-bridge redirects
    const defaultPublicAppUrl = "https://reybaud-cycle-hub.lovable.app";
    const configuredAppUrl = Deno.env.get("PUBLIC_APP_URL")?.replace(/\/+$/, "");
    const baseAppUrl = configuredAppUrl || defaultPublicAppUrl;
    const redirectTo = `${baseAppUrl}/activar-cuenta`;

    // Check if user already exists in Auth
    const { data: existingUsers } = await adminClient.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(
      (u: any) => u.email?.toLowerCase() === normalizedEmail
    );

    let userId: string;
    let confirmationUrl: string | undefined;

    if (existingUser) {
      userId = existingUser.id;

      // For existing users, generate a recovery link (won't fail with email_exists)
      const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
        type: "recovery",
        email: normalizedEmail,
        options: { redirectTo },
      });

      if (linkError) {
        console.error("generateLink error:", linkError);
      } else {
        confirmationUrl = linkData.properties?.action_link;
      }
    } else {
      // Create new auth user (don't use inviteUserByEmail - it sends Supabase's default email)
      const tempPassword = crypto.randomUUID();
      const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
        email: normalizedEmail,
        password: tempPassword,
        email_confirm: true,
        user_metadata: { nombre, user_type: type },
      });
      if (createError) throw createError;
      userId = newUser.user.id;

      // Now generate a recovery link for the new user to set their own password
      const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
        type: "recovery",
        email: normalizedEmail,
        options: { redirectTo },
      });

      if (linkError) {
        console.error("generateLink error for new user:", linkError);
      } else {
        confirmationUrl = linkData.properties?.action_link;
      }
    }

    const now = new Date().toISOString();

    if (type === "alumno") {
      const { data: existingAlumno } = await adminClient
        .from("alumnos")
        .select("id, invite_send_count")
        .eq("email", normalizedEmail)
        .maybeSingle();

      if (existingAlumno) {
        await adminClient
          .from("alumnos")
          .update({
            user_id: userId,
            password_set: false,
            invited_at: now,
            last_invite_sent_at: now,
            invite_send_count: ((existingAlumno as any).invite_send_count || 0) + 1,
          })
          .eq("id", existingAlumno.id);
      } else {
        await adminClient.from("alumnos").insert({
          nombre,
          email: normalizedEmail,
          telefono: telefono || null,
          documento: documento || null,
          estado: "activo",
          grupo: grupos?.[0] || "Sin grupo",
          user_id: userId,
          password_set: false,
          invited_at: now,
          last_invite_sent_at: now,
          invite_send_count: 1,
        });
      }

      // Assign alumno role if not already assigned
      const { data: existingRole } = await adminClient
        .from("user_roles")
        .select("id")
        .eq("user_id", userId)
        .eq("role", "alumno")
        .maybeSingle();

      if (!existingRole) {
        await adminClient.from("user_roles").insert({ user_id: userId, role: "alumno" });
      }
    } else if (type === "coach") {
      const { data: existingCoach } = await adminClient
        .from("coaches")
        .select("id, invite_send_count")
        .eq("email", normalizedEmail)
        .maybeSingle();

      if (existingCoach) {
        await adminClient
          .from("coaches")
          .update({
            user_id: userId,
            password_set: false,
            invited_at: now,
            last_invite_sent_at: now,
            invite_send_count: ((existingCoach as any).invite_send_count || 0) + 1,
          })
          .eq("id", existingCoach.id);
      } else {
        await adminClient.from("coaches").insert({
          nombre,
          email: normalizedEmail,
          user_id: userId,
          estado: "activo",
          grupos: grupos || [],
          password_set: false,
          invited_at: now,
          last_invite_sent_at: now,
          invite_send_count: 1,
        });
      }

      // Assign coach role if not already assigned
      const { data: existingRole } = await adminClient
        .from("user_roles")
        .select("id")
        .eq("user_id", userId)
        .eq("role", "coach")
        .maybeSingle();

      if (!existingRole) {
        await adminClient.from("user_roles").insert({ user_id: userId, role: "coach" });
      }
    }

    // Send custom email via Resend (instead of Supabase's default invite email)
    if (confirmationUrl) {
      const logoUrl = `${supabaseUrl}/storage/v1/object/public/email-assets/logo.png`;
      const emailHtml = buildEmailHtml(type, confirmationUrl, logoUrl);

      const SUBJECT_MAP: Record<string, string> = {
        coach: "Activá tu cuenta de Coach – Ciclismo Reybaud",
        alumno: "Activá tu cuenta – Ciclismo Reybaud",
      };

      const resendResponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "Ciclismo Reybaud <no-reply@ciclismoreybaud.com>",
          to: [normalizedEmail],
          subject: SUBJECT_MAP[type] || SUBJECT_MAP.alumno,
          html: emailHtml,
        }),
      });

      if (!resendResponse.ok) {
        const resendError = await resendResponse.text();
        console.error("Resend error:", resendError);
        // Don't throw - user was created, just email failed
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        already_existed: !!existingUser,
        message: `Invitación enviada a ${normalizedEmail}.`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("invite-user error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
