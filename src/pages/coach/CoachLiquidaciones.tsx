import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { ArrowLeft, DollarSign, Clock, CheckCircle, TrendingUp, Plus, ChevronLeft, ChevronRight } from "lucide-react";
import logo from "@/assets/logo.png";

const ESTADO_OP_LABELS: Record<string, string> = {
  programada: "Programada",
  reservada: "Reservada",
  realizada: "Realizada",
  suspendida_por_lluvia: "Susp. lluvia",
  suspendida_por_otro_motivo: "Susp. otro",
  cancelada_por_alumno: "Canc. alumno",
  cancelada_por_admin: "Canc. admin",
  ausente_alumno: "Ausente",
  reprogramada: "Reprogramada",
};

const ESTADO_EC_LABELS: Record<string, string> = {
  liquidable: "Liquidable",
  no_liquidable: "No liquidable",
  pendiente_revision: "Pendiente",
  liquidada: "Liquidada",
  pagada: "Pagada",
};

const ESTADO_EC_COLORS: Record<string, string> = {
  liquidable: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  no_liquidable: "bg-red-500/10 text-red-400 border-red-500/20",
  pendiente_revision: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  liquidada: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  pagada: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
};

const TIPO_LABELS: Record<string, string> = {
  grupal_1h30: "Grupal 1h30",
  grupal_2h: "Grupal 2h",
  fondo_salida: "Fondo/Salida",
  tecnica: "Técnica",
  evento_escuela: "Evento Escuela",
  evaluatoria: "Evaluatoria",
  personalizada: "Personalizada",
  ajuste: "Ajuste manual",
  viatico: "Viático",
};

const FILTROS = ["todas", "grupales", "personalizadas", "evaluatorias", "viaticos", "ajustes"] as const;

const HONORARIO_SEARCH_TERMS: Record<string, string[]> = {
  grupal_1h30: ["grupal 1h30", "1h30", "1h 30", "90min"],
  grupal_2h: ["grupal 2h", "2h", "2 h", "120min"],
  fondo_salida: ["fondo", "salida"],
  tecnica: ["tecnica", "técnica"],
  evento_escuela: ["evento escuela"],
  evaluatoria: ["evaluatoria", "evaluacion", "evaluación"],
  personalizada: ["personalizada", "particular", "particular circuito", "circuito 1h"],
  ajuste: ["ajuste"],
};

