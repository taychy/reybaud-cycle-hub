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
      .from("alumnos").select("nombre, email").eq("id", fb.alumno_id).single();
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
    const firstName = (alumno.nombre || "").split(" ")[0] || "Hola";
    const tipoTxt = tipoLabel[fb.tipo || "general"] || "General";

    const fullComentario = fb.comentario || "";
    const [generalRaw, detalleRaw = ""] = fullComentario.split("---DETALLE---");
    const detailCount = detalleRaw
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.startsWith("•")).length;

    // Invoke shared Lovable transactional email pipeline
    const { data: sendData, error: sendError } = await supabase.functions.invoke(
      "send-transactional-email",
      {
        body: {
          templateName: "coach-feedback",
          recipientEmail: alumno.email,
          idempotencyKey: `coach-feedback-${fb.id}`,
          templateData: {
            firstName,
            coachName,
            tipoLabel: tipoTxt,
            generalNote: generalRaw.trim(),
            detailCount,
            appUrl: "https://reybaud-app.com/alumno/progreso",
          },
        },
      }
    );

    if (sendError) {
      console.error("send-transactional-email error", sendError);
      return new Response(JSON.stringify({ error: "send_failed", detail: sendError.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, result: sendData }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("notify-coach-feedback error", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
