import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select,SelectContent,SelectItem,SelectTrigger,SelectValue } from '@/components/ui/select';
import { RadioGroup,RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { CheckCircle2,Loader2 } from 'lucide-react';
import { formatPrice } from '@/lib/currency';
import { isFinancialChoice,jerseyEstimate,reschedulingInput,REVIEW_LABELS,type ReschedulingCampaign,type ReschedulingReservation } from '@/lib/rescheduling';
export default function ReschedulingForm({campaign,row,admin=false,token,onSaved}:{campaign:ReschedulingCampaign;row:ReschedulingReservation;admin?:boolean;token?:string;onSaved:()=>void}) {
 const [choice,setChoice]=useState(row.request?.choice ?? '');
 const [jersey,setJersey]=useState(row.request?.jersey_requested === true ? 'yes' : row.request?.jersey_requested===false ? 'no' : '');
 const [size,setSize]=useState(row.request?.jersey_size ?? '');
 const [delivery,setDelivery]=useState(row.request?.delivery ?? '');
 const [consent,setConsent]=useState(false); const [jerseyConsent,setJerseyConsent]=useState(false);
 const [source,setSource]=useState(''); const [note,setNote]=useState('');
 const [busy,setBusy]=useState(false); const [error,setError]=useState(''); const [saved,setSaved]=useState(false);
 const [command,setCommand]=useState(crypto.randomUUID());
 const financial=isFinancialChoice(choice); const estimate=jerseyEstimate(row.financial,campaign.jersey_price,jersey==='yes' ? true : jersey==='no' ? false : null);
 const valid=!!choice && consent && (!admin || (!!source.trim() && !!note.trim())) && (!financial || jersey!=='yes' || (size && delivery && jerseyConsent && !estimate.insufficient));
 const change=(fn:()=>void)=>{fn();setSaved(false);setCommand(crypto.randomUUID());};
 const save=async()=>{
  setBusy(true);setError('');
  try { const {error:e}=await supabase.rpc('submit_rescheduling_request',{p_event_id:campaign.event_id,p_reservation_id:row.reservation_id,p_expected_revision:row.request?.revision ?? 0,p_command_id:command,p_token:token ?? undefined,p_input:reschedulingInput({choice,consent,source,note,jersey_requested:jersey==='yes' ? true : jersey==='no' ? false : null,jersey_size:size,delivery,jersey_consent:jerseyConsent})});
   if(e) throw e;setSaved(true);setConsent(false);setJerseyConsent(false);onSaved();
  }catch(e:unknown){setError(e instanceof Error ? e.message : String((e as {message?:string})?.message ?? 'No pudimos guardar la solicitud.'));}finally{setBusy(false)}
 };
 return <section className="space-y-5 min-w-0">
  <header><h2 className="text-lg font-heading">{row.participant}</h2><p className="text-sm text-muted-foreground">{row.package ?? 'Reserva actual'} · {row.request ? REVIEW_LABELS[row.request.review_status] : 'Sin respuesta'}</p></header>
  <RadioGroup aria-label="Tu elección para San Luis" value={choice} onValueChange={v=>change(()=>{setChoice(v);setConsent(false)})} className="gap-2">
   {campaign.options.map(o=><Label key={o.value} className="flex items-start gap-3 border border-border rounded-lg p-3 cursor-pointer"><RadioGroupItem value={o.value} className="mt-0.5 shrink-0"/><span className="text-sm leading-relaxed">{o.label}{o.nights ? <span className="block text-muted-foreground">{o.nights} noches</span> : null}</span></Label>)}
  </RadioGroup>
  {financial && <div className="space-y-4 border-y border-border py-4">
   <p className="text-sm">Por el cambio organizado por Reybaud, corresponde el 100% de lo efectivamente abonado, menos reintegros previos, sin retención ni penalidad.</p>
   {choice==='credit' && <p className="text-sm text-muted-foreground">Crédito nominal en ARS para otro Training Camp, con uso parcial y remanente, sin indexación ni vencimiento definido. Aún no es un crédito disponible.</p>}
   <dl className="text-sm space-y-2"><div className="flex justify-between gap-2"><dt>Pagos validados a Reybaud</dt><dd>{formatPrice(row.financial.paid_reybaud)}</dd></div>
    {row.financial.direct_paid>0 && <div className="flex justify-between gap-2"><dt>Pago directo confirmado · caja Reybaud $0</dt><dd>{formatPrice(row.financial.direct_paid)}</dd></div>}
    <div className="flex justify-between gap-2"><dt>Reintegros previos</dt><dd>{formatPrice(row.financial.previous_refunds+row.financial.direct_received)}</dd></div>
    <div className="flex justify-between gap-2 font-semibold"><dt>Importe restante estimado</dt><dd>{row.financial.requires_reconciliation ? 'A conciliar' : formatPrice(estimate.remaining)}</dd></div>
   </dl>
   {row.financial.requires_reconciliation && <p className="text-sm text-primary">Hay una transferencia previa o importes que requieren conciliación. Tu derecho se conserva; Administración debe confirmar el importe y quién corresponde que lo reintegre.</p>}
   <p className="text-sm font-medium">¿Querés recibir el jersey oficial del Training Camp San Luis?</p>
   <p className="text-sm text-muted-foreground">Compra optativa: {formatPrice(campaign.jersey_price)} ARS. No condiciona la devolución. Si elegís No, conservás el 100% del importe restante.</p>
   <RadioGroup aria-label="Jersey optativo" value={jersey} onValueChange={v=>change(()=>{setJersey(v);setJerseyConsent(false)})} className="flex gap-6">{[['yes','Sí'],['no','No']].map(([v,l])=><Label key={v} className="flex items-center gap-2"><RadioGroupItem value={v}/>{l}</Label>)}</RadioGroup>
   {jersey==='yes' && <div className="space-y-3">
    <p className="text-sm text-muted-foreground">{row.size.conflict ? `Talles en revisión: encuesta ${row.size.survey}, Administración ${row.size.administration}.` : row.size.confirmed ? `Talle informado: ${row.size.confirmed}. Confirmalo o corregilo.` : 'No hay talle confirmado. Elegí tu talle.'}</p>
    <Select value={size} onValueChange={v=>change(()=>setSize(v))}><SelectTrigger aria-label="Talle del jersey"><SelectValue placeholder="Confirmar o corregir talle"/></SelectTrigger><SelectContent>{row.size.options.map(o=><SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select>
    <Select value={delivery} onValueChange={v=>change(()=>setDelivery(v))}><SelectTrigger aria-label="Entrega del jersey"><SelectValue placeholder="Elegí retiro o envío"/></SelectTrigger><SelectContent><SelectItem value="retiro">Retiro</SelectItem><SelectItem value="envio">Envío</SelectItem></SelectContent></Select>
    <p className="text-xs text-muted-foreground">Disponibilidad, talle y entrega pendientes de validación. Envío extra sólo informado y aprobado, nunca automático.</p>
    <Label className="flex items-start gap-3"><Checkbox checked={jerseyConsent} onCheckedChange={v=>change(()=>setJerseyConsent(v===true))}/><span className="text-sm leading-relaxed">Solicito el jersey y autorizo deducir {formatPrice(campaign.jersey_price)} exclusivamente si Administración valida saldo suficiente, disponibilidad, talle y entrega.</span></Label>
    <dl className="text-sm space-y-2"><div className="flex justify-between gap-2"><dt>Jersey · deducción condicionada</dt><dd>{formatPrice(campaign.jersey_price)}</dd></div><div className="flex justify-between gap-2 font-semibold"><dt>Neto si se valida el jersey</dt><dd>{row.financial.requires_reconciliation ? 'A conciliar' : formatPrice(estimate.conditionalNet)}</dd></div></dl>
    {estimate.insufficient && <p className="text-sm text-destructive">Saldo insuficiente para deducir el jersey. Podés solicitar devolución o crédito sin jersey.</p>}
   </div>}
   <p className="text-xs text-muted-foreground">No se ha acordado un plazo de reintegro. Esta solicitud no mueve dinero.</p>
  </div>}
  {admin && <div className="space-y-3"><Label>Fuente de la decisión<Input aria-label="Fuente de la decisión" value={source} maxLength={120} onChange={e=>change(()=>setSource(e.target.value))} placeholder="Ej. conversación presencial confirmada"/></Label><Label>Nota y constancia del consentimiento<Textarea aria-label="Nota de la decisión" value={note} maxLength={2000} onChange={e=>change(()=>setNote(e.target.value))}/></Label></div>}
  <Label className="flex items-start gap-3"><Checkbox checked={consent} onCheckedChange={v=>change(()=>setConsent(v===true))}/><span className="text-sm leading-relaxed">{admin ? 'Dejo constancia de que el participante comunicó y consintió esta decisión. ' : ''}{campaign.consent_text}</span></Label>
  <Button className="w-full" onClick={save} disabled={!valid || busy}>{busy && <Loader2 className="mr-2 w-4 h-4 animate-spin"/>}{row.request ? 'Actualizar solicitud' : 'Confirmar solicitud'}</Button>
  {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  {saved && <div role="status" className="space-y-2 border-t border-border pt-3"><p className="flex items-start gap-2 text-sm text-primary"><CheckCircle2 className="w-5 h-5 shrink-0"/>Solicitud guardada. Tu reserva y tus pagos no se modificaron.</p><p className="text-sm">{campaign.options.find(o=>o.value===choice)?.label}</p>{financial && <p className="text-sm text-muted-foreground">{jersey==='yes' ? `Jersey solicitado: ${size} · ${delivery}. Deducción pendiente de validación, no ejecutada.` : 'Sin deducción de jersey autorizada.'}</p>}</div>}
 </section>;
}
