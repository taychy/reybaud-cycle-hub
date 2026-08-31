// Helpers puros de agenda del coach.
// Única fuente de verdad para calcular la PRÓXIMA clase a partir de la agenda
// semanal recurrente (`agenda_grupal`). No hace fetch ni conoce Supabase.

export type AgendaSlotLite = {
  id: string;
  dia_semana: number; // 0 = domingo
  hora_inicio: string; // "HH:MM:SS"
  hora_fin: string;
  grupo: string | null;
};

/** Fecha local (no UTC) en formato YYYY-MM-DD. Evita el corrimiento de zona horaria. */
export const toLocalIso = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const addDays = (d: Date, n: number): Date => {
  const c = new Date(d.getTime());
  c.setDate(c.getDate() + n);
  return c;
};

const hhmm = (t: string) => (t || "00:00").slice(0, 5);

/**
 * Devuelve la próxima ocurrencia (slot + fecha) buscando hasta 7 días hacia adelante.
 * Hoy sólo cuenta si la clase todavía no terminó.
 */
export function nextOccurrence<T extends AgendaSlotLite>(
  slots: T[],
  now: Date = new Date(),
): { slot: T; fecha: string } | null {
  const nowHM = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  for (let offset = 0; offset <= 7; offset++) {
    const day = addDays(now, offset);
    const dow = day.getDay();
    const candidates = (slots || [])
      .filter((s) => s.dia_semana === dow)
      .filter((s) => (offset === 0 ? hhmm(s.hora_fin) > nowHM : true))
      .sort((a, b) => hhmm(a.hora_inicio).localeCompare(hhmm(b.hora_inicio)));
    if (candidates.length) return { slot: candidates[0], fecha: toLocalIso(day) };
  }
  return null;
}

/** "2026-08-30" → "sábado 30 de agosto" (o "Hoy" / "Mañana"). */
export function labelFecha(fechaIso: string, now: Date = new Date()): string {
  if (fechaIso === toLocalIso(now)) return "Hoy";
  if (fechaIso === toLocalIso(addDays(now, 1))) return "Mañana";
  const [y, m, d] = fechaIso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

/** Resumen corto del plan de entrenamiento para mostrar en la card. */
export function resumenPlan(descripcion: string | null | undefined, maxLines = 3): string[] {
  return (descripcion || "")
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, maxLines);
}
