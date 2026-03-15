import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function buildEmailHtml(link: string, logoUrl: string) {
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8" /></head>
<body style="background-color:#ffffff;font-family:'Inter',Arial,sans-serif;">
  <div style="padding:30px 25px;max-width:480px;margin:0 auto;">
    <img src="${logoUrl}" alt="Ciclismo Reybaud" width="60" height="60" style="margin:0 auto 20px;display:block;" />
    <h1 style="font-size:22px;font-weight:bold;font-family:'Oswald',Arial,sans-serif;color:#1A1A1A;margin:0 0 20px;text-align:center;text-transform:uppercase;letter-spacing:1px;">
      ¡BIENVENIDO AL EQUIPO DE DEPÓSITO!
    </h1>
    <p style="font-size:14px;color:#555555;line-height:1.6;margin:0 0 16px;">
      Fuiste invitado a formar parte del equipo de Depósito de Ciclismo Reybaud.
    </p>
    <p style="font-size:14px;color:#555555;line-height:1.6;margin:0 0 8px;">
      A partir de ahora vas a poder:
    </p>
    <ul style="font-size:14px;color:#555555;line-height:1.8;margin:0 0 16px;padding-left:20px;">
      <li>Gestionar el stock de productos</li>
      <li>Registrar ingresos y egresos de mercadería</li>
      <li>Ver alertas de stock bajo</li>
    </ul>
    <p style="font-size:14px;color:#555555;line-height:1.6;margin:0 0 16px;">
      Hacé clic en el botón de abajo para crear tu contraseña.<br/>
      Este enlace es válido por <strong>24 horas</strong>.
    </p>
    <a href="${link}" style="background-color:#E8832A;color:#ffffff;font-size:14px;font-weight:bold;border-radius:8px;padding:14px 28px;text-decoration:none;display:block;text-align:center;margin:8px 0 24px;">
      Crear mi contraseña
    </a>
    <p style="font-size:13px;color:#777777;line-height:1.5;margin:0 0 20px;border-top:1px solid #eeeeee;padding-top:16px;">
      Una vez que crees tu contraseña, vas a poder acceder al panel de depósito con tu email y la clave que elijas.
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

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No autorizado");

    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: caller } } = await anonClient.auth.getUser();
    if (!caller) throw new Error("No autorizado");

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: isAdmin } = await adminClient.rpc("has_role", { _user_id: caller.id, _role: "admin" });
    if (!isAdmin) throw new Error("Solo un administrador puede crear usuarios de depósito");

    const body = await req.json();
    const nombre = body.nombre?.trim();
    const email = body.email?.trim().toLowerCase().replace(/\s+/g, "");

    if (!nombre || !email) throw new Error("Faltan campos requeridos");

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) throw new Error("El formato del email es inválido");

    const defaultPublicAppUrl = "https://reybaud-cycle-hub.lovable.app";
    const configuredAppUrl = Deno.env.get("PUBLIC_APP_URL")?.replace(/\/+$/, "");
    const baseAppUrl = configuredAppUrl || defaultPublicAppUrl;
    const redirectTo = `${baseAppUrl}/activar-cuenta`;

    // Check if user already exists in Auth
    const { data: existingUsers } = await adminClient.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find((u: any) => u.email?.toLowerCase() === email);

    let userId: string;
    let confirmationUrl: string | undefined;
    const now = new Date().toISOString();

    if (existingUser) {
      userId = existingUser.id;

      // Generate recovery link for existing user
      const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
        type: "recovery",
        email,
        options: { redirectTo },
      });

      if (linkError) {
        console.error("generateLink error:", linkError);
      } else {
        confirmationUrl = linkData.properties?.action_link;
      }
    } else {
      // Create new user with temp password (don't use inviteUserByEmail)
      const tempPassword = crypto.randomUUID();
      const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: { nombre, deposito_role: true },
      });
      if (createError) throw createError;
      userId = newUser.user.id;

      // Generate recovery link so user can set their own password
      const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
        type: "recovery",
        email,
        options: { redirectTo },
      });

      if (linkError) {
        console.error("generateLink error for new user:", linkError);
      } else {
        confirmationUrl = linkData.properties?.action_link;
      }
    }

    // Upsert deposito profile
    const { data: existingProfile } = await adminClient
      .from("deposito_profiles")
      .select("id, invite_send_count")
      .eq("user_id", userId)
      .maybeSingle();

    if (existingProfile) {
      await adminClient.from("deposito_profiles").update({
        nombre,
        estado: "activo",
        password_set: false,
        last_invite_sent_at: now,
        invite_send_count: ((existingProfile as any).invite_send_count || 0) + 1,
      }).eq("id", existingProfile.id);
    } else {
      const { error: profileError } = await adminClient.from("deposito_profiles").insert({
        user_id: userId,
        nombre,
        email,
        estado: "activo",
        password_set: false,
        invited_at: now,
        last_invite_sent_at: now,
        invite_send_count: 1,
      });
      if (profileError) throw profileError;
    }

    // Assign deposito role
    const { data: existingRole } = await adminClient
      .from("user_roles")
      .select("id")
      .eq("user_id", userId)
      .eq("role", "deposito")
      .maybeSingle();

    if (!existingRole) {
      await adminClient.from("user_roles").insert({ user_id: userId, role: "deposito" });
    }

    // Send custom email via Resend
    if (confirmationUrl) {
      const logoUrl = `${supabaseUrl}/storage/v1/object/public/email-assets/logo.png`;
      const emailHtml = buildEmailHtml(confirmationUrl, logoUrl);

      const resendResponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "Ciclismo Reybaud <no-reply@ciclismoreybaud.com>",
          to: [email],
          subject: "Activá tu cuenta de Depósito – Ciclismo Reybaud",
          html: emailHtml,
        }),
      });

      if (!resendResponse.ok) {
        const resendError = await resendResponse.text();
        console.error("Resend error:", resendError);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      already_existed: !!existingUser,
      message: `Invitación enviada a ${email}`,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("invite-deposito error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
