/**
 * Graduaciones de grupo (Chequeo de Alumnos).
 *
 * Lógica pura equivalente a la RPC `registrar_cambio_grupo_alumno`
 * con contexto `chequeo_alumnos`. No envía mensajes ni toca WhatsApp.
 */

export const GRUPO_PROGRESION = ["Aspirantes", "Principiante", "G4", "G3", "G2", "G1"] as const;

/** Ranking de progresión; null si el grupo no participa (ej. "Personalizado"). */
export function grupoRank(grupo: string | null | undefined): number | null {
  if (!grupo) return null;
  const idx = GRUPO_PROGRESION.findIndex(g => g.toLowerCase() === grupo.trim().toLowerCase());
  return idx === -1 ? null : idx + 1;
}

/** Un cambio es graduación sólo si ambos grupos están rankeados y el nuevo es superior. */
export function isGraduacion(grupoPrevio: string | null | undefined, grupoNuevo: string | null | undefined): boolean {
  const prev = grupoRank(grupoPrevio);
  const next = grupoRank(grupoNuevo);
  if (prev === null || next === null) return false;
  return next > prev;
}

/** Un cambio es reversión si baja de nivel dentro de la progresión. */
export function isReversion(grupoPrevio: string | null | undefined, grupoNuevo: string | null | undefined): boolean {
  const prev = grupoRank(grupoPrevio);
  const next = grupoRank(grupoNuevo);
  if (prev === null || next === null) return false;
  return next < prev;
}

/** Tipos de cambio de grupo comunicables al alumno. */
export type TipoCambioGrupo = "graduacion" | "descenso" | "cambio_grupo" | "sin_cambio";

/** Orígenes de tarea de comunicación de cambio de grupo. */
export const ORIGENES_CAMBIO_GRUPO = [
  "graduacion_alumno",
  "descenso_grupo_alumno",
  "cambio_grupo_alumno",
] as const;

/** Clasificación server-side equivalente. */
export function clasificarCambioGrupo(
  grupoPrevio: string | null | undefined,
  grupoNuevo: string | null | undefined
): TipoCambioGrupo {
  const prevNorm = (grupoPrevio ?? "").trim().toLowerCase();
  const nextNorm = (grupoNuevo ?? "").trim().toLowerCase();
  if (prevNorm === nextNorm) return "sin_cambio";
  if (isGraduacion(grupoPrevio, grupoNuevo)) return "graduacion";
  if (isReversion(grupoPrevio, grupoNuevo)) return "descenso";
  return "cambio_grupo";
}

/** Clave de deduplicación: una tarea de comunicación abierta por alumno. */
export function cambioGrupoDedupeKey(alumnoId: string): string {
  return `gcom_${alumnoId}`;
}

/** Clave de deduplicación legacy (graduaciones por destino). */
export function graduacionDedupeKey(alumnoId: string, grupoDestino: string): string {
  return `grad_${alumnoId}_${grupoDestino.toLowerCase()}`;
}

/** Borrador determinístico del mensaje de felicitación (sin IA). */
export function buildMensajeGraduacion(params: {
  alumnoNombre: string;
  grupoDestino: string;
  coachNombre?: string | null;
  notaChequeo?: string | null;
}): string {
  const primer = (params.alumnoNombre || "").trim().split(/\s+/)[0] || "Hola";
  const base =
    `${primer}, quería felicitarte personalmente. Hoy decidimos que es momento de que pases a ${params.grupoDestino}. ` +
    `No es solamente un cambio de grupo: refleja todo lo que fuiste aprendiendo, la constancia y la seguridad que ` +
    `fuiste construyendo arriba de la bici. Nos pone muy contentos acompañar tu evolución. Ahora empieza una nueva ` +
    `etapa, con nuevos desafíos. ¡Felicitaciones, te lo ganaste! 🚴✨`;
  const nota = (params.notaChequeo || "").trim();
  const firma = (params.coachNombre || "").trim();
  return [base, nota ? nota : null, firma ? firma : null].filter(Boolean).join("\n\n");
}

/** Borrador para cambio a un grupo de menor exigencia (tono no punitivo). */
export function buildMensajeDescenso(params: {
  alumnoNombre: string;
  grupoDestino: string;
  coachNombre?: string | null;
}): string {
  const primer = (params.alumnoNombre || "").trim().split(/\s+/)[0] || "Hola";
  const base =
    `${primer}, quería contarte personalmente que por ahora vamos a pasar a ${params.grupoDestino}. ` +
    `La idea es que puedas seguir entrenando en un grupo que acompañe mejor este momento de tu proceso y te permita ` +
    `trabajar con más confianza y seguridad. Esto no borra todo lo que ya avanzaste ni es una sanción; es una decisión ` +
    `para ayudarte a seguir progresando paso a paso. Vamos a acompañarte en esta etapa y revisar juntos cómo vas evolucionando. 💪🚴`;
  const firma = (params.coachNombre || "").trim();
  return [base, firma ? firma : null].filter(Boolean).join("\n\n");
}

/** Borrador neutro para cambios no clasificables. */
export function buildMensajeCambioNeutro(params: {
  alumnoNombre: string;
  grupoDestino: string;
  coachNombre?: string | null;
}): string {
  const primer = (params.alumnoNombre || "").trim().split(/\s+/)[0] || "Hola";
  const base =
    `${primer}, quería avisarte personalmente que a partir de ahora vas a estar en ${params.grupoDestino}. ` +
    `Este cambio busca que tu entrenamiento quede mejor alineado con el trabajo que estamos haciendo con vos. ` +
    `Si tenés alguna duda, lo conversamos antes de la próxima clase. 🚴`;
  const firma = (params.coachNombre || "").trim();
  return [base, firma ? firma : null].filter(Boolean).join("\n\n");
}

/** Título de la tarea de felicitación. */
export function graduacionTareaTitulo(alumnoNombre: string, grupoDestino: string): string {
  return `🎓 Felicitar a ${alumnoNombre} por su graduación a ${grupoDestino}`;
}

/** Título según el tipo de cambio. */
export function cambioGrupoTareaTitulo(
  tipo: TipoCambioGrupo,
  alumnoNombre: string,
  grupoOrigen: string | null | undefined,
  grupoDestino: string
): string {
  if (tipo === "graduacion") return graduacionTareaTitulo(alumnoNombre, grupoDestino);
  if (tipo === "descenso") return `💬 Hablar con ${alumnoNombre} sobre su cambio a ${grupoDestino}`;
  return `💬 Avisar a ${alumnoNombre} su cambio de grupo: ${grupoOrigen ?? "sin grupo"} → ${grupoDestino}`;
}

/** Etiqueta visible (nunca humillante para el alumno). */
export function cambioGrupoBadge(tipo: TipoCambioGrupo): string {
  if (tipo === "graduacion") return "🎓 Graduación";
  if (tipo === "descenso") return "↘ Cambio a menor exigencia";
  return "↔ Cambio de grupo";
}

