import { useCallback,useEffect,useState } from 'react';
import { useParams,useSearchParams,useNavigate } from 'react-router-dom';
import { CalendarDays,Loader2,MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { reschedulingContext,type ReschedulingContext } from '@/lib/rescheduling';
import { buildWhatsAppUrl } from '@/lib/contactInfo';
import { getSafeReturnTo } from '@/lib/pendingOtp';
import ReschedulingForm from '@/components/rescheduling/ReschedulingForm';
import logo from '@/assets/logo.png';
export default function EventRescheduling() {
 const {eventId=''}=useParams();const [params]=useSearchParams();const navigate=useNavigate();const [ctx,setCtx]=useState<ReschedulingContext>();const [error,setError]=useState('');
 const token=params.get('token') ?? undefined;const reservationId=params.get('reserva') ?? undefined;
 const load=useCallback(async()=>{try{setCtx(await reschedulingContext(eventId,reservationId,token));setError('')}catch{setError('No pudimos abrir la solicitud. Consultanos con tu enlace personal.')}},[eventId,reservationId,token]);
 useEffect(()=>{void load()},[load]);
 const login=()=>{const target=getSafeReturnTo(window.location.pathname+window.location.search);navigate(target?`/?returnTo=${encodeURIComponent(target)}`:'/')};
 return <main className="min-h-screen bg-background text-foreground px-4 py-8"><div className="max-w-lg mx-auto space-y-6">
  <header className="flex items-center gap-3"><img src={logo} alt="Reybaud" className="w-14 h-14 object-contain"/><div><h1 className="text-2xl font-heading uppercase">Training Camp San Luis</h1><p className="text-sm text-muted-foreground">Reprogramación organizada por Reybaud</p></div></header>
  {!ctx && !error && <Loader2 className="w-6 h-6 animate-spin"/>}
  {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  {ctx && !ctx.available && <section className="border-y border-border py-6 space-y-3"><h2 className="text-lg font-heading">En revisión administrativa</h2><p className="text-sm text-muted-foreground">El formulario todavía no está habilitado. Tu reserva y tus pagos se mantienen sin cambios.</p></section>}
  {ctx?.auth_required && <section className="space-y-3"><p className="text-sm">Ingresá con Google o el código enviado al email de tu reserva para confirmar tu identidad, o usá tu enlace personal.</p><Button onClick={login}>Confirmar mi identidad</Button></section>}
  {ctx?.available && ctx.campaign && <>
   <p className="flex gap-2 items-center text-primary"><CalendarDays className="w-5 h-5"/>5 al 9 de noviembre de 2026</p>
   {ctx.admin && <p className="text-sm text-primary">Vista administrativa · público desactivado. El registro en nombre del participante requiere fuente y constancia real.</p>}
   {ctx.reservations?.length===0 && <p className="text-sm">No hay una reserva vigente disponible para este acceso. Consultanos con tu enlace personal.</p>}
   {ctx.reservations?.map(row=><ReschedulingForm key={row.reservation_id} campaign={ctx.campaign as NonNullable<ReschedulingContext['campaign']>} row={row} admin={ctx.admin} token={token} onSaved={load}/>)}
  </>}
  <Button asChild variant="outline" className="w-full"><a href={buildWhatsAppUrl('Hola, quiero consultar por la reprogramación del Training Camp San Luis.')} target="_blank" rel="noopener noreferrer"><MessageCircle className="w-4 h-4 mr-2"/>Consultar a la escuela</a></Button>
 </div></main>;
}
