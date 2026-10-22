import { describe, it, expect } from 'vitest';
import {
  isPendingBookingRequest,
  pendingBookingRequests,
  formalReservationEmails,
  requestMatchesFormalReservation,
  isInternalTestRequest,
  requestTariffLabel,
  type BookingRequestRow,
} from './bookingRequestsPanel';

const row = (over: Partial<BookingRequestRow>): BookingRequestRow => ({
  id: over.id || 'x',
  nombre: over.nombre || 'Persona',
  email: over.email || 'persona@example.com',
  created_at: over.created_at || '2026-10-20T00:00:00Z',
  estado: over.estado ?? 'nuevo',
  origen: over.origen ?? 'solicitud_reserva_sin_pago',
  converted_reservation_id: over.converted_reservation_id ?? null,
  respuestas: over.respuestas ?? null,
});

describe('booking requests panel', () => {
  it('una solicitud nueva sin pago cuenta como pendiente, no como reserva confirmada', () => {
    expect(isPendingBookingRequest(row({}))).toBe(true);
    expect(isPendingBookingRequest(row({ estado: 'contactado' }))).toBe(true);
  });

  it('excluye convertidas (con reserva formal vinculada) y descartadas', () => {
    expect(isPendingBookingRequest(row({ converted_reservation_id: 'res-1' }))).toBe(false);
    expect(isPendingBookingRequest(row({ estado: 'convertido' }))).toBe(false);
    expect(isPendingBookingRequest(row({ estado: 'descartado' }))).toBe(false);
  });

  it('excluye entradas de lista de espera que no son solicitudes de reserva', () => {
    expect(isPendingBookingRequest(row({ origen: 'lista_espera' }))).toBe(false);
    expect(isPendingBookingRequest(row({ origen: null }))).toBe(false);
  });

  it('cuenta solo las 7 pendientes reales entre entradas mixtas', () => {
    const entries = [
      ...Array.from({ length: 7 }, (_, i) => row({ id: `p${i}` })),
      row({ id: 'conv', converted_reservation_id: 'res-9' }),
      row({ id: 'desc', estado: 'descartado' }),
      row({ id: 'wl', origen: 'formulario' }),
    ];
    expect(pendingBookingRequests(entries)).toHaveLength(7);
  });

  it('detecta coincidencia por email con una reserva formal (sin duplicar pendiente)', () => {
    const emails = formalReservationEmails([
      { alumno: { email: 'Diego@Example.com ' } },
      { external_participant: { email: 'otra@example.com' } },
      { alumno: null, external_participant: null },
    ]);
    expect(requestMatchesFormalReservation(row({ email: 'diego@example.com' }), emails)).toBe(true);
    expect(requestMatchesFormalReservation(row({ email: 'nadie@example.com' }), emails)).toBe(false);
  });

  it('etiqueta posibles pruebas internas sin borrarlas', () => {
    expect(isInternalTestRequest(row({ email: 'cobrosreybaud@gmail.com' }))).toBe(true);
    expect(isInternalTestRequest(row({ email: 'cliente@gmail.com' }))).toBe(false);
  });

  it('resume la tarifa pedida desde las respuestas', () => {
    expect(requestTariffLabel(row({ respuestas: { package_name: 'Maratona · tarifa Alpes', price_eur: 3000, bike_included: true } })))
      .toBe('Maratona · tarifa Alpes · €3000 · Bicicleta incluida');
    expect(requestTariffLabel(row({ respuestas: null }))).toBe('Sin tarifa registrada');
  });
});
