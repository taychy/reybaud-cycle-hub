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
    if (!authHeader) throw new Error("No autorizado");

    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: caller } } = await anonClient.auth.getUser();
    if (!caller) throw new Error("No autorizado");

    // Check caller is super_admin
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: callerProfile } = await adminClient
      .from("admin_profiles")
      .select("role")
      .eq("user_id", caller.id)
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

    if (!["super_admin", "admin", "support"].includes(role)) {
      throw new Error("Rol inválido");
    }

    // Always use public app URL to avoid auth-bridge redirects
    const defaultPublicAppUrl = "https://reybaud-cycle-hub.lovable.app";
    const configuredAppUrl = Deno.env.get("PUBLIC_APP_URL")?.replace(/\/+$/, "");
    const baseAppUrl = configuredAppUrl || defaultPublicAppUrl;
    const redirectTo = `${baseAppUrl}/activar-cuenta`;

    // Check if user already exists
    const { data: existingUsers } = await adminClient.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find((u: any) => u.email === email);

    let userId: string;

    if (existingUser) {
      userId = existingUser.id;

      // Check if admin profile already exists
      const { data: existingProfile } = await adminClient
        .from("admin_profiles")
        .select("id")
        .eq("user_id", userId)
        .maybeSingle();

      // For existing users, use generateLink to avoid "email_exists" error
      const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
        type: "invite",
        email,
        options: {
          data: { first_name, last_name, admin_role: role },
          redirectTo,
        },
      });

      if (linkError) {
        console.error("generateLink error:", linkError.message);
        // If generateLink also fails, still proceed with profile creation
      }

      if (existingProfile) {
        // Update profile with new data
        await adminClient.from("admin_profiles").update({
          first_name,
          last_name,
          role,
          password_set: false,
        }).eq("user_id", userId);

        return new Response(JSON.stringify({ success: true, already_existed: true, message: `Invitación reenviada a ${email}` }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      // Create new auth user with invite
      const { data: newUser, error: createError } = await adminClient.auth.admin.inviteUserByEmail(email, {
        data: { first_name, last_name, admin_role: role },
        redirectTo,
      });
      if (createError) throw createError;
      userId = newUser.user.id;
    }

    // Create admin profile (upsert to handle edge cases)
    const { error: profileError } = await adminClient.from("admin_profiles").upsert({
      user_id: userId,
      first_name,
      last_name,
      email,
      role,
      status: "active",
      password_set: false,
    }, { onConflict: "user_id" });

    if (profileError) throw profileError;

    // Assign admin role in user_roles (ignore if exists)
    await adminClient.from("user_roles").upsert({
      user_id: userId,
      role: "admin",
    }, { onConflict: "user_id,role" } as any);

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
