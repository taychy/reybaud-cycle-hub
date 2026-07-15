// Inscripción pública a un programa (cohort_slug + landing_public = true).
// Crea/encuentra alumno, crea suscripción pendiente y devuelve init_point de MP.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveCuentaMP } from "../_shared/resolve-cuenta-mp.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface EnrollPayload {
  cohort_slug: string;
  nombre: string;
  apellido: string;
  email: string;
  telefono?: string;
  modo_pago: "contado" | "cuotas";
}

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResp({ error: "Method not allowed" }, 405);

  try {
    const raw = (await req.json()) as Partial<EnrollPayload>;
    const nombre = String(raw.nombre ?? "").trim();
    const apellido = String(raw.apellido ?? "").trim();
    const email = String(raw.email ?? "").trim().toLowerCase();
    const telefono = String(raw.telefono ?? "").trim() || null;
    const cohort_slug = String(raw.cohort_slug ?? "").trim();
    const modo_pago = raw.modo_pago === "cuotas" ? "cuotas" : "contado";

    if (!nombre || !apellido || !email || !cohort_slug) {
      return jsonResp({ error: "Faltan datos obligatorios" }, 400);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return jsonResp({ error: "Email inválido" }, 400);
    }
    if (nombre.length > 80 || apellido.length > 80 || email.length > 255) {
      return jsonResp({ error: "Datos demasiado largos" }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1) Buscar el plan
    const { data: plan, error: planErr } = await admin
      .from("planes")
      .select("id, nombre, moneda, max_inscripciones, inscripciones_actuales, fecha_cierre_inscripcion, landing_public, activo")
      .eq("cohort_slug", cohort_slug)
      .maybeSingle();

    if (planErr || !plan) return jsonResp({ error: "Programa no encontrado" }, 404);
    if (!plan.activo || !plan.landing_public) return jsonResp({ error: "Programa no disponible" }, 400);

    // Cierre de inscripciones
    const today = new Date().toISOString().slice(0, 10);
    if (plan.fecha_cierre_inscripcion && today > plan.fecha_cierre_inscripcion) {
      return jsonResp({ error: "Las inscripciones a este programa están cerradas." }, 400);
    }

    // Cupos
    if (plan.max_inscripciones != null && (plan.inscripciones_actuales ?? 0) >= plan.max_inscripciones) {
      return jsonResp({ error: "No quedan cupos disponibles" }, 409);
    }

    // 2) Precio vigente
    const { data: stage, error: stageErr } = await admin.rpc("get_plan_current_price", { _plan_id: plan.id });
    const currentStage = Array.isArray(stage) ? stage[0] : null;
    if (stageErr || !currentStage) return jsonResp({ error: "No hay un tramo de precio vigente hoy" }, 400);

    const precio_final = modo_pago === "cuotas" && currentStage.precio_cuota
      ? Number(currentStage.precio_cuota) * Number(currentStage.cuotas_cantidad ?? 1)
      : Number(currentStage.precio);
    const unit_price = modo_pago === "cuotas" && currentStage.precio_cuota
      ? Number(currentStage.precio_cuota)
      : Number(currentStage.precio);
    const cuotas = modo_pago === "cuotas" ? Number(currentStage.cuotas_cantidad ?? 1) : 1;

    // 3) Buscar o crear alumno por email
    const { data: existing } = await admin
      .from("alumnos")
      .select("id, nombre, apellido, telefono, origen_cohort")
      .eq("email", email)
      .maybeSingle();

    let alumnoId: string;
    if (existing) {
      alumnoId = existing.id;
      // Solo completar campos vacíos + marcar cohort si no tenía
      const patch: Record<string, unknown> = {};
      if (!existing.telefono && telefono) patch.telefono = telefono;
      if (!existing.origen_cohort) {
        patch.origen_cohort = cohort_slug;
        patch.origen_cohort_fecha = new Date().toISOString();
      }
      if (Object.keys(patch).length > 0) {
        await admin.from("alumnos").update(patch).eq("id", alumnoId);
      }
    } else {
      const { data: nuevo, error: insErr } = await admin
        .from("alumnos")
        .insert({
          nombre,
          apellido,
          email,
          telefono,
          grupo: "Iniciación",
          estado: "pendiente",
          origen_cohort: cohort_slug,
          origen_cohort_fecha: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (insErr || !nuevo) {
        console.error("[enroll-programa] insert alumno", insErr);
        return jsonResp({ error: "No se pudo registrar el alumno" }, 500);
      }
      alumnoId = nuevo.id;
    }

    // 4) Evitar suscripción activa duplicada al mismo plan
    const { data: existSub } = await admin
      .from("suscripciones")
      .select("id, estado")
      .eq("alumno_id", alumnoId)
      .eq("plan_id", plan.id)
      .in("estado", ["activa", "pendiente_pago", "pendiente"])
      .maybeSingle();

    let suscripcionId: string;
    if (existSub) {
      suscripcionId = existSub.id;
    } else {
      const { data: nuevaSub, error: subErr } = await admin
        .from("suscripciones")
        .insert({
          alumno_id: alumnoId,
          plan_id: plan.id,
          estado: "pendiente_pago",
          precio_base: Number(currentStage.precio),
          precio_final,
          metodo_pago: "mercado_pago",
          origen_registro: "landing_publica",
          notas: `Inscripción vía landing pública. Tramo: ${currentStage.stage_nombre}. Modo: ${modo_pago}${cuotas > 1 ? ` (${cuotas} cuotas de $${unit_price})` : ""}.`,
        })
        .select("id")
        .single();
      if (subErr || !nuevaSub) {
        console.error("[enroll-programa] insert suscripcion", subErr);
        return jsonResp({ error: "No se pudo crear la inscripción" }, 500);
      }
      suscripcionId = nuevaSub.id;
    }

    // 5) MP preference
    const cuenta = await resolveCuentaMP(admin, { unidad_negocio: "suscripcion_escuela" });
    if (!cuenta.access_token) return jsonResp({ error: "Mercado Pago no está configurado" }, 500);

    const origin = req.headers.get("origin") || "https://reybaud-cycle-hub.lovable.app";
    const prefBody = {
      items: [
        {
          title: `${plan.nombre} — ${currentStage.stage_nombre}${cuotas > 1 ? ` (${cuotas} cuotas)` : ""}`,
          quantity: cuotas,
          unit_price,
          currency_id: plan.moneda || "ARS",
        },
      ],
      payer: { name: `${nombre} ${apellido}`.trim(), email },
      back_urls: {
        success: `${origin}/pago-resultado?status=approved&programa=1`,
        failure: `${origin}/pago-resultado?status=failure&programa=1`,
        pending: `${origin}/pago-resultado?status=pending&programa=1`,
      },
      auto_return: "approved",
      external_reference: suscripcionId,
      notification_url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/mp-webhook${cuenta.slug ? `?cuenta=${cuenta.slug}` : ""}`,
      statement_descriptor: "CICLISMO REYBAUD",
    };

    const mpRes = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cuenta.access_token}`,
      },
      body: JSON.stringify(prefBody),
    });
    if (!mpRes.ok) {
      const errText = await mpRes.text();
      console.error("[enroll-programa] MP error", errText);
      return jsonResp({ error: "No se pudo generar el link de pago" }, 502);
    }
    const pref = await mpRes.json();

    await admin
      .from("suscripciones")
      .update({ mp_preference_id: pref.id })
      .eq("id", suscripcionId);

    return jsonResp({
      ok: true,
      init_point: pref.init_point || pref.sandbox_init_point,
      preference_id: pref.id,
      suscripcion_id: suscripcionId,
      alumno_id: alumnoId,
    });
  } catch (e) {
    console.error("[enroll-programa] fatal", e);
    return jsonResp({ error: "Error interno" }, 500);
  }
});
