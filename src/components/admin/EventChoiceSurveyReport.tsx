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
import { Download, Loader2 } from "lucide-react";
import {
  CHOICE_STATUS_LABELS, choiceAnswerStatus, choiceSurveyStepKey, getChoiceSurveys, isActiveReservation,
  summarizeChoiceSurvey, type ChoiceAnswerStatus, type ChoiceSurveyConfig,
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
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | ChoiceAnswerStatus>("all");
  const [q, setQ] = useState("");
  const active = useMemo(() => rows.filter((r) => isActiveReservation(r.reservation_status)), [rows]);

  useEffect(() => {
    const ids = active.map((r) => r.reservation_id);
    if (!ids.length) { setAnswers({}); setLoading(false); return; }
    setLoading(true);
    supabase.from("reservation_checklist_data").select("reservation_id, data")
      .in("reservation_id", ids).eq("step_key", choiceSurveyStepKey(survey.key))
      .then(({ data }) => {
        const m: Record<string, any> = {};
        (data || []).forEach((d: any) => { m[d.reservation_id] = d.data; });
        setAnswers(m); setLoading(false);
      });
  }, [active, survey.key]);

  const summary = useMemo(() => summarizeChoiceSurvey(survey, active.map((r) => answers[r.reservation_id])), [survey, active, answers]);
  const label = (v?: string) => survey.options.find((o) => o.value === v)?.label ?? "";

  const list = active
    .map((r) => ({ r, a: answers[r.reservation_id], st: choiceAnswerStatus(survey, answers[r.reservation_id]) }))
    .filter((x) => filter === "all" || x.st === filter)
    .filter((x) => !q || `${x.r.nombre} ${x.r.apellido}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => `${a.r.apellido} ${a.r.nombre}`.localeCompare(`${b.r.apellido} ${b.r.nombre}`));

  const exportCsv = () => {
    const lines = [
      ["Apellido", "Nombre", "Tipo", "Paquete", "Respuesta", "Estado", "Respondido", "Actualizado"],
      ...list.map(({ r, a, st }) => [r.apellido, r.nombre, r.is_external ? "Externo" : "Alumno", r.package_nombre ?? "", label(a?.respuesta), CHOICE_STATUS_LABELS[st], fmt(a?.respondido_at), fmt(a?.actualizado_at)]),
      [], ["Totales por opción (solo respuestas definitivas)"],
      ...summary.porOpcion.map((o) => [o.label, String(o.count)]),
      ["Requiere confirmar", String(summary.requiereConfirmar)], ["No respondió", String(summary.sinRespuesta)],
    ];
    const blob = new Blob(["\uFEFF" + lines.map((l) => l.map(csvCell).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${survey.key}_${eventTitle.replace(/\s+/g, "_")}.csv`;
    a.click();
  };

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          ["Reservas vigentes", summary.total],
          ["Confirmados", summary.confirmados],
          ["Requiere confirmar", summary.requiereConfirmar],
          ["No respondió", summary.sinRespuesta],
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
          {summary.porOpcion.map((o) => <Badge key={o.value} variant="outline">{o.label}: {o.count}</Badge>)}
        </div>
        <p className="text-[11px] text-muted-foreground">"No estoy seguro/a" no se cuenta: requiere seguimiento.</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <Input placeholder="Buscar participante" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select value={filter} onValueChange={(v) => setFilter(v as any)}>
          <SelectTrigger className="sm:w-52"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="confirmado">Confirmados</SelectItem>
            <SelectItem value="requiere_confirmar">Requiere confirmar</SelectItem>
            <SelectItem value="sin_respuesta">No respondió</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={exportCsv} className="gap-1.5"><Download className="w-3.5 h-3.5" />CSV</Button>
      </div>

      <div className="rounded-lg border divide-y">
        {list.length === 0 && <p className="p-4 text-sm text-muted-foreground text-center">Sin resultados.</p>}
        {list.map(({ r, a, st }) => (
          <div key={r.reservation_id} className="flex items-center justify-between gap-3 p-3 text-sm">
            <div className="min-w-0">
              <p className="font-medium truncate">{r.apellido} {r.nombre}</p>
              <p className="text-[11px] text-muted-foreground truncate">
                {r.is_external ? "Externo" : "Alumno"}{r.package_nombre ? ` · ${r.package_nombre}` : ""}{a?.actualizado_at ? ` · ${fmt(a.actualizado_at)}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {a?.respuesta && <span className="font-semibold">{label(a.respuesta)}</span>}
              <Badge variant={st === "confirmado" ? "default" : st === "requiere_confirmar" ? "destructive" : "outline"} className="text-[10px]">
                {CHOICE_STATUS_LABELS[st]}
              </Badge>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default EventChoiceSurveyReport;
