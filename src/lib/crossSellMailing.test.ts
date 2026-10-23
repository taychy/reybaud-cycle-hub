import { describe, it, expect } from 'vitest';
import { splitCohorts, buildInviteEmail, buildCompleteEmail, toPlainText, PUBLIC_INCLUDES_LINK, PREVIEW_LINK, PREVIEW_NAME, type MailingAudienceRow } from './crossSellMailing';
import { depositAction, depositPending, isClicPayUrl } from './crossSellQuickBooking';

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
    expect(depositAction({ status: 'solicitud_enviada', payment_status: 'parcial', package: 'x', price: 3000, paid: 100, currency: 'EUR', reference: 'AB' })).toBe('partial');
    expect(depositPending({ status: 'solicitud_enviada', package: 'x', paid: 100 })).toBe(400);
    expect(depositPending({ status: 'solicitud_enviada', package: 'x', paid: 600 })).toBe(0);
    expect(depositAction({ status: 'solicitud_enviada', package: 'x', paid: 499.99 })).toBe('partial');
  });
});

describe('plantillas', () => {
  const a = toPlainText(buildInviteEmail(PREVIEW_NAME, PREVIEW_LINK));
  const b = toPlainText(buildCompleteEmail(PREVIEW_NAME, PREVIEW_LINK));
  it('precios, seña y cuotas', () => {
    for (const t of [a, b]) { expect(t).toContain('€3.000'); expect(t).toContain('€2.800'); expect(t).toContain('€500'); expect(t).toContain('8 cuotas'); expect(t).toContain('28 al 30 de junio'); expect(t).toContain('20 como máximo'); expect(t).toContain('Scarlett y Claudio — Ciclismo Reybaud'); }
  });
  it('la vista previa no lleva token', () => {
    expect(a).not.toMatch(/[a-f0-9]{64}/); expect(b).not.toMatch(/[a-f0-9]{64}/);
  });
  it('B reconoce la solicitud y no invita de nuevo', () => {
    expect(b).toMatch(/Ya recibimos tu solicitud de Maratona/); expect(b).not.toContain('queremos invitarte');
  });
  it('sin emojis', () => {
    expect(/\p{Extended_Pictographic}/u.test(a + b)).toBe(false);
    expect(depositAction({ status: 'solicitud_enviada', payment_status: 'parcial', package: 'x', price: 3000, paid: 100, currency: 'EUR', reference: 'AB' })).toBe('partial');
    expect(depositPending({ status: 'solicitud_enviada', package: 'x', paid: 100 })).toBe(400);
    expect(depositPending({ status: 'solicitud_enviada', package: 'x', paid: 600 })).toBe(0);
    expect(depositAction({ status: 'solicitud_enviada', package: 'x', paid: 499.99 })).toBe('partial');
  });
});

describe('orden, tono y enlaces', () => {
  for (const [n, c, personal] of [['A', buildInviteEmail('Ana', PREVIEW_LINK), 'Acceder a mi reserva personalizada'], ['B', buildCompleteEmail('Ana', PREVIEW_LINK), 'Completar mi reserva']] as const) {
    it(`${n}: dos botones en orden y enlace público sin token`, () => {
      const t = toPlainText(c);
      const ctas = c.blocks.filter(b => b.kind === 'cta');
      expect(ctas.map(b => b.kind === 'cta' && b.label)).toEqual(['Ver todo lo que incluye', personal]);
      expect(ctas[0].kind === 'cta' && ctas[0].href).toBe(PUBLIC_INCLUDES_LINK);
      expect(PUBLIC_INCLUDES_LINK).not.toMatch(/acceso=/);
      expect(ctas[1].kind === 'cta' && ctas[1].href).toBe(PREVIEW_LINK);
      const i = (s: string) => t.indexOf(s);
      expect(i('30 de junio')).toBeLessThan(i('desayunos, almuerzos y cenas'));
      expect(i('desayunos')).toBeLessThan(i('Y hay mucho más'));
      expect(i('Ver todo lo que incluye')).toBeLessThan(i('€3.000'));
      expect(i('€3.000')).toBeLessThan(i('mismo compañero'));
      expect(i('mismo compañero')).toBeLessThan(i(personal));
      expect(t.startsWith('Hola Ana, cómo estás?')).toBe(true);
      expect(t).not.toMatch(/[¡¿]/);
      expect(t).toContain('solo en el paquete con alquiler');
      expect(t).toContain('aeropuerto de Venecia');
    });
  }
  it('B no es una nueva invitación', () => {
    expect(toPlainText(buildCompleteEmail('Ana', PREVIEW_LINK))).not.toMatch(/Te escribimos porque/);
  });
  it('excluye a los 4 con reserva Maratona y bajas aunque estén en Alpes', () => {
    const s = splitCohorts([
      ...[1, 2, 3, 4].map(k => row({ email: `m${k}@a.com`, cohort: 'excluido', reason: 'Ya tiene reserva de Maratona' })),
      row({ email: 'baja@a.com', cohort: 'excluido', reason: 'Baja de mailing' }), row({ email: 'ok@a.com' }),
    ]);
    expect(s.A.map(r => r.email)).toEqual(['ok@a.com']); expect(s.B.length).toBe(0); expect(s.excluded.length).toBe(5);
  });
});

describe('pago de la seña tras reservar'
, () => {
  it('solo acepta el host de ClicPay por https', () => {
    expect(isClicPayUrl('https://link.clicpay.it/YkhWQzYwTzlMQQ==')).toBe(true);
    expect(isClicPayUrl('http://link.clicpay.it/x')).toBe(false);
    expect(isClicPayUrl('https://evil.com/link.clicpay.it')).toBe(false);
  });
  it('ofrece pagar mientras no haya pagos acreditados', () => {
    expect(depositAction({ status: 'solicitud_enviada', payment_status: 'no_informado', package: 'x', price: 3000, paid: 0, currency: 'EUR', reference: 'AB' })).toBe('pay');
    expect(depositAction({ status: 'reserva_confirmada', payment_status: 'parcial', package: 'x', price: 3000, paid: 500, currency: 'EUR', reference: 'AB' })).toBe('paid');
    expect(depositAction({ status: 'solicitud_enviada', payment_status: 'pago_informado', package: 'x', price: 3000, paid: 0, currency: 'EUR', reference: 'AB' })).toBe('informed');
    expect(depositAction({ status: 'solicitud_enviada', payment_status: 'parcial', package: 'x', price: 3000, paid: 100, currency: 'EUR', reference: 'AB' })).toBe('partial');
    expect(depositPending({ status: 'solicitud_enviada', package: 'x', paid: 100 })).toBe(400);
    expect(depositPending({ status: 'solicitud_enviada', package: 'x', paid: 600 })).toBe(0);
    expect(depositAction({ status: 'solicitud_enviada', package: 'x', paid: 499.99 })).toBe('partial');
  });
});
