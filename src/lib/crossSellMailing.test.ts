import { describe, it, expect } from 'vitest';
import { splitCohorts, buildInviteEmail, buildCompleteEmail, toPlainText, PREVIEW_LINK, PREVIEW_NAME, type MailingAudienceRow } from './crossSellMailing';
import { depositAction, isClicPayUrl } from './crossSellQuickBooking';

const row = (p: Partial<MailingAudienceRow>): MailingAudienceRow => ({ source_reservation_id: crypto.randomUUID(), nombre: 'X', email: 'x@a.com', cohort: 'A', reason: '', roommate: null, ...p });

describe('cohortes del mailing', () => {
  it('separa invitación, completar y excluidos', () => {
    const s = splitCohorts([row({ email: 'a@a.com' }), row({ email: 'b@a.com', cohort: 'B' }), row({ email: 'c@a.com', cohort: 'excluido', reason: 'Ya tiene reserva de Maratona' })]);
    expect([s.A.length, s.B.length, s.excluded.length]).toEqual([1, 1, 1]);
  });
  it('un solo correo por persona aunque aparezca dos veces', () => {
    const s = splitCohorts([row({ email: 'A@a.com' }), row({ email: 'a@a.com', cohort: 'B' })]);
    expect(s.A.length + s.B.length).toBe(1);
    expect(s.excluded[0].reason).toMatch(/duplicado/);
  });
  it('correo vacío nunca entra', () => {
    expect(splitCohorts([row({ email: '' })]).A.length).toBe(0);
  });
});

describe('plantillas', () => {
  const a = toPlainText(buildInviteEmail(PREVIEW_NAME, PREVIEW_LINK));
  const b = toPlainText(buildCompleteEmail(PREVIEW_NAME, PREVIEW_LINK));
  it('precios, seña y cuotas', () => {
    for (const t of [a, b]) { expect(t).toContain('€3.000'); expect(t).toContain('€2.800'); expect(t).toContain('€500'); expect(t).toContain('8 cuotas'); expect(t).toContain('28 al 30 de junio'); expect(t).toContain('20 plazas'); expect(t).toContain('Scarlett y Claudio — Ciclismo Reybaud'); }
  });
  it('la vista previa no lleva token', () => {
    expect(a).not.toMatch(/[a-f0-9]{64}/); expect(b).not.toMatch(/[a-f0-9]{64}/);
  });
  it('B reconoce la solicitud y no invita de nuevo', () => {
    expect(b).toContain('Gracias por tu solicitud'); expect(b).not.toContain('queremos invitarte');
  });
  it('sin emojis', () => {
    expect(/\p{Extended_Pictographic}/u.test(a + b)).toBe(false);
  });
});

describe('pago de la seña tras reservar', () => {
  it('solo acepta el host de ClicPay por https', () => {
    expect(isClicPayUrl('https://link.clicpay.it/YkhWQzYwTzlMQQ==')).toBe(true);
    expect(isClicPayUrl('http://link.clicpay.it/x')).toBe(false);
    expect(isClicPayUrl('https://evil.com/link.clicpay.it')).toBe(false);
  });
  it('ofrece pagar mientras no haya pagos acreditados', () => {
    expect(depositAction({ status: 'solicitud_enviada', payment_status: 'no_informado', package: 'x', price: 3000, paid: 0, currency: 'EUR', reference: 'AB' })).toBe('pay');
    expect(depositAction({ status: 'reserva_confirmada', payment_status: 'parcial', package: 'x', price: 3000, paid: 500, currency: 'EUR', reference: 'AB' })).toBe('paid');
    expect(depositAction({ status: 'solicitud_enviada', payment_status: 'pago_informado', package: 'x', price: 3000, paid: 0, currency: 'EUR', reference: 'AB' })).toBe('informed');
  });
});
