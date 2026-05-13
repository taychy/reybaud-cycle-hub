/**
 * Normalización y matching difuso de nombres para conciliación WhatsApp ↔ App.
 *
 * - Quita tildes, pasa a minúsculas, colapsa espacios.
 * - Match: comparamos sets de tokens (palabras) de cada nombre.
 *   Coincide si TODOS los tokens del nombre más corto están en el más largo
 *   (esto tolera "Juan Pérez" vs "Juan Pérez Gómez", "Mati Pérez" vs "Matías Pérez", etc.).
 */

export function normalizeName(input: string | null | undefined): string {
  if (!input) return "";
  return String(input)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // quitar tildes
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ") // quitar emojis, signos
    .replace(/\s+/g, " ")
    .trim();
}

export function nameTokens(input: string | null | undefined): string[] {
  const norm = normalizeName(input);
  if (!norm) return [];
  return norm.split(" ").filter(t => t.length >= 2); // descartar iniciales sueltas
}

/**
 * Devuelve un score 0..1 de match entre dos nombres.
 * 1 = todos los tokens del más corto están en el más largo.
 * 0.5 = al menos un token compartido.
 * 0 = nada.
 */
export function nameMatchScore(a: string, b: string): number {
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  if (ta.length === 0 || tb.length === 0) return 0;
  const [shorter, longer] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  const longerSet = new Set(longer);
  const matched = shorter.filter(t => longerSet.has(t)).length;
  if (matched === 0) return 0;
  if (matched === shorter.length && shorter.length >= 2) return 1; // match fuerte
  if (matched === shorter.length && shorter.length === 1) return 0.7; // un solo token (riesgoso)
  return matched / shorter.length;
}

/**
 * Extrae nombres candidatos de un texto pegado libre.
 * Tolera: una línea por nombre, líneas con teléfonos, líneas con basura.
 * Filtra teléfonos puros, líneas muy cortas o muy largas.
 */
export function extractNamesFromText(text: string): string[] {
  if (!text) return [];
  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of lines) {
    // quitar todo lo que parezca teléfono dentro de la línea
    const cleaned = raw
      .replace(/\+?\d[\d\s\-\(\)\.]{6,}\d/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!cleaned) continue;
    if (cleaned.length < 3 || cleaned.length > 80) continue;
    // descartar líneas que no tengan ninguna letra
    if (!/[a-záéíóúñ]/i.test(cleaned)) continue;
    // descartar etiquetas tipo "Admin del grupo", "Tú", marcas de hora
    if (/^(t[uú]|admin|usted|you|info|miembros?|members?)$/i.test(cleaned)) continue;
    const key = normalizeName(cleaned);
    if (key && !seen.has(key)) {
      seen.add(key);
      out.push(cleaned);
    }
  }
  return out;
}
