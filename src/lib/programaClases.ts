// Helpers puros del bloque "Clases del programa" del Playbook.
// Reglas clave:
// - Agenda (`agenda_grupal`) es la fuente oficial de fecha/hora/sede/profesor.
// - Liquidaciones (`clases_dictadas` → `movimientos_liquidacion`) es la fuente
//   oficial de honorarios/estado. Acá sólo se LEE, nunca se copia.

export type DocenteConfirmacion = "pendiente" | "confirmado" | "no_puede";
export type AdminEstado = "pendiente" | "aprobada" | "observada";

export interface ProgramaClaseDocente {
  id: string;
  clase_id: string;
  nombre_planificado: string;
  coach_id: string | null;
  confirmacion: DocenteConfirmacion;
  motivo: string | null;
  confirmado_at: string | null;
}

/** Fila de `vw_programa_clases_estado`. */
export interface ProgramaClaseEstado {
  id: string;
  plan_id: string;
  orden: number;
  titulo: string;
  duracion_min: number;
  agenda_grupal_id: string | null;
  agenda_fecha: string | null;
  admin_estado: AdminEstado;
  admin_nota: string | null;
  excepcion_nota: string | null;
  agenda_dia_semana: number | null;
  agenda_hora_inicio: string | null;
  agenda_hora_fin: string | null;
  agenda_tipo_clase: string | null;
  agenda_fecha_puntual: string | null;
  agenda_activo: boolean | null;
  agenda_grupo: string | null;
  agenda_sede: string | null;
  agenda_coach_id: string | null;
  agenda_coach_nombre: string | null;
  clase_dictada_id: string | null;
  clase_dictada_fecha: string | null;
  liquidacion_estado: string | null;
  liquidacion_mensual_id: string | null;
}

export const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

const hhmm = (t?: string | null) => (t ? t.slice(0, 5) : "");

/** Minutos entre hora_inicio y hora_fin de la Agenda. `null` si falta alguna. */
export function duracionAgendaMin(
  inicio?: string | null,
  fin?: string | null,
): number | null {
  if (!inicio || !fin) return null;
  const [h1, m1] = hhmm(inicio).split(":").map(Number);
  const [h2, m2] = hhmm(fin).split(":").map(Number);
  if ([h1, m1, h2, m2].some((n) => Number.isNaN(n))) return null;
  return h2 * 60 + m2 - (h1 * 60 + m1);
}

/** Etiqueta legible de la clase real leída desde Agenda. */
export function agendaLabel(c: ProgramaClaseEstado): string {
  if (!c.agenda_grupal_id) return "Sin clase vinculada en Agenda";
  const partes: string[] = [];
  const fecha = c.agenda_fecha || c.agenda_fecha_puntual;
  if (fecha) {
    const [y, m, d] = fecha.split("-").map(Number);
    partes.push(
      new Date(y, m - 1, d).toLocaleDateString("es-AR", {
        weekday: "short",
        day: "numeric",
        month: "short",
      }),
    );
  } else if (c.agenda_dia_semana != null) {
    partes.push(DIAS[c.agenda_dia_semana] ?? "—");
  }
  if (c.agenda_hora_inicio) {
    partes.push(`${hhmm(c.agenda_hora_inicio)}–${hhmm(c.agenda_hora_fin)}`);
  }
  if (c.agenda_sede) partes.push(c.agenda_sede);
  return partes.join(" · ") || "Vinculada a Agenda";
}

/** Discrepancias entre lo planificado en el Playbook y lo que dice la Agenda. */
export function discrepancias(
  c: ProgramaClaseEstado,
  docentes: ProgramaClaseDocente[],
): string[] {
  if (!c.agenda_grupal_id) return [];
  const out: string[] = [];
  const dur = duracionAgendaMin(c.agenda_hora_inicio, c.agenda_hora_fin);
  if (dur != null && dur !== c.duracion_min) {
    out.push(`Agenda dura ${dur} min y lo planificado son ${c.duracion_min} min`);
  }
  if (c.agenda_activo === false) {
    out.push("La clase vinculada está inactiva en Agenda");
  }
  if (c.agenda_coach_id) {
    const planificados = docentes.map((d) => d.coach_id).filter(Boolean);
    if (planificados.length > 0 && !planificados.includes(c.agenda_coach_id)) {
      out.push(
        `En Agenda figura ${c.agenda_coach_nombre || "otro profesor"}, distinto del planificado`,
      );
    }
  }
  return out;
}

export function confirmacionLabel(v: DocenteConfirmacion): string {
  return v === "confirmado" ? "Confirmado" : v === "no_puede" ? "No puede" : "Pendiente";
}

export function adminEstadoLabel(v: AdminEstado): string {
  return v === "aprobada" ? "Aprobada" : v === "observada" ? "Observada" : "Pendiente";
}

/** ¿Está registrada como dictada según el flujo actual? */
export const fueDictada = (c: ProgramaClaseEstado) => !!c.clase_dictada_id;

export const todosConfirmaron = (docentes: ProgramaClaseDocente[]) =>
  docentes.length > 0 && docentes.every((d) => d.confirmacion === "confirmado");

export const hayNoPuede = (docentes: ProgramaClaseDocente[]) =>
  docentes.some((d) => d.confirmacion === "no_puede");

/**
 * Una clase sólo queda habilitada para liquidación si:
 * está registrada como dictada + todos los profesores confirmaron + Admin aprobó.
 * Nunca se aprueba ni habilita automáticamente.
 */
export function liquidacionHabilitada(
  c: ProgramaClaseEstado,
  docentes: ProgramaClaseDocente[],
): boolean {
  return fueDictada(c) && todosConfirmaron(docentes) && c.admin_estado === "aprobada";
}

/** Motivos por los que todavía no está habilitada (vacío si lo está). */
export function bloqueosLiquidacion(
  c: ProgramaClaseEstado,
  docentes: ProgramaClaseDocente[],
): string[] {
  const out: string[] = [];
  if (!fueDictada(c)) out.push("Falta que la clase se registre como dictada");
  if (!todosConfirmaron(docentes)) out.push("Falta confirmación del profesor");
  if (c.admin_estado !== "aprobada") out.push("Falta aprobación de Admin");
  return out;
}

/** Estado de liquidación leído del flujo actual (no se copian montos). */
export function liquidacionLabel(
  c: ProgramaClaseEstado,
  docentes: ProgramaClaseDocente[],
): string {
  if (c.liquidacion_mensual_id) return "Liquidada";
  if (c.liquidacion_estado) return `En liquidación · ${c.liquidacion_estado}`;
  if (liquidacionHabilitada(c, docentes)) return "Lista para liquidar";
  return "No habilitada";
}
