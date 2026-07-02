import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3.23.8";

const BodySchema = z.object({
  event_id: z.string().uuid(),
  tipo: z.enum(["contacto", "personalizado", "reserva"]).default("contacto"),
  email: z.string().email().max(320).optional().or(z.literal("")),
  nombre: z.string().max(140).optional().or(z.literal("")),
  fuente: z.string().max(80).optional().or(z.literal("")),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten().fieldErrors }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { event_id, email, tipo, nombre, fuente } = parsed.data;
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

    const baseTask = {
      tipo: "automatica",
      origen: "email_masivo_interes",
      titulo: `${label} — ${evName}`,
      descripcion: `Contacto: ${nombre || "sin nombre"} · ${email || "sin email"}\nFuente: ${fuente || "email masivo"}`,
      entidad_tipo: "event",
      entidad_id: event_id,
      prioridad: "alta",
      estado: "pendiente",
      metadata: { email, nombre, tipo, fuente, event_id },
      updated_at: new Date().toISOString(),
    };

    // Alerta para admin y super_admin (dos filas con dedupe distinto)
    const rows = [
      { ...baseTask, rol_destino: "admin", dedupe_key: `${dedupe}:admin` },
      { ...baseTask, rol_destino: "super_admin", dedupe_key: `${dedupe}:super_admin` },
    ];
    const { error: taskError } = await supabase.from("tareas").upsert(rows, { onConflict: "dedupe_key" });
    if (taskError) throw taskError;

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
