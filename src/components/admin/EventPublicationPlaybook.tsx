import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { CheckCircle2, Circle, AlertTriangle, Loader2, RefreshCw, ChevronDown, Rocket } from "lucide-react";
import {
  evaluatePlaybook, type PlaybookInput, type PlaybookResult, type PhaseStatus, type CheckLink,
  type PlaybookChecklistState,
} from "@/lib/eventPublicationPlaybook";

interface Props {
  eventId: string;
  onNavigate?: (link: CheckLink) => void;
}

const STATUS_LABEL: Record<PhaseStatus, string> = {
  completa: "Completa",
  en_curso: "En curso",
  bloqueada: "Bloqueada",
  pendiente: "Pendiente",
};
const STATUS_VARIANT: Record<PhaseStatus, "default" | "secondary" | "destructive" | "outline"> = {
  completa: "default",
  en_curso: "secondary",
  bloqueada: "destructive",
  pendiente: "outline",
};
const LINK_LABEL: Record<CheckLink, string> = {
  editar: "Editar evento",
  presupuesto: "Ir a presupuesto",
  gestion: "Ir a gestión",
  checklist: "",
};

export default function EventPublicationPlaybook({ eventId, onNavigate }: Props) {
  const [input, setInput] = useState<PlaybookInput | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const { data: ev } = await supabase
      .from("events")
      .select("date,end_date,same_day,duration_days,duration_nights,description,short_description,image_url,location,level,incluye,no_incluye,roadbook,max_capacity,payment_mode,metadata")
      .eq("id", eventId)
      .maybeSingle();
    const { data: pk } = await supabase
      .from("event_packages" as any)
      .select("id,nombre,descripcion,precio,cupo,activo,sin_alojamiento,incluye_gastronomia")
      .eq("event_id", eventId);
    const pkgs = ((pk as any[]) || []);
    const ids = pkgs.map((p) => p.id);
    const [{ data: rooms }, { data: plans }, { data: sims }] = await Promise.all([
      supabase.from("event_rooms" as any).select("package_id,capacidad").eq("event_id", eventId),
      ids.length
        ? supabase.from("event_package_payment_plans" as any).select("package_id,activo").in("package_id", ids)
        : Promise.resolve({ data: [] as any[] }),
      supabase.from("event_cost_simulations" as any)
        .select("id,estado,version,pct_imprevistos,pct_margen_objetivo,rentabilidad_modo,honorario_por_participante,noches,capacidad_total,resultados")
        .eq("event_id", eventId)
        .order("version", { ascending: false }),
    ]);
    const simList = ((sims as any[]) || []);
    const sim = simList.find((s) => s.estado === "activa") || simList[0] || null;
    let items: any[] = [];
    if (sim) {
      const { data } = await supabase.from("event_cost_items" as any)
        .select("id,grupo_costo,categoria,descripcion,detalle").eq("simulation_id", sim.id);
      items = (data as any[]) || [];
    }
    const meta = ((ev as any)?.metadata as Record<string, any>) || {};
    setInput({
      event: (ev as any) || { date: null, end_date: null },
      packages: pkgs.map((p) => ({ ...p, precio: p.precio != null ? Number(p.precio) : null })),
      rooms: ((rooms as any[]) || []),
      paymentPlans: ((plans as any[]) || []),
      simulation: sim,
      costItems: items,
      checklist: (meta.publication_checklist as PlaybookChecklistState) || {},
    });
    setLoading(false);
  }, [eventId]);

  useEffect(() => { load(); }, [load]);

  const result: PlaybookResult | null = useMemo(() => (input ? evaluatePlaybook(input) : null), [input]);

  const toggleManual = async (kind: "qa" | "launch", id: string, value: boolean) => {
    setSavingKey(`${kind}:${id}`);
    // Leer metadata fresca y mezclar solo el checklist para no pisar otros datos.
    const { data: fresh, error: readErr } = await supabase.from("events").select("metadata").eq("id", eventId).maybeSingle();
    if (readErr) { toast.error("No se pudo leer el evento"); setSavingKey(null); return; }
    const meta = ((fresh?.metadata as Record<string, any>) || {});
    const cl: PlaybookChecklistState = meta.publication_checklist || {};
    const next: PlaybookChecklistState = { ...cl, [kind]: { ...(cl[kind] || {}), [id]: value } };
    const { error } = await supabase.from("events")
      .update({ metadata: { ...meta, publication_checklist: next } as any })
      .eq("id", eventId);
    setSavingKey(null);
    if (error) { toast.error("No se pudo guardar el checklist"); return; }
    setInput((prev) => (prev ? { ...prev, event: { ...prev.event, metadata: { ...meta, publication_checklist: next } }, checklist: next } : prev));
  };

  if (loading || !result) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
        <Loader2 className="w-4 h-4 animate-spin" /> Evaluando estado de publicación…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="text-sm font-semibold text-foreground uppercase tracking-wide">Estado de publicación</div>
              <p className="text-xs text-muted-foreground mt-1 max-w-xl">
                Se calcula con los datos reales del evento. No publica nada: la publicación sigue siendo manual desde "Editar evento".
              </p>
            </div>
            <div className="flex items-center gap-2">
              {result.readyToPublish ? (
                <Badge className="gap-1"><Rocket className="w-3.5 h-3.5" /> Listo para publicar</Badge>
              ) : (
                <Badge variant="outline" className="gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  {result.criticalPending > 0 ? `${result.criticalPending} bloqueo(s) crítico(s)` : "Falta completar QA"}
                </Badge>
              )}
              <Button size="icon" variant="ghost" onClick={load} title="Recalcular"><RefreshCw className="w-4 h-4" /></Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Progreso global</span>
            <span className="font-semibold text-foreground">{result.progress}%</span>
          </div>
          <Progress value={result.progress} />
          <div className="text-xs text-muted-foreground">
            Capacidad comercial: {result.capacidadComercial != null ? `${result.capacidadComercial} lugares (según cupos)` : "sin definir"}
          </div>
        </CardContent>
      </Card>

      {result.phases.map((phase) => {
        const pendientes = phase.checks.filter((c) => !c.ok).length;
        const isOpen = open[phase.id] ?? phase.status !== "completa";
        const manualKind = phase.id === "qa" ? "qa" : phase.id === "lanzamiento" ? "launch" : null;
        return (
          <Card key={phase.id}>
            <button
              type="button"
              onClick={() => setOpen((o) => ({ ...o, [phase.id]: !isOpen }))}
              className="w-full flex items-center justify-between gap-3 p-4 text-left"
              aria-expanded={isOpen}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-xs font-semibold text-muted-foreground w-5">{phase.numero}</span>
                <span className="text-sm font-semibold text-foreground">{phase.titulo}</span>
                <Badge variant={STATUS_VARIANT[phase.status]} className="text-[10px]">{STATUS_LABEL[phase.status]}</Badge>
                {pendientes > 0 && <span className="text-[11px] text-muted-foreground">{pendientes} pendiente(s)</span>}
              </div>
              <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
            </button>
            {isOpen && (
              <CardContent className="pt-0 space-y-1.5">
                {phase.checks.map((c) => (
                  <div key={c.id} className="flex items-start gap-2.5 rounded-md border border-border/50 px-3 py-2">
                    {manualKind ? (
                      <Checkbox
                        checked={c.ok}
                        disabled={savingKey === `${manualKind}:${c.id}`}
                        onCheckedChange={(v) => toggleManual(manualKind, c.id, !!v)}
                        className="mt-0.5"
                      />
                    ) : c.ok ? (
                      <CheckCircle2 className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                    ) : c.severity === "critico" ? (
                      <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
                    ) : (
                      <Circle className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm ${c.ok ? "text-muted-foreground" : "text-foreground"}`}>
                        {c.label}
                        {!c.ok && !c.manual && (
                          <span className={`ml-2 text-[10px] uppercase tracking-wider ${c.severity === "critico" ? "text-destructive" : "text-muted-foreground"}`}>
                            {c.severity === "critico" ? "Crítico" : "Recomendado"}
                          </span>
                        )}
                      </div>
                      {c.hint && <div className="text-[11px] text-muted-foreground mt-0.5">{c.hint}</div>}
                    </div>
                    {!c.ok && c.link && c.link !== "checklist" && onNavigate && (
                      <Button size="sm" variant="ghost" className="h-7 text-xs shrink-0" onClick={() => onNavigate(c.link!)}>
                        {LINK_LABEL[c.link]}
                      </Button>
                    )}
                  </div>
                ))}
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}
