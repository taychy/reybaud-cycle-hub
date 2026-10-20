import { useCallback,useEffect,useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select,SelectContent,SelectItem,SelectTrigger,SelectValue } from '@/components/ui/select';
import { Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Download,RefreshCw,CalendarDays,LockKeyhole,History } from 'lucide-react';
import { formatPrice } from '@/lib/currency';
import { csvCell,REVIEW_LABELS,isFinancialChoice,type ReschedulingContext,type ReschedulingReservation } from '@/lib/rescheduling';
import ReschedulingForm from '@/components/rescheduling/ReschedulingForm';
import ReschedulingSettlementPanel from './ReschedulingSettlementPanel';
import { settlementState, type SettlementPreview } from '@/lib/reschedulingSettlement';
import ReschedulingCommsPanel from './ReschedulingCommsPanel';
import { ReschedulingSeatActions, ReschedulingSeatSummary } from './ReschedulingSeatPanel';
import type { SeatInventory } from '@/lib/reschedulingSeats';
export default function ReschedulingAdminPanel({eventId}:{eventId:string}) {
 const [ctx,setCtx]=useState<ReschedulingContext>();const [open,setOpen]=useState(false);const [loading,setLoading]=useState(false);const [error,setError]=useState('');
 const [search,setSearch]=useState('');const [filter,setFilter]=useState('all');const [dateFilter,setDateFilter]=useState('all');const [reviewFilter,setReviewFilter]=useState('all');const [jerseyFilter,setJerseyFilter]=useState('all');
 const [selected,setSelected]=useState<string>();const [status,setStatus]=useState('en_revision');const [note,setNote]=useState('');const [history,setHistory]=useState<{revision:number;origin:string;created_at:string;after_data:unknown}[]>([]);
 const [settlements,setSettlements]=useState<Record<string,SettlementPreview>>({});const [settlementFilter,setSettlementFilter]=useState('all');const [inventory,setInventory]=useState<SeatInventory>();
 const load=useCallback(async()=>{setLoading(true);try{const {data,error:e}=await supabase.rpc('admin_rescheduling_report',{p_event_id:eventId});if(e)throw e;setCtx(data as unknown as ReschedulingContext);const inv=await supabase.rpc('admin_rescheduling_inventory',{p_event_id:eventId});if(inv.error)throw inv.error;setInventory(inv.data as unknown as SeatInventory);setError('')}catch(e){setError((e as {message:string}).message)}finally{setLoading(false)}},[eventId]);
 useEffect(()=>{void load()},[load]);
 useEffect(()=>{if(!open)return;let active=true;const refresh=async()=>{const {data,error:e}=await supabase.rpc('admin_rescheduling_settlement_report',{p_event_id:eventId});if(!active)return;if(e){setError(e.message);return;}setSettlements(Object.fromEntries((data as unknown as (SettlementPreview & {reservation_id:string})[]).map(p=>[p.reservation_id,p])))};void refresh();const timer=window.setInterval(()=>void refresh(),30000);return()=>{active=false;window.clearInterval(timer)}},[open,eventId,ctx]);
 const rows=ctx?.reservations ?? [];const campaign=ctx?.campaign;const row=rows.find(r=>r.reservation_id===selected);
 useEffect(()=>{if(!selected){setHistory([]);return;}void supabase.from('reservation_rescheduling_history').select('revision,origin,created_at,after_data').eq('reservation_id',selected).order('revision',{ascending:false}).then(({data,error:e})=>{if(e)setError(e.message);else setHistory(data ?? [])})},[selected,ctx]);
 const decisionGroup=(r:ReschedulingReservation)=>!r.request?'unanswered':r.request.choice.startsWith('attend_')?'attend':r.request.choice;
 const decisions=[
  {value:'all',label:'Todos',count:rows.length},
  {value:'unanswered',label:'Sin respuesta',count:rows.filter(r=>!r.request).length},
  {value:'attend',label:'Viajan',count:rows.filter(r=>decisionGroup(r)==='attend').length},
  {value:'refund',label:'Devolución',count:rows.filter(r=>decisionGroup(r)==='refund').length},
  {value:'credit',label:'Crédito',count:rows.filter(r=>decisionGroup(r)==='credit').length},
  {value:'help',label:'Necesitan ayuda',count:rows.filter(r=>decisionGroup(r)==='help').length},
 ];
 const answered=rows.filter(r=>!!r.request).length;
 const filtered=rows.filter(r=>r.participant.toLowerCase().includes(search.trim().toLowerCase())
  && (filter==='all'||decisionGroup(r)===filter)
  && (dateFilter==='all'||r.request?.choice===dateFilter)
  && (reviewFilter==='all'||r.request?.review_status===reviewFilter)
  && (jerseyFilter==='all'||(jerseyFilter==='yes'?r.request?.jersey_requested===true:jerseyFilter==='no'?r.request?.jersey_requested===false:r.request?.jersey_requested==null))
  && (settlementFilter==='all'||(settlementFilter==='stale'?settlements[r.reservation_id]?.stale:settlementFilter==='reconcile'?settlements[r.reservation_id]?.totals.blocked:settlementFilter==='returned'?(settlements[r.reservation_id]?.totals.returned_ars??0)>0:settlements[r.reservation_id]?.proposal?.state===settlementFilter&&!settlements[r.reservation_id]?.stale&&!settlements[r.reservation_id]?.totals.blocked)));
 const displayed=[...filtered].sort((a,b)=>Number(!!b.request)-Number(!!a.request)||(b.request?.updated_at??'').localeCompare(a.request?.updated_at??'')||a.participant.localeCompare(b.participant));
 const hasFilters=!!search||filter!=='all'||dateFilter!=='all'||reviewFilter!=='all'||jerseyFilter!=='all'||settlementFilter!=='all';
 const resetFilters=()=>{setSearch('');setFilter('all');setDateFilter('all');setReviewFilter('all');setJerseyFilter('all');setSettlementFilter('all');};
 const label=(r:ReschedulingReservation)=>{
  const names:Record<string,string>={
   attend_5_8:'Viaja del 5 al 8 de noviembre',
   attend_6_9:'Viaja del 6 al 9 de noviembre',
   attend_5_9:'Viaja del 5 al 9 de noviembre',
   refund:'Solicita devolución',
   credit:'Solicita crédito',
   help:'Necesita ayuda',
  };
  return r.request?(names[r.request.choice]??campaign?.options.find(o=>o.value===r.request?.choice)?.label??'Elección sin identificar'):'Sin respuesta';
 };
 const resolutionLabel=(r:ReschedulingReservation)=>{
  if(!r.request)return 'Esperando respuesta';
  if(r.request.review_status==='validada'){
   if(r.request.choice.startsWith('attend_'))return 'Asistencia confirmada';
   if(r.request.choice==='refund'||r.request.choice==='credit'){
    const st=inventory?.releases.find(s=>s.reservation_id===r.reservation_id)?.state;
    return st==='liberada'?'Baja aprobada · plaza liberada':st==='ofrecida'?'Plaza ofrecida para reemplazo':st==='ocupada'?'Plaza ocupada por reemplazo':'Baja validada · revisar cupo';
   }
   return 'Decisión validada';
  }
  return REVIEW_LABELS[r.request.review_status]??r.request.review_status;
 };
 const exportCsv=()=>{
  const headers=['Participante','Paquete actual','Elección','Noches solicitadas','Revisión','Fuente','Nota participante/admin','Pagado Reybaud ARS','Directo efectuado ARS','Reintegros previos ARS','Importe restante estimado ARS','Conciliación','Jersey','Talle solicitado','Entrega','Deducción ejecutada ARS','Devolución registrada ARS','Obligación existente','Crédito disponible ARS','Crédito usado ARS','Actualizado'];
  headers.push('Estado propuesta','Autorizado vigente ARS','Jersey propuesto ARS','Alertas financieras');
  const body=filtered.map(r=>{const p=settlements[r.reservation_id];return [r.participant,r.package,label(r),campaign?.options.find(o=>o.value===r.request?.choice)?.nights, r.request?REVIEW_LABELS[r.request.review_status]:'Sin respuesta',r.request?.source,r.request?.note,p?.totals.paid_ars??r.financial.paid_reybaud,p?.totals.direct_paid_ars??r.financial.direct_paid,p?.totals.returned_ars??r.financial.previous_refunds,p?.totals.net_ars??'',p?.totals.blocked?'A conciliar':'Revisar',r.request?.jersey_requested===true?'Solicita':r.request?.jersey_requested===false?'No':'Sin elección',r.request?.jersey_size,r.request?.delivery,0,p?.totals.returned_ars??r.financial.previous_refunds,r.financial.refund_obligation?.status,0,0,r.request?.updated_at,p?settlementState(p):'Consultando',p&&!p.stale&&!p.totals.blocked?p.proposal?.authorized_amount:'',p&&!p.stale&&!p.totals.blocked?p.proposal?.jersey_amount:'',p?.totals.alerts.join(' | ')]});
  const blob=new Blob(['\uFEFF'+[headers,...body].map(line=>line.map(csvCell).join(',')).join('\n')],{type:'text/csv;charset=utf-8;'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='reprogramacion-san-luis.csv';a.click();URL.revokeObjectURL(url);
 };
 const review=async(nextStatus?:string)=>{if(!row?.request||loading)return;setLoading(true);setError('');const {error:e}=await supabase.rpc('admin_review_rescheduling',{p_reservation_id:row.reservation_id,p_revision:row.request.revision,p_status:nextStatus??status,p_note:note.trim(),p_command_id:crypto.randomUUID()});if(e)setError(e.message);else {setNote('');await load()}setLoading(false)};
 if(!ctx?.available && !error)return null;
 return <>
  <Button variant="outline" size="sm" onClick={()=>setOpen(true)}><CalendarDays className="w-4 h-4 mr-2"/>Reprogramación San Luis</Button>
  <ReschedulingCommsPanel eventId={eventId} publicEnabled={!!campaign?.public_enabled}/>
  <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-w-6xl max-h-[92vh] overflow-y-auto min-w-0 [&>*]:min-w-0"><DialogHeader><DialogTitle>Reprogramación San Luis</DialogTitle><DialogDescription>5–9 noviembre 2026 · Solicitudes separadas de reservas y pagos.</DialogDescription></DialogHeader>
   <div className="flex flex-wrap gap-2"><Badge variant="outline">Público {campaign?.public_enabled?'habilitado':'desactivado'}</Badge><Badge variant="outline"><LockKeyhole className="w-3 h-3 mr-1"/>Operaciones financieras bloqueadas</Badge></div>
   <p className="text-sm text-muted-foreground">Antes de habilitar: costos/proveedores, habitaciones de 3 y 4 noches, talles/stock/entrega, conciliación, reemplazos y venta futura. Fechas actuales intactas: octubre 22–25; enero 17–24/01, a revisar contra 20–27/01.</p>
   <section className="space-y-3" aria-label="Resumen de decisiones de San Luis">
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
     {[
      {title:'Reservas vigentes',value:rows.length,detail:'Sin modificar cupos'},
      {title:'Encuestas respondidas',value:answered,detail:`${rows.length-answered} todavía sin respuesta`},
      {title:'Eligieron viajar',value:decisions[2].count,detail:'Sujetos a aprobación'},
      {title:'Devolución / crédito',value:decisions[3].count+decisions[4].count,detail:'Solicitudes, no pagos'},
     ].map(m=><div key={m.title} className="rounded-lg border border-border bg-card px-3 py-3 min-w-0"><p className="text-xs text-muted-foreground">{m.title}</p><p className="text-2xl font-semibold tabular-nums mt-1">{m.value}</p><p className="text-xs text-muted-foreground mt-1">{m.detail}</p></div>)}
    </div>
    <div className="rounded-lg border border-border bg-muted/20 px-3 py-3 space-y-2">
     <h3 className="text-sm font-medium">¿Qué eligieron los participantes?</h3>
     <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
      {campaign?.options.filter(o=>o.value.startsWith('attend_')).map(o=><span key={o.value}><span className="text-muted-foreground">{o.value==='attend_5_8'?'5–8 nov.':o.value==='attend_6_9'?'6–9 nov.':'5–9 nov.'}:</span> <strong className="tabular-nums">{rows.filter(r=>r.request?.choice===o.value).length}</strong></span>)}
      <span><span className="text-muted-foreground">Devolución:</span> <strong>{decisions[3].count}</strong></span>
      <span><span className="text-muted-foreground">Crédito:</span> <strong>{decisions[4].count}</strong></span>
      <span><span className="text-muted-foreground">Ayuda:</span> <strong>{decisions[5].count}</strong></span>
     </div>
     <p className="text-xs text-muted-foreground">Estas son las respuestas de la encuesta, no decisiones administrativas ejecutadas. Un pedido de devolución no libera automáticamente la plaza.</p>
    </div>
   </section>
   <section className="space-y-3" aria-label="Respuestas y gestión de participantes">
    <div className="flex items-start justify-between gap-3 flex-wrap">
     <div><h3 className="text-base font-semibold">Respuestas de participantes</h3><p className="text-xs text-muted-foreground">Primero elegí qué tipo de respuesta querés revisar. Los que ya respondieron aparecen arriba.</p></div>
     <div className="flex gap-2"><Button size="sm" variant="outline" aria-label="Actualizar reprogramación" disabled={loading} onClick={load}><RefreshCw className="w-4 h-4 mr-1"/>Actualizar</Button><Button size="sm" variant="outline" onClick={exportCsv}><Download className="w-4 h-4 mr-1"/>CSV</Button></div>
    </div>
    <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por decisión de la encuesta">
     {decisions.map(d=><Button key={d.value} size="sm" variant={filter===d.value?'default':'outline'} aria-pressed={filter===d.value} onClick={()=>{setFilter(d.value);setDateFilter('all')}} className="h-auto min-h-9 whitespace-normal text-left">{d.label} <span className="ml-1 font-semibold tabular-nums">{d.count}</span></Button>)}
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2">
     <Input aria-label="Buscar participante reprogramación" placeholder="Buscar participante por nombre" value={search} onChange={e=>setSearch(e.target.value)}/>
     {filter==='attend' && <Select value={dateFilter} onValueChange={setDateFilter}><SelectTrigger aria-label="Filtrar modalidad de viaje"><SelectValue placeholder="Todas las fechas"/></SelectTrigger><SelectContent><SelectItem value="all">Todas las fechas</SelectItem>{campaign?.options.filter(o=>o.value.startsWith('attend_')).map(o=><SelectItem key={o.value} value={o.value}>{o.label.replace(/^Asisto /,'')}</SelectItem>)}</SelectContent></Select>}
     <Select value={reviewFilter} onValueChange={setReviewFilter}><SelectTrigger aria-label="Filtro de revisión administrativa"><SelectValue placeholder="Todas las revisiones"/></SelectTrigger><SelectContent><SelectItem value="all">Todas las revisiones</SelectItem>{Object.entries(REVIEW_LABELS).map(([v,l])=><SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select>
     <Select value={jerseyFilter} onValueChange={setJerseyFilter}><SelectTrigger aria-label="Filtro de jersey"><SelectValue placeholder="Todos los jerseys"/></SelectTrigger><SelectContent><SelectItem value="all">Todos los jerseys</SelectItem><SelectItem value="yes">Pidió jersey</SelectItem><SelectItem value="no">No pidió jersey</SelectItem><SelectItem value="unanswered">Jersey sin definir / no corresponde</SelectItem></SelectContent></Select>
    </div>
    <div className="flex items-center justify-between gap-2 text-sm"><p role="status" className="text-muted-foreground">Mostrando <strong className="text-foreground">{filtered.length}</strong> de {rows.length} participantes{settlementFilter!=='all'?' · Hay un filtro financiero activo':''}</p>{hasFilters && <Button variant="link" size="sm" onClick={resetFilters}>Limpiar filtros</Button>}</div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <div className="overflow-x-auto rounded-lg border border-border">
     <table className="w-full text-sm">
      <thead className="bg-muted/40"><tr>{['Participante / paquete','Qué eligió','Revisión administrativa','Jersey','Finanzas (si corresponde)',''].map((h,i)=><th key={i} className="text-left px-3 py-3 font-medium">{h}</th>)}</tr></thead>
      <tbody>
       {displayed.map(r=>{
        const fin=settlements[r.reservation_id];const choice=r.request?.choice;
        const financial=choice==='refund'||choice==='credit';
        return <tr key={r.reservation_id} className="border-t border-border align-top hover:bg-muted/25">
         <td className="px-3 py-3 min-w-44"><p className="font-medium">{r.participant}</p><p className="text-xs text-muted-foreground mt-1">{r.package}</p></td>
         <td className="px-3 py-3 min-w-44"><p className={r.request?'font-medium':'text-muted-foreground'}>{label(r)}</p>{choice?.startsWith('attend_')&&<p className="text-xs text-muted-foreground mt-1">{campaign?.options.find(o=>o.value===choice)?.nights} noches</p>}{r.request&&<p className="text-xs text-muted-foreground mt-1">Respondió {new Date(r.request.updated_at).toLocaleDateString('es-AR')}</p>}</td>
         <td className="px-3 py-3 min-w-36"><Badge variant="outline">{resolutionLabel(r)}</Badge></td>
         <td className="px-3 py-3">{financial?r.request?.jersey_requested===true?<span>{r.request.jersey_size||'Talle pendiente'} · {r.request.delivery||'Entrega pendiente'}</span>:r.request?.jersey_requested===false?'No solicita':'Sin elegir':'No corresponde'}</td>
         <td className="px-3 py-3 min-w-40">{financial?<><p>{fin?.totals.blocked||r.financial.requires_reconciliation?'A conciliar':fin?`${formatPrice(fin.totals.net_ars)} estimados`:'Consultando saldo…'}</p><p className="text-xs text-muted-foreground mt-1">{choice==='refund'?'Devolución solicitada; no ejecutada':'Crédito solicitado; no emitido'}</p></>:<span className="text-muted-foreground">No corresponde</span>}</td>
         <td className="px-3 py-3"><Button size="sm" variant="outline" onClick={()=>{setSelected(r.reservation_id);setStatus(r.request?.review_status??'en_revision');setNote('')}}>Gestionar</Button></td>
        </tr>;
       })}
       {filtered.length===0 && <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">No hay participantes con estos filtros. <Button variant="link" onClick={resetFilters}>Ver todos</Button></td></tr>}
      </tbody>
     </table>
    </div>
   </section>
   <details className="rounded-lg border border-border p-3 text-sm space-y-3">
    <summary className="cursor-pointer font-medium">Cupos, habitaciones y reventa <span className="text-muted-foreground font-normal">· control administrativo</span></summary>
    <ReschedulingSeatSummary inventory={inventory}/>
    <p className="text-xs text-muted-foreground">Se mantiene el mismo inventario original. Las solicitudes de devolución o crédito no generan automáticamente cupos vendibles.</p>
   </details>
   <details className="rounded-lg border border-border p-3 text-sm space-y-3">
    <summary className="cursor-pointer font-medium">Conciliación y devoluciones <span className="text-muted-foreground font-normal">· {Object.values(settlements).filter(p=>p.totals.blocked).length} casos a conciliar</span></summary>
    <p className="text-xs text-muted-foreground mt-2">Información contable para revisar después de la elección. No representa pagos o créditos ejecutados.</p>
    <div className="flex flex-wrap gap-3 py-2"><span>A conciliar: {Object.values(settlements).filter(p=>p.totals.blocked).length}</span><span>Validadas sin ejecutar: {Object.values(settlements).filter(p=>p.proposal?.state==='validated'&&!p.stale&&!p.totals.blocked).length}</span><span>Desactualizadas: {Object.values(settlements).filter(p=>p.stale).length}</span><span>Devoluciones realmente registradas: {formatPrice(Object.values(settlements).reduce((n,p)=>n+p.totals.returned_ars,0))}</span></div>
    <Select value={settlementFilter} onValueChange={setSettlementFilter}><SelectTrigger className="w-full sm:w-80" aria-label="Filtro de propuesta financiera"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">Sin filtro financiero</SelectItem><SelectItem value="reconcile">A conciliar (bloqueadas)</SelectItem><SelectItem value="validated">Validadas sin ejecutar</SelectItem><SelectItem value="stale">Propuestas desactualizadas</SelectItem><SelectItem value="returned">Con devolución real registrada</SelectItem><SelectItem value="estimated">Propuesta estimada guardada</SelectItem></SelectContent></Select>
    <div className="text-xs space-y-1">{filtered.filter(r=>settlements[r.reservation_id]?.proposal).map(r=><p key={r.reservation_id}>{r.participant} · {settlementState(settlements[r.reservation_id])}</p>)}</div>
   </details>
   <details className="text-sm"><summary className="cursor-pointer">Transferencias previas preservadas ({ctx?.transfers?.length ?? 0})</summary><p className="my-2 text-muted-foreground">Sin emparejamiento automático. Revisar paquete y fechas/noches de ambas partes. Pagos directos supervisados, con comprobante; caja Reybaud $0.</p>{ctx?.transfers?.map(t=><p key={t.id} className="text-xs py-1">{t.status} · reserva original {t.original_reservation_id.slice(0,8)} · reemplazo {t.replacement_reservation_id?.slice(0,8) ?? 'pendiente'}</p>)}</details>
   <div className="flex flex-wrap gap-2">{['Emitir crédito','Aplicar / revertir crédito','Ejecutar devolución','Deducir jersey','Habilitar reventa','Habilitar público'].map(l=><Button key={l} disabled variant="outline"><LockKeyhole className="w-4 h-4 mr-2"/>{l}</Button>)}</div>
  </DialogContent></Dialog>
  <Dialog open={!!row} onOpenChange={o=>{if(!o){setSelected(undefined);setNote('');setError('')}}}>
   <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto min-w-0">
    <DialogHeader>
     <DialogTitle>Resolver reprogramación</DialogTitle>
     <DialogDescription>Primero aprobá la decisión. Los detalles contables y del cupo se consultan abajo.</DialogDescription>
    </DialogHeader>
    {row && campaign && <>
     <section className="rounded-lg border border-border p-4 space-y-3" aria-label="Solicitud del participante">
      <div><p className="font-semibold text-lg">{row.participant}</p><p className="text-sm text-muted-foreground">{row.package}</p></div>
      <div className="flex flex-wrap gap-2 items-center">
       <Badge variant="outline">{resolutionLabel(row)}</Badge>
       {row.request?.choice==='refund' && <Badge variant="outline">Devolución solicitada</Badge>}
       {row.request?.choice==='credit' && <Badge variant="outline">Crédito solicitado</Badge>}
       {row.request?.choice.startsWith('attend_') && <Badge variant="outline">Viaje en noviembre</Badge>}
      </div>
      <div className="rounded-md bg-muted/30 p-3 space-y-1">
       <p className="font-medium">{label(row)}</p>
       {row.request?.choice.startsWith('attend_') && <p className="text-sm text-muted-foreground">{campaign.options.find(o=>o.value===row.request?.choice)?.nights} noches · se conserva su paquete original</p>}
       {row.request?.choice==='refund' && <p className="text-sm text-muted-foreground">Solicita la devolución del dinero correspondiente. No se realizó ningún reintegro al responder la encuesta.</p>}
       {row.request?.choice==='credit' && <p className="text-sm text-muted-foreground">Solicita trasladar el valor abonado como crédito para otro Training Camp.</p>}
       {row.request?.choice==='help' && <p className="text-sm text-muted-foreground">Antes de elegir, necesita comunicarse con el equipo.</p>}
       {!row.request && <p className="text-sm text-muted-foreground">Aún no completó la encuesta. Podés registrar lo que comunicó desde «Registrar decisión».</p>}
      </div>
      {row.request && <p className="text-xs text-muted-foreground">Registrado el {new Date(row.request.updated_at).toLocaleString('es-AR')} · {row.request.source || 'Desde la encuesta'}{row.request.note ? ` · Nota: ${row.request.note}` : ''}</p>}
     </section>
     {row.request && <section className="rounded-lg border border-border p-4 space-y-3" aria-label="Resolución administrativa">
      <h3 className="font-semibold">Resolución administrativa</h3>
      {row.request.review_status==='validada' ? <>
       <p className="text-sm font-medium text-foreground">Decisión aprobada</p>
       {row.request.choice.startsWith('attend_') && <p className="text-sm">Asistencia confirmada para las fechas elegidas. Su plaza original se conserva y no se pone a la venta.</p>}
       {(row.request.choice==='refund'||row.request.choice==='credit') && <p className="text-sm">
        {inventory?.releases.find(s=>s.reservation_id===row.reservation_id)?.state==='liberada'?'Plaza liberada y registrada en inventario.': 'Revisá el estado del cupo antes de ofrecerlo.'} No se realizó ninguna devolución ni se emitió un crédito.
       </p>}
      </> : <>
       <p className="text-sm text-muted-foreground">
        {row.request.choice==='refund'?'Al aprobar esta baja, el sistema libera automáticamente su plaza de alojamiento. El reintegro se tramita después.':
         row.request.choice==='credit'?'Al aprobar esta baja, se libera su plaza. El crédito se calcula y acredita después, por separado.':
         row.request.choice.startsWith('attend_')?'Al confirmar, se registra su asistencia a la modalidad elegida. No se libera ningún cupo.':
         'Podés dejar la solicitud pendiente y contactar al participante antes de cerrar la decisión.'}
       </p>
       <div className="space-y-2"><label className="text-sm font-medium" htmlFor="sanluis-review-note">Constancia de la revisión</label>
        <Textarea id="sanluis-review-note" aria-label="Constancia administrativa" placeholder="Ej.: Confirmé la elección del participante y la baja de su plaza por WhatsApp." value={note} onChange={e=>setNote(e.target.value)} maxLength={2000}/>
       </div>
       <div className="flex flex-wrap gap-2">
        {row.request.choice!=='help' && <Button disabled={loading||note.trim().length<10} onClick={()=>void review('validada')}>
         {loading?'Guardando…': row.request.choice==='refund'?'Aprobar baja y liberar plaza':row.request.choice==='credit'?'Aprobar crédito solicitado y liberar plaza':'Confirmar asistencia a noviembre'}
        </Button>}
        <Button variant="outline" disabled={loading||note.trim().length<10} onClick={()=>void review('requiere_contacto')}>Necesita contacto</Button>
        <Button variant="outline" disabled={loading||note.trim().length<10} onClick={()=>void review('en_revision')}>Dejar en revisión</Button>
       </div>
       <p className="text-xs text-muted-foreground">Aprobar es una decisión administrativa. No transfiere dinero, no emite crédito y no publica automáticamente la plaza en venta. Cada cambio queda registrado.</p>
      </>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
     </section>}
     <details className="rounded-lg border border-border p-3" open={!row.request}>
      <summary className="cursor-pointer font-medium">{row.request?'Modificar una respuesta registrada':'Registrar una decisión comunicada por WhatsApp o personalmente'}</summary>
      <div className="mt-4"><ReschedulingForm key={row.reservation_id} campaign={campaign} row={row} admin onSaved={load}/></div>
     </details>
     {row.request && (row.request.choice==='refund'||row.request.choice==='credit') && <>
      <details className="rounded-lg border border-border p-3">
       <summary className="cursor-pointer font-medium">Cupo liberado y reventa</summary>
       <p className="mt-3 text-xs text-muted-foreground">La aprobación libera el cupo en inventario, pero venderlo requiere habilitar la reventa y verificar precio y disponibilidad. No se amplían los cupos originales.</p>
       <ReschedulingSeatActions key={row.reservation_id} reservationId={row.reservation_id} request={row.request} inventory={inventory} onSaved={()=>void load()}/>
      </details>
      <details className="rounded-lg border border-border p-3">
       <summary className="cursor-pointer font-medium">Conciliación, reintegros y crédito</summary>
       <p className="mt-3 text-xs text-muted-foreground">Revisión contable independiente. Aprobar la baja no ejecuta devoluciones ni emite créditos.</p>
       <ReschedulingSettlementPanel key={row.reservation_id} reservationId={row.reservation_id} requestRevision={row.request?.revision} onSaved={()=>void load()}/>
      </details>
     </>}
     <details className="rounded-lg border border-border p-3">
      <summary className="cursor-pointer font-medium flex items-center gap-2"><History className="w-4 h-4"/>Historial de decisiones ({history.length})</summary>
      {history.map(h=><div key={h.revision} className="border-t border-border py-2 text-sm"><p>Versión {h.revision} · {h.origin} · {new Date(h.created_at).toLocaleString('es-AR')}</p><p className="text-xs text-muted-foreground">Elección: {String((h.after_data as {choice?:string})?.choice??'')} · Revisión: {String((h.after_data as {review_status?:string})?.review_status??'')}</p></div>)}
     </details>
     {error && !row.request && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </>}
   </DialogContent>
  </Dialog>
 </>;
}
