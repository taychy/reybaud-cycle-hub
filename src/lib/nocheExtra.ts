/** Helpers para extras de tipo "Noche extra" en eventos/viajes. */

export type NocheTiming = "antes" | "despues" | "ambas";

export const NOCHE_TIMING_OPTIONS: { value: NocheTiming; label: string; unidades: number }[] = [
  { value: "antes", label: "Antes del evento", unidades: 1 },
  { value: "despues", label: "Después del evento", unidades: 1 },
  { value: "ambas", label: "Ambas (antes y después)", unidades: 2 },
];

/** Detecta si un extra es una "noche extra" a partir de su nombre. */
export function isNocheExtra(nombre?: string | null): boolean {
  if (!nombre) return false;
  return /noche[s]?\s+extra/i.test(nombre);
}

/** Unidades (noches) que corresponden a cada elección. */
export function unidadesPorTiming(timing?: string | null): number {
  return timing === "ambas" ? 2 : timing ? 1 : 0;
}

export function nocheTimingLabel(timing?: string | null): string | null {
  if (!timing) return null;
  return NOCHE_TIMING_OPTIONS.find((o) => o.value === timing)?.label ?? null;
}

/** Etiqueta corta para listados/CSV. */
export function nocheTimingShortLabel(timing?: string | null): string {
  if (timing === "antes") return "Antes";
  if (timing === "despues") return "Después";
  if (timing === "ambas") return "Ambas";
  return "";
}
