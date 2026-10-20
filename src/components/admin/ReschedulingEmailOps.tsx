import { useCallback, useEffect, useRef, useState } from 'react';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { LockKeyhole, Mail, Send } from 'lucide-react';
import { toast } from 'sonner';
import { EMAIL_AUTH_CHECKS, emailSendBlockers, nextEmailBatch, type CommRow, type EmailAuthKey, type EmailGateStatus } from '@/lib/reschedulingComms';

const TEMPLATE_VERSION = 'san-luis-nov-2026-v1';

async function call(body: Record<string, unknown>) {
  // El panel puede permanecer abierto mientras expira el JWT. Resolver una
  // sesión válida ANTES de cada envío y pasarla explícitamente a la Edge Function.
  // La autorización de administrador continúa verificándose en el servidor.
  const { data: initial, error: sessionError } = await supabase.auth.getSession();
  let session = initial.session;
  if (sessionError || !session) {
    throw new Error('Tu sesión venció. Ingresá nuevamente a Reybaud desde reybaud-app.com y volvé a intentar.');
  }

  const aboutToExpire = !session.expires_at || session.expires_at * 1000 < Date.now() + 120_000;
  if (!aboutToExpire) {
    const { data: verified, error: verifyError } = await supabase.auth.getUser();
    if (verifyError || !verified.user || verified.user.id !== session.user.id) {
      const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError || !refreshed.session) {
        throw new Error('No pudimos validar tu sesión. Cerrá sesión e ingresá de nuevo desde reybaud-app.com.');
      }
      session = refreshed.session;
    }
  } else {
    const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError || !refreshed.session) {
      throw new Error('Tu sesión venció. Cerrá sesión e ingresá de nuevo desde reybaud-app.com.');
    }
    session = refreshed.session;
  }

  const { data, error } = await supabase.functions.invoke('send-rescheduling-email', {
    body,
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (error) {
    const status = error instanceof FunctionsHttpError ? error.context.status : undefined;
    const txt = error instanceof FunctionsHttpError ? await error.context.text() : error.message;
    let msg = txt;
    try { msg = JSON.parse(txt).error ?? txt; } catch { /* respuesta no JSON */ }
    if (status === 401 || msg === 'No autorizado') {
      throw new Error('El servidor no reconoció tu sesión. Ingresá de nuevo desde reybaud-app.com; no se inició este lote.');
    }
    if (status === 403 || msg === 'Acceso no autorizado') {
      throw new Error('El servidor no reconoció tus permisos de administración. No se inició este lote; contactá a soporte.');
    }
    throw new Error(msg || 'El servicio de envío no respondió');
  }
  return data;
}

/** Email operativo: vista previa sin tokens, prueba a la cuenta del admin y envío por lotes con compuertas en servidor. */
export default function ReschedulingEmailOps({ eventId, rows, onChanged }: { eventId: string; rows: CommRow[]; onChanged: () => Promise<void> }) {
  const [gate, setGate] = useState<EmailGateStatus | null>(null);
  const [html, setHtml] = useState(''); const [previewErr, setPreviewErr] = useState('');
  const [checks, setChecks] = useState<Record<EmailAuthKey, boolean>>({} as Record<EmailAuthKey, boolean>);
  const [note, setNote] = useState(''); const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false); const lock = useRef(false);

  const loadGate = useCallback(async () => {
    const { data, error } = await supabase.rpc('admin_rescheduling_email_gate_status', { p_event_id: eventId });
    if (error) toast.error(error.message); else setGate(data as unknown as EmailGateStatus);
  }, [eventId]);
  useEffect(() => { void loadGate(); }, [loadGate]);

  const guarded = async (fn: () => Promise<void>) => {
    if (lock.current) return; lock.current = true; setBusy(true);
    try { await fn(); } catch (e) { toast.error((e as Error).message); } finally { lock.current = false; setBusy(false); await loadGate(); }
  };
  const loadPreview = () => guarded(async () => {
    setPreviewErr('');
    try { const d = await call({ mode: 'preview', event_id: eventId }); setHtml(d.html); }
    catch (e) { setPreviewErr(`No se pudo generar la vista previa: ${(e as Error).message}. Puede que el envío todavía no esté activado en el servidor.`); }
  });
  const sendTest = () => guarded(async () => {
    if (!window.confirm('Se enviará UN correo de prueba solo a tu propia cuenta de administración, con un enlace de muestra sin datos de participantes. ¿Continuar?')) return;
    const d = await call({ mode: 'test', event_id: eventId, confirm: true });
    toast.success(d.result === 'aceptado' ? `Prueba aceptada por el proveedor para ${d.recipient}. Revisá bandeja y spam.` : `Prueba: ${d.result}`);
  });
  const authorize = () => guarded(async () => {
    const { error } = await supabase.rpc('admin_rescheduling_email_authorize', { p_event_id: eventId, p_audience_count: gate?.eligible ?? 0, p_template_version: TEMPLATE_VERSION, p_checks: checks, p_note: note });
    if (error) throw error; toast.success('Audiencia autorizada'); setChecks({} as Record<EmailAuthKey, boolean>); setNote('');
  });
  const revoke = () => guarded(async () => { const { error } = await supabase.rpc('admin_rescheduling_email_revoke', { p_event_id: eventId }); if (error) throw error; });
  const batch = nextEmailBatch(rows);
  const sendBatch = () => guarded(async () => {
    if (confirmText !== 'ENVIAR') throw new Error('Escribí ENVIAR para confirmar');
    if (!window.confirm(`Se enviará el correo a ${batch.length} titulares de este lote. ¿Confirmás?`)) return;
    const d = await call({ mode: 'send', event_id: eventId, reservation_ids: batch, confirm: 'ENVIAR' });
    const failed = d.results.filter((r: { status: string }) => r.status !== 'enviado').length;
    toast.success(`Lote: ${d.processed - failed} aceptados por el proveedor, ${failed} fallidos, ${d.skipped} omitidos`);
    setConfirmText(''); await onChanged();
  });

  const blockers = emailSendBlockers(gate);
  const sent = rows.filter(r => r.email_status?.status === 'enviado').length;
  const failed = rows.filter(r => r.email_status?.status === 'fallido').length;
  const excluded = rows.filter(r => !r.email_valid || r.suppressed || r.email_duplicate).length;
  const allChecked = EMAIL_AUTH_CHECKS.every(c => checks[c.key]);

  return <section className="space-y-3 rounded-md border border-border p-3 text-sm">
    <h3 className="font-medium flex items-center gap-2"><Mail className="w-4 h-4" />Email operativo (no es la lista de marketing)</h3>
    <div className="flex flex-wrap gap-2">
      <Badge variant="outline">Pendientes elegibles {gate?.eligible ?? '—'}</Badge><Badge variant="outline">Excluidos {excluded}</Badge>
      <Badge variant="outline">Aceptados por el proveedor {sent}</Badge><Badge variant="outline">Fallidos {failed}</Badge><Badge variant="outline">Pruebas aceptadas {gate?.tests ?? 0}</Badge>
    </div>
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" disabled={busy} onClick={loadPreview}>Ver correo de muestra</Button>
      <Button size="sm" variant="outline" disabled={busy} onClick={sendTest}>Enviar una prueba a mi cuenta</Button>
    </div>
    {previewErr && <p role="alert" className="text-xs text-destructive">{previewErr}</p>}
    {html && <iframe title="Vista previa del correo" sandbox="" srcDoc={html} className="w-full h-96 rounded border border-border bg-background" />}

    <div className="space-y-2 border-t border-border pt-3">
      <p className="font-medium">Autorización de audiencia</p>
      {gate?.authorization
        ? <p className="text-xs">Autorizada para {gate.authorization.audience_count} titulares ({gate.authorization.template_version}). <Button size="sm" variant="link" disabled={busy} onClick={revoke}>Revocar</Button></p>
        : <>
          {EMAIL_AUTH_CHECKS.map(c => <label key={c.key} className="flex items-center gap-2 text-xs cursor-pointer"><Checkbox checked={!!checks[c.key]} onCheckedChange={v => setChecks({ ...checks, [c.key]: !!v })} />{c.label}</label>)}
          <Input aria-label="Motivo de la autorización" placeholder="Quién autorizó y cuándo (obligatorio)" value={note} onChange={e => setNote(e.target.value)} maxLength={500} />
          <Button size="sm" variant="outline" disabled={busy || !allChecked || note.trim().length < 10 || !gate?.public_enabled} onClick={authorize}>Autorizar {gate?.eligible ?? 0} titulares</Button>
        </>}
    </div>

    <div className="space-y-2 border-t border-border pt-3">
      <p className="font-medium">Envío real por lotes (máx. 10)</p>
      {blockers.length > 0 && <ul className="text-xs text-muted-foreground list-disc pl-4">{blockers.map(b => <li key={b}>{b}</li>)}</ul>}
      <div className="flex flex-wrap gap-2 items-center">
        <Input className="w-32" aria-label="Confirmación de envío" placeholder="Escribí ENVIAR" value={confirmText} onChange={e => setConfirmText(e.target.value)} disabled={blockers.length > 0} />
        <Button size="sm" disabled={busy || blockers.length > 0 || batch.length === 0 || confirmText !== 'ENVIAR'} onClick={sendBatch}>
          {blockers.length > 0 ? <LockKeyhole className="w-4 h-4 mr-2" /> : <Send className="w-4 h-4 mr-2" />}Enviar próximo lote ({batch.length})
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">Los fallidos vuelven al próximo lote; nunca se reenvía a quien ya figura enviado o completó la encuesta. «Aceptado» no confirma la entrega.</p>
    </div>
  </section>;
}
