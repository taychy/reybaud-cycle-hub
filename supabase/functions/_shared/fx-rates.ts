import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type FxCurrency = "ARS" | "USD" | "EUR" | "BRL";
export type FxForeign = Exclude<FxCurrency, "ARS">;
export type FxSide = "buy" | "sell";

export interface FxCurrencyBook {
  reference: number;
  buy: number;
  sell: number;
  buyMarginPct: number;
  sellMarginPct: number;
}

export interface FxBook {
  currencies: Record<FxForeign, FxCurrencyBook>;
  source: string;
  bcraDate: string;
  lastCheckedDate: string;
  updatedAt: string;
  /** true si la referencia se actualizó hoy desde BCRA. */
  fresh: boolean;
  /** true si no se pudo consultar BCRA y se conserva la última cotización válida. */
  stale: boolean;
}

const BCRA_URL = "https://api.bcra.gob.ar/estadisticascambiarias/v1.0/Cotizaciones";
const FOREIGN: FxForeign[] = ["USD", "EUR", "BRL"];
/** Ajuste de COMPRA con signo (puede ser negativo) y recargo de VENTA (positivo). */
const DEFAULT_BUY_ADJUST: Record<FxForeign, number> = { USD: 0.5, EUR: 4, BRL: -0.5 };
const DEFAULT_SELL_MARGIN: Record<FxForeign, number> = { USD: 3.5, EUR: 11, BRL: 11 };

const num = (value: unknown): number => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") return Number(value.replace(",", ".")) || 0;
  return 0;
};

const round4 = (v: number) => Math.round(v * 10000) / 10000;
const clampBuyMargin = (v: number) => Math.min(99.99, Math.max(0, Number.isFinite(v) ? v : 0));
const clampSellMargin = (v: number) => Math.max(0, Number.isFinite(v) ? v : 0);
const lc = (c: string) => c.toLowerCase();

const arDate = () => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
};

async function readConfig(supabase: SupabaseClient) {
  const keys = [
    "fx_source",
    "fx_bcra_date",
    "fx_last_checked_date",
    "fx_updated_at",
    ...FOREIGN.flatMap((c) => [
      `fx_${lc(c)}_ars`,
      `fx_${lc(c)}_reference_ars`,
      `fx_${lc(c)}_margin_pct`,
      `fx_${lc(c)}_buy_margin_pct`,
      `fx_${lc(c)}_sell_margin_pct`,
      `fx_${lc(c)}_buy_ars`,
      `fx_${lc(c)}_sell_ars`,
    ]),
  ];
  const { data } = await supabase.from("app_config").select("key,value").in("key", keys);
  const cfg: Record<string, unknown> = {};
  for (const row of data || []) cfg[row.key] = row.value;
  return cfg;
}

const marginsFromConfig = (cfg: Record<string, unknown>, currency: FxForeign) => {
  const legacyKey = `fx_${lc(currency)}_margin_pct`;
  const hasLegacy = Object.prototype.hasOwnProperty.call(cfg, legacyKey);
  const legacyRaw = hasLegacy ? num(cfg[legacyKey]) : DEFAULT_MARGIN[currency];
  const buyKey = `fx_${lc(currency)}_buy_margin_pct`;
  const sellKey = `fx_${lc(currency)}_sell_margin_pct`;
  const buyRaw = Object.prototype.hasOwnProperty.call(cfg, buyKey) ? num(cfg[buyKey]) : legacyRaw;
  const sellRaw = Object.prototype.hasOwnProperty.call(cfg, sellKey) ? num(cfg[sellKey]) : legacyRaw;
  return { buy: clampBuyMargin(buyRaw), sell: clampSellMargin(sellRaw) };
};

const buildCurrencyBook = (reference: number, buyMarginPct: number, sellMarginPct: number): FxCurrencyBook => ({
  reference: round4(reference),
  buy: round4(reference * (1 - buyMarginPct / 100)),
  sell: round4(reference * (1 + sellMarginPct / 100)),
  buyMarginPct,
  sellMarginPct,
});

