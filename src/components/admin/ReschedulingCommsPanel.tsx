import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Copy, ExternalLink, LockKeyhole, Mail, MessageCircle, Send } from 'lucide-react';
import { toast } from 'sonner';
import { normalizePhoneAR } from '@/lib/phoneNormalize';
import { emailBody, maskLink, personalReschedulingLink, whatsappText, whatsappUrl } from '@/lib/reschedulingAccess';
import { commStatus, COMM_LABELS, type CommRow } from '@/lib/reschedulingComms';

export default function ReschedulingCommsPanel({ eventId, publicEnabled }: { eventId: string; publicEnabled: boolean }) {
  const [open, setOpen] = useState(false); const [rows, setRows] = useState<CommRow[]>([]); const [error, setError] = useState('');
  const [preview, setPreview] = useState<CommRow>(); const [note, setNote] = useState(''); const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const { data, error: e } = await supabase.rpc('admin_rescheduling_comm_list', { p_event_id: eventId });
    if (e) setError(e.message); else { setRows(data as unknown as CommRow[]); setError(''); }
  }, [eventId]);
  useEffect(() => { if (open) void load(); }, [open, load]);
  const link = (r: CommRow) => personalReschedulingLink(eventId, r.reservation_id, r.token);
  const phone = (r: CommRow) => normalizePhoneAR(r.phone);
  const mark = async (r: CommRow, channel: 'email' | 'whatsapp', status: 'preparado' | 'enviado' | 'fallido') => {
    setBusy(true);
    const cur = channel === 'email' ? r.email_status : r.whatsapp_status;
    const { error: e } = await supabase.rpc('admin_rescheduling_comm_mark', { p_reservation_id: r.reservation_id, p_channel: channel, p_status: status, p_note: note, p_expected_version: cur?.version ?? 0, p_command_id: crypto.randomUUID() });
    setBusy(false); if (e) { toast.error(e.message); return; } setNote(''); await load();
  };
  const copy = async (text: string) => { await navigator.clipboard.writeText(text); toast.success('Mensaje copiado'); };
  const counts = rows.reduce<Record<string, number>>((n, r) => { const s = commStatus(r, 'whatsapp'); n[s] = (n[s] ?? 0) + 1; return n; }, {});
  return <>
    <Button variant="outline" size="sm" onClick={() => setOpen(true)}><Send className="w-4 h-4 mr-2" />Comunicar reprogramación</Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
      <DialogHeader><DialogTitle>San Luis · Comunicar reprogramación</DialogTitle><DialogDescription>Solo reservas vigentes. Cada enlace es personal; la persona igual confirma DNI, nombre y apellido (o su sesión). Nada se envía automáticamente.</DialogDescription></DialogHeader>
      <div className="flex flex-wrap gap-2 text-sm"><Badge variant="outline">Reservas vigentes {rows.length}</Badge>{Object.entries(counts).map(([k, v]) => <Badge key={k} variant="outline">{COMM_LABELS[k as keyof typeof COMM_LABELS]} {v}</Badge>)}<Badge variant="outline"><LockKeyhole className="w-3 h-3 mr-1" />Encuesta pública {publicEnabled ? 'habilitada' : 'desactivada'}</Badge></div>
      {!publicEnabled && <p className="text-sm text-muted-foreground">Mientras la encuesta esté desactivada, el enlace muestra «En revisión». Copiar/abrir WhatsApp queda bloqueado para no mandar enlaces que todavía no funcionan.</p>}
      <p className="text-xs text-muted-foreground">Email: vista previa lista; el envío real queda pendiente de aprobación y se hará por el sistema de correos transaccionales, no por la lista de marketing. WhatsApp: no hay integración oficial; se envía a mano y Administración registra «enviado» solo tras confirmarlo.</p>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-border">{['Participante', 'Email', 'WhatsApp', 'Estado', ''].map(h => <th key={h} className="text-left p-2">{h}</th>)}</tr></thead>
        <tbody>{rows.map(r => <tr key={r.reservation_id} className="border-b border-border">
          <td className="p-2">{r.participant}<p className="text-xs text-muted-foreground">{r.package}</p></td>
          <td className="p-2 text-xs">{r.email_valid ? 'Válido' : 'Inválido'}{r.email_duplicate ? ' · repetido' : ''}{r.suppressed ? ' · suprimido' : ''}<p>{COMM_LABELS[commStatus(r, 'email')]}</p></td>
          <td className="p-2 text-xs">{phone(r) ? 'Válido' : 'Inválido'}{r.phone_duplicate ? ' · repetido' : ''}<p>{COMM_LABELS[commStatus(r, 'whatsapp')]}</p></td>
          <td className="p-2 text-xs">{r.completed ? 'Encuesta completada' : 'Sin respuesta'}</td>
          <td className="p-2"><Button size="sm" variant="outline" onClick={() => { setPreview(r); setNote(''); }}>Revisar</Button></td>
        </tr>)}</tbody></table></div>
    </DialogContent></Dialog>
    <Dialog open={!!preview} onOpenChange={o => { if (!o) setPreview(undefined); }}><DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
      {preview && (() => { const r = rows.find(x => x.reservation_id === preview.reservation_id) ?? preview; const l = link(r); const mail = emailBody(r.first_name.trim(), l); const wa = whatsappText(r.first_name.trim(), l); const p = phone(r); return <>
        <DialogHeader><DialogTitle>{r.participant}</DialogTitle><DialogDescription>Enlace: {maskLink(l)}</DialogDescription></DialogHeader>
        <section className="space-y-2 text-sm"><h3 className="font-medium flex gap-2 items-center"><Mail className="w-4 h-4" />Email</h3>
          <p><strong>Asunto:</strong> {mail.subject}</p><pre className="whitespace-pre-wrap text-xs border border-border rounded p-3">{mail.text.replace(l, `[${mail.button}]`)}</pre>
          <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={() => mark(r, 'email', 'preparado')}>Marcar preparado</Button><Button size="sm" disabled><LockKeyhole className="w-4 h-4 mr-2" />Enviar email · pendiente de aprobación</Button></div></section>
        <section className="space-y-2 text-sm border-t border-border pt-3"><h3 className="font-medium flex gap-2 items-center"><MessageCircle className="w-4 h-4" />WhatsApp</h3>
          <pre className="whitespace-pre-wrap text-xs border border-border rounded p-3">{wa.replace(l, '[enlace personal]')}</pre>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={!publicEnabled} onClick={() => void copy(wa)}><Copy className="w-4 h-4 mr-2" />Copiar mensaje individual</Button>
            <Button size="sm" variant="outline" disabled={!publicEnabled || !p} onClick={() => window.open(whatsappUrl(p as string, wa), '_blank', 'noopener,noreferrer')}><ExternalLink className="w-4 h-4 mr-2" />Abrir WhatsApp con texto</Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => mark(r, 'whatsapp', 'preparado')}>Marcar preparado</Button>
          </div>
          <Input aria-label="Constancia del envío" placeholder="Constancia (obligatoria para enviado/fallido)" value={note} onChange={e => setNote(e.target.value)} maxLength={1000} />
          <div className="flex flex-wrap gap-2"><Button size="sm" disabled={busy || note.trim().length < 5 || commStatus(r, 'whatsapp') === 'enviado'} onClick={() => mark(r, 'whatsapp', 'enviado')}>Registrar WhatsApp enviado</Button><Button size="sm" variant="outline" disabled={busy || note.trim().length < 5} onClick={() => mark(r, 'whatsapp', 'fallido')}>Registrar fallido</Button></div>
          <p className="text-xs text-muted-foreground">Abrir WhatsApp no envía nada: la entrega solo se registra con constancia humana.</p></section>
      </>; })()}
    </DialogContent></Dialog>
  </>;
}
