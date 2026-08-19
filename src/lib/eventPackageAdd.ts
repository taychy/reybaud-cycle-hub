/**
 * Reglas de alta manual (admin) de participantes en eventos con paquetes.
 * La fuente de verdad del precio es el backend (`admin_create_event_reservation`
 * → `get_package_active_price`); estos helpers son sólo para la UI.
 */
import { resolveActivePrice, type PriceStage } from "./priceStages";
import { formatPrice } from "./currency";

export interface AddablePackage {
  id: string;
  nombre: string;
  precio: number;
  currency: string;
  activo: boolean;
  sort_order: number | null;
}

/** Paquetes ofrecibles para una nueva alta: sólo activos, ordenados. */
export function addablePackages(packages: AddablePackage[]): AddablePackage[] {
  return packages
    .filter((p) => p.activo)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
}

/** El paquete es obligatorio si el evento tiene paquetes comerciales activos. */
export function requiresPackage(packages: AddablePackage[], eventNature?: string): boolean {
  if (eventNature === "propio_solo_inscripcion") return false;
  return addablePackages(packages).length > 0;
}

/** Etiqueta corta: "Hab. doble con Pensión Completa · Etapa 2 · $944.900". */
export function packageOptionLabel(
  pkg: AddablePackage,
  stages: PriceStage[] | undefined,
  now: Date = new Date(),
): string {
  const active = resolveActivePrice(pkg.precio, pkg.currency, stages, now);
  return [
    pkg.nombre,
    active.activeStage ? active.activeStage.nombre : "Precio base",
    formatPrice(active.precio, active.currency),
  ].join(" · ");
}

/** ¿Se puede habilitar el botón "Agregar"? */
export function canSubmitAdd(opts: {
  packages: AddablePackage[];
  eventNature?: string;
  selectedPackageId: string | null;
}): boolean {
  if (!requiresPackage(opts.packages, opts.eventNature)) return true;
  return !!opts.selectedPackageId;
}
