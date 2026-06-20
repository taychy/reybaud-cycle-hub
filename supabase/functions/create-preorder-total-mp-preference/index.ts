import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveCuentaMP } from "../_shared/resolve-cuenta-mp.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Pago "total" de una preventa: seña (si no está confirmada) + saldo pendiente
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { preorder_id } = await req.json();
    if (!preorder_id || !UUID_RE.test(String(preorder_id))) {
      return new Response(JSON.stringify({ error: "preorder_id inválido" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const cuenta = await resolveCuentaMP(supabaseAdmin, { unidad_negocio: "preventa" });
    if (!cuenta.access_token) {
      return new Response(JSON.stringify({ error: "Mercado Pago no configurado" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: p } = await supabaseAdmin
      .from("store_preorders")
      .select("id, alumno_id, product_id, producto_nombre, moneda, sena_monto, saldo_pendiente, estado, estado_pago_sena")
      .eq("id", preorder_id)
      .maybeSingle();

    if (!p) {
      return new Response(JSON.stringify({ error: "Reserva no encontrada" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const senaPend = p.estado_pago_sena !== "confirmada" ? Number(p.sena_monto || 0) : 0;
    const saldo = Number(p.saldo_pendiente || 0);
    const totalPagar = senaPend + saldo;
    if (totalPagar <= 0) {
      return new Response(JSON.stringify({ error: "No hay monto pendiente" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: alumno } = await supabaseAdmin
      .from("alumnos")
      .select("nombre, apellido, email")
      .eq("id", p.alumno_id)
      .maybeSingle();

    const origin = req.headers.get("origin") || "https://reybaud-app.com";

    const preferenceBody = {
      items: [{
        title: `Pago total preventa - ${p.producto_nombre}`,
        quantity: 1,
        unit_price: totalPagar,
        currency_id: p.moneda || "ARS",
      }],
      payer: alumno ? { name: `${alumno.nombre || ""} ${alumno.apellido || ""}`.trim(), email: alumno.email } : undefined,
      back_urls: {
        success: `${origin}/pago-resultado?status=approved&kind=preorder_total`,
        failure: `${origin}/pago-resultado?status=failure&kind=preorder_total`,
        pending: `${origin}/pago-resultado?status=pending&kind=preorder_total`,
      },
      auto_return: "approved",
      external_reference: `preorder_total:${p.id}`,
      metadata: {
        payment_type: "preorder_total",
        preorder_id: p.id,
        product_id: p.product_id,
        alumno_id: p.alumno_id,
      },
      notification_url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/mp-webhook${cuenta.slug ? `?cuenta=${cuenta.slug}` : ""}`,
      statement_descriptor: "CICLISMO REYBAUD",
    };

    const mpResponse = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cuenta.access_token}` },
      body: JSON.stringify(preferenceBody),
    });
    const mpData = await mpResponse.json();
    if (!mpResponse.ok) {
      console.error("[create-preorder-total-mp-preference] MP error:", JSON.stringify(mpData));
      return new Response(JSON.stringify({ error: "Error al crear preferencia" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      init_point: mpData.init_point,
      sandbox_init_point: mpData.sandbox_init_point,
      preference_id: mpData.id,
      monto: totalPagar,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("create-preorder-total-mp-preference error:", err);
    return new Response(JSON.stringify({ error: "Error interno" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
