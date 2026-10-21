/**
 * Cliente para acciones tokenizadas del flujo /viaje?token=...
 * Reemplaza accesos directos a `event_reservations`,
 * `event_external_participants` y `reservation_checklist_data`,
 * que estaban con policies abiertas a anon y exponían PII.
 *
 * Todas las llamadas pasan por la edge function
 * `get-event-participant-by-token` que valida el token server-side.
 */
import { supabase } from "@/integrations/supabase/client";

export interface TripTokenChecklistRow {
  id: string;
  step_key: string;
  completed: boolean;
  needs_advice: boolean;
  data: any;
  file_url: string | null;
}

export interface TripTokenReservation {
  id: string;
  reservation_status: string;
  payment_status: string;
  amount_total: number | null;
  amount_paid: number;
  balance_due: number | null;
  moneda: string;
  currency_snapshot: string | null;
  external_participant_id: string | null;
  alumno_id: string | null;
  event_id: string;
  access_token: string;
}

export interface TripTokenEvent {
  id: string;
  title: string;
  date: string;
  end_date: string | null;
  location: string | null;
  currency: string;
  metadata: any;
  image_url: string | null;
  duration_days: number | null;
  duration_nights: number | null;
}

export interface TripTokenParticipant {
  id: string;
  nombre: string;
  apellido: string | null;
  email: string;
}

export interface TripTokenPackage {
  id: string | null;
  nombre: string;
  descripcion: string | null;
  personas_por_habitacion: number | null;
  sin_alojamiento: boolean | null;
  incluye_gastronomia?: boolean | null;
}

export interface TripTokenLodging {
  id: string;
  nombre: string;
  tipo: string | null;
  genero: string | null;
  capacidad: number | null;
  roommates: string[];
}

export interface TripTokenGetResponse {
  ok: true;
  reservation: TripTokenReservation;
  event: TripTokenEvent | null;
  participant: TripTokenParticipant | null;
  checklist: TripTokenChecklistRow[];
  package?: TripTokenPackage | null;
  lodging?: TripTokenLodging | null;
  food_history?: { step_key: string; data: any; updated_at: string } | null;
}

export const tripTokenGet = async (token: string) => {
  const { data, error } = await supabase.functions.invoke<TripTokenGetResponse | { error: string }>(
    "get-event-participant-by-token",
    { body: { action: "trip_get", token } },
  );
  if (error) throw error;
  if (!data || (data as any).error) throw new Error((data as any)?.error ?? "trip_get_failed");
  return data as TripTokenGetResponse;
};

export const tripTokenSaveStep = async (params: {
  token: string;
  step_key: string;
  completed: boolean;
  needs_advice: boolean;
  data: Record<string, unknown>;
  file_url: string | null;
}) => {
  const { data, error } = await supabase.functions.invoke<{ ok?: true; id?: string; error?: string }>(
    "get-event-participant-by-token",
    { body: { action: "trip_save_step", ...params } },
  );
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error ?? "trip_save_step_failed");
  return data;
};


export interface TripTokenRoommateRow {
  id: string;
  posicion: number;
  nombre: string | null;
  email: string | null;
  alumno_id: string | null;
  status: string;
  confirmado: boolean;
  reservation_id: string;
}

export interface TripTokenRoommateParticipant {
  reservation_id: string;
  alumno_id: string | null;
  nombre: string;
}

export const tripTokenRoommatesGet = async (token: string) => {
  const { data, error } = await supabase.rpc("trip_roommates_get_by_token" as any, { p_token: token });
  if (error) throw error;
  if (!(data as any)?.ok) throw new Error((data as any)?.error ?? "trip_roommates_get_failed");
  return data as unknown as {
    ok: true;
    capacity: number | null;
    outgoing: TripTokenRoommateRow[];
    incoming: TripTokenRoommateRow[];
    participants: TripTokenRoommateParticipant[];
    individual_package_id?: string | null;
    individual_package_name?: string | null;
    individual_available?: number;
    individual_request_pending?: boolean;
  };
};

export const tripTokenRoommateInvite = async (token: string, target_reservation_id: string) => {
  const { data, error } = await supabase.rpc("trip_roommate_invite_by_token" as any, {
    p_token: token,
    p_target_reservation_id: target_reservation_id,
  });
  if (error) throw error;
  const res = data as any;
  if (!res?.ok) throw new Error(res?.error ?? "trip_roommates_invite_failed");
  if (res.roommate_id) {
    supabase.functions.invoke("send-roommate-notification", {
      body: { kind: "invite", roommate_id: res.roommate_id },
    }).catch(() => {});
  }
  return res;
};

export const tripTokenRoommateRespond = async (
  token: string,
  roommate_id: string,
  roommate_response: "accept" | "reject",
) => {
  const { data, error } = await supabase.rpc("trip_roommate_respond_by_token" as any, {
    p_token: token,
    p_roommate_id: roommate_id,
    p_response: roommate_response,
  });
  if (error) throw error;
  const res = data as any;
  if (!res?.ok) throw new Error(res?.error ?? "trip_roommates_respond_failed");
  if (roommate_response === "accept") {
    supabase.functions.invoke("send-roommate-notification", {
      body: { kind: "accepted", roommate_id },
    }).catch(() => {});
  }
  return res;
};


export const tripTokenRequestIndividual = async (token: string, note?: string) => {
  const { data, error } = await supabase.rpc("trip_request_individual_by_token" as any, {
    p_token: token,
    p_note: note ?? null,
  });
  if (error) throw error;
  const res = data as any;
  if (!res?.ok) throw new Error(res?.error ?? "trip_request_individual_failed");
  if (res.request_id && !res.already_pending) {
    supabase.functions.invoke("notify-package-change-request", {
      body: { request_id: res.request_id },
    }).catch(() => {});
  }
  return res as {
    ok: true;
    request_id: string;
    available?: number;
    waitlist?: boolean;
    already_pending?: boolean;
  };
};


export const tripTokenRoommateAssignmentStatus = async (token: string) => {
  const { data, error } = await supabase.rpc("trip_roommate_assignment_status_by_token" as any, { p_token: token });
  if (error) throw error;
  return data as any;
};

export const tripTokenRequestRoommateAssignment = async (token: string) => {
  const { data, error } = await supabase.rpc("trip_request_roommate_assignment_by_token" as any, { p_token: token });
  if (error) throw error;
  const res = data as any;
  if (!res?.ok) throw new Error(res?.error ?? "trip_request_roommate_assignment_failed");
  return res;
};
