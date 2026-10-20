import { describe, it, expect } from 'vitest';
import { seatActions, nightsOverlap, nightsOf, sellableTotal } from './reschedulingSeats';
const w58 = { start: '2026-11-05', end: '2026-11-08' }, w69 = { start: '2026-11-06', end: '2026-11-09' }, w59 = { start: '2026-11-05', end: '2026-11-09' };
const pkg = { package_id: 'p', name: 'x', active: 15, confirmed: 0, released: 1, offered: 2, occupied: 0, sellable: 2 };
describe('reprogramación · inventario cerrado', () => {
  it('una solicitud sin validar no permite liberar', () => expect(seatActions(null, { choice: 'refund', review_status: 'pendiente' }, true)).toEqual([]));
  it('fechas, ayuda o asistencia nunca liberan', () => expect(seatActions(null, { choice: 'attend_5_9', review_status: 'validada' }, true)).toEqual([]));
  it('confirmar renuncia no ofrece cupo; requiere aprobación explícita', () => expect(seatActions('renuncia_confirmada', null, true)).toEqual(['approve_release', 'revoke']));
  it('sin reventa habilitada no se ofrece ni ocupa', () => { expect(seatActions('liberada', null, false)).toEqual(['revoke']); expect(seatActions('ofrecida', null, false)).toEqual(['revoke']); });
  it('una plaza ocupada no admite segunda venta ni anulación', () => expect(seatActions('ocupada', null, true)).toEqual([]));
  it('5–8 y 6–9 se solapan las noches del 6 y 7', () => { expect(nightsOverlap(w58, w69)).toBe(true); expect(nightsOf(w58).filter(n => nightsOf(w69).includes(n))).toEqual(['2026-11-06', '2026-11-07']); });
  it('5–9 abarca cuatro noches y se solapa con ambas', () => { expect(nightsOf(w59)).toHaveLength(4); expect(nightsOverlap(w59, w58) && nightsOverlap(w59, w69)).toBe(true); });
  it('la disponibilidad vendible empieza en cero con reventa cerrada', () => expect(sellableTotal({ resale_enabled: false, packages: [pkg] })).toBe(0));
  it('solo cuentan cupos ofrecidos, no liberados', () => expect(sellableTotal({ resale_enabled: true, packages: [pkg] })).toBe(2));
});
