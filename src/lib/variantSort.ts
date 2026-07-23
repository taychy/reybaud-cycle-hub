/**
 * Ordenamiento canónico de variantes de producto, especialmente talles.
 * Nomenclatura estándar:
 * XS (Extra Small) → S (Small) → M (Medium) → L (Large) →
 * XL (Extra Large) → 2XL → 3XL → 4XL
 */

export const SIZE_ORDER = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL"];

const SIZE_ALIASES: Record<string, number> = {
  "XS": 0, "EXTRA SMALL": 0, "X-SMALL": 0, "X SMALL": 0, "EXTRA CHICO": 0, "XCHICO": 0,
  "S": 1, "SMALL": 1, "CHICO": 1, "CHICA": 1,
  "M": 2, "MEDIUM": 2, "MEDIANO": 2, "MEDIANA": 2,
  "L": 3, "LARGE": 3, "GRANDE": 3,
  "XL": 4, "EXTRA LARGE": 4, "X-LARGE": 4, "X LARGE": 4, "EXTRA GRANDE": 4, "XGRANDE": 4,
  "2XL": 5, "XXL": 5, "2X LARGE": 5, "DOBLE EXTRA LARGE": 5, "DOBLE EXTRA GRANDE": 5,
  "3XL": 6, "XXXL": 6, "3X LARGE": 6, "TRIPLE EXTRA LARGE": 6, "TRIPLE EXTRA GRANDE": 6,
  "4XL": 7, "XXXXL": 7, "4X LARGE": 7, "CUADRUPLE EXTRA LARGE": 7, "CUADRUPLE EXTRA GRANDE": 7,
};

/** Normaliza un valor de talle a su índice canónico, o null si no es reconocible. */
export const normalizeSizeValue = (value: string | number | null | undefined): number | null => {
  const raw = String(value ?? "").trim().toUpperCase().replace(/[-_\s]+/g, " ");
  if (!raw) return null;

  // Match directo o alias completo
  if (SIZE_ALIASES[raw] !== undefined) return SIZE_ALIASES[raw];

  // Patrones numéricos: 2XL, 3XL, 4XL, 5XL...
  const numMatch = raw.match(/^(\d+)\s*XL$/);
  if (numMatch) {
    const n = parseInt(numMatch[1], 10);
    if (n >= 2) return 4 + (n - 1); // 2XL=5, 3XL=6, 4XL=7, etc.
  }

  // Patrones X-based: XXL, XXXL, XXS, etc.
  const xMatch = raw.match(/^(X+)([SL])$/);
  if (xMatch) {
    const xCount = xMatch[1].length;
    if (xMatch[2] === "S") return Math.max(0, 1 - xCount); // XS=0, XXS=0 (clamp)
    if (xMatch[2] === "L") return Math.min(7, 4 + xCount); // XL=4, XXL=5, XXXL=6, XXXXL=7
  }

  return null;
};

/** Detecta si el nombre de atributo corresponde a talle/talla/size. */
export const isSizeAttribute = (attrName: string | null | undefined): boolean => {
  if (!attrName) return false;
  return /\b(talle|talla|size|tamanio|tamaño|talles)\b/i.test(attrName);
};

/** Compara dos valores de una misma variante. Si es un atributo de talle, usa orden canónico. */
export const compareVariantValues = (
  a: string | number | null | undefined,
  b: string | number | null | undefined,
  attrName?: string | null,
): number => {
  const sa = String(a ?? "");
  const sb = String(b ?? "");

  if (isSizeAttribute(attrName)) {
    const na = normalizeSizeValue(a);
    const nb = normalizeSizeValue(b);
    if (na !== null && nb !== null) return na - nb;
  }

  // Fallback: orden alfabético con soporte numérico ("Talle 10" < "Talle 2" según locale, numeric)
  return sa.localeCompare(sb, "es", { numeric: true, sensitivity: "base" });
};

/** Ordena las opciones dentro de cada especificación de variante. */
export const sortVariantSpecOptions = <T extends { name: string; options: string[] }>(
  spec: T,
): T => ({
  ...spec,
  options: [...spec.options].sort((a, b) => compareVariantValues(a, b, spec.name)),
});

export const sortVariantSpecs = <T extends { name: string; options: string[] }>(
  specs: T[] | null | undefined,
): T[] => {
  if (!Array.isArray(specs)) return [];
  return specs.filter((s) => s?.name && Array.isArray(s?.options)).map(sortVariantSpecOptions);
};

/**
 * Convierte una variante a objeto plano {attr: value}.
 * Soporta objetos, strings tipo "Talle: M · Color: Negro" o "Talle: M".
 */
export const parseVariant = (v: any): Record<string, string> => {
  if (!v) return {};
  if (typeof v === "string") {
    const obj: Record<string, string> = {};
    const parts = v.split(/[·|/,]+/);
    parts.forEach((part) => {
      const match = part.match(/^\s*([^:]+)\s*:\s*(.+?)\s*$/);
      if (match) obj[match[1].trim()] = match[2].trim();
    });
    return obj;
  }
  if (typeof v === "object" && !Array.isArray(v)) {
    return Object.fromEntries(
      Object.entries(v)
        .filter(([, val]) => val != null && String(val).trim() !== "")
        .map(([k, val]) => [k, String(val)]),
    );
  }
  return {};
};

/**
 * Devuelve una clave de ordenamiento para una variante: prioriza el atributo
 * de talle (si existe) y luego el resto alfabéticamente.
 */
export const variantSizeSortKey = (v: any): [number, string] => {
  const obj = parseVariant(v);
  const sizeKey = Object.keys(obj).find((k) => isSizeAttribute(k));
  const sizeVal = sizeKey ? obj[sizeKey] : "";
  const sizeIdx = normalizeSizeValue(sizeVal) ?? 999;

  const rest = Object.entries(obj)
    .filter(([k]) => k !== sizeKey)
    .sort((a, b) => a[0].localeCompare(b[0], "es"))
    .map(([k, val]) => `${k}:${val}`)
    .join("|");

  return [sizeIdx, rest];
};

/** Compara dos variantes (objetos o strings) priorizando el talle. */
export const compareVariantsBySize = (a: any, b: any): number => {
  const [ia, ra] = variantSizeSortKey(a);
  const [ib, rb] = variantSizeSortKey(b);
  if (ia !== ib) return ia - ib;
  return ra.localeCompare(rb, "es", { numeric: true, sensitivity: "base" });
};
