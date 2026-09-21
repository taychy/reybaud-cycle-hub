import { supabase } from "@/integrations/supabase/client";

export type FxForeign = "USD" | "EUR" | "BRL";
export type FxCurrency = "ARS" | FxForeign;
export type FxSide = "buy" | "sell";

export const FX_FOREIGN: FxForeign[] = ["USD", "EUR", "BRL"];

/** Ajuste de COMPRA con signo (puede ser negativo) y recargo de VENTA (positivo). */
export const FX_DEFAULT_BUY_ADJUST: Record<FxForeign, number> = { USD: 0.5, EUR: 4, BRL: -0.5 };
export const FX_DEFAULT_SELL_MARGIN: Record<FxForeign, number> = { USD: 3.5, EUR: 11, BRL: 11 };

export const fxRound4 = (v: number) => Math.round(v * 10000) / 10000;

/** compra = referencia * (1 + ajusteCompraPct / 100). El ajuste puede ser negativo. */
export const fxBuyFromReference = (reference: number, buyAdjustPct: number) =>
  fxRound4(reference * (1 + buyAdjustPct / 100));

/** venta = referencia * (1 + margenVentaPct / 100). El margen no puede ser negativo. */
export const fxSellFromReference = (reference: number, sellMarginPct: number) =>
  fxRound4(reference * (1 + sellMarginPct / 100));
export const FX_CURRENCIES: FxCurrency[] = ["ARS", "USD", "EUR", "BRL"];

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
  fresh: boolean;
  stale: boolean;
}

/** Trae la cotización vigente; el backend actualiza desde BCRA si no se consultó hoy. */
export async function fetchCurrentFxBook(force = false): Promise<FxBook> {
  const { data, error } = await supabase.functions.invoke("get-current-fx", {
    body: { force },
  });
  if (error) throw new Error(error.message || "No pudimos obtener la cotización vigente");
  if (!data?.book) throw new Error(data?.error || "No hay cotización disponible");
  return data.book as FxBook;
}

export const fxArsPerUnit = (book: FxBook, currency: string, side: FxSide): number => {
  const code = String(currency || "ARS").toUpperCase();
  if (code === "ARS") return 1;
  const row = book.currencies?.[code as FxForeign];
  if (!row) throw new Error(`Sin cotización para ${code}`);
  const value = row[side];
  if (!value || value <= 0) throw new Error(`Sin cotización para ${code}`);
  return value;
};

export interface FxConversion {
  amount: number;
  rate: number;
  /** ARS por unidad de la moneda de la obligación (lado venta). */
  arsPerFrom: number;
  /** ARS por unidad de la moneda de pago (lado compra). */
  arsPerTo: number;
  explanation: string;
}

const fmtArs = (v: number) =>
  `$${v.toLocaleString("es-AR", { maximumFractionDigits: 2 })}`;

/**
 * Convierte una obligación en `from` al monto a cobrar en `to`.
 * Reybaud VENDE la moneda de la obligación y COMPRA la moneda que entrega el cliente.
 */
export function convertObligation(
  book: FxBook,
  amount: number,
  from: string,
  to: string,
): FxConversion {
  const fromCode = String(from || "ARS").toUpperCase();
  const toCode = String(to || "ARS").toUpperCase();
  if (fromCode === toCode) {
    return {
      amount,
      rate: 1,
      arsPerFrom: 1,
      arsPerTo: 1,
      explanation: "Misma moneda · sin conversión",
    };
  }

  const arsPerFrom = fxArsPerUnit(book, fromCode, "sell");
  const arsPerTo = fxArsPerUnit(book, toCode, "buy");
  const rate = arsPerFrom / arsPerTo;

  let explanation: string;
  if (toCode === "ARS") {
    explanation = `Venta Reybaud ${fromCode} · ${fromCode} 1 = ${fmtArs(arsPerFrom)}`;
  } else if (fromCode === "ARS") {
    explanation = `Compra Reybaud ${toCode} · ${toCode} 1 = ${fmtArs(arsPerTo)}`;
  } else {
    explanation = `Conversión cruzada vía ARS · Venta ${fromCode} + Compra ${toCode}`;
  }

  return { amount: amount * rate, rate, arsPerFrom, arsPerTo, explanation };
}

/**
 * Cotización a aplicar sobre un pago para expresarlo en la moneda del evento.
 * pago ARS → evento extranjero E: 1 / SELL(E)
 * pago extranjero P → evento ARS: BUY(P)
 * pago extranjero P → evento extranjero E: BUY(P) / SELL(E)
 */
export function rateToEvent(
  book: FxBook,
  paymentCurrency: string,
  eventCurrency: string,
): number {
  const pay = String(paymentCurrency || "ARS").toUpperCase();
  const ev = String(eventCurrency || "ARS").toUpperCase();
  if (pay === ev) return 1;
  const arsPerPay = pay === "ARS" ? 1 : fxArsPerUnit(book, pay, "buy");
  const arsPerEvent = ev === "ARS" ? 1 : fxArsPerUnit(book, ev, "sell");
  return arsPerPay / arsPerEvent;
}

export const formatFxArs = fmtArs;

export const fxStatusLabel = (book: FxBook | null): string => {
  if (!book) return "Sin datos";
  if (book.fresh) return "Actualizada hoy";
  const when = book.updatedAt
    ? new Date(book.updatedAt).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })
    : book.lastCheckedDate || "—";
  return `Última actualización ${when}`;
};
