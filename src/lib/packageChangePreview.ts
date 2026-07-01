import { supabase } from "@/integrations/supabase/client";

export type PackageChangeStatus = "auto_applicable" | "requiere_aprobacion" | "no_posible";

export interface PackageChangePreview {
  status: PackageChangeStatus;
  clasificacion?: string;
  package_actual?: {
    id: string;
    nombre: string;
    precio_pagado_reserva: number;
    personas_por_habitacion: number;
  };
  package_nuevo?: {
    id: string;
    nombre: string;
    precio_aplicable: number;
    currency: string;
    etapa_vigente?: string | null;
    cupos_disponibles: number;
    personas_por_habitacion: number;
  };
  politica_precio_aplicada?: string;
  amount_paid?: number;
  difference?: number;
  credit_to_create?: number;
  debit_to_create?: number;
  room_impact?: {
    status: PackageChangeStatus;
    habitacion_origen?: { tipo?: string; personas?: number; companeros_asignados?: number };
    habitacion_destino?: { tipo?: string; personas?: number };
    roommate_propuesto_valido?: boolean | null;
    razones?: string[];
  };
  warnings?: string[];
  blockers?: string[];
  revalidation_token?: string;
  days_to_event?: number;
}

export async function previewPackageChange(
  reservationId: string,
  packageNuevoId: string,
  roommatePropuestoId?: string | null,
): Promise<PackageChangePreview> {
  const { data, error } = await supabase.rpc("preview_package_change" as any, {
    p_reservation_id: reservationId,
    p_package_nuevo_id: packageNuevoId,
    p_roommate_propuesto_id: roommatePropuestoId ?? null,
  });
  if (error) throw error;
  return data as PackageChangePreview;
}

export interface ApplyPackageChangeArgs {
  reservationId: string;
  packageNuevoId: string;
  revalidationToken: string;
  requestId?: string | null;
  overridePlazaLibre?: boolean;
  adminNote?: string | null;
}

export async function applyPackageChange(args: ApplyPackageChangeArgs) {
  const { data, error } = await supabase.rpc("apply_package_change" as any, {
    p_reservation_id: args.reservationId,
    p_package_nuevo_id: args.packageNuevoId,
    p_revalidation_token: args.revalidationToken,
    p_request_id: args.requestId ?? null,
    p_override_plaza_libre: !!args.overridePlazaLibre,
    p_admin_note: args.adminNote ?? null,
  });
  if (error) throw error;
  return data as { ok: boolean; adjustment_id?: string; credit_created?: number; debit_created?: number };
}

export function statusColor(s: PackageChangeStatus): string {
  switch (s) {
    case "auto_applicable": return "text-emerald-400 border-emerald-500/40";
    case "requiere_aprobacion": return "text-amber-400 border-amber-500/40";
    case "no_posible": return "text-destructive border-destructive/40";
  }
}

export function statusLabel(s: PackageChangeStatus): string {
  switch (s) {
    case "auto_applicable": return "Aplicable directo";
    case "requiere_aprobacion": return "Requiere aprobación";
    case "no_posible": return "No posible";
  }
}
