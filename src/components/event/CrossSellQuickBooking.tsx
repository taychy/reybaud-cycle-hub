import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { formatPrice } from '@/lib/currency';
import { canSubmitQuickBooking, combinedSubtotal, DEFAULT_DEPOSIT_AMOUNT, depositAction, depositPending, isClicPayUrl, readCrossSellToken, RESERVATION_STATUS_LABEL, roomChoiceRequired, type CrossSellContext, type CrossSellExisting, type RoomChoice } from '@/lib/crossSellQuickBooking';
import { buildWhatsAppUrl } from '@/lib/contactInfo';

/** Reserva rápida para titulares activos del viaje vinculado. Datos y tarifa los resuelve el servidor (sesión o enlace personal). */
export default function CrossSellQuickBooking({ eventId }: { eventId: string }) {
  const [token] = useState(() => readCrossSellToken(window.location.search));
  const [ctx, setCtx] = useState<CrossSellContext | null>(null);
  const [pkgId, setPkgId] = useState<string | null>(null);
  const [choice, setChoice] = useState<RoomChoice | null>(null);
  const [companion, setCompanion] = useState('');
  const [terms, setTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = () => supabase.rpc('get_crosssell_context', { p_event_id: eventId, p_token: token ?? undefined }).then(({ data }) => {
    const c = (data ?? { eligible: false }) as unknown as CrossSellContext; setCtx(c); setPkgId(p => p ?? c.packages?.[0]?.id ?? null);
  });
  useEffect(() => { void load(); const { data } = supabase.auth.onAuthStateChange(() => { void load(); }); return () => data.subscription.unsubscribe(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, token]);

  if (!ctx?.eligible) return null;
  const pkg = ctx.packages?.find(p => p.id === pkgId) ?? null;
  const needsRoom = roomChoiceRequired(ctx);
  const submit = async () => {
    if (!pkg) return; setBusy(true); setMsg(null);
    const { data, error } = await supabase.rpc('crosssell_book', { p_event_id: eventId, p_token: token ?? undefined, p_package_id: pkg.id, p_terms_version: ctx.terms_version ?? '', p_room_choice: needsRoom ? choice ?? undefined : 'mismo_companero', p_companion_name: choice === 'companero' ? companion : undefined });
    setBusy(false);
    if (error) { setMsg({ ok: false, text: error.message.includes('bloqueada') ? 'Las reservas formales todavía no están abiertas. Te avisamos cuando puedas completarla.' : error.message }); return; }
    const d = data as { already?: boolean };
    setMsg({ ok: true, text: d.already ? 'Ya tenías una reserva de Maratona: no se creó otra.' : 'Reserva registrada. Ahora podés pagar la seña.' });
    void load();
  };

  return <section aria-label="Reserva rápida para participantes de La Conquista Alpina" className="space-y-4 rounded-lg border border-primary bg-card p-6 sm:p-8">
    <p className="text-xs font-semibold uppercase tracking-widest text-primary">Reserva rápida · participantes de La Conquista Alpina</p>
    <h2 className="font-heading text-2xl font-bold uppercase">Hola {ctx.first_name}, ya tenemos tus datos</h2>
    <p className="text-sm text-muted-foreground">Usamos los datos de tu reserva de La Conquista Alpina ({ctx.source?.package}, {ctx.email_masked}). No hace falta volver a cargarlos.</p>
    {ctx.existing ? <DepositBlock existing={ctx.existing} depositUrl={ctx.deposit?.url ?? null} depositAmount={ctx.deposit?.amount} /> : <>
      <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Tarifa especial">
        {ctx.packages?.map(p => <button key={p.id} type="button" role="radio" aria-checked={pkgId === p.id} onClick={() => setPkgId(p.id)}
          className={'rounded-md border p-4 text-left ' + (pkgId === p.id ? 'border-primary bg-primary/10' : 'border-border')}>
          <span className="block font-heading text-3xl font-black text-primary">{formatPrice(p.precio, p.currency)}</span>
          <span className="text-sm">{p.precio >= 3000 ? 'Bicicleta incluida' : 'Bicicleta propia'} · habitación doble</span>
          <span className="mt-2 block text-xs text-muted-foreground">Subtotal con tu reserva Alpes: {formatPrice(combinedSubtotal(ctx, p), 'EUR')} ({formatPrice(Number(ctx.source?.price), 'EUR')} + {formatPrice(p.precio, p.currency)})</span>
        </button>)}
      </div>
      <p className="text-xs text-muted-foreground">Son dos reservas separadas, cada una con su seña de EUR 500 y sus cuotas. Las noches del 28 al 30 de junio y el traslado intermedio no están incluidos.</p>
      {!needsRoom ? <p className="text-sm">Habitación doble: mantenemos tu compañía de Alpes ({ctx.roommate_first_name}){ctx.roommate_has_booking ? ', que ya reservó Maratona.' : '. Si no hace Maratona, te asignamos compañía sin frenar tu reserva.'}</p> :
        <fieldset className="space-y-2"><legend className="text-sm font-medium">En Maratona todas las habitaciones son dobles. ¿Cómo querés compartir?</legend>
          <label className="flex items-center gap-2 text-sm"><input type="radio" name="room" checked={choice === 'companero'} onChange={() => setChoice('companero')} />Con alguien que elijo</label>
          {choice === 'companero' && <Input aria-label="Nombre de tu compañía" value={companion} maxLength={120} onChange={e => setCompanion(e.target.value)} placeholder="Nombre y apellido" />}
          <label className="flex items-center gap-2 text-sm"><input type="radio" name="room" checked={choice === 'asignacion'} onChange={() => setChoice('asignacion')} />Que Reybaud me asigne compañía</label>
        </fieldset>}
      <label className="flex items-start gap-2 text-sm"><Checkbox checked={terms} onCheckedChange={v => setTerms(v === true)} className="mt-0.5" />Leí y acepto las políticas y condiciones de Maratona (versión {ctx.terms_version}).</label>
      <p className="text-sm text-muted-foreground">La seña de EUR 500 se paga por el enlace de ClicPay y Administración la valida con tu comprobante. No se cobra nada al reservar.</p>
      <Button className="w-full sm:w-auto" disabled={busy || !canSubmitQuickBooking(ctx, pkgId, terms, choice, companion)} onClick={submit}>{ctx.booking_enabled ? 'Reservar Maratona' : 'Reservas formales aún cerradas'}</Button>
    </>}
    {msg && <p role={msg.ok ? 'status' : 'alert'} className={msg.ok ? 'text-sm' : 'text-sm text-destructive'}>{msg.text}</p>}
  </section>;
}

/** Después de reservar (o al volver a entrar): datos mínimos de la reserva propia y cómo pagar la seña. */
function DepositBlock({ existing, depositUrl, depositAmount }: { existing: CrossSellExisting; depositUrl: string | null; depositAmount?: number }) {
  const amount = Number(depositAmount) > 0 ? Number(depositAmount) : DEFAULT_DEPOSIT_AMOUNT;
  const action = depositAction(existing, amount);
  const pending = depositPending(existing, amount);
  const cur = existing.currency || 'EUR';
  const ref = existing.reference ? `MARATONA-${existing.reference}` : null;
  const url = isClicPayUrl(depositUrl) ? depositUrl : null;
  return <div role="status" className="space-y-3 rounded-md border border-border bg-background/40 p-4" data-testid="crosssell-deposit">
    <p className="font-heading text-lg font-bold uppercase">Tu reserva de Maratona</p>
    <dl className="grid gap-1 text-sm sm:grid-cols-2">
      <div><dt className="inline text-muted-foreground">Paquete: </dt><dd className="inline">{existing.package}</dd></div>
      {existing.price != null && <div><dt className="inline text-muted-foreground">Precio: </dt><dd className="inline">{formatPrice(Number(existing.price), cur)}</dd></div>}
      <div><dt className="inline text-muted-foreground">Estado: </dt><dd className="inline">{RESERVATION_STATUS_LABEL[existing.status] ?? existing.status}</dd></div>
      <div><dt className="inline text-muted-foreground">Pagos acreditados: </dt><dd className="inline">{formatPrice(Number(existing.paid ?? 0), cur)}</dd></div>
      {ref && <div className="sm:col-span-2"><dt className="inline text-muted-foreground">Referencia de reserva: </dt><dd className="inline font-mono font-semibold">{ref}</dd></div>}
    </dl>
    {action === 'paid' && <p className="text-sm">La seña está acreditada. Las próximas cuotas se informan desde tu plan de pagos.</p>}
    {action === 'informed' && <p className="text-sm">Ya nos informaste un pago: Administración lo está validando con tu comprobante.</p>}
    {action === 'partial' && <>
      <p className="text-sm">Registramos un pago parcial de la seña. Quedan <strong>{formatPrice(pending, cur)}</strong> pendientes para completarla.</p>
      <p className="text-sm text-muted-foreground">El enlace de ClicPay es por el importe completo de la seña, así que no sirve para este saldo. Escribinos por WhatsApp con la referencia {ref ?? 'de tu reserva'} y coordinamos cómo completarlo (transferencia o efectivo).</p>
      <Button asChild variant="outline" size="sm"><a href={buildWhatsAppUrl(`Hola, quiero completar la seña de Maratona (saldo ${formatPrice(pending, cur)}). Referencia ${ref ?? ''}`.trim())} target="_blank" rel="noopener noreferrer">Coordinar saldo de la seña por WhatsApp</a></Button>
    </>}
    {action === 'pay' && <>
      {url ? <Button asChild size="lg" className="w-full sm:w-auto"><a href={url} target="_blank" rel="noopener noreferrer">Pagar seña de EUR 500 por ClicPay</a></Button>
        : <p className="text-sm text-destructive">El enlace de pago no está disponible en este momento. Escribinos y te lo enviamos.</p>}
      <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
        <li>El pago no se acredita solo: guardá el comprobante de ClicPay y envialo por WhatsApp indicando la referencia {ref ?? 'de tu reserva'}.</li>
        <li>La plaza queda confirmada cuando Administración valida la seña.</li>
        <li>¿Preferís pagar en efectivo? Avisanos por WhatsApp y coordinamos.</li>
      </ul>
      <Button asChild variant="outline" size="sm"><a href={buildWhatsAppUrl(`Hola, envío el comprobante de la seña de Maratona. Referencia ${ref ?? ''}`.trim())} target="_blank" rel="noopener noreferrer">Enviar comprobante por WhatsApp</a></Button>
    </>}
  </div>;
}
