import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveCuentaMP } from "../_shared/resolve-cuenta-mp.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { reservation_id, amount: amountOverride, installment_number } = await req.json();

    if (!reservation_id) {
      return new Response(
        JSON.stringify({ error: "Falta reservation_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Cargar la reserva
    const { data: reservation, error: resErr } = await supabaseAdmin
      .from("event_reservations")
      .select("id, alumno_id, event_id, amount_total, amount_paid, balance_due, price_snapshot, currency_snapshot, moneda")
      .eq("id", reservation_id)
      .single();

    if (resErr || !reservation) {
      return new Response(
        JSON.stringify({ error: "Reserva no encontrada" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Cargar el evento (para titulo y, si hace falta, precio)
    const { data: event, error: evErr } = await supabaseAdmin
      .from("events")
      .select("id, title, price, currency, type")
      .eq("id", reservation.event_id)
      .single();

    if (evErr || !event) {
      return new Response(
        JSON.stringify({ error: "Evento no encontrado" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Determinar moneda y monto a cobrar
    const currency = (reservation.currency_snapshot || reservation.moneda || event.currency || "ARS").toUpperCase();
    const balance = Number(reservation.balance_due ?? reservation.amount_total ?? event.price ?? 0);
    let amount = Number(amountOverride ?? balance);

    // Si se indica una cuota, validar que existe y usar su balance_due como tope
    let installmentLabel: string | null = null;
    if (installment_number != null) {
      const { data: inst } = await supabaseAdmin
        .from("reservation_installments")
        .select("installment_number, label, amount, balance_due, status")
        .eq("reservation_id", reservation_id)
        .eq("installment_number", installment_number)
        .maybeSingle();
      if (!inst) {
        return new Response(
          JSON.stringify({ error: `Cuota ${installment_number} no encontrada para esta reserva` }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const instPending = Number(inst.balance_due ?? inst.amount ?? 0);
      if (instPending <= 0) {
        return new Response(
          JSON.stringify({ error: `La cuota ${installment_number} ya está saldada` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      // Forzar amount al saldo de la cuota (ignorar override mayor)
      amount = Math.min(amount || instPending, instPending);
      installmentLabel = inst.label || `Cuota ${installment_number}`;
    }

    if (!amount || amount <= 0) {
      return new Response(
        JSON.stringify({ error: "No hay saldo pendiente para este evento" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    // Limitar al saldo pendiente para evitar sobrepagos accidentales (solo en pago total)
    if (installment_number == null && balance > 0 && amount > balance) amount = balance;

    // Cargar alumno
    let payerName: string | undefined;
    let payerEmail: string | undefined;
    if (reservation.alumno_id) {
      const { data: alumno } = await supabaseAdmin
        .from("alumnos")
        .select("nombre, apellido, email")
        .eq("id", reservation.alumno_id)
        .single();
      if (alumno) {
        payerName = [alumno.nombre, alumno.apellido].filter(Boolean).join(" ").trim() || alumno.nombre;
        payerEmail = alumno.email;
      }
    }

    // Routing por unidad de negocio: tipo "camp" → viaje_camp, resto → evento
    const isTripLike = ((event as any).type || "").toLowerCase() === "camp";
    const cuenta = await resolveCuentaMP(supabaseAdmin, {
      unidad_negocio: isTripLike ? "viaje_camp" : "evento",
    });
    if (!cuenta.access_token) {
      return new Response(
        JSON.stringify({ error: "Mercado Pago no está configurado" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    console.log("[create-event-mp-preference] cuenta MP:", { slug: cuenta.slug, source: cuenta.source });

    // ===== Antiduplicado vía reservation_payment_intents =====
    const concepto = installment_number != null
      ? `cuota_${installment_number}`
      : (await (async () => {
          const { data: calc } = await supabaseAdmin.rpc("importe_a_pagar_ahora", { _reservation_id: reservation_id });
          return calc?.concepto || "saldo";
        })());

    const intentAmount = Number(amount.toFixed(2));

    // Try INSERT; UNIQUE partial index blocks duplicates for (reservation, concepto, amount) in 'pendiente'
    const { data: insertedIntent, error: insertIntentErr } = await supabaseAdmin
      .from("reservation_payment_intents")
      .insert({
        reservation_id,
        concepto,
        installment_number: installment_number ?? null,
        amount: intentAmount,
        currency,
        status: "pendiente",
        actor_type: "edge_function",
      })
      .select("id")
      .maybeSingle();

    let intentId = insertedIntent?.id as string | undefined;

    if (insertIntentErr && (insertIntentErr as any).code === "23505") {
      // Reuse existing active intent
      const { data: existing } = await supabaseAdmin
        .from("reservation_payment_intents")
        .select("id, init_point, preference_id")
        .eq("reservation_id", reservation_id)
        .eq("concepto", concepto)
        .eq("amount", intentAmount)
        .eq("status", "pendiente")
        .maybeSingle();
      if (existing?.init_point) {
        await supabaseAdmin.from("audit_log").insert({
          action: "reserva.mp.intent.reutilizado",
          entity_type: "reservation_payment_intent",
          entity_id: existing.id,
          user_role: "edge_function",
          details: { reservation_id, concepto, amount: intentAmount },
        });
        return new Response(JSON.stringify({
          init_point: existing.init_point,
          preference_id: existing.preference_id,
          amount: intentAmount,
          currency,
          reused: true,
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      intentId = existing?.id;
    }
    // ===== fin antiduplicado =====


    const origin = req.headers.get("origin") || "https://reybaud-app.com";

    const preferenceBody: Record<string, unknown> = {
      items: [
        {
          title: installmentLabel
            ? `${event.title || "Evento Ciclismo Reybaud"} — ${installmentLabel}`
            : (event.title || "Evento Ciclismo Reybaud"),
          quantity: 1,
          unit_price: Number(amount.toFixed(2)),
          currency_id: currency,
        },
      ],
      payer: payerEmail ? { name: payerName, email: payerEmail } : undefined,
      back_urls: {
        success: `${origin}/pago-resultado?status=approved&kind=event&reservation=${reservation_id}`,
        failure: `${origin}/pago-resultado?status=failure&kind=event&reservation=${reservation_id}`,
        pending: `${origin}/pago-resultado?status=pending&kind=event&reservation=${reservation_id}`,
      },
      auto_return: "approved",
      // Prefijo "event:" permite que mp-webhook diferencie de suscripciones
      external_reference: installment_number != null
        ? `event:${reservation_id}:inst:${installment_number}`
        : `event:${reservation_id}`,
      notification_url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/mp-webhook${cuenta.slug ? `?cuenta=${cuenta.slug}` : ""}`,
      statement_descriptor: "CICLISMO REYBAUD",
    };

    const mpResponse = await fetch(
      "https://api.mercadopago.com/checkout/preferences",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${cuenta.access_token}`,
        },
        body: JSON.stringify(preferenceBody),
      }
    );

    const mpData = await mpResponse.json();

    if (!mpResponse.ok) {
      console.error("MP error (event):", JSON.stringify(mpData));
      return new Response(
        JSON.stringify({ error: "Error al crear preferencia de pago", detail: mpData }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Nota: event_reservations no tiene cuenta_mp_id; el webhook resuelve por
    // la unidad de negocio del evento (is_trip → viaje_camp, sino → evento).

    return new Response(
      JSON.stringify({
        init_point: mpData.init_point,
        sandbox_init_point: mpData.sandbox_init_point,
        preference_id: mpData.id,
        amount,
        currency,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(
      JSON.stringify({ error: "Error interno del servidor" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
