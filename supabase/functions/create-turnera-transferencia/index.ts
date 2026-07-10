// Marca una reserva de turnera como método=transferencia, genera upload_token,
// hold de 2h y dispara el email de instrucciones al alumno.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { reservation_id } = await req.json();
    if (!reservation_id) {
      return new Response(JSON.stringify({ error: "Falta reservation_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: r } = await supabase
      .from("reservas_turnera")
      .select("id, servicio_id, precio_snapshot, moneda_snapshot, pago_estado, upload_token")
      .eq("id", reservation_id)
      .maybeSingle();
    if (!r) {
      return new Response(JSON.stringify({ error: "Reserva no encontrada" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: s } = await supabase
      .from("servicios_turnera")
      .select("nombre, pago_modo, pago_monto_sena, moneda, precio")
      .eq("id", r.servicio_id)
      .maybeSingle();
    if (!s || !s.pago_modo || s.pago_modo === "ninguno") {
      return new Response(JSON.stringify({ error: "El servicio no requiere pago online" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const precioTotal = Number(r.precio_snapshot || s.precio || 0);
    let amount = s.pago_modo === "sena" ? Number(s.pago_monto_sena || 0) : precioTotal;
    if (!amount || amount <= 0) {
      return new Response(JSON.stringify({ error: "Monto no configurado" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    amount = Number(amount.toFixed(2));

    const uploadToken = r.upload_token || crypto.randomUUID();
    const holdExpira = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();

    await supabase.from("reservas_turnera").update({
      metodo_pago: "transferencia",
      pago_estado: "pendiente_transferencia",
      pago_monto: amount,
      hold_expira_at: holdExpira,
      upload_token: uploadToken,
    } as any).eq("id", reservation_id);

    // Enviar email de instrucciones (best-effort)
    try {
      await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-turnera-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({ reservation_id, tipo: "transferencia_instrucciones" }),
      });
      await supabase.from("reservas_turnera")
        .update({ email_instrucciones_enviado_at: new Date().toISOString() } as any)
        .eq("id", reservation_id);
    } catch (e) {
      console.error("[create-turnera-transferencia] email error:", (e as Error).message);
    }

    return new Response(JSON.stringify({
      ok: true,
      upload_token: uploadToken,
      hold_expira_at: holdExpira,
      amount,
      currency: (r.moneda_snapshot || s.moneda || "ARS").toUpperCase(),
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("[create-turnera-transferencia] error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
