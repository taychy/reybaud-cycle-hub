// Capa de UX unificada de Agenda (clases grupales + turnos + disponibilidad).
// Helpers PUROS: no hacen fetch ni conocen Supabase.
//
// Convención de días ÚNICA en todo el sistema (JS `Date.getDay` / Postgres DOW):
// 0 = Domingo, 1 = Lunes, ... 6 = Sábado.

export const DIAS_SEMANA = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
] as const;

export const DIAS_SEMANA_CORTO = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"] as const;

/** Índices en orden de visualización semanal (lunes primero, domingo al final). */
export const ORDEN_SEMANA_LUNES = [1, 2, 3, 4, 5, 6, 0] as const;

export const hhmm = (t: string | null | undefined) => (t || "00:00").slice(0, 5);

/** Fecha local (no UTC) en formato YYYY-MM-DD. */
export const toLocalIso = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const addDays = (d: Date, n: number): Date => {
  const c = new Date(d.getTime());
  c.setDate(c.getDate() + n);
  return c;
};

/** Parseo seguro de "YYYY-MM-DD" sin drift de zona horaria. */
export const parseIso = (iso: string): Date => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};

/** Lunes de la semana que contiene `d`. */
export function startOfWeek(d: Date): Date {
  const dow = d.getDay(); // 0=Dom
  const delta = dow === 0 ? -6 : 1 - dow;
  const s = addDays(d, delta);
  s.setHours(0, 0, 0, 0);
  return s;
}

/** Los 7 días (ISO) de la semana que empieza en `monday`. */
export function weekDays(monday: Date): string[] {
  return Array.from({ length: 7 }, (_, i) => toLocalIso(addDays(monday, i)));
}

/** ¿Se solapan dos intervalos horarios? (extremos que se tocan NO se solapan) */
export function overlaps(aIni: string, aFin: string, bIni: string, bFin: string): boolean {
  return hhmm(aIni) < hhmm(bFin) && hhmm(bIni) < hhmm(aFin);
}

// ------------------------------------------------------------------
//  Agrupación de disponibilidad (una fila por servicio → un bloque)
// ------------------------------------------------------------------

export type DisponibilidadRow = {
  id: string;
  coach_id: string;
  servicio_id: string;
  sede_id: string | null;
  dia_semana: number;
  hora_inicio: string;
  hora_fin: string;
  activo?: boolean | null;
};

export type BloqueDisponibilidad = {
  key: string;
  coach_id: string;
  sede_id: string | null;
  dia_semana: number;
  hora_inicio: string;
  hora_fin: string;
  servicio_ids: string[];
  row_ids: string[];
};

/**
 * Agrupa filas idénticas de `disponibilidad_coaches` por
 * coach + sede + día + horario, listando los servicios habilitados.
 * Evita mostrar N bloques visuales duplicados por N servicios.
 */
export function agruparDisponibilidad(rows: DisponibilidadRow[]): BloqueDisponibilidad[] {
  const map = new Map<string, BloqueDisponibilidad>();
  for (const r of rows || []) {
    const key = [r.coach_id, r.sede_id ?? "none", r.dia_semana, hhmm(r.hora_inicio), hhmm(r.hora_fin)].join("|");
    let b = map.get(key);
    if (!b) {
      b = {
        key,
        coach_id: r.coach_id,
        sede_id: r.sede_id ?? null,
        dia_semana: r.dia_semana,
        hora_inicio: hhmm(r.hora_inicio),
        hora_fin: hhmm(r.hora_fin),
        servicio_ids: [],
        row_ids: [],
      };
      map.set(key, b);
    }
    if (r.servicio_id && !b.servicio_ids.includes(r.servicio_id)) b.servicio_ids.push(r.servicio_id);
    b.row_ids.push(r.id);
  }
  return [...map.values()].sort(
    (a, b) => a.dia_semana - b.dia_semana || a.hora_inicio.localeCompare(b.hora_inicio),
  );
}

/** Diferencia de servicios entre lo guardado y lo elegido (para sincronizar filas). */
export function diffServicios(actuales: string[], elegidos: string[]) {
  const cur = new Set(actuales);
  const next = new Set(elegidos);
  return {
    toAdd: [...next].filter((s) => !cur.has(s)),
    toRemove: [...cur].filter((s) => !next.has(s)),
  };
}

// ------------------------------------------------------------------
//  Eventos unificados de la semana
// ------------------------------------------------------------------

export type AgendaEventoTipo = "grupal" | "turno" | "disponibilidad";

export type AgendaEvento = {
  id: string;
  tipo: AgendaEventoTipo;
  fecha: string; // YYYY-MM-DD
  hora_inicio: string; // HH:MM
  hora_fin: string; // HH:MM
  coach_id: string | null;
  coach_nombre: string | null;
  sede_id: string | null;
  sede_nombre: string | null;
  titulo: string;
  detalle?: string | null;
  estado?: string | null;
  chips?: string[];
  raw?: any;
};

/**
 * Expande un slot semanal recurrente a las fechas concretas de la semana dada.
 * `dias` son ISO strings (lunes → domingo).
 */
export function ocurrenciasEnSemana(dias: string[], dia_semana: number): string[] {
  return dias.filter((iso) => parseIso(iso).getDay() === dia_semana);
}

/**
 * Detecta conflictos REALES (clase grupal vs turno, turno vs turno) del mismo coach:
 * solapamiento horario el mismo día, o dos sedes distintas en intervalos solapados.
 * La disponibilidad NO cuenta como conflicto.
 */
export function detectarConflictos(eventos: AgendaEvento[]): Set<string> {
  const reales = eventos.filter((e) => e.tipo !== "disponibilidad" && e.coach_id);
  const conflictivos = new Set<string>();
  for (let i = 0; i < reales.length; i++) {
    for (let j = i + 1; j < reales.length; j++) {
      const a = reales[i];
      const b = reales[j];
      if (a.coach_id !== b.coach_id || a.fecha !== b.fecha) continue;
      if (!overlaps(a.hora_inicio, a.hora_fin, b.hora_inicio, b.hora_fin)) continue;
      conflictivos.add(a.id);
      conflictivos.add(b.id);
    }
  }
  return conflictivos;
}

/** "2026-08-31" → "lunes 31 de agosto" (o "Hoy" / "Mañana"). */
export function labelFechaLarga(fechaIso: string, now: Date = new Date()): string {
  if (fechaIso === toLocalIso(now)) return "Hoy";
  if (fechaIso === toLocalIso(addDays(now, 1))) return "Mañana";
  return parseIso(fechaIso).toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}
