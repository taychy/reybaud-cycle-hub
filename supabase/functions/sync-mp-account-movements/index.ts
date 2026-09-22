// Sincroniza movimientos (cobros) de cada cuenta MP activa (v2)
// public.mp_account_movements. Intenta auto-linkear con reservation_payments,
// suscripciones y alumnos por payment_id, documento, email y nombre bancario.
// También descarta como "pagador" los datos que Mercado Pago devuelve de la
// propia cuenta receptora.
//
// POST /sync-mp-account-movements { days?: number, cuenta_id?: string }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (status: number, data: unknown) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

const normalizeEmail = (value: unknown) =>
  String(value ?? "").trim().toLowerCase();

const normalizeDigits = (value: unknown) =>
  String(value ?? "").replace(/\D/g, "");

const documentKeys = (value: unknown): string[] => {
  const digits = normalizeDigits(value);
  if (!digits) return [];
  const keys = new Set<string>([digits]);

  // En Argentina MP suele informar CUIT/CUIL (11 dígitos), mientras que en
  // la ficha del alumno guardamos DNI (7/8 dígitos). El DNI está en el medio:
  // prefijo 2 dígitos + DNI 8 dígitos + verificador.
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

const lookupUniqueByDocument = (
  map: Map<string, string | null>,
  value: unknown,
): string | null => {
  const ids = new Set<string>();
  for (const key of documentKeys(value)) {
    const id = map.get(key);
    if (id) ids.add(id);
  }
  return ids.size === 1 ? [...ids][0] : null;
};

const normalizeName = (value: unknown) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");

const addUnique = (map: Map<string, string | null>, key: string, alumnoId: string) => {
  if (!key) return;
  if (!map.has(key)) map.set(key, alumnoId);
  else if (map.get(key) !== alumnoId) map.set(key, null);
};

const extractPayerName = (p: any): string | null => {
  const parts = [p?.payer?.first_name, p?.payer?.last_name].filter(Boolean).join(" ").trim();
  if (parts) return parts;
  const ai = [p?.additional_info?.payer?.first_name, p?.additional_info?.payer?.last_name].filter(Boolean).join(" ").trim();
  if (ai) return ai;
  const ch = p?.card?.cardholder?.name;
  if (ch) return String(ch).trim() || null;
  return null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const body = await req.json().catch(() => ({}));
  const days = Math.min(Math.max(Number(body?.days ?? 7), 1), 90);
  const cuentaId: string | undefined = body?.cuenta_id;

  // Autenticación: acepta admin logueado, cron legacy (CRON_SECRET)
  // o automatización interna con secreto generado en DB y nunca expuesto al cliente.
  const cronKey = req.headers.get("x-cron-key");
  const expectedCronKey = Deno.env.get("CRON_SECRET");
  const legacyCron = !!expectedCronKey && cronKey === expectedCronKey;

  const automationKey = req.headers.get("x-automation-key");
  let internalAutomation = false;
  if (automationKey) {
    const { data: automationSecret } = await supabase
      .from("automation_internal_secrets")
      .select("secret")
      .eq("name", "mp_reconciliation")
      .maybeSingle();
    internalAutomation = !!automationSecret?.secret && automationSecret.secret === automationKey;
  }

  const isCron = legacyCron || internalAutomation;

  if (!isCron) {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return json(401, { error: "missing_token" });
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user) return json(401, { error: "invalid_token" });
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userData.user.id,
      _role: "admin",
    });
    if (!isAdmin) return json(403, { error: "not_admin" });
  }

  const q = supabase
    .from("cuentas_mp")
    .select("id, slug, nombre, secret_name_token")
    .eq("activa", true);
  if (cuentaId) q.eq("id", cuentaId);
  const { data: cuentas, error: cErr } = await q;
  if (cErr) return json(500, { error: cErr.message });

  // Índices de identidad de alumnos. Guardamos null cuando una clave es
  // ambigua para no autoasignar nunca por una coincidencia no única.
  const { data: alumnosIdentidad, error: aErr } = await supabase
    .from("alumnos")
    .select("id, email, emails_adicionales, documento, nombres_bancarios");
  if (aErr) return json(500, { error: aErr.message });

  const alumnosByEmail = new Map<string, string | null>();
  const alumnosByDocument = new Map<string, string | null>();
  const alumnosByBankName = new Map<string, string | null>();

  for (const a of alumnosIdentidad ?? []) {
    addUnique(alumnosByEmail, normalizeEmail((a as any).email), (a as any).id);
    for (const e of ((a as any).emails_adicionales ?? [])) {
      addUnique(alumnosByEmail, normalizeEmail(e), (a as any).id);
    }
    for (const key of documentKeys((a as any).documento)) {
      addUnique(alumnosByDocument, key, (a as any).id);
    }
    for (const n of ((a as any).nombres_bancarios ?? [])) {
      addUnique(alumnosByBankName, normalizeName(n), (a as any).id);
    }
  }

  const results: any = { cuentas: [], errors: [] as any[] };
  const sinceIso = new Date(Date.now() - days * 86400_000).toISOString();
  const beginDate = sinceIso;
  const endDate = new Date().toISOString();

  for (const c of cuentas ?? []) {
    const token = Deno.env.get((c as any).secret_name_token);
    if (!token) {
      results.errors.push({ cuenta: c.slug, error: "token_no_configurado" });
      continue;
    }

    // Mercado Pago puede devolver en payer.* datos de la propia cuenta
    // receptora, especialmente en transferencias. Leemos /users/me con el
    // token de cada cuenta para poder descartarlos sin hardcodear emails.
    let ownEmail = "";
    let ownDocument = "";
    let ownName = "";
    try {
      const meResp = await fetch("https://api.mercadopago.com/users/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (meResp.ok) {
        const me = await meResp.json();
        ownEmail = normalizeEmail(me?.email);
        ownDocument = normalizeDigits(me?.identification?.number);
        ownName = normalizeName([me?.first_name, me?.last_name].filter(Boolean).join(" "));
      } else {
        results.errors.push({ cuenta: c.slug, error: `mp_profile_${meResp.status}` });
      }
    } catch (e) {
      results.errors.push({ cuenta: c.slug, error: `mp_profile_fetch_failed: ${(e as Error).message}` });
    }

    const getSafePayerIdentity = (p: any) => {
      const rawEmail = normalizeEmail(p?.payer?.email ?? p?.additional_info?.payer?.email);
      const rawDocumentValue =
        p?.payer?.identification?.number ??
        p?.additional_info?.payer?.identification?.number ??
        null;
      const rawDocument = normalizeDigits(rawDocumentValue);
      const rawNameValue = extractPayerName(p);
      const rawName = normalizeName(rawNameValue);

      return {
        email: rawEmail && rawEmail !== ownEmail ? rawEmail : null,
        document: rawDocument && rawDocument !== ownDocument
          ? String(rawDocumentValue).trim()
          : null,
        name: rawNameValue && (!ownName || rawName !== ownName)
          ? rawNameValue
          : null,
      };
    };

    let inserted = 0, updated = 0, matched = 0;
    let offset = 0;
    const limit = 50;
    let hasMore = true;

    while (hasMore && offset < 2000) {
      const url = new URL("https://api.mercadopago.com/v1/payments/search");
      url.searchParams.set("sort", "date_created");
      url.searchParams.set("criteria", "desc");
      url.searchParams.set("range", "date_created");
      url.searchParams.set("begin_date", beginDate);
      url.searchParams.set("end_date", endDate);
      url.searchParams.set("limit", String(limit));
      url.searchParams.set("offset", String(offset));

      let resp: Response;
      try {
        resp = await fetch(url.toString(), {
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch (e) {
        results.errors.push({ cuenta: c.slug, error: `fetch_failed: ${(e as Error).message}` });
        break;
      }

      if (!resp.ok) {
        const txt = await resp.text();
        results.errors.push({ cuenta: c.slug, error: `mp_${resp.status}`, detail: txt.slice(0, 300) });
        break;
      }

      const payload = await resp.json();
      const items = payload?.results ?? [];
      const total = payload?.paging?.total ?? items.length;
      if (items.length === 0) break;

      for (const p of items) {
        const mpId = String(p.id);
        const payerIdentity = getSafePayerIdentity(p);
        // Intentar auto-linkear
        let resPayId: string | null = null;
        let subId: string | null = null;
        let alumnoId: string | null = null;

        const { data: rp } = await supabase
          .from("reservation_payments")
          .select("id, alumno_id")
          .eq("mp_payment_id", mpId)
          .maybeSingle();
        if (rp) {
          resPayId = rp.id;
          alumnoId = rp.alumno_id ?? null;
        } else {
          const { data: sub } = await supabase
            .from("suscripciones")
            .select("id, alumno_id")
            .eq("mp_payment_id", mpId)
            .maybeSingle();
          if (sub) {
            subId = sub.id;
            alumnoId = sub.alumno_id ?? null;
          }
        }

        // Si no hay match por payment_id, resolver sólo coincidencias únicas.
        // Prioridad: documento > email > nombre bancario registrado.
        if (!alumnoId && payerIdentity.document) {
          const id = lookupUniqueByDocument(alumnosByDocument, payerIdentity.document);
          if (id) alumnoId = id;
        }
        if (!alumnoId && payerIdentity.email) {
          const id = alumnosByEmail.get(normalizeEmail(payerIdentity.email));
          if (id) alumnoId = id;
        }
        if (!alumnoId && payerIdentity.name) {
          const id = alumnosByBankName.get(normalizeName(payerIdentity.name));
          if (id) alumnoId = id;
        }

        if (alumnoId || resPayId || subId) matched++;

        const feeAmount = Array.isArray(p?.fee_details)
          ? p.fee_details.reduce((s: number, f: any) => s + Number(f?.amount ?? 0), 0)
          : null;

        const row = {
          cuenta_mp_id: c.id,
          mp_payment_id: mpId,
          tipo: "payment",
          status: p?.status ?? null,
          status_detail: p?.status_detail ?? null,
          payment_method: p?.payment_method_id ?? null,
          payment_type: p?.payment_type_id ?? null,
          amount: Number(p?.transaction_amount ?? 0),
          net_received: p?.transaction_details?.net_received_amount != null
            ? Number(p.transaction_details.net_received_amount) : null,
          fee_amount: feeAmount,
          currency: p?.currency_id ?? "ARS",
          description: p?.description ?? null,
          payer_email: payerIdentity.email,
          payer_name: payerIdentity.name,
          payer_document: payerIdentity.document,
          external_reference: p?.external_reference ?? null,
          fecha_movimiento: p?.date_created ?? new Date().toISOString(),
          raw: p,
          alumno_id: alumnoId,
          reservation_payment_id: resPayId,
          suscripcion_id: subId,
        };

        const { data: existing } = await supabase
          .from("mp_account_movements")
          .select("id, alumno_id, assigned_manually, payer_name, payer_email, payer_document, raw")
          .eq("cuenta_mp_id", c.id)
          .eq("mp_payment_id", mpId)
          .maybeSingle();

        if (existing) {
          // No pisar asignaciones manuales ni la identidad autoritativa que ya
          // haya llegado desde el Settlement Report.
          const patch: any = { ...row };
          const existingRaw = existing.raw && typeof existing.raw === "object"
            ? existing.raw as Record<string, unknown>
            : {};
          const settlementReport = (existingRaw as any)?.settlement_report ?? null;
          if (settlementReport) {
            patch.raw = { ...p, settlement_report: settlementReport };
            const isTransfer = ["account_money", "cvu", "bank_transfer", "bank_transfer_in"].includes(
              String(p?.payment_method_id ?? p?.payment_type_id ?? "").toLowerCase(),
            );
            if (isTransfer) {
              // El endpoint /v1/payments no vuelve a degradar los datos que
              // ya validó el reporte de conciliación.
              delete patch.payer_name;
              delete patch.payer_email;
              delete patch.payer_document;

              // Si no apareció un vínculo fuerte nuevo por payment_id,
              // conservamos también la identidad de alumno resuelta por reporte.
              if (!resPayId && !subId) delete patch.alumno_id;
            }
          }
          if (existing.assigned_manually) {
            delete patch.alumno_id;
            delete patch.reservation_payment_id;
            delete patch.suscripcion_id;
          }
          const { error } = await supabase
            .from("mp_account_movements")
            .update(patch)
            .eq("id", existing.id);
          if (error) results.errors.push({ cuenta: c.slug, mp: mpId, error: error.message });
          else updated++;
        } else {
          const { error } = await supabase.from("mp_account_movements").insert(row);
          if (error) results.errors.push({ cuenta: c.slug, mp: mpId, error: error.message });
          else inserted++;
        }

        // ── Identidad recurrente (P0): registrar el preapproval/subscription de MP.
        // Solo guarda el mapeo preapproval → alumno sugerido. NO imputa nada.
        const preapprovalId =
          p?.metadata?.preapproval_id ??
          p?.point_of_interaction?.transaction_data?.subscription_id ??
          null;
        if (preapprovalId) {
          const { error: paErr } = await supabase.rpc("register_mp_preapproval_identity", {
            _preapproval_id: String(preapprovalId),
            _mp_plan_id: p?.point_of_interaction?.transaction_data?.plan_id
              ? String(p.point_of_interaction.transaction_data.plan_id)
              : null,
            _cuenta_mp_id: c.id,
            _payer_email: payerIdentity.email,
            _descripcion: p?.description ?? null,
            _importe: Number(p?.transaction_amount ?? 0) || null,
            _moneda: p?.currency_id ?? "ARS",
            _alumno_id: alumnoId,
            _seen_at: p?.date_created ?? new Date().toISOString(),
          });
          if (paErr) results.errors.push({ cuenta: c.slug, mp: mpId, error: `preapproval: ${paErr.message}` });
        }


        // Procesar refunds asociados a este pago (si existen)
        const refunds = Array.isArray(p?.refunds) ? p.refunds : [];
        for (const rf of refunds) {
          const refundId = String(rf?.id ?? "");
          if (!refundId) continue;
          const refundKey = `${mpId}:refund:${refundId}`;
          const refundAmount = -Math.abs(Number(rf?.amount ?? 0));
          const refundDate = rf?.date_created ?? p?.date_last_updated ?? new Date().toISOString();
          const refundStatus = String(rf?.status ?? "approved");

          const refundRow = {
            cuenta_mp_id: c.id,
            mp_payment_id: refundKey,
            tipo: "refund",
            status: refundStatus,
            status_detail: rf?.status ?? null,
            payment_method: p?.payment_method_id ?? null,
            payment_type: p?.payment_type_id ?? null,
            amount: refundAmount,
            net_received: refundAmount,
            fee_amount: null,
            currency: p?.currency_id ?? "ARS",
            description: `Refund de pago ${mpId}${p?.description ? ` — ${p.description}` : ""}`,
            payer_email: payerIdentity.email,
            payer_name: payerIdentity.name,
            payer_document: payerIdentity.document,
            external_reference: p?.external_reference ?? null,
            fecha_movimiento: refundDate,
            raw: rf,
            alumno_id: alumnoId,
            reservation_payment_id: resPayId,
            suscripcion_id: subId,
          };

          const { data: existingRf } = await supabase
            .from("mp_account_movements")
            .select("id, assigned_manually")
            .eq("cuenta_mp_id", c.id)
            .eq("mp_payment_id", refundKey)
            .maybeSingle();

          if (existingRf) {
            const patch: any = { ...refundRow };
            if (existingRf.assigned_manually) {
              delete patch.alumno_id;
              delete patch.reservation_payment_id;
              delete patch.suscripcion_id;
            }
            const { error } = await supabase
              .from("mp_account_movements")
              .update(patch)
              .eq("id", existingRf.id);
            if (error) results.errors.push({ cuenta: c.slug, mp: refundKey, error: error.message });
            else updated++;
          } else {
            const { error } = await supabase.from("mp_account_movements").insert(refundRow);
            if (error) results.errors.push({ cuenta: c.slug, mp: refundKey, error: error.message });
            else inserted++;
          }
        }
      }

      offset += items.length;
      if (offset >= total) hasMore = false;
      await sleep(200);
    }

    results.cuentas.push({ cuenta: c.slug, inserted, updated, matched });
  }

  // Segundo paso de conciliación:
  // Payment Search es rápido y aporta el detalle de pagos, pero Mercado Pago
  // puede omitir allí algunos movimientos que sí aparecen en "Actividad".
  // El reporte "Todas las transacciones" funciona como control de completitud.
  //
  // - Cron: lo ejecutamos cada 4 horas para no generar reportes de más.
  // - Sincronización manual de una cuenta: lo ejecutamos siempre para que el
  //   botón "Sincronizar" sea realmente exhaustivo.
  const now = new Date();
  const shouldCronEnrich =
    isCron &&
    !!expectedCronKey &&
    now.getUTCMinutes() < 15 &&
    now.getUTCHours() % 4 === 0;
  const shouldFocusedEnrich = !!cuentaId;

  if (shouldCronEnrich || shouldFocusedEnrich) {
    try {
      const enrichHeaders: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (isCron && expectedCronKey) {
        enrichHeaders["x-cron-key"] = expectedCronKey;
      } else {
        const authHeader = req.headers.get("Authorization");
        if (authHeader) enrichHeaders["Authorization"] = authHeader;
      }

      const enrichResp = await fetch(
        `${Deno.env.get("SUPABASE_URL")}/functions/v1/enrich-mp-settlement-report`,
        {
          method: "POST",
          headers: enrichHeaders,
          body: JSON.stringify({
            days: Math.max(days, 30),
            cuenta_id: cuentaId,
            force_fresh: !!cuentaId,
          }),
        },
      );
      const enrichData = await enrichResp.json().catch(() => null);
      results.enrichment = {
        triggered: true,
        ok: enrichResp.ok,
        status: enrichResp.status,
        result: enrichData,
      };
    } catch (e) {
      results.enrichment = {
        triggered: true,
        ok: false,
        error: (e as Error).message,
      };
    }
  } else {
    results.enrichment = { triggered: false };
  }

  return json(200, { ok: true, ...results });
});
