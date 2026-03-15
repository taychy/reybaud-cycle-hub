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

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No autorizado");

    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: caller } } = await anonClient.auth.getUser();
    if (!caller) throw new Error("No autorizado");

    // Check caller is admin
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

    // Check if user already exists
    const { data: existingUsers } = await adminClient.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find((u: any) => u.email === email);

    let userId: string;

    if (existingUser) {
      userId = existingUser.id;

      const { data: existingProfile } = await adminClient
        .from("deposito_profiles")
        .select("id")
        .eq("user_id", userId)
        .maybeSingle();

      await adminClient.auth.admin.generateLink({
        type: "invite",
        email,
        options: { data: { nombre, deposito_role: true }, redirectTo },
      });

      if (existingProfile) {
        await adminClient.from("deposito_profiles").update({
          nombre,
          estado: "activo",
          password_set: false,
        }).eq("user_id", userId);

        return new Response(JSON.stringify({ success: true, already_existed: true, message: `Invitación reenviada a ${email}` }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      const { data: newUser, error: createError } = await adminClient.auth.admin.inviteUserByEmail(email, {
        data: { nombre, deposito_role: true },
        redirectTo,
      });
      if (createError) throw createError;
      userId = newUser.user.id;
    }

    const { error: profileError } = await adminClient.from("deposito_profiles").upsert({
      user_id: userId,
      nombre,
      email,
      estado: "activo",
      password_set: false,
    }, { onConflict: "user_id" } as any);

    if (profileError) throw profileError;

    await adminClient.from("user_roles").upsert({
      user_id: userId,
      role: "deposito",
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
