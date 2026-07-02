/**
 * Métodos de pago disponibles en el módulo de Gastos.
 * Editable en un solo lugar — cualquier vista nueva debe importar desde acá.
 */
export interface GastoPaymentMethod {
  value: string;
  label: string;
}

export const GASTO_PAYMENT_METHODS: GastoPaymentMethod[] = [
  { value: "efectivo", label: "Efectivo" },
  { value: "bbva_claudio", label: "Cuenta BBVA Claudio" },
  { value: "bbva_scarlett", label: "Cuenta BBVA Scarlett" },
  { value: "mp_claudio", label: "MP Claudio" },
  { value: "mp_scarlett_tienda", label: "MP Scarlett Tienda" },
  { value: "mp_scarlett_viajes", label: "MP Scarlett Viajes" },
  { value: "mp_josi", label: "MP Josi" },
  { value: "tarjeta", label: "Tarjeta" },
];

/**
 * Etiquetas de valores heredados que pueden seguir apareciendo en registros
 * antiguos (`gastos`, `gastos_ejecuciones`, `gastos_ejecucion_pagos`, etc.).
 * Solo se usan para mostrar — no aparecen en los selectores nuevos.
 */
const LEGACY_LABELS: Record<string, string> = {
  transferencia: "Transferencia",
  tarjeta_credito: "Tarjeta",
  mp_personal: "MP Claudio",
  mp_escuela: "MP Scarlett Viajes",
  mp_tienda: "MP Scarlett Tienda",
  mc_personal: "MC Claudio",
  banco: "Banco",
};

export const GASTO_PAYMENT_LABELS: Record<string, string> = {
  ...LEGACY_LABELS,
  ...Object.fromEntries(GASTO_PAYMENT_METHODS.map(m => [m.value, m.label])),
};

export const formatGastoPaymentMethod = (value: string | null | undefined): string => {
  if (!value) return "—";
  return GASTO_PAYMENT_LABELS[value] ?? value;
};

/**
 * Mapea valores heredados a los nuevos códigos vigentes.
 * Se usa para inicializar selectores sin dejarlos vacíos.
 */
const LEGACY_ALIAS: Record<string, string> = {
  transferencia: "bbva_claudio",
  tarjeta_credito: "tarjeta",
  mp_personal: "mp_claudio",
  mp_escuela: "mp_scarlett_viajes",
  mp_tienda: "mp_scarlett_tienda",
  mc_personal: "mp_claudio",
  banco: "bbva_claudio",
};

export const normalizeGastoPaymentMethod = (value: string | null | undefined): string => {
  if (!value) return "efectivo";
  if (GASTO_PAYMENT_LABELS[value] && GASTO_PAYMENT_METHODS.some(m => m.value === value)) return value;
  return LEGACY_ALIAS[value] ?? "efectivo";
};

