// Helpers para calcular cobrado / total / saldo pendiente por cliente en listas de entrega.

export interface DeliveryItemLike {
  cliente_nombre: string;
  cantidad: number | string;
  precio_venta?: number | string | null;
  moneda?: string | null;
}

export interface DeliveryPaymentLike {
  cliente_nombre: string;
  monto: number | string;
  moneda?: string | null;
  validado?: boolean;
}

export interface BalanceRow {
  moneda: string;
  total: number;
  cobrado: number;
  pendiente: number;
}

export type BalancesByClient = Record<string, BalanceRow[]>;

export function computeDeliveryBalances(
  items: DeliveryItemLike[],
  payments: DeliveryPaymentLike[],
): BalancesByClient {
  const totals: Record<string, Record<string, number>> = {};
  const cobrados: Record<string, Record<string, number>> = {};

  for (const i of items) {
    const cli = i.cliente_nombre;
    const cur = i.moneda || "ARS";
    const sub = Number(i.precio_venta || 0) * Number(i.cantidad || 1);
    if (!sub) continue;
    (totals[cli] ||= {})[cur] = (totals[cli]?.[cur] || 0) + sub;
  }
  for (const p of payments) {
    if (p.validado === false) continue; // sólo cobros validados
    const cli = p.cliente_nombre;
    const cur = p.moneda || "ARS";
    const monto = Number(p.monto || 0);
    if (!monto) continue;
    (cobrados[cli] ||= {})[cur] = (cobrados[cli]?.[cur] || 0) + monto;
  }

  const out: BalancesByClient = {};
  const clientes = new Set([...Object.keys(totals), ...Object.keys(cobrados)]);
  clientes.forEach((cli) => {
    const monedas = new Set([
      ...Object.keys(totals[cli] || {}),
      ...Object.keys(cobrados[cli] || {}),
    ]);
    const rows: BalanceRow[] = [];
    monedas.forEach((m) => {
      const total = totals[cli]?.[m] || 0;
      const cob = cobrados[cli]?.[m] || 0;
      rows.push({ moneda: m, total, cobrado: cob, pendiente: Math.max(0, total - cob) });
    });
    out[cli] = rows.sort((a, b) => a.moneda.localeCompare(b.moneda));
  });
  return out;
}

const SYMBOL: Record<string, string> = { ARS: "$", USD: "US$", EUR: "€" };
export const fmtMoneyBalance = (n: number, cur: string) =>
  `${SYMBOL[cur] || ""} ${(Math.round(n * 100) / 100).toLocaleString("es-AR")}`.trim();
