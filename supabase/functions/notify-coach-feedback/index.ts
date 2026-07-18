import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TIPO_LABEL: Record<string, string> = {
  tecnica: "Técnica",
  rendimiento: "Rendimiento",
  actitud: "Actitud",
  recomendacion: "Recomendación",
  general: "General",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { feedback_id } = await req.json();
    if (!feedback_id) {
      return new Response(JSON.stringify({ error: "feedback_id requerido" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: fb } = await supabaseAdmin
      .from("feedback_coach")
      .select("id, comentario, tipo, fecha, alumno_id, coach_id, coach_id_secundario")
      .eq("id", feedback_id)
      .single();

    if (!fb) {
      return new Response(JSON.stringify({ error: "feedback no encontrado" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const [{ data: alumno }, { data: coach1 }, { data: coach2 }] = await Promise.all([
      supabaseAdmin.from("alumnos").select("nombre, email").eq("id", fb.alumno_id).single(),
      supabaseAdmin.from("coaches").select("nombre").eq("id", fb.coach_id).single(),
      fb.coach_id_secundario
        ? supabaseAdmin.from("coaches").select("nombre").eq("id", fb.coach_id_secundario).single()
        : Promise.resolve({ data: null } as any),
    ]);

    if (!alumno?.email) {
      return new Response(JSON.stringify({ ok: false, skipped: "sin email" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      console.warn("RESEND_API_KEY not configured");
      return new Response(JSON.stringify({ ok: true, skipped: "sin RESEND_API_KEY" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const firstName = (alumno.nombre || "").split(" ")[0];
    const tipoLabel = TIPO_LABEL[fb.tipo || "general"] || "General";
    const coachesLine = coach2?.nombre
      ? `${coach1?.nombre || "Tu entrenador"} y ${coach2.nombre}`
      : coach1?.nombre || "Tu entrenador";

    const subject = `💬 Nuevo feedback de ${coachesLine}`;
    const emailHtml = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; background:#ffffff;">
        <h2 style="color:#d4820a; margin:0 0 16px;">💬 Feedback de tu entrenador</h2>
        <p style="color:#333; margin:0 0 12px;">Hola <strong>${firstName}</strong>,</p>
        <p style="color:#333; margin:0 0 16px;">
          ${coachesLine} te dejó un feedback (<em>${tipoLabel}</em>):
        </p>
        <blockquote style="margin:0 0 20px; padding:14px 16px; border-left:3px solid #d4820a; background:#fff7ec; color:#333; white-space:pre-wrap; font-style:italic;">
          ${(fb.comentario || "").replace(/</g, "&lt;")}
        </blockquote>
        <p style="color:#333; margin:0 0 20px;">
          Podés verlo también en tu sección de Progreso dentro de la app.
        </p>
        <div style="text-align:center; margin-top:24px;">
          <a href="https://reybaud-app.com" style="display:inline-block; padding:12px 28px; background:#d4820a; color:white; text-decoration:none; border-radius:8px; font-weight:600;">
            Abrir la app
          </a>
        </div>
        <p style="color:#999; font-size:12px; margin-top:24px; text-align:center;">
          Ciclismo Reybaud — Escuela de ciclismo
        </p>
      </div>
    `;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Ciclismo Reybaud <no-reply@reybaud-app.com>",
        to: [alumno.email],
        subject,
        html: emailHtml,
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error("Resend error:", res.status, errBody);
      return new Response(JSON.stringify({ ok: false, error: errBody }), {
        status: res.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error(e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
