// Crea la preferencia MP para una reserva de turnera.
// Lee servicios_turnera.pago_modo (sena|total) y pago_monto_sena.
// external_reference: "turnera:<reservation_id>"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveCuentaMP } from "../_shared/resolve-cuenta-mp.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { reservation_id } = await req.json();
    if (!reservation_id) {
      return new Response(JSON.stringify({ error: "Falta reservation_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: r, error: rErr } = await supabase
      .from("reservas_turnera")
      .select("id, servicio_id, nombre, apellido, email, fecha, hora_inicio, precio_snapshot, moneda_snapshot, pago_estado, pago_mp_preference_id")
      .eq("id", reservation_id)
      .maybeSingle();
    if (rErr || !r) {
      return new Response(JSON.stringify({ error: "Reserva no encontrada" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: s, error: sErr } = await supabase
      .from("servicios_turnera")
      .select("nombre, pago_modo, pago_monto_sena, moneda, precio")
      .eq("id", r.servicio_id)
      .maybeSingle();
    if (sErr || !s) {
      return new Response(JSON.stringify({ error: "Servicio no encontrado" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!s.pago_modo || s.pago_modo === "ninguno") {
      return new Response(JSON.stringify({ error: "El servicio no requiere pago online" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const currency = (r.moneda_snapshot || s.moneda || "ARS").toUpperCase();
    const precioTotal = Number(r.precio_snapshot || s.precio || 0);
    let amount = 0;
    if (s.pago_modo === "sena") {
      amount = Number(s.pago_monto_sena || 0);
      if (!amount || amount <= 0) {
        return new Response(JSON.stringify({ error: "Monto de seña no configurado" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else if (s.pago_modo === "total") {
      amount = precioTotal;
      if (!amount || amount <= 0) {
        return new Response(JSON.stringify({ error: "El servicio no tiene precio cargado" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      return new Response(JSON.stringify({ error: `Modo de pago no soportado: ${s.pago_modo}` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    amount = Number(amount.toFixed(2));

    // Reutilizar preference vigente si ya hay una pendiente
    if (r.pago_mp_preference_id && r.pago_estado === "pendiente") {
      // Try fetching init_point from MP isn't ideal; safer: regenerate. So skip and create new.
    }

    const cuenta = await resolveCuentaMP(supabase, { unidad_negocio: "turnera" });
    if (!cuenta.access_token) {
      return new Response(JSON.stringify({ error: "Mercado Pago no está configurado" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const origin = req.headers.get("origin") || "https://reybaud-app.com";
    const titleLabel = s.pago_modo === "sena" ? "Seña" : "Total";

    const preferenceBody: Record<string, unknown> = {
      items: [{
        title: `${s.nombre || "Reserva"} — ${titleLabel}`,
        quantity: 1,
        unit_price: amount,
        currency_id: currency,
      }],
      payer: r.email ? { name: `${r.nombre} ${r.apellido || ""}`.trim(), email: r.email } : undefined,
      back_urls: {
        success: `${origin}/reservar/confirmacion?id=${reservation_id}&status=approved`,
        failure: `${origin}/reservar/confirmacion?id=${reservation_id}&status=failure`,
        pending: `${origin}/reservar/confirmacion?id=${reservation_id}&status=pending`,
      },
      auto_return: "approved",
      external_reference: `turnera:${reservation_id}`,
      notification_url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/mp-webhook${cuenta.slug ? `?cuenta=${cuenta.slug}` : ""}`,
      statement_descriptor: "CICLISMO REYBAUD",
    };

    const mpResp = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cuenta.access_token}`,
      },
      body: JSON.stringify(preferenceBody),
    });
    const mpData = await mpResp.json();
    if (!mpResp.ok) {
      console.error("[turnera-mp] MP error:", JSON.stringify(mpData));
      return new Response(JSON.stringify({ error: "Error al crear preferencia", detail: mpData }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supabase.from("reservas_turnera").update({
      pago_mp_preference_id: mpData.id,
      pago_monto: amount,
      pago_estado: "pendiente",
    } as any).eq("id", reservation_id);

    return new Response(JSON.stringify({
      init_point: mpData.init_point,
      sandbox_init_point: mpData.sandbox_init_point,
      preference_id: mpData.id,
      amount,
      currency,
      modo: s.pago_modo,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("[create-turnera-mp-preference] error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
