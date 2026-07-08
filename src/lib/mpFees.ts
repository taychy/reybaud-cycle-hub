/**
 * Helpers de comisiones MP para la UI.
 */
import { formatPrice } from "./currency";

export interface EventPnL {
  ingresos_brutos: number;
  comision_mp_total: number;
  ingresos_netos: number;
  gastos_directos: number;
  honorarios_coaches: number;
  resultado: number;
  moneda: string;
  pagos_count: number;
  pagos_sin_fees: number;
}

export const formatPnl = (n: number, moneda = "ARS") => formatPrice(Number(n) || 0, moneda);

export const pnlColor = (n: number): string =>
  n > 0 ? "text-green-400" : n < 0 ? "text-red-400" : "text-muted-foreground";
