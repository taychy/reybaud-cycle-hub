/**
 * Helpers de capacidad física de alojamiento.
 *
 * En este alcance NO existe un cupo vendible independiente: la capacidad
 * física (habitaciones × personas por habitación) ES el cupo del paquete.
 */

export interface RoomLike {
  id: string;
  package_id: string | null;
  nombre?: string | null;
  capacidad: number | null;
  tipo?: string | null;
  sort_order?: number | null;
}

export interface RoomSyncPlan {
  /** rooms a crear (sin id) */
  toInsert: { nombre: string; capacidad: number; tipo: string | null; sort_order: number }[];
  /** ids de rooms a eliminar */
  toDeleteIds: string[];
  /** rooms cuya capacidad hay que actualizar */
  toUpdate: { id: string; capacidad: number }[];
  /** capacidad física resultante */
  capacidad: number;
}

export function capacidadFisica(habitaciones: number, personasPorHabitacion: number): number {
  const h = Math.max(0, Math.floor(Number(habitaciones) || 0));
  const p = Math.max(1, Math.floor(Number(personasPorHabitacion) || 1));
  return h * p;
}

/**
 * Calcula el plan de sincronización de `event_rooms` de un paquete para
 * alcanzar `habitaciones` habitaciones de `personas` plazas cada una.
 * Las habitaciones sobrantes se eliminan desde el final.
 */
export function planRoomSync(opts: {
  existing: RoomLike[];
  habitaciones: number;
  personas: number;
  tipo?: string | null;
  label?: string;
}): RoomSyncPlan {
  const habitaciones = Math.max(0, Math.floor(Number(opts.habitaciones) || 0));
  const personas = Math.max(1, Math.floor(Number(opts.personas) || 1));
  const tipo = opts.tipo ?? opts.existing[0]?.tipo ?? null;
  const label = opts.label || "Habitación";

  const ordered = [...opts.existing].sort(
    (a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0),
  );

  const keep = ordered.slice(0, habitaciones);
  const toDeleteIds = ordered.slice(habitaciones).map((r) => r.id);
  const toUpdate = keep
    .filter((r) => (Number(r.capacidad) || 0) !== personas)
    .map((r) => ({ id: r.id, capacidad: personas }));

  const toInsert = Array.from(
    { length: Math.max(0, habitaciones - keep.length) },
    (_, i) => ({
      nombre: `${label} ${keep.length + i + 1}`,
      capacidad: personas,
      tipo,
      sort_order: keep.length + i,
    }),
  );

  return { toInsert, toDeleteIds, toUpdate, capacidad: habitaciones * personas };
}

/**
 * Guard simple: no permitir reducir la capacidad física por debajo de las
 * reservas activas ya existentes del paquete.
 * Devuelve el mensaje de error o null si es válido.
 */
export function capacityReductionError(
  nuevaCapacidad: number,
  reservasActivas: number,
): string | null {
  const cap = Math.max(0, Number(nuevaCapacidad) || 0);
  const res = Math.max(0, Number(reservasActivas) || 0);
  if (res > 0 && cap < res) {
    return `No se puede dejar ${cap} plazas: ya hay ${res} reserva${res === 1 ? "" : "s"} activa${res === 1 ? "" : "s"} en este alojamiento.`;
  }
  return null;
}
