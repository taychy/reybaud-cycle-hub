/**
 * Normalización de teléfonos AR para conciliación WhatsApp ↔ App.
 *
 * Reglas:
 * - WhatsApp usa siempre formato móvil AR: 549 + cód. área (sin 0) + número (sin 15).
 * - Aceptamos input con +, espacios, guiones, paréntesis, "0" y "15".
 * - Devuelve solo dígitos. Si no parece un AR válido, devuelve null.
 */
export function normalizePhoneAR(input: string | null | undefined): string | null {
  if (!input) return null;
  let digits = String(input).replace(/\D/g, "");
  if (digits.length < 8) return null;

  // Strip leading "00" (international prefix)
  if (digits.startsWith("00")) digits = digits.slice(2);

  // If starts with 54 (country) — strip and re-add canonical 549 later
  if (digits.startsWith("549")) {
    digits = digits.slice(3);
  } else if (digits.startsWith("54")) {
    digits = digits.slice(2);
  }

  // Strip leading 0 (área prefix shortcut)
  while (digits.startsWith("0")) digits = digits.slice(1);

  // Strip "15" if it appears between area code and número (común en AR)
  // Heurística: si los dígitos 3-4 (después de 2-3 de área) son "15", quitarlos.
  // Para no romper números válidos, sólo lo aplicamos si el largo total es > 10.
  if (digits.length > 10) {
    // intentar quitar "15" en posición común: después de 2,3 o 4 dígitos de área
    for (const areaLen of [2, 3, 4]) {
      if (digits.length - areaLen >= 8 && digits.substring(areaLen, areaLen + 2) === "15") {
        const candidate = digits.substring(0, areaLen) + digits.substring(areaLen + 2);
        if (candidate.length === 10) {
          digits = candidate;
          break;
        }
      }
    }
  }

  // En este punto esperamos 10 dígitos (área + número)
  if (digits.length < 10) return null;
  if (digits.length > 11) return null; // descarte: probablemente no AR

  // Tomamos los últimos 10 (por si quedó algo extra al inicio)
  digits = digits.slice(-10);

  return "549" + digits;
}

/**
 * Extrae todos los teléfonos de un texto pegado (lista del grupo de WhatsApp,
 * exportación, copy-paste de contactos, etc.).
 * Devuelve array de teléfonos normalizados, deduplicados, en orden de aparición.
 */
export function extractPhonesFromText(text: string): string[] {
  if (!text) return [];
  // Captura secuencias que parecen un teléfono: comienzan opcional con +, tienen
  // al menos 8 dígitos contando separadores comunes.
  const matches = text.match(/\+?\d[\d\s\-\(\)\.]{7,}\d/g) || [];
  const result: string[] = [];
  const seen = new Set<string>();
  for (const m of matches) {
    const norm = normalizePhoneAR(m);
    if (norm && !seen.has(norm)) {
      seen.add(norm);
      result.push(norm);
    }
  }
  return result;
}

/** Formatea un teléfono normalizado para mostrar: +54 9 11 5728-0827 */
export function formatPhoneAR(normalized: string | null | undefined): string {
  if (!normalized) return "—";
  const d = normalized.replace(/\D/g, "");
  if (!d.startsWith("549") || d.length !== 13) return normalized;
  const area = d.slice(3, 5);
  const rest = d.slice(5);
  if (rest.length === 8) return `+54 9 ${area} ${rest.slice(0, 4)}-${rest.slice(4)}`;
  return `+${d}`;
}
