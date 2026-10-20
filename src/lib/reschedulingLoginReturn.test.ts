import { describe, expect, it } from 'vitest';
import { reschedulingLoginReturn } from './reschedulingLoginReturn';
describe('participant login return', () => {
 it('returns to the generic public survey regardless of portal role', () => expect(reschedulingLoginReturn('/reprogramacion/event-1')).toBe('/reprogramacion/event-1'));
 it('never reuses a previous personal query', () => expect(reschedulingLoginReturn('/reprogramacion/event-1?reserva=old&token=old')).toBeNull());
 it('does not change other portal destinations', () => { expect(reschedulingLoginReturn('/admin')).toBeNull(); expect(reschedulingLoginReturn('//example.com')).toBeNull(); });
});