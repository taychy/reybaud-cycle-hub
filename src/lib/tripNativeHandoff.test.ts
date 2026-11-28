import { describe, it, expect } from 'vitest';
import { nativeParticipantEmails, nativePreflightSchema } from './tripNativeHandoff';

describe('Preparación nativa administrativa', () => {
  it('identifica a cada persona del grupo sin sobrecontar', () => {
    expect(nativeParticipantEmails([' Ana@example.invalid ', 'LUIS@example.invalid'], 2)).toEqual(['ana@example.invalid', 'luis@example.invalid']);
    expect(() => nativeParticipantEmails(['ana@example.invalid'], 2)).toThrow();
  });
  it('rechaza dos participantes con el mismo contacto', () => {
    expect(() => nativeParticipantEmails(['ANA@example.invalid', 'ana@example.invalid'], 2)).toThrow(/distinto/);
  });
  it('no confunde preparación con habilitación de cobro', () => {
    const data = { ok: true, can_prepare: true, converted: false, reservation_count: 0, blockers: [], payment_enabled: false };
    expect(nativePreflightSchema.parse(data).payment_enabled).toBe(false);
    expect(() => nativePreflightSchema.parse({ ...data, payment_enabled: true })).toThrow();
  });
});