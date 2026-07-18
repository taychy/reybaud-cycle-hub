// Enriquece mp_account_movements con datos reales de pagador
// (nombre, apellido, documento) leídos del Settlement Report de Mercado Pago.
//
// Estrategia:
//  1) Solicita/reutiliza un settlement report para el rango pedido.
//  2) Espera hasta ~25s a que el reporte esté disponible.
//  3) Descarga el CSV, parsea y actualiza los movimientos cuyos campos
//     de pagador estén vacíos (merge-only, nunca pisa datos existentes).
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

  const body = await req.json().catch(() => ({}));
  const days = Math.min(Math.max(Number(body?.days ?? 30), 1), 90);
  const cuentaId: string | undefined = body?.cuenta_id;

  const q = supabase
    .from("cuentas_mp")
    .select("id, slug, nombre, secret_name_token")
    .eq("activa", true);
  if (cuentaId) q.eq("id", cuentaId);
  const { data: cuentas, error: cErr } = await q;
  if (cErr) return json(500, { error: cErr.message });

  const beginDate = new Date(Date.now() - days * 86400_000).toISOString();
  const endDate = new Date().toISOString();

  const summary: any = { cuentas: [], errors: [] as any[] };

  for (const c of cuentas ?? []) {
    const mpToken = Deno.env.get((c as any).secret_name_token);
    if (!mpToken) {
      summary.errors.push({ cuenta: c.slug, error: "token_no_configurado" });
      continue;
    }
    const cuentaOut: any = { cuenta: c.slug, enriched: 0, matched: 0, pending: false };

    try {
      // 1) Listar reportes ya disponibles
      const listResp = await fetch(
        `https://api.mercadopago.com/v1/account/settlement_report/list?begin_date=${encodeURIComponent(beginDate)}&end_date=${encodeURIComponent(endDate)}`,
        { headers: { Authorization: `Bearer ${mpToken}` } },
      );
      let files: any[] = [];
      if (listResp.ok) files = await listResp.json().catch(() => []);
      // 2) Si no hay reciente, agendar uno nuevo
      const recent = Array.isArray(files) ? files.find((f: any) => f?.file_name) : null;
      if (!recent) {
        await fetch("https://api.mercadopago.com/v1/account/settlement_report", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${mpToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ begin_date: beginDate, end_date: endDate }),
        }).catch(() => null);

        // Poll ~25s
        const deadline = Date.now() + 25_000;
        while (Date.now() < deadline) {
          await sleep(4000);
          const r = await fetch(
            `https://api.mercadopago.com/v1/account/settlement_report/list?begin_date=${encodeURIComponent(beginDate)}&end_date=${encodeURIComponent(endDate)}`,
            { headers: { Authorization: `Bearer ${mpToken}` } },
          );
          if (r.ok) {
            const arr = await r.json().catch(() => []);
            if (Array.isArray(arr) && arr.length) {
              files = arr;
              break;
            }
          }
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

      // 4) Mergear (sólo campos vacíos)
      for (const r of rows) {
        const paymentId = r.PAYMENT_ID || r.SOURCE_ID || r.OPERATION_ID;
        if (!paymentId) continue;

        const name = [r.PAYER_FIRST_NAME || r.PAYER_NAME, r.PAYER_LAST_NAME]
          .filter(Boolean)
          .join(" ")
          .trim() || null;
        const email = (r.PAYER_EMAIL || r["PAYER_E-MAIL"] || "").trim() || null;
        const doc = (r.PAYER_DOCUMENT_NUMBER || r.PAYER_ID_NUMBER || "").trim() || null;

        if (!name && !email && !doc) continue;

        const { data: existing } = await supabase
          .from("mp_account_movements")
          .select("id, payer_name, payer_email, payer_document")
          .eq("cuenta_mp_id", c.id)
          .eq("mp_payment_id", String(paymentId))
          .maybeSingle();
        if (!existing) continue;
        cuentaOut.matched++;

        const patch: Record<string, string> = {};
        if (name && !existing.payer_name) patch.payer_name = name;
        if (email && !existing.payer_email) patch.payer_email = email;
        if (doc && !existing.payer_document) patch.payer_document = doc;
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
