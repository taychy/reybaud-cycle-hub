/**
 * Campañas comerciales de Tienda.
 *
 * La fuente de verdad del precio efectivo es la función SQL `resolver_precio_tienda`.
 * Estas utilidades replican exactamente esa lógica para poder mostrar precios en la UI
 * (y testearla), pero el cobro SIEMPRE se resuelve/valida en el backend.
 */

export type CampaignDiscountType = "porcentaje" | "precio_fijo";

export interface StoreCampaign {
  id: string;
  nombre: string;
  slug: string;
  descripcion: string | null;
  fecha_inicio: string;
  fecha_fin: string;
  activa: boolean;
  badge_texto: string | null;
  mostrar_urgencia: boolean;
}

export interface StoreCampaignItem {
  id?: string;
  campaign_id?: string;
  product_id: string;
  /** null = todo el producto (todas las variantes) */
  variant_keys: string[] | null;
  tipo: CampaignDiscountType;
  valor: number;
  activo: boolean;
}

export type CampaignStatus = "programada" | "activa" | "finalizada" | "pausada";

/** Estado calculado de una campaña (no se persiste). */
export const campaignStatus = (
  c: Pick<StoreCampaign, "activa" | "fecha_inicio" | "fecha_fin">,
  now: Date = new Date()
): CampaignStatus => {
  if (!c.activa) return "pausada";
  const t = now.getTime();
  if (t < new Date(c.fecha_inicio).getTime()) return "programada";
  if (t > new Date(c.fecha_fin).getTime()) return "finalizada";
  return "activa";
};

export const CAMPAIGN_STATUS_LABEL: Record<CampaignStatus, string> = {
  programada: "Programada",
  activa: "Activa",
  finalizada: "Finalizada",
  pausada: "Pausada",
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Precio resultante de aplicar un item de campaña sobre el precio de lista. */
export const applyCampaignItem = (precioLista: number, item: Pick<StoreCampaignItem, "tipo" | "valor">): number => {
  if (item.tipo === "porcentaje") {
    const pct = Math.min(Math.max(item.valor, 0), 100);
    return Math.max(0, round2(precioLista * (1 - pct / 100)));
  }
  return Math.max(0, round2(Math.min(item.valor, precioLista)));
};

export interface EffectivePrice {
  precio_lista: number;
  precio_efectivo: number;
  descuento_pct: number;
  campaign_id: string | null;
  campaign_nombre: string | null;
  badge_texto: string | null;
  mostrar_urgencia: boolean;
  fecha_fin: string | null;
  solo_variantes: boolean;
}

/**
 * Regla de prioridad (idéntica al SQL): entre todas las campañas vigentes y activas que
 * incluyen el producto/variante gana la de MENOR precio resultante; a igual precio, la de
 * `fecha_inicio` más reciente; a igual fecha, el menor `campaign_id`. Nunca se apilan descuentos.
 */
export const resolveEffectivePrice = (
  precioLista: number,
  variantKey: string | null,
  items: (StoreCampaignItem & { campaign: StoreCampaign })[],
  now: Date = new Date()
): EffectivePrice => {
  const base: EffectivePrice = {
    precio_lista: precioLista,
    precio_efectivo: precioLista,
    descuento_pct: 0,
    campaign_id: null,
    campaign_nombre: null,
    badge_texto: null,
    mostrar_urgencia: false,
    fecha_fin: null,
    solo_variantes: false,
  };

  const candidates = items
    .filter((it) => it.activo && campaignStatus(it.campaign, now) === "activa")
    .filter((it) => it.variant_keys === null || (!!variantKey && it.variant_keys.includes(variantKey)))
    .map((it) => ({ it, precio: applyCampaignItem(precioLista, it) }))
    .filter((c) => c.precio < precioLista);

  if (!candidates.length) return base;

  candidates.sort((a, b) => {
    if (a.precio !== b.precio) return a.precio - b.precio;
    const fa = new Date(a.it.campaign.fecha_inicio).getTime();
    const fb = new Date(b.it.campaign.fecha_inicio).getTime();
    if (fa !== fb) return fb - fa;
    return a.it.campaign.id < b.it.campaign.id ? -1 : 1;
  });

  const win = candidates[0];
  return {
    precio_lista: precioLista,
    precio_efectivo: win.precio,
    descuento_pct: Math.round((1 - win.precio / precioLista) * 100),
    campaign_id: win.it.campaign.id,
    campaign_nombre: win.it.campaign.nombre,
    badge_texto: win.it.campaign.badge_texto,
    mostrar_urgencia: win.it.campaign.mostrar_urgencia,
    fecha_fin: win.it.campaign.fecha_fin,
    solo_variantes: win.it.variant_keys !== null,
  };
};

/** Clave de variante, con el mismo formato que `variant_stock` y `_build_variant_key`. */
export const buildVariantKey = (
  variants: { name: string }[] | null | undefined,
  selection: Record<string, string> | null | undefined
): string | null => {
  if (!selection || Object.keys(selection).length === 0) return null;
  const specs = Array.isArray(variants) ? variants : [];
  if (!specs.length) {
    return Object.keys(selection)
      .sort()
      .map((k) => `${k}:${selection[k]}`)
      .join("|");
  }
  const parts = specs
    .filter((s) => s?.name && selection[s.name])
    .map((s) => `${s.name}:${selection[s.name]}`);
  return parts.length ? parts.join("|") : null;
};

/** Texto de urgencia sin countdown segundo a segundo. */
export const urgencyText = (fechaFin: string | null, now: Date = new Date()): string | null => {
  if (!fechaFin) return null;
  const end = new Date(fechaFin);
  const days = Math.ceil((end.getTime() - now.getTime()) / 86400000);
  if (days < 0) return null;
  if (days <= 0) return "Termina hoy";
  if (days === 1) return "Termina mañana";
  if (days <= 7) return `Termina en ${days} días`;
  const dd = String(end.getDate()).padStart(2, "0");
  const mm = String(end.getMonth() + 1).padStart(2, "0");
  return `Hasta ${dd}/${mm}`;
};

/** Fila devuelta por el RPC `get_promos_tienda_vigentes`. */
export interface PromoRow {
  product_id: string;
  precio_lista: number;
  precio_efectivo: number;
  descuento_pct: number;
  campaign_id: string;
  campaign_nombre: string;
  badge_texto: string | null;
  mostrar_urgencia: boolean;
  fecha_fin: string | null;
  solo_variantes: boolean;
}

export const promoMap = (rows: PromoRow[] | null | undefined): Record<string, PromoRow> => {
  const map: Record<string, PromoRow> = {};
  for (const r of rows || []) map[r.product_id] = r;
  return map;
};
