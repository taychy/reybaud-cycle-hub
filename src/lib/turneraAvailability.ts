// Helpers puros de disponibilidad de Turnera.
// Única fuente de verdad para: solapamiento de intervalos, ocupación de un slot,
// validación de campos configurables del servicio e identificación unívoca de alumno.

export type FormFieldDef = {
  key: string;
  label: string;
  type: "text" | "tel" | "textarea" | "number";
  required?: boolean;
};

export type OccupiedReservation = {
  fecha: string;
  hora_inicio: string;
  hora_fin?: string | null;
  coach_id: string;
};

/** "HH:MM" o "HH:MM:SS" → minutos desde 00:00. */
export const timeToMinutes = (t: string): number => {
  const [h, m] = String(t || "0:0").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

export const minutesToTime = (min: number): string =>
  `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/** Solapamiento estricto de intervalos [aIni,aFin) vs [bIni,bFin) en minutos. */
export const intervalsOverlap = (aIni: number, aFin: number, bIni: number, bFin: number): boolean =>
  aIni < bFin && aFin > bIni;

/**
 * Un slot está ocupado si el MISMO coach tiene una reserva activa ese día cuyo
 * intervalo se cruza con el del slot — aunque sea de otro servicio y aunque la
 * hora de inicio no coincida. Si la reserva no trae hora_fin, se asume 60 min.
 */
export const isSlotBooked = (
  occupied: OccupiedReservation[],
  dateStr: string,
  coachId: string,
  slotStart: string,
  slotEnd: string,
): boolean => {
  const sIni = timeToMinutes(slotStart);
  const sFin = timeToMinutes(slotEnd);
  return occupied.some((r) => {
    if (r.fecha !== dateStr || r.coach_id !== coachId) return false;
    const rIni = timeToMinutes(r.hora_inicio);
    const rFin = r.hora_fin ? timeToMinutes(r.hora_fin) : rIni + 60;
    return intervalsOverlap(sIni, sFin, rIni, rFin);
  });
};

/** Valida los campos configurables del servicio. Devuelve mensaje de error o null. */
export const validateFormResponses = (
  fields: FormFieldDef[] | null | undefined,
  responses: Record<string, string> | null | undefined,
): string | null => {
  for (const f of fields || []) {
    if (!f?.required) continue;
    const raw = responses?.[f.key];
    const val = typeof raw === "string" ? raw.trim() : raw == null ? "" : String(raw).trim();
    if (!val) return `Completá: ${f.label || f.key}`;
  }
  return null;
};

/** Sólo devuelve la ficha cuando la coincidencia es única; ambigüedad o vacío → null. */
export const pickUniqueAlumnoMatch = <T,>(rows: T[] | null | undefined): T | null => {
  const list = rows || [];
  return list.length === 1 ? list[0] : null;
};
