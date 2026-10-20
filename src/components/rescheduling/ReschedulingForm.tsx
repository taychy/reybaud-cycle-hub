import { useRef,useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select,SelectContent,SelectItem,SelectTrigger,SelectValue } from '@/components/ui/select';
import { RadioGroup,RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { ArrowLeft,ArrowRight,CheckCircle2,Loader2 } from 'lucide-react';
import { formatPrice } from '@/lib/currency';
import { isFinancialChoice,jerseyEstimate,reschedulingInput,REVIEW_LABELS,type ReschedulingCampaign,type ReschedulingReservation } from '@/lib/rescheduling';
import { choiceGroup,mainGroups } from '@/lib/reschedulingAccess';
export default function ReschedulingForm({campaign,row,admin=false,token,onSaved}:{campaign:ReschedulingCampaign;row:ReschedulingReservation;admin?:boolean;token?:string;onSaved:()=>void}) {
 const [choice,setChoice]=useState(row.request?.choice ?? '');const [group,setGroup]=useState(choiceGroup(row.request?.choice ?? ''));
 const [jersey,setJersey]=useState(row.request?.jersey_requested === true ? 'yes' : row.request?.jersey_requested===false ? 'no' : '');
 const [size,setSize]=useState(row.request?.jersey_size ?? '');
 const [delivery,setDelivery]=useState(row.request?.delivery ?? '');
 const [consent,setConsent]=useState(false); const [jerseyConsent,setJerseyConsent]=useState(false);
 const [source,setSource]=useState(''); const [note,setNote]=useState('');
 const [busy,setBusy]=useState(false); const [error,setError]=useState(''); const [saved,setSaved]=useState(false);
 const [command,setCommand]=useState(crypto.randomUUID());
 const [step,setStep]=useState<1|2|3>(1);
 const heading=useRef<HTMLHeadingElement>(null);const submitting=useRef(false);
 const revision=useRef(row.request?.revision ?? 0);
 revision.current=Math.max(revision.current,row.request?.revision ?? 0);
 const go=(next:1|2|3)=>{setStep(next);setError('');requestAnimationFrame(()=>heading.current?.focus({preventScroll:true}));};
 const financial=isFinancialChoice(choice); const estimate=jerseyEstimate(row.financial,campaign.jersey_price,jersey==='yes' ? true : jersey==='no' ? false : null);
 const detailsValid=!!choice && (!financial || jersey!=='yes' || (!!size && !!delivery && jerseyConsent && !estimate.insufficient));
 const valid=step===3 && detailsValid && consent && (!admin || (!!source.trim() && !!note.trim()));
 const change=(fn:()=>void)=>{setConsent(false);fn();setSaved(false);setError('');setCommand(crypto.randomUUID());};
 const category=(v:string)=>change(()=>{if(v===group)return;setGroup(v);setChoice(v==='attend'?'':v);setJersey('');setSize('');setDelivery('');setJerseyConsent(false);});
 const save=async()=>{
  if(!valid || submitting.current)return;submitting.current=true;setBusy(true);setError('');
  try { const {error:e}=await supabase.rpc('submit_rescheduling_request',{p_event_id:campaign.event_id,p_reservation_id:row.reservation_id,p_expected_revision:revision.current,p_command_id:command,p_token:token ?? undefined,p_input:reschedulingInput({choice,consent,source,note,jersey_requested:jersey==='yes' ? true : jersey==='no' ? false : null,jersey_size:size,delivery,jersey_consent:jerseyConsent})});
   if(e) throw e;revision.current+=1;setSaved(true);setConsent(false);setJerseyConsent(false);onSaved();
  }catch(e:unknown){setError(e instanceof Error ? e.message : String((e as {message?:string})?.message ?? 'No pudimos guardar la solicitud.'));}finally{submitting.current=false;setBusy(false)}
 };
 return <section className="space-y-5 min-w-0" aria-busy={busy}>
  <header><h2 className="text-lg font-heading">{row.participant}</h2><p className="text-sm text-muted-foreground">{row.package ?? 'Reserva actual'} · {row.request ? REVIEW_LABELS[row.request.review_status] : 'Sin respuesta'}</p></header>
  {saved ? <div role="status" className="space-y-4 border-t border-border pt-4">
   <CheckCircle2 className="w-8 h-8 text-primary"/><h3 className="text-lg font-heading">Tu solicitud quedó registrada</h3>
   <p className="text-sm">{campaign.options.find(o=>o.value===choice)?.label}</p>
   <p className="text-sm text-muted-foreground">El equipo revisará tu elección. Tu reserva y tus pagos siguen sin cambios: todavía no se devolvió ni acreditó dinero. Podés volver a este enlace para revisar o modificar tu solicitud.</p>
   {financial && <p className="text-sm">{jersey==='yes' ? `Jersey solicitado: ${size} · ${delivery}. Deducción pendiente de validación, no ejecutada.` : 'No se descuenta el jersey.'}</p>}
   <Button variant="outline" className="w-full" onClick={()=>{setSaved(false);setConsent(false);setJerseyConsent(false);setCommand(crypto.randomUUID());go(1);}}>Revisar o modificar</Button>
  </div> : <>
  <div className="space-y-2"><p aria-live="polite" className="text-sm text-muted-foreground">Paso {step}/3</p><div className="grid grid-cols-3 gap-2" aria-hidden="true">{[1,2,3].map(n=><span key={n} className={`h-1 rounded ${n<=step?'bg-primary':'bg-muted'}`}/>)}</div></div>
  <h3 ref={heading} tabIndex={-1} className="text-xl font-heading leading-snug focus:outline-none">{step===1?'¿Cómo querés continuar con tu reserva?':step===3?'Revisá y confirmá tu elección':group==='attend'?'Elegí las fechas en las que viajás':'Revisá las condiciones de tu solicitud'}</h3>
  {step===1 && <RadioGroup aria-label="Tu elección para San Luis" value={group} onValueChange={category} className="gap-3">
   {mainGroups(campaign).map(o=><Label key={o.value} className={`flex items-start gap-3 border rounded-lg p-4 cursor-pointer min-w-0 ${group===o.value?'border-primary bg-muted':'border-border'}`}><RadioGroupItem value={o.value} className="mt-0.5 shrink-0"/><span className="text-sm leading-relaxed min-w-0 break-words">{o.label}{o.hint && <span className="block text-muted-foreground mt-1">{o.hint}</span>}</span></Label>)}
  </RadioGroup>}
  {step===2 && group==='attend' && <RadioGroup aria-label="Fechas en las que viajás" value={choice} onValueChange={v=>change(()=>setChoice(v))} className="gap-3">
   {campaign.options.filter(o=>o.value.startsWith('attend_')).map(o=><Label key={o.value} className={`flex items-start gap-3 border rounded-lg p-4 cursor-pointer ${choice===o.value?'border-primary bg-muted':'border-border'}`}><RadioGroupItem value={o.value} className="mt-0.5 shrink-0"/><span className="text-sm leading-relaxed">{o.label.replace(/^Asisto /,'')}<span className="block text-muted-foreground mt-1">{o.nights} noches</span></span></Label>)}
  </RadioGroup>}
  {step===2 && financial && <div className="space-y-4 border-y border-border py-4">
   <p className="text-sm">Por el cambio organizado por Reybaud, corresponde el 100% de lo efectivamente abonado, menos reintegros previos, sin retención ni penalidad.</p>
   {choice==='credit' && <p className="text-sm text-muted-foreground">Crédito nominal en ARS para otro Training Camp, con uso parcial y remanente, sin indexación ni vencimiento definido. Aún no es un crédito disponible.</p>}
   <dl className="text-sm space-y-2"><div className="flex justify-between gap-2"><dt>Pagos validados a Reybaud</dt><dd>{formatPrice(row.financial.paid_reybaud)}</dd></div>
    {row.financial.direct_paid>0 && <div className="flex justify-between gap-2"><dt>Pago directo confirmado · caja Reybaud $0</dt><dd>{formatPrice(row.financial.direct_paid)}</dd></div>}
    <div className="flex justify-between gap-2"><dt>Reintegros previos</dt><dd>{formatPrice(row.financial.previous_refunds+row.financial.direct_received)}</dd></div>
    <div className="flex justify-between gap-2 font-semibold"><dt>Importe restante estimado</dt><dd>{row.financial.requires_reconciliation ? 'A conciliar' : formatPrice(estimate.remaining)}</dd></div>
   </dl>
   {row.financial.requires_reconciliation && <p className="text-sm text-primary">Hay una transferencia previa o importes que requieren conciliación. Tu derecho se conserva; Administración debe confirmar el importe y quién corresponde que lo reintegre.</p>}
   {timing && <div className="space-y-1"><p className="text-sm font-medium">{timing}</p><p className="text-sm text-muted-foreground">Revisaremos tu solicitud y confirmaremos el importe correspondiente.</p></div>}
   <p className="text-sm font-medium">¿Querés quedarte con el jersey del Training Camp?</p>
   <p className="text-sm text-muted-foreground">Cuesta {formatPrice(campaign.jersey_price)}. Es opcional.</p>
   <p className="text-sm text-muted-foreground">Si elegís Sí, ese importe se descontará del dinero que te corresponda devolver o acreditar, solo cuando Administración confirme el saldo, talle, disponibilidad y entrega.</p>
   <p className="text-sm text-muted-foreground">Si elegís No, no descontamos nada por el jersey.</p>
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
   <p className="text-xs text-muted-foreground">{choice==='refund' ? 'La solicitud no hace la transferencia automáticamente.' : 'Esta solicitud no acredita dinero automáticamente.'}</p>
  </div>}
  {step===3 && <div className="space-y-4">
   <div className="border-y border-border py-4 space-y-3 text-sm">
    <p className="font-medium">{campaign.options.find(o=>o.value===choice)?.label}</p>
    {group==='attend' && <p className="text-muted-foreground">{campaign.options.find(o=>o.value===choice)?.nights} noches · {row.package ?? 'Tu alojamiento reservado'}</p>}
    {group==='help' && <p className="text-muted-foreground">El equipo te contactará para ayudarte antes de elegir. No solicitás devolución, crédito ni jersey.</p>}
    {financial && <><p>100% de lo efectivamente abonado, menos reintegros previos, sin retención ni penalidad.</p>{choice==='credit' && <p>Crédito nominal en ARS para otro Training Camp, con uso parcial y remanente, sin indexación ni vencimiento definido.</p>}<p>Importe restante estimado: {row.financial.requires_reconciliation?'A conciliar':formatPrice(estimate.remaining)}</p><p>{jersey==='yes'?`Jersey solicitado: ${size} · ${delivery}. Deducción condicionada: ${formatPrice(campaign.jersey_price)} ARS.`:'No se descuenta el jersey.'}</p>{jersey==='yes' && <p>Neto si se valida el jersey: {row.financial.requires_reconciliation?'A conciliar':formatPrice(estimate.conditionalNet)}</p>}{timing && <p className="font-medium">{timing} Revisaremos tu solicitud y confirmaremos el importe correspondiente; la devolución se hace por separado, después de esa revisión.</p>}<p className="text-muted-foreground">{choice==='refund' ? 'La solicitud no hace la transferencia automáticamente.' : 'Esta solicitud no acredita dinero automáticamente.'} Disponibilidad, talle y entrega pendientes de validación; envío extra sólo informado y aprobado.</p></>}
   </div>
   {admin && <div className="space-y-3"><Label>Fuente de la decisión<Input aria-label="Fuente de la decisión" value={source} maxLength={120} onChange={e=>change(()=>setSource(e.target.value))} placeholder="Ej. conversación presencial confirmada"/></Label><Label>Nota y constancia del consentimiento<Textarea aria-label="Nota de la decisión" value={note} maxLength={2000} onChange={e=>change(()=>setNote(e.target.value))}/></Label></div>}
   <Label className="flex items-start gap-3"><Checkbox aria-label="Confirmo mi elección" checked={consent} onCheckedChange={v=>change(()=>setConsent(v===true))}/><span className="text-sm leading-relaxed">{admin ? 'Dejo constancia de que el participante comunicó y consintió esta decisión. ' : ''}{campaign.consent_text}</span></Label>
  </div>}
  <div className="flex gap-3 pt-2">
   {step>1 && <Button variant="outline" disabled={busy} onClick={()=>go(step===3 && group==='help'?1:step===3?2:1)}><ArrowLeft className="w-4 h-4 mr-2"/>Volver</Button>}
   {step<3 ? <Button className="flex-1" disabled={step===1?!group:!detailsValid} onClick={()=>go(step===1 && group!=='help'?2:3)}>Continuar<ArrowRight className="w-4 h-4 ml-2"/></Button> : <Button className="flex-1 whitespace-normal h-auto min-h-10" onClick={save} disabled={!valid || busy}>{busy && <Loader2 className="mr-2 w-4 h-4 animate-spin shrink-0"/>}{row.request || revision.current>0 ? 'Actualizar solicitud' : 'Confirmar solicitud'}</Button>}
  </div>
  {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </>}
 </section>;
}
