// Cron cada 5 minutos:
// 1) Reservas pendientes con hold_expira_at < now() → 'expirado' + estado_operativo='cancelada'
//    Además dispara email de expiración (una vez).
// 2) Reservas pendientes_transferencia con hold_expira_at entre now+10min y now+20min
//    y sin recordatorio previo → dispara email de recordatorio.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const nowIso = new Date().toISOString();
    const in10 = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const in20 = new Date(Date.now() + 20 * 60 * 1000).toISOString();

    // --- 1) Expirar
    const { data: aExpirar } = await supabase
      .from("reservas_turnera")
      .select("id, email, metodo_pago, email_expiracion_enviado_at")
      .in("pago_estado", ["pendiente", "pendiente_mp", "pendiente_transferencia"])
      .lt("hold_expira_at", nowIso)
      .limit(200);

    let expirados = 0;
    for (const r of (aExpirar || [])) {
      await supabase.from("reservas_turnera").update({
        pago_estado: "expirado",
        estado_operativo: "cancelada",
      } as any).eq("id", r.id);
      expirados++;

      if (!r.email_expiracion_enviado_at && r.email) {
        try {
          await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-turnera-email`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            },
            body: JSON.stringify({ reservation_id: r.id, tipo: "transferencia_expirada" }),
          });
          await supabase.from("reservas_turnera")
            .update({ email_expiracion_enviado_at: new Date().toISOString() } as any)
            .eq("id", r.id);
        } catch (e) {
          console.error("[expire-turnera-holds] email expiracion error:", (e as Error).message);
        }
      }
    }

    // --- 2) Recordatorios 15 min antes (ventana 10-20 min)
    const { data: aRecordar } = await supabase
      .from("reservas_turnera")
      .select("id, email")
      .eq("pago_estado", "pendiente_transferencia")
      .is("recordatorio_15min_enviado_at", null)
      .gt("hold_expira_at", in10)
      .lt("hold_expira_at", in20)
      .limit(200);

    let recordados = 0;
    for (const r of (aRecordar || [])) {
      if (!r.email) continue;
      try {
        await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-turnera-email`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({ reservation_id: r.id, tipo: "transferencia_recordatorio_15min" }),
        });
        await supabase.from("reservas_turnera")
          .update({ recordatorio_15min_enviado_at: new Date().toISOString() } as any)
          .eq("id", r.id);
        recordados++;
      } catch (e) {
        console.error("[expire-turnera-holds] recordatorio error:", (e as Error).message);
      }
    }

    console.log("[expire-turnera-holds]", { expirados, recordados });
    return new Response(JSON.stringify({ ok: true, expirados, recordados }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[expire-turnera-holds] error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
