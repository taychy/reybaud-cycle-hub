import { useEffect,useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { CalendarDays } from 'lucide-react';
import { reschedulingContext, type ReschedulingContext } from '@/lib/rescheduling';
export default function ReschedulingEntry({eventId,reservationId,token,onContext}:{eventId:string;reservationId:string;token?:string;onContext?:(context:ReschedulingContext|null)=>void}) {
 const [enabled,setEnabled]=useState(false);
 useEffect(()=>{let active=true;setEnabled(false);onContext?.(null);void reschedulingContext(eventId,reservationId,token).then(ctx=>{if(active){onContext?.(ctx);setEnabled(!!ctx.available && ((!!ctx.campaign?.public_enabled && (ctx.reservations?.length ?? 0)>0) || !!ctx.verification_required))}}).catch(()=>{if(active){setEnabled(false);onContext?.(null)}});return()=>{active=false}},[eventId,reservationId,token,onContext]);
 if(!enabled)return null;
 const params=new URLSearchParams({reserva:reservationId});if(token)params.set('token',token);
 return <Button asChild variant="outline" className="w-full"><Link to={`/reprogramacion/${eventId}?${params}`}><CalendarDays className="w-4 h-4 mr-2"/>Elegir opción de reprogramación</Link></Button>;
}
