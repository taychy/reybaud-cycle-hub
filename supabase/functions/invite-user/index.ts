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

    // Check if user already exists in Auth
    const { data: existingUsers } = await adminClient.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(
      (u: any) => u.email?.toLowerCase() === normalizedEmail
    );

    let userId: string;

    if (existingUser) {
      userId = existingUser.id;
    } else {
      // Determine redirect URL from request origin
      const origin = req.headers.get("origin") || req.headers.get("referer")?.replace(/\/+$/, "") || "";
      const redirectTo = origin ? `${origin}/set-password` : undefined;

      // Create user via invitation (sends email with activation link)
      const { data: newUser, error: createError } = await adminClient.auth.admin.inviteUserByEmail(
        normalizedEmail,
        {
          data: {
            nombre,
            user_type: type,
          },
          redirectTo,
        }
      );
      if (createError) throw createError;
      userId = newUser.user.id;
    }

    if (type === "alumno") {
      // Check if alumno already exists with this email
      const { data: existingAlumno } = await adminClient
        .from("alumnos")
        .select("id")
        .eq("email", normalizedEmail)
        .maybeSingle();

      if (existingAlumno) {
        // Link user_id if not linked yet
        await adminClient
          .from("alumnos")
          .update({ user_id: userId })
          .eq("id", existingAlumno.id);
      } else {
        await adminClient.from("alumnos").insert({
          nombre,
          email: normalizedEmail,
          telefono: telefono || null,
          documento: documento || null,
          estado: "inactivo",
          grupo: "Sin grupo",
          user_id: userId,
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
        await adminClient.from("user_roles").insert({
          user_id: userId,
          role: "alumno",
        });
      }
    } else if (type === "coach") {
      // Check if coach already exists with this email
      const { data: existingCoach } = await adminClient
        .from("coaches")
        .select("id")
        .eq("email", normalizedEmail)
        .maybeSingle();

      if (existingCoach) {
        // Update user_id if needed
        await adminClient
          .from("coaches")
          .update({ user_id: userId })
          .eq("id", existingCoach.id);
      } else {
        await adminClient.from("coaches").insert({
          nombre,
          email: normalizedEmail,
          user_id: userId,
          estado: "pendiente",
          grupos: grupos || [],
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
        await adminClient.from("user_roles").insert({
          user_id: userId,
          role: "coach",
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        already_existed: !!existingUser,
        message: existingUser
          ? `El email ya tenía cuenta. Se vinculó el perfil de ${type}.`
          : `Invitación enviada a ${normalizedEmail}.`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