/** Reconstruye el book desde app_config sin tocar BCRA. Devuelve null si falta algo. */
function bookFromConfig(cfg: Record<string, unknown>): Record<FxForeign, FxCurrencyBook> | null {
  const out = {} as Record<FxForeign, FxCurrencyBook>;
  for (const currency of FOREIGN) {
    const { buy: buyMarginPct, sell: sellMarginPct } = marginsFromConfig(cfg, currency);
    const reference = num(cfg[`fx_${lc(currency)}_reference_ars`]);
    const storedSell = num(cfg[`fx_${lc(currency)}_sell_ars`]) || num(cfg[`fx_${lc(currency)}_ars`]);
    const storedBuy = num(cfg[`fx_${lc(currency)}_buy_ars`]);

    if (reference > 0) {
      out[currency] = buildCurrencyBook(reference, buyMarginPct, sellMarginPct);
      continue;
    }
    if (storedSell > 0) {
      // Sin referencia guardada: derivamos una referencia implícita desde la venta.
      const implied = storedSell / (1 + sellMarginPct / 100);
      out[currency] = {
        reference: round4(implied),
        buy: storedBuy > 0 ? round4(storedBuy) : round4(implied * (1 - buyMarginPct / 100)),
        sell: round4(storedSell),
        buyMarginPct,
        sellMarginPct,
      };
      continue;
    }
    return null;
  }
  return out;
}

/**
 * Devuelve la Cotización Reybaud vigente (Compra/Venta por moneda).
 * Consulta BCRA como máximo una vez por día salvo `force`.
 * Nunca escribe 0: ante falla de BCRA conserva la última cotización válida.
 */
export async function ensureCurrentFxBook(
  supabase: SupabaseClient,
  opts: { force?: boolean } = {},
): Promise<FxBook> {
  const today = arDate();
  const cfg = await readConfig(supabase);
  const cached = bookFromConfig(cfg);
  const lastChecked = String(cfg.fx_last_checked_date || "");

  if (!opts.force && cached && lastChecked === today) {
    return {
      currencies: cached,
      source: String(cfg.fx_source || "BCRA"),
      bcraDate: String(cfg.fx_bcra_date || ""),
      lastCheckedDate: lastChecked,
      updatedAt: String(cfg.fx_updated_at || ""),
      fresh: true,
      stale: false,
    };
  }

  try {
    const response = await fetch(BCRA_URL, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`BCRA HTTP ${response.status}`);
    const body = await response.json();
    const details = Array.isArray(body?.results?.detalle) ? body.results.detalle : [];

    const updates: Array<{ key: string; value: string; description: string }> = [];
    const currencies = {} as Record<FxForeign, FxCurrencyBook>;

    for (const currency of FOREIGN) {
      const row = details.find((r: any) => String(r?.codigoMoneda || "").toUpperCase() === currency);
      const reference = num(row?.tipoCotizacion);
      if (reference <= 0) throw new Error(`BCRA no devolvió ${currency}`);
      const { buy: buyMarginPct, sell: sellMarginPct } = marginsFromConfig(cfg, currency);
      const book = buildCurrencyBook(reference, buyMarginPct, sellMarginPct);
      currencies[currency] = book;

      updates.push(
        { key: `fx_${lc(currency)}_reference_ars`, value: String(book.reference), description: `Referencia BCRA ${currency} → ARS` },
        { key: `fx_${lc(currency)}_buy_margin_pct`, value: String(buyMarginPct), description: `Margen de compra Reybaud para ${currency}` },
        { key: `fx_${lc(currency)}_sell_margin_pct`, value: String(sellMarginPct), description: `Margen de venta Reybaud para ${currency}` },
        { key: `fx_${lc(currency)}_buy_ars`, value: String(book.buy), description: `Compra Reybaud ${currency} → ARS` },
        { key: `fx_${lc(currency)}_sell_ars`, value: String(book.sell), description: `Venta Reybaud ${currency} → ARS` },
        // Alias legado: siempre igual a la VENTA.
        { key: `fx_${lc(currency)}_ars`, value: String(book.sell), description: `Cotización Reybaud ${currency} → ARS (alias de venta)` },
      );
    }

    const updatedAt = new Date().toISOString();
    const bcraDate = String(body?.results?.fecha || "");
    updates.push(
      { key: "fx_source", value: "BCRA", description: "Fuente de cotización de monedas" },
      { key: "fx_bcra_date", value: bcraDate, description: "Fecha de referencia informada por BCRA" },
      { key: "fx_last_checked_date", value: today, description: "Último día local en que se consultó BCRA" },
      { key: "fx_updated_at", value: updatedAt, description: "Última actualización de Cotización Reybaud" },
    );

    const { error } = await supabase.from("app_config").upsert(updates as any, { onConflict: "key" });
    if (error) throw error;

    return {
      currencies,
      source: "BCRA",
      bcraDate,
      lastCheckedDate: today,
      updatedAt,
      fresh: true,
      stale: false,
    };
  } catch (error) {
    console.error("[fx-rates] No se pudo actualizar desde BCRA; se conserva la última cotización válida", error);
    if (cached) {
      return {
        currencies: cached,
        source: String(cfg.fx_source || "BCRA"),
        bcraDate: String(cfg.fx_bcra_date || ""),
        lastCheckedDate: lastChecked,
        updatedAt: String(cfg.fx_updated_at || ""),
        fresh: false,
        stale: true,
      };
    }
    throw new Error("No hay una Cotización Reybaud válida disponible");
  }
}

