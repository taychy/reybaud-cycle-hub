import { describe, it, expect } from 'vitest';
import { summarizeCrossSell, globalBookingCapacity, type CrossSellRow } from '@/lib/eventBookingOpening';
const row = (o: Partial<CrossSellRow>): CrossSellRow => ({ source_reservation_id: Math.random().toString(), nombre: 'X', email: 'x@a.com', source_status: 'reserva_confirmada', already_requested: false, already_reserved: false, marketing_opt_out: false, alps_rate_eligible: true, roommate: null, invite: true, ...o });
describe('segmentación Maratona', () => {
  it('no invita a quien ya solicitó Maratona', () => {
    expect(summarizeCrossSell([row({ already_requested: true, invite: true, email: 'a@a.com' })]).inviteEmails).toEqual([]);
  });
  it('no invita a quien se dio de baja', () => {
    expect(summarizeCrossSell([row({ marketing_opt_out: true })]).invite).toBe(0);
  });
  it('sin seña Alpes se invita pero no cuenta como tarifa habilitable', () => {
    const s = summarizeCrossSell([row({ alps_rate_eligible: false, source_status: 'solicitud_enviada' })]);
    expect([s.invite, s.inviteEligibleNow]).toEqual([1, 0]);
  });
  it('pool global usa el menor cupo: hotel 20 y carrera 10 dan 10', () => {
    expect(globalBookingCapacity(20, 10)).toBe(10);
  });
});
