import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveCuentaMP } from "../_shared/resolve-cuenta-mp.ts";
import { fetchMpPayment, parseMpFees } from "../_shared/parse-mp-fees.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const getPaymentErrorMessage = (statusDetail?: string | null) => {
  switch (statusDetail) {
    case "cc_rejected_bad_filled_card_number":
      return "Revisá el número de la tarjeta e intentá nuevamente.";
    case "cc_rejected_bad_filled_date":
      return "Revisá la fecha de vencimiento de la tarjeta.";
    case "cc_rejected_bad_filled_security_code":
      return "Revisá el código de seguridad (CVV) de la tarjeta.";
    case "cc_rejected_bad_filled_other":
      return "Revisá los datos ingresados de la tarjeta e intentá nuevamente.";
    case "cc_rejected_call_for_authorize":
      return "El banco requiere que autorices la compra. Contactá a tu banco y volvé a intentar.";
    case "cc_rejected_card_disabled":
      return "La tarjeta está inhabilitada. Contactá a tu banco o intentá con otra tarjeta.";
    case "cc_rejected_card_error":
      return "La tarjeta no pudo ser procesada. Intentá nuevamente o usá otra tarjeta.";
    case "cc_rejected_card_type_not_allowed":
      return "Este tipo de tarjeta no está habilitado para este pago. Intentá con otra tarjeta.";
    case "cc_rejected_duplicated_payment":
      return "Mercado Pago detectó un pago igual realizado recientemente. Revisá si el pago ya fue efectuado.";
    case "cc_rejected_high_risk":
      return "Mercado Pago rechazó la operación por seguridad. Intentá con otra tarjeta o medio de pago.";
    case "cc_rejected_insufficient_amount":
      return "La tarjeta no tiene saldo o límite suficiente para realizar el pago.";
    case "cc_rejected_invalid_installments":
      return "La cantidad de cuotas seleccionada no está disponible para esta tarjeta.";
    case "cc_rejected_max_attempts":
      return "Se alcanzó el máximo de intentos permitidos con esta tarjeta. Intentá más tarde o usá otra tarjeta.";
    case "cc_rejected_blacklist":
      return "Mercado Pago no pudo aprobar esta tarjeta. Intentá con otra tarjeta.";
    case "cc_rejected_bank_error":
      return "El banco emisor no pudo procesar la operación. Intentá nuevamente o consultá con tu banco.";
    case "cc_rejected_other_reason":
      return "El banco rechazó el pago. Intentá nuevamente o utilizá otra tarjeta.";
    default:
      return "El pago fue rechazado. Intentá nuevamente o utilizá otra tarjeta.";
  }
};

