import type { ReschedulingRequest } from './rescheduling';
export const SETTLEMENT_LABELS = { estimated: 'Estimado', reconcile: 'A conciliar', validated: 'Validado (sin ejecutar)' };
export type SettlementState = keyof typeof SETTLEMENT_LABELS;
export interface SettlementProposal { version: number; state: SettlementState; source_hash: string; calculated_amount: number; authorized_amount: number | null; jersey_amount: number; note: string; created_at: string }
export interface SettlementPreview {
 source_hash: string; stale: boolean; request: ReschedulingRequest | null;
 totals: { paid_ars: number; returned_ars: number; direct_paid_ars: number; direct_received_ars: number; net_ars: number; confirmed_net_ars: number | null; excluded_count: number; blocked: boolean; alerts: string[] };
 proposal: SettlementProposal | null; history: SettlementProposal[];
 payments: { id: string; amount: number; currency: string; method: string; date: string; reference: string | null; proof: string | null; included: boolean; status: string }[];
 refunds: { amount: number; currency: string; date: string; method: string }[];
 directs: { amount: number; currency: string; status: string; direction: string; voided: boolean; proof: string | null }[];
 existing: Record<string, number>;
}
export function settlementState(p: SettlementPreview): string {
 if (p.stale) return 'Desactualizado · recalcular';
 if (p.totals.blocked) return SETTLEMENT_LABELS.reconcile;
 return p.proposal ? SETTLEMENT_LABELS[p.proposal.state] : SETTLEMENT_LABELS.estimated;
}
export function canValidateSettlement(p: SettlementPreview, reconciled: boolean): boolean {
 return !p.stale && !p.totals.blocked && reconciled && ['refund', 'credit'].includes(p.request?.choice ?? '');
}
export function proposalJerseyAmount(p: SettlementPreview, amount: number, checks: Record<string, boolean>): number {
 return p.request?.jersey_requested === true && p.request.jersey_consent && amount >= 50000 && checks.jersey_validated && checks.stock && checks.size && checks.delivery ? 50000 : 0;
}
