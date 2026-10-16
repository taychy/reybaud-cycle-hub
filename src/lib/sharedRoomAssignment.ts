/**
 * Habitación doble compartida (asignación de acompañante por Reybaud).
 * Se activa por viaje con `events.metadata.shared_room_assignment`; la
 * diferencia se cotiza en servidor (`shared_room_assignment_quote`) con los
 * precios vigentes del sistema. Nunca se inventa un importe: si falta, bloquea.
 */
import { supabase } from "@/integrations/supabase/client";

export const SHARED_ROOM_CONSENT_TEXT =
  "Habitación doble compartida: Si viajás sin acompañante, Reybaud intentará asignarte uno hasta el 22/04/2027. Si no conseguimos completar la habitación, aceptás abonar la diferencia correspondiente a una habitación individual, según el importe informado al reservar. La asignación y cualquier cambio de habitación serán confirmados por Reybaud.";

export type SharedRoomQuote =
  | { applies: false }
  | { applies: true; blocked: true; reason: string }
  | {
      applies: true;
      blocked: false;
      deadline: string;
      version: string;
      double_price: number;
      single_price: number;
      difference: number;
      currency: string;
      single_package_id: string;
    };

export type RoomingEstado = "pendiente_asignacion" | "acompanante_propuesto" | "completa" | "revision_conversion";

export const ROOMING_ESTADO_LABEL: Record<RoomingEstado, string> = {
  pendiente_asignacion: "Pendiente de asignación",
  acompanante_propuesto: "Acompañante propuesto",
  completa: "Habitación completa",
  revision_conversion: "Revisión conversión a individual",
};

export type ReadyQuote = Extract<SharedRoomQuote, { blocked: false }>;
export const isQuoteReady = (q: SharedRoomQuote | null | undefined): q is ReadyQuote =>
  !!q && q.applies === true && (q as any).blocked === false;

export function normalizeQuote(raw: any): SharedRoomQuote {
  if (!raw || raw.applies !== true) return { applies: false };
  if (raw.blocked) return { applies: true, blocked: true, reason: String(raw.reason || "Importe no definido") };
  const difference = Number(raw.difference);
  const single = Number(raw.single_price);
  const dbl = Number(raw.double_price);
  if (!Number.isFinite(difference) || difference <= 0 || !Number.isFinite(single) || !raw.currency || !raw.deadline) {
    return { applies: true, blocked: true, reason: "Importe no definido" };
  }
  return {
    applies: true, blocked: false, deadline: String(raw.deadline), version: String(raw.version || "1"),
    double_price: dbl, single_price: single, difference, currency: String(raw.currency),
    single_package_id: String(raw.single_package_id || ""),
  };
}

export async function fetchSharedRoomQuote(eventId: string, packageId: string): Promise<SharedRoomQuote> {
  const { data, error } = await supabase.rpc("shared_room_assignment_quote" as any, {
    p_event_id: eventId, p_package_id: packageId,
  });
  if (error) return { applies: true, blocked: true, reason: "No se pudo obtener el importe" };
  return normalizeQuote(data);
}

/** Consentimiento versionado que se guarda en la reserva (el servidor lo revalida). */
export function buildSharedRoomConsent(q: Extract<SharedRoomQuote, { blocked: false }>, canal: string) {
  return {
    acepta: true,
    texto: SHARED_ROOM_CONSENT_TEXT,
    version: q.version,
    deadline: q.deadline,
    difference: q.difference,
    single_price: q.single_price,
    double_price: q.double_price,
    currency: q.currency,
    aceptado_at: new Date().toISOString(),
    canal,
  };
}

/** ¿Pasó la fecha límite y la reserva sigue sin habitación completa? */
export function isOverdueAssignment(estado: string | null | undefined, deadline: string | null | undefined, today = new Date()): boolean {
  if (!deadline || !estado) return false;
  if (estado !== "pendiente_asignacion" && estado !== "acompanante_propuesto") return false;
  const [y, m, d] = deadline.split("-").map(Number);
  const t = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
  return t >= y * 10000 + m * 100 + d;
}
