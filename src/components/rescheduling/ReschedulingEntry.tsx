import { useEffect,useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { CalendarDays } from 'lucide-react';
import { reschedulingContext } from '@/lib/rescheduling';
export default function ReschedulingEntry({eventId,reservationId,token}:{eventId:string;reservationId:string;token?:string}) {
 const [enabled,setEnabled]=useState(false);
 useEffect(()=>{let active=true;void reschedulingContext(eventId,reservationId,token).then(ctx=>{if(active)setEnabled(!!ctx.campaign?.public_enabled && (ctx.reservations?.length ?? 0)>0)}).catch(()=>{if(active)setEnabled(false)});return()=>{active=false}},[eventId,reservationId,token]);
 if(!enabled)return null;
 const params=new URLSearchParams({reserva:reservationId});if(token)params.set('token',token);
 return <Button asChild variant="outline" className="w-full"><Link to={`/reprogramacion/${eventId}?${params}`}><CalendarDays className="w-4 h-4 mr-2"/>Elegir opción de reprogramación</Link></Button>;
}
