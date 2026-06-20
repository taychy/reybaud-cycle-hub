import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveCuentaMP } from "../_shared/resolve-cuenta-mp.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Suma el saldo pendiente (+ seña si aún no fue confirmada) de TODAS las preventas
// abiertas del alumno y genera UNA sola preferencia de MP.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { alumno_id } = await req.json();
    if (!alumno_id || !UUID_RE.test(String(alumno_id))) {
      return new Response(JSON.stringify({ error: "alumno_id inválido" }), {
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

    const { data: rows } = await supabaseAdmin
      .from("store_preorders")
      .select("id, producto_nombre, moneda, sena_monto, saldo_pendiente, estado, estado_pago_sena, cancelada_at")
      .eq("alumno_id", alumno_id)
      .is("cancelada_at", null)
      .neq("estado", "cancelada");

    const preventas = (rows || []).filter((r: any) => {
      const sena = r.estado_pago_sena !== "confirmada" ? Number(r.sena_monto || 0) : 0;
      const saldo = Number(r.saldo_pendiente || 0);
      return sena + saldo > 0;
    });

    if (!preventas.length) {
      return new Response(JSON.stringify({ error: "No hay saldo pendiente" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Asumimos misma moneda (la primera). Si hay mezcla, devolvemos error informativo.
    const monedas = Array.from(new Set(preventas.map((p: any) => p.moneda || "ARS")));
    if (monedas.length > 1) {
      return new Response(JSON.stringify({ error: `El cliente tiene saldos en distintas monedas (${monedas.join(", ")}). Pagá cada preventa por separado.` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const moneda = monedas[0];

    const total = preventas.reduce((acc: number, p: any) => {
      const sena = p.estado_pago_sena !== "confirmada" ? Number(p.sena_monto || 0) : 0;
      const saldo = Number(p.saldo_pendiente || 0);
      return acc + sena + saldo;
    }, 0);

    const { data: alumno } = await supabaseAdmin
      .from("alumnos")
      .select("nombre, apellido, email")
      .eq("id", alumno_id)
      .maybeSingle();

    const origin = req.headers.get("origin") || "https://reybaud-app.com";
    const productosLabel = preventas.length === 1
      ? preventas[0].producto_nombre
      : `${preventas.length} preventas`;

    const preferenceBody = {
      items: [{
        title: `Pago total preventas - ${productosLabel}`,
        quantity: 1,
        unit_price: total,
        currency_id: moneda,
      }],
      payer: alumno ? { name: `${alumno.nombre || ""} ${alumno.apellido || ""}`.trim(), email: alumno.email } : undefined,
      back_urls: {
        success: `${origin}/pago-resultado?status=approved&kind=preorder_alumno`,
        failure: `${origin}/pago-resultado?status=failure&kind=preorder_alumno`,
        pending: `${origin}/pago-resultado?status=pending&kind=preorder_alumno`,
      },
      auto_return: "approved",
      external_reference: `preorder_alumno_saldo:${alumno_id}`,
      metadata: {
        payment_type: "preorder_alumno_saldo",
        alumno_id,
        preorder_ids: preventas.map((p: any) => p.id),
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
      console.error("[create-preorder-alumno-saldo-mp-preference] MP error:", JSON.stringify(mpData));
      return new Response(JSON.stringify({ error: "Error al crear preferencia" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      init_point: mpData.init_point,
      sandbox_init_point: mpData.sandbox_init_point,
      preference_id: mpData.id,
      monto: total,
      moneda,
      count: preventas.length,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("create-preorder-alumno-saldo-mp-preference error:", err);
    return new Response(JSON.stringify({ error: "Error interno" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
