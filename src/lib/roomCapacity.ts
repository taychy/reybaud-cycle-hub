/**
 * Heurística para detectar la capacidad y si el paquete requiere alojamiento
 * a partir del nombre del paquete (ej: "Habitación doble", "Sin alojamiento",
 * "Individual", "Triple"). Devuelve null cuando el paquete NO incluye
 * alojamiento (o no se puede determinar).
 */
export function parseRoomCapacity(packageName: string | null | undefined): { capacity: number | null; requiresLodging: boolean; label: string } {
  const raw = (packageName || "").toLowerCase();
  if (!raw) return { capacity: null, requiresLodging: false, label: "" };

  const sinAlojamiento = /sin\s+alojamiento|no\s+incluye\s+aloj|no\s+aloj/i.test(raw);
  if (sinAlojamiento) return { capacity: null, requiresLodging: false, label: "Sin alojamiento" };

  if (/(individual|single|hab\s*ind)/i.test(raw)) return { capacity: 1, requiresLodging: true, label: "Individual" };
  if (/(cu[aá]druple|cuadruple|quad)/i.test(raw)) return { capacity: 4, requiresLodging: true, label: "Cuádruple" };
  if (/triple/i.test(raw)) return { capacity: 3, requiresLodging: true, label: "Triple" };
  if (/(doble|double|matrimonial|twin)/i.test(raw)) return { capacity: 2, requiresLodging: true, label: "Doble" };

  // Fallback: paquetes que no mencionan alojamiento → asumimos que sí requiere
  // pero no conocemos la capacidad. Mostramos la sección informativa igual.
  return { capacity: null, requiresLodging: true, label: "" };
}
