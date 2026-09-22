// Enriquece mp_account_movements con datos reales de pagador
// (nombre, apellido, documento) leídos del Settlement Report de Mercado Pago.
//
// Estrategia:
//  1) Solicita/reutiliza un settlement report para el rango pedido.
//  2) Espera hasta ~25s a que el reporte esté disponible.
//  3) Descarga el CSV, parsea y completa datos faltantes.
//  4) Para transferencias recibidas, el Settlement Report es la fuente
//     autoritativa de identidad: puede reemplazar nombre/documento/email aunque
//     /v1/payments ya hubiera guardado otros valores.
//  5) Conserva además todos los campos del reporte dentro de raw.settlement_report.
//  6) Si documento/email/nombre coincide de forma única, identifica
//     automáticamente al alumno sin imputar todavía la deuda.
//
// POST /enrich-mp-settlement-report { days?: number, cuenta_id?: string }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (status: number, data: unknown) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

function parseCsv(text: string): Array<Record<string, string>> {
  // Reportes MP: separador `;` habitual, encabezados en la primera línea con datos.
  // Algunos reportes agregan bloques de metadata antes; buscamos la línea con "PAYMENT_ID" o similar.
  const lines = text.split(/\r?\n/);
  let headerIdx = lines.findIndex((l) =>
    /(^|;)(SOURCE_ID|PAYMENT_ID|EXTERNAL_REFERENCE)(;|$)/i.test(l),
  );
  if (headerIdx < 0) headerIdx = 0;
  const sep = (lines[headerIdx].match(/;/g)?.length ?? 0) > 0 ? ";" : ",";
  const headers = lines[headerIdx].split(sep).map((h) => h.trim().toUpperCase());
  const rows: Array<Record<string, string>> = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw || !raw.trim()) continue;
    const cols = raw.split(sep);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => (row[h] = (cols[idx] ?? "").trim()));
    rows.push(row);
  }
  return rows;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Admin logueado, cron legacy (CRON_SECRET) o automatización interna segura.
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

  const body = await req.json().catch(() => ({}));
  // Mercado Pago limita el reporte "Todas las transacciones" a 60 días.
  const days = Math.min(Math.max(Number(body?.days ?? 30), 1), 60);
  const cuentaId: string | undefined = body?.cuenta_id;
  const forceFresh = Boolean(body?.force_fresh ?? false);

  const q = supabase
    .from("cuentas_mp")
    .select("id, slug, nombre, secret_name_token")
    .eq("activa", true);
  if (cuentaId) q.eq("id", cuentaId);
  const { data: cuentas, error: cErr } = await q;
  if (cErr) return json(500, { error: cErr.message });

  const { data: alumnosIdentidad, error: aErr } = await supabase
    .from("alumnos")
    .select("id, nombre, apellido, email, emails_adicionales, documento, nombres_bancarios");
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
    const fullName = normalizeName([(a as any).nombre, (a as any).apellido].filter(Boolean).join(" "));
    addUnique(alumnosByBankName, fullName, (a as any).id);
    for (const n of ((a as any).nombres_bancarios ?? [])) {
      addUnique(alumnosByBankName, normalizeName(n), (a as any).id);
    }
  }

  const beginDate = new Date(Date.now() - days * 86400_000).toISOString();
  const endDate = new Date().toISOString();

  const summary: any = { cuentas: [], errors: [] as any[] };

  for (const c of cuentas ?? []) {
    const mpToken = Deno.env.get((c as any).secret_name_token);
    if (!mpToken) {
      summary.errors.push({ cuenta: c.slug, error: "token_no_configurado" });
      continue;
    }
    const cuentaOut: any = { cuenta: c.slug, enriched: 0, matched: 0, insertedMissing: 0, autoIdentified: 0, pending: false };

    try {
      // Para conciliación completa necesitamos que el reporte incluya retiros
      // y las columnas mínimas que permiten reconstruir movimientos faltantes.
      // Conservamos la configuración existente y sólo agregamos lo necesario.
      try {
        const cfgResp = await fetch(
          "https://api.mercadopago.com/v1/account/settlement_report/config",
          { headers: { Authorization: `Bearer ${mpToken}` } },
        );
        if (cfgResp.ok) {
          const cfg = await cfgResp.json();
          const requiredColumns = [
            "SOURCE_ID",
            "EXTERNAL_REFERENCE",
            "PAYMENT_METHOD_TYPE",
            "PAYMENT_METHOD",
            "TRANSACTION_TYPE",
            "TRANSACTION_AMOUNT",
            "TRANSACTION_CURRENCY",
            "TRANSACTION_DATE",
            "FEE_AMOUNT",
            "SETTLEMENT_NET_AMOUNT",
            "SETTLEMENT_CURRENCY",
            "SETTLEMENT_DATE",
            "REAL_AMOUNT",
          ];
          const currentColumns = Array.isArray(cfg?.columns)
            ? cfg.columns.map((x: any) => String(x?.key ?? "")).filter(Boolean)
            : [];
          const mergedColumns = [...new Set([...currentColumns, ...requiredColumns])];
          const needsUpdate =
            cfg?.include_withdraw !== true ||
            requiredColumns.some((key) => !currentColumns.includes(key));

          if (needsUpdate) {
            const updateBody: any = {
              file_name_prefix: cfg?.file_name_prefix || `settlement-report-${c.slug}`,
              show_fee_prevision: Boolean(cfg?.show_fee_prevision),
              show_chargeback_cancel: cfg?.show_chargeback_cancel !== false,
              coupon_detailed: cfg?.coupon_detailed !== false,
              include_withdraw: true,
              shipping_detail: cfg?.shipping_detail !== false,
              refund_detailed: cfg?.refund_detailed !== false,
              display_timezone: cfg?.display_timezone || "GMT-03",
              header_language: cfg?.header_language || "es",
              frequency: cfg?.frequency || { hour: 0, type: "monthly", value: 1 },
              columns: mergedColumns.map((key) => ({ key })),
            };
            const putResp = await fetch(
              "https://api.mercadopago.com/v1/account/settlement_report/config",
              {
                method: "PUT",
                headers: {
                  Authorization: `Bearer ${mpToken}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify(updateBody),
              },
            );
            if (!putResp.ok) {
              summary.errors.push({ cuenta: c.slug, error: `report_config_${putResp.status}` });
            }
          }
        }
      } catch (e) {
        summary.errors.push({ cuenta: c.slug, error: `report_config_failed: ${(e as Error).message}` });
      }

      let ownEmail = "";
      let ownDocument = "";
      let ownName = "";
      try {
        const meResp = await fetch("https://api.mercadopago.com/users/me", {
          headers: { Authorization: `Bearer ${mpToken}` },
        });
        if (meResp.ok) {
          const me = await meResp.json();
          ownEmail = normalizeEmail(me?.email);
          ownDocument = normalizeDigits(me?.identification?.number);
          ownName = normalizeName([me?.first_name, me?.last_name].filter(Boolean).join(" "));
        } else {
          summary.errors.push({ cuenta: c.slug, error: `mp_profile_${meResp.status}` });
        }
      } catch (e) {
        summary.errors.push({ cuenta: c.slug, error: `mp_profile_fetch_failed: ${(e as Error).message}` });
      }

      // 1) Listar reportes ya disponibles
      const listResp = await fetch(
        `https://api.mercadopago.com/v1/account/settlement_report/list?begin_date=${encodeURIComponent(beginDate)}&end_date=${encodeURIComponent(endDate)}`,
        { headers: { Authorization: `Bearer ${mpToken}` } },
      );
      let files: any[] = [];
      if (listResp.ok) files = await listResp.json().catch(() => []);

      const existingNames = new Set(
        (Array.isArray(files) ? files : [])
          .map((f: any) => String(f?.file_name ?? ""))
          .filter(Boolean),
      );

      // 2) En sync manual pedimos SIEMPRE un reporte fresco: la configuración
      // puede haber cambiado (ej. include_withdraw=true) y reutilizar un CSV
      // viejo dejaría transferencias enviadas afuera del control.
      const recent = Array.isArray(files) ? files.find((f: any) => f?.file_name) : null;
      if (!recent || forceFresh) {
        const createResp = await fetch("https://api.mercadopago.com/v1/account/settlement_report", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${mpToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ begin_date: beginDate, end_date: endDate }),
        }).catch(() => null);

        if (createResp && !createResp.ok) {
          summary.errors.push({ cuenta: c.slug, error: `report_create_${createResp.status}` });
        }

        // Poll ~30s. Si forceFresh, esperamos un nombre de archivo nuevo.
        const deadline = Date.now() + 30_000;
        let freshFound = false;
        while (Date.now() < deadline) {
          await sleep(4000);
          const r = await fetch(
            `https://api.mercadopago.com/v1/account/settlement_report/list?begin_date=${encodeURIComponent(beginDate)}&end_date=${encodeURIComponent(endDate)}`,
            { headers: { Authorization: `Bearer ${mpToken}` } },
          );
          if (!r.ok) continue;

          const arr = await r.json().catch(() => []);
          if (!Array.isArray(arr) || arr.length === 0) continue;

          if (forceFresh) {
            const fresh = arr.find((f: any) => {
              const name = String(f?.file_name ?? "");
              return !!name && !existingNames.has(name);
            });
            if (fresh) {
              files = [fresh, ...arr.filter((f: any) => f !== fresh)];
              freshFound = true;
              break;
            }
          } else {
            files = arr;
            freshFound = true;
            break;
          }
        }

        if (forceFresh && !freshFound) {
          cuentaOut.pending = true;
          cuentaOut.message = "Reporte fresco solicitado a MP; todavía está en preparación.";
          summary.cuentas.push(cuentaOut);
          continue;
        }
      }

      const fileEntry = Array.isArray(files) && files.length ? files[0] : null;
      if (!fileEntry?.file_name) {
        cuentaOut.pending = true;
        cuentaOut.message = "Reporte solicitado a MP; reintentá en 2-3 minutos.";
        summary.cuentas.push(cuentaOut);
        continue;
      }

      // 3) Descargar CSV
      const dl = await fetch(
        `https://api.mercadopago.com/v1/account/settlement_report/${encodeURIComponent(fileEntry.file_name)}`,
        { headers: { Authorization: `Bearer ${mpToken}` } },
      );
      if (!dl.ok) {
        summary.errors.push({ cuenta: c.slug, error: `download_${dl.status}` });
        continue;
      }
      const csv = await dl.text();
      const rows = parseCsv(csv);
      cuentaOut.rows = rows.length;

      // 4) Mergear. Los datos de la propia cuenta receptora se consideran
      // inválidos y pueden limpiarse/reemplazarse.
      for (const r of rows) {
        const paymentId = r.PAYMENT_ID || r.SOURCE_ID || r.OPERATION_ID;
        if (!paymentId) continue;

        const rawName = [r.PAYER_FIRST_NAME || r.PAYER_NAME, r.PAYER_LAST_NAME]
          .filter(Boolean)
          .join(" ")
          .trim() || null;
        const rawEmail = (r.PAYER_EMAIL || r["PAYER_E-MAIL"] || "").trim() || null;
        const rawDoc = (r.PAYER_DOCUMENT_NUMBER || r.PAYER_ID_NUMBER || "").trim() || null;

        const name = rawName && (!ownName || normalizeName(rawName) !== ownName) ? rawName : null;
        const email = rawEmail && (!ownEmail || normalizeEmail(rawEmail) !== ownEmail) ? rawEmail : null;
        const doc = rawDoc && (!ownDocument || normalizeDigits(rawDoc) !== ownDocument) ? rawDoc : null;

        const { data: existing } = await supabase
          .from("mp_account_movements")
          .select("id, payer_name, payer_email, payer_document, alumno_id, assigned_manually, payment_method, payment_type, raw")
          .eq("cuenta_mp_id", c.id)
          .eq("mp_payment_id", String(paymentId))
          .maybeSingle();

        if (!existing) {
          // Payment Search no siempre expone todos los movimientos que sí
          // impactaron el saldo (por ejemplo algunas transferencias enviadas).
          // "Todas las transacciones" es el backstop autoritativo de completitud.
          const transactionType = String(r.TRANSACTION_TYPE || "").toUpperCase();
          const allowedTypes = new Set(["SETTLEMENT", "WITHDRAWAL", "PAYOUT", "WITHDRAWAL_CANCEL"]);
          if (!allowedTypes.has(transactionType)) continue;

          const parseNumber = (value: unknown): number | null => {
            const raw = String(value ?? "").trim();
            if (!raw) return null;
            const n = Number(raw.replace(",", "."));
            return Number.isFinite(n) ? n : null;
          };

          const txAmount = parseNumber(r.TRANSACTION_AMOUNT);
          const netImpact = parseNumber(r.SETTLEMENT_NET_AMOUNT) ?? parseNumber(r.REAL_AMOUNT) ?? txAmount;
          if (netImpact == null || netImpact === 0) continue;

          const amount = Math.abs(txAmount ?? netImpact);
          if (!Number.isFinite(amount) || amount <= 0) continue;

          let alumnoId: string | null = null;
          if (doc) alumnoId = lookupUniqueByDocument(alumnosByDocument, doc);
          if (!alumnoId && email) alumnoId = alumnosByEmail.get(normalizeEmail(email)) ?? null;
          if (!alumnoId && name) alumnoId = alumnosByBankName.get(normalizeName(name)) ?? null;

          const reportDate =
            r.TRANSACTION_DATE ||
            r.SETTLEMENT_DATE ||
            new Date().toISOString();

          const { error: insertErr } = await supabase.from("mp_account_movements").insert({
            cuenta_mp_id: c.id,
            mp_payment_id: String(paymentId),
            tipo: "settlement_report",
            status: "approved",
            status_detail: "settlement_report",
            payment_method: r.PAYMENT_METHOD || null,
            payment_type: r.PAYMENT_METHOD_TYPE || null,
            amount,
            net_received: netImpact,
            fee_amount: Math.abs(parseNumber(r.FEE_AMOUNT) ?? 0),
            currency: r.TRANSACTION_CURRENCY || r.SETTLEMENT_CURRENCY || "ARS",
            description: null,
            payer_email: email,
            payer_name: name,
            payer_document: doc,
            external_reference: r.EXTERNAL_REFERENCE || null,
            fecha_movimiento: reportDate,
            raw: {
              settlement_report: r,
              settlement_report_backfill: true,
            },
            alumno_id: alumnoId,
          });

          if (insertErr) {
            summary.errors.push({ cuenta: c.slug, mp: String(paymentId), error: `report_insert: ${insertErr.message}` });
          } else {
            cuentaOut.insertedMissing++;
            if (alumnoId) cuentaOut.autoIdentified++;
          }
          continue;
        }

        cuentaOut.matched++;

        const existingNameIsOwn = !!existing.payer_name && !!ownName && normalizeName(existing.payer_name) === ownName;
        const existingEmailIsOwn = !!existing.payer_email && !!ownEmail && normalizeEmail(existing.payer_email) === ownEmail;
        const existingDocIsOwn = !!existing.payer_document && !!ownDocument && normalizeDigits(existing.payer_document) === ownDocument;
        const isTransfer = ["account_money", "cvu", "bank_transfer", "bank_transfer_in"].includes(
          String(existing.payment_method ?? existing.payment_type ?? "").toLowerCase(),
        );

        const patch: Record<string, unknown> = {};

        // Guardamos el reporte completo para auditoría y para no perder datos
        // que la UI de Mercado Pago sí conoce (ej. banco emisor / identificadores).
        const previousRaw = existing.raw && typeof existing.raw === "object" ? existing.raw as Record<string, unknown> : {};
        patch.raw = { ...previousRaw, settlement_report: r };

        if (isTransfer) {
          // En transferencias, el reporte de conciliación manda sobre /v1/payments.
          // Nombre y documento se reemplazan cuando el reporte los informa.
          if (name) patch.payer_name = name;
          if (doc) patch.payer_document = doc;

          // payer.email del endpoint de pagos puede ser el mail de la cuenta
          // receptora; sólo conservamos email si el reporte lo confirma.
          patch.payer_email = email;
        } else {
          if ((!existing.payer_name || existingNameIsOwn) && (name || existingNameIsOwn)) patch.payer_name = name;
          if ((!existing.payer_email || existingEmailIsOwn) && (email || existingEmailIsOwn)) patch.payer_email = email;
          if ((!existing.payer_document || existingDocIsOwn) && (doc || existingDocIsOwn)) patch.payer_document = doc;
        }

        if (!existing.assigned_manually) {
          let alumnoId: string | null = null;
          if (doc) alumnoId = lookupUniqueByDocument(alumnosByDocument, doc);
          if (!alumnoId && email) alumnoId = alumnosByEmail.get(normalizeEmail(email)) ?? null;
          if (!alumnoId && name) alumnoId = alumnosByBankName.get(normalizeName(name)) ?? null;
          if (alumnoId && alumnoId !== existing.alumno_id) {
            patch.alumno_id = alumnoId;
            cuentaOut.autoIdentified++;
          }
        }

        if (Object.keys(patch).length === 0) continue;

        const { error: upErr } = await supabase
          .from("mp_account_movements")
          .update(patch)
          .eq("id", existing.id);
        if (!upErr) cuentaOut.enriched++;
      }
    } catch (e) {
      summary.errors.push({ cuenta: c.slug, error: (e as Error).message });
    }

    summary.cuentas.push(cuentaOut);
  }

  return json(200, { ok: true, ...summary });
});
