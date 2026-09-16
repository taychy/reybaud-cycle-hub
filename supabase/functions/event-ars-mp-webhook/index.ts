import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCuentaMPTokenById } from "../_shared/resolve-cuenta-mp.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const paymentId = String(body?.data?.id || body?.id || "");
    if (!paymentId) return json({ ok: true, ignored: true });

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const cuentaId = new URL(req.url).searchParams.get("cuenta_id");
    const accessToken = await getCuentaMPTokenById(supabaseAdmin, cuentaId);
    if (!accessToken) return json({ ok: false, error: "mp_not_configured" });

    const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!mpRes.ok) {
      console.error("[event-ars-mp-webhook] MP fetch", mpRes.status);
      return json({ ok: false, error: "mp_fetch_failed" });
    }
    const payment = await mpRes.json();
    const externalRef = String(payment?.external_reference || "");
    if (!externalRef.startsWith("event:")) return json({ ok: true, ignored: true });

    const refBody = externalRef.slice("event:".length);
    const instMatch = refBody.match(/^([0-9a-f-]{36}):inst:(\d+)$/i);
    const reservationId = instMatch ? instMatch[1] : refBody;
    const installmentNumber = instMatch ? Number(instMatch[2]) : null;
    if (!UUID_RE.test(reservationId)) return json({ ok: true, invalid_ref: true });

    const mpStatus = String(payment?.status || "").toLowerCase();
    if (["pending", "in_process", "authorized"].includes(mpStatus)) {
      return json({ ok: true, kind: "event_ars", status: mpStatus });
    }

    const { data: reservation, error: resErr } = await supabaseAdmin
      .from("event_reservations")
      .select("id, alumno_id, amount_total, amount_paid, balance_due, payment_status, reservation_status, currency_snapshot, moneda")
      .eq("id", reservationId)
      .single();
    if (resErr || !reservation) return json({ ok: true, missing: true });

    const { data: existing } = await supabaseAdmin
      .from("reservation_payments")
      .select("id,status")
      .eq("reservation_id", reservationId)
      .eq("payment_reference", String(payment.id))
      .maybeSingle();
    if (existing?.status === "validado" || (existing && mpStatus !== "approved")) {
      return json({ ok: true, duplicate: true });
    }

    const eventCurrency = String(reservation.currency_snapshot || reservation.moneda || "ARS").toUpperCase();
    const paidArs = Number(payment?.transaction_amount || 0);
    const metadata = payment?.metadata || {};
    const snapshotFx = Number(metadata.fx_rate_ars_per_event || 0);
    let eventAmount = Number(metadata.event_amount || 0);
    if (eventAmount <= 0 && eventCurrency === "ARS") eventAmount = paidArs;
    if (eventAmount <= 0 && snapshotFx > 0) eventAmount = paidArs / snapshotFx;
    if (paidArs <= 0 || eventAmount <= 0) {
      console.error("[event-ars-mp-webhook] snapshot incompleto", { paymentId, paidArs, eventAmount, snapshotFx });
      return json({ ok: false, error: "invalid_fx_snapshot" });
    }

    const rateToEvent = eventAmount / paidArs;
    const today = new Date().toISOString().slice(0, 10);
    const payStatus = mpStatus === "approved" ? "validado" : "rechazado";
    const paymentRow = {
      reservation_id: reservationId,
      alumno_id: reservation.alumno_id,
      amount: paidArs,
      currency: "ARS",
      original_amount: paidArs,
      original_currency: "ARS",
      event_currency: eventCurrency,
      exchange_rate_to_event_currency: rateToEvent,
      equivalent_amount_event_currency: eventAmount,
      manual_override: false,
      payment_date: today,
      payment_method: "mercadopago",
      payment_reference: String(payment.id),
      notes: `Pago Mercado Pago en ARS (${mpStatus}). Cotización Reybaud venta: ${snapshotFx || (paidArs / eventAmount)}`,
      status: payStatus,
      installment_number: installmentNumber,
    } as any;

    if (existing?.id) {
      await supabaseAdmin.from("reservation_payments").update(paymentRow).eq("id", existing.id);
    } else {
      await supabaseAdmin.from("reservation_payments").insert(paymentRow);
    }

    if (mpStatus === "approved") {
      const newPaid = Number(reservation.amount_paid || 0) + eventAmount;
      const total = Number(reservation.amount_total || 0);
      const newBalance = total > 0 ? Math.max(0, total - newPaid) : 0;
      const isFullyPaid = total > 0 && newBalance <= 0.01;
      const update: Record<string, unknown> = {
        amount_paid: newPaid,
        balance_due: newBalance,
        payment_status: isFullyPaid ? "pago_validado" : "parcial",
        metodo_pago: "mercadopago",
      };
      if (isFullyPaid && reservation.reservation_status !== "reserva_confirmada") {
        update.reservation_status = "reserva_confirmada";
        update.estado = "confirmada";
        update.confirmed_at = new Date().toISOString();
      } else if (!isFullyPaid && reservation.reservation_status === "solicitud_enviada") {
        update.estado = "pendiente_verificacion";
      }
      await supabaseAdmin.from("event_reservations").update(update).eq("id", reservationId);

      if (installmentNumber != null) {
        const { data: inst } = await supabaseAdmin
          .from("reservation_installments")
          .select("id, amount, paid_amount, monto_pagado")
          .eq("reservation_id", reservationId)
          .eq("installment_number", installmentNumber)
          .maybeSingle();
        if (inst) {
          const newInstPaid = Number(inst.paid_amount || 0) + eventAmount;
          const instAmount = Number(inst.amount || 0);
          const instBalance = Math.max(0, instAmount - newInstPaid);
          await supabaseAdmin.from("reservation_installments").update({
            paid_amount: newInstPaid,
            monto_pagado: newInstPaid,
            balance_due: instBalance,
            saldo_pendiente: instBalance,
            status: instAmount > 0 && instBalance <= 0.01 ? "pagada" : "parcial",
          } as any).eq("id", inst.id);
        }
      }
    } else if (mpStatus === "rejected" || mpStatus === "cancelled") {
      await supabaseAdmin.from("event_reservations").update({ payment_status: "pago_rechazado" }).eq("id", reservationId);
    }

    const intentStatus = mpStatus === "approved" ? "aprobada" : mpStatus === "cancelled" ? "cancelada" : "fallida";
    if (payment.preference_id) {
      await supabaseAdmin.from("reservation_payment_intents")
        .update({ status: intentStatus, resolved_at: new Date().toISOString() })
        .eq("preference_id", String(payment.preference_id))
        .eq("status", "pendiente");
    }

    if (mpStatus === "approved") {
      await supabaseAdmin.from("audit_log").insert({
        action: "reserva.mp.pago.aprobado",
        entity_type: "event_reservation",
        entity_id: reservationId,
        user_role: "edge_function",
        details: {
          payment_id: payment.id,
          preference_id: payment.preference_id,
          paid_ars: paidArs,
          event_amount: eventAmount,
          event_currency: eventCurrency,
          fx_rate_ars_per_event: snapshotFx || paidArs / eventAmount,
        },
      });

      try {
        await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-reservation-payment-recorded`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({
            reservation_id: reservationId,
            amount: eventAmount,
            payment_method: "mercadopago",
            payment_reference: String(payment.id),
            installment_number: installmentNumber,
          }),
        });

        const total = Number(reservation.amount_total || 0);
        const fullyPaid = total > 0 && Number(reservation.amount_paid || 0) + eventAmount >= total - 0.01;
        if (reservation.reservation_status !== "reserva_confirmada" && fullyPaid) {
          await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-reservation-confirmed-with-payment`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            },
            body: JSON.stringify({ reservation_id: reservationId }),
          });
        }
      } catch (e) {
        console.error("[event-ars-mp-webhook] email", e);
      }
    }

    return json({ ok: true, kind: "event_ars", status: mpStatus });
  } catch (err) {
    console.error("[event-ars-mp-webhook]", err);
    return json({ ok: false, error: "internal_error" });
  }
});
