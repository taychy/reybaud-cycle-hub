import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveCuentaMP } from "../_shared/resolve-cuenta-mp.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const APP_BASE_URL = "https://reybaud-app.com";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const {
      card_token_id,
      payer_email,
      suscripcion_id,
      alumno_id,
      plan_id,
      transaction_amount,
    } = body;

    // card_token_id is OPTIONAL:
    //  - if provided → authorized immediately (no redirect)
    //  - if absent   → MP returns init_point; user must authorize at MP
    if (!payer_email || !suscripcion_id || !plan_id || !transaction_amount) {
      return new Response(
        JSON.stringify({ error: "Faltan parámetros requeridos" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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
    console.log("[create-mp-preapproval] cuenta MP:", { slug: cuenta.slug, source: cuenta.source });

    // Validate plan allows auto-charge and is monthly
    const { data: plan, error: planErr } = await supabaseAdmin
      .from("planes")
      .select("id, nombre, frecuencia, permite_auto_cobro, moneda")
      .eq("id", plan_id)
      .single();

    if (planErr || !plan) {
      return new Response(
        JSON.stringify({ error: "Plan no encontrado" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (plan.frecuencia !== "mensual" || !plan.permite_auto_cobro) {
      return new Response(
        JSON.stringify({ error: "Este plan no admite renovación automática" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: sub, error: subErr } = await supabaseAdmin
      .from("suscripciones")
      .select("id, alumno_id, plan_id, estado, cancelada_at")
      .eq("id", suscripcion_id)
      .maybeSingle();

    if (subErr || !sub || sub.alumno_id !== alumno_id || sub.plan_id !== plan_id || sub.cancelada_at) {
      return new Response(
        JSON.stringify({ error: "Suscripción inválida para activar renovación automática" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const currencyId = (plan.moneda || "ARS").toUpperCase();
    const amount = Number(transaction_amount);

    // Mercado Pago minimum amounts per currency (preapproval)
    const MP_MIN_AMOUNT: Record<string, number> = { ARS: 15, USD: 1, EUR: 1 };
    const minAmount = MP_MIN_AMOUNT[currencyId] ?? 15;
    if (!Number.isFinite(amount) || amount < minAmount) {
      return new Response(
        JSON.stringify({
          error: `El monto del plan (${currencyId} ${amount}) es menor al mínimo permitido por Mercado Pago (${currencyId} ${minAmount}). No se puede activar la renovación automática en este plan.`,
          code: "amount_below_minimum",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }


    // Webhook URL para que MP nos notifique el cambio de estado del preapproval
    // y los cobros recurrentes. SIN esto, el webhook nunca recibe nada y
    // auto_cobro_activo jamás se prende.
    const notificationUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/mp-webhook${cuenta.slug ? `?cuenta=${cuenta.slug}` : ""}`;

    const preapprovalPayload: Record<string, unknown> = {
      reason: `Renovación automática mensual — ${plan.nombre}`,
      external_reference: suscripcion_id,
      payer_email,
      auto_recurring: {
        frequency: 1,
        frequency_type: "months",
        transaction_amount: amount,
        currency_id: currencyId,
      },
      back_url: `${APP_BASE_URL}/perfil?section=suscripciones`,
      notification_url: notificationUrl,
    };

    if (card_token_id) {
      preapprovalPayload.card_token_id = card_token_id;
      preapprovalPayload.status = "authorized";
    } else {
      // Redirect mode: user authorizes at MP via init_point
      preapprovalPayload.status = "pending";
    }

    console.log("Creating MP preapproval:", { suscripcion_id, amount, currencyId, mode: card_token_id ? "token" : "redirect" });

    const mpRes = await fetch("https://api.mercadopago.com/preapproval", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cuenta.access_token}`,
        "X-Idempotency-Key": `preapproval-${suscripcion_id}`,
      },
      body: JSON.stringify(preapprovalPayload),
    });

    const mpData = await mpRes.json();
    console.log("MP preapproval response:", {
      ok: mpRes.ok,
      id: mpData?.id,
      status: mpData?.status,
      init_point: mpData?.init_point,
      message: mpData?.message,
    });

    if (!mpRes.ok || !mpData?.id) {
      return new Response(
        JSON.stringify({
          error: mpData?.message || "No se pudo activar la renovación automática",
          mp_status: mpData?.status,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Persist on subscription
    await supabaseAdmin
      .from("suscripciones")
      .update({
        auto_renovacion: true,
        mp_preapproval_id: String(mpData.id),
        mp_preapproval_status: mpData.status || "pending",
        auto_cobro_activo: mpData.status === "authorized",
        intentos_cobro_fallidos: 0,
        cuenta_mp_id: cuenta.cuenta_id,
      })
      .eq("id", suscripcion_id);

    return new Response(
      JSON.stringify({
        ok: true,
        preapproval_id: mpData.id,
        status: mpData.status,
        init_point: mpData.init_point || null,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("create-mp-preapproval error:", err);
    return new Response(
      JSON.stringify({ error: "Error interno al activar renovación automática" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
