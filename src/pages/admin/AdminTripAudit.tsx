import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { AlertTriangle, ExternalLink, ArrowLeft, Loader2 } from "lucide-react";
import {
  AUDIT_SECTIONS, auditProgress, itemKey, type AuditLink, type AuditState, type AuditStatus,
} from "@/lib/tripTechnicalAudit";

const DEFAULT_EVENT_ID = "4c37ae21-fa91-415c-aede-4b0b5240b424"; // caso de prueba inicial; cualquier viaje funciona

interface Ev { id: string; title: string; date: string | null; metadata: any }

const STATUS_LABEL: Record<AuditStatus, string> = { pendiente: "Pendiente", ok: "OK", error: "Error" };

export default function AdminTripAudit() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [events, setEvents] = useState<Ev[]>([]);
  const [state, setState] = useState<AuditState>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { observaciones?: string; responsable?: string }>>({});
  const [userEmail, setUserEmail] = useState<string>("");

  const eventId = params.get("eventId") || "";

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserEmail(data.user?.email || ""));
    (async () => {
      const { data } = await supabase.from("events").select("id,title,date,metadata,type")
        .in("type", ["camp", "viaje"] as any).order("date", { ascending: false });
      const list = (data as any[]) || [];
      setEvents(list);
      if (!params.get("eventId") && list.length) {
        const def = list.find((e) => e.id === DEFAULT_EVENT_ID) || list[0];
        setParams({ eventId: def.id }, { replace: true });
      }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadState = useCallback(async () => {
    if (!eventId) return;
    const { data } = await supabase.from("events").select("metadata").eq("id", eventId).maybeSingle();
    setState(((data?.metadata as any)?.technical_audit as AuditState) || {});
    setDrafts({});
  }, [eventId]);
  useEffect(() => { loadState(); }, [loadState]);

  const progress = useMemo(() => auditProgress(state), [state]);
  const current = events.find((e) => e.id === eventId);

  const linkFor = (l: AuditLink): string => {
    switch (l) {
      case "landing": return `/eventos/${eventId}`;
      case "lista_espera": return `/admin/eventos/${eventId}/lista-espera`;
      case "gestion": return `/admin/eventos`;
      case "terminos": return `/terminos-eventos`;
      case "mis_reservas": return `/mis-reservas`;
      case "cambios_paquete": return `/admin/cambios-paquete`;
      case "comunicaciones": return `/admin/comunicaciones`;
    }
  };

  const save = async (key: string, patch: Partial<{ status: AuditStatus; observaciones: string; responsable: string }>) => {
    setSaving(key);
    // Leer metadata fresca y mezclar solo este ítem para no pisar otros datos ni cambios simultáneos.
    const { data: fresh, error: rErr } = await supabase.from("events").select("metadata").eq("id", eventId).maybeSingle();
    if (rErr) { toast.error("No se pudo leer el viaje"); setSaving(null); return; }
    const meta = ((fresh?.metadata as any) || {}) as Record<string, any>;
    const audit: AuditState = meta.technical_audit || {};
    const prev = audit[key] || { status: "pendiente" as AuditStatus };
    const next: AuditState = {
      ...audit,
      [key]: {
        ...prev, ...patch,
        responsable: patch.responsable ?? prev.responsable ?? userEmail,
        updated_at: new Date().toISOString(),
        updated_by: userEmail,
      },
    };
    const { error } = await supabase.from("events").update({ metadata: { ...meta, technical_audit: next } as any }).eq("id", eventId);
    setSaving(null);
    if (error) { toast.error("No se pudo guardar"); return; }
    setState(next);
    setDrafts((d) => { const c = { ...d }; delete c[key]; return c; });
  };

  if (loading) return <div className="p-6 flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Cargando…</div>;

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-5xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Testeo técnico de viaje</h1>
          <p className="text-sm text-muted-foreground">Auditoría humana paso a paso antes de publicar o vender.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => navigate(`/admin/eventos`)} disabled={!eventId}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Ficha del viaje
          </Button>
          <Button size="sm" onClick={() => window.open(`/eventos/${eventId}`, "_blank")} disabled={!eventId}>
            <ExternalLink className="w-4 h-4 mr-1" /> Abrir landing
          </Button>
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-foreground">
        <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
        <span>Usá solo datos de prueba identificables (ej. nombre "PRUEBA – …" y un email de prueba). Al terminar, anulá/limpiá todas las reservas de prueba. Nunca modifiques ni canceles ventas reales.</span>
      </div>

      <Select value={eventId} onValueChange={(v) => setParams({ eventId: v })}>
        <SelectTrigger className="max-w-md"><SelectValue placeholder="Elegí un viaje" /></SelectTrigger>
        <SelectContent>
          {events.map((e) => <SelectItem key={e.id} value={e.id}>{e.title}{e.date ? ` · ${e.date.split("-").reverse().join("/")}` : ""}</SelectItem>)}
        </SelectContent>
      </Select>

      {current && (
        <Card>
          <CardContent className="pt-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Progreso</span>
              <span className="font-semibold text-foreground">{progress.pct}%</span>
            </div>
            <Progress value={progress.pct} />
            <div className="flex gap-2 flex-wrap text-xs">
              <Badge>OK {progress.ok}</Badge>
              <Badge variant="destructive">Error {progress.error}</Badge>
              <Badge variant="outline">Pendiente {progress.pendiente}</Badge>
              <span className="text-muted-foreground">de {progress.total} controles</span>
            </div>
          </CardContent>
        </Card>
      )}

      {current && AUDIT_SECTIONS.map((sec, si) => (
        <Card key={sec.id}>
          <CardHeader className="pb-2">
            <div className="text-sm font-semibold uppercase tracking-wide text-foreground">{si + 1}. {sec.titulo}</div>
          </CardHeader>
          <CardContent className="space-y-2">
            {sec.items.map((it) => {
              const key = itemKey(sec.id, it.id);
              const st = state[key];
              const status = st?.status || "pendiente";
              const draft = drafts[key] || {};
              const obs = draft.observaciones ?? st?.observaciones ?? "";
              const resp = draft.responsable ?? st?.responsable ?? "";
              const dirty = draft.observaciones !== undefined || draft.responsable !== undefined;
              return (
                <div key={key} className={`rounded-md border p-3 space-y-2 ${status === "error" ? "border-destructive/60" : status === "ok" ? "border-primary/50" : "border-border/60"}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm text-foreground flex-1 min-w-[200px]">{it.label}</span>
                    <div className="flex gap-1 items-center">
                      {it.link && (
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => window.open(linkFor(it.link!), "_blank")}>
                          Abrir <ExternalLink className="w-3 h-3 ml-1" />
                        </Button>
                      )}
                      {(["pendiente", "ok", "error"] as AuditStatus[]).map((s) => (
                        <Button key={s} size="sm" className="h-7 text-xs" disabled={saving === key}
                          variant={status === s ? (s === "error" ? "destructive" : s === "ok" ? "default" : "secondary") : "outline"}
                          onClick={() => save(key, { status: s })}>
                          {STATUS_LABEL[s]}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <div className="grid md:grid-cols-[1fr_200px_auto] gap-2">
                    <Textarea rows={1} placeholder="Observaciones" value={obs}
                      onChange={(e) => setDrafts((d) => ({ ...d, [key]: { ...d[key], observaciones: e.target.value } }))} />
                    <Input placeholder="Responsable" value={resp}
                      onChange={(e) => setDrafts((d) => ({ ...d, [key]: { ...d[key], responsable: e.target.value } }))} />
                    <Button size="sm" variant="outline" disabled={!dirty || saving === key}
                      onClick={() => save(key, { observaciones: obs, responsable: resp })}>Guardar</Button>
                  </div>
                  {st?.updated_at && (
                    <div className="text-[11px] text-muted-foreground">
                      Última actualización: {new Date(st.updated_at).toLocaleString("es-AR")}{st.updated_by ? ` · ${st.updated_by}` : ""}
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
