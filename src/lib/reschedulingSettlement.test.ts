import { describe, it, expect } from 'vitest';
import { canValidateSettlement, proposalJerseyAmount, settlementState, type SettlementPreview } from './reschedulingSettlement';
const preview = { source_hash: 'fresh', stale: false, totals: { blocked: false, net_ars: 90000 }, request: { choice: 'refund', jersey_requested: true, jersey_consent: true }, proposal: null } as unknown as SettlementPreview;
const checks = { jersey_validated: true, stock: true, size: true, delivery: true };
describe('preparatory settlement safeguards', () => {
 it('requires human reconciliation', () => expect(canValidateSettlement(preview, false)).toBe(false));
 it('permits reconciled refund documentation', () => expect(canValidateSettlement(preview, true)).toBe(true));
 it('permits nominal credit proposal only', () => expect(canValidateSettlement({ ...preview, request: { ...preview.request, choice: 'credit' } as SettlementPreview['request'] }, true)).toBe(true));
 it('blocks stale snapshots', () => expect(canValidateSettlement({ ...preview, stale: true }, true)).toBe(false));
 it('blocks financial alerts', () => expect(canValidateSettlement({ ...preview, totals: { ...preview.totals, blocked: true } }, true)).toBe(false));
 it('proposes exactly 50000 for accepted validated jersey', () => expect(proposalJerseyAmount(preview, 90000, checks)).toBe(50000));
 it('cannot deduct jersey below 50000', () => expect(proposalJerseyAmount(preview, 49999, checks)).toBe(0));
 it('no jersey preserves the whole proposal', () => expect(proposalJerseyAmount({ ...preview, request: { ...preview.request, jersey_requested: false } as SettlementPreview['request'] }, 90000, checks)).toBe(0));
 it('missing stock blocks proposed deduction', () => expect(proposalJerseyAmount(preview, 90000, { ...checks, stock: false })).toBe(0));
 it('stale validated proposal is not validated', () => expect(settlementState({ ...preview, stale: true })).toBe('Desactualizado · recalcular'));
});
