import { useCallback,useEffect,useState } from 'react';
import { useParams,useSearchParams,useNavigate } from 'react-router-dom';
import { CalendarDays,Loader2,MessageCircle,ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { reschedulingContext,type ReschedulingContext } from '@/lib/rescheduling';
import { identityInputValid,readGuestSession,storeGuestSession } from '@/lib/reschedulingAccess';
import { buildWhatsAppUrl } from '@/lib/contactInfo';
import { getSafeReturnTo } from '@/lib/pendingOtp';
import ReschedulingForm from '@/components/rescheduling/ReschedulingForm';
import logo from '@/assets/logo.png';

type View = 'loading'|'closed'|'verify'|'login'|'form'|'error';
export default function EventRescheduling() {
 const {eventId=''}=useParams();const [params]=useSearchParams();const navigate=useNavigate();
 const token=params.get('token') ?? undefined;const reservationId=params.get('reserva') ?? undefined;
 const [ctx,setCtx]=useState<ReschedulingContext>();const [view,setView]=useState<View>('loading');const [access,setAccess]=useState<string>();const [otherSession,setOtherSession]=useState(false);
 const [dni,setDni]=useState('');const [first,setFirst]=useState('');const [last,setLast]=useState('');const [busy,setBusy]=useState(false);const [verifyError,setVerifyError]=useState('');
 const load=useCallback(async()=>{
  try{
   const {data:{session}}=await supabase.auth.getSession();
   if(session){const c=await reschedulingContext(eventId,reservationId);if(!c.available){setView('closed');return;}
    if((c.reservations?.length ?? 0)>0 || c.admin){setCtx(c);setAccess(undefined);setView('form');return;}
    setOtherSession(!!token);}
   if(!token || !reservationId){const c=await reschedulingContext(eventId);if(!c.available){setView('closed');return;}setView('login');return;}
   const guest=readGuestSession(reservationId);
   if(guest){const c=await reschedulingContext(eventId,reservationId,guest);if(!c.available){setView('closed');return;}if((c.reservations?.length ?? 0)>0){setCtx(c);setAccess(guest);setView('form');return;}}
   const c=await reschedulingContext(eventId,reservationId,token);
   setView(!c.available?'closed':'verify');
  }catch{setView('error')}
 },[eventId,reservationId,token]);
 useEffect(()=>{void load()},[load]);
 const verify=async()=>{
  if(!token||!reservationId)return;setBusy(true);setVerifyError('');
  const {data,error}=await supabase.rpc('verify_rescheduling_identity',{p_event_id:eventId,p_reservation_id:reservationId,p_token:token,p_dni:dni,p_first:first,p_last:last});
  setBusy(false);
  const res=data as {ok:boolean;reason?:string;session?:string;expires_at?:string}|null;
  if(error||!res){setVerifyError('No pudimos verificar los datos. Probá de nuevo o escribinos.');return;}
  if(!res.ok){setVerifyError(res.reason==='rate_limited'?'Hubo demasiados intentos. Esperá unos minutos o escribinos.':'No pudimos verificar los datos. Revisalos o escribinos.');return;}
  storeGuestSession(reservationId,res.session as string,res.expires_at as string);setDni('');void load();
 };
 const login=()=>{const target=getSafeReturnTo(window.location.pathname+window.location.search);navigate(target?`/?returnTo=${encodeURIComponent(target)}`:'/')};
 return <main className="min-h-screen bg-background text-foreground px-4 py-8"><div className="max-w-lg mx-auto space-y-6">
  <header className="flex items-center gap-3"><img src={logo} alt="Reybaud" className="w-14 h-14 object-contain"/><div><h1 className="text-2xl font-heading uppercase leading-tight">Training Camp San Luis</h1><p className="text-sm text-muted-foreground">Elegí cómo querés continuar</p></div></header>
  <p className="flex gap-2 items-center text-primary border-y border-border py-3"><CalendarDays className="w-5 h-5 shrink-0"/>Reprogramado del 5 al 9 de noviembre de 2026</p>
  {view==='loading' && <Loader2 className="w-6 h-6 animate-spin"/>}
  {view==='error' && <p role="alert" className="text-sm text-destructive">No pudimos abrir la encuesta. Probá de nuevo o escribinos.</p>}
  {view==='closed' && <section className="space-y-3"><h2 className="text-lg font-heading">En revisión administrativa</h2><p className="text-sm text-muted-foreground">La encuesta todavía no está habilitada. Tu reserva y tus pagos se mantienen sin cambios.</p></section>}
  {view==='verify' && <section className="space-y-4">
   <h2 className="text-lg font-heading flex gap-2 items-center"><ShieldCheck className="w-5 h-5"/>Confirmá que sos vos</h2>
   <p className="text-sm text-muted-foreground">{otherSession?'La sesión abierta en este dispositivo no corresponde a esta reserva. ':''}Ingresá los datos de la persona que reservó. No necesitás crear una cuenta.</p>
   <Label className="block space-y-1"><span>DNI</span><Input inputMode="numeric" autoComplete="off" value={dni} maxLength={12} onChange={e=>setDni(e.target.value)}/></Label>
   <Label className="block space-y-1"><span>Nombre</span><Input autoComplete="given-name" value={first} maxLength={100} onChange={e=>setFirst(e.target.value)}/></Label>
   <Label className="block space-y-1"><span>Apellido</span><Input autoComplete="family-name" value={last} maxLength={100} onChange={e=>setLast(e.target.value)}/></Label>
   <Button className="w-full" disabled={busy||!identityInputValid({dni,first,last})} onClick={verify}>{busy&&<Loader2 className="w-4 h-4 mr-2 animate-spin"/>}Continuar</Button>
   {verifyError && <p role="alert" className="text-sm text-destructive">{verifyError}</p>}
  </section>}
  {view==='login' && <section className="space-y-3"><p className="text-sm">Abrí el enlace personal que te enviamos, o ingresá con el código que te mandamos al email de tu reserva.</p><Button onClick={login}>Recibir código por email</Button></section>}
  {view==='form' && ctx?.campaign && <>
   {ctx.admin && <p className="text-sm text-primary">Vista administrativa. Registrar en nombre del participante requiere fuente y constancia real.</p>}
   {ctx.reservations?.length===0 && <p className="text-sm">No hay una reserva vigente disponible para este acceso.</p>}
   {ctx.reservations?.map(row=><ReschedulingForm key={row.reservation_id} campaign={ctx.campaign as NonNullable<ReschedulingContext['campaign']>} row={row} admin={ctx.admin} token={access} onSaved={load}/>)}
  </>}
  <Button asChild variant="outline" className="w-full"><a href={buildWhatsAppUrl('Hola, quiero consultar por la reprogramación del Training Camp San Luis.')} target="_blank" rel="noopener noreferrer"><MessageCircle className="w-4 h-4 mr-2"/>Necesito ayuda</a></Button>
 </div></main>;
}
