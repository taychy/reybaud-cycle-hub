import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LockKeyhole } from 'lucide-react';
import { SEAT_ACTION_LABELS, SEAT_LABELS, seatActions, sellableTotal, type SeatAction, type SeatInventory } from '@/lib/reschedulingSeats';
import type { ReschedulingRequest } from '@/lib/rescheduling';

export function ReschedulingSeatSummary({ inventory }: { inventory?: SeatInventory }) {
  if (!inventory?.available) return null;
  const alerts = inventory.releases.filter(r => r.stale).length;
  return <section className="border-y border-border py-3 space-y-2 text-sm">
    <h3 className="font-medium">Inventario cerrado de reprogramación</h3>
    <p className="text-xs text-muted-foreground">Mismo alojamiento confirmado para 5–8, 6–9 y 5–9/11, con los cupos originales. Solo se revenden plazas renunciadas, validadas y liberadas expresamente por administración. Liberar no significa devolución pagada. Reventa {inventory.resale_enabled ? 'habilitada' : 'bloqueada'} · sin precio de venta definido.</p>
    <div className="flex flex-wrap gap-3"><span>Reservas vigentes: {inventory.active_reservations}</span><span>Sin revisar: {inventory.unreviewed}</span><span>Devoluciones validadas: {inventory.refund_validated}</span>{inventory.windows.map(w => <span key={w.value}>{w.label.replace(/^Asisto /, '')}: {inventory.by_choice[w.value] ?? 0}</span>)}<strong>Cupos vendibles: {sellableTotal(inventory)}</strong></div>
    {alerts > 0 && <p role="alert" className="text-destructive">{alerts} renuncia(s) confirmada(s) cambiaron después; revisar antes de liberar.</p>}
    <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="border-b border-border">{['Paquete', 'Vigentes', 'Renuncia confirmada', 'Liberadas', 'Ofrecidas', 'Ocupadas por reemplazo', 'Vendibles'].map(h => <th key={h} className="text-left p-1">{h}</th>)}</tr></thead>
      <tbody>{inventory.packages.map(p => <tr key={p.package_id} className="border-b border-border"><td className="p-1">{p.name}</td><td className="p-1">{p.active}</td><td className="p-1">{p.confirmed}</td><td className="p-1">{p.released}</td><td className="p-1">{p.offered}</td><td className="p-1">{p.occupied}</td><td className="p-1">{inventory.resale_enabled ? p.offered : 0}</td></tr>)}</tbody></table></div>
    <p className="text-xs text-muted-foreground">Las noches 6 y 7 se comparten entre 5–8 y 6–9; 5–9 ocupa las cuatro. Una plaza liberada admite un solo reemplazo sin solapamiento. No cuentan las 8 cancelaciones anteriores ni las camas sin vender.</p>
  </section>;
}

export function ReschedulingSeatActions({ reservationId, request, inventory, onSaved }: { reservationId: string; request: ReschedulingRequest | null; inventory?: SeatInventory; onSaved: () => void }) {
  const release = inventory?.releases.find(r => r.reservation_id === reservationId);
  const actions = seatActions(release?.state ?? null, request, !!inventory?.resale_enabled);
  const [action, setAction] = useState<SeatAction>(); const [reason, setReason] = useState(''); const [replacement, setReplacement] = useState(''); const [windowChoice, setWindowChoice] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [command, setCommand] = useState(() => crypto.randomUUID());
  if (!inventory?.available) return null;
  const run = async () => {
    if (!action) return; setBusy(true); setError('');
    const { error: e } = await supabase.rpc('admin_rescheduling_seat_action', { p_reservation_id: reservationId, p_action: action, p_reason: reason, p_expected_version: release?.version ?? 0, p_command_id: command, p_replacement_reservation_id: action === 'occupy' ? replacement.trim() : undefined, p_window: action === 'occupy' ? windowChoice : undefined });
    setBusy(false);
    if (e) { setError(e.message); return; }
    setAction(undefined); setReason(''); setCommand(crypto.randomUUID()); onSaved();
  };
  return <section className="border-t border-border pt-4 space-y-2 text-sm">
    <h3 className="font-medium">Plaza en inventario cerrado</h3>
    <p>{release ? SEAT_LABELS[release.state] : 'Plaza no liberada'}{release?.stale ? ' · la solicitud cambió, revisar' : ''}{release?.occupancy ? ` · reemplazo ${release.occupancy.replacement_reservation_id.slice(0, 8)} (${release.occupancy.window})` : ''}</p>
    <p className="text-xs text-muted-foreground">Solo devoluciones o créditos validados. Crédito requiere revisión independiente del desistimiento. No cancela la reserva, no mueve dinero ni borra la obligación de reembolso.</p>
    {actions.length === 0 ? <p className="text-xs text-muted-foreground flex gap-1 items-center"><LockKeyhole className="w-3 h-3" />Sin acciones disponibles.</p> : <>
      <Select value={action ?? ''} onValueChange={v => setAction(v as SeatAction)}><SelectTrigger aria-label="Acción sobre la plaza"><SelectValue placeholder="Elegí una acción" /></SelectTrigger><SelectContent>{actions.map(a => <SelectItem key={a} value={a}>{SEAT_ACTION_LABELS[a]}</SelectItem>)}</SelectContent></Select>
      {action === 'occupy' && <><Input aria-label="Reserva de reemplazo" placeholder="ID de la reserva de reemplazo (posterior a la liberación)" value={replacement} onChange={e => setReplacement(e.target.value)} />
        <Select value={windowChoice} onValueChange={setWindowChoice}><SelectTrigger aria-label="Noches del reemplazo"><SelectValue placeholder="Noches" /></SelectTrigger><SelectContent>{inventory.windows.map(w => <SelectItem key={w.value} value={w.value}>{w.label}</SelectItem>)}</SelectContent></Select></>}
      {action && <><Textarea aria-label="Motivo de la acción sobre la plaza" placeholder="Motivo (obligatorio)" value={reason} onChange={e => setReason(e.target.value)} maxLength={2000} />
        <Button disabled={busy || reason.trim().length < 5 || (action === 'occupy' && (!replacement.trim() || !windowChoice))} onClick={run}>{SEAT_ACTION_LABELS[action]}</Button></>}
    </>}
    {error && <p role="alert" className="text-destructive">{error}</p>}
  </section>;
}
