/**
 * Reglas de categorización automática de egresos.
 *
 * Espejo en frontend de `public.match_gasto_categoria` / `gastos_autocategorizar`.
 * Se usa para previsualizar qué categoría le tocaría a un movimiento MP antes de
 * guardarlo, sin duplicar la decisión final (esa la toma siempre la base).
 */

export type ReglaCampo = "texto" | "descripcion" | "proveedor";

export interface GastoRegla {
  id: string;
  campo: ReglaCampo;
  patron: string;
  categoria_id: string;
  prioridad: number;
  activa: boolean;
  created_at?: string;
}

export interface GastoCategoria {
  id: string;
  nombre: string;
  activa: boolean;
  archivada_at?: string | null;
  orden?: number;
}

export const CATEGORIA_POR_CATEGORIZAR = "Por categorizar";
export const CATEGORIA_PROFESORES = "Profesores / Liquidaciones";

/** Origen de la categoría de un gasto. `manual` nunca se pisa. */
export type CategoriaOrigen = "importado" | "regla" | "manual" | "sin_categoria";

export function esCategoriaProtegida(origen: CategoriaOrigen | null | undefined): boolean {
  return origen === "manual";
}

function textoDe(campo: ReglaCampo, descripcion?: string | null, proveedor?: string | null): string {
  if (campo === "descripcion") return descripcion ?? "";
  if (campo === "proveedor") return proveedor ?? "";
  return `${descripcion ?? ""} ${proveedor ?? ""}`;
}

/**
 * Primera regla activa (por prioridad ascendente) cuyo patrón aparece en el texto.
 * Comparación case-insensitive, igual que el ILIKE '%patron%' del backend.
 */
export function matchRegla(
  reglas: GastoRegla[],
  descripcion?: string | null,
  proveedor?: string | null,
  categorias: GastoCategoria[] = [],
): GastoRegla | null {
  const catActiva = (id: string) => {
    if (categorias.length === 0) return true;
    const c = categorias.find((x) => x.id === id);
    return !!c && c.activa && !c.archivada_at;
  };

  const candidatas = reglas
    .filter((r) => r.activa && r.patron.trim() !== "" && catActiva(r.categoria_id))
    .filter((r) =>
      textoDe(r.campo, descripcion, proveedor).toLowerCase().includes(r.patron.trim().toLowerCase()),
    )
    .sort((a, b) => a.prioridad - b.prioridad || (a.created_at ?? "").localeCompare(b.created_at ?? ""));

  return candidatas[0] ?? null;
}

/**
 * Categoría que le corresponde a un gasto nuevo.
 * Si ya fue corregido a mano, se respeta la elección existente.
 */
export function resolverCategoria(input: {
  reglas: GastoRegla[];
  categorias: GastoCategoria[];
  descripcion?: string | null;
  proveedor?: string | null;
  categoriaActualId?: string | null;
  origenActual?: CategoriaOrigen | null;
}): { categoria_id: string | null; origen: CategoriaOrigen; regla_id: string | null } {
  if (esCategoriaProtegida(input.origenActual)) {
    return { categoria_id: input.categoriaActualId ?? null, origen: "manual", regla_id: null };
  }

  const regla = matchRegla(input.reglas, input.descripcion, input.proveedor, input.categorias);
  if (regla) return { categoria_id: regla.categoria_id, origen: "regla", regla_id: regla.id };

  const fallback = input.categorias.find(
    (c) => c.nombre.toLowerCase() === CATEGORIA_POR_CATEGORIZAR.toLowerCase(),
  );
  return { categoria_id: fallback?.id ?? null, origen: "sin_categoria", regla_id: null };
}

/** Patrón sugerido a partir del texto de un movimiento MP: primeras palabras significativas. */
export function sugerirPatron(texto: string | null | undefined): string {
  const limpio = (texto ?? "").replace(/[$\d.,]+/g, " ").replace(/\s+/g, " ").trim();
  if (!limpio || limpio.toLowerCase() === "varios") return "";
  return limpio.split(" ").slice(0, 3).join(" ");
}

// ---------------------------------------------------------------------------
// Matching conservador de transferencias a profesores
// ---------------------------------------------------------------------------

export interface ContraparteCoach {
  coach_id: string;
  mp_collector_id: string | null;
  nombre_contraparte?: string | null;
}

export type CoachMatch =
  | { estado: "inequivoco"; coach_id: string }
  | { estado: "ambiguo"; candidatos: string[] }
  | { estado: "sin_match" };

/**
 * Sólo se considera inequívoco cuando el identificador de contraparte de MP
 * (`raw.collector.id`) fue mapeado explícitamente a UN profesor.
 * Los egresos de MP no traen nombre de contraparte, así que no se adivina por texto.
 */
export function matchCoachPorContraparte(
  collectorId: string | null | undefined,
  contrapartes: ContraparteCoach[],
): CoachMatch {
  if (!collectorId) return { estado: "sin_match" };
  const hits = contrapartes.filter((c) => c.mp_collector_id && c.mp_collector_id === collectorId);
  const unicos = Array.from(new Set(hits.map((h) => h.coach_id)));
  if (unicos.length === 1) return { estado: "inequivoco", coach_id: unicos[0] };
  if (unicos.length > 1) return { estado: "ambiguo", candidatos: unicos };
  return { estado: "sin_match" };
}

export function collectorIdDeMovimiento(raw: any): string | null {
  const id = raw?.collector?.id;
  return id == null ? null : String(id);
}
