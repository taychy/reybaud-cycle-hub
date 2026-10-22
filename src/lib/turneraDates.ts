/** Fecha de nacimiento ISO (YYYY-MM-DD) válida o null si falta/incompleta/imposible. */
export function buildFechaNacimientoISO(anio?: string | null, mes?: string | null, dia?: string | null): string | null {
  const y = String(anio ?? "").trim();
  const m = String(mes ?? "").trim();
  const d = String(dia ?? "").trim();
  if (!/^\d{4}$/.test(y) || !/^\d{1,2}$/.test(m) || !/^\d{1,2}$/.test(d)) return null;
  const yi = Number(y), mi = Number(m), di = Number(d);
  if (mi < 1 || mi > 12 || di < 1) return null;
  const maxDia = new Date(Date.UTC(yi, mi, 0)).getUTCDate();
  if (di > maxDia) return null;
  return `${y}-${String(mi).padStart(2, "0")}-${String(di).padStart(2, "0")}`;
}

/** Fecha local del calendario como YYYY-MM-DD (sin desfase por zona horaria). */
export function toLocalISODate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
