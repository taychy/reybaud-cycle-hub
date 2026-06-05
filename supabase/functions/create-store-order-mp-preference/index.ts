import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveCuentaMP } from "../_shared/resolve-cuenta-mp.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { order_id } = await req.json();
    if (!order_id || !UUID_RE.test(String(order_id))) {
      return new Response(JSON.stringify({ error: "order_id inválido" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const cuenta = await resolveCuentaMP(supabaseAdmin, { unidad_negocio: "tienda" });
    if (!cuenta.access_token) {
      return new Response(JSON.stringify({ error: "Mercado Pago no configurado" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    console.log("[create-store-order-mp-preference] cuenta MP:", { slug: cuenta.slug, source: cuenta.source });

    const { data: order } = await supabaseAdmin
      .from("store_orders")
      .select("id, alumno_id, customer_name, customer_email, total, currency, status, mp_payment_id")
      .eq("id", order_id)
      .maybeSingle();

    if (!order) {
      return new Response(JSON.stringify({ error: "Pedido no encontrado" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (order.mp_payment_id || order.status === "pagado") {
      return new Response(JSON.stringify({ error: "El pedido ya fue pagado" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: items } = await supabaseAdmin
      .from("store_order_items")
      .select("product_name, quantity, unit_price")
      .eq("order_id", order.id);

    const origin = req.headers.get("origin") || "https://reybaud-cycle-hub.lovable.app";

    const preferenceBody = {
      items: (items || []).map((it: any) => ({
        title: it.product_name,
        quantity: Number(it.quantity),
        unit_price: Number(it.unit_price),
        currency_id: order.currency || "ARS",
      })),
      payer: { name: order.customer_name, email: order.customer_email || undefined },
      back_urls: {
        success: `${origin}/pago-resultado?status=approved&kind=store_order`,
        failure: `${origin}/pago-resultado?status=failure&kind=store_order`,
        pending: `${origin}/pago-resultado?status=pending&kind=store_order`,
      },
      auto_return: "approved",
      external_reference: `store_order:${order.id}`,
      metadata: {
        payment_type: "store_order",
        order_id: order.id,
        alumno_id: order.alumno_id,
      },
      notification_url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/mp-webhook`,
      statement_descriptor: "CICLISMO REYBAUD",
    };

    const mpResponse = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cuenta.access_token}` },
      body: JSON.stringify(preferenceBody),
    });

    const mpData = await mpResponse.json();
    if (!mpResponse.ok) {
      console.error("[create-store-order-mp-preference] MP error:", JSON.stringify(mpData));
      return new Response(JSON.stringify({ error: "Error al crear preferencia" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supabaseAdmin
      .from("store_orders")
      .update({
        mp_preference_id: mpData.id,
        metodo_pago: "mercadopago",
        origen_registro: "automatico",
        status: "pendiente_pago",
        cuenta_mp_id: cuenta.cuenta_id,
      })
      .eq("id", order.id);

    return new Response(JSON.stringify({
      init_point: mpData.init_point,
      sandbox_init_point: mpData.sandbox_init_point,
      preference_id: mpData.id,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("create-store-order-mp-preference error:", err);
    return new Response(JSON.stringify({ error: "Error interno" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
