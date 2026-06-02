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

    // Verify caller is an admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) throw new Error("No autorizado");

    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token);
    const callerId = claimsData?.claims?.sub;
    if (claimsError || !callerId) throw new Error("No autorizado");

    // Check caller is super_admin
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: callerProfile } = await adminClient
      .from("admin_profiles")
      .select("role")
      .eq("user_id", callerId)
      .maybeSingle();

    if (!callerProfile || callerProfile.role !== "super_admin") {
      throw new Error("Solo un Super Admin puede crear administradores");
    }

    const body = await req.json();
    const first_name = body.first_name?.trim();
    const last_name = body.last_name?.trim();
    const email = body.email?.trim().toLowerCase().replace(/\s+/g, '');
    const role = body.role;

    if (!first_name || !last_name || !email || !role) {
      throw new Error("Faltan campos requeridos");
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new Error("El formato del email es inválido");
    }

    if (!["super_admin", "admin", "deposito"].includes(role)) {
      throw new Error("Rol inválido");
    }
    const appRole = role === "deposito" ? "deposito" : "admin";

    // Always use public app URL to avoid auth-bridge redirects
    const defaultPublicAppUrl = "https://reybaud-cycle-hub.lovable.app";
    const configuredAppUrl = Deno.env.get("PUBLIC_APP_URL")?.replace(/\/+$/, "");
    const baseAppUrl = configuredAppUrl || defaultPublicAppUrl;
    const redirectTo = `${baseAppUrl}/admin`;

    // Check if user already exists
    const { data: existingUsers } = await adminClient.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find((u: any) => u.email === email);

    let userId: string;

    if (existingUser) {
      userId = existingUser.id;

      // Existing auth user → send magic link (OTP) to avoid email_exists from "invite"
      const { error: linkError } = await adminClient.auth.admin.generateLink({
        type: "magiclink",
        email,
        options: { redirectTo },
      });
      if (linkError) console.error("magiclink error:", linkError.message);
    } else {
      // New user → invite by email (creates auth user + sends invite email)
      const { data: newUser, error: createError } = await adminClient.auth.admin.inviteUserByEmail(email, {
        data: { first_name, last_name, admin_role: role },
        redirectTo,
      });
      if (createError) throw createError;
      userId = newUser.user.id;
    }

    // Upsert admin profile. password_set=true: admins entran por OTP, no por contraseña.
    const { error: profileError } = await adminClient.from("admin_profiles").upsert({
      user_id: userId,
      first_name,
      last_name,
      email,
      role,
      status: "active",
      password_set: true,
      last_invite_sent_at: new Date().toISOString(),
    }, { onConflict: "user_id" });

    if (profileError) throw profileError;

    // Remove the opposite role and assign the correct one
    const otherRole = appRole === "deposito" ? "admin" : "deposito";
    await adminClient.from("user_roles").delete().eq("user_id", userId).eq("role", otherRole);
    await adminClient.from("user_roles").upsert({
      user_id: userId,
      role: appRole,
    }, { onConflict: "user_id,role" } as any);

    // Mirror deposito_profiles for the existing stock flow compatibility
    if (appRole === "deposito") {
      await adminClient.from("deposito_profiles").upsert({
        user_id: userId,
        nombre: `${first_name} ${last_name}`.trim(),
        email,
        estado: "activo",
      }, { onConflict: "user_id" } as any);
    } else {
      await adminClient.from("deposito_profiles").delete().eq("user_id", userId);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
