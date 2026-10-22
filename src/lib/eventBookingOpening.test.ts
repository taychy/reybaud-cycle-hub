import { describe, expect, it } from 'vitest';
import { canOpenNativeBooking, globalBookingCapacity, type BookingOpening } from './eventBookingOpening';
const ready: BookingOpening = {controlled:true,enabled:true,ready:true,available:1,capacity:12,blockers:[],deposit:500,installments:8};
describe('Controlled trip opening', () => {
  it('uses one global pool, not four commercial package pools', () => expect(globalBookingCapacity(12,10)).toBe(10));
  it('does not invent a capacity', () => expect(globalBookingCapacity(0,10)).toBe(0));
  it('stays closed without a server response', () => expect(canOpenNativeBooking(null)).toBe(false));
  it('stays closed until explicitly enabled', () => expect(canOpenNativeBooking({...ready,enabled:false})).toBe(false));
  it('stays closed if requirements fail', () => expect(canOpenNativeBooking({...ready,ready:false})).toBe(false));
  it('does not offer another reservation when full', () => expect(canOpenNativeBooking({...ready,available:0})).toBe(false));
  it('uses the native flow only after all server gates pass', () => expect(canOpenNativeBooking(ready)).toBe(true));
});
import { bookingOpeningIsOpen, bookingOpeningLabels, saveEnableFlag } from './eventBookingOpening';
describe('apertura segura abierta/cerrada', () => {
  const base = { controlled: true, ready: true, available: 16, capacity: 20, blockers: [], deposit: 500, installments: 8 };
  it('abierta: guardar preserva enabled=true y etiqueta Reservas abiertas', () => {
    const s = { ...base, enabled: true };
    expect(bookingOpeningIsOpen(s)).toBe(true);
    expect(saveEnableFlag(s)).toBe(true);
    expect(bookingOpeningLabels(s).title).toContain('Reservas abiertas');
  });
  it('cerrada: guardar no abre', () => {
    const s = { ...base, enabled: false };
    expect(saveEnableFlag(s)).toBe(false);
    expect(bookingOpeningLabels(s).title).toContain('Reservas cerradas');
    expect(saveEnableFlag(null)).toBe(false);
  });
});
