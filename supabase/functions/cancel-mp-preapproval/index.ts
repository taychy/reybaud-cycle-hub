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
    // Authn: require JWT
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const jwt = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(jwt);
    const uid = claimsData?.claims?.sub;
    if (claimsErr || !uid) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { suscripcion_id } = await req.json();

    if (!suscripcion_id) {
      return new Response(
        JSON.stringify({ error: "Falta suscripcion_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Authz: caller must own the subscription (via alumnos.user_id) or be admin
    const { data: isAdmin } = await supabaseAdmin.rpc("has_role", { _user_id: uid, _role: "admin" });
    if (!isAdmin) {
      const { data: subOwner } = await supabaseAdmin
        .from("suscripciones")
        .select("alumno_id, alumnos:alumno_id(user_id)")
        .eq("id", suscripcion_id)
        .maybeSingle();
      const ownerUserId = (subOwner as any)?.alumnos?.user_id;
      if (!ownerUserId || ownerUserId !== uid) {
        return new Response(
          JSON.stringify({ error: "Forbidden" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const { data: sub, error: subErr } = await supabaseAdmin
      .from("suscripciones")
      .select("id, mp_preapproval_id, auto_cobro_activo, cuenta_mp_id")
      .eq("id", suscripcion_id)
      .single();

    if (subErr || !sub) {
      return new Response(
        JSON.stringify({ error: "Suscripción no encontrada" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!sub.mp_preapproval_id) {
      // Nothing to cancel on MP side, just flip the flags
      await supabaseAdmin
        .from("suscripciones")
        .update({ auto_cobro_activo: false, auto_renovacion: false })
        .eq("id", suscripcion_id);

      return new Response(
        JSON.stringify({ ok: true, already_disabled: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Resolver token: primero el de la cuenta de la sub, luego routing, luego legacy
    let token = "";
    if (sub.cuenta_mp_id) {
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

    const mpRes = await fetch(
      `https://api.mercadopago.com/preapproval/${sub.mp_preapproval_id}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: "cancelled" }),
      }
    );

    const mpData = await mpRes.json().catch(() => ({}));
    console.log("[cancel-mp-preapproval]", {
      id: sub.mp_preapproval_id,
      ok: mpRes.ok,
      status: mpData?.status,
    });

    // Even if MP returns 404 (already gone), we still disable locally
    await supabaseAdmin
      .from("suscripciones")
      .update({
        auto_cobro_activo: false,
        auto_renovacion: false,
        mp_preapproval_status: mpData?.status || "cancelled",
      })
      .eq("id", suscripcion_id);

    return new Response(
      JSON.stringify({ ok: true, mp_status: mpData?.status }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("cancel-mp-preapproval error:", err);
    return new Response(
      JSON.stringify({ error: "Error interno al cancelar renovación automática" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
