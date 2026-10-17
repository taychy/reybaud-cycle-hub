/**
 * Reporte admin de encuestas operativas (events.metadata.choice_surveys).
 * Solo reservas vigentes; nunca muestra tokens de acceso.
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Loader2, Pencil } from "lucide-react";
import ChoiceSurveyAdminEditor from './ChoiceSurveyAdminEditor';
import { resolveChoiceSources, summarizeChoiceSources, type ChoiceAdminEntry } from '@/lib/choiceSurveyAdmin';
import {
  CHOICE_STATUS_LABELS, choiceAnswerStatus, choiceSurveyStepKey, getChoiceSurveys, isActiveReservation,
  summarizeChoiceSurvey, type ChoiceSurveyConfig,
} from "@/lib/choiceSurvey";

export interface ChoiceReportRow {
  reservation_id: string;
  nombre: string;
  apellido: string;
  package_nombre: string | null;
  reservation_status: string;
  is_external: boolean;
}

const csvCell = (v: string) => `"${(v ?? "").replace(/"/g, '""')}"`;
const fmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" }) : "");

export const useChoiceSurveys = (eventId: string, open: boolean) => {
  const [surveys, setSurveys] = useState<ChoiceSurveyConfig[]>([]);
  useEffect(() => {
    if (!open) return;
    supabase.from("events").select("metadata").eq("id", eventId).maybeSingle()
      .then(({ data }) => setSurveys(getChoiceSurveys((data as any)?.metadata)));
  }, [eventId, open]);
  return surveys;
};

const EventChoiceSurveyReport = ({ survey, rows, eventTitle }: { survey: ChoiceSurveyConfig; rows: ChoiceReportRow[]; eventTitle: string }) => {
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [adminEntries, setAdminEntries] = useState<Record<string, ChoiceAdminEntry>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [q, setQ] = useState("");
  const active = useMemo(() => rows.filter((r) => isActiveReservation(r.reservation_status)), [rows]);

  useEffect(() => {
    const ids = active.map((r) => r.reservation_id);
    if (!ids.length) { setAnswers({}); setAdminEntries({}); setLoading(false); return; }
    setLoading(true);
    setError('');
    let cancelled = false;
    Promise.all([
      supabase.from("reservation_checklist_data").select("reservation_id, data").in("reservation_id", ids).eq("step_key", choiceSurveyStepKey(survey.key)),
      supabase.from('event_choice_survey_admin_entries').select('*').in('reservation_id', ids).eq('survey_key', survey.key),
    ]).then(([responses, entries]) => {
        if (cancelled) return;
        if (responses.error || entries.error) { setError('No se pudo cargar el reporte completo. Reintentá antes de preparar el pedido.'); setLoading(false); return; }
        const m: Record<string, any> = {};
        (responses.data || []).forEach((d) => { m[d.reservation_id] = d.data; });
        const admin: Record<string, ChoiceAdminEntry> = {};
        (entries.data || []).forEach(d => { admin[d.reservation_id] = { ...d, status: d.status === 'confirmed' ? 'confirmed' : 'pending' }; });
        setAdminEntries(admin);
        setAnswers(m); setLoading(false);
      });
    return () => { cancelled = true; };
  }, [active, survey.key, revision]);

  const summary = useMemo(() => summarizeChoiceSurvey(survey, active.map((r) => answers[r.reservation_id])), [survey, active, answers]);
  const order = useMemo(() => summarizeChoiceSources(survey, active.map(r => ({ answer: answers[r.reservation_id], admin: adminEntries[r.reservation_id] }))), [survey, active, answers, adminEntries]);
  const label = (v?: string) => survey.options.find((o) => o.value === v)?.label ?? "";

  const list = active
    .map((r) => ({ r, a: answers[r.reservation_id], admin: adminEntries[r.reservation_id], effective: resolveChoiceSources(survey, answers[r.reservation_id], adminEntries[r.reservation_id]), st: choiceAnswerStatus(survey, answers[r.reservation_id]) }))
    .filter((x) => filter === 'all' || x.st === filter || (filter === 'admin_confirmed' && x.admin?.status === 'confirmed') || (filter === 'admin_pending' && x.admin?.status === 'pending') || (filter === 'conflict' && x.effective.conflict) || (filter === 'order_pending' && !x.effective.value))
    .filter((x) => !q || `${x.r.nombre} ${x.r.apellido}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => `${a.r.apellido} ${a.r.nombre}`.localeCompare(`${b.r.apellido} ${b.r.nombre}`));

  const exportCsv = () => {
    const lines = [
      ["Reserva", "Apellido", "Nombre", "Tipo", "Paquete", "Respuesta encuesta", "Estado encuesta", "Talle administración", "Alternativas admin", "Observaciones admin", "Origen", "Estado", "Talle para pedido", "Respondido", "Actualizado encuesta", "Actualizado admin"],
      ...list.map(({ r, a, st, admin, effective }) => [r.reservation_id, r.apellido, r.nombre, r.is_external ? "Externo" : "Alumno", r.package_nombre ?? "", label(a?.respuesta), CHOICE_STATUS_LABELS[st], label(admin?.confirmed_value ?? undefined), admin?.candidates.join('/') ?? '', admin?.notes ?? '', effective.origin, effective.status, label(effective.value ?? undefined), fmt(a?.respondido_at), fmt(a?.actualizado_at), fmt(admin?.updated_at)]),
      [], ["Pedido a proveedor · totales globales vigentes, sin duplicados ni discrepancias"],
      ...order.counts.map((o) => [o.label, String(o.count)]),
      ["Requiere confirmar", String(summary.requiereConfirmar)], ["No respondió", String(summary.sinRespuesta)],
    ];
    const blob = new Blob(["\uFEFF" + lines.map((l) => l.map(csvCell).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${survey.key}_${eventTitle.replace(/\s+/g, "_")}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  if (error) return <div role="alert" className="space-y-2"><p>{error}</p><Button variant="outline" onClick={() => setRevision(v => v + 1)}>Reintentar</Button></div>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          ["Reservas vigentes", summary.total],
          ["Talle concreto · encuesta", summary.confirmados],
          ["No seguro · encuesta", summary.requiereConfirmar],
          ["No respondió · encuesta", summary.sinRespuesta],
          ["Respuestas de participantes", summary.confirmados + summary.requiereConfirmar],
          ["Confirmados solo por admin", order.adminOnly],
          ["Talles para pedido", order.ready],
          ["Sin talle final / revisión", order.pending],
        ].map(([l, v]) => (
          <div key={l as string} className="rounded-lg border p-3">
            <p className="text-[11px] text-muted-foreground">{l}</p>
            <p className="text-xl font-semibold">{v}</p>
          </div>
        ))}
      </div>

      <div className="rounded-lg border p-3 space-y-2">
        <p className="text-xs font-medium">Pedido a proveedor (solo confirmados)</p>
        <div className="flex flex-wrap gap-2">
          {order.counts.map((o) => <Badge key={o.value} variant="outline">{o.label}: {o.count}</Badge>)}
        </div>
        <p className="text-[11px] text-muted-foreground">Encuesta y Administración, sin duplicados. Alternativas y discrepancias quedan fuera del pedido. Totales globales de reservas vigentes.</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <Input placeholder="Buscar participante" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select value={filter} onValueChange={(v) => setFilter(v as any)}>
          <SelectTrigger className="sm:w-52"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="confirmado">Talle confirmado · encuesta</SelectItem>
            <SelectItem value="requiere_confirmar">Requiere confirmar · encuesta</SelectItem>
            <SelectItem value="sin_respuesta">No respondió · encuesta</SelectItem>
            <SelectItem value="admin_confirmed">Confirmado por admin</SelectItem>
            <SelectItem value="admin_pending">Pendiente admin / alternativas</SelectItem>
            <SelectItem value="conflict">Discrepancias</SelectItem>
            <SelectItem value="order_pending">Sin talle para pedido</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={exportCsv} className="gap-1.5"><Download className="w-3.5 h-3.5" />CSV</Button>
      </div>

      <div className="rounded-lg border divide-y">
        {list.length === 0 && <p className="p-4 text-sm text-muted-foreground text-center">Sin resultados.</p>}
        {list.map(({ r, a, st, admin, effective }) => (
          <div key={r.reservation_id} className="space-y-3 p-3 text-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium truncate">{r.apellido} {r.nombre}</p>
              <p className="text-[11px] text-muted-foreground truncate">
                {r.is_external ? "Externo" : "Alumno"}{r.package_nombre ? ` · ${r.package_nombre}` : ""}{a?.actualizado_at ? ` · ${fmt(a.actualizado_at)}` : ""}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {a?.respuesta && <span className="font-semibold">Encuesta: {label(a.respuesta)}</span>}
              <Badge variant={st === "confirmado" ? "default" : st === "requiere_confirmar" ? "destructive" : "outline"} className="text-[10px]">
                {CHOICE_STATUS_LABELS[st]}
              </Badge>
              <Button size="icon" variant="ghost" title="Editar talle administrativo" aria-label={`Editar talle administrativo de ${r.nombre} ${r.apellido}`} onClick={() => setEditing(r.reservation_id)}><Pencil className="h-4 w-4" /></Button>
            </div>
          </div>
          {admin && <div className="text-xs space-y-1"><p>Administración: {admin.status === 'confirmed' ? `${label(admin.confirmed_value ?? undefined)} · Confirmado` : `Pendiente · Alternativas: ${admin.candidates.map(v => label(v)).join('/') || 'Sin definir'}`}</p>{admin.notes && <p className="text-muted-foreground">{admin.notes}</p>}<p className="text-muted-foreground">Actualizado: {fmt(admin.updated_at)}</p></div>}
          {effective.conflict && <p role="alert" className="text-destructive font-medium">Discrepancia entre encuesta y Administración. Revisar antes de pedir.</p>}
          {editing === r.reservation_id && <ChoiceSurveyAdminEditor reservationId={r.reservation_id} survey={survey} entry={admin} onClose={() => setEditing(null)} onSaved={() => setRevision(v => v + 1)} />}
          </div>
        ))}
      </div>
    </div>
  );
};

export default EventChoiceSurveyReport;
