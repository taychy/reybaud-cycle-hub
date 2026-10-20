import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Download, RefreshCw, ExternalLink, LockKeyhole } from 'lucide-react';
import { formatPrice } from '@/lib/currency';
import { csvCell } from '@/lib/rescheduling';
import { getPaymentProofSignedUrl } from '@/lib/paymentProofs';
import { canValidateSettlement, proposalJerseyAmount, settlementState, SETTLEMENT_LABELS, type SettlementPreview, type SettlementState } from '@/lib/reschedulingSettlement';

export default function ReschedulingSettlementPanel({ reservationId, requestRevision, onSaved }: { reservationId: string; requestRevision?: number; onSaved?: () => void }) {
 const [preview, setPreview] = useState<SettlementPreview>();
 const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
 const [state, setState] = useState<SettlementState>('estimated');
 const [note, setNote] = useState(''); const [amount, setAmount] = useState('');
 const [checks, setChecks] = useState<Record<string, boolean>>({});
 const saving = useRef(false); const source = useRef('');
 const pending = useRef<{ signature: string; command: string }>();
 const load = useCallback(async (reset = false) => {
  const { data, error: e } = await supabase.rpc('admin_rescheduling_settlement_preview', { p_reservation_id: reservationId });
  if (e) { setError(e.message); return; }
  const next = data as unknown as SettlementPreview;
  if (reset || source.current !== next.source_hash) { setChecks({}); setState('estimated'); setAmount(String(next.totals.net_ars)); }
  source.current = next.source_hash; setPreview(next); setError('');
 }, [reservationId]);
 useEffect(() => {
  void load(true);
  const onFocus = () => { if (!saving.current) void load(); };
  const interval = window.setInterval(onFocus, 30000);
  window.addEventListener('focus', onFocus);
  return () => { window.clearInterval(interval); window.removeEventListener('focus', onFocus); };
 }, [load, requestRevision]);
 const save = async () => {
  if (!preview || saving.current) return;
  saving.current = true; setBusy(true); setError('');
  try {
   const input = { state, note, checks, authorized_amount: state === 'validated' ? Number(amount) : null };
   const args = { p_reservation_id: reservationId, p_source_hash: preview.source_hash, p_version: preview.proposal?.version ?? 0, p_input: input };
   const signature = JSON.stringify(args);
   if (pending.current?.signature !== signature) pending.current = { signature, command: crypto.randomUUID() };
   const command = pending.current?.command; if (!command) return;
   const { data, error: e } = await supabase.rpc('admin_save_rescheduling_settlement', { ...args, p_command_id: command });
   if (e) { setError(e.message); return; }
   setPreview(data as unknown as SettlementPreview); setNote(''); pending.current = undefined; onSaved?.();
  } finally { saving.current = false; setBusy(false); }
 };
 const openProof = async (path: string) => {
  const tab = window.open('', '_blank');
  if (tab) tab.opener = null;
  const url = await getPaymentProofSignedUrl(path);
  if (!url) { tab?.close(); setError('No se pudo abrir el comprobante. Revisá el archivo original.'); return; }
  if (tab) tab.location.href = url;
 };
 const exportCsv = () => {
  if (!preview) return;
  const rows = [['Reserva', 'Estado', 'Pagos Reybaud ARS', 'Devuelto real ARS', 'Directo efectuado ARS (caja 0)', 'Directo recibido ARS (caja 0)', 'Estimado ARS', 'Autorizado vigente ARS', 'Jersey propuesto ARS', 'Crédito disponible ARS', 'Alertas'],
   [reservationId, settlementState(preview), preview.totals.paid_ars, preview.totals.returned_ars, preview.totals.direct_paid_ars, preview.totals.direct_received_ars, preview.totals.net_ars, preview.stale || preview.totals.blocked ? '' : preview.proposal?.authorized_amount, preview.stale ? '' : preview.proposal?.jersey_amount, 0, preview.totals.alerts.join(' | ')]];
  const url = URL.createObjectURL(new Blob(['\uFEFF' + rows.map(r => r.map(csvCell).join(',')).join('\n')], { type: 'text/csv;charset=utf-8;' }));
  const a = document.createElement('a'); a.href = url; a.download = 'propuesta-reprogramacion.csv'; a.click(); URL.revokeObjectURL(url);
 };
 const check = (key: string, text: string) => <label className="flex items-start gap-2 text-sm"><Checkbox checked={checks[key] ?? false} onCheckedChange={v => setChecks(c => ({ ...c, [key]: v === true }))} disabled={busy}/><span>{text}</span></label>;
 if (!preview) return <section className="py-4">{error ? <p role="alert" className="text-destructive">{error}</p> : 'Consultando pagos reales…'}<Button variant="outline" onClick={() => void load(true)}>Reintentar</Button></section>;
 const allowed = canValidateSettlement(preview, checks.reconciled === true);
 const jersey = proposalJerseyAmount(preview, Number(amount), checks);
 return <section className="space-y-4 border-t border-border pt-4" aria-label="Conciliación y propuesta financiera">
  <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-medium">Conciliación y propuesta financiera</h3><div className="flex gap-2"><Button size="icon" variant="outline" aria-label="Recalcular propuesta" onClick={() => void load(true)} disabled={busy}><RefreshCw className="h-4 w-4"/></Button><Button variant="outline" size="sm" onClick={exportCsv}><Download className="h-4 w-4 mr-2"/>CSV financiero</Button></div></div>
  <Badge variant="outline">{settlementState(preview)}</Badge>
  <p className="text-sm text-muted-foreground"><LockKeyhole className="inline h-4 w-4 mr-1"/>Documentación solamente. No cancela, no libera cupos ni mueve dinero.</p>
  {preview.stale && <p role="alert" className="text-destructive text-sm">La propuesta anterior perdió vigencia. Cambiaron sus fuentes; recalculá y revisá antes de validar.</p>}
  {preview.totals.alerts.length > 0 && <div className="border border-destructive rounded-md p-3 text-sm"><strong>A conciliar · aprobación cuantitativa bloqueada</strong><ul className="list-disc pl-5 mt-2 space-y-1">{preview.totals.alerts.map((a, i) => <li key={i}>{a}</li>)}</ul></div>}
  <div className="grid grid-cols-2 gap-4 border-y border-border py-3 text-sm">{[
   ['Pagos originales Reybaud ARS', formatPrice(preview.totals.paid_ars)], ['Efectivamente devuelto ARS', formatPrice(preview.totals.returned_ars)],
   ['Neto potencial estimado ARS', formatPrice(preview.totals.net_ars)], ['Neto confirmado ARS', preview.totals.confirmed_net_ars === null ? 'A conciliar' : formatPrice(preview.totals.confirmed_net_ars)],
   ['Directos efectuados ARS · caja $0', formatPrice(preview.totals.direct_paid_ars)], ['Directos recibidos ARS · caja $0', formatPrice(preview.totals.direct_received_ars)],
  ].map(([label, value]) => <div key={label}><p className="text-muted-foreground">{label}</p><strong>{value}</strong></div>)}</div>
  <p className="text-sm">Crédito {preview.request?.choice === 'credit' ? 'solicitado · NO DISPONIBLE' : 'no solicitado'} · disponible efectivamente: $0 (emisión bloqueada).</p>
  <details open><summary className="cursor-pointer text-sm font-medium">Pagos originales y comprobantes ({preview.payments.length})</summary><div className="space-y-2 mt-2">{preview.payments.map(p => <div key={p.id} className="border-b border-border pb-2 text-sm break-words"><p>{formatPrice(p.amount, p.currency)} · {p.currency} · {p.method} · {p.date}</p><p className="text-muted-foreground">{p.status} · {p.included ? 'Recibo ARS a revisar' : 'Excluido del neto ARS'}{p.reference ? ` · ref. ${p.reference}` : ''}</p>{p.proof && <Button variant="link" size="sm" onClick={() => { if (p.proof) void openProof(p.proof); }}>Comprobante <ExternalLink className="inline h-3 w-3 ml-1"/></Button>}</div>)}{!preview.payments.length && <p className="text-sm text-muted-foreground">Sin recibos registrados.</p>}</div></details>
  <details><summary className="cursor-pointer text-sm font-medium">Reintegros reales ({preview.refunds.length}) y pagos directos ({preview.directs.length})</summary><div className="text-sm space-y-2 mt-2">{preview.refunds.map((r, i) => <p key={`r${i}`}>Devuelto: {formatPrice(r.amount, r.currency)} · {r.currency} · {r.date} · {r.method}</p>)}{preview.directs.map((d, i) => <div key={`d${i}`}><p>Directo {d.direction}: {formatPrice(d.amount, d.currency)} · {d.currency} · {d.voided ? 'anulado, excluido' : d.status} · no es caja Reybaud</p>{d.proof && <Button variant="link" size="sm" onClick={() => { if (d.proof) void openProof(d.proof); }}>Comprobante directo</Button>}</div>)}</div></details>
  <p className="text-sm text-muted-foreground">Fuentes existentes a revisar: ajustes de reserva {preview.existing.adjustments}, ajustes/créditos de ficha {preview.existing.credits}, imputaciones de ficha {preview.existing.imputations}, transferencias {preview.existing.transfers}. No se suman como recibos.</p>
  {preview.proposal && <div className="text-sm border-l-2 border-border pl-3"><strong>Propuesta v{preview.proposal.version} {preview.stale ? '· no vigente' : ''}</strong><p>Autorizado: {preview.proposal.authorized_amount === null ? 'Sin monto autorizado' : formatPrice(preview.proposal.authorized_amount)} · jersey propuesto {formatPrice(preview.proposal.jersey_amount)} · ejecutado $0</p><p>{preview.proposal.note}</p></div>}
  {check('reconciled', 'Revisé recibos, reintegros y beneficiario; conciliación completa')}
  <Select value={state} onValueChange={v => setState(v as SettlementState)}><SelectTrigger aria-label="Estado de propuesta"><SelectValue/></SelectTrigger><SelectContent>{Object.entries(SETTLEMENT_LABELS).map(([v, l]) => <SelectItem key={v} value={v} disabled={v === 'validated' && !allowed}>{l}</SelectItem>)}</SelectContent></Select>
  <label className="block text-sm">Monto autorizado ARS (antes del jersey)<Input aria-label="Monto autorizado ARS" type="number" min="0" max={preview.totals.confirmed_net_ars ?? 0} step="0.01" value={amount} onChange={e => setAmount(e.target.value)} disabled={!allowed || state !== 'validated' || busy}/></label>
  {preview.request?.jersey_requested === true && <div className="space-y-3 text-sm"><p>Jersey solicitado: {preview.request.jersey_size} · {preview.request.delivery} · {preview.request.jersey_consent ? 'consentimiento registrado' : 'sin consentimiento'}</p>{check('stock', 'Disponibilidad de stock verificada')}{check('size', 'Talle confirmado y sin conflicto')}{check('delivery', 'Entrega acordada; envío extra solo informado y aprobado')}{check('jersey_validated', 'Incluir jersey optativo en la propuesta por ARS 50.000')}<p>Descuento propuesto: {formatPrice(jersey)} · neto propuesto {formatPrice(Math.max(0, Number(amount) - jersey))} · deducción ejecutada $0</p></div>}
  <Textarea aria-label="Motivo de propuesta" placeholder="Motivo obligatorio · sin datos bancarios ni información personal innecesaria" maxLength={2000} value={note} onChange={e => setNote(e.target.value)}/>
  <Button onClick={save} disabled={busy || !note.trim() || (state === 'validated' && (!allowed || amount.trim() === '' || Number(amount) < 0 || Number(amount) > (preview.totals.confirmed_net_ars ?? 0)))}>Guardar propuesta · sin ejecutar</Button>
  {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  <details><summary className="cursor-pointer text-sm">Historial de propuestas ({preview.history.length})</summary>{preview.history.map(h => <div key={h.version} className="border-t border-border py-2 text-sm">v{h.version} · {SETTLEMENT_LABELS[h.state]} · {new Date(h.created_at).toLocaleString('es-AR')}<p>{h.note}</p></div>)}</details>
 </section>;
}
