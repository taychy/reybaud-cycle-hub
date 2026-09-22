import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendLegacyEmailPayload } from '../_shared/send-managed-email.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Fase 2: el webhook resuelve qué token MP usar según el query param `?cuenta=<slug>`
// que las create-mp-* incluyen en el notification_url. Si no viene, prueba con
// cada cuenta activa hasta que MP responda OK, y como último fallback usa
// MP_ACCESS_TOKEN legacy. Devuelve { token, slug } para auditoría.
async function resolveWebhookToken(
  supabaseAdmin: ReturnType<typeof createClient>,
  cuentaSlug: string | null,
  fetchUrl: string,
): Promise<{ token: string; slug: string | null; data: any | null; ok: boolean }> {
  const legacy = Deno.env.get("MP_ACCESS_TOKEN") ?? "";

  // 1) Slug explícito desde notification_url
  if (cuentaSlug) {
    const { data: c } = await supabaseAdmin
      .from("cuentas_mp")
      .select("slug, secret_name_token")
      .eq("slug", cuentaSlug)
      .eq("activa", true)
      .maybeSingle();
    if (c?.secret_name_token) {
      const tok = Deno.env.get(c.secret_name_token);
      if (tok) {
        const r = await fetch(fetchUrl, { headers: { Authorization: `Bearer ${tok}` } });
        if (r.ok) return { token: tok, slug: c.slug, data: await r.json(), ok: true };
        console.warn(`[mp-webhook] token de ${c.slug} devolvió ${r.status}, intento fallback`);
      }
    }
  }

  // 2) Probar cada cuenta activa
  const { data: cuentas } = await supabaseAdmin
    .from("cuentas_mp")
    .select("slug, secret_name_token")
    .eq("activa", true);
  for (const c of cuentas ?? []) {
    if (!c.secret_name_token) continue;
    if (cuentaSlug && c.slug === cuentaSlug) continue; // ya probado
    const tok = Deno.env.get(c.secret_name_token);
    if (!tok) continue;
    const r = await fetch(fetchUrl, { headers: { Authorization: `Bearer ${tok}` } });
    if (r.ok) return { token: tok, slug: c.slug, data: await r.json(), ok: true };
  }

  // 3) Legacy
  if (legacy) {
    const r = await fetch(fetchUrl, { headers: { Authorization: `Bearer ${legacy}` } });
    if (r.ok) return { token: legacy, slug: null, data: await r.json(), ok: true };
  }

  return { token: legacy, slug: null, data: null, ok: false };
}

const normalizeEmail = (value: unknown) =>
  String(value ?? "").trim().toLowerCase();

const normalizeDigits = (value: unknown) =>
  String(value ?? "").replace(/\D/g, "");

const documentKeys = (value: unknown): string[] => {
  const digits = normalizeDigits(value);
  if (!digits) return [];
  const keys = new Set<string>([digits]);
  if (digits.length === 11) {
    const dni8 = digits.slice(2, 10);
    keys.add(dni8);
    keys.add(dni8.replace(/^0+/, ""));
  } else if (digits.length <= 8) {
    keys.add(digits.padStart(8, "0"));
    keys.add(digits.replace(/^0+/, ""));
  }
  return [...keys].filter(Boolean);
};

const normalizeName = (value: unknown) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");

const extractPayerName = (p: any): string | null => {
  const direct = [p?.payer?.first_name, p?.payer?.last_name].filter(Boolean).join(" ").trim();
  if (direct) return direct;
  const extra = [p?.additional_info?.payer?.first_name, p?.additional_info?.payer?.last_name]
    .filter(Boolean).join(" ").trim();
  if (extra) return extra;
  const cardholder = p?.card?.cardholder?.name;
  return cardholder ? String(cardholder).trim() || null : null;
};

