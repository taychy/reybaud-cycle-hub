import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, AlertTriangle } from "lucide-react";

interface DraftRow { version: number; status: string; created_at: string; content: any }

/** Solo administración: muestra la última versión del borrador contractual. Nunca publica ni modifica el evento. */
export default function SanLuis2027ContractDraftPanel({ eventId }: { eventId: string }) {
  const [row, setRow] = useState<DraftRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    supabase.from("event_contract_drafts").select("version,status,created_at,content").eq("event_id", eventId)
      .order("version", { ascending: false }).limit(1).maybeSingle()
      .then(({ data, error }) => { if (!alive) return; if (error) setError("No se pudo leer el borrador."); setRow(data as DraftRow | null); setLoading(false); });
    return () => { alive = false; };
  }, [eventId]);
  if (loading) return <Loader2 className="w-5 h-5 animate-spin" />;
  if (error || !row) return <p className="text-sm text-muted-foreground">{error ?? "Sin borrador cargado."}</p>;
  const c = row.content ?? {};
  const vigente = row.status === "vigente";
  return (
    <div className="space-y-4">
      <Card className="border-amber-500/40">
        <CardHeader><CardTitle className="text-base flex flex-wrap items-center gap-2">
          Antes de abrir reservas con pago
          <Badge variant={vigente ? "default" : "outline"}>{vigente ? "Vigente / publicado" : "Pendiente de validación · no vigente"}</Badge>
          <Badge variant="outline">Versión {row.version}</Badge>
        </CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p className="text-muted-foreground">Reservas, seña, cuotas y cobros siguen cerrados. La preinscripción pública no cambia.</p>
          <ul className="list-disc pl-5 space-y-1">{(c.opening_blockers ?? []).map((b: any) => <li key={b.key}>{b.label}</li>)}</ul>
        </CardContent>
      </Card>
      <Card><CardHeader><CardTitle className="text-base">Flujo de reserva previsto</CardTitle></CardHeader>
        <CardContent><ol className="list-decimal pl-5 text-sm space-y-1">{(c.reservation_flow ?? []).map((s: any) => <li key={s.key}>{s.label}</li>)}</ol>
          <p className="mt-2 text-xs text-muted-foreground">El cupo se confirma a mano y falla cerrado: sin inventario del hotel ni límite simultáneo 21–24/01 confirmados, no hay plazas. No se suman 30 + 15.</p></CardContent></Card>
      <Card><CardHeader><CardTitle className="text-base">Condiciones (12 secciones · borrador)</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">{(c.sections ?? []).map((s: any) => (
          <div key={s.key}><p className="font-medium">{s.title} <span className="text-xs font-normal text-amber-500">pendiente de validación</span></p><p className="text-muted-foreground whitespace-pre-line">{s.body}</p></div>
        ))}</CardContent></Card>
      <Card><CardHeader><CardTitle className="text-base">Reprogramación · procedimiento (no ejecutado)</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <ul className="space-y-1">{Object.entries(c.rescheduling?.causes ?? {}).map(([k, v]: [string, any]) => <li key={k}><span className="font-medium">{v.label}</span> · {v.forceMajeure ? "fuerza mayor" : "no es fuerza mayor"} — <span className="text-muted-foreground">{v.note}</span></li>)}</ul>
          <ol className="list-decimal pl-5 space-y-1">{(c.rescheduling?.procedure ?? []).map((p: string, i: number) => <li key={i}>{p}</li>)}</ol>
          <p className="text-muted-foreground">{c.rescheduling?.refund_rule}</p>
        </CardContent></Card>
      {(c.internal_proposals ?? []).map((p: any) => (
        <Card key={p.key} className="border-destructive/50"><CardHeader><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-destructive" /> Propuesta interna bajo validación legal · no vigente</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-1"><p>{p.text}</p><p className="text-muted-foreground">{p.legalNote}</p><p className="text-xs">No se publica ni se descuenta automáticamente.</p></CardContent></Card>
      ))}
    </div>
  );
}
