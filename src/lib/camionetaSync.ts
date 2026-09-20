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
export interface CargaActiva { id: string; sede_id: string | null; estado: string; sede_nombre?: string | null }

/** Cajas activas (abierta/en_ruta) de la camioneta. */
export const listCargasActivas = async (): Promise<CargaActiva[]> => {
  const { data } = await (supabase as any)
    .from("vehiculo_cargas")
    .select("id,sede_id,estado,sede:sedes(nombre)")
    .in("estado", ESTADOS_CARGA_ACTIVA);
  return (((data as any[]) || []).map((c) => ({
    id: c.id,
    sede_id: c.sede_id,
    estado: c.estado,
    sede_nombre: c.sede?.nombre ?? null,
  })));
};

export const ensureOrderInCamioneta = async (orderId: string, cargaIdElegida?: string): Promise<CamionetaSyncResult> => {
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
    return { ok: false, inserted: 0, reason: "No hay una caja activa compatible. Abrí o activá una caja desde Camioneta." };
  }
  const elegida = cargaIdElegida ? compatibles.find((c) => c.id === cargaIdElegida) : null;
  if (compatibles.length > 1 && !elegida) {
    return { ok: false, inserted: 0, reason: "NEEDS_BOX" };
  }
  const carga = elegida || compatibles[0];

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

export interface LegacyCamionetaRepairResult {
  reviewed: number;
  sedeAssigned: number;
  boxed: number;
  skippedNoStudentSede: number;
  skippedMoto: number;
  pendingActiveBox: number;
  errors: number;
}

/**
 * Repara pedidos legacy ya marcados `en_camioneta` pero sin caja registrada.
 * Regla Reybaud: si el cliente no definió retiro y el alumno tiene sede habitual
 * en su ficha, esa sede se usa como retiro. Envíos por moto nunca se reasignan.
 */
export const repairOrdersEnCamionetaFromStudentSede = async (): Promise<LegacyCamionetaRepairResult> => {
  const result: LegacyCamionetaRepairResult = {
    reviewed: 0,
    sedeAssigned: 0,
    boxed: 0,
    skippedNoStudentSede: 0,
    skippedMoto: 0,
    pendingActiveBox: 0,
    errors: 0,
  };

  const legacy = await findOrdersEnCamionetaSinCargar();
  result.reviewed = legacy.length;
  if (legacy.length === 0) return result;

  const orderIds = legacy.map((o) => o.id);
  const { data: orders, error: ordersError } = await (supabase as any)
    .from("store_orders")
    .select("id,alumno_id,sede_retiro_id,entrega_metodo")
    .in("id", orderIds);
  if (ordersError) {
    result.errors = legacy.length;
    return result;
  }

  const alumnoIds = Array.from(
    new Set(((orders as any[]) || []).map((o) => o.alumno_id).filter(Boolean)),
  ) as string[];

  const alumnoSede = new Map<string, string>();
  if (alumnoIds.length > 0) {
    const { data: alumnos, error: alumnosError } = await (supabase as any)
      .from("alumnos")
      .select("id,sede_id")
      .in("id", alumnoIds);
    if (alumnosError) {
      result.errors = legacy.length;
      return result;
    }
    for (const a of (alumnos as any[]) || []) {
      if (a.sede_id) alumnoSede.set(a.id, a.sede_id);
    }
  }

  for (const order of (orders as any[]) || []) {
    if (order.entrega_metodo === "envio_moto") {
      result.skippedMoto += 1;
      continue;
    }

    let sedeId = order.sede_retiro_id as string | null;
    if (!sedeId && order.alumno_id) sedeId = alumnoSede.get(order.alumno_id) || null;

    if (!sedeId) {
      result.skippedNoStudentSede += 1;
      continue;
    }

    if (!order.sede_retiro_id) {
      const { error: updateError } = await (supabase as any)
        .from("store_orders")
        .update({
          sede_retiro_id: sedeId,
          entrega_metodo: order.entrega_metodo || "retiro_sede",
        })
        .eq("id", order.id);
      if (updateError) {
        result.errors += 1;
        continue;
      }
      result.sedeAssigned += 1;
    }

    const boxed = await ensureOrderInCamioneta(order.id);
    if (boxed.ok) {
      result.boxed += 1;
    } else if (boxed.reason?.includes("No hay una caja activa compatible")) {
      result.pendingActiveBox += 1;
    } else if (boxed.reason !== "NEEDS_BOX") {
      result.errors += 1;
    }
  }

  return result;
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

export interface OrdenSinCargarItem {
  id: string;
  product_name: string | null;
  variante: string | null;
  cantidad: number;
}

export interface OrdenSinCargar {
  id: string;
  order_number: number | null;
  customer_name: string | null;
  items: OrdenSinCargarItem[];
}

/** Pedidos en camioneta cuya caja no quedó registrada en el sistema (legacy). */
export const findOrdersEnCamionetaSinCargar = async (): Promise<OrdenSinCargar[]> => {
  const { data: orders } = await supabase
    .from("store_orders")
    .select("id,order_number,customer_name,items:store_order_items(id,product_name,variant_selection,quantity)")
    .eq("status", "en_camioneta");
  const list = ((orders as any[]) || []);
  const allItemIds = list.flatMap((o) => (o.items || []).map((i: any) => i.id));
  const mapOrden = (o: any): OrdenSinCargar => ({
    id: o.id,
    order_number: o.order_number,
    customer_name: o.customer_name,
    items: ((o.items || []) as any[]).map((i) => ({
      id: i.id,
      product_name: i.product_name,
      variante: variantLabel(i.variant_selection),
      cantidad: i.quantity ?? 1,
    })),
  });
  if (allItemIds.length === 0) return list.map(mapOrden);
  const { data: cargados } = await (supabase as any)
    .from("vehiculo_carga_items")
    .select("source_id")
    .eq("source_table", "store_order_items")
    .in("source_id", allItemIds);
  const ocupados = new Set(((cargados as any[]) || []).map((r) => r.source_id));
  return list
    .filter((o) => !(o.items || []).some((i: any) => ocupados.has(i.id)))
    .map(mapOrden);
};
