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
    const { reservation_id, amount: amountOverride } = await req.json();

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
      .select("id, title, price, currency, is_trip")
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

    if (!amount || amount <= 0) {
      return new Response(
        JSON.stringify({ error: "No hay saldo pendiente para este evento" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    // Limitar al saldo pendiente para evitar sobrepagos accidentales
    if (balance > 0 && amount > balance) amount = balance;

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

    const cuenta = await resolveCuentaMP(supabaseAdmin, {
      unidad_negocio: (event as any).is_trip ? "viaje_camp" : "evento",
    });
    if (!cuenta.access_token) {
      return new Response(
        JSON.stringify({ error: "Mercado Pago no está configurado" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    console.log("[create-event-mp-preference] cuenta MP:", { slug: cuenta.slug, source: cuenta.source });

    const origin = req.headers.get("origin") || "https://reybaud-app.com";

    const preferenceBody: Record<string, unknown> = {
      items: [
        {
          title: event.title || "Evento Ciclismo Reybaud",
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
      external_reference: `event:${reservation_id}`,
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
