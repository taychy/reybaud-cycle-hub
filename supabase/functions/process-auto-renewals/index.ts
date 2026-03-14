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

        let newEnd: Date;
        switch (plan.frecuencia) {
          case "trimestral":
            newEnd = new Date(newStart);
            newEnd.setMonth(newEnd.getMonth() + 3);
            newEnd.setDate(newEnd.getDate() - 1);
            break;
          case "anual":
            newEnd = new Date(newStart);
            newEnd.setFullYear(newEnd.getFullYear() + 1);
            newEnd.setDate(newEnd.getDate() - 1);
            break;
          default: // mensual and variants
            newEnd = new Date(newStart);
            newEnd.setMonth(newEnd.getMonth() + 1);
            newEnd.setDate(newEnd.getDate() - 1);
            break;
        }

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
          });

        if (insertError) {
          results.push({ alumno_id: sub.alumno_id, status: "error", details: insertError.message });
          continue;
        }

        // Log the renewal
        console.log(`Renewed subscription for alumno ${sub.alumno_id}: ${plan.nombre} until ${newEnd.toISOString().split("T")[0]}`);

        results.push({
          alumno_id: sub.alumno_id,
          status: "renewed",
          details: `New period: ${newStart.toISOString().split("T")[0]} → ${newEnd.toISOString().split("T")[0]}`,
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
