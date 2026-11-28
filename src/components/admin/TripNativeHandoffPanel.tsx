import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AdminTermsBadge } from '@/components/reservation/ReservationTermsPending';
import { nativeParticipantEmails, nativePreflightSchema, type NativePreflight } from '@/lib/tripNativeHandoff';

/** Preparation is separate from collection. Only the participant may accept native terms. */
export default function TripNativeHandoffPanel({ requestId, attendees, note, onPrepared }: {
  requestId: string;
  attendees: { firstName: string; lastName: string }[];
  note: string;
  onPrepared: () => void;
}) {
  const [gate, setGate] = useState<NativePreflight | null>(null);
  const [emails, setEmails] = useState<string[]>(attendees.map(() => ''));
  const [reservations, setReservations] = useState<{ id: string; external_first_name: string | null; external_last_name: string | null; terminos_pendientes: boolean; terminos_token: string | null; terminos_token_expires_at: string | null; terminos_aceptados_at: string | null; terminos_version_aceptada: string | null }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = async () => {
    setGate(null);
    const { data, error: readError } = await supabase.rpc('admin_trip_native_preflight', { p_request_id: requestId });
    if (readError) { setError(readError.message); return; }
    const parsed = nativePreflightSchema.safeParse(data);
    if (!parsed.success) { setError('No se pudo verificar la habilitación. Los cobros siguen bloqueados.'); return; }
    setGate(parsed.data);
    if (parsed.data.converted) {
      const { data: links, error: linkError } = await supabase.from('trip_capacity_reservation_links').select('reservation_id').eq('request_id', requestId);
      if (linkError) { setError(linkError.message); return; }
      const ids = (links ?? []).map(l => l.reservation_id);
      if (ids.length) {
        const { data: native, error: nativeError } = await supabase.from('event_reservations').select('id,external_first_name,external_last_name,terminos_pendientes,terminos_token,terminos_token_expires_at,terminos_aceptados_at,terminos_version_aceptada').in('id', ids);
        if (nativeError) { setError(nativeError.message); return; }
        setReservations(native ?? []);
      }
    }
  };
  useEffect(() => { void load(); }, [requestId]);
  const prepare = async () => {
    if (busy || !gate?.can_prepare || gate.converted) return;
    setBusy(true); setError(null);
    try {
      const participantEmails = nativeParticipantEmails(emails, attendees.length);
      const { data, error: prepareError } = await supabase.rpc('admin_prepare_trip_native_reservations', { p_request_id: requestId, p_participant_emails: participantEmails, p_note: note });
      if (prepareError) throw prepareError;
      if (!data || typeof data !== 'object' || Array.isArray(data) || data.ok !== true) throw new Error('No se confirmó la preparación.');
      await load(); onPrepared();
    } catch (e) { setError(e instanceof Error ? e.message : (e as { message?: string })?.message ?? 'No se pudo preparar la reserva.'); }
    finally { setBusy(false); }
  };
  return <section className="border-t border-border pt-4 space-y-3">
    <h3 className="font-medium">Reserva nativa · condiciones antes de pagar</h3>
    <p className="text-xs text-muted-foreground">La preparación conserva la retención y crea una reserva por persona con cuotas pendientes. No confirma plaza ni cobra. Cada participante debe aceptar personalmente sus condiciones; la noche 17 sigue siendo solo una consulta.</p>
    {gate?.blockers.map(b => <p key={b} className="text-xs text-destructive">{b}</p>)}
    {!gate?.converted && attendees.map((a, i) => <div key={i} className="space-y-1">
      <Label htmlFor={`native-email-${i}`}>{a.firstName} {a.lastName} · email de su ficha individual</Label>
      <Input id={`native-email-${i}`} type="email" value={emails[i] ?? ''} disabled={!gate?.can_prepare || busy} onChange={e => setEmails(current => current.map((v, n) => n === i ? e.target.value : v))} />
    </div>)}
    {reservations.map(r => <div key={r.id} className="flex flex-wrap items-center gap-2"><span>{r.external_first_name} {r.external_last_name}</span><AdminTermsBadge r={r} onChanged={() => void load()} /></div>)}
    <p className="text-xs text-muted-foreground">Cobro deshabilitado: faltan instrucciones de pago aprobadas y verificación completa de seña y cuenta corriente.</p>
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    {!gate?.converted && <Button variant="outline" disabled={busy || !gate?.can_prepare || note.trim().length < 3} onClick={() => void prepare()}>{busy ? 'Preparando…' : 'Preparar reservas · sin cobrar'}</Button>}
  </section>;
}