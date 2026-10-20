import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { CalendarDays, Loader2, MessageCircle, ShieldCheck, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { reschedulingContext, type ReschedulingContext } from '@/lib/rescheduling';
import { clearGuestSession, identityInputValid, readGuestSession, storeGuestSession } from '@/lib/reschedulingAccess';
import { buildWhatsAppUrl } from '@/lib/contactInfo';
import { getSafeReturnTo } from '@/lib/pendingOtp';
import ReschedulingForm from '@/components/rescheduling/ReschedulingForm';
import logo from '@/assets/logo.png';

type View = 'loading' | 'closed' | 'verify' | 'login' | 'form' | 'error' | 'admin';
export default function EventRescheduling() {
 const { eventId = '' } = useParams();
 const [params] = useSearchParams();
 const navigate = useNavigate();
 const token = params.get('token') ?? undefined;
 const reservationId = params.get('reserva') ?? undefined;
 const [ctx, setCtx] = useState<ReschedulingContext>();
 const [view, setView] = useState<View>('loading');
 const [access, setAccess] = useState<string>();
 const [signedIn, setSignedIn] = useState(false);
 const [otherSession, setOtherSession] = useState(false);
 const [verifyOpen, setVerifyOpen] = useState(false);
 const [dni, setDni] = useState('');
 const [first, setFirst] = useState('');
 const [last, setLast] = useState('');
 const [busy, setBusy] = useState(false);
 const [switchBusy, setSwitchBusy] = useState(false);
 const [verifyError, setVerifyError] = useState('');
 const [switchError, setSwitchError] = useState('');
 const [confirmSwitch, setConfirmSwitch] = useState(false);
 const [personalHelp, setPersonalHelp] = useState(false);
 const [saving, setSaving] = useState(false);
 const dirtyRows = useRef(new Set<string>());
 const busyRows = useRef(new Set<string>());
 const generation = useRef(0);
 const switching = useRef(false);
 const dirtyChange = useCallback((id: string, dirty: boolean) => {
  if (dirty) dirtyRows.current.add(id); else dirtyRows.current.delete(id);
 }, []);
 const busyChange = useCallback((id: string, pending: boolean) => {
  if (pending) busyRows.current.add(id); else busyRows.current.delete(id);
  setSaving(busyRows.current.size > 0);
 }, []);
 const clearView = useCallback(() => {
  generation.current += 1;
  setCtx(undefined); setAccess(undefined); setOtherSession(false); setVerifyOpen(false);
  setDni(''); setFirst(''); setLast(''); setVerifyError(''); setView('loading');
  dirtyRows.current.clear(); busyRows.current.clear(); setSaving(false);
 }, []);
 const load = useCallback(async () => {
  if (switching.current) return;
  const run = ++generation.current;
  const current = () => run === generation.current && !switching.current;
  const scoped = (c: ReschedulingContext) => ({ ...c, reservations: (c.reservations ?? []).filter(r => !reservationId || r.reservation_id === reservationId) });
  try {
   const { data: { user }, error } = await supabase.auth.getUser();
   if (!current()) return;
   // Missing session is expected on this public page; do not trust a cached user after an auth error.
   const authenticated = !!user && !error;
   setSignedIn(authenticated);
   const hasLink = token !== undefined || reservationId !== undefined;
   if (hasLink && (!token || !reservationId)) { setView('error'); return; }
   if (authenticated) {
    const c = scoped(await reschedulingContext(eventId, reservationId));
    if (!current()) return;
    if (!c.available) { setView('closed'); return; }
    if (c.reservations.length > 0) { setCtx(c); setAccess(undefined); setOtherSession(false); setView('form'); return; }
    if (!hasLink) { setView(c.admin_hint ? 'admin' : 'login'); return; }
   }
   if (!hasLink) {
    const c = await reschedulingContext(eventId);
    if (current()) setView(c.available ? 'login' : 'closed');
    return;
   }
   if (!reservationId || !token) return;
   const guest = readGuestSession(reservationId);
   if (guest) {
    const c = scoped(await reschedulingContext(eventId, reservationId, guest));
    if (!current()) return;
    if (!c.available) { setView('closed'); return; }
    if (c.reservations.length > 0) { setCtx(c); setAccess(guest); setView('form'); return; }
    clearGuestSession(reservationId);
   }
   const c = await reschedulingContext(eventId, reservationId, token);
   if (!current()) return;
   setOtherSession(authenticated); setView(c.available ? 'verify' : 'closed');
  } catch { if (current()) setView('error'); }
 }, [eventId, reservationId, token]);
 useEffect(() => {
  clearView(); setSwitchError(''); setPersonalHelp(false); void load();
  return () => { generation.current += 1; };
 }, [clearView, load]);
 useEffect(() => {
  const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
   if (event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED' || switching.current) return;
   // Invalidate immediately; auth calls must run outside the auth callback lock.
   clearView();
   if (reservationId) clearGuestSession(reservationId);
   queueMicrotask(() => { void load(); });
  });
  return () => subscription.unsubscribe();
 }, [clearView, load, reservationId]);
 const verify = async () => {
  if (!token || !reservationId || busy || switching.current) return;
  const run = generation.current;
  setBusy(true); setVerifyError('');
  try {
   const { data, error } = await supabase.rpc('verify_rescheduling_identity', { p_event_id: eventId, p_reservation_id: reservationId, p_token: token, p_dni: dni, p_first: first, p_last: last });
   if (run !== generation.current || switching.current) return;
   const res = data as { ok: boolean; reason?: string; session?: string; expires_at?: string } | null;
   if (error || !res?.ok || !res.session || !res.expires_at) {
    setVerifyError(res?.reason === 'rate_limited' ? 'Hubo demasiados intentos. Esperá unos minutos o escribinos.' : 'No pudimos verificar los datos. Revisalos o escribinos.'); return;
   }
   storeGuestSession(reservationId, res.session, res.expires_at);
   setDni(''); setFirst(''); setLast(''); void load();
  } catch { if (run === generation.current) setVerifyError('No pudimos verificar los datos. Probá de nuevo o escribinos.'); }
  finally { setBusy(false); }
 };
 const switchAccount = async () => {
  if (switching.current || busy || saving) return;
  switching.current = true; setSwitchBusy(true); setConfirmSwitch(false); setSwitchError('');
  clearView();
  if (reservationId) clearGuestSession(reservationId);
  try {
   if (signedIn) {
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) throw error;
   }
   setSignedIn(false); setView('login'); setPersonalHelp(false);
   navigate(`/reprogramacion/${eventId}`, { replace: true });
  } catch {
   setView('login'); setSwitchError('No pudimos cerrar la sesión. Intentá cambiar de usuario nuevamente antes de ingresar con otra cuenta.');
  } finally { switching.current = false; setSwitchBusy(false); }
 };
 const askSwitch = () => {
  if (dirtyRows.current.size > 0) setConfirmSwitch(true); else void switchAccount();
 };
 const login = () => {
  const target = getSafeReturnTo(`/reprogramacion/${eventId}`);
  navigate(target ? `/?returnTo=${encodeURIComponent(target)}` : '/');
 };
 const showSwitch = signedIn || !!access || view === 'verify' || view === 'form';
 return <main className="min-h-screen bg-background text-foreground px-4 py-8"><div className="max-w-lg mx-auto space-y-6 min-w-0">
  <header className="flex items-center gap-3"><img src={logo} alt="Reybaud" className="w-14 h-14 object-contain shrink-0"/><div className="min-w-0"><h1 className="text-2xl font-heading uppercase leading-tight">Training Camp San Luis</h1><p className="text-sm text-muted-foreground">Elegí cómo querés continuar</p></div></header>
  {showSwitch && <div className="flex flex-wrap items-center justify-between gap-2">{signedIn && <p className="text-sm text-muted-foreground">Sesión iniciada</p>}<Button variant="outline" onClick={askSwitch} disabled={switchBusy || busy || saving}><UserRound className="w-4 h-4 mr-2"/>{switchBusy ? 'Cerrando sesión…' : 'Cambiar de usuario'}</Button></div>}
  {switchError && <p role="alert" className="text-sm text-destructive">{switchError}</p>}
  <p className="flex gap-2 items-center text-primary border-y border-border py-3"><CalendarDays className="w-5 h-5 shrink-0"/>Reprogramado del 5 al 9 de noviembre de 2026</p>
  {view === 'loading' && <Loader2 aria-label="Cargando encuesta" className="w-6 h-6 animate-spin"/>}
  {view === 'error' && <p role="alert" className="text-sm text-destructive">No pudimos abrir la encuesta. Revisá que el enlace personal esté completo o escribinos.</p>}
  {view === 'closed' && <section className="space-y-3"><h2 className="text-lg font-heading">En revisión administrativa</h2><p className="text-sm text-muted-foreground">La encuesta todavía no está habilitada. Tu reserva y tus pagos se mantienen sin cambios.</p></section>}
  {view === 'verify' && <section className="space-y-4">
   {otherSession && <><h2 className="text-lg font-heading">Esta reserva corresponde a otra persona</h2><p className="text-sm text-muted-foreground">Podés continuar con el enlace verificando DNI, nombre y apellido, o cambiar de cuenta.</p>{!verifyOpen && <Button variant="outline" className="w-full h-auto whitespace-normal" onClick={() => setVerifyOpen(true)}>Continuar con el enlace verificando mi identidad</Button>}</>}
   {(!otherSession || verifyOpen) && <><h2 className="text-lg font-heading flex gap-2 items-center"><ShieldCheck className="w-5 h-5"/>Confirmá que sos vos</h2>
    <p className="text-sm text-muted-foreground">Ingresá los datos de la persona que reservó. No necesitás crear una cuenta.</p>
    <Label className="block space-y-1"><span>DNI</span><Input inputMode="numeric" autoComplete="off" value={dni} maxLength={12} onChange={e => setDni(e.target.value)}/></Label>
    <Label className="block space-y-1"><span>Nombre</span><Input autoComplete="given-name" value={first} maxLength={100} onChange={e => setFirst(e.target.value)}/></Label>
    <Label className="block space-y-1"><span>Apellido</span><Input autoComplete="family-name" value={last} maxLength={100} onChange={e => setLast(e.target.value)}/></Label>
    <Button className="w-full" disabled={busy || !identityInputValid({ dni, first, last })} onClick={verify}>{busy && <Loader2 className="w-4 h-4 mr-2 animate-spin"/>}Continuar</Button>
    {verifyError && <p role="alert" className="text-sm text-destructive">{verifyError}</p>}
   </>}
  </section>}
  {view === 'admin' && <p className="text-sm">Para gestionar solicitudes, entrá a Administración &gt; Eventos &gt; San Luis.</p>}
  {view === 'login' && <section className="space-y-3"><p className="text-sm">Ingresá con el email de tu reserva o abrí tu enlace personal.</p><Button onClick={signedIn ? askSwitch : login} disabled={switchBusy}>{signedIn ? 'Ingresar con otra cuenta' : 'Recibir código por email'}</Button><Button variant="outline" className="w-full" onClick={() => setPersonalHelp(v => !v)}>Tengo mi enlace personal</Button>{personalHelp && <p className="text-sm text-muted-foreground">Abrí el correo de San Luis y tocá «Elegir mi opción» en tu enlace personal.</p>}</section>}
  {view === 'form' && ctx?.campaign && ctx.reservations?.map(row => <ReschedulingForm key={row.reservation_id} campaign={ctx.campaign as NonNullable<ReschedulingContext['campaign']>} row={row} token={access} onSaved={load} onDirtyChange={dirtyChange} onBusyChange={busyChange}/>)}
  <Button asChild variant="outline" className="w-full"><a href={buildWhatsAppUrl('Hola, quiero consultar por la reprogramación del Training Camp San Luis.')} target="_blank" rel="noopener noreferrer"><MessageCircle className="w-4 h-4 mr-2"/>Necesito ayuda</a></Button>
  <AlertDialog open={confirmSwitch} onOpenChange={setConfirmSwitch}><AlertDialogContent className="max-w-[calc(100%-2rem)] sm:max-w-lg"><AlertDialogHeader><AlertDialogTitle>¿Cambiar de usuario?</AlertDialogTitle><AlertDialogDescription>Los cambios que todavía no confirmaste se perderán. No se guardará ninguna solicitud.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Seguir con mi elección</AlertDialogCancel><AlertDialogAction onClick={() => { void switchAccount(); }}>Descartar y cambiar de usuario</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
 </div></main>;
}
