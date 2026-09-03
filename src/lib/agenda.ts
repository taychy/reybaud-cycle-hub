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

export type AgendaEventoTipo = "grupal" | "turno" | "disponibilidad" | "ausencia";

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
 * Vigencia de una serie semanal recurrente. `null` = sin límite.
 * Se comparan strings ISO (YYYY-MM-DD), lexicográficamente seguro.
 */
export function dentroDeVigencia(
  fechaIso: string,
  vigente_desde?: string | null,
  vigente_hasta?: string | null,
): boolean {
  if (vigente_desde && fechaIso < vigente_desde.slice(0, 10)) return false;
  if (vigente_hasta && fechaIso > vigente_hasta.slice(0, 10)) return false;
  return true;
}

/** Serie/clase grupal tal como se guarda en `agenda_grupal`. */
export type SerieGrupal = {
  dia_semana: number;
  /** "recurrente" (semanal) | "puntual" (una sola fecha). */
  tipo_clase?: string | null;
  /** Fecha concreta cuando `tipo_clase = "puntual"`. */
  fecha?: string | null;
  vigente_desde?: string | null;
  vigente_hasta?: string | null;
  /** Fechas donde la serie NO se dicta (excepciones puntuales). */
  fechas_excluidas?: (string | null)[] | null;
};

/** ¿Es una clase puntual (una sola fecha) en vez de una serie semanal? */
export const esClasePuntual = (s: { tipo_clase?: string | null }): boolean =>
  (s?.tipo_clase ?? "recurrente") === "puntual";

/**
 * Ocurrencias de una clase dentro de la semana:
 * - puntual: solo su `fecha`, si cae en la semana.
 * - recurrente: su día de semana, respetando vigencia y fechas excluidas.
 */
export function ocurrenciasSerie(dias: string[], serie: SerieGrupal): string[] {
  if (esClasePuntual(serie)) {
    const f = serie.fecha ? String(serie.fecha).slice(0, 10) : null;
    return f && dias.includes(f) ? [f] : [];
  }
  const excluidas = new Set(
    (serie.fechas_excluidas || []).filter(Boolean).map((f) => String(f).slice(0, 10)),
  );
  return ocurrenciasEnSemana(dias, serie.dia_semana).filter(
    (iso) => dentroDeVigencia(iso, serie.vigente_desde, serie.vigente_hasta) && !excluidas.has(iso),
  );
}

// ------------------------------------------------------------------
//  Ausencias de coaches
// ------------------------------------------------------------------

export type AusenciaRow = {
  id: string;
  coach_id: string;
  fecha_inicio: string;
  fecha_fin?: string | null;
  todo_el_dia?: boolean | null;
  hora_inicio?: string | null;
  hora_fin?: string | null;
  motivo?: string | null;
};

/** Fechas de la semana cubiertas por una ausencia (rango inclusivo). */
export function ocurrenciasAusencia(dias: string[], a: AusenciaRow): string[] {
  const desde = String(a.fecha_inicio || "").slice(0, 10);
  const hasta = String(a.fecha_fin || a.fecha_inicio || "").slice(0, 10);
  if (!desde) return [];
  return dias.filter((iso) => iso >= desde && iso <= hasta);
}

/** Reservas de turnera canceladas (en cualquiera de sus variantes). */
export const esReservaCancelada = (estado?: string | null): boolean =>
  String(estado || "").startsWith("cancelad");

// ------------------------------------------------------------------
//  Normalización única de eventos (Resumen Admin y /admin/agenda)
// ------------------------------------------------------------------

export type AgendaFuentes = {
  dias: string[];
  grupal?: any[];
  turnos?: any[];
  disponibilidad?: DisponibilidadRow[];
  ausencias?: AusenciaRow[];
  coachNombre: (id: string | null) => string;
  sedeNombre: (id: string | null) => string | null;
  servicioNombre: (id: string | null) => string;
};

/**
 * Convierte las fuentes existentes (clases grupales, turnos de turnera,
 * disponibilidad y ausencias) en eventos unificados de la semana.
 * NO hace fetch: recibe filas ya cargadas.
 */
