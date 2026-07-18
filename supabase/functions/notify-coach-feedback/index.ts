import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const tipoLabel: Record<string, string> = {
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
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: fb, error } = await supabase
      .from("feedback_coach")
      .select("id, alumno_id, coach_id, coach_id_secundario, tipo, comentario, fecha, origen")
      .eq("id", feedback_id)
      .single();
    if (error || !fb) {
      return new Response(JSON.stringify({ error: "feedback no encontrado" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: alumno } = await supabase
      .from("alumnos").select("nombre, email, emails_adicionales").eq("id", fb.alumno_id).single();
    if (!alumno?.email) {
      return new Response(JSON.stringify({ ok: true, skipped: "no_email" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const [{ data: c1 }, { data: c2 }] = await Promise.all([
      supabase.from("coaches").select("nombre").eq("id", fb.coach_id).maybeSingle(),
      fb.coach_id_secundario
        ? supabase.from("coaches").select("nombre").eq("id", fb.coach_id_secundario).maybeSingle()
        : Promise.resolve({ data: null } as any),
    ]);

    const coachName = [c1?.nombre, c2?.nombre].filter(Boolean).join(" y ") || "Tu entrenador";
    const firstName = (alumno.nombre || "").split(" ")[0];
    const tipoTxt = tipoLabel[fb.tipo || "general"] || "General";

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      console.warn("RESEND_API_KEY not configured");
      return new Response(JSON.stringify({ ok: true, skipped: "no_resend_key" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const subject = `📝 Nuevo feedback de ${coachName}`;
    const fullComentario = fb.comentario || "";
    const [generalRaw, detalleRaw = ""] = fullComentario.split("---DETALLE---");
    const detalleCount = detalleRaw
      .split("\n")
      .map(l => l.trim())
      .filter(l => l.startsWith("•")).length;
    const detalleHint = detalleCount > 0
      ? `<p style="margin:14px 0 0;color:#666;font-size:13px;text-align:center;">
           Tenés <strong>${detalleCount} comentario${detalleCount === 1 ? "" : "s"}</strong> por característica esperándote en la app.
         </p>`
      : "";
    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 520px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #d4820a; margin-bottom: 12px;">📝 Nuevo feedback</h2>
        <p style="color: #333; margin-bottom: 12px;">
          Hola <strong>${firstName}</strong>, recibiste un feedback de <strong>${coachName}</strong>.
        </p>
        <div style="background:#f7f4ef;border-left:4px solid #d4820a;padding:14px 16px;border-radius:6px;margin:16px 0;">
          <p style="margin:0 0 6px;color:#8a5a12;font-size:12px;text-transform:uppercase;letter-spacing:0.06em;">${tipoTxt}</p>
          <p style="margin:0;color:#222;white-space:pre-wrap;font-size:15px;line-height:1.5;">${generalRaw.trim().replace(/</g, "&lt;")}</p>
        </div>
        ${detalleHint}
        <div style="text-align:center;margin-top:20px;">
          <a href="https://reybaud-app.com" style="display:inline-block;padding:12px 24px;background:#d4820a;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">
            Ver detalle en la app
          </a>
        </div>
        <p style="color:#999;font-size:12px;margin-top:24px;text-align:center;">
          Ciclismo Reybaud — Escuela de ciclismo
        </p>
      </div>
    `;

    const to = [alumno.email, ...((alumno.emails_adicionales as string[] | null) || [])].filter(Boolean);

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Ciclismo Reybaud <info@reybaud-app.com>",
        to,
        subject,
        html,
      }),
    });

    const body = await res.text();
    if (!res.ok) {
      console.error("resend error", res.status, body);
      return new Response(JSON.stringify({ error: "resend_failed", status: res.status, body }), {
        status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("notify-coach-feedback error", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