const normalizeText = (value: string | null | undefined) =>
  (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const matchesHonorario = (tipoActividad: string, nombreConcepto: string | null | undefined) => {
  const normalizedName = normalizeText(nombreConcepto);
  const terms = HONORARIO_SEARCH_TERMS[tipoActividad] ?? [tipoActividad];

  return terms.some((term) => normalizedName.includes(normalizeText(term)));
};

type Movimiento = {
  id: string;
  fecha: string;
  tipo_actividad: string;
  grupo: string | null;
  evento: string | null;
  nombre_externo: string | null;
  valor_base: number;
  viaticos: number;
  entrada: number;
  extras: number;
  total: number;
  estado_operativo: string;
  estado_economico: string;
  observaciones: string | null;
  origen: string;
  alumno_id: string | null;
};

type LiquidacionMensual = {
  id: string;
  mes: string;
  total_estimado: number;
  total_confirmado: number;
  total_pagado: number;
  estado: string;
  fecha_pago: string | null;
};

const getCurrentMonth = () => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`;
};

const getMonthRange = (mes: string) => {
  const [y, m] = mes.split("-").map(Number);
  const startDate = `${mes}-01`;
  const endDate = new Date(y, m, 0).toISOString().split("T")[0];
  return { startDate, endDate };
};

const shiftMonth = (mes: string, delta: number) => {
  const [y, m] = mes.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const formatMes = (m: string) => {
  const [y, mo] = m.split("-");
  const date = new Date(Number(y), Number(mo) - 1);
  return date.toLocaleDateString("es-AR", { month: "long", year: "numeric" });
};

const CoachLiquidaciones = () => {
  const navigate = useNavigate();
  const [coachId, setCoachId] = useState<string | null>(null);
  const [coachGrupos, setCoachGrupos] = useState<string[]>([]);
  const [alumnos, setAlumnos] = useState<{ id: string; nombre: string; apellido: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [historico, setHistorico] = useState<LiquidacionMensual[]>([]);
  const [filtro, setFiltro] = useState<string>("todas");
  const [mes, setMes] = useState(getCurrentMonth);
  const [showClaseForm, setShowClaseForm] = useState(false);
  const [showViaticoForm, setShowViaticoForm] = useState(false);
  const [claseForm, setClaseForm] = useState({
    tipo_actividad: "grupal_1h30",
    fecha: new Date().toISOString().split("T")[0],
    grupo: "",
    nombre_externo: "",
    alumno_ids: [] as string[],
    observaciones: "",
  });
  const [viaticoForm, setViaticoForm] = useState({
    fecha: new Date().toISOString().split("T")[0],
    monto: "",
    concepto: "",
    observaciones: "",
  });

  const isCurrentMonth = mes === getCurrentMonth();

  const loadMovimientos = useCallback(async (cId: string, mesStr: string) => {
    const { startDate, endDate } = getMonthRange(mesStr);
    const { data: movs } = await supabase
      .from("movimientos_liquidacion")
      .select("*")
      .eq("coach_id", cId)
      .gte("fecha", startDate)
      .lte("fecha", endDate)
      .order("fecha", { ascending: true });
    setMovimientos((movs as any[]) || []);
  }, []);

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return; // ProtectedRoute handles redirect

      const { data: coach } = await supabase
        .from("coaches")
        .select("id, grupos")
        .eq("user_id", session.user.id)
        .single();
      if (!coach) { navigate("/coach"); return; }

      setCoachId(coach.id);
      setCoachGrupos((coach as any).grupos || []);

      // Load alumnos from coach's groups
      if ((coach as any).grupos && (coach as any).grupos.length > 0) {
        const { data: alumnosData } = await supabase
          .from("alumnos")
          .select("id, nombre, apellido")
          .in("grupo", (coach as any).grupos)
          .eq("estado", "activo")
          .order("nombre");
        setAlumnos((alumnosData as any[]) || []);
      }

      await loadMovimientos(coach.id, mes);

      // Fetch historical liquidaciones
      const { data: hist } = await supabase
        .from("liquidaciones_mensuales")
        .select("*")
        .eq("coach_id", coach.id)
        .order("mes", { ascending: false });

      setHistorico((hist as any[]) || []);
      setLoading(false);
    };
    init();
  }, [navigate]);

  // Reload movements when month changes
  useEffect(() => {
    if (coachId) {
      loadMovimientos(coachId, mes);
    }
  }, [mes, coachId, loadMovimientos]);

  const lookupHonorarioValue = async (tipoActividad: string, cId: string): Promise<number> => {
    // Try coach-specific honorario first, then generic
    for (const coachFilter of [cId, null]) {
      let query = supabase
        .from("honorarios")
        .select("valor, nombre_concepto")
        .eq("activo", true);

      if (coachFilter) {
        query = query.eq("coach_id", coachFilter);
      } else {
        query = query.is("coach_id", null);
      }

      const { data: honorarios } = await query;
      if (honorarios && honorarios.length > 0) {
        const match = (honorarios as { valor: number; nombre_concepto: string | null }[]).find((h) =>
          matchesHonorario(tipoActividad, h.nombre_concepto)
        );

        if (match) return Number(match.valor);
      }
    }

    // Fallback: try from agenda_grupal linked honorario
    const { data: agenda } = await supabase
      .from("agenda_grupal")
      .select("honorario_id, honorarios(valor)")
      .eq("coach_id", cId)
      .not("honorario_id", "is", null)
      .limit(1)
      .maybeSingle();
    if (agenda && (agenda as any).honorarios?.valor) {
      return Number((agenda as any).honorarios.valor);
    }

    return 0;
  };

  const isIndividualType = (tipo: string) =>
    tipo === "personalizada" || tipo === "evaluatoria";

  const submitClase = async () => {
    if (!coachId || !claseForm.fecha || !claseForm.tipo_actividad) return;

    const valorBase = await lookupHonorarioValue(claseForm.tipo_actividad, coachId);

    // Determine estado_economico based on reglas_liquidacion
    let estadoEconomico = "pendiente_revision";
    let finalValor = valorBase;
    try {
      const { data: regla } = await supabase
        .from("reglas_liquidacion")
        .select("liquida, porcentaje_pago")
        .eq("tipo_actividad", claseForm.tipo_actividad)
        .eq("estado_operativo", "realizada")
        .maybeSingle();

      if (regla && !regla.liquida) {
        estadoEconomico = "no_liquidable";
        finalValor = 0;
      } else if (regla) {
        finalValor = valorBase * (regla.porcentaje_pago / 100);
      }
    } catch {
      // proceed with default
    }

    const { error } = await supabase.from("movimientos_liquidacion").insert({
      coach_id: coachId,
      fecha: claseForm.fecha,
      tipo_actividad: claseForm.tipo_actividad,
      grupo: isIndividualType(claseForm.tipo_actividad) ? null : (claseForm.grupo || null),
      nombre_externo: isIndividualType(claseForm.tipo_actividad)
        ? (claseForm.alumno_ids.length > 0
          ? claseForm.alumno_ids.map(aid => {
              const a = alumnos.find(al => al.id === aid);
              return a ? `${a.nombre} ${a.apellido || ""}`.trim() : "";
            }).filter(Boolean).join(", ")
          : claseForm.nombre_externo || null)
        : null,
      origen: "carga_coach",
      valor_base: finalValor,
      total: finalValor,
      estado_operativo: "realizada",
      estado_economico: estadoEconomico,
      observaciones: claseForm.observaciones || null,
    } as any);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Clase registrada", description: finalValor > 0 ? `Valor: $${finalValor.toLocaleString("es-AR")} — Pendiente de revisión.` : "Queda pendiente de revisión por el administrador." });
    setShowClaseForm(false);
    setClaseForm({ tipo_actividad: "grupal_1h30", fecha: new Date().toISOString().split("T")[0], grupo: "", nombre_externo: "", alumno_ids: [], observaciones: "" });
    loadMovimientos(coachId, mes);
  };

  const submitViatico = async () => {
    if (!coachId || !viaticoForm.fecha || !viaticoForm.monto || !viaticoForm.concepto) {
      toast({ title: "Completá los campos", description: "Fecha, concepto y monto son obligatorios.", variant: "destructive" });
      return;
    }
    const monto = parseFloat(viaticoForm.monto);
    if (isNaN(monto) || monto <= 0) {
      toast({ title: "Monto inválido", variant: "destructive" });
      return;
    }

    const { error } = await supabase.from("movimientos_liquidacion").insert({
      coach_id: coachId,
      fecha: viaticoForm.fecha,
      tipo_actividad: "viatico",
      grupo: null,
      nombre_externo: null,
      evento: viaticoForm.concepto,
      origen: "carga_coach",
      valor_base: 0,
      viaticos: monto,
      total: monto,
      estado_operativo: "realizada",
      estado_economico: "pendiente_revision",
      observaciones: viaticoForm.observaciones || null,
    } as any);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Viático registrado", description: `$${monto.toLocaleString("es-AR")} — Pendiente de revisión.` });
    setShowViaticoForm(false);
    setViaticoForm({ fecha: new Date().toISOString().split("T")[0], monto: "", concepto: "", observaciones: "" });
    loadMovimientos(coachId, mes);
  };

  const filteredMovimientos = movimientos.filter((m) => {
    if (filtro === "todas") return true;
    if (filtro === "grupales") return m.tipo_actividad.startsWith("grupal") || m.tipo_actividad === "fondo_salida" || m.tipo_actividad === "tecnica" || m.tipo_actividad === "evento_escuela";
    if (filtro === "personalizadas") return m.tipo_actividad === "personalizada";
    if (filtro === "evaluatorias") return m.tipo_actividad === "evaluatoria";
    if (filtro === "viaticos") return m.tipo_actividad === "viatico";
    if (filtro === "ajustes") return m.origen === "ajuste_manual" || (m.origen === "carga_coach" && m.tipo_actividad !== "viatico");
    return true;
  });

  const confirmado = movimientos.filter(m => m.estado_economico === "liquidable" || m.estado_economico === "liquidada").reduce((s, m) => s + Number(m.total), 0);
  const estimado = movimientos.filter(m => m.estado_operativo === "programada" || m.estado_operativo === "reservada").reduce((s, m) => s + Number(m.total), 0);
  const pendiente = movimientos.filter(m => m.estado_economico === "pendiente_revision").reduce((s, m) => s + Number(m.total), 0);
  const totalViaticos = movimientos.filter(m => m.tipo_actividad === "viatico").reduce((s, m) => s + Number(m.total), 0);

  // Find liquidacion for the selected month
  const liqMes = historico.find(h => h.mes === mes);
  const ultimoPago = historico.find(h => h.estado === "pagada");

  const formatDate = (d: string) => {
    const date = new Date(d + "T12:00:00");
    return date.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Cargando...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/coach")}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <img src={logo} alt="Ciclismo Reybaud" className="w-8 h-8" />
            <h1 className="font-heading font-bold text-foreground text-sm uppercase tracking-wider">
              Liquidaciones
            </h1>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-6">
        {/* Month navigation */}
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="icon" onClick={() => setMes(shiftMonth(mes, -1))}>
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <p className="text-sm text-foreground font-heading font-semibold uppercase tracking-wider capitalize">
            {formatMes(mes)}
          </p>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMes(shiftMonth(mes, 1))}
            disabled={isCurrentMonth}
          >
            <ChevronRight className="w-5 h-5" />
          </Button>
        </div>

        {/* Liquidacion status for past months */}
        {liqMes && (
          <div className="flex items-center justify-center">
            <Badge variant="outline" className="text-xs capitalize">
              Estado: {liqMes.estado}
              {liqMes.fecha_pago && ` — Pagado ${new Date(liqMes.fecha_pago).toLocaleDateString("es-AR")}`}
            </Badge>
          </div>
        )}

        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-3">
          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle className="w-4 h-4 text-emerald-400" />
                <span className="text-xs text-muted-foreground">Confirmado</span>
              </div>
              <p className="text-xl font-heading font-bold text-foreground">
                ${confirmado.toLocaleString("es-AR")}
              </p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="w-4 h-4 text-blue-400" />
                <span className="text-xs text-muted-foreground">Estimado</span>
              </div>
              <p className="text-xl font-heading font-bold text-foreground">
                ${estimado.toLocaleString("es-AR")}
              </p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="w-4 h-4 text-amber-400" />
                <span className="text-xs text-muted-foreground">Pendiente</span>
              </div>
              <p className="text-xl font-heading font-bold text-foreground">
                ${pendiente.toLocaleString("es-AR")}
              </p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <DollarSign className="w-4 h-4 text-violet-400" />
                <span className="text-xs text-muted-foreground">Viáticos</span>
              </div>
              <p className="text-xl font-heading font-bold text-foreground">
                ${totalViaticos.toLocaleString("es-AR")}
              </p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border col-span-2">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs text-muted-foreground">Último pago</span>
                  <p className="text-xl font-heading font-bold text-foreground">
                    {ultimoPago ? `$${Number(ultimoPago.total_pagado).toLocaleString("es-AR")}` : "–"}
                  </p>
                </div>
                {ultimoPago?.fecha_pago && (
                  <p className="text-xs text-muted-foreground">
                    {new Date(ultimoPago.fecha_pago).toLocaleDateString("es-AR")}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {FILTROS.map((f) => (
            <Button
              key={f}
              variant={filtro === f ? "default" : "outline"}
              size="sm"
              className="text-xs capitalize shrink-0"
              onClick={() => setFiltro(f)}
            >
              {f}
            </Button>
          ))}
        </div>

        {/* Action buttons */}
        <div className="grid grid-cols-2 gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowClaseForm(true)}
          >
            <Plus className="w-4 h-4 mr-2" /> Registrar clase
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowViaticoForm(true)}
          >
            <Plus className="w-4 h-4 mr-2" /> Registrar viático
          </Button>
        </div>

        {/* Class registration dialog */}
        <Dialog open={showClaseForm} onOpenChange={setShowClaseForm}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Registrar clase realizada</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">Fecha</label>
                <Input
                  type="date"
                  value={claseForm.fecha}
                  onChange={(e) => setClaseForm({ ...claseForm, fecha: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">Tipo de actividad</label>
                <Select
                  value={claseForm.tipo_actividad}
                  onValueChange={(v) => setClaseForm({ ...claseForm, tipo_actividad: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="grupal_1h30">Grupal 1h30</SelectItem>
                    <SelectItem value="grupal_2h">Grupal 2h</SelectItem>
                    <SelectItem value="fondo_salida">Fondo/Salida</SelectItem>
                    <SelectItem value="tecnica">Técnica</SelectItem>
                    <SelectItem value="evento_escuela">Evento Escuela</SelectItem>
                    <SelectItem value="evaluatoria">Evaluatoria</SelectItem>
                    <SelectItem value="personalizada">Personalizada</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {isIndividualType(claseForm.tipo_actividad) ? (
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground mb-1 block">Alumno(s)</label>
                  {alumnos.length > 0 ? (
                    <div className="max-h-40 overflow-y-auto border border-border rounded-md p-2 space-y-1">
                      {alumnos.map((a) => (
                        <label key={a.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5">
                          <input
                            type="checkbox"
                            checked={claseForm.alumno_ids.includes(a.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setClaseForm({ ...claseForm, alumno_ids: [...claseForm.alumno_ids, a.id] });
                              } else {
                                setClaseForm({ ...claseForm, alumno_ids: claseForm.alumno_ids.filter(id => id !== a.id) });
                              }
                            }}
                            className="rounded border-border"
                          />
                          <span className="text-foreground">{a.nombre} {a.apellido || ""}</span>
                        </label>
                      ))}
                    </div>
                  ) : null}
                  <Input
                    placeholder="O escribí el nombre manualmente"
                    value={claseForm.nombre_externo}
                    onChange={(e) => setClaseForm({ ...claseForm, nombre_externo: e.target.value })}
                  />
                </div>
              ) : coachGrupos.length > 0 ? (
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">Grupo</label>
                  <Select
                    value={claseForm.grupo}
                    onValueChange={(v) => setClaseForm({ ...claseForm, grupo: v })}
                  >
                    <SelectTrigger><SelectValue placeholder="Seleccionar grupo" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Todos">Todos los grupos</SelectItem>
                      {coachGrupos.map((g) => (
                        <SelectItem key={g} value={g}>{g}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">Observaciones (opcional)</label>
                <Textarea
                  placeholder="Detalle de la clase..."
                  value={claseForm.observaciones}
                  onChange={(e) => setClaseForm({ ...claseForm, observaciones: e.target.value })}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                La clase quedará en estado "Pendiente de revisión" hasta que el administrador la apruebe.
              </p>
              <Button onClick={submitClase} className="w-full">Registrar clase</Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Viático registration dialog */}
        <Dialog open={showViaticoForm} onOpenChange={setShowViaticoForm}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Registrar viático</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">Fecha</label>
                <Input
                  type="date"
                  value={viaticoForm.fecha}
                  onChange={(e) => setViaticoForm({ ...viaticoForm, fecha: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">Concepto</label>
                <Input
                  placeholder="Ej: Peaje, Combustible, Estacionamiento..."
                  value={viaticoForm.concepto}
                  onChange={(e) => setViaticoForm({ ...viaticoForm, concepto: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">Monto ($)</label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={viaticoForm.monto}
                  onChange={(e) => setViaticoForm({ ...viaticoForm, monto: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">Observaciones (opcional)</label>
                <Textarea
                  placeholder="Detalle adicional..."
                  value={viaticoForm.observaciones}
                  onChange={(e) => setViaticoForm({ ...viaticoForm, observaciones: e.target.value })}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                El viático quedará en estado "Pendiente de revisión" hasta que el administrador lo apruebe.
              </p>
              <Button onClick={submitViatico} className="w-full">Registrar viático</Button>
            </div>
          </DialogContent>
        </Dialog>
        <div className="space-y-2">
          {filteredMovimientos.length === 0 ? (
            <Card className="bg-card border-border">
              <CardContent className="p-6 text-center">
                <p className="text-muted-foreground text-sm">No hay movimientos para este filtro.</p>
              </CardContent>
            </Card>
          ) : (
            filteredMovimientos.map((m) => (
              <Card key={m.id} className="bg-card border-border">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground font-mono">{formatDate(m.fecha)}</span>
                        <Badge variant="secondary" className="text-xs">
                          {TIPO_LABELS[m.tipo_actividad] || m.tipo_actividad}
                        </Badge>
                        {m.origen === "carga_coach" && (
                          <Badge variant="outline" className="text-[10px] text-primary border-primary/30">
                            Cargado por vos
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-foreground truncate">
                        {m.grupo || m.nombre_externo || m.evento || "–"}
                      </p>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px]">
                          {ESTADO_OP_LABELS[m.estado_operativo] || m.estado_operativo}
                        </Badge>
                        <Badge className={`text-[10px] border ${ESTADO_EC_COLORS[m.estado_economico] || "bg-muted text-muted-foreground"}`}>
                          {ESTADO_EC_LABELS[m.estado_economico] || m.estado_economico}
                        </Badge>
                      </div>
                      {m.observaciones && (
                        <p className="text-xs text-muted-foreground italic">{m.observaciones}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-lg font-heading font-bold text-foreground">
                        ${Number(m.total).toLocaleString("es-AR")}
                      </p>
                      {(Number(m.viaticos) > 0 || Number(m.extras) > 0) && (
                        <p className="text-[10px] text-muted-foreground">
                          {Number(m.viaticos) > 0 && `Viát: $${Number(m.viaticos).toLocaleString("es-AR")}`}
                          {Number(m.extras) > 0 && ` Extra: $${Number(m.extras).toLocaleString("es-AR")}`}
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </main>
    </div>
  );
};

export default CoachLiquidaciones;
