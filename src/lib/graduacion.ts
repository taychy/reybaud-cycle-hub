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

/** Clave de deduplicación: una tarea abierta por alumno + destino. */
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

/** Título de la tarea de felicitación. */
export function graduacionTareaTitulo(alumnoNombre: string, grupoDestino: string): string {
  return `🎓 Felicitar a ${alumnoNombre} por su graduación a ${grupoDestino}`;
}
