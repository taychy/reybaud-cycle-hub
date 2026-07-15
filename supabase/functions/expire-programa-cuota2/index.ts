// Bloquea suscripciones de programas cuya cuota 2 venció sin pagar.
// Marca la sub como "vencida" y genera un admin_notification_events "alta".
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const today = new Date().toISOString().slice(0, 10);
  const results: Array<Record<string, unknown>> = [];

  try {
    // 1) Traer ajustes de tipo "deuda" con ref FORMACION_CUOTA2 vencidos
    const { data: deudas, error: dErr } = await admin
      .from("cuenta_ajustes")
      .select("id, alumno_id, monto, fecha, referencia_externa, aplicado_a_fuente_id, notas")
      .eq("tipo", "deuda")
      .like("referencia_externa", "FORMACION_CUOTA2:%")
      .lt("fecha", today);

    if (dErr) {
      console.error("[expire-programa-cuota2] fetch deudas", dErr);
      return new Response(JSON.stringify({ ok: false, error: dErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    for (const d of deudas ?? []) {
      const subId = d.aplicado_a_fuente_id as string | null;
      if (!subId) continue;

      // Chequear si ya fue procesada (por notas)
      if (typeof d.notas === "string" && d.notas.includes("[BLOQUEADA]")) continue;

      const { data: sub } = await admin
        .from("suscripciones")
        .select("id, estado, plan_id, alumno_id")
        .eq("id", subId)
        .maybeSingle();

      if (!sub) continue;

      // Solo bloquear si aún está activa/pendiente_pago/pendiente_verificacion
      if (!["activa", "pendiente_pago", "pendiente_verificacion"].includes(sub.estado)) {
        // Marcamos la deuda como procesada para no reintentar
        await admin.from("cuenta_ajustes").update({
          notas: `${d.notas ?? ""} | [BLOQUEADA] sub ya en estado ${sub.estado}`,
        }).eq("id", d.id);
        continue;
      }

      // Bloquear sub
      await admin
        .from("suscripciones")
        .update({
          estado: "vencida",
          notas: `Cuota 2 impaga vencida el ${d.fecha}. Acceso bloqueado por falta de pago.`,
        })
        .eq("id", subId);

      // Marcar la deuda como procesada
      await admin.from("cuenta_ajustes").update({
        notas: `${d.notas ?? ""} | [BLOQUEADA] ${new Date().toISOString()}`,
      }).eq("id", d.id);

      // Alerta admin
      const { data: alumno } = await admin
        .from("alumnos")
        .select("nombre, apellido, email")
        .eq("id", sub.alumno_id)
        .maybeSingle();
      const { data: plan } = await admin
        .from("planes")
        .select("nombre")
        .eq("id", sub.plan_id)
        .maybeSingle();

      await admin.from("admin_notification_events").insert({
        tipo: "cuota_programa_vencida",
        prioridad: "alta",
        payload: {
          suscripcion_id: subId,
          alumno_id: sub.alumno_id,
          plan_id: sub.plan_id,
          plan_nombre: plan?.nombre ?? null,
          alumno_nombre: alumno ? `${alumno.nombre} ${alumno.apellido}` : null,
          alumno_email: alumno?.email ?? null,
          monto_impago: d.monto,
          fecha_vencimiento: d.fecha,
        },
        deduplication_key: `cuota2-vencida-${subId}`,
      });

      results.push({ suscripcion_id: subId, alumno_id: sub.alumno_id, monto: d.monto });
    }

    return new Response(JSON.stringify({ ok: true, bloqueadas: results.length, results }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[expire-programa-cuota2] fatal", e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
