// Inscripción pública a un programa (cohort_slug + landing_public = true).
// Soporta 2 métodos de pago (MP / transferencia) y 2 modalidades (contado / cuotas).
// Para 2 cuotas: hoy se cobra la cuota 1 y la cuota 2 queda como deuda en cuenta corriente (vence a 30 días).
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
  metodo_pago_inicial: "mp" | "transferencia";
  comprobante_base64?: string | null;
  comprobante_filename?: string | null;
  comprobante_mime?: string | null;
}

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function addDaysISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

function extFromMime(mime: string | null | undefined, filename?: string | null): string {
  if (filename && filename.includes(".")) return filename.split(".").pop()!.toLowerCase();
  switch ((mime ?? "").toLowerCase()) {
    case "image/jpeg": return "jpg";
    case "image/png": return "png";
    case "image/webp": return "webp";
    case "application/pdf": return "pdf";
    default: return "bin";
  }
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
    const metodo_pago_inicial = raw.metodo_pago_inicial === "transferencia" ? "transferencia" : "mp";

    if (!nombre || !apellido || !email || !cohort_slug) {
      return jsonResp({ error: "Faltan datos obligatorios" }, 400);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return jsonResp({ error: "Email inválido" }, 400);
    }
    if (nombre.length > 80 || apellido.length > 80 || email.length > 255) {
      return jsonResp({ error: "Datos demasiado largos" }, 400);
    }
    if (metodo_pago_inicial === "transferencia" && !raw.comprobante_base64) {
      return jsonResp({ error: "Adjuntá el comprobante de transferencia" }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1) Plan
    const { data: plan, error: planErr } = await admin
      .from("planes")
      .select("id, nombre, moneda, max_inscripciones, inscripciones_actuales, fecha_cierre_inscripcion, landing_public, activo")
      .eq("cohort_slug", cohort_slug)
      .maybeSingle();

    if (planErr || !plan) return jsonResp({ error: "Programa no encontrado" }, 404);
    if (!plan.activo || !plan.landing_public) return jsonResp({ error: "Programa no disponible" }, 400);

    const today = new Date().toISOString().slice(0, 10);
    if (plan.fecha_cierre_inscripcion && today > plan.fecha_cierre_inscripcion) {
      return jsonResp({ error: "Las inscripciones a este programa están cerradas." }, 400);
    }
    if (plan.max_inscripciones != null && (plan.inscripciones_actuales ?? 0) >= plan.max_inscripciones) {
      return jsonResp({ error: "No quedan cupos disponibles" }, 409);
    }

    // 2) Precio vigente
    const { data: stage, error: stageErr } = await admin.rpc("get_plan_current_price", { _plan_id: plan.id });
    const currentStage = Array.isArray(stage) ? stage[0] : null;
    if (stageErr || !currentStage) return jsonResp({ error: "No hay un tramo de precio vigente hoy" }, 400);

    const precioContado = Number(currentStage.precio);
    const precioCuota = currentStage.precio_cuota ? Number(currentStage.precio_cuota) : null;
    const cuotasCantidad = Number(currentStage.cuotas_cantidad ?? 1);
    const esCuotas = modo_pago === "cuotas" && precioCuota && cuotasCantidad > 1;

    // Precio_final = total a cobrar en TODO el programa (no cambia por modalidad).
    const precio_final = esCuotas ? precioCuota! * cuotasCantidad : precioContado;
    // Monto a cobrar HOY.
    const montoHoy = esCuotas ? precioCuota! : precioContado;
    // Monto que queda como deuda futura.
    const deudaCuota2 = esCuotas ? precioCuota! : 0;
    const vencimientoCuota2 = esCuotas ? addDaysISO(30) : null;

    // 3) Alumno — matchear por email primario o emails_adicionales
    const emailLower = email.toLowerCase();
    const { data: existingList } = await admin
      .from("alumnos")
      .select("id, nombre, apellido, telefono, origen_cohort, email, emails_adicionales, estado")
      .or(`email.eq.${emailLower},emails_adicionales.cs.{${emailLower}}`)
      .neq("estado", "fusionada")
      .limit(1);
    const existing = existingList?.[0] ?? null;

    let alumnoId: string;
    let alumnoPrimaryEmail = email;
    let addedAsSecondary = false;
    if (existing) {
      alumnoId = existing.id;
      alumnoPrimaryEmail = existing.email || email;
      const patch: Record<string, unknown> = {};
      if (!existing.telefono && telefono) patch.telefono = telefono;
      if (!existing.origen_cohort) {
        patch.origen_cohort = cohort_slug;
        patch.origen_cohort_fecha = new Date().toISOString();
      }
      // Si se inscribió con un email distinto al primario y no está en secundarios, agregarlo
      const extras: string[] = Array.isArray(existing.emails_adicionales) ? existing.emails_adicionales : [];
      const alreadyKnown = existing.email?.toLowerCase() === emailLower
        || extras.some((e) => e?.toLowerCase() === emailLower);
      if (!alreadyKnown) {
        patch.emails_adicionales = [...extras, email];
        addedAsSecondary = true;
      }
      if (Object.keys(patch).length > 0) {
        await admin.from("alumnos").update(patch).eq("id", alumnoId);
      }
    } else {
      const { data: nuevo, error: insErr } = await admin
        .from("alumnos")
        .insert({
          nombre, apellido, email, telefono,
          grupo: "Aspirantes",
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


    // 4) Sub existente o nueva
    const { data: existSub } = await admin
      .from("suscripciones")
      .select("id, estado")
      .eq("alumno_id", alumnoId)
      .eq("plan_id", plan.id)
      .in("estado", ["activa", "pendiente_pago", "pendiente", "pendiente_verificacion"])
      .maybeSingle();

    const modalidadNota = esCuotas
      ? ` (${cuotasCantidad} cuotas de $${precioCuota}; hoy cuota 1, cuota 2 vence ${vencimientoCuota2})`
      : "";
    const metodoLabel = metodo_pago_inicial === "transferencia" ? "transferencia" : "mercado_pago";
    const notasSub = `Inscripción landing pública. Tramo: ${currentStage.stage_nombre}. Modo: ${modo_pago}${modalidadNota}. Método: ${metodoLabel}.`;

    let suscripcionId: string;
    if (existSub) {
      suscripcionId = existSub.id;
      await admin
        .from("suscripciones")
        .update({
          estado: metodo_pago_inicial === "transferencia" ? "pendiente_verificacion" : "pendiente_pago",
          precio_base: precioContado,
          precio_final,
          metodo_pago: metodoLabel,
          origen_registro: metodo_pago_inicial === "transferencia" ? "informado_alumno" : "landing_publica",
          notas: notasSub,
        })
        .eq("id", suscripcionId);
    } else {
      const { data: nuevaSub, error: subErr } = await admin
        .from("suscripciones")
        .insert({
          alumno_id: alumnoId,
          plan_id: plan.id,
          estado: metodo_pago_inicial === "transferencia" ? "pendiente_verificacion" : "pendiente_pago",
          precio_base: precioContado,
          precio_final,
          metodo_pago: metodoLabel,
          origen_registro: metodo_pago_inicial === "transferencia" ? "informado_alumno" : "landing_publica",
          notas: notasSub,
        })
        .select("id")
        .single();
      if (subErr || !nuevaSub) {
        console.error("[enroll-programa] insert suscripcion", subErr);
        return jsonResp({ error: "No se pudo crear la inscripción" }, 500);
      }
      suscripcionId = nuevaSub.id;
    }

    // 5) Registrar deuda cuota 2 (idempotente vía referencia_externa).
    if (esCuotas && deudaCuota2 > 0 && vencimientoCuota2) {
      const refExterna = `FORMACION_CUOTA2:${suscripcionId}`;
      const { data: existAjuste } = await admin
        .from("cuenta_ajustes")
        .select("id")
        .eq("referencia_externa", refExterna)
        .maybeSingle();
      if (!existAjuste) {
        const { error: ajErr } = await admin.from("cuenta_ajustes").insert({
          alumno_id: alumnoId,
          tipo: "deuda",
          concepto: `Cuota 2 · ${plan.nombre}`,
          monto: deudaCuota2,
          moneda: plan.moneda || "ARS",
          fecha: vencimientoCuota2,
          notas: `Vence el ${vencimientoCuota2}. Segunda cuota del programa (inscripción landing).`,
          referencia_externa: refExterna,
          aplicado_a_fuente_tabla: "suscripciones",
          aplicado_a_fuente_id: suscripcionId,
        });
        if (ajErr) console.error("[enroll-programa] insert cuenta_ajustes cuota 2", ajErr);
      }
    }

    // ─────────── FLUJO TRANSFERENCIA ───────────
    if (metodo_pago_inicial === "transferencia") {
      // Subir comprobante al bucket payment-proofs
      const bytes = base64ToBytes(String(raw.comprobante_base64));
      const ext = extFromMime(raw.comprobante_mime, raw.comprobante_filename);
      const path = `formacion-inicial/${suscripcionId}/${Date.now()}.${ext}`;
      const { error: upErr } = await admin.storage
        .from("payment-proofs")
        .upload(path, bytes, {
          contentType: raw.comprobante_mime || "application/octet-stream",
          upsert: true,
        });
      if (upErr) {
        console.error("[enroll-programa] upload comprobante", upErr);
        return jsonResp({ error: "No se pudo subir el comprobante" }, 500);
      }

      // Registrar la referencia del comprobante en la sub (via notas complementarias)
      await admin
        .from("suscripciones")
        .update({
          notas: `${notasSub} | Comprobante: ${path}`,
        })
        .eq("id", suscripcionId);

      // Notificar admin (email + evento admin_notification_events)
      try {
        await admin.from("admin_notification_events").insert({
          tipo: "programa_transferencia_pendiente",
          prioridad: "alta",
          payload: {
            suscripcion_id: suscripcionId,
            alumno_id: alumnoId,
            plan_id: plan.id,
            plan_nombre: plan.nombre,
            monto: montoHoy,
            modo_pago,
            comprobante_path: path,
            alumno_nombre: `${nombre} ${apellido}`.trim(),
            alumno_email: email,
          },
          deduplication_key: `programa-transf-${suscripcionId}-${Date.now()}`,
        });
      } catch (e) {
        console.error("[enroll-programa] admin_notification_events", e);
      }

      // Reusar notify-cash-payment para el email al admin
      try {
        const fnUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/notify-cash-payment`;
        await fetch(fnUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "",
            authorization: `Bearer ${Deno.env.get("SUPABASE_ANON_KEY") ?? ""}`,
          },
          body: JSON.stringify({
            alumno_id: alumnoId,
            plan_id: plan.id,
            suscripcion_id: suscripcionId,
            payment_type: "transferencia",
          }),
        });
      } catch (e) {
        console.error("[enroll-programa] notify-cash-payment fetch", e);
      }

      return jsonResp({
        ok: true,
        mode: "transfer",
        suscripcion_id: suscripcionId,
        alumno_id: alumnoId,
      });
    }

    // ─────────── FLUJO MERCADO PAGO ───────────
    const cuenta = await resolveCuentaMP(admin, { unidad_negocio: "suscripcion_escuela" });
    if (!cuenta.access_token) return jsonResp({ error: "Mercado Pago no está configurado" }, 500);

    const origin = req.headers.get("origin") || "https://reybaud-cycle-hub.lovable.app";
    const itemTitle = esCuotas
      ? `${plan.nombre} — ${currentStage.stage_nombre} (Cuota 1 de ${cuotasCantidad})`
      : `${plan.nombre} — ${currentStage.stage_nombre}`;
    const prefBody: Record<string, unknown> = {
      items: [
        {
          title: itemTitle,
          quantity: 1,
          unit_price: montoHoy,
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
      mode: "mp",
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
