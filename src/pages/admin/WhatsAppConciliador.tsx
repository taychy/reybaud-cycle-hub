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
  reasignado?: boolean;
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
  const [reassignOpen, setReassignOpen] = useState(false);
  const [reassignTo, setReassignTo] = useState<string>("");


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

  const OFICIAL = "Oficial (todos los activos)";

  const grupoStats = useMemo(() => {
    const m = new Map<string, number>();
    alumnos.forEach(a => { if (a.grupo && a.grupo !== "Sin grupo") m.set(a.grupo, (m.get(a.grupo) || 0) + 1); });
    m.set(OFICIAL, alumnos.length);
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
      const grupoAlumnos = (selectedGrupo === OFICIAL
        ? alumnos
        : alumnos.filter(a => a.grupo === selectedGrupo))
        .slice()
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
    setReassignOpen(false);
    setReassignTo("");
    advance(next);
  };

  const markMalAsignado = async (grupoCorrecto: string | null) => {
    const cur = items[currentIdx];
    if (!cur) return;
    // Marcamos como ausente del grupo actual + grupo_incorrecto, con sugerencia (puede ser null = "revisar")
    const updated: ItemRow = {
      ...cur,
      resultado: "ausente",
      plan_inconsistente: cur.hasActivePlan,
      grupo_incorrecto: true,
      grupo_real_sugerido: grupoCorrecto,
      nota: cur.nota || (grupoCorrecto
        ? `Mal asignado en la app: debería estar en "${grupoCorrecto}".`
        : `Mal asignado en la app: no corresponde a "${selectedGrupo}". Revisar grupo correcto.`),
    };
    const next = [...items];
    next[currentIdx] = updated;
    setItems(next);
    await persistItem(updated);
    // Si eligieron grupo concreto, reasignar en alumnos
    if (grupoCorrecto) {
      const { error } = await supabase
        .from("alumnos")
        .update({ grupo: grupoCorrecto as any })
        .eq("id", cur.alumno.id);
      if (error) {
        toast({ title: "No se pudo reasignar", description: error.message, variant: "destructive" });
      } else {
        setAlumnos(prev => prev.map(a => a.id === cur.alumno.id ? { ...a, grupo: grupoCorrecto } : a));
        toast({ title: "Reasignado", description: `${cur.alumno.nombre} ahora está en ${grupoCorrecto}` });
      }
    }
    setReassignOpen(false);
    setReassignTo("");
    advance(next);
  };

  const advance = (next: ItemRow[]) => {
    if (currentIdx < next.length - 1) setCurrentIdx(currentIdx + 1);
    else goToReview(next);
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

  const reassignItem = async (alumnoId: string, grupoNuevo: string) => {
    if (!grupoNuevo) return;
    const { error } = await supabase
      .from("alumnos")
      .update({ grupo: grupoNuevo as any })
      .eq("id", alumnoId);
    if (error) {
      toast({ title: "No se pudo reasignar", description: error.message, variant: "destructive" });
      return;
    }
    setAlumnos(prev => prev.map(a => a.id === alumnoId ? { ...a, grupo: grupoNuevo } : a));
    setItems(prev => prev.map(it => it.alumno.id === alumnoId
      ? { ...it, grupo_real_sugerido: grupoNuevo, reasignado: true, alumno: { ...it.alumno, grupo: grupoNuevo } }
      : it));
    toast({ title: "Alumno reasignado", description: `Movido a ${grupoNuevo}` });
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
            alumno_id: e.alumno_id,
            reasignar_a_grupo: e.reasignar_a_grupo,
            reasignado_at: e.reasignado ? new Date().toISOString() : null,
          })),
        );
      }
      const reasignacionesExtra = validExtras.filter(e => e.alumno_id && e.reasignar_a_grupo).length;
      const { data: { session } } = await supabase.auth.getSession();
      await supabase.from("whatsapp_check_runs").update({
        estado: "cerrado",
        cerrado_at: new Date().toISOString(),
        cerrado_por: session?.user?.id || null,
        notas_cierre: notasCierre || null,
        desconocidos_en_grupo: validExtras.length,
        grupo_mal_asignado: items.filter(i => i.grupo_incorrecto).length + reasignacionesExtra,
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

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
                  <Button onClick={() => markCurrent("presente")} size="lg" className="bg-emerald-600 hover:bg-emerald-700 text-white">
                    <CheckCircle2 className="w-5 h-5 mr-2" /> Está
                  </Button>
                  <Button onClick={() => markCurrent("ausente")} size="lg" variant="destructive">
                    <XCircle className="w-5 h-5 mr-2" /> No está
                  </Button>
                  <Button onClick={() => { setReassignOpen(v => !v); setReassignTo(""); }} size="lg" variant="outline" className="border-blue-500/40 text-blue-600 hover:bg-blue-500/10">
                    <ArrowRightLeft className="w-5 h-5 mr-2" /> Mal asignado
                  </Button>
                  <Button onClick={() => markCurrent("saltado")} size="lg" variant="outline">
                    <SkipForward className="w-5 h-5 mr-2" /> Saltar
                  </Button>
                </div>

                {reassignOpen && (
                  <div className="rounded-md border border-blue-500/30 bg-blue-500/5 p-3 space-y-2">
                    <p className="text-xs">
                      <strong>{cur.alumno.nombre}</strong> figura en <strong>{cur.alumno.grupo}</strong> en la app, pero no está en el WhatsApp de <strong>{selectedGrupo}</strong>. ¿A qué grupo pertenece realmente?
                    </p>
                    <div className="flex gap-2 flex-wrap items-center">
                      <Select value={reassignTo} onValueChange={setReassignTo}>
                        <SelectTrigger className="h-9 w-full sm:w-64">
                          <SelectValue placeholder="Elegí grupo correcto…" />
                        </SelectTrigger>
                        <SelectContent>
                          {grupos.filter(g => g !== selectedGrupo).map(g => (
                            <SelectItem key={g} value={g}>{g}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        disabled={!reassignTo}
                        onClick={() => markMalAsignado(reassignTo)}
                        className="bg-blue-600 hover:bg-blue-700 text-white"
                      >
                        <Check className="w-4 h-4 mr-1" /> Reasignar y continuar
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => markMalAsignado(null)}>
                        No sé · marcar para revisar
                      </Button>
                    </div>
                  </div>
                )}

                <p className="text-[11px] text-muted-foreground -mt-1">
                  Si encontrás en el grupo a alguien que <strong>no está en esta lista</strong>, cargalo en "Personas en el grupo no esperadas" del paso 3.
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
        const aInvitar = items.filter(i => i.resultado === "ausente" && i.hasActivePlan && !i.grupo_incorrecto);
        const ausentesSinPlan = items.filter(i => i.resultado === "ausente" && !i.hasActivePlan && !i.grupo_incorrecto);
        const planVencidoEnGrupo = items.filter(i => i.resultado === "presente" && i.planVencido);
        const malConDestino = items.filter(i => i.grupo_incorrecto && i.grupo_real_sugerido);
        const malSinDefinir = items.filter(i => i.grupo_incorrecto && !i.grupo_real_sugerido);
        const extrasVinculados = extras.filter(e => e.alumno_id && e.reasignar_a_grupo);
        return (
          <div className="space-y-4">
            {/* A invitar */}
            <RevisionSection
              title={`A invitar al grupo (${aInvitar.length})`}
              tone="warning"
              description="Tienen plan activo, están asignados a este grupo en la app y no aparecen en el WhatsApp. Invitalos."
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

            {/* Reasignar a grupo concreto (ítems con destino + extras vinculados) */}
            <Card className="border-blue-500/30">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <ArrowRightLeft className="w-4 h-4 text-blue-500" />
                  Reasignar a otro grupo ({malConDestino.length + extrasVinculados.length})
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Alumnos mal asignados en la app con destino conocido. Confirmá la reasignación.
                </p>
              </CardHeader>
              <CardContent className="space-y-2">
                {malConDestino.length + extrasVinculados.length === 0 && (
                  <p className="text-sm text-emerald-600">Sin casos pendientes de reasignación.</p>
                )}
                {malConDestino.map(it => (
                  <div key={`item-${it.alumno.id}`} className="border border-blue-500/30 rounded-md p-3 flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex-1 min-w-[200px]">
                      <p className="font-semibold text-sm">{it.alumno.nombre} {it.alumno.apellido || ""}</p>
                      <p className="text-xs text-blue-600">
                        En app: <strong>{it.alumno.grupo}</strong> → debería ir a <strong>{it.grupo_real_sugerido}</strong>
                      </p>
                    </div>
                    <div className="flex gap-1.5">
                      {it.reasignado || it.alumno.grupo === it.grupo_real_sugerido ? (
                        <Badge variant="outline" className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30">
                          <Check className="w-3 h-3 mr-1" />Reasignado
                        </Badge>
                      ) : (
                        <Button size="sm" onClick={() => reassignItem(it.alumno.id, it.grupo_real_sugerido!)} className="bg-blue-600 hover:bg-blue-700 text-white">
                          <ArrowRightLeft className="w-3.5 h-3.5 mr-1" />Reasignar a {it.grupo_real_sugerido}
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => navigate(`/admin/alumnos?focus=${it.alumno.id}`)}>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
                {extrasVinculados.map((ex) => {
                  const i = extras.indexOf(ex);
                  const alumno = alumnos.find(a => a.id === ex.alumno_id);
                  return (
                    <div key={`extra-${i}`} className="border border-blue-500/30 rounded-md p-3 flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex-1 min-w-[200px]">
                        <p className="font-semibold text-sm">{ex.nombre}</p>
                        <p className="text-xs text-blue-600">
                          En app: <strong>{alumno?.grupo || "—"}</strong> → debería ir a <strong>{selectedGrupo}</strong>
                        </p>
                      </div>
                      <div className="flex gap-1.5">
                        {ex.reasignado ? (
                          <Badge variant="outline" className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30">
                            <Check className="w-3 h-3 mr-1" />Reasignado
                          </Badge>
                        ) : (
                          <Button size="sm" onClick={() => reassignExtra(i)} className="bg-blue-600 hover:bg-blue-700 text-white">
                            <ArrowRightLeft className="w-3.5 h-3.5 mr-1" />Reasignar a {selectedGrupo}
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {/* Revisar grupo (sin definir) */}
            {malSinDefinir.length > 0 && (
              <Card className="border-amber-500/30">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                    Revisar grupo correcto ({malSinDefinir.length})
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Están asignados a <strong>{selectedGrupo}</strong> en la app, pero <strong>no pertenecen a este grupo</strong>.
                    Averiguá a qué grupo corresponden y reasignalos acá.
                  </p>
                </CardHeader>
                <CardContent className="space-y-2">
                  {malSinDefinir.map(it => (
                    <ReviewPicker
                      key={`rev-${it.alumno.id}`}
                      item={it}
                      grupos={grupos}
                      onReassign={(g) => reassignItem(it.alumno.id, g)}
                      onFicha={() => navigate(`/admin/alumnos?focus=${it.alumno.id}`)}
                    />
                  ))}
                </CardContent>
              </Card>
            )}


            {/* Personas en el grupo no esperadas */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-base">Personas en el grupo no esperadas ({extras.filter(e => e.nombre.trim()).length})</CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">
                    Cargá quienes están en el grupo de WhatsApp pero no aparecen en esta lista. Si es un alumno con grupo mal asignado en la app, buscalo por nombre y reasignalo.
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={addExtra}>
                  <UserPlus className="w-4 h-4 mr-1" /> Agregar
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                {extras.length === 0 && (
                  <p className="text-sm text-muted-foreground italic">Ninguno cargado.</p>
                )}
                {extras.map((ex, i) => (
                  <ExtraEditor
                    key={i}
                    extra={ex}
                    alumnos={alumnos}
                    selectedGrupo={selectedGrupo}
                    onUpdate={(patch) => updateExtra(i, patch)}
                    onRemove={() => removeExtra(i)}
                    onLink={(a) => linkExtraToAlumno(i, a)}
                    onUnlink={() => updateExtra(i, { alumno_id: null, reasignar_a_grupo: null, motivo: "desconocido", nota: "", reasignado: false })}
                  />
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

const ExtraEditor = ({
  extra, alumnos, selectedGrupo, onUpdate, onRemove, onLink, onUnlink,
}: {
  extra: ExtraRow;
  alumnos: Alumno[];
  selectedGrupo: string;
  onUpdate: (patch: Partial<ExtraRow>) => void;
  onRemove: () => void;
  onLink: (a: Alumno) => void;
  onUnlink: () => void;
}) => {
  const [query, setQuery] = useState("");
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return alumnos
      .filter(a => a.grupo !== selectedGrupo)
      .filter(a => `${a.nombre} ${a.apellido || ""} ${a.email}`.toLowerCase().includes(q))
      .slice(0, 6);
  }, [query, alumnos, selectedGrupo]);

  const linked = !!extra.alumno_id;

  return (
    <div className={`border rounded-md p-3 space-y-2 ${linked ? "border-blue-500/40 bg-blue-500/5" : "border-border"}`}>
      {!linked && (
        <div className="space-y-1.5">
          <Label className="text-xs flex items-center gap-1"><Search className="w-3 h-3" /> Buscar alumno existente (otro grupo)</Label>
          <Input
            placeholder="Escribí nombre, apellido o email…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          {matches.length > 0 && (
            <div className="border border-border rounded-md max-h-44 overflow-y-auto bg-background">
              {matches.map(a => (
                <button
                  type="button"
                  key={a.id}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-muted border-b border-border/50 last:border-0"
                  onClick={() => { onLink(a); setQuery(""); }}
                >
                  <div className="font-medium">{a.nombre} {a.apellido || ""}</div>
                  <div className="text-xs text-muted-foreground">
                    Grupo en app: <strong>{a.grupo}</strong> · {a.email}
                  </div>
                </button>
              ))}
            </div>
          )}
          {query.trim().length >= 2 && matches.length === 0 && (
            <p className="text-xs text-muted-foreground italic">Sin coincidencias. Cargalo manualmente abajo si no es alumno.</p>
          )}
        </div>
      )}

      {linked && (
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="text-sm">
            <p className="font-semibold text-blue-700 dark:text-blue-300">{extra.nombre}</p>
            <p className="text-xs text-muted-foreground">Marcado para reasignar a <strong>{extra.reasignar_a_grupo}</strong></p>
          </div>
          <Button variant="ghost" size="sm" onClick={onUnlink}>Desvincular</Button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-start">
        <Input className="md:col-span-3" placeholder="Nombre o alias" value={extra.nombre} onChange={e => onUpdate({ nombre: e.target.value })} disabled={linked} />
        <Input className="md:col-span-3" placeholder="Teléfono (opcional)" value={extra.telefono} onChange={e => onUpdate({ telefono: e.target.value })} disabled={linked} />
        <Select value={extra.motivo} onValueChange={(v) => onUpdate({ motivo: v as ExtraRow["motivo"] })}>
          <SelectTrigger className="md:col-span-3"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(MOTIVO_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input className="md:col-span-2" placeholder="Nota" value={extra.nota} onChange={e => onUpdate({ nota: e.target.value })} />
        <Button variant="ghost" size="icon" className="md:col-span-1" onClick={onRemove}>
          <Trash2 className="w-4 h-4 text-destructive" />
        </Button>
      </div>
    </div>
  );
};

const ReviewPicker = ({
  item, grupos, onReassign, onFicha,
}: {
  item: ItemRow;
  grupos: string[];
  onReassign: (grupo: string) => void;
  onFicha: () => void;
}) => {
  const [pick, setPick] = useState<string>("");
  const opciones = grupos.filter(g => g !== item.alumno.grupo);
  if (item.reasignado) {
    return (
      <div className="border border-emerald-500/30 rounded-md p-3 flex items-center justify-between gap-2 flex-wrap bg-emerald-500/5">
        <div className="flex-1 min-w-[200px]">
          <p className="font-semibold text-sm">{item.alumno.nombre} {item.alumno.apellido || ""}</p>
          <p className="text-xs text-emerald-600">Reasignado a <strong>{item.alumno.grupo}</strong></p>
        </div>
        <Badge variant="outline" className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30">
          <Check className="w-3 h-3 mr-1" />Listo
        </Badge>
      </div>
    );
  }
  return (
    <div className="border border-amber-500/30 rounded-md p-3 space-y-2">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <p className="font-semibold text-sm">{item.alumno.nombre} {item.alumno.apellido || ""}</p>
          <p className="text-xs text-muted-foreground">
            Hoy figura en <strong>{item.alumno.grupo}</strong> · {item.planName}
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={onFicha}>
          <ExternalLink className="w-3.5 h-3.5 mr-1" />Ficha
        </Button>
      </div>
      <div className="flex gap-2 flex-wrap items-center">
        <Select value={pick} onValueChange={setPick}>
          <SelectTrigger className="w-[200px]"><SelectValue placeholder="Elegí el grupo correcto…" /></SelectTrigger>
          <SelectContent>
            {opciones.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" disabled={!pick} onClick={() => onReassign(pick)} className="bg-blue-600 hover:bg-blue-700 text-white">
          <ArrowRightLeft className="w-3.5 h-3.5 mr-1" />Reasignar
        </Button>
      </div>
    </div>
  );
};

export default WhatsAppConciliador;
