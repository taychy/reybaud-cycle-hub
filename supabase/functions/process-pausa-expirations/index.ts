// Cron diario: expira pausas vencidas y envía reminders 15 días antes.
// Invocado por pg_cron una vez por día (~6 AM).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1) Expirar pausas vencidas → devuelve los alumnos que pasaron a inactivo
    const { data: expired, error: expErr } = await supabaseAdmin.rpc("expire_overdue_pausas");
    if (expErr) console.error("expire_overdue_pausas error:", expErr);

    const expiredList = Array.isArray(expired) ? expired : [];
    for (const row of expiredList) {
      if (!row.alumno_id) continue;
      try {
        await supabaseAdmin.functions.invoke("notify-student-update", {
          body: { alumno_id: row.alumno_id, type: "pausa_vencida" },
        });
      } catch (e) {
        console.error("notify pausa_vencida failed", row.alumno_id, e);
      }
    }

    // 2) Reminder 15 días antes: pausas activas cuyo fecha_fin = hoy + 15
    const today = new Date();
    const in15 = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 15);
    const in15Str = `${in15.getFullYear()}-${String(in15.getMonth() + 1).padStart(2, "0")}-${String(in15.getDate()).padStart(2, "0")}`;

    const { data: pendingReminders, error: remErr } = await supabaseAdmin
      .from("suscripciones")
      .select("id, alumno_id, fecha_fin, planes!inner(categoria)")
      .eq("planes.categoria", "pausa")
      .eq("fecha_fin", in15Str)
      .is("cancelada_at", null)
      .in("estado", ["activa", "pendiente_verificacion", "pago_pendiente", "acceso_pausado"]);

    if (remErr) console.error("reminder query error:", remErr);

    const reminders = pendingReminders || [];
    for (const sub of reminders) {
      try {
        await supabaseAdmin.functions.invoke("notify-student-update", {
          body: {
            alumno_id: sub.alumno_id,
            type: "pausa_por_vencer_15d",
            pausa_fecha_regreso: sub.fecha_fin,
          },
        });
      } catch (e) {
        console.error("notify pausa_por_vencer_15d failed", sub.alumno_id, e);
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        expired_count: expiredList.length,
        reminder_count: reminders.length,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("process-pausa-expirations error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
