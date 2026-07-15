import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Activity, Search, ExternalLink, CheckCircle2, Clock, XCircle, Workflow } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

const sb: any = supabase;

interface Row {
  id: string;
  template_id: string;
  template_name: string;
  plan_id: string | null;
  plan_nombre: string | null;
  estado: "en_curso" | "completada" | "cancelada";
  started_at: string;
  completed_at: string | null;
  total_stages: number;
  done_stages: number;
  current_stage: string | null;
}

export default function AdminProcesos() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"en_curso" | "completada" | "cancelada">("en_curso");

  const load = async () => {
    setLoading(true);
    const { data: instances } = await sb
      .from("process_instances")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(300);

    const list = (instances || []) as any[];
    if (list.length === 0) { setRows([]); setLoading(false); return; }

    const tplIds = [...new Set(list.map((i) => i.template_id))];
    const planIds = [...new Set(list.map((i) => i.plan_id).filter(Boolean))];
    const instIds = list.map((i) => i.id);

    const [{ data: tpls }, { data: planes }, { data: stages }] = await Promise.all([
      sb.from("process_templates").select("id,nombre").in("id", tplIds),
      planIds.length ? sb.from("planes").select("id,nombre").in("id", planIds) : Promise.resolve({ data: [] }),
      sb.from("process_instance_stages").select("instance_id,estado,orden").in("instance_id", instIds).order("orden", { ascending: true }),
    ]);

    // fetch template stages titles for "current stage"
    const { data: tplStages } = await sb
      .from("process_template_stages")
      .select("id,titulo,orden,template_id")
      .in("template_id", tplIds);

    const tplMap = Object.fromEntries((tpls || []).map((t: any) => [t.id, t.nombre]));
    const planMap = Object.fromEntries((planes || []).map((p: any) => [p.id, p.nombre]));

    const stagesByInst: Record<string, any[]> = {};
    (stages || []).forEach((s: any) => {
      (stagesByInst[s.instance_id] ||= []).push(s);
    });

    const mapped: Row[] = list.map((inst) => {
      const st = stagesByInst[inst.id] || [];
      const done = st.filter((s) => s.estado === "completada").length;
      const total = st.length;
      const current = st.find((s) => s.estado === "en_curso");
      const currentTitle = current
        ? (tplStages || []).find((ts: any) => ts.template_id === inst.template_id && ts.orden === current.orden)?.titulo || null
        : null;
      return {
        id: inst.id,
        template_id: inst.template_id,
        template_name: tplMap[inst.template_id] || "—",
        plan_id: inst.plan_id,
        plan_nombre: inst.plan_id ? planMap[inst.plan_id] || null : null,
        estado: inst.estado,
        started_at: inst.started_at,
        completed_at: inst.completed_at,
        total_stages: total,
        done_stages: done,
        current_stage: currentTitle,
      };
    });

    setRows(mapped);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const ch = sb
      .channel("admin-procesos")
      .on("postgres_changes", { event: "*", schema: "public", table: "process_instances" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "process_instance_stages" }, () => load())
      .subscribe();
    return () => { sb.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter((r) => r.estado === tab)
      .filter((r) =>
        !q ||
        r.template_name.toLowerCase().includes(q) ||
        (r.plan_nombre || "").toLowerCase().includes(q) ||
        (r.current_stage || "").toLowerCase().includes(q)
      );
  }, [rows, tab, search]);

  const counts = useMemo(
    () => ({
      en_curso: rows.filter((r) => r.estado === "en_curso").length,
      completada: rows.filter((r) => r.estado === "completada").length,
      cancelada: rows.filter((r) => r.estado === "cancelada").length,
    }),
    [rows]
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-heading font-bold uppercase tracking-wider flex items-center gap-2">
            <Workflow className="w-6 h-6 text-primary" />
            Procesos activos
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Vista global de flujos en ejecución (programas, cohortes, pedidos, etc.)
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/admin/procesos/plantillas">Plantillas</Link>
        </Button>
      </div>

      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <KPI icon={<Activity className="w-4 h-4" />} label="En curso" value={counts.en_curso} tone="primary" />
        <KPI icon={<CheckCircle2 className="w-4 h-4" />} label="Completados" value={counts.completada} tone="success" />
        <KPI icon={<XCircle className="w-4 h-4" />} label="Cancelados" value={counts.cancelada} tone="muted" />
        <KPI icon={<Clock className="w-4 h-4" />} label="Total" value={rows.length} tone="muted" />
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Buscar por plantilla, plan o etapa…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="en_curso">En curso ({counts.en_curso})</TabsTrigger>
          <TabsTrigger value="completada">Completados ({counts.completada})</TabsTrigger>
          <TabsTrigger value="cancelada">Cancelados ({counts.cancelada})</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4">
          {loading ? (
            <div className="text-muted-foreground text-sm">Cargando…</div>
          ) : filtered.length === 0 ? (
            <Card><CardContent className="py-10 text-center text-muted-foreground text-sm">
              No hay procesos en este estado.
            </CardContent></Card>
          ) : (
            <div className="grid gap-3">
              {filtered.map((r) => {
                const pct = r.total_stages ? Math.round((r.done_stages / r.total_stages) * 100) : 0;
                const detailHref = r.plan_id
                  ? `/admin/programas/${r.plan_id}/flujo/${r.id}`
                  : `/admin/procesos/plantillas`;
                return (
                  <Card key={r.id} className="hover:border-primary/50 transition-colors">
                    <CardContent className="py-4">
                      <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold truncate">{r.template_name}</span>
                            {r.plan_nombre && (
                              <Badge variant="outline" className="text-xs">{r.plan_nombre}</Badge>
                            )}
                            <StatusBadge estado={r.estado} />
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            Iniciado {format(new Date(r.started_at), "dd MMM yyyy HH:mm", { locale: es })}
                            {r.current_stage && (
                              <> · Etapa actual: <span className="text-foreground">{r.current_stage}</span></>
                            )}
                          </div>
                          <div className="mt-3 max-w-md">
                            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                              <span>{r.done_stages}/{r.total_stages} etapas</span>
                              <span>{pct}%</span>
                            </div>
                            <Progress value={pct} className="h-1.5" />
                          </div>
                        </div>
                        <Button asChild size="sm" variant="secondary">
                          <Link to={detailHref}>
                            Abrir <ExternalLink className="w-3.5 h-3.5 ml-1" />
                          </Link>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function KPI({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: "primary" | "success" | "muted" }) {
  const color = tone === "primary" ? "text-primary" : tone === "success" ? "text-emerald-500" : "text-muted-foreground";
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className={`text-xs font-medium uppercase tracking-wider flex items-center gap-2 ${color}`}>
          {icon} {label}
        </CardTitle>
      </CardHeader>
      <CardContent><div className="text-2xl font-bold">{value}</div></CardContent>
    </Card>
  );
}

function StatusBadge({ estado }: { estado: Row["estado"] }) {
  if (estado === "en_curso") return <Badge className="bg-primary/15 text-primary border-primary/30">En curso</Badge>;
  if (estado === "completada") return <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30">Completado</Badge>;
  return <Badge variant="outline" className="text-muted-foreground">Cancelado</Badge>;
}
