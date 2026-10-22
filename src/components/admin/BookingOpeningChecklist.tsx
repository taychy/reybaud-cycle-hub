import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { Save, ShieldCheck } from 'lucide-react';
import BookingCrossSellAudience from '@/components/admin/BookingCrossSellAudience';
import type { BookingOpening } from '@/lib/eventBookingOpening';

export default function BookingOpeningChecklist({eventId}:{eventId:string}) {
  const {toast}=useToast();
  const [status,setStatus]=useState<BookingOpening|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [form,setForm]=useState({hotel_capacity:'',race_capacity:'',hotel_evidence:'',race_evidence:'',payment_url:'',payment_verified:false,alps_event_id:'',alps_bike_package_ids:[] as string[]});
  const [trips,setTrips]=useState<{id:string;title:string}[]>([]);
  const [bikePackages,setBikePackages]=useState<{id:string;nombre:string}[]>([]);
  useEffect(()=>{let active=true;void Promise.all([
    supabase.from('event_booking_openings').select('*').eq('event_id',eventId).maybeSingle(),
    supabase.rpc('event_booking_opening_status',{p_event_id:eventId}),
    supabase.from('events').select('id,title').in('type',['viaje','camp']).neq('id',eventId),
  ]).then(([config,result,events])=>{
    if(!active)return;
    if(config.error||result.error){setError(config.error?.message||result.error?.message||'No se pudo consultar la apertura');return;}
    setStatus(result.data as unknown as BookingOpening);
    setTrips(events.data||[]);
    if(config.data){const c=config.data;setForm({hotel_capacity:c.hotel_capacity?.toString()||'',race_capacity:c.race_capacity?.toString()||'',hotel_evidence:c.hotel_evidence||'',race_evidence:c.race_evidence||'',payment_url:c.payment_url||'',payment_verified:c.payment_verified,alps_event_id:c.alps_event_id||'',alps_bike_package_ids:c.alps_bike_package_ids});}
  });return()=>{active=false};},[eventId]);
  useEffect(()=>{let active=true;if(!form.alps_event_id){setBikePackages([]);return;}
    void supabase.from('event_packages').select('id,nombre').eq('event_id',form.alps_event_id).then(({data})=>{if(active)setBikePackages(data||[])});
    return()=>{active=false};
  },[form.alps_event_id]);
  const save=async()=>{setBusy(true);setError('');try{
    const {data,error:failure}=await supabase.rpc('admin_save_booking_opening',{p_event_id:eventId,p_input:form,p_enable:false});
    if(failure)throw failure;setStatus(data as unknown as BookingOpening);toast({title:'Preparación guardada · reservas cerradas'});
  }catch(e){setError(e instanceof Error?e.message:(e as {message?:string})?.message||'No se pudo guardar');}finally{setBusy(false)}};
  return <section aria-label="Apertura segura" className="space-y-5 border-y border-border py-5">
    <div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary"/><h2 className="font-heading text-xl">Apertura segura · reservas cerradas</h2></div>
    <p className="text-sm text-muted-foreground">Seña prevista: EUR 500 + ocho cuotas. Habitación doble. Las solicitudes actuales no confirman plazas ni generan cobros.</p>
    <div className="grid gap-4 sm:grid-cols-2">
      {([['hotel_capacity','Plazas de hotel confirmadas'],['race_capacity','Inscripciones de carrera confirmadas']] as const).map(([key,label])=><div key={key}><Label htmlFor={key}>{label}</Label><Input id={key} type="number" min={0} max={10000} value={form[key]} onChange={e=>setForm({...form,[key]:e.target.value})}/></div>)}
      {([['hotel_evidence','Respaldo de confirmación del hotel'],['race_evidence','Respaldo de inscripción a carrera'],['payment_url','Enlace propio de pago de Maratona (HTTPS)']] as const).map(([key,label])=><div key={key} className={key==='payment_url'?'sm:col-span-2':''}><Label htmlFor={key}>{label}</Label><Input id={key} value={form[key]} onChange={e=>setForm({...form,[key]:e.target.value})}/></div>)}
    </div>
    <p className="text-sm text-muted-foreground">Pool global: {status?.capacity||0} plazas. Se usa el menor cupo entre hotel y carrera; no se multiplica por las cuatro tarifas.</p>
    <label className="flex items-center gap-2 text-sm"><Checkbox checked={form.payment_verified} onCheckedChange={v=>setForm({...form,payment_verified:v===true})}/>Verifiqué el enlace propio y la seña en EUR (sin Mercado Pago en EUR)</label>
    <div><Label htmlFor="alps-trip">Viaje cuya reserva permite la tarifa Alpes</Label><select id="alps-trip" className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.alps_event_id} onChange={e=>setForm({...form,alps_event_id:e.target.value,alps_bike_package_ids:[]})}><option value="">Sin verificar</option>{trips.map(t=><option key={t.id} value={t.id}>{t.title}</option>)}</select></div>
    {bikePackages.length>0&&<fieldset className="space-y-2"><legend className="mb-2 text-sm">Paquetes de Alpes que incluyen alquiler de bicicleta confirmado</legend>{bikePackages.map(p=><label key={p.id} className="flex items-center gap-2 text-sm"><Checkbox checked={form.alps_bike_package_ids.includes(p.id)} onCheckedChange={v=>setForm({...form,alps_bike_package_ids:v===true?[...form.alps_bike_package_ids,p.id]:form.alps_bike_package_ids.filter(id=>id!==p.id)})}/>{p.nombre}</label>)}</fieldset>}
    {form.alps_event_id&&<BookingCrossSellAudience eventId={eventId} sourceEventId={form.alps_event_id}/>}
    {form.alps_event_id&&<CrossSellMailingPreview eventId={eventId}/>}
    <ul className="space-y-2 text-sm text-muted-foreground">{status?.blockers.map(b=><li key={b}>• {b}</li>)}</ul>
    {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
    <Button variant="outline" disabled={busy||!status} onClick={save}><Save className="mr-2 h-4 w-4"/>{busy?'Guardando…':'Guardar preparación sin abrir reservas'}</Button>
    <p className="text-sm text-muted-foreground">La activación sigue bloqueada hasta verificar el recorrido completo y autorizar su publicación.</p>
  </section>;
}