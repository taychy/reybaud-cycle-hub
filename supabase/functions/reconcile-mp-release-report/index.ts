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

function parseCsv(text: string): Array<Record<string, string>> {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (!lines.length) return [];

  const headerIdx = Math.max(
    0,
    lines.findIndex((line) => /(^|[;,])(SOURCE_ID|RECORD_TYPE|NET_DEBIT_AMOUNT)([;,]|$)/i.test(line)),
  );
  const header = lines[headerIdx];
  const semis = (header.match(/;/g) || []).length;
  const commas = (header.match(/,/g) || []).length;
  const sep = semis >= commas ? ";" : ",";

  const splitLine = (line: string): string[] => {
    const out: string[] = [];
    let current = "";
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (quoted && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          quoted = !quoted;
        }
      } else if (ch === sep && !quoted) {
        out.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    out.push(current.trim());
    return out;
  };

  const headers = splitLine(header).map((h) => h.trim().toUpperCase());
  const rows: Array<Record<string, string>> = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cols = splitLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = (cols[idx] ?? "").trim();
    });
    rows.push(row);
  }
  return rows;
}

const num = (value: unknown): number | null => {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const normalized = raw.includes(",") && !raw.includes(".")
    ? raw.replace(",", ".")
    : raw.replace(/,/g, "");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
};

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const cronKey = req.headers.get("x-cron-key");
  const expectedCronKey = Deno.env.get("CRON_SECRET");
  const legacyCron = !!expectedCronKey && cronKey === expectedCronKey;

  if (!legacyCron) {
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
  const days = Math.min(Math.max(Number(body?.days ?? 30), 1), 60);
  const cuentaId: string | undefined = body?.cuenta_id;

  const accountsQ = supabase
    .from("cuentas_mp")
    .select("id, slug, nombre, secret_name_token")
    .eq("activa", true);
  if (cuentaId) accountsQ.eq("id", cuentaId);

  const { data: cuentas, error: cuentasErr } = await accountsQ;
  if (cuentasErr) return json(500, { error: cuentasErr.message });

  const beginDate = new Date(Date.now() - days * 86400_000).toISOString();
  const endDate = new Date().toISOString();
  const results: any = { cuentas: [], errors: [] as any[] };

  for (const c of cuentas ?? []) {
    const mpToken = Deno.env.get((c as any).secret_name_token);
    if (!mpToken) {
      results.errors.push({ cuenta: c.slug, error: "token_no_configurado" });
      continue;
    }

    const out: any = {
      cuenta: c.slug,
      rows: 0,
      debitRows: 0,
      matched: 0,
      inserted: 0,
      ambiguous: 0,
      pending: false,
    };

    try {
      const requiredColumns = [
        "DATE",
        "SOURCE_ID",
        "EXTERNAL_REFERENCE",
        "RECORD_TYPE",
        "DESCRIPTION",
        "NET_CREDIT_AMOUNT",
        "NET_DEBIT_AMOUNT",
        "GROSS_AMOUNT",
        "MP_FEE_AMOUNT",
        "TAXES_AMOUNT",
        "PAYMENT_METHOD",
        "CURRENCY",
      ];

      const cfgResp = await fetch("https://api.mercadopago.com/v1/account/release_report/config", {
        headers: { Authorization: `Bearer ${mpToken}` },
      });

      let config: any = null;
      if (cfgResp.ok) config = await cfgResp.json();

      const existingCols = Array.isArray(config?.columns)
        ? config.columns.map((x: any) => String(x?.key ?? "")).filter(Boolean)
        : [];
      const mergedCols = [...new Set([...existingCols, ...requiredColumns])];

      const configPayload = {
        file_name_prefix: config?.file_name_prefix || `release-report-${c.slug}`,
        include_withdrawal_at_end: true,
        execute_after_withdrawal: Boolean(config?.execute_after_withdrawal),
        display_timezone: config?.display_timezone || "GMT-03",
        report_translation: config?.report_translation || "es",
        frequency: {
          hour: Number(config?.frequency?.hour ?? 0),
          type: config?.frequency?.type || "monthly",
          value: config?.frequency?.value ?? 1,
        },
        columns: mergedCols.map((key) => ({ key })),
      };

      if (!config) {
        const createCfg = await fetch("https://api.mercadopago.com/v1/account/release_report/config", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${mpToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(configPayload),
        });
        if (!createCfg.ok) {
          results.errors.push({
            cuenta: c.slug,
            error: `release_config_create_${createCfg.status}`,
            detail: (await createCfg.text()).slice(0, 500),
          });
          continue;
        }
      } else {
        const needsConfig =
          config?.include_withdrawal_at_end !== true ||
          requiredColumns.some((key) => !existingCols.includes(key));
        if (needsConfig) {
          const updateCfg = await fetch("https://api.mercadopago.com/v1/account/release_report/config", {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${mpToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(configPayload),
          });
          if (!updateCfg.ok) {
            results.errors.push({
              cuenta: c.slug,
              error: `release_config_update_${updateCfg.status}`,
              detail: (await updateCfg.text()).slice(0, 500),
            });
            continue;
          }
        }
      }

      const createReport = await fetch("https://api.mercadopago.com/v1/account/release_report", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${mpToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ begin_date: beginDate, end_date: endDate }),
      });

      if (!createReport.ok && createReport.status !== 203) {
        results.errors.push({
          cuenta: c.slug,
          error: `release_report_create_${createReport.status}`,
          detail: (await createReport.text()).slice(0, 500),
        });
        continue;
      }

      const task = await createReport.json().catch(() => ({}));
      const taskId = String(task?.id ?? "");
      const reportId = String(task?.report_id ?? "");

      let reportMeta: any = null;
      const deadline = Date.now() + 35_000;
      while (Date.now() < deadline) {
        await sleep(4000);
        const listResp = await fetch("https://api.mercadopago.com/v1/account/release_report/list", {
          headers: { Authorization: `Bearer ${mpToken}` },
        });
        if (!listResp.ok) continue;
        const list = await listResp.json().catch(() => []);
        if (!Array.isArray(list)) continue;

        reportMeta = list.find((item: any) => {
          const sameTask = taskId && String(item?.id ?? "") === taskId;
          const sameReport = reportId && String(item?.report_id ?? "") === reportId;
          return sameTask || sameReport;
        });

        if (reportMeta?.status === "processed" && reportMeta?.file_name) break;
        reportMeta = null;
      }

      if (!reportMeta?.file_name) {
        out.pending = true;
        out.message = "Reporte Liberaciones solicitado; todavía está en preparación.";
        results.cuentas.push(out);
        continue;
      }

      const download = await fetch(
        `https://api.mercadopago.com/v1/account/release_report/${encodeURIComponent(reportMeta.file_name)}`,
        { headers: { Authorization: `Bearer ${mpToken}` } },
      );
      if (!download.ok) {
        results.errors.push({
          cuenta: c.slug,
          error: `release_report_download_${download.status}`,
        });
        continue;
      }

      const rows = parseCsv(await download.text());
      out.rows = rows.length;

      for (const r of rows) {
        const recordType = String(r.RECORD_TYPE || "").trim().toLowerCase();
        const debit = Math.abs(num(r.NET_DEBIT_AMOUNT) ?? 0);
        if (recordType !== "release" || debit <= 0) continue;
        out.debitRows++;

        const sourceId = String(r.SOURCE_ID || "").trim().replace(/^"|"$/g, "");
        const movementDate = String(r.DATE || "").trim() || new Date().toISOString();
        const description = String(r.DESCRIPTION || "").trim() || "Egreso de dinero disponible";
        const externalReference = String(r.EXTERNAL_REFERENCE || "").trim().replace(/^"|"$/g, "") || null;
        const currency = String(r.CURRENCY || "ARS").trim() || "ARS";

        let existing: any = null;

        if (sourceId) {
          const { data } = await supabase
            .from("mp_account_movements")
            .select("id, raw")
            .eq("cuenta_mp_id", c.id)
            .eq("mp_payment_id", sourceId)
            .maybeSingle();
          existing = data;
        }

        if (!existing) {
          const when = new Date(movementDate);
          if (!Number.isNaN(when.getTime())) {
            const from = new Date(when.getTime() - 5 * 60_000).toISOString();
            const to = new Date(when.getTime() + 5 * 60_000).toISOString();
            const { data: candidates } = await supabase
              .from("mp_account_movements")
              .select("id, raw, amount")
              .eq("cuenta_mp_id", c.id)
              .gte("fecha_movimiento", from)
              .lte("fecha_movimiento", to)
              .gte("amount", Math.max(0, debit - 0.02))
              .lte("amount", debit + 0.02);

            if ((candidates?.length ?? 0) === 1) existing = candidates![0];
            else if ((candidates?.length ?? 0) > 1) {
              out.ambiguous++;
              continue;
            }
          }
        }

        if (existing) {
          const previousRaw =
            existing.raw && typeof existing.raw === "object"
              ? existing.raw as Record<string, unknown>
              : {};
          const { error } = await supabase
            .from("mp_account_movements")
            .update({
              raw: { ...previousRaw, release_report: r },
            })
            .eq("id", existing.id);
          if (error) results.errors.push({ cuenta: c.slug, error: error.message });
          else out.matched++;
          continue;
        }

        const syntheticBase = [
          c.id,
          movementDate,
          sourceId,
          externalReference ?? "",
          recordType,
          description,
          debit.toFixed(2),
          currency,
        ].join("|");
        const syntheticId = sourceId || `release:${await sha256Hex(syntheticBase)}`;

        const { error: insertError } = await supabase.from("mp_account_movements").insert({
          cuenta_mp_id: c.id,
          mp_payment_id: syntheticId,
          tipo: "release_report",
          status: "approved",
          status_detail: "release_report",
          payment_method: r.PAYMENT_METHOD || null,
          payment_type: null,
          amount: debit,
          net_received: -debit,
          fee_amount: Math.abs(num(r.MP_FEE_AMOUNT) ?? 0),
          currency,
          description,
          external_reference: externalReference,
          fecha_movimiento: movementDate,
          raw: {
            release_report: r,
            release_report_backfill: true,
          },
        });

        if (insertError) {
          // Idempotencia: si otra ejecución lo insertó en paralelo, no fallar.
          if (!String(insertError.code || "").includes("23505")) {
            results.errors.push({
              cuenta: c.slug,
              mp: syntheticId,
              error: insertError.message,
            });
          }
        } else {
          out.inserted++;
        }
      }
    } catch (e) {
      results.errors.push({ cuenta: c.slug, error: (e as Error).message });
    }

    results.cuentas.push(out);
  }

  return json(200, { ok: true, ...results });
});
