/**
 * Distribución ficticia de un escenario financiero (solo simulación).
 *
 * Invariantes (válidas para cualquier evento):
 * - La capacidad comercial (cupos de paquetes) NUNCA se usa como cantidad simulada.
 * - SUM(distribución) === participantes del escenario.
 * - Cambiar cupos no cambia una distribución existente.
 * - Cambiar participantes reajusta preservando proporciones.
 */

export type Distribucion = Record<string, number>;

export interface EscenarioBase {
  id: string;
  nombre: string;
  inscriptos: number;
  distribucion?: Distribucion;
}

export const sumaDistribucion = (d: Distribucion | null | undefined): number =>
  Object.values(d || {}).reduce((a, v) => a + (Number(v) || 0), 0);

/**
 * Ajusta `base` para que sume exactamente `total` sobre `keys`, preservando
 * proporciones (mayor resto). Sin pesos, reparte en partes iguales.
 */
export function ajustarDistribucion(keys: string[], base: Distribucion | null | undefined, total: number): Distribucion {
  const objetivo = Math.max(0, Math.round(Number(total) || 0));
  if (keys.length === 0) return {};
  if (objetivo === 0) return Object.fromEntries(keys.map((k) => [k, 0]));

  const pesos = keys.map((k) => Math.max(0, Number(base?.[k] ?? 0)));
  const sumaPesos = pesos.reduce((a, v) => a + v, 0);
  if (sumaPesos > 0 && sumaPesos === objetivo) {
    return Object.fromEntries(keys.map((k, i) => [k, pesos[i]]));
  }
  if (sumaPesos <= 0) {
    const igual = Math.floor(objetivo / keys.length);
    let resto = objetivo - igual * keys.length;
    const out: Distribucion = {};
    keys.forEach((k) => { out[k] = igual + (resto > 0 ? 1 : 0); if (resto > 0) resto -= 1; });
    return out;
  }
  const exactos = keys.map((key, idx) => ({ key, idx, exacto: (objetivo * pesos[idx]) / sumaPesos }));
  const out: Distribucion = {};
  exactos.forEach((x) => { out[x.key] = Math.floor(x.exacto); });
  let faltan = objetivo - sumaDistribucion(out);
  exactos
    .slice()
    .sort((a, b) => ((b.exacto % 1) - (a.exacto % 1)) || (a.idx - b.idx))
    .forEach((x) => { if (faltan > 0) { out[x.key] += 1; faltan -= 1; } });
  return out;
}

/** Normaliza un escenario: su distribución siempre suma sus inscriptos. */
export function normalizarEscenario(keys: string[], e: EscenarioBase, fallback?: Distribucion | null): EscenarioBase {
  const inscriptos = Math.max(0, Math.round(Number(e.inscriptos) || 0));
  const fuente = e.distribucion && typeof e.distribucion === "object" ? e.distribucion : fallback;
  return { id: String(e.id), nombre: String(e.nombre || ""), inscriptos, distribucion: ajustarDistribucion(keys, fuente, inscriptos) };
}

/** Cambia participantes del escenario y reajusta su distribución. */
export function cambiarParticipantes(keys: string[], e: EscenarioBase, inscriptos: number): EscenarioBase {
  return normalizarEscenario(keys, { ...e, inscriptos }, e.distribucion);
}

/** Escenario nuevo: distribución inicial pareja; los cupos no se interpretan como ventas. */
export function crearEscenario(keys: string[], id: string, nombre: string, inscriptos: number): EscenarioBase {
  return normalizarEscenario(keys, { id, nombre, inscriptos });
}

export interface ValidacionDistribucion { ok: boolean; suma: number; esperado: number; mensaje: string | null }

/** Validación previa a calcular/guardar. */
export function validarDistribucion(d: Distribucion | null | undefined, inscriptos: number): ValidacionDistribucion {
  const suma = sumaDistribucion(d);
  const esperado = Math.max(0, Math.round(Number(inscriptos) || 0));
  const ok = esperado > 0 && suma === esperado;
  return {
    ok, suma, esperado,
    mensaje: ok ? null
      : esperado <= 0 ? "El escenario activo no tiene participantes definidos."
      : `La distribución por paquete suma ${suma} y el escenario tiene ${esperado} participantes. Ajustala para que sumen exactamente ${esperado}.`,
  };
}
