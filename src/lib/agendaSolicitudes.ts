// Solicitudes de cambio de agenda (profesor → administración).
// Helpers PUROS: no hacen fetch ni conocen Supabase.

import { DIAS_SEMANA, hhmm } from "@/lib/agenda";

export type SolicitudTipo =
  | "grupal_crear"
  | "grupal_editar"
  | "grupal_finalizar"
  | "grupal_eliminar"
  | "disp_crear"
  | "disp_editar"
  | "disp_eliminar"
  | "ajuste_crear"
  | "ajuste_eliminar";

export type SolicitudAlcance = "solo_fecha" | "desde_fecha" | "toda_serie";
export type SolicitudEstado = "pendiente" | "aprobada" | "rechazada";

/** Tipos de cambio puntual soportados por `disponibilidad_ajustada`. */
export type TipoAjuste = "bloquear" | "reemplazar" | "agregar";

export type AgendaSolicitud = {
  id: string;
  coach_id: string;
  tipo: SolicitudTipo | string;
  alcance: SolicitudAlcance | string | null;
  entidad_tipo: string | null;
  entidad_id: string | null;
  valores_anteriores: Record<string, any> | null;
  valores_nuevos: Record<string, any> | null;
  fecha_efectiva: string | null;
  motivo: string | null;
  estado: SolicitudEstado | string;
  respuesta_admin: string | null;
  resuelto_at: string | null;
  created_at: string;
};

export const TIPO_SOLICITUD_LABEL: Record<string, string> = {
  grupal_crear: "Nueva clase grupal",
  grupal_editar: "Editar clase grupal",
  grupal_finalizar: "Finalizar clase grupal",
  grupal_eliminar: "Eliminar clase grupal",
  disp_crear: "Nuevo horario habitual (semanal)",
  disp_editar: "Editar horario habitual (semanal)",
  disp_eliminar: "Eliminar horario habitual (semanal)",
  ajuste_crear: "Cambio puntual en una fecha",
  ajuste_eliminar: "Quitar cambio puntual",
};

export const TIPO_AJUSTE_LABEL: Record<string, string> = {
  bloquear: "Bloquear el día completo",
  reemplazar: "Reemplazar el horario del día",
  agregar: "Agregar un tramo extra",
};

export const ALCANCE_LABEL: Record<string, string> = {
  solo_fecha: "Solo esa clase",
  desde_fecha: "Esa clase y las siguientes",
  toda_serie: "Toda la serie",
};

export const ESTADO_LABEL: Record<string, string> = {
  pendiente: "Pendiente",
  aprobada: "Aprobada",
  rechazada: "Rechazada",
};

/** ¿La solicitud es un cambio puntual de disponibilidad (no una serie semanal)? */
export const esSolicitudAjustePuntual = (tipo: string): boolean => tipo.startsWith("ajuste_");

/**
 * Resumen legible de un cambio puntual de disponibilidad.
 * `disponibilidad_ajustada` no guarda servicios ni sede: aplica a toda la agenda de esa fecha.
 */
export function resumenAjuste(
  v: Record<string, any> | null | undefined,
  fechaEfectiva?: string | null,
): string {
  const tipo = v?.tipo_ajuste || v?.tipo;
  if (!tipo) return "—";
  const fecha = (fechaEfectiva || v?.fecha) ? String(fechaEfectiva || v?.fecha).slice(0, 10) : null;
  const partes = [TIPO_AJUSTE_LABEL[tipo] || String(tipo)];
  if (fecha) partes.unshift(fecha);
  if (tipo !== "bloquear" && v?.hora_inicio && v?.hora_fin) {
    partes.push(`${hhmm(v.hora_inicio)}–${hhmm(v.hora_fin)}`);
  }
  return partes.join(" · ");
}


/** Resumen legible de un bloque horario guardado en jsonb. */
export function resumenBloque(v: Record<string, any> | null | undefined): string {
  if (!v || Object.keys(v).length === 0) return "—";
  const partes: string[] = [];
  if (v.tipo_clase === "puntual" && v.fecha) {
    partes.push(String(v.fecha).slice(0, 10));
  } else if (v.dia_semana !== undefined && v.dia_semana !== null && v.dia_semana !== "") {
    partes.push(DIAS_SEMANA[Number(v.dia_semana)] ?? "—");
  }
  if (v.hora_inicio && v.hora_fin) partes.push(`${hhmm(v.hora_inicio)}–${hhmm(v.hora_fin)}`);
  if (v.grupo) partes.push(String(v.grupo));
  if (v.vigente_desde) partes.push(`desde ${String(v.vigente_desde).slice(0, 10)}`);
  if (v.vigente_hasta) partes.push(`hasta ${String(v.vigente_hasta).slice(0, 10)}`);
  return partes.length ? partes.join(" · ") : "—";
}

/** Campos que cambian entre el estado guardado y el propuesto. */
export function camposModificados(
  antes: Record<string, any> | null | undefined,
  despues: Record<string, any> | null | undefined,
): string[] {
  const a = antes || {};
  const b = despues || {};
  const campos = ["coach_id", "sede_id", "dia_semana", "hora_inicio", "hora_fin", "grupo", "fecha", "tipo_clase"];
  return campos.filter((k) => {
    if (!(k in b)) return false;
    const va = a[k] === null || a[k] === undefined ? "" : String(a[k]);
    const vb = b[k] === null || b[k] === undefined ? "" : String(b[k]);
    const norm = (s: string) => (k.startsWith("hora") ? hhmm(s) : s.slice(0, 10) === s ? s : s);
    return norm(va) !== norm(vb);
  });
}
