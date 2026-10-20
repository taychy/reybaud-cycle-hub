import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ReschedulingForm from './ReschedulingForm';
import type { ReschedulingCampaign, ReschedulingReservation } from '@/lib/rescheduling';

const { rpc, timing } = vi.hoisted(() => ({ rpc: vi.fn(), timing: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));
vi.mock('@/lib/reschedulingPolicy',()=>({refundTiming:timing}));
const campaign: ReschedulingCampaign = {
 event_id:'test-event',public_enabled:true,jersey_price:50000,consent_text:'Acepto registrar esta solicitud para revisión.',policy_text:'',policy_version:'v1',
 options:[{value:'attend_5_8',label:'Asisto del 5 al 8 de noviembre',nights:3},{value:'attend_6_9',label:'Asisto del 6 al 9 de noviembre',nights:3},{value:'attend_5_9',label:'Asisto del 5 al 9 de noviembre',nights:4},{value:'refund',label:'Solicito devolución'},{value:'credit',label:'Solicito crédito'},{value:'help',label:'Necesito ayuda'}],
};
const row: ReschedulingReservation = {
 reservation_id:'test-reservation',participant:'Participante de prueba',package:'Doble',request:null,
 financial:{paid_reybaud:100000,direct_paid:0,direct_received:0,effective_paid:100000,previous_refunds:10000,estimated_remaining:90000,requires_reconciliation:false,has_transfer:false,refund_obligation:null,credit_available:0,credit_used:0,finance_enabled:false},
 size:{confirmed:null,survey:null,administration:null,conflict:false,options:[{value:'M',label:'M'}]},
};
const next=()=>fireEvent.click(screen.getByRole('button',{name:'Continuar'}));
const back=()=>fireEvent.click(screen.getByRole('button',{name:'Volver'}));
const select=(name:RegExp)=>fireEvent.click(screen.getByRole('radio',{name}));
const start=(r=row)=>render(<ReschedulingForm campaign={campaign} row={r} token="test-guest-session" onSaved={vi.fn()}/>);
beforeEach(()=>{rpc.mockReset();rpc.mockResolvedValue({error:null});timing.mockReset();timing.mockReturnValue(null);});
afterEach(cleanup);

describe('rescheduling wizard decisions and submission',()=>{
 it('resolves campaign timeframe for refund details and review but passes credit separately',()=>{
  start();select(/pido la devolución/);next();expect(timing).toHaveBeenLastCalledWith('refund',campaign.policy_text);select(/^No$/);next();expect(timing).toHaveBeenLastCalledWith('refund',campaign.policy_text);back();back();select(/pido crédito/);next();expect(timing).toHaveBeenLastCalledWith('credit',campaign.policy_text);next();expect(timing).toHaveBeenLastCalledWith('credit',campaign.policy_text);expect(rpc).not.toHaveBeenCalled();
 });
 it('starts with no decision, no dates and no consent; cannot continue',()=>{
  start();expect(screen.getAllByRole('radio')).toHaveLength(4);
  for(const radio of screen.getAllByRole('radio')) expect(radio).toHaveAttribute('aria-checked','false');
  expect(screen.getByRole('button',{name:'Continuar'})).toBeDisabled();expect(screen.queryByRole('checkbox')).toBeNull();expect(rpc).not.toHaveBeenCalled();
 });
 it('attendance requires a separate unselected date; keeps date when going back',()=>{
  start();select(/Viajo en noviembre/);expect(screen.getAllByRole('radio')).toHaveLength(4);next();
  expect(screen.getAllByRole('radio')).toHaveLength(3);expect(screen.getByRole('button',{name:'Continuar'})).toBeDisabled();
  select(/5 al 9/);next();expect(screen.queryByRole('radio')).toBeNull();expect(screen.getByRole('button',{name:'Confirmar solicitud'})).toBeDisabled();
  back();expect(screen.getByRole('radio',{name:/5 al 9/})).toHaveAttribute('aria-checked','true');back();next();expect(screen.getByRole('radio',{name:/5 al 9/})).toHaveAttribute('aria-checked','true');expect(rpc).not.toHaveBeenCalled();
 });
 it('switching category clears incompatible dates and consent',()=>{
  start();select(/Viajo en noviembre/);next();select(/5 al 9/);next();fireEvent.click(screen.getByRole('checkbox',{name:'Confirmo mi elección'}));back();back();select(/pido la devolución/);next();next();
  expect(screen.getByRole('checkbox',{name:'Confirmo mi elección'})).toHaveAttribute('aria-checked','false');
  back();back();select(/Viajo en noviembre/);next();expect(screen.getByRole('button',{name:'Continuar'})).toBeDisabled();
 });
 it('help skips dates and jersey, goes directly to review without saving',()=>{
  start();select(/Necesito ayuda antes/);next();expect(screen.queryByRole('radio')).toBeNull();expect(screen.getByRole('button',{name:'Confirmar solicitud'})).toBeDisabled();expect(rpc).not.toHaveBeenCalled();
 });
 it('financial jersey choice has no default and yes requires size, delivery and specific consent',()=>{
  start();select(/pido la devolución/);next();expect(screen.getAllByRole('radio')).toHaveLength(2);for(const radio of screen.getAllByRole('radio'))expect(radio).toHaveAttribute('aria-checked','false');
  select(/^Sí$/);expect(screen.getByRole('button',{name:'Continuar'})).toBeDisabled();expect(screen.queryByRole('button',{name:'Confirmar solicitud'})).toBeNull();select(/^No$/);expect(screen.getByRole('button',{name:'Continuar'})).toBeEnabled();
 });
 it('only confirmation submits once under double click; sends scoped identity and clean help input',async()=>{
  let resolve:((value:{error:null})=>void)|undefined;
  rpc.mockImplementation(()=>new Promise(r=>{resolve=r;}));start();select(/Necesito ayuda antes/);next();fireEvent.click(screen.getByRole('checkbox',{name:'Confirmo mi elección'}));
  const button=screen.getByRole('button',{name:'Confirmar solicitud'});fireEvent.click(button);fireEvent.click(button);
  expect(rpc).toHaveBeenCalledTimes(1);expect(rpc).toHaveBeenCalledWith('submit_rescheduling_request',expect.objectContaining({p_reservation_id:'test-reservation',p_token:'test-guest-session',p_expected_revision:0,p_input:expect.objectContaining({choice:'help',consent:true,jersey_requested:null,jersey_size:null,delivery:null,jersey_consent:false})}));
  await act(async()=>{resolve?.({error:null});});expect(screen.getByRole('status')).toBeInTheDocument();expect(screen.queryByRole('button',{name:'Confirmar solicitud'})).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Revisar o modificar'}));next();fireEvent.click(screen.getByRole('checkbox',{name:'Confirmo mi elección'}));fireEvent.click(screen.getByRole('button',{name:'Actualizar solicitud'}));expect(rpc.mock.calls[1][1].p_expected_revision).toBe(1);expect(rpc.mock.calls[1][1].p_command_id).not.toBe(rpc.mock.calls[0][1].p_command_id);
 });
 it('admin requires explicit source and note on final review',()=>{
  render(<ReschedulingForm campaign={campaign} row={row} admin onSaved={vi.fn()}/>);select(/Necesito ayuda antes/);next();fireEvent.click(screen.getByRole('checkbox',{name:'Confirmo mi elección'}));expect(screen.getByRole('button',{name:'Confirmar solicitud'})).toBeDisabled();
  fireEvent.change(screen.getByRole('textbox',{name:'Fuente de la decisión'}),{target:{value:'Conversación confirmada'}});fireEvent.change(screen.getByRole('textbox',{name:'Nota de la decisión'}),{target:{value:'El participante solicita ayuda.'}});fireEvent.click(screen.getByRole('checkbox',{name:'Confirmo mi elección'}));expect(screen.getByRole('button',{name:'Confirmar solicitud'})).toBeEnabled();
 });
});