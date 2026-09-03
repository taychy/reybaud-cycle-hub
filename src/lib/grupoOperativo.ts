/**
 * Grupo OPERATIVO (derivado, sólo lectura) para Admin > Alumnos.
 *
 * No muta `alumnos.grupo` (dato histórico/manual). Se deriva de relaciones
 * ACTUALES existentes:
 *  - Aspirantes   → suscripción efectivamente activa a un plan `categoria='formacion'`
 *                   (Programa de Formación / Iniciación vigente).
 *  - Personalizado→ suscripción efectivamente activa a plan `categoria='asesoria'`
 *                   (Asesoría / Clase Personalizada) o reserva de Turnera de un
 *                   servicio personalizado, no cancelada y reciente/futura.
 *  - G1..G4       → pelotones regulares, según `alumnos.grupo`.
 *  - Evaluatorias → reserva de Turnera del servicio `clase-evaluatoria`, no cancelada
 *                   y reciente/futura, para alumnos que aún no están en pelotón.
 *  - Sin grupo    → todo lo demás (incluye el legacy `Principiante`).
 *
 * Precedencia (ver test): formación > personalizado > G1..G4 > evaluatoria > sin grupo.
 * Evidencia para poner G1..G4 antes que Evaluatorias: hay alumnos ya integrados a
 * pelotón (G2/G3) con una clase evaluatoria reciente en su historial; clasificarlos
 * como "en proceso de ingreso" sería incorrecto.
 */

export const GRUPO_OP = {
  G1: "G1",
  G2: "G2",
  G3: "G3",
  G4: "G4",
  ASPIRANTES: "Aspirantes",
  PERSONALIZADO: "Personalizado",
  EVALUATORIAS: "Evaluatorias",
  SIN_GRUPO: "Sin grupo",
} as const;

export type GrupoOperativo = (typeof GRUPO_OP)[keyof typeof GRUPO_OP];

/** Orden operativo estable de los chips. */
export const GRUPO_OP_ORDER: GrupoOperativo[] = [
  GRUPO_OP.G1,
  GRUPO_OP.G2,
  GRUPO_OP.G3,
  GRUPO_OP.G4,
  GRUPO_OP.ASPIRANTES,
  GRUPO_OP.PERSONALIZADO,
  GRUPO_OP.EVALUATORIAS,
  GRUPO_OP.SIN_GRUPO,
];

const PELOTONES = new Set<string>([GRUPO_OP.G1, GRUPO_OP.G2, GRUPO_OP.G3, GRUPO_OP.G4]);

/** Slug del servicio de Turnera de clase evaluatoria (dato real en `servicios_turnera`). */
export const SLUG_EVALUATORIA = "clase-evaluatoria";
/** Slugs de servicios de Turnera considerados personalizados. */
export const SLUGS_PERSONALIZADOS = ["personalizada", "personalizada-90", "clase-en-pareja"];

/** Ventana (días hacia atrás) para considerar una reserva como relación actual. */
export const VENTANA_RESERVA_DIAS = 30;

export interface SubMin {
  /** Categoría del plan de la suscripción (`planes.categoria`). */
  categoria: string | null;
}

export interface ReservaMin {
  /** Slug del servicio de Turnera. */
  slug: string;
  /** `estado_operativo` de la reserva. */
  estado: string | null;
  /** Fecha ISO `YYYY-MM-DD`. */
  fecha: string;
}

export interface AlumnoClasificable {
  id: string;
  grupo: string | null;
  /** SÓLO suscripciones efectivamente activas (criterio canónico de la pantalla). */
  subsActivas: SubMin[];
  /** Reservas de Turnera del alumno (todas; el helper filtra canceladas/antiguas). */
  reservas: ReservaMin[];
}

export function esReservaCancelada(estado: string | null): boolean {
  return (estado || "").toLowerCase().startsWith("cancelada");
}

/** Fecha ISO límite hacia atrás para considerar una reserva vigente. */
export function fechaLimiteReserva(hoyIso: string, dias = VENTANA_RESERVA_DIAS): string {
  const [y, m, d] = hoyIso.split("-").map(Number);
  const base = new Date(y, m - 1, d);
  base.setDate(base.getDate() - dias);
  const mm = String(base.getMonth() + 1).padStart(2, "0");
  const dd = String(base.getDate()).padStart(2, "0");
  return `${base.getFullYear()}-${mm}-${dd}`;
}

function reservaVigente(r: ReservaMin, hoyIso: string): boolean {
  return !esReservaCancelada(r.estado) && r.fecha >= fechaLimiteReserva(hoyIso);
}

/** Programa de formación vigente (no usa historial ni canceladas). */
export function tieneProgramaFormacionActivo(a: AlumnoClasificable): boolean {
  return a.subsActivas.some((s) => (s.categoria || "").toLowerCase() === "formacion");
}

/** Relación personalizada actual: plan de asesoría activo o reserva personalizada vigente. */
export function tienePersonalizadoActivo(a: AlumnoClasificable, hoyIso: string): boolean {
  if (a.subsActivas.some((s) => (s.categoria || "").toLowerCase() === "asesoria")) return true;
  return a.reservas.some((r) => SLUGS_PERSONALIZADOS.includes(r.slug) && reservaVigente(r, hoyIso));
}

/** Clase evaluatoria agendada/realizada recientemente y no cancelada. */
export function tieneEvaluatoriaActiva(a: AlumnoClasificable, hoyIso: string): boolean {
  return a.reservas.some((r) => r.slug === SLUG_EVALUATORIA && reservaVigente(r, hoyIso));
}

/** Clasificación canónica por precedencia. */
export function clasificarGrupoOperativo(a: AlumnoClasificable, hoyIso: string): GrupoOperativo {
  if (tieneProgramaFormacionActivo(a)) return GRUPO_OP.ASPIRANTES;
  if (tienePersonalizadoActivo(a, hoyIso)) return GRUPO_OP.PERSONALIZADO;
  const g = (a.grupo || "").trim();
  if (PELOTONES.has(g)) return g as GrupoOperativo;
  if (tieneEvaluatoriaActiva(a, hoyIso)) return GRUPO_OP.EVALUATORIAS;
  return GRUPO_OP.SIN_GRUPO;
}

export interface GrupoOpBucket {
  grupo: GrupoOperativo;
  count: number;
}

/** Buckets mutuamente excluyentes; la suma es exactamente `alumnos.length`. */
export function distribucionGrupoOperativo(
  alumnos: AlumnoClasificable[],
  hoyIso: string,
): GrupoOpBucket[] {
  const map = new Map<GrupoOperativo, number>();
  for (const a of alumnos) {
    const g = clasificarGrupoOperativo(a, hoyIso);
    map.set(g, (map.get(g) || 0) + 1);
  }
  return GRUPO_OP_ORDER.filter((g) => (map.get(g) || 0) > 0).map((g) => ({
    grupo: g,
    count: map.get(g) as number,
  }));
}

/** Clave de filtro para los chips del bloque (separada del filtro histórico `grupo_`). */
export function grupoOperativoFilterKey(grupo: GrupoOperativo): string {
  return `grupo_op_${grupo}`;
}
