import { describe, expect, it } from 'vitest';
import { emailSendBlockers, emailSendable, nextEmailBatch, type CommRow } from './reschedulingComms';

const row = (i: number, o: Partial<CommRow> = {}): CommRow => ({
  reservation_id: `r${i}`, participant: `P ${i}`, first_name: 'P', package: null, email: `p${i}@x.com`, phone: '5491100000000', token: 't',
  email_valid: true, phone_valid: true, email_duplicate: false, phone_duplicate: false, suppressed: false, completed: false,
  email_status: null, whatsapp_status: null, ...o,
});
const ready = { public_enabled: true, eligible: 32, tests: 1, authorization: { id: 'a', audience_count: 32, template_version: 'v1', created_at: '' } };

describe('email operativo de reprogramación', () => {
  it('bloquea con la encuesta cerrada', () => {
    expect(emailSendBlockers({ ...ready, public_enabled: false })).toContain('La encuesta pública está desactivada');
  });
  it('bloquea sin prueba aceptada', () => {
    expect(emailSendBlockers({ ...ready, tests: 0 })).toContain('Falta un correo de prueba aceptado');
  });
  it('bloquea sin autorización de audiencia', () => {
    expect(emailSendBlockers({ ...ready, authorization: null })).toContain('Falta la autorización expresa de la audiencia');
  });
  it('permite enviar solo con todas las compuertas', () => {
    expect(emailSendBlockers(ready)).toEqual([]);
  });
  it('nunca incluye enviados, en curso, completados, repetidos ni suprimidos', () => {
    const rows = [row(1), row(2, { email_status: { status: 'enviado', version: 2 } }), row(3, { email_status: { status: 'enviando', version: 1 } }),
      row(4, { completed: true }), row(5, { email_duplicate: true }), row(6, { suppressed: true }), row(7, { email_valid: false }),
      row(8, { email_status: { status: 'fallido', version: 2 } })];
    expect(nextEmailBatch(rows)).toEqual(['r1', 'r8']);
    expect(emailSendable(rows[1])).toBe(false);
  });
  it('lotes de máximo 10 aunque haya 32 elegibles', () => {
    const rows = Array.from({ length: 32 }, (_, i) => row(i));
    expect(nextEmailBatch(rows)).toHaveLength(10);
    expect(nextEmailBatch(rows, 50)).toHaveLength(10);
  });
});
