import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { sanLuisPaymentPreview } from '@/lib/sanLuisCommercial';
import { formatPrice } from '@/lib/currency';

export default function SanLuisCommercialStatus({ eventId, packageId, price }: { eventId: string; packageId: string; price: number }) {
 const [remaining, setRemaining] = useState<number | null>(null);
 const [failed, setFailed] = useState(false);
 useEffect(() => {
  let alive=true;
  const load=async()=>{
   const {data,error}=await supabase.rpc('get_trip_request_capacity',{p_event_id:eventId,p_package_id:packageId});
   if(!alive) return;
   const r=data as {ok?:boolean;remaining?:number}|null;
   setRemaining(!error&&r?.ok===true&&typeof r.remaining==='number'?r.remaining:null);
   setFailed(!!error||r?.ok!==true);
  };
  setRemaining(null); setFailed(false); void load();
  const timer=window.setInterval(()=>void load(),60000);
  return()=>{alive=false;window.clearInterval(timer);};
 },[eventId,packageId]);
 const preview=sanLuisPaymentPreview(price,new Date().toISOString().slice(0,10));
 return <div aria-label="Capacidad y plan previsto" className="border-t border-border pt-4 space-y-3 text-sm">
  <p className="font-medium">{remaining===null ? (failed?'Disponibilidad a consultar con administración':'Consultando capacidad…') : `${remaining} plazas dentro del límite para esta modalidad`}</p>
  <p className="text-xs text-muted-foreground">Capacidad remanente, no disponibilidad hotelera confirmada. Requiere validación manual; la solicitud no retiene plazas.</p>
  <p className="font-medium">Plan acordado · todavía sin cobro</p>
  <ul className="space-y-1 text-muted-foreground">{preview.installments.map(p=><li key={p.label}>{p.percent}% · {p.label}: {formatPrice(p.amount,'ARS')} · {p.dueDate===null?'al reservar':p.dueDate==='2026-12-15'?'15/12/2026':'10/01/2027'}</li>)}</ul>
  <p className="text-xs text-muted-foreground">Las cuotas vencidas serán exigibles al reservar. Noche extra 17/01 aparte, a cotizar. El precio y las condiciones finales deberán aprobarse y aceptarse antes de pagar.</p>
 </div>;
}
