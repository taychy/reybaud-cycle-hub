import { describe, it, expect } from 'vitest';
import { personalReschedulingLink, maskLink, identityInputValid, readGuestSession, storeGuestSession, mainGroups, choiceGroup, whatsappText, emailBody } from './reschedulingAccess';
import { commStatus, emailSendable } from './reschedulingComms';
const ev = '67b4e85d-b00b-4b74-9644-99458d948c65', res = '00000000-0000-0000-0000-0000000000aa', tok = 'a'.repeat(64);
const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) } as unknown as Storage; };
const opts = { options: [{ value: 'attend_5_8', label: 'a' }, { value: 'attend_6_9', label: 'b' }, { value: 'attend_5_9', label: 'c' }, { value: 'refund', label: 'd' }, { value: 'credit', label: 'e' }, { value: 'help', label: 'f' }] };
describe('enlace personal San Luis', () => {
  it('apunta a la encuesta exacta de la reserva en el dominio productivo', () => expect(personalReschedulingLink(ev, res, tok)).toBe(`https://reybaud-app.com/reprogramacion/${ev}?reserva=${res}&token=${tok}`));
  it('el enlace mostrado oculta el token', () => expect(maskLink(personalReschedulingLink(ev, res, tok))).not.toContain(tok));
  it('mensajes llevan el enlace personal y el asunto pedido', () => { expect(whatsappText('Ana', 'L')).toContain('Ingresá acá L'); expect(emailBody('Ana', 'L').subject).toBe('Training Camp San Luis · Elegí cómo querés continuar'); });
});
describe('verificación e identidad', () => {
  it('exige DNI, nombre y apellido completos', () => { expect(identityInputValid({ dni: '12.345.678', first: 'José', last: 'Pérez' })).toBe(true); expect(identityInputValid({ dni: '123', first: 'J', last: 'P' })).toBe(false); });
  it('la sesión de invitado vence y se descarta', () => { const s = mem(); storeGuestSession(res, 'rsg_' + 'b'.repeat(64), new Date(1000).toISOString(), s); expect(readGuestSession(res, s, 2000)).toBeNull(); });
  it('no acepta un token de reserva como sesión de invitado', () => { const s = mem(); storeGuestSession(res, tok, new Date(9e12).toISOString(), s); expect(readGuestSession(res, s, 1)).toBeNull(); });
});
describe('elecciones y estados', () => {
  it('tres opciones principales más ayuda; las fechas son subelección', () => { expect(mainGroups(opts).map(g => g.value)).toEqual(['attend', 'refund', 'credit', 'help']); expect(choiceGroup('attend_6_9')).toBe('attend'); });
  it('encuesta completada prevalece sobre el estado de envío', () => expect(commStatus({ completed: true, email_status: null, whatsapp_status: { status: 'enviado', version: 1 } }, 'whatsapp')).toBe('completada'));
  it('no se reenvía email ya enviado, repetido ni suprimido', () => {
    const base = { email_valid: true, suppressed: false, email_duplicate: false, completed: false, email_status: null };
    expect(emailSendable(base)).toBe(true);
    expect(emailSendable({ ...base, email_status: { status: 'enviado' as const, version: 1 } })).toBe(false);
    expect(emailSendable({ ...base, email_duplicate: true })).toBe(false);
    expect(emailSendable({ ...base, suppressed: true })).toBe(false);
  });
});
