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

const SENDER_DOMAIN = "notify.reybaud-app.com";
const FROM_NAME = "Reybaud Ciclismo";
const APP_DOMAIN = "https://reybaud-app.com";

const escapeHtml = (s: string) =>
  String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function getOrCreateUnsubscribeToken(admin: any, email: string): Promise<string> {
  const normalized = email.trim().toLowerCase();
  const { data: existing } = await admin
    .from("email_unsubscribe_tokens")
    .select("token")
    .eq("email", normalized)
    .maybeSingle();
  if (existing?.token) return existing.token;
  const newToken = crypto.randomUUID();
  const { data: inserted } = await admin
    .from("email_unsubscribe_tokens")
    .insert({ email: normalized, token: newToken })
    .select("token")
    .maybeSingle();
  return inserted?.token || newToken;
}

async function generateMagicLink(admin: any, email: string): Promise<string | null> {
  try {
    const { data, error } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo: `${APP_DOMAIN}/alumno` },
    });
    if (error) { console.error("[enroll-programa] magiclink", error); return null; }
    return (data?.properties?.action_link as string) || null;
  } catch (e) {
    console.error("[enroll-programa] magiclink ex", e);
    return null;
  }
}

async function enqueueEnrollmentEmail(admin: any, params: {
  toEmail: string;
  alumnoNombre: string;
  planNombre: string;
  fechaInicio: string | null;
  monto: number;
  moneda: string;
  metodo: "transferencia" | "mp";
  pagoConfirmado: boolean;
  addedAsSecondary: boolean;
  primaryEmail: string;
  suscripcionId: string;
}): Promise<void> {
  try {
    const magic = await generateMagicLink(admin, params.toEmail);
    const unsub = await getOrCreateUnsubscribeToken(admin, params.toEmail);
    const messageId = crypto.randomUUID();
    const monedaSym = params.moneda === "USD" ? "USD " : params.moneda === "EUR" ? "EUR " : "$";
    const montoFmt = `${monedaSym}${Number(params.monto || 0).toLocaleString("es-AR")}`;
    const estadoTxt = params.pagoConfirmado
      ? "Tu inscripción quedó confirmada."
      : params.metodo === "transferencia"
      ? "Recibimos tu comprobante de transferencia. En las próximas horas lo validamos y te confirmamos por email."
      : "Estamos procesando tu pago con Mercado Pago. Te confirmamos cuando se acredite.";
    const inicioTxt = params.fechaInicio ? `Inicio: <strong>${escapeHtml(params.fechaInicio)}</strong><br/>` : "";
    const secondaryNotice = params.addedAsSecondary
      ? `<div style="background:#fff7e6;border:1px solid #ffd591;border-radius:8px;padding:12px;margin:16px 0;font-size:13px;color:#873800;">
          Detectamos que ya tenías una ficha con <strong>${escapeHtml(params.primaryEmail)}</strong>. Vinculamos esta inscripción a esa ficha para que no se dupliquen tus datos. Podés iniciar sesión con cualquiera de los dos emails.
        </div>`
      : "";
    const magicBtn = magic
      ? `<div style="margin:24px 0;text-align:center;">
          <a href="${escapeHtml(magic)}" style="display:inline-block;background:#f97316;color:#fff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:600;">Ingresar a la app</a>
          <div style="font-size:11px;color:#888;margin-top:8px;">El enlace vence en 1 hora. Si expiró, iniciá sesión desde la app con tu email.</div>
        </div>`
      : "";

    const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
      <div style="max-width:600px;margin:0 auto;background:#fff;padding:32px 28px;">
        <h1 style="color:#f97316;margin:0 0 16px;font-size:24px;">¡Bienvenido/a al programa!</h1>
        <p style="font-size:15px;color:#333;line-height:1.5;">Hola ${escapeHtml(params.alumnoNombre)},</p>
        <p style="font-size:15px;color:#333;line-height:1.5;">${estadoTxt}</p>
        ${secondaryNotice}
        <div style="border:1px solid #eee;border-radius:10px;padding:16px 18px;margin:16px 0;background:#fafafa;">
          <div style="font-size:12px;color:#888;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">Programa</div>
          <div style="font-size:16px;font-weight:700;color:#121212;margin-bottom:12px;">${escapeHtml(params.planNombre)}</div>
          ${inicioTxt}
          Método de pago: <strong>${params.metodo === "transferencia" ? "Transferencia" : "Mercado Pago"}</strong><br/>
          Monto: <strong>${escapeHtml(montoFmt)}</strong>
        </div>
        ${magicBtn}
        <p style="font-size:13px;color:#666;line-height:1.5;">Cualquier duda respondé este email.</p>
        <p style="font-size:13px;color:#666;line-height:1.5;">— Equipo Reybaud</p>
      </div>
    </body></html>`;

    const text = `Hola ${params.alumnoNombre},\n\n${estadoTxt}\n\nPrograma: ${params.planNombre}\nMétodo: ${params.metodo}\nMonto: ${montoFmt}\n\n${magic ? `Ingresar a la app: ${magic}\n` : ""}— Equipo Reybaud`;
    const subject = params.pagoConfirmado
      ? `Inscripción confirmada · ${params.planNombre}`
      : `Recibimos tu inscripción · ${params.planNombre}`;

    await admin.rpc("enqueue_email", {
      queue_name: "transactional_emails",
      payload: {
        message_id: messageId,
        to: params.toEmail,
        from: `${FROM_NAME} <programas@${SENDER_DOMAIN}>`,
        sender_domain: SENDER_DOMAIN,
        subject,
        html,
        text,
        purpose: "transactional",
        label: "programa_inscripcion",
        idempotency_key: `programa-inscripcion-${params.suscripcionId}`,
        unsubscribe_token: unsub,
        queued_at: new Date().toISOString(),
      },
    });
  } catch (e) {
    console.error("[enroll-programa] enqueue email", e);
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
      .select("id, nombre, moneda, max_inscripciones, inscripciones_actuales, fecha_cierre_inscripcion, landing_public, activo, fecha_inicio_programa")
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

    // 5) Deuda de la cuota 2.
    // NO se crea un ajuste en cuenta_ajustes: la deuda del programa ya se calcula
    // como (suscripciones.precio_final − pagos imputados a la suscripción), y
    // precio_final ya incluye TODAS las cuotas. Un cargo extra duplicaría la deuda.
    // El vencimiento de la cuota 2 queda registrado en las notas de la suscripción.


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

      await enqueueEnrollmentEmail(admin, {
        toEmail: email,
        alumnoNombre: `${nombre} ${apellido}`.trim(),
        planNombre: plan.nombre,
        fechaInicio: (plan as any).fecha_inicio_programa || null,
        monto: montoHoy,
        moneda: plan.moneda || "ARS",
        metodo: "transferencia",
        pagoConfirmado: false,
        addedAsSecondary,
        primaryEmail: alumnoPrimaryEmail,
        suscripcionId,
      });

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

    await enqueueEnrollmentEmail(admin, {
      toEmail: email,
      alumnoNombre: `${nombre} ${apellido}`.trim(),
      planNombre: plan.nombre,
      fechaInicio: (plan as any).fecha_inicio_programa || null,
      monto: montoHoy,
      moneda: plan.moneda || "ARS",
      metodo: "mp",
      pagoConfirmado: false,
      addedAsSecondary,
      primaryEmail: alumnoPrimaryEmail,
      suscripcionId,
    });

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
