/**
 * Helper para resolver el precio "vigente" de un paquete de evento según etapas.
 * Si no hay etapas configuradas o ninguna está activa en `now`, devuelve el precio base del paquete.
 */
import { supabase } from "@/integrations/supabase/client";

export interface PriceStage {
  id: string;
  package_id: string;
  nombre: string;
  precio: number;
  currency: string;
  vigente_desde: string; // ISO timestamp
  vigente_hasta: string | null;
  incremento_pct: number | null;
  sort_order: number;
  activo: boolean;
}

export interface ActivePriceResult {
  precio: number;
  currency: string;
  /** Etapa actualmente vigente (si la hay) */
  activeStage: PriceStage | null;
  /** Próxima etapa que entra en vigencia (para countdown) */
  nextStage: PriceStage | null;
}

export async function fetchPriceStages(packageIds: string[]): Promise<Record<string, PriceStage[]>> {
  if (packageIds.length === 0) return {};
  const { data } = await supabase
    .from("event_package_price_stages" as any)
    .select("*")
    .in("package_id", packageIds)
    .eq("activo", true)
    .order("vigente_desde", { ascending: true });
  const map: Record<string, PriceStage[]> = {};
  ((data as any[]) || []).forEach((r) => {
    const row: PriceStage = {
      id: r.id,
      package_id: r.package_id,
      nombre: r.nombre,
      precio: Number(r.precio),
      currency: r.currency,
      vigente_desde: r.vigente_desde,
      vigente_hasta: r.vigente_hasta,
      incremento_pct: r.incremento_pct != null ? Number(r.incremento_pct) : null,
      sort_order: r.sort_order,
      activo: r.activo,
    };
    if (!map[row.package_id]) map[row.package_id] = [];
    map[row.package_id].push(row);
  });
  return map;
}

export function resolveActivePrice(
  basePrecio: number,
  baseCurrency: string,
  stages: PriceStage[] | undefined,
  now: Date = new Date(),
): ActivePriceResult {
  if (!stages || stages.length === 0) {
    return { precio: basePrecio, currency: baseCurrency, activeStage: null, nextStage: null };
  }
  const t = now.getTime();
  let active: PriceStage | null = null;
  let next: PriceStage | null = null;
  for (const s of stages) {
    const desde = new Date(s.vigente_desde).getTime();
    const hasta = s.vigente_hasta ? new Date(s.vigente_hasta).getTime() : null;
    if (desde <= t && (hasta == null || hasta > t)) {
      // si solapan, gana el de vigente_desde más reciente
      if (!active || new Date(active.vigente_desde).getTime() < desde) active = s;
    } else if (desde > t) {
      if (!next || new Date(next.vigente_desde).getTime() > desde) next = s;
    }
  }
  if (!active) {
    return { precio: basePrecio, currency: baseCurrency, activeStage: null, nextStage: next };
  }
  return {
    precio: active.precio,
    currency: active.currency || baseCurrency,
    activeStage: active,
    nextStage: next,
  };
}

/** Diferencia legible para countdown ("en 3 días", "en 5 h", "en 12 min") */
export function formatCountdown(target: string | Date): string {
  const t = typeof target === "string" ? new Date(target).getTime() : target.getTime();
  const diff = t - Date.now();
  if (diff <= 0) return "ahora";
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `en ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 48) return `en ${hrs} h`;
  const days = Math.floor(hrs / 24);
  return `en ${days} días`;
}
