import { describe, expect, it } from 'vitest';
import { refundTiming } from './reschedulingPolicy';
const policy = 'Plazo de reintegro: de 5 a 7 días. Primero revisaremos tu solicitud.';
describe('campaign refund timeframe', () => {
  it('San Luis refund exposes exactly 5 to 7 days without calendar or start assumptions', () => {
    expect(refundTiming('refund', policy)).toBe('Plazo de reintegro: de 5 a 7 días.');
  });
  it('credit never receives the monetary refund timeframe', () => {
    expect(refundTiming('credit', policy)).toBeNull();
  });
  it('does not invent a timeframe for other campaigns', () => {
    expect(refundTiming('refund', 'Revisión administrativa.')).toBeNull();
  });
});