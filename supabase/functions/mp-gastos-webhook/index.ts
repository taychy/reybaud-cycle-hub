// Webhook de Mercado Pago para Gastos
// Valida firma HMAC, consulta detalle del pago en MP y actualiza/crea gastos.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (status: number, data: unknown) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function parseSignatureHeader(h: string | null): { ts?: string; v1?: string } {
  if (!h) return {};
  const out: Record<string, string> = {};
  for (const part of h.split(",")) {
    const [k, v] = part.split("=").map((s) => s?.trim());
    if (k && v) out[k] = v;
  }
  return { ts: out.ts, v1: out.v1 };
}

async function verifySignature(req: Request, dataId: string, secret: string): Promise<boolean> {
  const sigHeader = req.headers.get("x-signature");
  const requestId = req.headers.get("x-request-id") ?? "";
  const { ts, v1 } = parseSignatureHeader(sigHeader);
  if (!ts || !v1) return false;
  // Manifest oficial MP: id:<data.id>;request-id:<x-request-id>;ts:<ts>;
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const computed = await hmacSha256Hex(secret, manifest);
  // Comparación segura
  if (computed.length !== v1.length) return false;
  let diff = 0;
  for (let i = 0; i < computed.length; i++) diff |= computed.charCodeAt(i) ^ v1.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const url = new URL(req.url);
  const rawBody = await req.text();
  let body: any = {};
  try { body = rawBody ? JSON.parse(rawBody) : {}; } catch { body = {}; }

  const headersObj: Record<string, string> = {};
  req.headers.forEach((v, k) => { headersObj[k] = v; });

  const eventType = body?.type ?? body?.action ?? url.searchParams.get("type") ?? "unknown";
  const dataId = String(
    body?.data?.id ?? url.searchParams.get("data.id") ?? url.searchParams.get("id") ?? "",
  );

  const logBase = {
    mp_event_type: String(eventType),
    mp_payment_id: dataId || null,
    raw_headers: headersObj,
    raw_body: body,
  };

  // Solo procesamos pagos
  if (!String(eventType).includes("payment") || !dataId) {
    await supabase.from("gastos_mp_webhook_log").insert({
      ...logBase, signature_valid: null, http_status: 200, decision: "ignored_non_payment",
    });
    return json(200, { ok: true, ignored: true });
  }

  // Validación HMAC
  const secret = Deno.env.get("MP_WEBHOOK_SECRET");
  if (!secret) {
    await supabase.from("gastos_mp_webhook_log").insert({
      ...logBase, signature_valid: false, http_status: 500, decision: "missing_secret",
      error: "MP_WEBHOOK_SECRET not configured",
    });
    return json(500, { error: "missing_secret" });
  }

  const sigOk = await verifySignature(req, dataId, secret);
  if (!sigOk) {
    await supabase.from("gastos_mp_webhook_log").insert({
      ...logBase, signature_valid: false, http_status: 401, decision: "invalid_signature",
    });
    return json(401, { error: "invalid_signature" });
  }

  // Traer detalle del pago desde MP
  const mpToken = Deno.env.get("MP_ACCESS_TOKEN");
  if (!mpToken) {
    await supabase.from("gastos_mp_webhook_log").insert({
      ...logBase, signature_valid: true, http_status: 500, decision: "missing_mp_token",
      error: "MP_ACCESS_TOKEN not configured",
    });
    return json(500, { error: "missing_mp_token" });
  }

  let mpPayment: any = null;
  try {
    const r = await fetch(`https://api.mercadopago.com/v1/payments/${dataId}`, {
      headers: { Authorization: `Bearer ${mpToken}` },
    });
    if (!r.ok) {
      const txt = await r.text();
      await supabase.from("gastos_mp_webhook_log").insert({
        ...logBase, signature_valid: true, http_status: r.status, decision: "mp_api_error",
        error: txt.slice(0, 500),
      });
      // Devolver 200 para que MP no reintente infinitamente si el pago no existe
      return json(200, { ok: false, mp_status: r.status });
    }
    mpPayment = await r.json();
  } catch (e) {
    await supabase.from("gastos_mp_webhook_log").insert({
      ...logBase, signature_valid: true, http_status: 502, decision: "mp_fetch_failed",
      error: String((e as Error).message ?? e),
    });
    return json(502, { error: "mp_fetch_failed" });
  }

  const monto = Number(mpPayment?.transaction_amount ?? 0);
  const moneda = String(mpPayment?.currency_id ?? "ARS");
  const fechaIso: string | null = mpPayment?.date_approved ?? mpPayment?.date_created ?? null;
  const fecha = fechaIso ? fechaIso.slice(0, 10) : new Date().toISOString().slice(0, 10);
  const mpStatus = String(mpPayment?.status ?? "unknown");
  const externalRef: string = String(mpPayment?.external_reference ?? "");
  const descripcion = mpPayment?.description ?? null;
  const proveedor = mpPayment?.payer?.email
    ?? [mpPayment?.payer?.first_name, mpPayment?.payer?.last_name].filter(Boolean).join(" ")
    ?? null;

  // Ruteo por external_reference
  let decision = "unknown";
  let gastoId: string | null = null;
  let error: string | null = null;

  try {
    if (externalRef.startsWith("gasto:")) {
      const id = externalRef.slice("gasto:".length);
      const { error: rpcErr } = await supabase.rpc("apply_mp_payment_to_gasto", {
        p_gasto_id: id,
        p_mp_payment_id: dataId,
        p_mp_status: mpStatus,
        p_monto: monto,
        p_fecha: fecha,
        p_external_reference: externalRef,
      });
      if (rpcErr) throw rpcErr;
      decision = "applied_to_gasto";
      gastoId = id;
    } else if (externalRef.startsWith("gasto_ejec:") && mpStatus === "approved") {
      const id = externalRef.slice("gasto_ejec:".length);
      const { data: newGastoId, error: rpcErr } = await supabase.rpc("pay_gasto_ejecucion", {
        p_id: id,
        p_monto: monto,
        p_fecha: fecha,
        p_forma_pago: "mercadopago",
        p_notas: `MP payment ${dataId}`,
      });
      if (rpcErr) throw rpcErr;
      decision = "paid_ejecucion";
      gastoId = (newGastoId as string) ?? null;
      // Marcar el gasto creado con datos MP
      if (gastoId) {
        await supabase.from("gastos").update({
          mp_payment_id: dataId,
          mp_status: mpStatus,
          mp_external_reference: externalRef,
          origen_registro: "mp_link",
          estado_conciliacion: "conciliado",
        }).eq("id", gastoId);
      }
    } else {
      // Sin referencia → crear gasto pendiente de conciliar (idempotente)
      const { data: newId, error: rpcErr } = await supabase.rpc("create_gasto_from_mp", {
        p_mp_payment_id: dataId,
        p_mp_status: mpStatus,
        p_monto: monto,
        p_moneda: moneda,
        p_fecha: fecha,
        p_descripcion: descripcion,
        p_proveedor: proveedor,
      });
      if (rpcErr) throw rpcErr;
      decision = "created_pending_reconciliation";
      gastoId = (newId as string) ?? null;
    }
  } catch (e) {
    error = String((e as any)?.message ?? e);
    decision = "rpc_error";
  }

  await supabase.from("gastos_mp_webhook_log").insert({
    ...logBase,
    signature_valid: true,
    http_status: error ? 500 : 200,
    decision,
    gasto_id: gastoId,
    error,
    mp_payment_raw: mpPayment,
  });

  if (error) return json(500, { error });
  return json(200, { ok: true, decision, gasto_id: gastoId });
});
