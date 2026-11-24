import { supabase } from "@/integrations/supabase/client";

export type TarifaTipo = "plan" | "servicio_turnera";

/** Precio de lista vigente en `fecha` (YYYY-MM-DD), resuelto por el servidor
 * con la misma regla que aplica al crear la obligación. null = usar catálogo. */
export async function fetchTarifaVigente(tipo: TarifaTipo, id: string, fecha: string): Promise<number | null> {
  const fn = tipo === "plan" ? "tarifa_vigente_plan" : "tarifa_vigente_servicio_turnera";
  const args = tipo === "plan" ? { _plan_id: id, _fecha: fecha } : { _servicio_id: id, _fecha: fecha };
  const { data, error } = await supabase.rpc(fn as any, args as any);
  if (error || data == null) return null;
  const n = Number(data);
  return Number.isFinite(n) ? n : null;
}

/** Reemplaza el precio de catálogo por la tarifa vigente cuando existe. */
export function withTarifaVigente<T extends { id: string; precio: number | null }>(
  items: T[],
  tarifas: Record<string, number | null | undefined>,
): T[] {
  return items.map((it) => {
    const t = tarifas[it.id];
    return t != null && t !== Number(it.precio) ? { ...it, precio: t } : it;
  });
}
