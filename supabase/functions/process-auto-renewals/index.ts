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

    // Find subscriptions expiring in the next 3 days with auto_renovacion=true
    const today = new Date();
    const threeDaysFromNow = new Date(today);
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);

    const todayStr = today.toISOString().split("T")[0];
    const futureStr = threeDaysFromNow.toISOString().split("T")[0];

    const { data: subs, error: subsError } = await supabaseAdmin
      .from("suscripciones")
      .select("*, planes(id, nombre, precio, frecuencia)")
      .eq("auto_renovacion", true)
      .eq("estado", "activa")
      .gte("fecha_fin", todayStr)
      .lte("fecha_fin", futureStr)
      .is("cancelada_at", null);

    if (subsError) {
      console.error("Error fetching suscripciones:", subsError);
      return new Response(
        JSON.stringify({ error: "Error fetching subscriptions", details: subsError }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!subs || subs.length === 0) {
      return new Response(
        JSON.stringify({ message: "No subscriptions to renew", processed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results: Array<{ alumno_id: string; status: string; details?: string }> = [];

    for (const sub of subs) {
      try {
        const plan = sub.planes as any;
        if (!plan) {
          results.push({ alumno_id: sub.alumno_id, status: "skipped", details: "No plan found" });
          continue;
        }

        // Calculate new period dates
        const currentEnd = new Date(sub.fecha_fin);
        const newStart = new Date(currentEnd);
        newStart.setDate(newStart.getDate() + 1);

        // fecha_fin MUST always be the last day of the target month
        let newEnd: Date;
        switch (plan.frecuencia) {
          case "trimestral": {
            // Last day of the month 3 months from newStart
            const targetMonth = newStart.getMonth() + 3;
            newEnd = new Date(newStart.getFullYear(), targetMonth + 1, 0);
            break;
          }
          case "anual": {
            // Last day of the month 12 months from newStart
            const targetMonth = newStart.getMonth() + 12;
            newEnd = new Date(newStart.getFullYear(), targetMonth + 1, 0);
            break;
          }
          default: {
            // mensual: last day of newStart's month
            newEnd = new Date(newStart.getFullYear(), newStart.getMonth() + 1, 0);
            break;
          }
        }

        // Check if alumno has saldo_a_favor
        const { data: alumnoData } = await supabaseAdmin
          .from("alumnos")
          .select("saldo_a_favor")
          .eq("id", sub.alumno_id)
          .single();

        const saldoAFavor = alumnoData?.saldo_a_favor || 0;
        const precioBase = plan.precio;
        const precioFinal = Math.max(0, precioBase - saldoAFavor);
        const saldoUsado = Math.min(saldoAFavor, precioBase);

        // Create new subscription for the next period
        const { error: insertError } = await supabaseAdmin
          .from("suscripciones")
          .insert({
            alumno_id: sub.alumno_id,
            plan_id: plan.id,
            estado: "pendiente",
            fecha_inicio: newStart.toISOString().split("T")[0],
            fecha_fin: newEnd.toISOString().split("T")[0],
            auto_renovacion: true,
            precio_base: precioBase,
            precio_final: precioFinal,
            // Etiquetado correcto: renovación generada por el cron, aún sin cobro
            origen_registro: "automatico",
            metodo_pago: "pendiente",
          });

        if (insertError) {
          results.push({ alumno_id: sub.alumno_id, status: "error", details: insertError.message });
          continue;
        }

        // Deduct used saldo_a_favor
        if (saldoUsado > 0) {
          await supabaseAdmin
            .from("alumnos")
            .update({ saldo_a_favor: saldoAFavor - saldoUsado })
            .eq("id", sub.alumno_id);
        }

        // Log the renewal
        console.log(`Renewed subscription for alumno ${sub.alumno_id}: ${plan.nombre} until ${newEnd.toISOString().split("T")[0]}${saldoUsado > 0 ? ` (saldo used: ${saldoUsado})` : ""}`);

        results.push({
          alumno_id: sub.alumno_id,
          status: "renewed",
          details: `New period: ${newStart.toISOString().split("T")[0]} → ${newEnd.toISOString().split("T")[0]}${saldoUsado > 0 ? ` | Saldo used: ${saldoUsado}, Final price: ${precioFinal}` : ""}`,
        });
      } catch (err) {
        results.push({ alumno_id: sub.alumno_id, status: "error", details: String(err) });
      }
    }

    return new Response(
      JSON.stringify({
        message: `Processed ${subs.length} subscriptions`,
        processed: subs.length,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
