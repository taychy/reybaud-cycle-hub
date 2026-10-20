import { supabase } from '@/integrations/supabase/client';
export interface ReschedulingOption { value: string; label: string; nights?: number; start?: string; end?: string }
export interface ReschedulingCampaign { event_id: string; public_enabled: boolean; options: ReschedulingOption[]; jersey_price: number; consent_text: string; policy_text: string; policy_version: string }
export interface ReschedulingRequest { choice: string; jersey_requested: boolean | null; jersey_size: string | null; delivery: string | null; jersey_consent: boolean; revision: number; review_status: string; source: string; note: string; admin_note: string; consent_at: string; updated_at: string }
export interface ReschedulingFinancial { paid_reybaud: number; direct_paid: number; direct_received: number; effective_paid: number; previous_refunds: number; estimated_remaining: number; requires_reconciliation: boolean; has_transfer: boolean; refund_obligation: {status: string; suggested: number; returned: number} | null; credit_available: number; credit_used: number; finance_enabled: false }
export interface ReschedulingReservation { reservation_id: string; participant: string; package: string | null; financial: ReschedulingFinancial; size: { confirmed: string | null; survey: string | null; administration: string | null; conflict: boolean; options: {value: string; label: string}[] }; request: ReschedulingRequest | null }
export interface ReschedulingContext { available: boolean; admin?: boolean; admin_hint?: boolean; auth_required?: boolean; verification_required?: boolean; campaign?: ReschedulingCampaign; reservations?: ReschedulingReservation[]; transfers?: { id: string; status: string; original_reservation_id: string; replacement_reservation_id: string | null; package_id: string | null }[] }
export const REVIEW_LABELS: Record<string,string> = {pendiente:'Pendiente', en_revision:'En revisión', validada:'Solicitud validada · sin ejecución', requiere_contacto:'Requiere contacto'};
export const isFinancialChoice = (choice: string) => ['refund','credit'].includes(choice);
export function reschedulingInput(input: {choice:string;consent:boolean;source:string;note:string;jersey_requested:boolean|null;jersey_size:string;delivery:string;jersey_consent:boolean}) {
  const financial=isFinancialChoice(input.choice);
  const requested=financial ? input.jersey_requested : null;
  return {...input,jersey_requested:requested,jersey_size:requested===true ? input.jersey_size : null,delivery:requested===true ? input.delivery : null,jersey_consent:requested===true && input.jersey_consent};
}
export function jerseyEstimate(financial: ReschedulingFinancial, price: number, requested: boolean | null) {
  const remaining = Math.max(0, Number(financial.estimated_remaining));
  return { remaining, conditionalDeduction: requested === true ? price : 0, conditionalNet: requested === true && remaining >= price ? remaining-price : remaining,
    insufficient: requested === true && !financial.requires_reconciliation && remaining < price, executableDeduction: 0 };
}
export function compatibleReschedulingOptions(a: ReschedulingOption, b: ReschedulingOption, packageA: string | null, packageB: string | null) {
  return Boolean(packageA && packageA===packageB && a.start && a.end && a.start===b.start && a.end===b.end && a.nights===b.nights);
}
export function csvCell(value: unknown) {
  const s=String(value ?? ''); const safe=/^[\s]*[=+@-]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g,'""')}"`;
}
export async function reschedulingContext(eventId: string, reservationId?: string, token?: string): Promise<ReschedulingContext> {
  const {data,error}=await supabase.rpc('get_rescheduling_context',{p_event_id:eventId,p_reservation_id:reservationId ?? undefined,p_token:token ?? undefined});
  if(error) throw error; return data as unknown as ReschedulingContext;
}
