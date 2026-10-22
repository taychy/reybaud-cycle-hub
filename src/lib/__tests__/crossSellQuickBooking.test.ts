import { describe, it, expect } from 'vitest';
import { canSubmitQuickBooking, combinedSubtotal, readCrossSellToken, roomChoiceRequired, type CrossSellContext } from '../crossSellQuickBooking';

const pk = { id: 'p1', nombre: 'Maratona Alpes bici', precio: 3000, currency: 'EUR', combined_total: 6890 };
const base: CrossSellContext = { eligible: true, booking_enabled: true, existing: null, packages: [pk, { ...pk, id: 'p2', precio: 2800 }], source: { status: 'solicitud_enviada', package: 'Doble', price: 3890, currency: 'EUR', room: 'doble' }, roommate_known: true };

describe('reserva rápida Alpes → Maratona', () => {
  it('doble con compañero conocido no pide habitación', () => {
    expect(roomChoiceRequired(base)).toBe(false);
    expect(canSubmitQuickBooking(base, 'p1', true, null, '')).toBe(true);
  });
  it('individual debe elegir compañía o asignación', () => {
    const ind = { ...base, roommate_known: false, source: { ...base.source!, room: 'individual' as const, price: 4490 } };
    expect(canSubmitQuickBooking(ind, 'p1', true, null, '')).toBe(false);
    expect(canSubmitQuickBooking(ind, 'p1', true, 'companero', 'Jo')).toBe(false);
    expect(canSubmitQuickBooking(ind, 'p1', true, 'asignacion', '')).toBe(true);
  });
  it('subtotal combinado real: doble 3890 + 3000 = 6890; individual 4490 + 2800 = 7290', () => {
    expect(combinedSubtotal(base, pk)).toBe(6890);
    expect(combinedSubtotal({ ...base, source: { ...base.source!, price: 4490 } }, { ...pk, precio: 2800 })).toBe(7290);
  });
  it('no permite reservar con apertura cerrada, sin condiciones o con reserva existente', () => {
    expect(canSubmitQuickBooking({ ...base, booking_enabled: false }, 'p1', true, null, '')).toBe(false);
    expect(canSubmitQuickBooking(base, 'p1', false, null, '')).toBe(false);
    expect(canSubmitQuickBooking({ ...base, existing: { status: 'solicitud_enviada', package: null } }, 'p1', true, null, '')).toBe(false);
    expect(canSubmitQuickBooking(base, 'otro', true, null, '')).toBe(false);
  });
  it('solo acepta tokens hex de 64 caracteres', () => {
    expect(readCrossSellToken('?acceso=' + 'a'.repeat(64))).toBe('a'.repeat(64));
    expect(readCrossSellToken('?acceso=abc')).toBeNull();
  });
});
