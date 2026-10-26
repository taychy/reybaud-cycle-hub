import { supabase } from "@/integrations/supabase/client";

export interface AvailabilityRow {
  tipo: string;
  genero: string;
  capacity: number;
  taken: number;
  available: number;
}

const TIPO_LABEL: Record<string, string> = {
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

export async function fetchPackageAvailability(packageId: string): Promise<AvailabilityRow[]> {
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
  await Promise.all(packageIds.map(async (id) => { out[id] = await fetchPackageAvailability(id); }));
  return out;
}
