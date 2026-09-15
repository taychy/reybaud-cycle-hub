import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type FxCurrency = "ARS" | "USD" | "EUR" | "BRL";

const BCRA_URL = "https://api.bcra.gob.ar/estadisticascambiarias/v1.0/Cotizaciones";
const FOREIGN: Exclude<FxCurrency, "ARS">[] = ["USD", "EUR", "BRL"];
const DEFAULT_MARGIN: Record<Exclude<FxCurrency, "ARS">, number> = {
  USD: 4,
  EUR: 5,
  BRL: 7,
};

const num = (value: unknown): number => {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value.replace(",", ".")) || 0;
  return 0;
};

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
    "fx_last_checked_date",
    ...FOREIGN.flatMap((c) => [
      `fx_${c.toLowerCase()}_ars`,
      `fx_${c.toLowerCase()}_reference_ars`,
      `fx_${c.toLowerCase()}_margin_pct`,
    ]),
  ];
  const { data } = await supabase.from("app_config").select("key,value").in("key", keys);
  const cfg: Record<string, unknown> = {};
  for (const row of data || []) cfg[row.key] = row.value;
  return cfg;
}

export async function ensureCurrentFxRates(supabase: SupabaseClient) {
  const today = arDate();
  const cfg = await readConfig(supabase);
  const cached = Object.fromEntries(
    FOREIGN.map((c) => [c, num(cfg[`fx_${c.toLowerCase()}_ars`])]),
  ) as Record<Exclude<FxCurrency, "ARS">, number>;

  if (String(cfg.fx_last_checked_date || "") === today && FOREIGN.every((c) => cached[c] > 0)) {
    return cached;
  }

  try {
    const response = await fetch(BCRA_URL, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`BCRA HTTP ${response.status}`);
    const body = await response.json();
    const details = Array.isArray(body?.results?.detalle) ? body.results.detalle : [];

    const updates: Array<{ key: string; value: string; description: string }> = [];
    const effective = {} as Record<Exclude<FxCurrency, "ARS">, number>;

    for (const currency of FOREIGN) {
      const row = details.find((r: any) => String(r?.codigoMoneda || "").toUpperCase() === currency);
      const reference = num(row?.tipoCotizacion);
      if (reference <= 0) throw new Error(`BCRA no devolvió ${currency}`);
      const marginKey = `fx_${currency.toLowerCase()}_margin_pct`;
      const hasConfiguredMargin = Object.prototype.hasOwnProperty.call(cfg, marginKey);
      const margin = hasConfiguredMargin ? Math.max(0, num(cfg[marginKey])) : DEFAULT_MARGIN[currency];
      const rate = Math.round(reference * (1 + margin / 100) * 10000) / 10000;
      effective[currency] = rate;

      updates.push(
        { key: `fx_${currency.toLowerCase()}_reference_ars`, value: String(reference), description: `Referencia BCRA ${currency} → ARS` },
        { key: marginKey, value: String(margin), description: `Margen de seguridad Reybaud para ${currency}` },
        { key: `fx_${currency.toLowerCase()}_ars`, value: String(rate), description: `Cotización Reybaud ${currency} → ARS` },
      );
    }

    updates.push(
      { key: "fx_source", value: "BCRA", description: "Fuente de cotización de monedas" },
      { key: "fx_bcra_date", value: String(body?.results?.fecha || ""), description: "Fecha de referencia informada por BCRA" },
      { key: "fx_last_checked_date", value: today, description: "Último día local en que se consultó BCRA" },
      { key: "fx_updated_at", value: new Date().toISOString(), description: "Última actualización de Cotización Reybaud" },
    );

    const { error } = await supabase.from("app_config").upsert(updates as any, { onConflict: "key" });
    if (error) throw error;
    return effective;
  } catch (error) {
    console.error("[fx-rates] No se pudo actualizar desde BCRA; se conserva la última cotización válida", error);
    if (FOREIGN.every((c) => cached[c] > 0)) return cached;
    throw new Error("No hay una Cotización Reybaud válida disponible");
  }
}

export async function getReybaudFxRate(supabase: SupabaseClient, currency: string): Promise<number> {
  const code = String(currency || "ARS").toUpperCase() as FxCurrency;
  if (code === "ARS") return 1;
  if (!FOREIGN.includes(code as Exclude<FxCurrency, "ARS">)) throw new Error(`Moneda no soportada: ${code}`);
  const rates = await ensureCurrentFxRates(supabase);
  const rate = rates[code as Exclude<FxCurrency, "ARS">];
  if (!rate || rate <= 0) throw new Error(`Sin cotización vigente para ${code}`);
  return rate;
}
