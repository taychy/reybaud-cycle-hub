import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  CheckCircle2, XCircle, SkipForward, MessageCircle, ChevronLeft, ChevronRight,
  AlertTriangle, ExternalLink, Users, CalendarDays, RefreshCw, Phone,
} from "lucide-react";
import { normalizePhoneAR, formatPhoneAR } from "@/lib/phoneNormalize";

type Alumno = {
  id: string;
  nombre: string;
  apellido: string | null;
  email: string;
  telefono: string | null;
  grupo: string;
  estado: string;
};

type Sub = {
  alumno_id: string;
  estado: string;
  fecha_fin: string | null;
  planes: { nombre: string } | null;
};

type ItemRow = {
  id?: string;
  alumno: Alumno;
  resultado: "pendiente" | "presente" | "ausente" | "saltado";
  nota: string;
  plan_inconsistente: boolean;
  hasActivePlan: boolean;
  planName: string;
  paymentBadge: { label: string; cls: string };
};

type Step = 1 | 2 | 3 | 4;

const today = () => new Date().toISOString().split("T")[0];

const suggestFechaObjetivo = (): string => {
  const d = new Date();
  const day = d.getDate();
  const y = d.getFullYear();
  const m = d.getMonth();
  const fmt = (yy: number, mm: number, dd: number) =>
    `${yy}-${String(mm + 1).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
  if (day <= 7) return fmt(y, m, 5);
  if (day <= 17) return fmt(y, m, 15);
  // Después del 17 → próximo 5 del mes siguiente
  const nm = new Date(y, m + 1, 5);
  return fmt(nm.getFullYear(), nm.getMonth(), 5);
};

const paymentBadgeFor = (sub: Sub | undefined): { label: string; cls: string } => {
  if (!sub) return { label: "Sin plan", cls: "bg-muted text-muted-foreground border-border" };
  const t = today();
  if (sub.estado === "activa" && (!sub.fecha_fin || sub.fecha_fin >= t))
    return { label: "Pagado", cls: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30" };
  if (sub.estado === "pendiente" || sub.estado === "pendiente_verificacion")
    return { label: "Por cobrar", cls: "bg-amber-500/15 text-amber-600 border-amber-500/30" };
  if (sub.estado === "vencida" || (sub.fecha_fin && sub.fecha_fin < t))
    return { label: "Vencido", cls: "bg-red-500/15 text-red-600 border-red-500/30" };
  return { label: sub.estado, cls: "bg-muted text-muted-foreground border-border" };
};

const WhatsAppConciliador = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [alumnos, setAlumnos] = useState<Alumno[]>([]);
  const [subs, setSubs] = useState<Sub[]>([]);
  const [grupos, setGrupos] = useState<string[]>([]);
  const [lastRuns, setLastRuns] = useState<Record<string, { fecha_objetivo: string; estado: string } | undefined>>({});

  // Wizard state
  const [step, setStep] = useState<Step>(1);
  const [selectedGrupo, setSelectedGrupo] = useState<string>(searchParams.get("grupo") || "");
  const [fechaObjetivo, setFechaObjetivo] = useState<string>(searchParams.get("fecha") || suggestFechaObjetivo());
  const [runId, setRunId] = useState<string | null>(null);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate("/admin/login"); return; }
      const [{ data: alums }, { data: ss }, { data: runs }] = await Promise.all([
        supabase.from("alumnos").select("id, nombre, apellido, email, telefono, grupo, estado").in("estado", ["activo", "vacaciones"]),
        supabase.from("suscripciones").select("alumno_id, estado, fecha_fin, planes(nombre)").in("estado", ["activa", "pendiente", "pendiente_verificacion", "vencida"]),
        supabase.from("whatsapp_check_runs").select("grupo, fecha_objetivo, estado").order("fecha_objetivo", { ascending: false }).limit(200),
      ]);
      const list = (alums || []) as Alumno[];
      setAlumnos(list);
      setSubs((ss || []) as unknown as Sub[]);
      const uniq = Array.from(new Set(list.map(a => a.grupo).filter(g => g && g !== "Sin grupo")));
      uniq.sort();
      setGrupos(uniq);
      const byGrupo: Record<string, { fecha_objetivo: string; estado: string } | undefined> = {};
      (runs || []).forEach((r: any) => { if (!byGrupo[r.grupo]) byGrupo[r.grupo] = { fecha_objetivo: r.fecha_objetivo, estado: r.estado }; });
      setLastRuns(byGrupo);
      setLoading(false);
    };
    init();
  }, [navigate]);

  const grupoStats = useMemo(() => {
    const m = new Map<string, number>();
    alumnos.forEach(a => { if (a.grupo && a.grupo !== "Sin grupo") m.set(a.grupo, (m.get(a.grupo) || 0) + 1); });
    return m;
  }, [alumnos]);

  const subByAlumno = useMemo(() => {
    const m = new Map<string, Sub>();
    // Prioriza activa, luego pendiente, luego vencida
    const order: Record<string, number> = { activa: 0, pendiente: 1, pendiente_verificacion: 1, vencida: 2 };
    [...subs].sort((a, b) => (order[a.estado] ?? 99) - (order[b.estado] ?? 99)).forEach(s => {
      if (!m.has(s.alumno_id)) m.set(s.alumno_id, s);
    });
    return m;
  }, [subs]);

  const startCheck = async () => {
    if (!selectedGrupo) { toast({ title: "Elegí un grupo", variant: "destructive" }); return; }
    setSubmitting(true);
    try {
      const grupoAlumnos = alumnos
        .filter(a => a.grupo === selectedGrupo)
        .sort((a, b) => `${a.nombre} ${a.apellido || ""}`.localeCompare(`${b.nombre} ${b.apellido || ""}`));

      const { data: { session } } = await supabase.auth.getSession();
      const { data: run, error: runErr } = await supabase.from("whatsapp_check_runs").insert({
        grupo: selectedGrupo,
        fecha_objetivo: fechaObjetivo,
        admin_id: session?.user?.id || null,
        total_esperados: grupoAlumnos.length,
        estado: "en_progreso",
      } as any).select().single();
      if (runErr) throw runErr;

      const itemsToInsert = grupoAlumnos.map(a => ({
        run_id: run.id,
        alumno_id: a.id,
        nombre_snapshot: `${a.nombre} ${a.apellido || ""}`.trim(),
        resultado: "pendiente",
      }));
      const { data: insertedItems, error: itErr } = await supabase
        .from("whatsapp_check_items").insert(itemsToInsert as any).select();
      if (itErr) throw itErr;

      const rows: ItemRow[] = (insertedItems || []).map((it: any) => {
        const a = grupoAlumnos.find(x => x.id === it.alumno_id)!;
        const s = subByAlumno.get(a.id);
        return {
          id: it.id,
          alumno: a,
          resultado: "pendiente",
          nota: "",
          plan_inconsistente: false,
          hasActivePlan: !!s && (s.estado === "activa" || s.estado === "pendiente"),
          planName: s?.planes?.nombre || "—",
          paymentBadge: paymentBadgeFor(s),
        };
      });
      setItems(rows);
      setRunId(run.id);
      setCurrentIdx(0);
      setStep(2);
    } catch (e: any) {
      toast({ title: "Error al iniciar", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const markCurrent = async (resultado: "presente" | "ausente" | "saltado", nota?: string) => {
    const cur = items[currentIdx];
    if (!cur) return;
    const planInc = resultado === "ausente" && cur.hasActivePlan;
    const updated = { ...cur, resultado, nota: nota ?? cur.nota, plan_inconsistente: planInc };
    const next = [...items];
    next[currentIdx] = updated;
    setItems(next);

    if (cur.id) {
      await supabase.from("whatsapp_check_items").update({
        resultado, nota: updated.nota || null, plan_inconsistente: planInc, checked_at: new Date().toISOString(),
      } as any).eq("id", cur.id);
    }
    if (currentIdx < items.length - 1) {
      setCurrentIdx(currentIdx + 1);
    } else {
      // último → ir a revisión
      goToReview(next);
    }
  };

  const goToReview = async (rows = items) => {
    const confirmados = rows.filter(r => r.resultado === "presente").length;
    const faltantes = rows.filter(r => r.resultado === "ausente").length;
    const saltados = rows.filter(r => r.resultado === "saltado" || r.resultado === "pendiente").length;
    const planRevision = rows.filter(r => r.plan_inconsistente).length;
    if (runId) {
      await supabase.from("whatsapp_check_runs").update({
        confirmados, faltantes, saltados, plan_revision: planRevision,
      } as any).eq("id", runId);
    }
    setStep(3);
  };

  const closeRun = async () => {
    if (!runId) return;
    setSubmitting(true);
    try {
      await supabase.from("whatsapp_check_runs").update({
        estado: "cerrado", cerrado_at: new Date().toISOString(),
      } as any).eq("id", runId);
      setStep(4);
    } finally { setSubmitting(false); }
  };

  if (loading) return <div className="text-muted-foreground">Cargando…</div>;

  // ============ RENDER ============
  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-heading font-bold uppercase tracking-wider">Chequeo de WhatsApp</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Revisamos grupo por grupo, alumno por alumno, si están en el grupo de WhatsApp correspondiente. Hacelo los días 5 y 15 de cada mes.
        </p>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-2 text-xs">
        {[
          { n: 1, label: "Grupo" },
          { n: 2, label: "Chequeo" },
          { n: 3, label: "Revisión" },
          { n: 4, label: "Cierre" },
        ].map((s, i) => (
          <div key={s.n} className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold ${
              step === s.n ? "bg-primary text-primary-foreground"
              : step > s.n ? "bg-emerald-500/20 text-emerald-600"
              : "bg-muted text-muted-foreground"
            }`}>{s.n}</div>
            <span className={step === s.n ? "font-semibold" : "text-muted-foreground"}>{s.label}</span>
            {i < 3 && <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
          </div>
        ))}
      </div>

      {/* PASO 1: Selección de grupo */}
      {step === 1 && (
        <Card>
          <CardHeader><CardTitle className="text-base">1. Elegí grupo y fecha</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <Label>Grupo de WhatsApp</Label>
                <Select value={selectedGrupo} onValueChange={setSelectedGrupo}>
                  <SelectTrigger><SelectValue placeholder="Elegí un grupo…" /></SelectTrigger>
                  <SelectContent>
                    {grupos.map(g => {
                      const last = lastRuns[g];
                      return (
                        <SelectItem key={g} value={g}>
                          {g} <span className="text-muted-foreground ml-1">({grupoStats.get(g) || 0} activos{last ? ` · último ${last.fecha_objetivo}` : ""})</span>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Fecha objetivo del chequeo</Label>
                <Input type="date" value={fechaObjetivo} onChange={e => setFechaObjetivo(e.target.value)} />
                <p className="text-xs text-muted-foreground mt-1">Sugerimos el 5 o 15 del mes en curso.</p>
              </div>
            </div>

            {selectedGrupo && (
              <Card className="bg-muted/30 border-border">
                <CardContent className="p-4 flex items-center gap-3 text-sm">
                  <Users className="w-5 h-5 text-primary" />
                  <div>
                    <p className="font-semibold">{grupoStats.get(selectedGrupo) || 0} alumnos esperados</p>
                    <p className="text-xs text-muted-foreground">Vas a revisar uno por uno si están en el grupo de WhatsApp.</p>
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="flex justify-end">
              <Button onClick={startCheck} disabled={!selectedGrupo || submitting} size="lg">
                Iniciar chequeo <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* PASO 2: Checklist */}
      {step === 2 && items.length > 0 && (() => {
        const cur = items[currentIdx];
        const phone = normalizePhoneAR(cur.alumno.telefono);
        const progress = ((currentIdx) / items.length) * 100;
        return (
          <>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Alumno {currentIdx + 1} de {items.length} · {selectedGrupo}</span>
                <span>{items.filter(i => i.resultado !== "pendiente").length} revisados</span>
              </div>
              <Progress value={progress} />
            </div>

            <Card className="border-primary/30">
              <CardContent className="p-6 space-y-4">
                <div className="flex items-start gap-4">
                  <div className="w-14 h-14 rounded-full bg-primary/15 text-primary flex items-center justify-center font-bold text-xl shrink-0">
                    {(cur.alumno.nombre[0] || "?").toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="text-xl font-heading font-bold">
                      {cur.alumno.nombre} {cur.alumno.apellido || ""}
                    </h2>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <Badge variant="outline" className="text-xs">{cur.planName}</Badge>
                      <Badge variant="outline" className={`text-xs ${cur.paymentBadge.cls}`}>{cur.paymentBadge.label}</Badge>
                      {cur.alumno.estado === "vacaciones" && (
                        <Badge variant="outline" className="text-xs bg-blue-500/15 text-blue-600 border-blue-500/30">En vacaciones</Badge>
                      )}
                    </div>
                    {cur.alumno.telefono && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mt-2">
                        <Phone className="w-3.5 h-3.5" />
                        {formatPhoneAR(cur.alumno.telefono)}
                        {phone && (
                          <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => window.open(`https://wa.me/${phone}`, "_blank")}>
                            <MessageCircle className="w-3.5 h-3.5 mr-1" />Abrir WhatsApp
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2">
                  <Button onClick={() => markCurrent("presente")} size="lg" className="bg-emerald-600 hover:bg-emerald-700 text-white">
                    <CheckCircle2 className="w-5 h-5 mr-2" /> Está en el grupo
                  </Button>
                  <Button onClick={() => markCurrent("ausente")} size="lg" variant="destructive">
                    <XCircle className="w-5 h-5 mr-2" /> No está
                  </Button>
                  <Button onClick={() => markCurrent("saltado")} size="lg" variant="outline">
                    <SkipForward className="w-5 h-5 mr-2" /> Saltar
                  </Button>
                </div>

                <Textarea
                  placeholder="Nota opcional (motivo, qué hacer, etc.)"
                  value={cur.nota}
                  onChange={e => {
                    const next = [...items];
                    next[currentIdx] = { ...cur, nota: e.target.value };
                    setItems(next);
                  }}
                  rows={2}
                />

                <div className="flex items-center justify-between pt-2 border-t border-border">
                  <Button variant="ghost" size="sm" disabled={currentIdx === 0} onClick={() => setCurrentIdx(currentIdx - 1)}>
                    <ChevronLeft className="w-4 h-4 mr-1" /> Anterior
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => goToReview()}>
                    Saltar al resumen <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </>
        );
      })()}

      {/* PASO 3: Revisión de inconsistencias */}
      {step === 3 && (() => {
        const inconsist = items.filter(i => i.plan_inconsistente);
        const ausentes = items.filter(i => i.resultado === "ausente" && !i.plan_inconsistente);
        return (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                  3. Inconsistencias de plan ({inconsist.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Estos alumnos <strong>tienen plan activo</strong> pero <strong>no están en el grupo</strong>. Hay que invitarlos o revisar su plan.
                </p>
                {inconsist.length === 0 ? (
                  <p className="text-sm text-emerald-600">Todo en orden, no hay alumnos con plan activo fuera del grupo.</p>
                ) : inconsist.map(it => {
                  const phone = normalizePhoneAR(it.alumno.telefono);
                  return (
                    <Card key={it.alumno.id} className="border-amber-500/30">
                      <CardContent className="p-3 flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex-1 min-w-[200px]">
                          <p className="font-semibold text-sm">{it.alumno.nombre} {it.alumno.apellido || ""}</p>
                          <p className="text-xs text-muted-foreground">{it.planName} · {it.paymentBadge.label}</p>
                          {it.nota && <p className="text-xs text-muted-foreground mt-1 italic">"{it.nota}"</p>}
                        </div>
                        <div className="flex gap-1.5">
                          {phone && (
                            <Button size="sm" variant="outline" onClick={() => window.open(`https://wa.me/${phone}`, "_blank")}>
                              <MessageCircle className="w-3.5 h-3.5 mr-1" />Invitar
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => navigate(`/admin/alumnos?focus=${it.alumno.id}`)}>
                            <ExternalLink className="w-3.5 h-3.5 mr-1" />Ficha
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </CardContent>
            </Card>

            {ausentes.length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-sm text-muted-foreground">Otros marcados como ausentes ({ausentes.length})</CardTitle></CardHeader>
                <CardContent className="space-y-1">
                  {ausentes.map(it => (
                    <div key={it.alumno.id} className="text-sm flex justify-between py-1 border-b border-border/50 last:border-0">
                      <span>{it.alumno.nombre} {it.alumno.apellido || ""}</span>
                      <span className="text-xs text-muted-foreground">{it.paymentBadge.label}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(2)}><ChevronLeft className="w-4 h-4 mr-1" />Volver al chequeo</Button>
              <Button onClick={closeRun} disabled={submitting}>
                Cerrar chequeo <CheckCircle2 className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </>
        );
      })()}

      {/* PASO 4: Resumen final */}
      {step === 4 && (() => {
        const c = items.filter(i => i.resultado === "presente").length;
        const a = items.filter(i => i.resultado === "ausente").length;
        const s = items.filter(i => i.resultado === "saltado" || i.resultado === "pendiente").length;
        const p = items.filter(i => i.plan_inconsistente).length;
        return (
          <Card className="border-emerald-500/30">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2 text-emerald-600">
                <CheckCircle2 className="w-5 h-5" />
                Chequeo cerrado · {selectedGrupo}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Kpi label="Confirmados" value={c} tone="success" />
                <Kpi label="Faltantes" value={a} tone="danger" />
                <Kpi label="A revisar plan" value={p} tone="warning" />
                <Kpi label="Saltados" value={s} />
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button onClick={() => { setStep(1); setRunId(null); setItems([]); setSelectedGrupo(""); }}>
                  <RefreshCw className="w-4 h-4 mr-1" />Chequear otro grupo
                </Button>
                <Button variant="outline" onClick={() => navigate("/admin/control")}>
                  Volver al Centro de Control
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })()}
    </div>
  );
};

const Kpi = ({ label, value, tone }: { label: string; value: number; tone?: "success" | "danger" | "warning" }) => {
  const cls =
    tone === "success" ? "text-emerald-600"
    : tone === "danger" ? "text-red-600"
    : tone === "warning" ? "text-amber-600"
    : "text-foreground";
  return (
    <div className="bg-muted/30 border border-border rounded-md p-3">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">{label}</p>
      <p className={`text-2xl font-heading font-bold ${cls}`}>{value}</p>
    </div>
  );
};

export default WhatsAppConciliador;
