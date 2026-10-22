import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Copy, Link2, Users } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { summarizeCrossSell, type CrossSellRow } from '@/lib/eventBookingOpening';

/** Solo lectura: segmenta titulares del viaje de origen. No envía correos ni crea reservas. */
export default function BookingCrossSellAudience({eventId,sourceEventId}:{eventId:string;sourceEventId:string}) {
  const {toast}=useToast();
  const [rows,setRows]=useState<CrossSellRow[]|null>(null);
  const [error,setError]=useState('');
  useEffect(()=>{let active=true;setRows(null);setError('');
    void supabase.rpc('admin_booking_crosssell_audience',{p_event_id:eventId,p_source_event_id:sourceEventId}).then(({data,error:e})=>{
      if(!active)return; if(e){setError(e.message);return;} setRows((data||[]) as CrossSellRow[]);
    });return()=>{active=false};},[eventId,sourceEventId]);
  if(error)return <p role="alert" className="text-sm text-destructive">{error}</p>;
  if(!rows)return <p className="text-sm text-muted-foreground">Cargando titulares…</p>;
  const s=summarizeCrossSell(rows);
  const copy=async()=>{await navigator.clipboard.writeText(s.inviteEmails.join(', '));toast({title:`${s.inviteEmails.length} correos copiados · no se envió nada`});};
  const copyLink=async(rid:string)=>{const {data,error:e}=await supabase.rpc('admin_issue_crosssell_link',{p_event_id:eventId,p_source_reservation_id:rid});
    if(e){toast({title:'No se pudo generar el enlace',description:e.message,variant:'destructive'});return;}
    const tok=(data as {token:string}).token; await navigator.clipboard.writeText(`${window.location.origin}/eventos/${eventId}?acceso=${tok}`);
    toast({title:'Enlace personal copiado · válido 30 días · no se envió nada',description:'Genera uno nuevo e invalida el anterior.'});};
  return <section aria-label="Invitación a titulares" className="space-y-3">
    <div className="flex items-center gap-2"><Users className="h-5 w-5 text-primary"/><h3 className="font-heading text-lg">Invitación a titulares del viaje Alpes</h3></div>
    <p className="text-sm text-muted-foreground">{s.total} titulares activos · {s.excludedRequested} ya pidieron Maratona · {s.excludedOptOut} con baja de mailing · <strong className="text-foreground">{s.invite} a invitar</strong> ({s.inviteEligibleNow} con tarifa especial habilitada por reserva activa).</p>
    <ul className="divide-y divide-border text-sm">{rows.map(r=><li key={r.source_reservation_id} className="flex flex-wrap items-center gap-2 py-2">
      <span className="font-medium">{r.nombre||'Sin nombre'}</span>
      {r.roommate&&<span className="text-muted-foreground">· comparte con {r.roommate}</span>}
      {r.already_requested&&<Badge variant="secondary">Ya solicitó</Badge>}
      {r.already_reserved&&<Badge variant="secondary">Ya reservó</Badge>}
      {r.marketing_opt_out&&<Badge variant="outline">Baja de mailing</Badge>}
      {r.invite&&<Badge>Invitar · tarifa especial</Badge>}
      {!r.already_reserved&&<Button variant="ghost" size="sm" className="ml-auto" onClick={()=>copyLink(r.source_reservation_id)}><Link2 className="mr-1 h-4 w-4"/>Copiar enlace de reserva rápida</Button>}
    </li>)}</ul>
    <Button variant="outline" size="sm" disabled={!s.inviteEmails.length} onClick={copy}><Copy className="mr-2 h-4 w-4"/>Copiar correos a invitar</Button>
  </section>;
}
