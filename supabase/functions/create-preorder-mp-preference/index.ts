import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { preorder_id } = await req.json();
    if (!preorder_id || !UUID_RE.test(String(preorder_id))) {
      return new Response(JSON.stringify({ error: "preorder_id inválido" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const MP_ACCESS_TOKEN = Deno.env.get("MP_ACCESS_TOKEN");
    if (!MP_ACCESS_TOKEN) {
      return new Response(JSON.stringify({ error: "Mercado Pago no configurado" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Load preorder
    const { data: preorder, error: pErr } = await supabaseAdmin
      .from("store_preorders")
      .select("id, alumno_id, product_id, producto_nombre, moneda, sena_monto, estado, estado_pago_sena")
      .eq("id", preorder_id)
      .maybeSingle();

    if (pErr || !preorder) {
      return new Response(JSON.stringify({ error: "Reserva no encontrada" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (preorder.estado_pago_sena === "confirmada") {
      return new Response(JSON.stringify({ error: "La seña ya fue confirmada" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: alumno } = await supabaseAdmin
      .from("alumnos")
      .select("nombre, apellido, email")
      .eq("id", preorder.alumno_id)
      .maybeSingle();

    const origin = req.headers.get("origin") || "https://reybaud-cycle-hub.lovable.app";
    const sena = Number(preorder.sena_monto);
    if (!sena || sena <= 0) {
      return new Response(JSON.stringify({ error: "Seña inválida" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const preferenceBody = {
      items: [{
        title: `Seña preventa - ${preorder.producto_nombre}`,
        quantity: 1,
        unit_price: sena,
        currency_id: preorder.moneda || "ARS",
      }],
      payer: alumno ? { name: `${alumno.nombre || ""} ${alumno.apellido || ""}`.trim(), email: alumno.email } : undefined,
      back_urls: {
        success: `${origin}/pago-resultado?status=approved&kind=preorder`,
        failure: `${origin}/pago-resultado?status=failure&kind=preorder`,
        pending: `${origin}/pago-resultado?status=pending&kind=preorder`,
      },
      auto_return: "approved",
      external_reference: `preorder:${preorder.id}`,
      metadata: {
        payment_type: "preorder_deposit",
        preorder_id: preorder.id,
        product_id: preorder.product_id,
        alumno_id: preorder.alumno_id,
      },
      notification_url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/mp-webhook`,
      statement_descriptor: "CICLISMO REYBAUD",
    };

    const mpResponse = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${MP_ACCESS_TOKEN}` },
      body: JSON.stringify(preferenceBody),
    });

    const mpData = await mpResponse.json();
    if (!mpResponse.ok) {
      console.error("[create-preorder-mp-preference] MP error:", JSON.stringify(mpData));
      return new Response(JSON.stringify({ error: "Error al crear preferencia" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supabaseAdmin
      .from("store_preorders")
      .update({ mp_preference_id: mpData.id, forma_pago_sena: "mercadopago", estado_pago_sena: "pendiente" })
      .eq("id", preorder.id);

    return new Response(JSON.stringify({
      init_point: mpData.init_point,
      sandbox_init_point: mpData.sandbox_init_point,
      preference_id: mpData.id,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("create-preorder-mp-preference error:", err);
    return new Response(JSON.stringify({ error: "Error interno" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
