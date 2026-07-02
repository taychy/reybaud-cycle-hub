// Registra interés en un evento desde el email masivo (público).
// Crea una tarea para admin con los datos del interesado.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { event_id, email, tipo, nombre, fuente } = await req.json();
    if (!event_id || !tipo) {
      return new Response(JSON.stringify({ error: "event_id y tipo requeridos" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: ev } = await supabase.from("events").select("title").eq("id", event_id).maybeSingle();
    const evName = ev?.title ?? "Evento";

    const tipoLabel: Record<string, string> = {
      contacto: "Pide que lo llamemos",
      personalizado: "Interés en entrenamiento personalizado",
      reserva: "Interés en reservar",
    };
    const label = tipoLabel[tipo] ?? tipo;

    const dedupe = `interes:${event_id}:${tipo}:${(email || "sin-email").toLowerCase()}`;

    await supabase.from("tareas").insert({
      tipo: "automatica",
      origen: "email_masivo_interes",
      titulo: `${label} — ${evName}`,
      descripcion: `Contacto: ${nombre || "sin nombre"} · ${email || "sin email"}\nFuente: ${fuente || "email masivo"}`,
      rol_destino: "admin",
      entidad_tipo: "event",
      entidad_id: event_id,
      prioridad: "alta",
      estado: "pendiente",
      dedupe_key: dedupe,
      metadata: { email, nombre, tipo, fuente, event_id },
    });

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("event-interest error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