export function buildAgendaEventos({
  dias,
  grupal = [],
  turnos = [],
  disponibilidad = [],
  ausencias = [],
  coachNombre,
  sedeNombre,
  servicioNombre,
}: AgendaFuentes): AgendaEvento[] {
  const out: AgendaEvento[] = [];

  for (const g of grupal) {
    if (g.activo === false) continue;
    for (const fecha of ocurrenciasSerie(dias, g)) {
      out.push({
        id: `g-${g.id}-${fecha}`,
        tipo: "grupal",
        fecha,
        hora_inicio: hhmm(g.hora_inicio),
        hora_fin: hhmm(g.hora_fin),
        coach_id: g.coach_id,
        coach_nombre: coachNombre(g.coach_id),
        sede_id: g.sede_id,
        sede_nombre: sedeNombre(g.sede_id),
        titulo: g.grupo || "Clase grupal",
        detalle: g.notas,
        raw: g,
      });
    }
  }

  for (const t of turnos) {
    if (esReservaCancelada(t.estado_operativo)) continue;
    out.push({
      id: `t-${t.id}`,
      tipo: "turno",
      fecha: String(t.fecha).slice(0, 10),
      hora_inicio: hhmm(t.hora_inicio),
      hora_fin: hhmm(t.hora_fin),
      coach_id: t.coach_id,
      coach_nombre: coachNombre(t.coach_id),
      sede_id: t.sede_id,
      sede_nombre: sedeNombre(t.sede_id),
      titulo: servicioNombre(t.servicio_id),
      detalle: `${t.nombre || ""} ${t.apellido || ""}`.trim(),
      estado: t.estado_operativo,
      raw: t,
    });
  }

  for (const b of agruparDisponibilidad(disponibilidad.filter((d) => d.activo !== false))) {
    for (const fecha of ocurrenciasEnSemana(dias, b.dia_semana)) {
      out.push({
        id: `d-${b.key}-${fecha}`,
        tipo: "disponibilidad",
        fecha,
        hora_inicio: b.hora_inicio,
        hora_fin: b.hora_fin,
        coach_id: b.coach_id,
        coach_nombre: coachNombre(b.coach_id),
        sede_id: b.sede_id,
        sede_nombre: sedeNombre(b.sede_id),
        titulo: "Disponible para turnera",
        chips: b.servicio_ids.map((s) => servicioNombre(s)),
        raw: b,
      });
    }
  }

  for (const a of ausencias) {
    for (const fecha of ocurrenciasAusencia(dias, a)) {
      const todoElDia = a.todo_el_dia !== false || !a.hora_inicio;
      out.push({
        id: `a-${a.id}-${fecha}`,
        tipo: "ausencia",
        fecha,
        hora_inicio: todoElDia ? "00:00" : hhmm(a.hora_inicio),
        hora_fin: todoElDia ? "23:59" : hhmm(a.hora_fin),
        coach_id: a.coach_id,
        coach_nombre: coachNombre(a.coach_id),
        sede_id: null,
        sede_nombre: null,
        titulo: "Ausencia",
        detalle: a.motivo || (todoElDia ? "Día completo" : null),
        raw: a,
      });
    }
  }

  return out.sort(
    (a, b) => a.fecha.localeCompare(b.fecha) || a.hora_inicio.localeCompare(b.hora_inicio),
  );
}

/**
 * Detecta conflictos REALES del mismo coach: clase grupal vs turno, turno vs turno,
 * o actividad dentro de una ausencia. La disponibilidad NO cuenta como conflicto,
 * y dos ausencias entre sí tampoco.
 */
export function detectarConflictos(eventos: AgendaEvento[]): Set<string> {
  const reales = eventos.filter((e) => e.tipo !== "disponibilidad" && e.coach_id);
  const conflictivos = new Set<string>();
  for (let i = 0; i < reales.length; i++) {
    for (let j = i + 1; j < reales.length; j++) {
      const a = reales[i];
      const b = reales[j];
      if (a.coach_id !== b.coach_id || a.fecha !== b.fecha) continue;
      if (a.tipo === "ausencia" && b.tipo === "ausencia") continue;
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
