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
  AlertTriangle, ExternalLink, Users, RefreshCw, Phone, Search,
  UserPlus, Trash2, History, ArrowRightLeft, Check,
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

type Resultado = "pendiente" | "presente" | "ausente" | "saltado";

type ItemRow = {
  id?: string;
  alumno: Alumno;
  resultado: Resultado;
  nota: string;
  plan_inconsistente: boolean;
  grupo_incorrecto: boolean;
  grupo_real_sugerido: string | null;
  hasActivePlan: boolean;
  planVencido: boolean;
  planName: string;
  paymentBadge: { label: string; cls: string };
};

type ExtraRow = {
  id?: string;
  nombre: string;
  telefono: string;
  motivo: "no_es_alumno" | "alumno_otro_grupo" | "alumno_inactivo" | "desconocido";
  nota: string;
  alumno_id: string | null;
  reasignar_a_grupo: string | null;
  reasignado: boolean;
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

const isPlanVencido = (sub: Sub | undefined): boolean => {
  if (!sub) return true;
  const t = today();
  if (sub.estado === "vencida") return true;
  if (sub.fecha_fin && sub.fecha_fin < t) return true;
  return false;
};

const MOTIVO_LABEL: Record<ExtraRow["motivo"], string> = {
  no_es_alumno: "No es alumno",
  alumno_otro_grupo: "Alumno de otro grupo",
  alumno_inactivo: "Alumno inactivo / dado de baja",
  desconocido: "Desconocido / por identificar",
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

  const [step, setStep] = useState<Step>(1);
  const [selectedGrupo, setSelectedGrupo] = useState<string>(searchParams.get("grupo") || "");
  const [fechaObjetivo, setFechaObjetivo] = useState<string>(searchParams.get("fecha") || suggestFechaObjetivo());
  const [runId, setRunId] = useState<string | null>(null);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [extras, setExtras] = useState<ExtraRow[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [notasCierre, setNotasCierre] = useState("");

  // estado para el dialog inline "está en otro grupo"
  const [showOtroGrupo, setShowOtroGrupo] = useState(false);
  const [otroGrupoValue, setOtroGrupoValue] = useState("");

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
          grupo_incorrecto: false,
          grupo_real_sugerido: null,
          hasActivePlan: !!s && (s.estado === "activa" || s.estado === "pendiente"),
          planVencido: isPlanVencido(s),
          planName: s?.planes?.nombre || "—",
          paymentBadge: paymentBadgeFor(s),
        };
      });
      setItems(rows);
      setExtras([]);
      setNotasCierre("");
      setRunId(run.id);
      setCurrentIdx(0);
      setStep(2);
    } catch (e: any) {
      toast({ title: "Error al iniciar", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const persistItem = async (item: ItemRow) => {
    if (!item.id) return;
    await supabase.from("whatsapp_check_items").update({
      resultado: item.resultado,
      nota: item.nota || null,
      plan_inconsistente: item.plan_inconsistente,
      grupo_incorrecto: item.grupo_incorrecto,
      grupo_real_sugerido: item.grupo_real_sugerido,
      checked_at: new Date().toISOString(),
    } as any).eq("id", item.id);
  };

  const markCurrent = async (resultado: Resultado, opts?: { grupoIncorrecto?: boolean; grupoReal?: string | null }) => {
    const cur = items[currentIdx];
    if (!cur) return;
    const grupoIncorrecto = !!opts?.grupoIncorrecto;
    const grupoReal = opts?.grupoReal ?? null;
    const planInc = resultado === "ausente" && cur.hasActivePlan;
    const updated: ItemRow = {
      ...cur,
      resultado,
      plan_inconsistente: planInc,
      grupo_incorrecto: grupoIncorrecto,
      grupo_real_sugerido: grupoReal,
    };
    const next = [...items];
    next[currentIdx] = updated;
    setItems(next);
    await persistItem(updated);
    advance(next);
  };

  const advance = (next: ItemRow[]) => {
    if (currentIdx < next.length - 1) setCurrentIdx(currentIdx + 1);
    else goToReview(next);
  };

  const handleOtroGrupoConfirm = async () => {
    if (!otroGrupoValue) { toast({ title: "Indicá el grupo real", variant: "destructive" }); return; }
    setShowOtroGrupo(false);
    await markCurrent("presente", { grupoIncorrecto: true, grupoReal: otroGrupoValue });
    setOtroGrupoValue("");
  };

  const goToReview = async (rows = items) => {
    const confirmados = rows.filter(r => r.resultado === "presente").length;
    const faltantes = rows.filter(r => r.resultado === "ausente").length;
    const saltados = rows.filter(r => r.resultado === "saltado" || r.resultado === "pendiente").length;
    const planRevision = rows.filter(r => r.plan_inconsistente).length;
    const grupoMal = rows.filter(r => r.grupo_incorrecto).length;
    const planVencidoEnGrupo = rows.filter(r => r.resultado === "presente" && r.planVencido).length;
    if (runId) {
      await supabase.from("whatsapp_check_runs").update({
        confirmados, faltantes, saltados,
        plan_revision: planRevision,
        grupo_mal_asignado: grupoMal,
        plan_vencido_en_grupo: planVencidoEnGrupo,
      } as any).eq("id", runId);
    }
    setStep(3);
  };

  const addExtra = () => {
    setExtras([...extras, {
      nombre: "", telefono: "", motivo: "desconocido", nota: "",
      alumno_id: null, reasignar_a_grupo: null, reasignado: false,
    }]);
  };
  const updateExtra = (i: number, patch: Partial<ExtraRow>) => {
    const next = [...extras];
    next[i] = { ...next[i], ...patch };
    setExtras(next);
  };
  const removeExtra = (i: number) => setExtras(extras.filter((_, j) => j !== i));

  const linkExtraToAlumno = (i: number, a: Alumno) => {
    updateExtra(i, {
      alumno_id: a.id,
      nombre: `${a.nombre} ${a.apellido || ""}`.trim(),
      telefono: a.telefono || "",
      motivo: "alumno_otro_grupo",
      reasignar_a_grupo: selectedGrupo,
      nota: `En la app figura en "${a.grupo}". Reasignar a "${selectedGrupo}".`,
    });
  };

  const reassignExtra = async (i: number) => {
    const ex = extras[i];
    if (!ex.alumno_id || !ex.reasignar_a_grupo) return;
    const { error } = await supabase
      .from("alumnos")
      .update({ grupo: ex.reasignar_a_grupo as any })
      .eq("id", ex.alumno_id);
    if (error) {
      toast({ title: "No se pudo reasignar", description: error.message, variant: "destructive" });
      return;
    }
    updateExtra(i, { reasignado: true });
    setAlumnos(prev => prev.map(a => a.id === ex.alumno_id ? { ...a, grupo: ex.reasignar_a_grupo! } : a));
    toast({ title: "Alumno reasignado", description: `Movido a ${ex.reasignar_a_grupo}` });
  };

  const closeRun = async () => {
    if (!runId) return;
    setSubmitting(true);
    try {
      const validExtras = extras.filter(e => e.nombre.trim().length > 0);
      if (validExtras.length > 0) {
        await supabase.from("whatsapp_check_extras" as any).insert(
          validExtras.map(e => ({
            run_id: runId,
            nombre: e.nombre.trim(),
            telefono: e.telefono || null,
            motivo: e.motivo,
            nota: e.nota || null,
          })),
        );
      }
      const { data: { session } } = await supabase.auth.getSession();
      await supabase.from("whatsapp_check_runs").update({
        estado: "cerrado",
        cerrado_at: new Date().toISOString(),
        cerrado_por: session?.user?.id || null,
        notas_cierre: notasCierre || null,
        desconocidos_en_grupo: validExtras.length,
      } as any).eq("id", runId);
      setStep(4);
    } catch (e: any) {
      toast({ title: "Error al cerrar", description: e.message, variant: "destructive" });
    } finally { setSubmitting(false); }
  };

  if (loading) return <div className="text-muted-foreground">Cargando…</div>;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-heading font-bold uppercase tracking-wider">Chequeo de WhatsApp</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Revisamos grupo por grupo, alumno por alumno. Hacelo los días 5 y 15 de cada mes.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => navigate("/admin/whatsapp-historial")}>
          <History className="w-4 h-4 mr-1.5" /> Historial
        </Button>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-2 text-xs flex-wrap">
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

      {/* PASO 1 */}
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

      {/* PASO 2 */}
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
                    <CheckCircle2 className="w-5 h-5 mr-2" /> Está en este grupo
                  </Button>
                  <Button onClick={() => markCurrent("ausente")} size="lg" variant="destructive">
                    <XCircle className="w-5 h-5 mr-2" /> No está
                  </Button>
                  <Button onClick={() => markCurrent("saltado")} size="lg" variant="outline">
                    <SkipForward className="w-5 h-5 mr-2" /> Saltar
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground -mt-1">
                  Si encontrás en el grupo a alguien que <strong>no está en esta lista</strong> (porque en la app figura en otro grupo), cargalo en la sección "Personas en el grupo no esperadas" del paso 3 y reasignalo desde ahí.
                </p>

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

      {/* PASO 3: REVISIÓN */}
      {step === 3 && (() => {
        const aInvitar = items.filter(i => i.resultado === "ausente" && i.hasActivePlan);
        const ausentesSinPlan = items.filter(i => i.resultado === "ausente" && !i.hasActivePlan);
        const planVencidoEnGrupo = items.filter(i => i.resultado === "presente" && i.planVencido);
        const grupoMal = items.filter(i => i.grupo_incorrecto);
        return (
          <div className="space-y-4">
            {/* A invitar */}
            <RevisionSection
              title={`A invitar al grupo (${aInvitar.length})`}
              tone="warning"
              description="Tienen plan activo pero no aparecen en el grupo. Invitalos al WhatsApp."
              empty="No hay alumnos con plan activo fuera del grupo."
              items={aInvitar}
              onFicha={(id) => navigate(`/admin/alumnos?focus=${id}`)}
            />

            {/* En grupo con plan vencido */}
            <RevisionSection
              title={`En el grupo pero con plan vencido / sin plan (${planVencidoEnGrupo.length})`}
              tone="danger"
              description="Están en el WhatsApp pero su suscripción está vencida o no tienen plan vigente. Hay que regularizar o sacarlos del grupo."
              empty="Todos los presentes tienen plan vigente."
              items={planVencidoEnGrupo}
              onFicha={(id) => navigate(`/admin/alumnos?focus=${id}`)}
            />

            {/* Grupo mal asignado */}
            <RevisionSection
              title={`Grupo mal asignado en la app (${grupoMal.length})`}
              tone="info"
              description="Aparecen en otro grupo de WhatsApp distinto al que figuran en la app. Revisar y reasignar el grupo del alumno."
              empty="No se detectaron casos de grupo mal asignado."
              items={grupoMal}
              showGrupoReal
              onFicha={(id) => navigate(`/admin/alumnos?focus=${id}`)}
            />

            {/* Extras detectados en el grupo */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-base">Personas en el grupo no esperadas ({extras.filter(e => e.nombre.trim()).length})</CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">
                    Cargá quienes están en el grupo de WhatsApp pero no figuran en este chequeo (ex-alumnos, gente de otro grupo, desconocidos).
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={addExtra}>
                  <UserPlus className="w-4 h-4 mr-1" /> Agregar
                </Button>
              </CardHeader>
              <CardContent className="space-y-2">
                {extras.length === 0 && (
                  <p className="text-sm text-muted-foreground italic">Ninguno cargado.</p>
                )}
                {extras.map((ex, i) => (
                  <div key={i} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-start border border-border rounded-md p-2">
                    <Input className="md:col-span-3" placeholder="Nombre o alias" value={ex.nombre} onChange={e => updateExtra(i, { nombre: e.target.value })} />
                    <Input className="md:col-span-3" placeholder="Teléfono (opcional)" value={ex.telefono} onChange={e => updateExtra(i, { telefono: e.target.value })} />
                    <Select value={ex.motivo} onValueChange={(v) => updateExtra(i, { motivo: v as ExtraRow["motivo"] })}>
                      <SelectTrigger className="md:col-span-3"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(MOTIVO_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Input className="md:col-span-2" placeholder="Nota" value={ex.nota} onChange={e => updateExtra(i, { nota: e.target.value })} />
                    <Button variant="ghost" size="icon" className="md:col-span-1" onClick={() => removeExtra(i)}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>

            {ausentesSinPlan.length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-sm text-muted-foreground">Ausentes sin plan vigente ({ausentesSinPlan.length})</CardTitle></CardHeader>
                <CardContent className="space-y-1">
                  {ausentesSinPlan.map(it => (
                    <div key={it.alumno.id} className="text-sm flex justify-between py-1 border-b border-border/50 last:border-0">
                      <span>{it.alumno.nombre} {it.alumno.apellido || ""}</span>
                      <span className="text-xs text-muted-foreground">{it.paymentBadge.label}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Notas de cierre */}
            <Card>
              <CardHeader><CardTitle className="text-base">Notas de cierre</CardTitle></CardHeader>
              <CardContent>
                <Textarea
                  rows={4}
                  placeholder="Resumen del chequeo, decisiones tomadas, pendientes a hacer en los próximos días, casos a derivar… Esto queda en el historial para auditoría."
                  value={notasCierre}
                  onChange={e => setNotasCierre(e.target.value)}
                />
              </CardContent>
            </Card>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(2)}><ChevronLeft className="w-4 h-4 mr-1" />Volver al chequeo</Button>
              <Button onClick={closeRun} disabled={submitting}>
                Cerrar y guardar reporte <CheckCircle2 className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        );
      })()}

      {/* PASO 4 */}
      {step === 4 && (() => {
        const c = items.filter(i => i.resultado === "presente").length;
        const a = items.filter(i => i.resultado === "ausente").length;
        const s = items.filter(i => i.resultado === "saltado" || i.resultado === "pendiente").length;
        const p = items.filter(i => i.plan_inconsistente).length;
        const gm = items.filter(i => i.grupo_incorrecto).length;
        const pv = items.filter(i => i.resultado === "presente" && i.planVencido).length;
        const ex = extras.filter(e => e.nombre.trim()).length;
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
                <Kpi label="A invitar" value={p} tone="warning" />
                <Kpi label="Plan vencido en grupo" value={pv} tone="danger" />
                <Kpi label="Grupo mal asignado" value={gm} tone="info" />
                <Kpi label="Faltantes" value={a} tone="danger" />
                <Kpi label="Extras en grupo" value={ex} tone="info" />
                <Kpi label="Saltados" value={s} />
              </div>
              {notasCierre && (
                <div className="bg-muted/40 border border-border rounded-md p-3 text-sm">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-1">Notas de cierre</p>
                  <p className="whitespace-pre-wrap">{notasCierre}</p>
                </div>
              )}
              <div className="flex gap-2 flex-wrap">
                <Button onClick={() => { setStep(1); setRunId(null); setItems([]); setExtras([]); setNotasCierre(""); setSelectedGrupo(""); }}>
                  <RefreshCw className="w-4 h-4 mr-1" />Chequear otro grupo
                </Button>
                <Button variant="outline" onClick={() => navigate("/admin/whatsapp-historial")}>
                  <History className="w-4 h-4 mr-1" />Ver historial
                </Button>
                <Button variant="ghost" onClick={() => navigate("/admin/control")}>
                  Centro de Control
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })()}
    </div>
  );
};

const RevisionSection = ({
  title, description, empty, items, tone, onFicha, showGrupoReal,
}: {
  title: string;
  description: string;
  empty: string;
  items: ItemRow[];
  tone: "warning" | "danger" | "info";
  onFicha: (id: string) => void;
  showGrupoReal?: boolean;
}) => {
  const borderCls =
    tone === "warning" ? "border-amber-500/30"
    : tone === "danger" ? "border-red-500/30"
    : "border-blue-500/30";
  const iconCls =
    tone === "warning" ? "text-amber-500"
    : tone === "danger" ? "text-red-500"
    : "text-blue-500";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <AlertTriangle className={`w-4 h-4 ${iconCls}`} />
          {title}
        </CardTitle>
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.length === 0 ? (
          <p className="text-sm text-emerald-600">{empty}</p>
        ) : items.map(it => {
          const phone = normalizePhoneAR(it.alumno.telefono);
          return (
            <Card key={it.alumno.id} className={borderCls}>
              <CardContent className="p-3 flex items-center justify-between gap-2 flex-wrap">
                <div className="flex-1 min-w-[200px]">
                  <p className="font-semibold text-sm">{it.alumno.nombre} {it.alumno.apellido || ""}</p>
                  <p className="text-xs text-muted-foreground">
                    {it.planName} · <Badge variant="outline" className={`text-[10px] ${it.paymentBadge.cls}`}>{it.paymentBadge.label}</Badge>
                  </p>
                  {showGrupoReal && it.grupo_real_sugerido && (
                    <p className="text-xs text-blue-600 mt-1">
                      Visto en: <strong>{it.grupo_real_sugerido}</strong> · asignado en app a <strong>{it.alumno.grupo}</strong>
                    </p>
                  )}
                  {it.nota && <p className="text-xs text-muted-foreground mt-1 italic">"{it.nota}"</p>}
                </div>
                <div className="flex gap-1.5">
                  {phone && (
                    <Button size="sm" variant="outline" onClick={() => window.open(`https://wa.me/${phone}`, "_blank")}>
                      <MessageCircle className="w-3.5 h-3.5 mr-1" />WhatsApp
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => onFicha(it.alumno.id)}>
                    <ExternalLink className="w-3.5 h-3.5 mr-1" />Ficha
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </CardContent>
    </Card>
  );
};

const Kpi = ({ label, value, tone }: { label: string; value: number; tone?: "success" | "danger" | "warning" | "info" }) => {
  const cls =
    tone === "success" ? "text-emerald-600"
    : tone === "danger" ? "text-red-600"
    : tone === "warning" ? "text-amber-600"
    : tone === "info" ? "text-blue-600"
    : "text-foreground";
  return (
    <div className="bg-muted/30 border border-border rounded-md p-3">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">{label}</p>
      <p className={`text-2xl font-heading font-bold ${cls}`}>{value}</p>
    </div>
  );
};

export default WhatsAppConciliador;
