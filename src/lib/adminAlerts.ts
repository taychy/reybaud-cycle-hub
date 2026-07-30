/**
 * Lógica de organización temporal de las alertas del resumen admin.
 *
 * Cada alerta tiene una "fecha operativa" (cuándo hay que resolverla). Con esa
 * fecha se clasifica en 4 baldes:
 *
 *   vencido    → fecha < hoy        (backlog: ya se pasó, sigue sin resolver)
 *   hoy        → fecha === hoy
 *   semana     → fecha dentro de la semana en curso (lunes a domingo)
 *   sin_fecha  → alertas estructurales / permanentes (sin vencimiento)
 *
 * Las alertas sin fecha propia (alumnos sin grupo, en vacaciones, etc.) no
 * caducan: se muestran aparte y colapsadas.
 */

export type AlertBucket = "vencido" | "hoy" | "semana" | "sin_fecha";

export const BUCKET_LABEL: Record<AlertBucket, string> = {
  vencido: "Vencidas",
  hoy: "Hoy",
  semana: "Esta semana",
  sin_fecha: "Permanentes / sin fecha",
};

export const BUCKET_ORDER: AlertBucket[] = ["vencido", "hoy", "semana", "sin_fecha"];

/** YYYY-MM-DD local, sin drift de timezone. */
export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Parseo literal de 'YYYY-MM-DD' evitando drift de timezone. */
export function parseISODate(s: string): Date {
  const [y, m, d] = s.substring(0, 10).split("-").map((n) => parseInt(n, 10));
  return new Date(y, m - 1, d);
}

/** Lunes de la semana en curso. */
export function startOfWeek(ref = new Date()): Date {
  const d = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  const dow = (d.getDay() + 6) % 7; // 0 = lunes
  d.setDate(d.getDate() - dow);
  return d;
}

/** Los 7 días (lunes a domingo) de la semana en curso, en ISO. */
export function weekDays(ref = new Date()): string[] {
  const start = startOfWeek(ref);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return toISODate(d);
  });
}

export function bucketForDate(date: string | null | undefined, ref = new Date()): AlertBucket {
  if (!date) return "sin_fecha";
  const iso = date.substring(0, 10);
  const today = toISODate(ref);
  if (iso < today) return "vencido";
  if (iso === today) return "hoy";
  const days = weekDays(ref);
  return iso <= days[6] ? "semana" : "sin_fecha";
}

export const DAY_NAMES = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

export function dayLabel(iso: string): string {
  const d = parseISODate(iso);
  return `${DAY_NAMES[(d.getDay() + 6) % 7]} ${d.getDate()}/${d.getMonth() + 1}`;
}

/** Item concreto (una sub, una cuota, una solicitud) anclado a un día. */
export interface DatedAlertItem {
  date: string; // YYYY-MM-DD
  kind: string; // categoría legible: "Vencimiento de plan", "Cuota de evento"…
  label: string; // detalle: nombre del alumno, etc.
  link: string;
  tone: "danger" | "warning" | "info";
}
