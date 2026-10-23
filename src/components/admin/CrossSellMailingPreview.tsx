import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Mail } from 'lucide-react';
import { buildCompleteEmail, buildInviteEmail, PREVIEW_LINK, PREVIEW_NAME, splitCohorts, type MailingAudienceRow, type MailingContent } from '@/lib/crossSellMailing';

/** Solo administración y solo vista previa: no genera enlaces ni envía correos. */
export default function CrossSellMailingPreview({ eventId }: { eventId: string }) {
  const [rows, setRows] = useState<MailingAudienceRow[] | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'A' | 'B'>('A');
  useEffect(() => {
    let on = true;
    void supabase.rpc('admin_crosssell_mailing_audience' as never, { p_event_id: eventId } as never).then(({ data, error: e }: { data: unknown; error: { message: string } | null }) => {
      if (!on) return; if (e) { setError(e.message); return; } setRows((data ?? []) as MailingAudienceRow[]);
    });
    return () => { on = false; };
  }, [eventId]);
  const s = useMemo(() => splitCohorts(rows ?? []), [rows]);
  if (error) return <p role="alert" className="text-sm text-destructive">{error}</p>;
  if (!rows) return <p className="text-sm text-muted-foreground">Cargando audiencia del mailing…</p>;
  const content = tab === 'A' ? buildInviteEmail(PREVIEW_NAME, PREVIEW_LINK) : buildCompleteEmail(PREVIEW_NAME, PREVIEW_LINK);
  const list = tab === 'A' ? s.A : s.B;
  return <section aria-label="Mailing segmentado" className="space-y-3 rounded-lg border border-border p-4">
    <div className="flex items-center gap-2"><Mail className="h-5 w-5 text-primary" /><h3 className="font-heading text-lg">Mailing segmentado · solo vista previa</h3></div>
    <p className="text-sm text-muted-foreground">
      <strong className="text-foreground">A · Invitación: {s.A.length}</strong> · <strong className="text-foreground">B · Completar reserva: {s.B.length}</strong> · Excluidos: {s.excluded.length}.
      {' '}El envío no está habilitado: requiere aprobación de Dirección. Cada persona recibiría un solo correo con su enlace personal, que se genera recién al enviar.
    </p>
    <div className="flex gap-2">
      <Button size="sm" variant={tab === 'A' ? 'default' : 'outline'} onClick={() => setTab('A')}>Plantilla A ({s.A.length})</Button>
      <Button size="sm" variant={tab === 'B' ? 'default' : 'outline'} onClick={() => setTab('B')}>Plantilla B ({s.B.length})</Button>
    </div>
    <EmailPreview c={content} />
    <details className="text-sm"><summary className="cursor-pointer font-medium">Destinatarios de la plantilla {tab} ({list.length})</summary>
      <ul className="mt-2 divide-y divide-border">{list.map(r => <li key={r.source_reservation_id} className="py-1.5">{r.nombre || 'Sin nombre'} <span className="text-muted-foreground">· {r.reason}{r.roommate ? ` · comparte con ${r.roommate}` : ''}</span></li>)}</ul>
    </details>
    <details className="text-sm"><summary className="cursor-pointer font-medium">Excluidos ({s.excluded.length})</summary>
      <ul className="mt-2 divide-y divide-border">{s.excluded.map(r => <li key={r.source_reservation_id} className="flex flex-wrap gap-2 py-1.5">{r.nombre || 'Sin nombre'} <Badge variant="outline">{r.reason}</Badge></li>)}</ul>
    </details>
  </section>;
}

function EmailPreview({ c }: { c: MailingContent }) {
  return <article aria-label="Vista previa del correo" className="space-y-3 rounded-md border border-border bg-background p-4 text-sm">
    <p><span className="text-muted-foreground">Asunto: </span><strong>{c.subject}</strong></p>
    <p className="text-xs text-muted-foreground">Vista previa en bandeja: {c.preheader}</p>
    <hr className="border-border" />
    {c.blocks.map((b, i) => b.kind === 'p' ? <p key={i}>{b.text}</p>
      : b.kind === 'list' ? <ul key={i} className="list-disc space-y-1 pl-5">{b.items.map(t => <li key={t}>{t}</li>)}</ul>
      : <div key={i} className="space-y-1 py-1">
          <span aria-label={`Botón: ${b.label}`} className={b.role === 'public' ? 'inline-block rounded-md border border-primary px-4 py-2 font-semibold text-primary' : 'inline-block rounded-md bg-primary px-4 py-2 font-semibold text-primary-foreground'}>{b.label}</span>
          <p className="break-all font-mono text-xs text-muted-foreground">{b.role === 'public' ? `Enlace público: ${b.href}` : b.href}</p>
        </div>)}
    {c.footer.map((p, i) => <p key={i} className={i === c.footer.length - 1 ? 'font-medium' : 'text-xs text-muted-foreground'}>{p}</p>)}
  </article>;
}
