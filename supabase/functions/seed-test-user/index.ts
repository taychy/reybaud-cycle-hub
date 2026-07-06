import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const testEmail = "test@reybaud.com";
    const testPassword = "Test1234!";

    // Check if user already exists
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    let userId: string;
    const existing = existingUsers?.users?.find((u) => u.email === testEmail);

    if (existing) {
      userId = existing.id;
      // Update password
      await supabaseAdmin.auth.admin.updateUserById(userId, {
        password: testPassword,
        email_confirm: true,
      });
    } else {
      const { data: newUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email: testEmail,
        password: testPassword,
        email_confirm: true,
      });
      if (createErr) throw createErr;
      userId = newUser.user.id;
    }

    // Ensure alumno record exists
    const { data: existingAlumno } = await supabaseAdmin
      .from("alumnos")
      .select("id")
      .eq("email", testEmail)
      .maybeSingle();

    let alumnoId: string;
    if (existingAlumno) {
      alumnoId = existingAlumno.id;
      await supabaseAdmin
        .from("alumnos")
        .update({ user_id: userId, estado: "activo", grupo: "G1", password_set: true, profile_complete: true })
        .eq("id", alumnoId);
    } else {
      const { data: newAlumno, error: aErr } = await supabaseAdmin
        .from("alumnos")
        .insert({
          email: testEmail,
          nombre: "Test Reybaud",
          user_id: userId,
          estado: "activo",
          grupo: "G1",
          password_set: true,
          profile_complete: true,
          registration_status: "active",
        })
        .select("id")
        .single();
      if (aErr) throw aErr;
      alumnoId = newAlumno.id;
    }

    // Ensure admin_profiles record exists
    const { data: existingAdmin } = await supabaseAdmin
      .from("admin_profiles")
      .select("id")
      .eq("email", testEmail)
      .maybeSingle();

    if (existingAdmin) {
      await supabaseAdmin
        .from("admin_profiles")
        .update({ user_id: userId, role: "super_admin", status: "active", password_set: true })
        .eq("id", existingAdmin.id);
    } else {
      await supabaseAdmin.from("admin_profiles").insert({
        email: testEmail,
        first_name: "Test",
        last_name: "Reybaud",
        user_id: userId,
        role: "super_admin",
        status: "active",
        password_set: true,
      });
    }

    // Ensure user_roles
    for (const role of ["admin", "alumno"] as const) {
      const { data: existingRole } = await supabaseAdmin
        .from("user_roles")
        .select("id")
        .eq("user_id", userId)
        .eq("role", role)
        .maybeSingle();

      if (!existingRole) {
        await supabaseAdmin.from("user_roles").insert({ user_id: userId, role });
      }
    }

    // Create a test subscription so Pagos section has data
    const { data: plan } = await supabaseAdmin
      .from("planes")
      .select("id, nombre, precio")
      .eq("activo", true)
      .limit(1)
      .maybeSingle();

    if (plan) {
      const { data: existingSub } = await supabaseAdmin
        .from("suscripciones")
        .select("id")
        .eq("alumno_id", alumnoId)
        .limit(1)
        .maybeSingle();

      if (!existingSub) {
        const now = new Date();
        // Fin del mes calendario (regla del negocio: nunca +30 días rolling).
        const fin = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        const fmt = (d: Date) => d.toISOString().split("T")[0];

        await supabaseAdmin.from("suscripciones").insert({
          alumno_id: alumnoId,
          plan_id: plan.id,
          estado: "activa",
          fecha_inicio: fmt(now),
          fecha_fin: fmt(fin),
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        credentials: { email: testEmail, password: testPassword },
        message: "Test user ready. Login as alumno at / or as admin at /admin/login",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