const getApiErrorUserMessage = (rawMessage?: string | null, errorCode?: string | null) => {
  const raw = (rawMessage || "").toLowerCase();
  if (raw.includes("issuer")) {
    return "No se pudo identificar el banco emisor de la tarjeta. Volvé a ingresar los datos de la tarjeta.";
  }
  if (raw.includes("identification") || raw.includes("document")) {
    return "Revisá el tipo y número de documento del titular de la tarjeta.";
  }
  if (raw.includes("payment_method")) {
    return "No se pudo identificar el tipo de tarjeta. Volvé a ingresar el número de tarjeta.";
  }
  if (raw.includes("token")) {
    return "Los datos de la tarjeta vencieron o no pudieron validarse. Volvé a ingresarlos e intentá nuevamente.";
  }
  if (raw.includes("installment")) {
    return "La cantidad de cuotas seleccionada no pudo procesarse. Elegí otra opción de cuotas.";
  }
  if (errorCode === "bad_request") {
    return "Mercado Pago no pudo procesar los datos de la tarjeta. Revisalos e intentá nuevamente.";
  }
  return "Mercado Pago no pudo procesar la tarjeta. Revisá los datos e intentá nuevamente.";
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const {
      token,
      issuer_id,
      payment_method_id,
      transaction_amount,
      installments,
      payer,
      suscripcion_id,
      alumno_id,
      plan_id,
    } = body;

    if (!token || !payment_method_id || !suscripcion_id || !alumno_id || !plan_id) {
      return new Response(
        JSON.stringify({ error: "Faltan datos requeridos para procesar la tarjeta." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Mercado Pago no siempre devuelve installments (ej. planes test de $1).
    // Usamos 1 cuota como fallback seguro para pago único.
    const rawInstallments = Number(installments);
    const installmentCount =
      Number.isInteger(rawInstallments) && rawInstallments >= 1 ? rawInstallments : 1;

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const cuenta = await resolveCuentaMP(supabaseAdmin, { unidad_negocio: "suscripcion_escuela" });
    if (!cuenta.access_token) {
      return new Response(
        JSON.stringify({ error: "Mercado Pago no configurado" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    console.log("[process-card-payment] cuenta MP:", { slug: cuenta.slug, source: cuenta.source });

    const { data: sub, error: subFetchErr } = await supabaseAdmin
      .from("suscripciones")
      .select("id, alumno_id, plan_id, precio_final, estado, mp_payment_id")
      .eq("id", suscripcion_id)
      .maybeSingle();

    if (subFetchErr || !sub) {
      console.error("Sub fetch error:", subFetchErr);
      return new Response(
        JSON.stringify({ error: "Suscripción no encontrada" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (sub.alumno_id !== alumno_id || sub.plan_id !== plan_id) {
      return new Response(
        JSON.stringify({ error: "Datos de suscripción inválidos" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (sub.estado === "activa" || sub.estado === "conciliado") {
      return new Response(
        JSON.stringify({ error: "Esta suscripción ya está activa" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const expectedAmount = Number(sub.precio_final);
    const clientAmount = Number(transaction_amount);
    if (!Number.isFinite(clientAmount) || Math.abs(expectedAmount - clientAmount) > 0.01) {
      return new Response(
        JSON.stringify({ error: "El monto no coincide con el precio del plan" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const payerEmail = String(payer?.email || "").trim().toLowerCase();
    const identificationType = String(payer?.identification?.type || "").trim();
    const identificationNumber = String(payer?.identification?.number || "").replace(/\D/g, "");

    if (!payerEmail || !identificationType || !identificationNumber) {
      return new Response(
        JSON.stringify({ error: "Completá email, tipo y número de documento del titular." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const paymentBody: Record<string, unknown> = {
      token,
      payment_method_id,
      transaction_amount: expectedAmount,
      installments: installmentCount,
      payer: {
        email: payerEmail,
        identification: {
          type: identificationType,
          number: identificationNumber,
        },
      },
      external_reference: suscripcion_id,
      description: "Suscripción Ciclismo Reybaud",
      statement_descriptor: "CICLISMO REYBAUD",
    };

    const normalizedIssuer = issuer_id == null ? "" : String(issuer_id).trim();
    if (normalizedIssuer && normalizedIssuer !== "null" && normalizedIssuer !== "undefined" && normalizedIssuer !== "0") {
      paymentBody.issuer_id = normalizedIssuer;
    }

    const idempotencyKey = `${suscripcion_id}:${Date.now()}`;
    const mpResponse = await fetch("https://api.mercadopago.com/v1/payments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cuenta.access_token}`,
        "X-Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(paymentBody),
    });

    const mpData = await mpResponse.json().catch(() => ({}));
    console.log("MP payment response:", {
      http_status: mpResponse.status,
      status: mpData?.status,
      status_detail: mpData?.status_detail,
      id: mpData?.id,
      error: mpData?.error,
      message: mpData?.message,
      cause: mpData?.cause,
    });

    // Mercado Pago usa `status: 400` también dentro de sus respuestas de error.
    // Ese número NO es un estado de pago. Cualquier HTTP no-2xx se trata primero
    // como error de API y nunca como un pago rechazado por el banco.
    if (!mpResponse.ok) {
      const causeDescription =
        Array.isArray(mpData?.cause) && mpData.cause.length > 0
          ? String(mpData.cause[0]?.description || mpData.cause[0]?.code || "")
          : "";
      const rawMessage = String(mpData?.message || causeDescription || "").trim();
      const errorCode = String(mpData?.error || `http_${mpResponse.status}`);
      const statusDetail = String(mpData?.status_detail || errorCode);
      const userMessage = getApiErrorUserMessage(rawMessage, errorCode);

      await supabaseAdmin
        .from("suscripciones")
        .update({
          estado: "pendiente",
          mp_payment_id: null,
          mp_status: `error_${mpResponse.status}`,
          mp_status_detail: statusDetail,
          mp_error_code: errorCode,
          mp_error_message: rawMessage || null,
          metodo_pago: "mercadopago",
          origen_registro: "automatico",
          cuenta_mp_id: cuenta.cuenta_id,
        })
        .eq("id", suscripcion_id);

      return new Response(
        JSON.stringify({
          status: "rejected",
          status_detail: statusDetail,
          error: userMessage,
        }),
        { status: mpResponse.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const now = new Date().toISOString().split("T")[0];
    const endOfMonth = new Date(
      new Date().getFullYear(),
      new Date().getMonth() + 1,
      0
    ).toISOString().split("T")[0];

    if (mpData.status === "approved") {
      const { data: currentSub } = await supabaseAdmin
        .from("suscripciones")
        .select("fecha_inicio, fecha_fin")
        .eq("id", suscripcion_id)
        .maybeSingle();

      let feesPatch: Record<string, unknown> = {};
      try {
        const detailed = await fetchMpPayment(String(mpData.id), cuenta.access_token);
        const fees = parseMpFees(detailed);
        feesPatch = {
          comision_mp: fees.comision_mp,
          iibb: fees.iibb,
          otros_fees: fees.otros_fees,
          neto_recibido: fees.neto_recibido,
          fees_synced_at: new Date().toISOString(),
        };
      } catch (e) {
        console.warn("[process-card-payment] no se pudo capturar fees MP:", (e as Error).message);
      }

      const updatePayload: Record<string, unknown> = {
        estado: "activa",
        mp_payment_id: String(mpData.id),
        mp_status: "approved",
        mp_status_detail: mpData.status_detail || null,
        mp_error_code: null,
        mp_error_message: null,
        metodo_pago: "mercadopago",
        origen_registro: "automatico",
        cuenta_mp_id: cuenta.cuenta_id,
        ...feesPatch,
      };

      if (currentSub?.fecha_inicio && currentSub?.fecha_fin) {
        updatePayload.fecha_inicio = currentSub.fecha_inicio;
        updatePayload.fecha_fin = currentSub.fecha_fin;
      } else {
        updatePayload.fecha_inicio = now;
        updatePayload.fecha_fin = endOfMonth;
      }

      await supabaseAdmin.from("suscripciones").update(updatePayload).eq("id", suscripcion_id);
      await supabaseAdmin.from("alumnos").update({ estado: "activo" }).eq("id", alumno_id);
    } else if (mpData.status === "in_process") {
      await supabaseAdmin
        .from("suscripciones")
        .update({
          estado: "pendiente",
          mp_payment_id: String(mpData.id),
          mp_status: "in_process",
          mp_status_detail: mpData.status_detail || null,
          mp_error_code: null,
          mp_error_message: null,
          metodo_pago: "mercadopago",
          origen_registro: "automatico",
          cuenta_mp_id: cuenta.cuenta_id,
        })
        .eq("id", suscripcion_id);
    } else {
      const rejectionMessage = getPaymentErrorMessage(mpData.status_detail);
      await supabaseAdmin
        .from("suscripciones")
        .update({
          estado: "pendiente",
          mp_payment_id: mpData.id ? String(mpData.id) : null,
          mp_status: mpData.status || "rejected",
          mp_status_detail: mpData.status_detail || null,
          mp_error_code: mpData.status === "rejected" ? "payment_rejected" : null,
          mp_error_message: mpData.status === "rejected" ? rejectionMessage : null,
          metodo_pago: "mercadopago",
          origen_registro: "automatico",
          cuenta_mp_id: cuenta.cuenta_id,
        })
        .eq("id", suscripcion_id);
    }

    const rejectionError =
      mpData.status === "rejected" ? getPaymentErrorMessage(mpData.status_detail) : undefined;

    return new Response(
      JSON.stringify({
        status: mpData.status,
        status_detail: mpData.status_detail,
        payment_id: mpData.id,
        ...(rejectionError ? { error: rejectionError } : {}),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Card payment error:", err);
    return new Response(
      JSON.stringify({ error: "Error interno al procesar el pago" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
