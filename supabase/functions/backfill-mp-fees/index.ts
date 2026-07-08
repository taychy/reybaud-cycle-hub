// Backfill de comisiones MP (últimos N días, por defecto 90).
// Recorre reservation_payments, suscripciones y store_orders con mp_payment_id
// no sincronizado y consulta el detalle a MP para volcar comisión/IIBB/neto.
//
// Uso: POST /backfill-mp-fees  { days?: number, batch?: number, source?: 'all'|'reservas'|'suscripciones'|'tienda' }
// Requiere que el usuario sea admin.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchMpPayment, parseMpFees } from "../_shared/parse-mp-fees.ts";
import { getCuentaMPTokenById } from "../_shared/resolve-cuenta-mp.ts";

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Auth: verificar admin
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
  const days = Math.min(Number(body?.days ?? 90), 365);
  const batch = Math.min(Number(body?.batch ?? 30), 100);
  const source = String(body?.source ?? "all");

  const sinceIso = new Date(Date.now() - days * 86400_000).toISOString();
  const results: any = { reservas: 0, suscripciones: 0, tienda: 0, errores: [] as any[] };

  // Cachea tokens por cuenta para no consultar cuentas_mp en cada pago
  const tokenCache = new Map<string | null, string>();
  async function getToken(cuentaId: string | null | undefined): Promise<string> {
    const key = cuentaId ?? null;
    if (tokenCache.has(key)) return tokenCache.get(key)!;
    const t = await getCuentaMPTokenById(supabase, cuentaId);
    tokenCache.set(key, t);
    return t;
  }

  async function processOne(
    table: "reservation_payments" | "suscripciones" | "store_orders",
    row: { id: string; mp_payment_id: string | null; cuenta_mp_id?: string | null; payment_reference?: string | null; payment_method?: string | null },
  ) {
    let mpId = row.mp_payment_id;
    // reservation_payments legacy: mp_payment_id vacío pero payment_reference tiene el id
    if (!mpId && table === "reservation_payments" && row.payment_method === "mercadopago" && row.payment_reference) {
      const clean = String(row.payment_reference).replace(/[^0-9]/g, "");
      if (clean.length >= 6) mpId = clean;
    }
    if (!mpId) return;
    const accessToken = await getToken(row.cuenta_mp_id);
    if (!accessToken) throw new Error("no_access_token");
    const payment = await fetchMpPayment(mpId, accessToken);
    const fees = parseMpFees(payment);
    const patch: any = {
      comision_mp: fees.comision_mp,
      iibb: fees.iibb,
      otros_fees: fees.otros_fees,
      neto_recibido: fees.neto_recibido,
      fees_synced_at: new Date().toISOString(),
    };
    if (table === "reservation_payments") patch.mp_payment_id = mpId;
    const { error } = await supabase.from(table).update(patch).eq("id", row.id);
    if (error) throw error;
  }

  async function runTable(
    table: "reservation_payments" | "suscripciones" | "store_orders",
    counterKey: "reservas" | "suscripciones" | "tienda",
  ) {
    let query = supabase
      .from(table)
      .select("id, mp_payment_id, cuenta_mp_id" + (table === "reservation_payments" ? ", payment_reference, payment_method" : ""))
      .is("fees_synced_at", null)
      .gte("created_at", sinceIso)
      .limit(batch);
    if (table === "reservation_payments") {
      // no filtramos por mp_payment_id porque legacy usa payment_reference
      query = query.eq("payment_method", "mercadopago").eq("status", "validado");
    } else {
      query = query.not("mp_payment_id", "is", null);
    }
    const { data, error } = await query;
    if (error) throw error;
    for (const row of data ?? []) {
      try {
        await processOne(table, row as any);
        results[counterKey]++;
      } catch (e) {
        results.errores.push({ table, id: (row as any).id, error: String((e as Error).message ?? e) });
      }
      await sleep(220); // ~4-5 req/s
    }
  }

  try {
    if (source === "all" || source === "reservas") await runTable("reservation_payments", "reservas");
    if (source === "all" || source === "suscripciones") await runTable("suscripciones", "suscripciones");
    if (source === "all" || source === "tienda") await runTable("store_orders", "tienda");
  } catch (e) {
    return json(500, { error: String((e as Error).message ?? e), results });
  }

  return json(200, { ok: true, days, batch, results });
});
