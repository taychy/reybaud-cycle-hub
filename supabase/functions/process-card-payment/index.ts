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

    if (!token || !suscripcion_id || !alumno_id || !plan_id) {
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
    console.log("[process-card-payment] cuenta MP:", { slug: cuenta.slug, source: cuenta.source });


    // ──────────────────────────────────────────────────────────────
    // VALIDACIÓN SERVER-SIDE: el monto que mandó el cliente tiene
    // que coincidir con el precio_final ya persistido en la sub.
    // Esto evita que un cliente manipulado pague $1 por un plan caro.
    // ──────────────────────────────────────────────────────────────
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
      console.warn("Sub mismatch:", { sub_alumno: sub.alumno_id, body_alumno: alumno_id });
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
    // Tolerancia de 1 centavo para evitar falsos negativos por float
    if (!Number.isFinite(clientAmount) || Math.abs(expectedAmount - clientAmount) > 0.01) {
      console.warn("Amount mismatch:", { expected: expectedAmount, received: clientAmount });
      return new Response(
        JSON.stringify({ error: "El monto no coincide con el precio del plan" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Process payment via MP API — uso el monto validado del servidor.
    const paymentBody = {
      token,
      issuer_id,
      payment_method_id,
      transaction_amount: expectedAmount,
      installments: Number(installments),
      payer: {
        email: payer?.email || "",
        identification: payer?.identification || {},
      },
      external_reference: suscripcion_id,
      description: "Suscripción Ciclismo Reybaud",
      statement_descriptor: "CICLISMO REYBAUD",
    };

    console.log("Processing card payment:", { suscripcion_id, amount: expectedAmount });

    // Idempotency key con timestamp: permite reintentos con otra tarjeta
    // después de un rechazo, sin que MP cachee el resultado anterior 24h.
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

    const mpData = await mpResponse.json();
    console.log("MP payment response:", {
      http_status: mpResponse.status,
      status: mpData?.status,
      status_detail: mpData?.status_detail,
      id: mpData?.id,
      error: mpData?.error,
      message: mpData?.message,
      cause: mpData?.cause,
    });

    // Si MP devuelve un 4xx sin "status" (ej. token inválido, datos faltantes),
    // propagamos el error de forma legible SIN tocar la suscripción para que
    // el alumno pueda reintentar sin que aparezca como "baja".
    if (!mpResponse.ok && !mpData?.status) {
      const mpMessage =
        mpData?.message ||
        (Array.isArray(mpData?.cause) && mpData.cause[0]?.description) ||
        "Mercado Pago rechazó la solicitud. Revisá los datos de la tarjeta.";
      return new Response(
        JSON.stringify({
          status: "rejected",
          status_detail: mpData?.status_detail || mpData?.error || null,
          error: mpMessage,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update subscription based on payment result
    const now = new Date().toISOString().split("T")[0];
    const endOfMonth = new Date(
      new Date().getFullYear(),
      new Date().getMonth() + 1,
      0
    ).toISOString().split("T")[0];

    if (mpData.status === "approved") {
      const { error: updateErr } = await supabaseAdmin
        .from("suscripciones")
        .update({
          estado: "activa",
          mp_payment_id: String(mpData.id),
          mp_status: mpData.status,
          metodo_pago: "mercadopago",
          origen_registro: "automatico",
          fecha_inicio: now,
          fecha_fin: endOfMonth,
          cuenta_mp_id: cuenta.cuenta_id,
        })
        .eq("id", suscripcion_id);

      if (updateErr) {
        console.error("Error updating subscription (possible duplicate):", updateErr);
      }

      // Activate student
      await supabaseAdmin
        .from("alumnos")
        .update({ estado: "activo" })
        .eq("id", alumno_id);
    } else if (mpData.status === "in_process") {
      await supabaseAdmin
        .from("suscripciones")
        .update({
          estado: "pendiente",
          mp_payment_id: String(mpData.id),
          mp_status: mpData.status,
          metodo_pago: "mercadopago",
          origen_registro: "automatico",
          cuenta_mp_id: cuenta.cuenta_id,
        })
        .eq("id", suscripcion_id);
    } else {
      // Rechazo: dejamos la sub en "pendiente" (no "cancelada") para:
      //  1) No contar como baja en métricas/alertas admin.
      //  2) Permitir reintento con otra tarjeta sobre la misma sub.
      // El detalle del rechazo queda en mp_status para auditoría.
      await supabaseAdmin
        .from("suscripciones")
        .update({
          estado: "pendiente",
          mp_payment_id: mpData.id ? String(mpData.id) : null,
          mp_status: mpData.status || "rejected",
          metodo_pago: "mercadopago",
          origen_registro: "automatico",
          cuenta_mp_id: cuenta.cuenta_id,
        })
        .eq("id", suscripcion_id);
    }

    return new Response(
      JSON.stringify({
        status: mpData.status,
        status_detail: mpData.status_detail,
        payment_id: mpData.id,
      }),
      { status: mpResponse.ok ? 200 : 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Card payment error:", err);
    return new Response(
      JSON.stringify({ error: "Error interno al procesar el pago" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
