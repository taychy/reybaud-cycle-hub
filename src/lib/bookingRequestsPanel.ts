// Solicitudes de reserva sin pago (event_waitlist_entries, origen 'solicitud_reserva_sin_pago').
// Reglas de presentación para el panel admin de reservas: NO son reservas formales,
// no ocupan cupo confirmado y nunca deben inflar contadores de reservas/pagos.

export interface BookingRequestRow {
  id: string;
  nombre: string;
  email: string;
  created_at: string;
  estado: string;
  origen: string | null;
  converted_reservation_id: string | null;
  respuestas?: Record<string, any> | null;
}

export const BOOKING_REQUEST_ORIGEN = 'solicitud_reserva_sin_pago';

export const isBookingRequest = (e: Pick<BookingRequestRow, 'origen'>): boolean =>
  e.origen === BOOKING_REQUEST_ORIGEN;

/** Pendiente de formalizar: solicitud sin pago, no convertida y no descartada. */
export const isPendingBookingRequest = (
  e: Pick<BookingRequestRow, 'origen' | 'estado' | 'converted_reservation_id'>,
): boolean =>
  isBookingRequest(e) &&
  !e.converted_reservation_id &&
  e.estado !== 'convertido' &&
  e.estado !== 'descartado';

export const pendingBookingRequests = <T extends BookingRequestRow>(entries: T[]): T[] =>
  entries.filter(isPendingBookingRequest);

/** Emails (normalizados) de personas que ya tienen reserva formal en el evento. */
export const formalReservationEmails = (
  reservations: Array<{ alumno?: { email?: string | null } | null; external_participant?: { email?: string | null } | null }>,
): Set<string> => {
  const set = new Set<string>();
  for (const r of reservations) {
    const email = r.alumno?.email || r.external_participant?.email;
    if (email) set.add(email.trim().toLowerCase());
  }
  return set;
};

/** La solicitud coincide por email con una reserva formal ya creada: no mostrarla como pendiente duplicada. */
export const requestMatchesFormalReservation = (
  e: Pick<BookingRequestRow, 'email'>,
  formalEmails: Set<string>,
): boolean => formalEmails.has(e.email.trim().toLowerCase());

/** Posible prueba interna: correo del dominio de la organización. No borrar, solo etiquetar. */
export const isInternalTestRequest = (e: Pick<BookingRequestRow, 'email'>): boolean =>
  /reybaud/i.test(e.email);

/** Tarifa pedida, tal como quedó en las respuestas del formulario. */
export const requestTariffLabel = (e: Pick<BookingRequestRow, 'respuestas'>): string => {
  const r = e.respuestas || {};
  const name = typeof r.package_name === 'string' ? r.package_name : '';
  const price = typeof r.price_eur === 'number' ? `€${r.price_eur}` : (r.price_eur ? `€${r.price_eur}` : '');
  const bike = r.bike_included === true ? 'Bicicleta incluida' : r.bike_included === false ? 'Bicicleta propia' : '';
  return [name, price, bike].filter(Boolean).join(' · ') || 'Sin tarifa registrada';
};