async function persistMpAccountMovement(
  supabaseAdmin: ReturnType<typeof createClient>,
  payment: any,
  resolved: { token: string; slug: string | null },
) {
  if (!payment?.id || !resolved.slug) return { stored: false, reason: "account_not_resolved" };

  const { data: cuenta } = await supabaseAdmin
    .from("cuentas_mp")
    .select("id, slug")
    .eq("slug", resolved.slug)
    .maybeSingle();
  if (!cuenta?.id) return { stored: false, reason: "account_not_found" };

  let ownEmail = "";
  let ownDocument = "";
  let ownName = "";
  try {
    const meResp = await fetch("https://api.mercadopago.com/users/me", {
      headers: { Authorization: `Bearer ${resolved.token}` },
    });
    if (meResp.ok) {
      const me = await meResp.json();
      ownEmail = normalizeEmail(me?.email);
      ownDocument = normalizeDigits(me?.identification?.number);
      ownName = normalizeName([me?.first_name, me?.last_name].filter(Boolean).join(" "));
    }
  } catch (e) {
    console.warn("[mp-webhook] no se pudo leer /users/me", (e as Error).message);
  }

  const rawEmail = normalizeEmail(payment?.payer?.email ?? payment?.additional_info?.payer?.email);
  const rawDocumentValue =
    payment?.payer?.identification?.number ??
    payment?.additional_info?.payer?.identification?.number ??
    null;
  const rawDocument = normalizeDigits(rawDocumentValue);
  const rawNameValue = extractPayerName(payment);
  const rawName = normalizeName(rawNameValue);

  const payerEmail = rawEmail && rawEmail !== ownEmail ? rawEmail : null;
  const payerDocument = rawDocument && rawDocument !== ownDocument
    ? String(rawDocumentValue).trim()
    : null;
  const payerName = rawNameValue && (!ownName || rawName !== ownName)
    ? rawNameValue
    : null;

  const mpId = String(payment.id);
  let reservationPaymentId: string | null = null;
  let suscripcionId: string | null = null;
  let alumnoId: string | null = null;

  const { data: rp } = await supabaseAdmin
    .from("reservation_payments")
    .select("id, alumno_id")
    .eq("mp_payment_id", mpId)
    .maybeSingle();
  if (rp) {
    reservationPaymentId = rp.id;
    alumnoId = rp.alumno_id ?? null;
  } else {
    const { data: sub } = await supabaseAdmin
      .from("suscripciones")
      .select("id, alumno_id")
      .eq("mp_payment_id", mpId)
      .maybeSingle();
    if (sub) {
      suscripcionId = sub.id;
      alumnoId = sub.alumno_id ?? null;
    }
  }

  // Transferencias directas suelen no tener external_reference. En ese caso
  // resolvemos identidad con señales fuertes y sólo si la coincidencia es única.
  if (!alumnoId && (payerDocument || payerEmail || payerName)) {
    const { data: alumnos } = await supabaseAdmin
      .from("alumnos")
      .select("id, email, emails_adicionales, documento, nombres_bancarios");

    const matches = new Set<string>();
    const payerDocKeys = new Set(documentKeys(payerDocument));
    const payerEmailNorm = normalizeEmail(payerEmail);
    const payerNameNorm = normalizeName(payerName);

    for (const a of alumnos ?? []) {
      let matched = false;

      if (payerDocKeys.size > 0) {
        matched = documentKeys((a as any).documento).some((key) => payerDocKeys.has(key));
      }

      if (!matched && payerEmailNorm) {
        const emails = [(a as any).email, ...((a as any).emails_adicionales ?? [])]
          .map(normalizeEmail)
          .filter(Boolean);
        matched = emails.includes(payerEmailNorm);
      }

      if (!matched && payerNameNorm) {
        const bankNames = ((a as any).nombres_bancarios ?? [])
          .map(normalizeName)
          .filter(Boolean);
        matched = bankNames.includes(payerNameNorm);
      }

      if (matched) matches.add((a as any).id);
    }

    if (matches.size === 1) alumnoId = [...matches][0];
  }

  const feeAmount = Array.isArray(payment?.fee_details)
    ? payment.fee_details.reduce((sum: number, fee: any) => sum + Number(fee?.amount ?? 0), 0)
    : null;

  const row: Record<string, unknown> = {
    cuenta_mp_id: cuenta.id,
    mp_payment_id: mpId,
    tipo: "payment",
    direccion: "ingreso",
    status: payment?.status ?? null,
    status_detail: payment?.status_detail ?? null,
    payment_method: payment?.payment_method_id ?? null,
    payment_type: payment?.payment_type_id ?? null,
    amount: Number(payment?.transaction_amount ?? 0),
    net_received: payment?.transaction_details?.net_received_amount != null
      ? Number(payment.transaction_details.net_received_amount)
      : null,
    fee_amount: feeAmount,
    currency: payment?.currency_id ?? "ARS",
    description: payment?.description ?? null,
    payer_email: payerEmail,
    payer_name: payerName,
    payer_document: payerDocument,
    external_reference: payment?.external_reference ?? null,
    fecha_movimiento: payment?.date_created ?? new Date().toISOString(),
    raw: payment,
    alumno_id: alumnoId,
    reservation_payment_id: reservationPaymentId,
    suscripcion_id: suscripcionId,
  };

  const { data: existing } = await supabaseAdmin
    .from("mp_account_movements")
    .select("id, alumno_id, reservation_payment_id, suscripcion_id, assigned_manually, payer_name, payer_email, payer_document, raw")
    .eq("cuenta_mp_id", cuenta.id)
    .eq("mp_payment_id", mpId)
    .maybeSingle();

  if (existing) {
    const existingRaw = existing.raw && typeof existing.raw === "object"
      ? existing.raw as Record<string, unknown>
      : {};
    const settlementReport = (existingRaw as any)?.settlement_report ?? null;

    if (settlementReport) {
      row.raw = { ...payment, settlement_report: settlementReport };
      const isTransfer = ["account_money", "cvu", "bank_transfer", "bank_transfer_in"].includes(
        String(payment?.payment_method_id ?? payment?.payment_type_id ?? "").toLowerCase(),
      );
      if (isTransfer) {
        // No degradar la identidad que ya llegó del reporte de conciliación.
        delete row.payer_name;
        delete row.payer_email;
        delete row.payer_document;
        if (!reservationPaymentId && !suscripcionId) delete row.alumno_id;
      }
    }

    if (existing.assigned_manually) {
      delete row.alumno_id;
      delete row.reservation_payment_id;
      delete row.suscripcion_id;
    } else {
      if ("alumno_id" in row) row.alumno_id = alumnoId ?? existing.alumno_id ?? null;
      row.reservation_payment_id = reservationPaymentId ?? existing.reservation_payment_id ?? null;
      row.suscripcion_id = suscripcionId ?? existing.suscripcion_id ?? null;
    }
    const { error } = await supabaseAdmin
      .from("mp_account_movements")
      .update(row)
      .eq("id", existing.id);
    if (error) throw error;
    return { stored: true, updated: true, alumno_id: row.alumno_id ?? existing.alumno_id ?? null };
  }

  const { error } = await supabaseAdmin.from("mp_account_movements").insert(row);
  if (error) throw error;
  return { stored: true, inserted: true, alumno_id: alumnoId };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const topic = url.searchParams.get("topic") || url.searchParams.get("type");
    const cuentaSlug = url.searchParams.get("cuenta");
    const body = await req.json().catch(() => ({}));

    console.log("Webhook received:", { topic, cuentaSlug, body });

    const dataId = body?.data?.id || url.searchParams.get("data.id");
    const notificationType = topic || body?.type || body?.action;

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Token "best-effort" para llamadas auxiliares (PUT preapproval pause).
    // Las consultas que dependen del payment usarán resolveWebhookToken.
    const MP_ACCESS_TOKEN = Deno.env.get("MP_ACCESS_TOKEN") ?? "";


    // ─── PREAPPROVAL FLOW (recurring agreement status change) ───
    if (dataId && (notificationType === "preapproval" || notificationType === "subscription_preapproval")) {
      const resolved = await resolveWebhookToken(supabaseAdmin, cuentaSlug, `https://api.mercadopago.com/preapproval/${dataId}`);
      if (!resolved.ok) {
        console.error("[mp-webhook] no se pudo obtener preapproval con ningún token");
        return new Response(JSON.stringify({ ok: false, error: "mp_fetch_failed" }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const pa = resolved.data;
      console.log("Preapproval details:", { id: pa?.id, status: pa?.status, via: resolved.slug });

      if (pa?.id) {
        await supabaseAdmin
          .from("suscripciones")
          .update({
            mp_preapproval_status: pa.status,
            auto_cobro_activo: pa.status === "authorized",
          })
          .eq("mp_preapproval_id", String(pa.id));
      }
      return new Response(JSON.stringify({ ok: true, kind: "preapproval" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── AUTHORIZED PAYMENT FLOW (recurring charge executed by MP) ───
    if (dataId && (notificationType === "authorized_payment" || notificationType === "subscription_authorized_payment")) {
      const resolved = await resolveWebhookToken(supabaseAdmin, cuentaSlug, `https://api.mercadopago.com/authorized_payments/${dataId}`);
      if (!resolved.ok) {
        console.error("[mp-webhook] no se pudo obtener authorized_payment con ningún token");
        return new Response(JSON.stringify({ ok: false, error: "mp_fetch_failed" }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const ap = resolved.data;
      const preapprovalId = ap?.preapproval_id ? String(ap.preapproval_id) : null;
      const apStatus = ap?.status; // scheduled | processed | recycling | cancelled
      const paymentStatus = ap?.payment?.status;
      console.log("AuthorizedPayment:", { id: ap?.id, preapprovalId, apStatus, paymentStatus });

      if (!preapprovalId) {
        return new Response(JSON.stringify({ ok: true, no_preapproval: true }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: parentSub } = await supabaseAdmin
        .from("suscripciones")
        .select("id, alumno_id, plan_id, precio_final, precio_base, moneda, intentos_cobro_fallidos")
        .eq("mp_preapproval_id", preapprovalId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!parentSub) {
        console.log("No parent subscription for preapproval", preapprovalId);
        return new Response(JSON.stringify({ ok: true, no_parent: true }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const nowIso = new Date().toISOString();

      if (paymentStatus === "approved" && apStatus === "processed") {
        const mpPaymentId = ap?.payment?.id ? String(ap.payment.id) : null;
        if (mpPaymentId) {
          const { data: dup } = await supabaseAdmin
            .from("suscripciones")
            .select("id")
            .eq("mp_payment_id", mpPaymentId)
            .maybeSingle();
          if (dup) {
            return new Response(JSON.stringify({ ok: true, duplicate: true }), {
              status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        }

        const now = new Date();
        const fechaInicio = now.toISOString().split("T")[0];
        const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        const fechaFin = lastDay.toISOString().split("T")[0];
        const monto = Number(ap?.payment?.transaction_amount ?? parentSub.precio_final ?? parentSub.precio_base ?? 0);

        await supabaseAdmin.from("suscripciones").insert({
          alumno_id: parentSub.alumno_id,
          plan_id: parentSub.plan_id,
          estado: "activa",
          fecha_inicio: fechaInicio,
          fecha_fin: fechaFin,
          metodo_pago: "mercadopago_recurrente",
          origen_registro: "automatico",
          mp_payment_id: mpPaymentId,
          mp_status: "approved",
          mp_preapproval_id: preapprovalId,
          mp_preapproval_status: "authorized",
          auto_cobro_activo: true,
          intentos_cobro_fallidos: 0,
          ultimo_intento_cobro_at: nowIso,
          precio_base: parentSub.precio_base,
          precio_final: monto,
          moneda: parentSub.moneda,
          notas: "Renovación automática (MP)",
        });

        await supabaseAdmin
          .from("suscripciones")
          .update({ intentos_cobro_fallidos: 0, ultimo_intento_cobro_at: nowIso })
          .eq("id", parentSub.id);

        await supabaseAdmin
          .from("alumnos")
          .update({ estado: "activo" })
          .eq("id", parentSub.alumno_id);

        return new Response(JSON.stringify({ ok: true, kind: "auto_renewed" }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (paymentStatus === "rejected" || apStatus === "cancelled" || apStatus === "recycling") {
        const newFails = Number(parentSub.intentos_cobro_fallidos || 0) + 1;
        const reachedLimit = newFails >= 3;

        const update: Record<string, unknown> = {
          ultimo_intento_cobro_at: nowIso,
          intentos_cobro_fallidos: newFails,
        };

        if (reachedLimit) {
          update.auto_cobro_activo = false;
          update.mp_preapproval_status = "paused";
          try {
            await fetch(`https://api.mercadopago.com/preapproval/${preapprovalId}`, {
              method: "PUT",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${resolved.token}`,
              },
              body: JSON.stringify({ status: "paused" }),
            });
          } catch (e) {
            console.error("Could not pause preapproval:", e);
          }
        }

        await supabaseAdmin
          .from("suscripciones")
          .update(update)
          .eq("id", parentSub.id);

        if (reachedLimit) {
          try {
            const { data: alumno } = await supabaseAdmin
              .from("alumnos").select("nombre, email").eq("id", parentSub.alumno_id).maybeSingle();
            const { data: plan } = await supabaseAdmin
              .from("planes").select("nombre").eq("id", parentSub.plan_id).maybeSingle();

            const SENDER_DOMAIN = "notify.reybaud-app.com";
            const FROM = `Ciclismo Reybaud <noreply@${SENDER_DOMAIN}>`;
            const APP_URL = "https://reybaud-app.com";

            if (alumno?.email) {
              await sendLegacyEmailPayload({
                  message_id: crypto.randomUUID(),
                  to: alumno.email,
                  from: FROM,
                  sender_domain: SENDER_DOMAIN,
                  subject: "No pudimos cobrar tu renovación automática",
                  html: `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#222"><h2 style="color:#b8860b;margin-bottom:12px">Hola ${alumno.nombre || ""},</h2><p>Intentamos renovar tu plan <strong>${plan?.nombre || ""}</strong> automáticamente y la tarjeta fue rechazada en los 3 intentos.</p><p>Para no perder el acceso, podés pagar manualmente desde tu perfil o actualizar la tarjeta y volver a activar la renovación automática.</p><p style="margin:24px 0"><a href="${APP_URL}/perfil?section=suscripciones" style="background:#b8860b;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">Pagar ahora</a></p><p style="color:#666;font-size:13px">Si necesitás ayuda, respondé este mail.</p></div>`,
                  text: `Intentamos renovar tu plan ${plan?.nombre || ""} y la tarjeta fue rechazada 3 veces. Pagá manual desde ${APP_URL}/perfil?section=suscripciones`,
                  purpose: "transactional",
                  label: "auto_charge_failed_student",
                  idempotency_key: `auto-fail-student-${parentSub.id}-${newFails}`,
                  queued_at: nowIso,
                }, supabaseAdmin);
            }

            await sendLegacyEmailPayload({
                message_id: crypto.randomUUID(),
                to: "scarlettbonatto@gmail.com",
                from: FROM,
                sender_domain: SENDER_DOMAIN,
                subject: `⚠️ Falló auto-cobro: ${alumno?.nombre || "Alumno"} — ${plan?.nombre || ""}`,
                html: `<div style="font-family:-apple-system,sans-serif;max-width:520px;margin:0 auto;padding:24px"><h2 style="color:#c0392b">Auto-cobro desactivado</h2><p>Mercado Pago rechazó 3 intentos consecutivos de renovación automática.</p><table style="width:100%;border-collapse:collapse"><tr><td style="padding:6px 0;color:#666">Alumno</td><td style="padding:6px 0;font-weight:600">${alumno?.nombre || ""}</td></tr><tr><td style="padding:6px 0;color:#666">Email</td><td style="padding:6px 0">${alumno?.email || ""}</td></tr><tr><td style="padding:6px 0;color:#666">Plan</td><td style="padding:6px 0">${plan?.nombre || ""}</td></tr><tr><td style="padding:6px 0;color:#666">Preapproval</td><td style="padding:6px 0;font-family:monospace;font-size:12px">${preapprovalId}</td></tr></table><p style="color:#666;font-size:13px;margin-top:16px">Se envió aviso al alumno con link de pago manual.</p></div>`,
                text: `Falló auto-cobro de ${alumno?.nombre} (${plan?.nombre}). Preapproval ${preapprovalId} pausado.`,
                purpose: "transactional",
                label: "auto_charge_failed_admin",
                idempotency_key: `auto-fail-admin-${parentSub.id}-${newFails}`,
                queued_at: nowIso,
              }, supabaseAdmin);
          } catch (mailErr) {
            console.error("Email enqueue failed:", mailErr);
          }
        }

        return new Response(JSON.stringify({ ok: true, kind: "auto_failed", attempts: newFails, paused: reachedLimit }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ ok: true, kind: "ap_other", apStatus, paymentStatus }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── ONE-OFF PAYMENT FLOW (existing logic) ───
    if (!dataId || (notificationType !== "payment" && notificationType !== "payment.updated" && notificationType !== "payment.created")) {
      console.log("Ignoring notification:", notificationType);
      return new Response(JSON.stringify({ ok: true, ignored: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const paymentResolved = await resolveWebhookToken(
      supabaseAdmin, cuentaSlug, `https://api.mercadopago.com/v1/payments/${dataId}`
    );
    if (!paymentResolved.ok) {
      console.error("[mp-webhook] no se pudo obtener el payment con ningún token");
      return new Response(JSON.stringify({ ok: false, error: "mp_fetch_failed" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const payment = paymentResolved.data;
    console.log("Payment details:", {
      id: payment.id,
      status: payment.status,
      external_reference: payment.external_reference,
      via: paymentResolved.slug,
    });

    // Todo payment que llegue por webhook se refleja inmediatamente en
    // mp_account_movements, incluso una transferencia directa sin referencia.
    // Esto convierte al webhook en el camino principal de conciliación.
    let movementResult: any = null;
    try {
      movementResult = await persistMpAccountMovement(supabaseAdmin, payment, paymentResolved);
    } catch (movementError) {
      console.error("[mp-webhook] no se pudo persistir movimiento", movementError);
      // No abortamos el flujo existente: reservas/tienda/eventos deben seguir.
    }

    if (!payment.external_reference) {
      console.log("No external_reference; movimiento conciliado por webhook", movementResult);
      return new Response(JSON.stringify({
        ok: true,
        no_ref: true,
        movement: movementResult,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const externalRef: string = String(payment.external_reference);
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    const isEventRef = externalRef.startsWith("event:");
    const isPreorderRef = externalRef.startsWith("preorder:");
    const isPreorderSaldoRef = externalRef.startsWith("preorder_saldo:");
    const isPreorderTotalRef = externalRef.startsWith("preorder_total:");
    const isPreorderAlumnoRef = externalRef.startsWith("preorder_alumno_saldo:");
    const isStoreOrderRef = externalRef.startsWith("store_order:");
    const isTurneraRef = externalRef.startsWith("turnera:");

    // Para eventos: "event:<uuid>" o "event:<uuid>:inst:<n>" (cuotas).
    // Extraemos el uuid y, si corresponde, el número de cuota.
    let eventInstallmentNumber: number | null = null;
    let refUuid: string;
    if (isEventRef) {
      const body = externalRef.slice("event:".length);
      const instMatch = body.match(/^([0-9a-f-]{36}):inst:(\d+)$/i);
      if (instMatch) {
        refUuid = instMatch[1];
        eventInstallmentNumber = Number(instMatch[2]);
      } else {
        refUuid = body;
      }
    } else if (isPreorderSaldoRef) {
      refUuid = externalRef.slice("preorder_saldo:".length);
    } else if (isPreorderTotalRef) {
      refUuid = externalRef.slice("preorder_total:".length);
    } else if (isPreorderAlumnoRef) {
      refUuid = externalRef.slice("preorder_alumno_saldo:".length);
    } else if (isPreorderRef) {
      refUuid = externalRef.slice("preorder:".length);
    } else if (isStoreOrderRef) {
      refUuid = externalRef.slice("store_order:".length);
    } else if (isTurneraRef) {
      refUuid = externalRef.slice("turnera:".length);
    } else {
      refUuid = externalRef;
    }

    if (!UUID_RE.test(refUuid)) {
      console.error("[mp-webhook] Invalid external_reference format", { externalRef, refUuid });
      return new Response(JSON.stringify({ ok: true, invalid_ref: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── PREORDER SALDO / TOTAL / ALUMNO ───
    if (isPreorderSaldoRef || isPreorderTotalRef || isPreorderAlumnoRef) {
      if (payment.status !== "approved") {
        return new Response(JSON.stringify({ ok: true, kind: "preorder_extra", status: payment.status, skipped: "not approved" }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const nowIso = new Date().toISOString();

      if (isPreorderAlumnoRef) {
        // Pagar TODO el pendiente del alumno: confirmar seña y limpiar saldo en cada preventa abierta
        const alumnoId = refUuid;
        const { data: list } = await supabaseAdmin
          .from("store_preorders")
          .select("id, estado, estado_pago_sena, saldo_pendiente")
          .eq("alumno_id", alumnoId)
          .is("cancelada_at", null)
          .neq("estado", "cancelada");
        for (const p of list || []) {
          const upd: Record<string, unknown> = { mp_payment_id: String(payment.id) };
          if (p.estado_pago_sena !== "confirmada") {
            upd.estado_pago_sena = "confirmada";
            upd.sena_pagada_at = nowIso;
            if (p.estado === "pendiente_pago_sena") upd.estado = "reservada";
          }
          if (Number(p.saldo_pendiente || 0) > 0) {
            upd.saldo_pendiente = 0;
            
          }
          await supabaseAdmin.from("store_preorders").update(upd).eq("id", p.id);
        }
        return new Response(JSON.stringify({ ok: true, kind: "preorder_alumno", updated: (list || []).length }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // SALDO o TOTAL (single preorder)
      const preorderId = refUuid;
      const { data: pre } = await supabaseAdmin
        .from("store_preorders")
        .select("id, estado, estado_pago_sena")
        .eq("id", preorderId)
        .maybeSingle();
      if (!pre) {
        return new Response(JSON.stringify({ ok: true, missing: true }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const upd: Record<string, unknown> = {
        mp_payment_id: String(payment.id),
        saldo_pendiente: 0,
      };
      if (isPreorderTotalRef && pre.estado_pago_sena !== "confirmada") {
        upd.estado_pago_sena = "confirmada";
        upd.sena_pagada_at = nowIso;
        if (pre.estado === "pendiente_pago_sena") upd.estado = "reservada";
      }
      await supabaseAdmin.from("store_preorders").update(upd).eq("id", preorderId);

      return new Response(JSON.stringify({ ok: true, kind: isPreorderTotalRef ? "preorder_total" : "preorder_saldo", status: payment.status }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }


    // ─── STORE ORDER FLOW (in-app product purchase) ───
    if (isStoreOrderRef) {
      const orderId = refUuid;
      const { data: order } = await supabaseAdmin
        .from("store_orders")
        .select("id, status, mp_payment_id")
        .eq("id", orderId)
        .maybeSingle();
      if (!order) {
        return new Response(JSON.stringify({ ok: true, missing: true }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const update: Record<string, unknown> = {
        mp_payment_id: String(payment.id),
        mp_status: payment.status,
      };
      if (payment.status === "approved") {
        update.status = "pagado";
        update.pagado_at = new Date().toISOString();
      } else if (payment.status === "rejected" || payment.status === "cancelled") {
        update.status = "rechazado";
      } else if (payment.status === "pending" || payment.status === "in_process") {
        update.status = "pendiente_pago";
      }
      await supabaseAdmin.from("store_orders").update(update).eq("id", orderId);

      // El stock lo descuenta exclusivamente el trigger `trg_store_order_stock_egreso`
      // al pasar el pedido a un estado que compromete mercadería (fuente única de verdad).
      // No tocar `store_products` desde acá: duplicaba el descuento y no dejaba movimiento.

      return new Response(JSON.stringify({ ok: true, kind: "store_order", status: payment.status }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // ─── PREORDER DEPOSIT FLOW ───
    // external_reference: "preorder:<preorder_id>"
    if (isPreorderRef) {
      const preorderId = refUuid;
      const { data: preorder } = await supabaseAdmin
        .from("store_preorders")
        .select("id, estado, estado_pago_sena, sena_monto, notas")
        .eq("id", preorderId)
        .maybeSingle();

      if (!preorder) {
        console.log("[mp-webhook] preorder not found:", preorderId);
        return new Response(JSON.stringify({ ok: true, missing: true }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const update: Record<string, unknown> = {
        mp_payment_id: String(payment.id),
      };

      if (payment.status === "approved") {
        // ── GUARD: comparar monto pagado vs seña esperada ──
        const paid = Number(payment.transaction_amount ?? 0);
        const expected = Number(preorder.sena_monto || 0);
        const tolerance = 1; // ARS de tolerancia por redondeo
        if (expected > 0 && paid + tolerance < expected) {
          // Pago parcial: NO confirmar, dejar en estado 'parcial' para revisión admin
          update.estado_pago_sena = "parcial";
          const stamp = `[${new Date().toISOString()}] Pago seña PARCIAL vía MP: recibido $${paid.toFixed(2)} de $${expected.toFixed(2)} esperado (op ${payment.id}). Revisar y registrar saldo faltante.`;
          update.notas = preorder.notas ? `${preorder.notas}\n${stamp}` : stamp;
          console.warn("[mp-webhook] preorder sena PARTIAL:", { preorderId, paid, expected });
        } else {
          update.estado_pago_sena = "confirmada";
          update.sena_pagada_at = new Date().toISOString();
          if (preorder.estado === "pendiente_pago_sena") update.estado = "reservada";
        }
      } else if (payment.status === "rejected" || payment.status === "cancelled") {
        update.estado_pago_sena = "rechazada";
      } else if (payment.status === "pending" || payment.status === "in_process") {
        update.estado_pago_sena = "pendiente";
      }

      await supabaseAdmin.from("store_preorders").update(update).eq("id", preorderId);

      console.log("[mp-webhook] preorder updated:", { preorderId, mpStatus: payment.status });
      return new Response(JSON.stringify({ ok: true, kind: "preorder", status: payment.status }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }


    // ─── TURNERA RESERVATION FLOW ───
    // external_reference: "turnera:<reservation_id>"
    if (isTurneraRef) {
      const reservationId = refUuid;
      const paidAmount = Number(payment.transaction_amount ?? 0);

      const { data: reserva, error: rErr } = await supabaseAdmin
        .from("reservas_turnera")
        .select("id, email, pago_estado, pago_mp_payment_id, estado_operativo")
        .eq("id", reservationId)
        .maybeSingle();
      if (rErr || !reserva) {
        console.error("[mp-webhook] turnera: reserva no encontrada", reservationId);
        return new Response(JSON.stringify({ ok: true, missing: true }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Idempotencia: si ya registramos este mismo payment_id, no repetir
      if (reserva.pago_mp_payment_id && String(reserva.pago_mp_payment_id) === String(payment.id)) {
        return new Response(JSON.stringify({ ok: true, kind: "turnera", duplicate: true }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const mpStatus = String(payment.status || "").toLowerCase();
      let newPagoEstado: string = reserva.pago_estado || "pendiente";
      if (mpStatus === "approved") newPagoEstado = "aprobado";
      else if (mpStatus === "rejected" || mpStatus === "cancelled") newPagoEstado = "rechazado";
      else if (mpStatus === "pending" || mpStatus === "in_process" || mpStatus === "authorized") newPagoEstado = "pendiente";
      else if (mpStatus === "refunded" || mpStatus === "charged_back") newPagoEstado = "reembolsado";

      const update: Record<string, unknown> = {
        pago_estado: newPagoEstado,
        pago_mp_payment_id: String(payment.id),
      };
      if (mpStatus === "approved" && paidAmount > 0) {
        update.pago_monto = paidAmount;
        update.estado_economico = "pagado";
        // Al aprobar el pago, liberamos el hold (la reserva queda confirmada)
        update.hold_expira_at = null;
      }
      // Cuando se rechaza el cobro inicial, marcamos la reserva como cancelada
      if (newPagoEstado === "rechazado" && reserva.estado_operativo !== "cancelada") {
        update.estado_operativo = "cancelada";
      }

      await supabaseAdmin.from("reservas_turnera").update(update).eq("id", reservationId);

      // Disparar email de confirmación SOLO cuando se aprueba el cobro
      if (mpStatus === "approved" && reserva.email) {
        try {
          await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-turnera-email`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            },
            body: JSON.stringify({ reservation_id: reservationId, tipo: "confirmacion" }),
          });
          // Aviso al coach (no bloqueante si falla)
          await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-turnera-email`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            },
            body: JSON.stringify({ reservation_id: reservationId, tipo: "coach_aviso" }),
          });
        } catch (e) {
          console.error("[mp-webhook] turnera: error enviando confirmación", (e as Error).message);
        }
      }

      console.log("[mp-webhook] turnera updated:", { reservationId, mpStatus, newPagoEstado, paidAmount });
      return new Response(JSON.stringify({ ok: true, kind: "turnera", status: mpStatus, pago_estado: newPagoEstado }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── EVENT RESERVATION FLOW ───
    // external_reference: "event:<reservation_id>" o "event:<reservation_id>:inst:<n>"
    if (externalRef.startsWith("event:")) {
      const reservationId = refUuid;
      const paidAmount = Number(payment.transaction_amount ?? 0);

      // Cargar reserva actual
      const { data: reservation, error: resErr } = await supabaseAdmin
        .from("event_reservations")
        .select("id, alumno_id, amount_total, amount_paid, balance_due, payment_status, reservation_status, currency_snapshot, moneda")
        .eq("id", reservationId)
        .single();

      if (resErr || !reservation) {
        console.error("Reserva no encontrada:", reservationId, resErr);
        return new Response(JSON.stringify({ ok: true, missing: true }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Idempotencia: si ya registramos este pago, salir
      const { data: existing } = await supabaseAdmin
        .from("reservation_payments")
        .select("id")
        .eq("reservation_id", reservationId)
        .eq("payment_reference", String(payment.id))
        .maybeSingle();

      if (existing) {
        console.log("Pago ya registrado, ignorando:", payment.id);
        return new Response(JSON.stringify({ ok: true, duplicate: true }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const currency = reservation.currency_snapshot || reservation.moneda || "ARS";
      const today = new Date().toISOString().split("T")[0];

      // Mapear status MP → status interno del pago informado
      let payStatus = "informado";
      if (payment.status === "approved") payStatus = "validado";
      else if (payment.status === "rejected" || payment.status === "cancelled") payStatus = "rechazado";

      // Insertar siempre el registro del pago (trazabilidad)
      await supabaseAdmin.from("reservation_payments").insert({
        reservation_id: reservationId,
        alumno_id: reservation.alumno_id,
        amount: paidAmount,
        currency,
        payment_date: today,
        payment_method: "mercadopago",
        payment_reference: String(payment.id),
        notes: `Pago Mercado Pago (${payment.status})`,
        status: payStatus,
      } as any);

      // Sólo movemos saldos cuando MP aprobó
      if (payment.status === "approved") {
        const newPaid = Number(reservation.amount_paid || 0) + paidAmount;
        const total = Number(reservation.amount_total || 0);
        const newBalance = total > 0 ? Math.max(0, total - newPaid) : 0;
        const isFullyPaid = total > 0 && newBalance <= 0;

        const update: Record<string, unknown> = {
          amount_paid: newPaid,
          balance_due: newBalance,
          payment_status: isFullyPaid ? "pago_validado" : "parcial",
          metodo_pago: "mercadopago",
        };

        // Si la reserva todavía no estaba confirmada y se terminó de pagar, confirmarla
        if (isFullyPaid && reservation.reservation_status !== "reserva_confirmada") {
          update.reservation_status = "reserva_confirmada";
          update.estado = "confirmada";
          update.confirmed_at = new Date().toISOString();
        } else if (!isFullyPaid && reservation.reservation_status === "solicitud_enviada") {
          // Pago parcial mantiene la solicitud, pero blanqueamos el estado
          update.estado = "pendiente_verificacion";
        }

        await supabaseAdmin
          .from("event_reservations")
          .update(update)
          .eq("id", reservationId);

        // Si el pago era de una cuota específica, marcarla como pagada
        if (eventInstallmentNumber != null) {
          try {
            const { data: instRow } = await supabaseAdmin
              .from("reservation_installments")
              .select("id, amount, paid_amount, monto_pagado")
              .eq("reservation_id", reservationId)
              .eq("installment_number", eventInstallmentNumber)
              .maybeSingle();

            if (instRow) {
              const prevPaid = Number(instRow.paid_amount || 0);
              const newInstPaid = prevPaid + paidAmount;
              const instAmount = Number(instRow.amount || 0);
              const instBalance = Math.max(0, instAmount - newInstPaid);
              const instStatus = instAmount > 0 && instBalance <= 0 ? "pagada" : "parcial";
              await supabaseAdmin
                .from("reservation_installments")
                .update({
                  paid_amount: newInstPaid,
                  monto_pagado: newInstPaid,
                  balance_due: instBalance,
                  saldo_pendiente: instBalance,
                  status: instStatus,
                } as any)
                .eq("id", instRow.id);
            } else {
              console.warn("[mp-webhook] cuota no encontrada para event:inst", { reservationId, eventInstallmentNumber });
            }
          } catch (e) {
            console.error("[mp-webhook] error actualizando cuota:", e);
          }
        }
      } else if (payment.status === "rejected" || payment.status === "cancelled") {
        await supabaseAdmin
          .from("event_reservations")
          .update({ payment_status: "pago_rechazado" })
          .eq("id", reservationId);
      }

      // Close associated payment intent (idempotent)
      try {
        const newStatus =
          payment.status === "approved" ? "aprobada" :
          payment.status === "rejected" ? "fallida" :
          payment.status === "cancelled" ? "cancelada" : null;
        if (newStatus && payment.preference_id) {
          await supabaseAdmin
            .from("reservation_payment_intents")
            .update({ status: newStatus, resolved_at: new Date().toISOString() })
            .eq("preference_id", String(payment.preference_id))
            .eq("status", "pendiente");
        }
        if (payment.status === "approved") {
          await supabaseAdmin.from("audit_log").insert({
            action: "reserva.mp.pago.aprobado",
            entity_type: "event_reservation", entity_id: reservationId,
            user_role: "edge_function",
            details: { payment_id: payment.id, preference_id: payment.preference_id, amount: paidAmount },
          });
        }
      } catch (e) {
        console.error("[mp-webhook] intent close failed:", e);
      }

      // Notify the participant by email — same template as manual payment registration
      if (payment.status === "approved") {
        try {
          await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-reservation-payment-recorded`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            },
            body: JSON.stringify({
              reservation_id: reservationId,
              amount: paidAmount,
              payment_method: "mercadopago",
              payment_reference: String(payment.id),
              installment_number: eventInstallmentNumber ?? null,
            }),
          });
        } catch (e) {
          console.error("[mp-webhook] payment-recorded email failed:", e);
        }

        // If the reservation just got fully paid, also send the "reserva confirmada + pagada" email
        const wasNotConfirmed = reservation.reservation_status !== "reserva_confirmada";
        const totalNow = Number(reservation.amount_total || 0);
        const paidNow = Number(reservation.amount_paid || 0) + paidAmount;
        const fullyPaidNow = totalNow > 0 && paidNow >= totalNow;
        if (wasNotConfirmed && fullyPaidNow) {
          try {
            await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-reservation-confirmed-with-payment`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
              },
              body: JSON.stringify({ reservation_id: reservationId }),
            });
          } catch (e) {
            console.error("[mp-webhook] confirmed-with-payment email failed:", e);
          }
        }
      }

      console.log("Event reservation updated:", { reservationId, mpStatus: payment.status });

      return new Response(JSON.stringify({ ok: true, kind: "event", status: payment.status }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }


    // ─── DEFAULT: SUSCRIPCION FLOW ───
    const suscripcionId = externalRef;

    // Map MP status to our status
    let estado: string;
    switch (payment.status) {
      case "approved":
        estado = "activa";
        break;
      case "pending":
      case "in_process":
        estado = "pendiente";
        break;
      case "rejected":
      case "cancelled":
        estado = "cancelada";
        break;
      default:
        estado = "pendiente";
    }

    // Update subscription
    const today = new Date().toISOString().split("T")[0];
    // fecha_fin = last day of the current month at 23:59
    const now = new Date();
    const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const fechaFin = lastDayOfMonth.toISOString().split("T")[0];

    const updateData: Record<string, unknown> = {
      estado,
      mp_payment_id: String(payment.id),
      mp_status: payment.status,
      metodo_pago: "mercadopago",
      origen_registro: "automatico",
    };

    if (payment.status === "approved") {
      // Preserve any existing period already loaded on the sub (renovación cron,
      // early-renewal, cambio de plan programado, etc). Sólo calculamos fechas
      // nuevas si la sub NO tiene período cargado (caso raro: alta directa vía webhook).
      const { data: currentSub } = await supabaseAdmin
        .from("suscripciones")
        .select("fecha_inicio, fecha_fin, plan_id")
        .eq("id", suscripcionId)
        .maybeSingle();

      const existingInicio = currentSub?.fecha_inicio as string | null | undefined;
      const existingFin = currentSub?.fecha_fin as string | null | undefined;

      // Programas cerrados (cohortes con fecha de inicio/fin propias): el período
      // de la suscripción debe ser el del programa, NO el mes calendario.
      let progInicio: string | null = null;
      let progFin: string | null = null;
      if (currentSub?.plan_id) {
        const { data: planRow } = await supabaseAdmin
          .from("planes")
          .select("es_programa_cerrado, fecha_inicio_programa, fecha_fin_programa")
          .eq("id", currentSub.plan_id)
          .maybeSingle();
        if (planRow?.es_programa_cerrado && planRow.fecha_inicio_programa && planRow.fecha_fin_programa) {
          progInicio = planRow.fecha_inicio_programa as string;
          progFin = planRow.fecha_fin_programa as string;
        }
      }

      if (progInicio && progFin) {
        updateData.fecha_inicio = progInicio;
        updateData.fecha_fin = progFin;
      } else if (existingInicio && existingFin) {
        // Respetar el período ya definido (01→último día del mes que le corresponda)
        updateData.fecha_inicio = existingInicio;
        updateData.fecha_fin = existingFin;
      } else {
        updateData.fecha_inicio = today;
        updateData.fecha_fin = fechaFin;
      }

    }


    const { error: updateError } = await supabaseAdmin
      .from("suscripciones")
      .update(updateData)
      .eq("id", suscripcionId);

    if (updateError) {
      console.error("Error updating subscription:", updateError);
      return new Response(
        JSON.stringify({ error: "Failed to update subscription" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // If approved, also activate the student
    if (payment.status === "approved") {
      const { data: sub } = await supabaseAdmin
        .from("suscripciones")
        .select("alumno_id")
        .eq("id", suscripcionId)
        .single();

      if (sub?.alumno_id) {
        await supabaseAdmin
          .from("alumnos")
          .update({ estado: "activo" })
          .eq("id", sub.alumno_id);

        console.log("Student activated:", sub.alumno_id);
      }
    }

    console.log("Subscription updated:", { suscripcionId, estado });

    return new Response(
      JSON.stringify({ ok: true, status: estado }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Webhook error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
