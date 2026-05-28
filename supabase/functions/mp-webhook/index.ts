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
    const url = new URL(req.url);
    const topic = url.searchParams.get("topic") || url.searchParams.get("type");
    const body = await req.json().catch(() => ({}));

    console.log("Webhook received:", { topic, body });

    // MP sends different notification types
    // We care about "payment" notifications
    const dataId = body?.data?.id || url.searchParams.get("data.id");
    const notificationType = topic || body?.type || body?.action;

    if (!dataId || (notificationType !== "payment" && notificationType !== "payment.updated" && notificationType !== "payment.created")) {
      console.log("Ignoring notification:", notificationType);
      return new Response(JSON.stringify({ ok: true, ignored: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch payment details from MP API
    const MP_ACCESS_TOKEN = Deno.env.get("MP_ACCESS_TOKEN");
    if (!MP_ACCESS_TOKEN) {
      console.error("MP_ACCESS_TOKEN not configured");
      return new Response(JSON.stringify({ error: "MP not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const paymentRes = await fetch(
      `https://api.mercadopago.com/v1/payments/${dataId}`,
      {
        headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` },
      }
    );

    const payment = await paymentRes.json();
    console.log("Payment details:", {
      id: payment.id,
      status: payment.status,
      external_reference: payment.external_reference,
    });

    if (!payment.external_reference) {
      console.log("No external_reference, skipping");
      return new Response(JSON.stringify({ ok: true, no_ref: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const externalRef: string = String(payment.external_reference);
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    // Validate external_reference format: "event:<uuid>", "preorder:<uuid>" or "<uuid>" (suscripcion)
    const isEventRef = externalRef.startsWith("event:");
    const isPreorderRef = externalRef.startsWith("preorder:");
    const refUuid = isEventRef
      ? externalRef.slice("event:".length)
      : isPreorderRef
      ? externalRef.slice("preorder:".length)
      : externalRef;
    if (!UUID_RE.test(refUuid)) {
      console.error("[mp-webhook] Invalid external_reference format");
      return new Response(JSON.stringify({ ok: true, invalid_ref: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ─── PREORDER DEPOSIT FLOW ───
    // external_reference: "preorder:<preorder_id>"
    if (isPreorderRef) {
      const preorderId = refUuid;
      const { data: preorder } = await supabaseAdmin
        .from("store_preorders")
        .select("id, estado, estado_pago_sena")
        .eq("id", preorderId)
        .maybeSingle();

      if (!preorder) {
        console.log("[mp-webhook] preorder not found:", preorderId);
        return new Response(JSON.stringify({ ok: true, missing: true }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const update: Record<string, unknown> = {
        mp_payment_id: String(payment.id),
      };

      if (payment.status === "approved") {
        update.estado_pago_sena = "confirmada";
        update.sena_pagada_at = new Date().toISOString();
        if (preorder.estado === "pendiente_pago_sena") update.estado = "reservada";
      } else if (payment.status === "rejected" || payment.status === "cancelled") {
        update.estado_pago_sena = "rechazada";
      } else if (payment.status === "pending" || payment.status === "in_process") {
        update.estado_pago_sena = "pendiente";
      }

      await supabaseAdmin.from("store_preorders").update(update).eq("id", preorderId);

      console.log("[mp-webhook] preorder updated:", { preorderId, mpStatus: payment.status });
      return new Response(JSON.stringify({ ok: true, kind: "preorder", status: payment.status }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── EVENT RESERVATION FLOW ───
    // external_reference: "event:<reservation_id>"
    if (externalRef.startsWith("event:")) {
      const reservationId = externalRef.slice("event:".length);
      const paidAmount = Number(payment.transaction_amount ?? 0);

      // Cargar reserva actual
      const { data: reservation, error: resErr } = await supabaseAdmin
        .from("event_reservations")
        .select("id, alumno_id, amount_total, amount_paid, balance_due, payment_status, reservation_status, currency_snapshot, moneda")
        .eq("id", reservationId)
        .single();

      if (resErr || !reservation) {
        console.error("Reserva no encontrada:", reservationId, resErr);
        return new Response(JSON.stringify({ ok: true, missing: true }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Idempotencia: si ya registramos este pago, salir
      const { data: existing } = await supabaseAdmin
        .from("reservation_payments")
        .select("id")
        .eq("reservation_id", reservationId)
        .eq("payment_reference", String(payment.id))
        .maybeSingle();

      if (existing) {
        console.log("Pago ya registrado, ignorando:", payment.id);
        return new Response(JSON.stringify({ ok: true, duplicate: true }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const currency = reservation.currency_snapshot || reservation.moneda || "ARS";
      const today = new Date().toISOString().split("T")[0];

      // Mapear status MP → status interno del pago informado
      let payStatus = "informado";
      if (payment.status === "approved") payStatus = "validado";
      else if (payment.status === "rejected" || payment.status === "cancelled") payStatus = "rechazado";

      // Insertar siempre el registro del pago (trazabilidad)
      await supabaseAdmin.from("reservation_payments").insert({
        reservation_id: reservationId,
        alumno_id: reservation.alumno_id,
        amount: paidAmount,
        currency,
        payment_date: today,
        payment_method: "mercadopago",
        payment_reference: String(payment.id),
        notes: `Pago Mercado Pago (${payment.status})`,
        status: payStatus,
      } as any);

      // Sólo movemos saldos cuando MP aprobó
      if (payment.status === "approved") {
        const newPaid = Number(reservation.amount_paid || 0) + paidAmount;
        const total = Number(reservation.amount_total || 0);
        const newBalance = total > 0 ? Math.max(0, total - newPaid) : 0;
        const isFullyPaid = total > 0 && newBalance <= 0;

        const update: Record<string, unknown> = {
          amount_paid: newPaid,
          balance_due: newBalance,
          payment_status: isFullyPaid ? "pago_validado" : "parcial",
          metodo_pago: "mercadopago",
        };

        // Si la reserva todavía no estaba confirmada y se terminó de pagar, confirmarla
        if (isFullyPaid && reservation.reservation_status !== "reserva_confirmada") {
          update.reservation_status = "reserva_confirmada";
          update.estado = "confirmada";
          update.confirmed_at = new Date().toISOString();
        } else if (!isFullyPaid && reservation.reservation_status === "solicitud_enviada") {
          // Pago parcial mantiene la solicitud, pero blanqueamos el estado
          update.estado = "pendiente_verificacion";
        }

        await supabaseAdmin
          .from("event_reservations")
          .update(update)
          .eq("id", reservationId);
      } else if (payment.status === "rejected" || payment.status === "cancelled") {
        await supabaseAdmin
          .from("event_reservations")
          .update({ payment_status: "pago_rechazado" })
          .eq("id", reservationId);
      }

      console.log("Event reservation updated:", { reservationId, mpStatus: payment.status });
      return new Response(JSON.stringify({ ok: true, kind: "event", status: payment.status }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── DEFAULT: SUSCRIPCION FLOW ───
    const suscripcionId = externalRef;

    // Map MP status to our status
    let estado: string;
    switch (payment.status) {
      case "approved":
        estado = "activa";
        break;
      case "pending":
      case "in_process":
        estado = "pendiente";
        break;
      case "rejected":
      case "cancelled":
        estado = "cancelada";
        break;
      default:
        estado = "pendiente";
    }

    // Update subscription
    const today = new Date().toISOString().split("T")[0];
    // fecha_fin = last day of the current month at 23:59
    const now = new Date();
    const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const fechaFin = lastDayOfMonth.toISOString().split("T")[0];

    const updateData: Record<string, unknown> = {
      estado,
      mp_payment_id: String(payment.id),
      mp_status: payment.status,
      metodo_pago: "mercadopago",
      origen_registro: "automatico",
    };

    if (payment.status === "approved") {
      updateData.fecha_inicio = today;
      updateData.fecha_fin = fechaFin;
    }

    const { error: updateError } = await supabaseAdmin
      .from("suscripciones")
      .update(updateData)
      .eq("id", suscripcionId);

    if (updateError) {
      console.error("Error updating subscription:", updateError);
      return new Response(
        JSON.stringify({ error: "Failed to update subscription" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // If approved, also activate the student
    if (payment.status === "approved") {
      const { data: sub } = await supabaseAdmin
        .from("suscripciones")
        .select("alumno_id")
        .eq("id", suscripcionId)
        .single();

      if (sub?.alumno_id) {
        await supabaseAdmin
          .from("alumnos")
          .update({ estado: "activo" })
          .eq("id", sub.alumno_id);

        console.log("Student activated:", sub.alumno_id);
      }
    }

    console.log("Subscription updated:", { suscripcionId, estado });

    return new Response(
      JSON.stringify({ ok: true, status: estado }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Webhook error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
