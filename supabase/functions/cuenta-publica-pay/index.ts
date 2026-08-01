/**
 * Endpoint público para pagar una deuda desde el link de cuenta corriente.
 * 1) Aplica saldo a favor (RPC cuenta_publica_consume_credit) — sólo para suscripciones.
 * 2) Si el crédito cubre TODO → devuelve { paid: true }.
 * 3) Si queda saldo → crea preferencia MP por el saldo restante y devuelve init_point.
 *
 * Sólo se implementa para suscripciones. Otros tipos (evento, tienda, preventa)
 * siguen cobrando el total por su propia función MP.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveCuentaMP } from "../_shared/resolve-cuenta-mp.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { token, fuente_tabla, fuente_id, plan_id, alumno_id } = await req.json();
    if (
      !token || !UUID_RE.test(String(token)) ||
      !fuente_tabla || !fuente_id || !UUID_RE.test(String(fuente_id))
    ) {
      return new Response(JSON.stringify({ error: "Solicitud inválida" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supa = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1) Consumir crédito
    const { data: credit, error: credErr } = await supa.rpc(
      "cuenta_publica_consume_credit",
      { p_token: token, p_fuente_tabla: fuente_tabla, p_fuente_id: fuente_id },
    );
    if (credErr) {
      console.error("consume_credit err", credErr);
      return new Response(JSON.stringify({ error: "No se pudo aplicar el saldo a favor" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!(credit as any)?.ok) {
      return new Response(JSON.stringify({ error: (credit as any)?.reason || "invalid" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const applied = Number((credit as any).applied || 0);
    const remaining = Number((credit as any).remaining || 0);
    const fully_paid = !!(credit as any).fully_paid;

    if (fully_paid) {
      return new Response(JSON.stringify({ paid: true, applied, remaining: 0 }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2) Queda saldo → crear preferencia MP sólo para suscripciones
    if (fuente_tabla !== "suscripciones" || !plan_id || !alumno_id) {
      return new Response(JSON.stringify({
        applied, remaining, requires_full_mp: true,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: plan } = await supa.from("planes").select("nombre").eq("id", plan_id).single();
    const { data: alumno } = await supa.from("alumnos").select("nombre,email").eq("id", alumno_id).single();

    const cuenta = await resolveCuentaMP(supa, { unidad_negocio: "suscripcion_escuela" });
    if (!cuenta.access_token) {
      return new Response(JSON.stringify({ error: "Mercado Pago no está configurado" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const origin = req.headers.get("origin") || "https://reybaud-app.com";
    // Sólo mencionamos el crédito si realmente se aplicó un monto > 0.
    const creditSuffix = applied > 0 ? " (saldo restante aplicando crédito)" : "";
    const prefBody = {
      items: [{
        title: `Plan ${plan?.nombre ?? ""}${creditSuffix} — Ciclismo Reybaud`,
        quantity: 1,
        unit_price: Number(remaining.toFixed(2)),
        currency_id: "ARS",
      }],
      payer: { name: alumno?.nombre, email: alumno?.email },
      back_urls: {
        success: `${origin}/pago-resultado?status=approved`,
        failure: `${origin}/pago-resultado?status=failure`,
        pending: `${origin}/pago-resultado?status=pending`,
      },
      auto_return: "approved",
      external_reference: fuente_id,
      notification_url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/mp-webhook${cuenta.slug ? `?cuenta=${cuenta.slug}` : ""}`,
      statement_descriptor: "CICLISMO REYBAUD",
    };

    const mpRes = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cuenta.access_token}` },
      body: JSON.stringify(prefBody),
    });
    const mpData = await mpRes.json();
    if (!mpRes.ok) {
      console.error("MP err", mpData);
      return new Response(JSON.stringify({ error: "Error creando preferencia MP" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supa.from("suscripciones").update({
      mp_preference_id: mpData.id,
      cuenta_mp_id: cuenta.cuenta_id,
    }).eq("id", fuente_id);

    return new Response(JSON.stringify({
      applied,
      remaining,
      init_point: mpData.init_point,
      sandbox_init_point: mpData.sandbox_init_point,
      preference_id: mpData.id,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: "exception" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
