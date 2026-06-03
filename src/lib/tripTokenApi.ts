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

export interface TripTokenGetResponse {
  ok: true;
  reservation: TripTokenReservation;
  event: TripTokenEvent | null;
  participant: TripTokenParticipant | null;
  checklist: TripTokenChecklistRow[];
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
