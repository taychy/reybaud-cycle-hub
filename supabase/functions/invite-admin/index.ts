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

    // Determine redirect URL from request origin
    const origin = req.headers.get("origin") || req.headers.get("referer")?.replace(/\/+$/, "") || "";
    const redirectTo = origin ? `${origin}/set-password` : undefined;

    // Create auth user with invite (sends email automatically)
    const { data: newUser, error: createError } = await adminClient.auth.admin.inviteUserByEmail(email, {
      data: { first_name, last_name, admin_role: role },
      redirectTo,
    });

    if (createError) throw createError;

    // Create admin profile
    const { error: profileError } = await adminClient.from("admin_profiles").insert({
      user_id: newUser.user.id,
      first_name,
      last_name,
      email,
      role,
      status: "active",
      password_set: false,
    });

    if (profileError) throw profileError;

    // Assign admin role in user_roles
    const { error: roleError } = await adminClient.from("user_roles").insert({
      user_id: newUser.user.id,
      role: "admin",
    });

    if (roleError) throw roleError;

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
