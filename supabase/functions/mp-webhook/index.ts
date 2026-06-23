import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
              await supabaseAdmin.rpc("enqueue_email", {
                queue_name: "transactional_emails",
                payload: {
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
                },
              });
            }

            await supabaseAdmin.rpc("enqueue_email", {
              queue_name: "transactional_emails",
              payload: {
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
              },
            });
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

    if (!payment.external_reference) {
      console.log("No external_reference, skipping");
      return new Response(JSON.stringify({ ok: true, no_ref: true }), {
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
      const alreadyPaid = order.status === "pagado" || !!order.mp_payment_id;

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

      // On first approval: descontar stock por variante
      if (payment.status === "approved" && !alreadyPaid) {
        const { data: items } = await supabaseAdmin
          .from("store_order_items")
          .select("product_id, quantity, variant_selection")
          .eq("order_id", orderId);
        for (const it of items || []) {
          if (!it.product_id) continue;
          const { data: prod } = await supabaseAdmin
            .from("store_products")
            .select("stock, variant_stock, variants")
            .eq("id", it.product_id)
            .maybeSingle();
          if (!prod) continue;
          const specs = Array.isArray(prod.variants) ? prod.variants : [];
          const sel = (it.variant_selection || {}) as Record<string, string>;
          const sig = specs
            .filter((s: any) => s?.name)
            .map((s: any) => `${s.name}:${sel[s.name] || ""}`)
            .join("|");
          const qty = Number(it.quantity || 0);
          if (sig && prod.variant_stock && typeof (prod.variant_stock as any)[sig] === "number") {
            const newStock = { ...(prod.variant_stock as Record<string, number>) };
            newStock[sig] = Math.max(0, (newStock[sig] || 0) - qty);
            await supabaseAdmin.from("store_products").update({ variant_stock: newStock }).eq("id", it.product_id);
          } else if (typeof prod.stock === "number") {
            await supabaseAdmin
              .from("store_products")
              .update({ stock: Math.max(0, prod.stock - qty) })
              .eq("id", it.product_id);
          }
        }
      }

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
        .select("id, estado, estado_pago_sena")
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
        update.estado_pago_sena = "confirmada";
        update.sena_pagada_at = new Date().toISOString();
        if (preorder.estado === "pendiente_pago_sena") update.estado = "reservada";
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

    // ─── EVENT RESERVATION FLOW ───
    // external_reference: "event:<reservation_id>"
    if (externalRef.startsWith("event:")) {
      const reservationId = externalRef.slice("event:".length);
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
      // Preserve existing future-dated period (early renewals) to avoid overlap
      // with the still-active current sub — would trigger DUPLICATE_GRUPAL_CATEGORY.
      const { data: currentSub } = await supabaseAdmin
        .from("suscripciones")
        .select("fecha_inicio, fecha_fin")
        .eq("id", suscripcionId)
        .maybeSingle();

      const existingInicio = currentSub?.fecha_inicio as string | null | undefined;
      const existingFin = currentSub?.fecha_fin as string | null | undefined;

      if (existingInicio && existingFin && existingInicio > today) {
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
