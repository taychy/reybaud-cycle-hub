import { supabase } from "@/integrations/supabase/client";
import { canOpenNativeBooking, type BookingOpening } from "./eventBookingOpening";

export interface AvailabilityRow {
  tipo: string;
  genero: string;
  capacity: number;
  taken: number;
  available: number;
}

const TIPO_LABEL: Record<string, string> = {
  pool: "Plazas compartidas entre modalidades",
  individual: "Individual",
  doble: "Doble",
  triple: "Triple",
  cuadruple: "Cuádruple",
  cabana: "Cabaña",
  dormitorio: "Dormitorio",
  otro: "Alojamiento",
};

const GENERO_LABEL: Record<string, string> = {
  femenina: "mujeres",
  masculina: "varones",
  mixta: "mixta",
};

export const tipoLabel = (t: string) => TIPO_LABEL[t] || (t ? t[0].toUpperCase() + t.slice(1) : "Alojamiento");
export const generoLabel = (g: string) => GENERO_LABEL[g] || g;

export function formatAvailabilityRow(r: AvailabilityRow): string {
  const tipo = tipoLabel(r.tipo);
  if (r.tipo === "pool") return `${tipo}: ${r.available > 0 ? `${r.available} ${r.available === 1 ? "lugar" : "lugares"}` : "sin cupo"}`;
  const gen = r.genero && r.genero !== "mixta" ? ` ${generoLabel(r.genero)}` : r.genero === "mixta" ? " mixta" : "";
  if (r.available <= 0) return `${tipo}${gen}: sin cupo`;
  return `${tipo}${gen}: ${r.available} ${r.available === 1 ? "lugar" : "lugares"}`;
}

/** Las habitaciones se cargan como mujeres/varones/mixto; la reserva usa femenina/masculina/mixta. */
export function normalizeRoomGender(g: unknown): string {
  const v = String(g || "mixta").toLowerCase();
  if (v === "mujeres" || v === "femenina") return "femenina";
  if (v === "varones" || v === "masculina") return "masculina";
  return "mixta";
}

/** Commercial availability only; physical room assignment continues to use the room RPC. */
export function controlledPoolAvailability(status: BookingOpening): AvailabilityRow[] {
  return [{
    tipo: "pool", genero: "mixta", capacity: status.capacity,
    taken: Math.max(0, status.capacity - status.available),
    available: canOpenNativeBooking(status) ? status.available : 0,
  }];
}

async function fetchRoomAvailability(packageId: string): Promise<AvailabilityRow[]> {
  const { data, error } = await supabase.rpc("get_package_availability_breakdown" as any, { p_package_id: packageId });
  if (error || !data) return [];
  return (data as any[]).map((r) => ({
    tipo: String(r.tipo || "otro"),
    genero: normalizeRoomGender(r.genero),
    capacity: Number(r.capacity || 0),
    taken: Number(r.taken || 0),
    available: Number(r.available || 0),
  }));
}

export async function fetchPackagesAvailability(packageIds: string[]): Promise<Record<string, AvailabilityRow[]>> {
  const out: Record<string, AvailabilityRow[]> = {};
  const ids = [...new Set(packageIds)];
  if (!ids.length) return out;
  ids.forEach(id => { out[id] = []; });
  const { data: packages, error } = await supabase.from("event_packages").select("id,event_id").in("id", ids);
  if (error || !packages) return out;
  const events = [...new Set(packages.map(p => p.event_id))];
  await Promise.all(events.map(async eventId => {
    const { data, error: openingError } = await supabase.rpc("event_booking_opening_status", { p_event_id: eventId });
    if (openingError || !data) return; // Never fall back to a different capacity on failure.
    const status = data as unknown as BookingOpening;
    const eventPackages = packages.filter(p => p.event_id === eventId);
    if (status.controlled) {
      eventPackages.forEach(p => { out[p.id] = controlledPoolAvailability(status); });
      return;
    }
    await Promise.all(eventPackages.map(async p => { out[p.id] = await fetchRoomAvailability(p.id); }));
  }));
  return out;
}

export async function fetchPackageAvailability(packageId: string): Promise<AvailabilityRow[]> {
  return fetchRoomAvailability(packageId);
}
