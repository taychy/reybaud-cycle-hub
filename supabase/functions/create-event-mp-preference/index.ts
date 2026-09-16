import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveCuentaMP } from "../_shared/resolve-cuenta-mp.ts";
import { getReybaudFxRate } from "../_shared/fx-rates.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { reservation_id, amount: amountOverride, installment_number } = await req.json();
    if (!reservation_id) return json({ error: "Falta reservation_id" }, 400);

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: reservation, error: resErr } = await supabaseAdmin
      .from("event_reservations")
      .select("id, alumno_id, event_id, amount_total, amount_paid, balance_due, price_snapshot, currency_snapshot, moneda")
      .eq("id", reservation_id)
      .single();
    if (resErr || !reservation) return json({ error: "Reserva no encontrada" }, 404);

    const { data: event, error: evErr } = await supabaseAdmin
      .from("events")
      .select("id, title, price, currency, type")
      .eq("id", reservation.event_id)
      .single();
    if (evErr || !event) return json({ error: "Evento no encontrado" }, 404);

    const eventCurrency = String(reservation.currency_snapshot || reservation.moneda || event.currency || "ARS").toUpperCase();
    const balance = Number(reservation.balance_due ?? reservation.amount_total ?? event.price ?? 0);
    let eventAmount = Number(amountOverride ?? balance);
    let installmentLabel: string | null = null;

    if (installment_number != null) {
      const { data: inst } = await supabaseAdmin
        .from("reservation_installments")
        .select("installment_number, label, amount, balance_due, status")
        .eq("reservation_id", reservation_id)
        .eq("installment_number", installment_number)
        .maybeSingle();
      if (!inst) return json({ error: `Cuota ${installment_number} no encontrada para esta reserva` }, 404);
      const instPending = Number(inst.balance_due ?? inst.amount ?? 0);
      if (instPending <= 0) return json({ error: `La cuota ${installment_number} ya está saldada` }, 400);
      eventAmount = Math.min(eventAmount || instPending, instPending);
      installmentLabel = inst.label || `Cuota ${installment_number}`;
    }

    if (!eventAmount || eventAmount <= 0) return json({ error: "No hay saldo pendiente para este evento" }, 400);
    if (installment_number == null && balance > 0 && eventAmount > balance) eventAmount = balance;

    let fxRate = 1;
    try {
      // Obligación en la moneda del evento cobrada en ARS => VENTA Reybaud.
      fxRate = await getReybaudFxRate(supabaseAdmin, eventCurrency, "sell");
    } catch (e) {
      console.error("[create-event-mp-preference] FX", e);
      return json({ error: "No pudimos obtener la cotización vigente para cobrar en pesos." }, 503);
    }
    const amountArs = Math.round(eventAmount * fxRate * 100) / 100;

    let payerName: string | undefined;
    let payerEmail: string | undefined;
    if (reservation.alumno_id) {
      const { data: alumno } = await supabaseAdmin
        .from("alumnos").select("nombre, apellido, email").eq("id", reservation.alumno_id).single();
      if (alumno) {
        payerName = [alumno.nombre, alumno.apellido].filter(Boolean).join(" ").trim() || alumno.nombre;
        payerEmail = alumno.email;
      }
    }

    const isTripLike = String((event as any).type || "").toLowerCase() === "camp";
    const cuenta = await resolveCuentaMP(supabaseAdmin, { unidad_negocio: isTripLike ? "viaje_camp" : "evento" });
    if (!cuenta.access_token) return json({ error: "Mercado Pago no está configurado" }, 500);

    const concepto = installment_number != null
      ? `cuota_${installment_number}`
      : (await (async () => {
          const { data: calc } = await supabaseAdmin.rpc("importe_a_pagar_ahora", { _reservation_id: reservation_id });
          return calc?.concepto || "saldo";
        })());

    const intentAmount = Number(amountArs.toFixed(2));
    const { data: insertedIntent, error: insertIntentErr } = await supabaseAdmin
      .from("reservation_payment_intents")
      .insert({
        reservation_id,
        concepto,
        installment_number: installment_number ?? null,
        amount: intentAmount,
        currency: "ARS",
        status: "pendiente",
        actor_type: "edge_function",
      })
      .select("id")
      .maybeSingle();

    let intentId = insertedIntent?.id as string | undefined;
    if (insertIntentErr && (insertIntentErr as any).code === "23505") {
      const { data: existing } = await supabaseAdmin
        .from("reservation_payment_intents")
        .select("id, init_point, preference_id")
        .eq("reservation_id", reservation_id)
        .eq("concepto", concepto)
        .eq("amount", intentAmount)
        .eq("status", "pendiente")
        .maybeSingle();
      if (existing?.init_point) {
        return json({
          init_point: existing.init_point,
          preference_id: existing.preference_id,
          amount: eventAmount,
          currency: eventCurrency,
          amount_ars: amountArs,
          fx_rate: fxRate,
          reused: true,
        });
      }
      intentId = existing?.id;
    } else if (insertIntentErr) {
      console.error("[create-event-mp-preference] intent", insertIntentErr);
      return json({ error: "No pudimos iniciar el pago" }, 500);
    }

    const origin = req.headers.get("origin") || "https://reybaud-app.com";
    const preferenceBody: Record<string, unknown> = {
      items: [{
        title: installmentLabel
          ? `${event.title || "Evento Ciclismo Reybaud"} — ${installmentLabel}`
          : (event.title || "Evento Ciclismo Reybaud"),
        quantity: 1,
        unit_price: amountArs,
        currency_id: "ARS",
      }],
      payer: payerEmail ? { name: payerName, email: payerEmail } : undefined,
      back_urls: {
        success: `${origin}/pago-resultado?status=approved&kind=event&reservation=${reservation_id}`,
        failure: `${origin}/pago-resultado?status=failure&kind=event&reservation=${reservation_id}`,
        pending: `${origin}/pago-resultado?status=pending&kind=event&reservation=${reservation_id}`,
      },
      auto_return: "approved",
      external_reference: installment_number != null
        ? `event:${reservation_id}:inst:${installment_number}`
        : `event:${reservation_id}`,
      metadata: {
        payment_type: "event_ars",
        reservation_id,
        event_currency: eventCurrency,
        event_amount: Number(eventAmount.toFixed(6)),
        payment_currency: "ARS",
        fx_rate_ars_per_event: fxRate,
        fx_side: "sell",
        installment_number: installment_number ?? null,
      },
      notification_url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/event-ars-mp-webhook${cuenta.cuenta_id ? `?cuenta_id=${cuenta.cuenta_id}` : ""}`,
      statement_descriptor: "CICLISMO REYBAUD",
    };

    const mpResponse = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cuenta.access_token}` },
      body: JSON.stringify(preferenceBody),
    });
    const mpData = await mpResponse.json();
    if (!mpResponse.ok) {
      console.error("MP error (event):", JSON.stringify(mpData));
      return json({ error: "Error al crear preferencia de pago", detail: mpData }, 500);
    }

    if (intentId) {
      await supabaseAdmin.from("reservation_payment_intents")
        .update({ preference_id: mpData.id, init_point: mpData.init_point })
        .eq("id", intentId);
    }

    await supabaseAdmin.from("audit_log").insert({
      action: "reserva.mp.preference.creada",
      entity_type: "reservation_payment_intent",
      entity_id: intentId || null,
      user_role: "edge_function",
      details: {
        reservation_id,
        preference_id: mpData.id,
        event_amount: eventAmount,
        event_currency: eventCurrency,
        amount_ars: amountArs,
        fx_rate: fxRate,
        concepto,
      },
    });

    return json({
      init_point: mpData.init_point,
      sandbox_init_point: mpData.sandbox_init_point,
      preference_id: mpData.id,
      amount: eventAmount,
      currency: eventCurrency,
      amount_ars: amountArs,
      fx_rate: fxRate,
    });
  } catch (err) {
    console.error("create-event-mp-preference error:", err);
    return json({ error: "Error interno del servidor" }, 500);
  }
});