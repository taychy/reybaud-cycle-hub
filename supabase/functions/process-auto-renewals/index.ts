// Monitor de renovaciones automáticas.
//
// Este cron NO genera nuevas suscripciones por sí mismo. El cobro recurrente
// real lo procesa Mercado Pago a partir del `preapproval` autorizado por el
// alumno; cuando llega el `authorized_payment`, el webhook `mp-webhook` crea
// la nueva suscripción de forma idempotente.
//
// Esta función queda como observabilidad: lista las suscripciones próximas a
// vencer con renovación automática y reporta cuáles tienen autorización real
// vs. cuáles tienen el flag activo sin autorización (caso a corregir).
//
// IMPORTANTE: no reactivar lógica de "insertar nueva sub" acá sin antes
// implementar idempotencia por (suscripcion_id, período) y validar el
// estado del intento en MP. Ver discusión en mem://features/payment-reuse-pending-sub.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const today = new Date();
    const threeDaysFromNow = new Date(today);
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);

    const todayStr = today.toISOString().split("T")[0];
    const futureStr = threeDaysFromNow.toISOString().split("T")[0];

    const { data: subs, error: subsError } = await supabaseAdmin
      .from("suscripciones")
      .select("id, alumno_id, plan_id, fecha_fin, auto_renovacion, auto_cobro_activo, mp_preapproval_id, mp_preapproval_status")
      .eq("auto_renovacion", true)
      .eq("estado", "activa")
      .gte("fecha_fin", todayStr)
      .lte("fecha_fin", futureStr)
      .is("cancelada_at", null);

    if (subsError) {
      console.error("[process-auto-renewals] error fetching subs:", subsError);
      return new Response(
        JSON.stringify({ error: "Error fetching subscriptions", details: subsError }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const list = subs ?? [];
    const conAuth = list.filter((s) => s.auto_cobro_activo && s.mp_preapproval_id);
    const sinAuth = list.filter((s) => !s.auto_cobro_activo || !s.mp_preapproval_id);

    console.log("[process-auto-renewals] monitor:", {
      total: list.length,
      con_autorizacion_mp: conAuth.length,
      sin_autorizacion_mp: sinAuth.length,
      sin_autorizacion_ids: sinAuth.map((s) => s.id),
    });

    return new Response(
      JSON.stringify({
        message: "monitor only — el cobro recurrente lo procesa Mercado Pago vía webhook",
        total: list.length,
        con_autorizacion_mp: conAuth.length,
        sin_autorizacion_mp: sinAuth.length,
        sin_autorizacion: sinAuth.map((s) => ({ id: s.id, alumno_id: s.alumno_id, fecha_fin: s.fecha_fin })),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[process-auto-renewals] unexpected:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
