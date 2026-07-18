/**
 * Utilidades de fecha. Parsing seguro por zona horaria (splits ISO
 * "YYYY-MM-DD" a mano para evitar drift UTC).
 */

export function calcularEdad(fechaNac?: string | null, ref: Date = new Date()): number | null {
  if (!fechaNac) return null;
  const parts = fechaNac.split("-");
  if (parts.length < 3) return null;
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  if (!y || !m || !d) return null;
  let edad = ref.getFullYear() - y;
  const antesDeCumple =
    ref.getMonth() + 1 < m || (ref.getMonth() + 1 === m && ref.getDate() < d);
  if (antesDeCumple) edad -= 1;
  return edad >= 0 && edad < 130 ? edad : null;
}

/** Devuelve MM-DD del cumple (sin año). */
export function mmddCumple(fechaNac?: string | null): string | null {
  if (!fechaNac) return null;
  const parts = fechaNac.split("-");
  if (parts.length < 3) return null;
  return `${parts[1]}-${parts[2]}`;
}

/** Días hasta el próximo cumple (0 = hoy). */
export function diasHastaCumple(fechaNac?: string | null, ref: Date = new Date()): number | null {
  const mmdd = mmddCumple(fechaNac);
  if (!mmdd) return null;
  const [mm, dd] = mmdd.split("-").map(Number);
  const y = ref.getFullYear();
  let next = new Date(y, mm - 1, dd);
  const today = new Date(y, ref.getMonth(), ref.getDate());
  if (next < today) next = new Date(y + 1, mm - 1, dd);
  return Math.round((next.getTime() - today.getTime()) / 86400000);
}
