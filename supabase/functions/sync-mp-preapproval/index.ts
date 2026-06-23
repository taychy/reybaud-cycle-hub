// Consulta el estado real de un preapproval en Mercado Pago y sincroniza
// la fila en `suscripciones`. Pensado para llamarse desde el frontend
// cuando el alumno vuelve del init_point (back_url) con ?preapproval_id=...
// El webhook también hace esto, pero hay casos en los que el webhook
// llega tarde o se pierde y el alumno ya está mirando la pantalla.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCuentaMPTokenById, resolveCuentaMP } from "../_shared/resolve-cuenta-mp.ts";

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
    const { preapproval_id } = await req.json();
    if (!preapproval_id || typeof preapproval_id !== "string") {
      return new Response(
        JSON.stringify({ error: "Falta preapproval_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Token: primero el de la suscripción (si existe), luego routing, luego legacy
    const { data: sub } = await supabaseAdmin
      .from("suscripciones")
      .select("id, cuenta_mp_id")
      .eq("mp_preapproval_id", preapproval_id)
      .maybeSingle();

    let token = "";
    if (sub?.cuenta_mp_id) {
      token = await getCuentaMPTokenById(supabaseAdmin, sub.cuenta_mp_id);
    }
    if (!token) {
      const cuenta = await resolveCuentaMP(supabaseAdmin, { unidad_negocio: "suscripcion_escuela" });
      token = cuenta.access_token;
    }
    if (!token) {
      return new Response(
        JSON.stringify({ error: "Mercado Pago no configurado" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const mpRes = await fetch(`https://api.mercadopago.com/preapproval/${preapproval_id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const pa = await mpRes.json().catch(() => null);

    if (!mpRes.ok || !pa?.id) {
      console.warn("[sync-mp-preapproval] MP respondió error:", { status: mpRes.status, body: pa });
      return new Response(
        JSON.stringify({ ok: false, error: pa?.message || "No se pudo consultar el preapproval", mp_status: mpRes.status }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const isAuthorized = pa.status === "authorized";
    await supabaseAdmin
      .from("suscripciones")
      .update({
        mp_preapproval_status: pa.status,
        auto_cobro_activo: isAuthorized,
        auto_renovacion: isAuthorized,
      })
      .eq("mp_preapproval_id", preapproval_id);

    return new Response(
      JSON.stringify({ ok: true, status: pa.status, authorized: isAuthorized }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("sync-mp-preapproval error:", err);
    return new Response(
      JSON.stringify({ error: "Error interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
