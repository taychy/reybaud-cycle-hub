/**
 * Sincronización mínima entre la ubicación física (vehiculo_carga_items)
 * y el estado logístico del pedido de tienda (store_orders.status).
 *
 * Regla: `vehiculo_carga_items` es la fuente de verdad de dónde está la
 * mercadería. Un pedido sólo puede quedar en `en_camioneta` si sus ítems
 * están realmente cargados en una caja activa.
 */
import { supabase } from "@/integrations/supabase/client";

const ESTADOS_CARGA_ACTIVA = ["abierta", "en_ruta"];

export const variantLabel = (v: any): string | null => {
  if (!v || typeof v !== "object") return null;
  const parts = Object.values(v).filter((x) => x !== null && x !== undefined && String(x).trim() !== "");
  return parts.length ? parts.map(String).join(" / ") : null;
};

export interface CamionetaSyncResult {
  ok: boolean;
  reason?: string;
  inserted: number;
  cargaId?: string;
}

/**
 * Garantiza representación física del pedido en una caja activa.
 * No inventa sede ni carga: si no hay una única carga activa compatible,
 * devuelve ok=false y no escribe nada.
 */
export const ensureOrderInCamioneta = async (orderId: string): Promise<CamionetaSyncResult> => {
  const { data: order, error: oErr } = await supabase
    .from("store_orders")
    .select("id,customer_name,alumno_id,sede_retiro_id,items:store_order_items(id,product_name,variant_selection,quantity)")
    .eq("id", orderId)
    .maybeSingle();
  if (oErr || !order) return { ok: false, inserted: 0, reason: oErr?.message || "No se encontró el pedido" };

  const items = ((order as any).items || []) as any[];
  if (items.length === 0) return { ok: false, inserted: 0, reason: "El pedido no tiene productos para cargar" };

  const { data: cargas } = await (supabase as any)
    .from("vehiculo_cargas")
    .select("id,sede_id,estado")
    .in("estado", ESTADOS_CARGA_ACTIVA);
  const activas = ((cargas as any[]) || []);
  const sedeId = (order as any).sede_retiro_id as string | null;
  const compatibles = sedeId ? activas.filter((c) => c.sede_id === sedeId) : activas;

  if (compatibles.length === 0) {
    return { ok: false, inserted: 0, reason: "No hay una caja activa compatible. Incorporá el pedido desde Camioneta." };
  }
  if (compatibles.length > 1) {
    return { ok: false, inserted: 0, reason: "Hay más de una caja activa posible. Elegí la caja desde Camioneta." };
  }
  const carga = compatibles[0];

  const { data: yaCargados } = await (supabase as any)
    .from("vehiculo_carga_items")
    .select("source_id")
    .eq("source_table", "store_order_items")
    .in("source_id", items.map((i) => i.id));
  const ocupados = new Set(((yaCargados as any[]) || []).map((r) => r.source_id));

  const toInsert = items
    .filter((i) => !ocupados.has(i.id))
    .map((i) => ({
      carga_id: carga.id,
      source_table: "store_order_items",
      source_id: i.id,
      cliente_nombre: (order as any).customer_name || "Cliente",
      alumno_id: (order as any).alumno_id || null,
      producto: i.product_name,
      variante: variantLabel(i.variant_selection),
      cantidad: i.quantity ?? 1,
      estado: "cargado",
    }));

  if (toInsert.length > 0) {
    const { error } = await (supabase as any).from("vehiculo_carga_items").insert(toInsert);
    if (error) return { ok: false, inserted: 0, reason: error.message };
  }
  return { ok: true, inserted: toInsert.length, cargaId: carga.id };
};

/** Al entregar un pedido, sus ítems cargados quedan entregados también. */
export const markOrderItemsEntregados = async (orderId: string): Promise<number> => {
  const { data: soi } = await supabase.from("store_order_items").select("id").eq("order_id", orderId);
  const ids = ((soi as any[]) || []).map((r) => r.id);
  if (ids.length === 0) return 0;
  const { data } = await (supabase as any)
    .from("vehiculo_carga_items")
    .update({ estado: "entregado", entregado_at: new Date().toISOString() })
    .eq("source_table", "store_order_items")
    .eq("estado", "cargado")
    .in("source_id", ids)
    .select("id");
  return ((data as any[]) || []).length;
};

export interface OrdenSinCargar {
  id: string;
  order_number: number | null;
  customer_name: string | null;
}

/** Pedidos marcados "en camioneta" sin representación física. */
export const findOrdersEnCamionetaSinCargar = async (): Promise<OrdenSinCargar[]> => {
  const { data: orders } = await supabase
    .from("store_orders")
    .select("id,order_number,customer_name,items:store_order_items(id)")
    .eq("status", "en_camioneta");
  const list = ((orders as any[]) || []);
  const allItemIds = list.flatMap((o) => (o.items || []).map((i: any) => i.id));
  if (allItemIds.length === 0) return list.map((o) => ({ id: o.id, order_number: o.order_number, customer_name: o.customer_name }));
  const { data: cargados } = await (supabase as any)
    .from("vehiculo_carga_items")
    .select("source_id")
    .eq("source_table", "store_order_items")
    .in("source_id", allItemIds);
  const ocupados = new Set(((cargados as any[]) || []).map((r) => r.source_id));
  return list
    .filter((o) => !(o.items || []).some((i: any) => ocupados.has(i.id)))
    .map((o) => ({ id: o.id, order_number: o.order_number, customer_name: o.customer_name }));
};
