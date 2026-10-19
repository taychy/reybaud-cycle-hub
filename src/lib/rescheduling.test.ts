import { describe,it,expect } from 'vitest';
import { jerseyEstimate, compatibleReschedulingOptions,isFinancialChoice,reschedulingInput,csvCell,type ReschedulingFinancial } from './rescheduling';
const f: ReschedulingFinancial={paid_reybaud:100000,direct_paid:0,direct_received:0,effective_paid:100000,previous_refunds:10000,estimated_remaining:90000,requires_reconciliation:false,has_transfer:false,refund_obligation:null,credit_available:0,credit_used:0,finance_enabled:false};
describe('organizer rescheduling policy',()=>{
 const input={choice:'refund',consent:true,source:'',note:'',jersey_requested:true,jersey_size:'M',delivery:'retiro',jersey_consent:true};
 it('No removes previous jersey size and authorization',()=>expect(reschedulingInput({...input,jersey_requested:false})).toMatchObject({jersey_requested:false,jersey_size:null,delivery:null,jersey_consent:false}));
 it('attendance never sends previous financial jersey data',()=>expect(reschedulingInput({...input,choice:'attend_5_9'})).toMatchObject({jersey_requested:null,jersey_size:null,delivery:null,jersey_consent:false}));
 it('refund keeps 100% actually paid minus prior refunds, with no retention',()=>expect(jerseyEstimate(f,50000,false).conditionalNet).toBe(90000));
 it('credit has the same nominal ARS entitlement',()=>{expect(isFinancialChoice('credit')).toBe(true);expect(jerseyEstimate(f,50000,null).conditionalNet).toBe(90000)});
 it('jersey costs exactly ARS 50000 but no deduction is executed',()=>{const x=jerseyEstimate(f,50000,true);expect(x.conditionalDeduction).toBe(50000);expect(x.conditionalNet).toBe(40000);expect(x.executableDeduction).toBe(0)});
 it('does not assume consent from an unanswered jersey option',()=>expect(jerseyEstimate(f,50000,null).conditionalDeduction).toBe(0));
 it('blocks insufficient balance',()=>expect(jerseyEstimate({...f,estimated_remaining:49999},50000,true).insufficient).toBe(true));
 it('requires reconciliation rather than promising transfer funds',()=>expect(jerseyEstimate({...f,requires_reconciliation:true,estimated_remaining:0},50000,true).executableDeduction).toBe(0));
 it('does not match 3 and 4 nights by package alone',()=>expect(compatibleReschedulingOptions({value:'a',label:'a',start:'2026-11-05',end:'2026-11-08',nights:3},{value:'b',label:'b',start:'2026-11-05',end:'2026-11-09',nights:4},'same','same')).toBe(false));
 it('does not match different 3-night windows',()=>expect(compatibleReschedulingOptions({value:'a',label:'a',start:'2026-11-05',end:'2026-11-08',nights:3},{value:'b',label:'b',start:'2026-11-06',end:'2026-11-09',nights:3},'same','same')).toBe(false));
 it('only refund and credit offer jersey',()=>{expect(['attend_5_8','attend_6_9','attend_5_9','help'].some(isFinancialChoice)).toBe(false);expect(isFinancialChoice('refund')).toBe(true)});
 it('neutralizes spreadsheet formulas',()=>expect(csvCell('=HYPERLINK("evil")')).toBe('"\'=HYPERLINK(""evil"")"'));
});