/** Compatibilidad: mapa de VENTA por moneda extranjera. */
export async function ensureCurrentFxRates(supabase: SupabaseClient) {
  const book = await ensureCurrentFxBook(supabase);
  return Object.fromEntries(
    FOREIGN.map((c) => [c, book.currencies[c].sell]),
  ) as Record<FxForeign, number>;
}

/** ARS por unidad de `currency` según el lado indicado (venta por defecto). */
export async function getReybaudFxRate(
  supabase: SupabaseClient,
  currency: string,
  side: FxSide = "sell",
): Promise<number> {
  const code = String(currency || "ARS").toUpperCase() as FxCurrency;
  if (code === "ARS") return 1;
  if (!FOREIGN.includes(code as FxForeign)) throw new Error(`Moneda no soportada: ${code}`);
  const book = await ensureCurrentFxBook(supabase);
  const rate = book.currencies[code as FxForeign][side];
  if (!rate || rate <= 0) throw new Error(`Sin cotización vigente para ${code} (${side})`);
  return rate;
}

/**
 * Convierte un monto expresado en `fromCurrency` (obligación) a `toCurrency` (moneda de pago).
 * Reglas Reybaud: vendemos la moneda de la obligación, compramos la moneda que entrega el cliente.
 */
export function convertWithBook(
  book: FxBook,
  amount: number,
  fromCurrency: string,
  toCurrency: string,
): { amount: number; rate: number; sideFrom: FxSide | null; sideTo: FxSide | null } {
  const from = String(fromCurrency || "ARS").toUpperCase();
  const to = String(toCurrency || "ARS").toUpperCase();
  if (from === to) return { amount, rate: 1, sideFrom: null, sideTo: null };

  const arsPerFrom = from === "ARS" ? 1 : book.currencies[from as FxForeign]?.sell;
  const arsPerTo = to === "ARS" ? 1 : book.currencies[to as FxForeign]?.buy;
  if (!arsPerFrom || !arsPerTo) throw new Error("Sin cotización vigente para la conversión pedida");

  const rate = arsPerFrom / arsPerTo;
  return {
    amount: amount * rate,
    rate,
    sideFrom: from === "ARS" ? null : "sell",
    sideTo: to === "ARS" ? null : "buy",
  };
}
