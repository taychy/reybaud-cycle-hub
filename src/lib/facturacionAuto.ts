/** Etiquetas y reglas de UI de la facturación automática (Fase 1). */

export type AutoEstado =
  | "manual" | "pendiente" | "emitiendo" | "facturada" | "requiere_datos_fiscales"
  | "requiere_revision_emisor" | "moneda_no_soportada_automaticamente"
  | "error_reintentable" | "error_manual" | "excluida" | "anulada";

export const AUTO_ESTADO_UI: Record<AutoEstado, { label: string; tone: "ok" | "warn" | "error" | "muted" }> = {
  manual: { label: "Manual", tone: "muted" },
  pendiente: { label: "Lista para automática", tone: "ok" },
  emitiendo: { label: "Emitiendo", tone: "warn" },
  facturada: { label: "Facturada", tone: "ok" },
  requiere_datos_fiscales: { label: "Requiere datos fiscales", tone: "error" },
  requiere_revision_emisor: { label: "Revisar emisor", tone: "error" },
  moneda_no_soportada_automaticamente: { label: "Moneda no automática", tone: "warn" },
  error_reintentable: { label: "Error, se reintenta", tone: "warn" },
  error_manual: { label: "Error, revisar a mano", tone: "error" },
  excluida: { label: "Excluida", tone: "muted" },
  anulada: { label: "Anulada", tone: "muted" },
};

export const EMISOR_ORIGEN_UI: Record<string, string> = {
  override_manual: "Corregido a mano",
  emisor_del_flujo: "Emisor del pedido",
  medio_de_pago: "Configurado para el medio de pago",
  cuenta_receptora_ruteo: "Cuenta receptora (ruteo)",
  cuenta_receptora: "Cuenta receptora",
  unico_emisor_del_segmento: "Único emisor del tipo de cobro",
};

export function autoEstadoUi(estado: string | null | undefined) {
  return AUTO_ESTADO_UI[(estado || "manual") as AutoEstado] ?? { label: estado || "—", tone: "muted" as const };
}

export function emisorOrigenLabel(origen: string | null | undefined): string {
  if (!origen) return "Sin determinar";
  return EMISOR_ORIGEN_UI[origen] ?? origen;
}

/** "2026-10-01".."2026-10-31" -> "01/10/26 – 31/10/26" sin corrimiento de zona. */
export function periodoLabel(desde?: string | null, hasta?: string | null): string {
  const f = (s?: string | null) => {
    if (!s) return "";
    const [y, m, d] = s.slice(0, 10).split("-");
    return `${d}/${m}/${y.slice(2)}`;
  };
  if (!desde && !hasta) return "—";
  if (desde === hasta) return f(desde);
  return `${f(desde)} – ${f(hasta)}`;
}

export const SEGMENTO_LABEL: Record<string, string> = {
  escuela: "Mensualidades",
  viajes: "Eventos y viajes",
  tienda: "Tienda",
};
