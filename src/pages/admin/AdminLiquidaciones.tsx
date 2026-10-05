import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import {
  AlertTriangle, CheckCircle, ChevronDown, ChevronRight, Download, Plus, Loader2, Info,
} from "lucide-react";
import CoachAgendaGrupal from "@/components/admin/CoachAgendaGrupal";
import LiquidacionCargaRapidaDialog from "@/components/admin/LiquidacionCargaRapidaDialog";
import { LIQ_TIPO_LABELS } from "@/lib/liquidacionCarga";
import { buildLiquidacionesWorkbook, downloadBlob, type LiqDetalleRow, type LiqResumenRow } from "@/lib/liquidacionesExcel";

const TIPO_LABELS: Record<string, string> = LIQ_TIPO_LABELS;

const ESTADO_OP_LABELS: Record<string, string> = {
  programada: "Programada", reservada: "Reservada", realizada: "Realizada",
  suspendida_por_lluvia: "Susp. lluvia", suspendida_por_otro_motivo: "Susp. otro",
  cancelada_por_alumno: "Canc. alumno", cancelada_por_admin: "Canc. admin",
  ausente_alumno: "Ausente", reprogramada: "Reprogramada",
};

const ORIGEN_LABELS: Record<string, string> = {
  agenda_admin: "Agenda", turnera: "Turnera", carga_coach: "Manual", ajuste_manual: "Ajuste",
};

const ESTADO_LIQ = ["borrador", "en_revision", "observada", "aprobada", "pagada"] as const;

type Coach = { id: string; nombre: string };

const money = (n: number) => `$${Number(n || 0).toLocaleString("es-AR")}`;

const shiftMonth = (month: string, offset: number) => {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(year, monthNumber - 1 + offset, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
};

const getPreviousMonth = () => {
  const now = new Date();
  return shiftMonth(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`, -1);
};

const AdminLiquidaciones = () => {
  const [tab, setTab] = useState(() => new URLSearchParams(window.location.search).get("tab") || "resumen");
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [selectedCoach, setSelectedCoach] = useState<string>("all");
  const [mes, setMes] = useState(getPreviousMonth);
  const [liquidaciones, setLiquidaciones] = useState<any[]>([]);
  const [movimientos, setMovimientos] = useState<any[]>([]);
  const [honorarios, setHonorarios] = useState<any[]>([]);
  const [reglas, setReglas] = useState<any[]>([]);
  const [sedes, setSedes] = useState<any[]>([]);
  const [servicios, setServicios] = useState<any[]>([]);
  const [alertas, setAlertas] = useState<any>(null);
  const [pendientesGlobales, setPendientesGlobales] = useState<any[]>([]);
  const [previousMonthHasActivity, setPreviousMonthHasActivity] = useState(false);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [agendaCoach, setAgendaCoach] = useState<string>("");

  const [showHonForm, setShowHonForm] = useState(false);
  const [editingHon, setEditingHon] = useState<any>(null);
  const [honForm, setHonForm] = useState({ nombre_concepto: "", categoria: "clase", valor: "", coach_id: "" });
  const [showAjusteForm, setShowAjusteForm] = useState(false);
  const [ajusteForm, setAjusteForm] = useState({ coach_id: "", valor_base: "", observaciones: "" });

  const [showCargaRapida, setShowCargaRapida] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [sendingTest, setSendingTest] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: ok } = await supabase.rpc("is_super_admin" as any, { _user_id: data.user.id });
      setIsSuperAdmin(!!ok);
    });
  }, []);

  const enviarRecordatorioPrueba = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testEmail.trim())) {
      toast({ title: "Email inválido", variant: "destructive" });
      return;
    }
    setSendingTest(true);
    const { data, error } = await supabase.functions.invoke("send-liquidacion-reminders", {
      body: { test_email: testEmail.trim(), mes },
    });
    setSendingTest(false);
    if (error || (data as any)?.error) {
      toast({ title: "No se pudo enviar", description: (data as any)?.error || error?.message, variant: "destructive" });
      return;
    }
    toast({ title: (data as any)?.sent ? "Recordatorio de prueba enviado" : "No enviado", description: (data as any)?.reason || testEmail });
  };

  useEffect(() => { loadData(); /* eslint-disable-next-line */ }, [mes, selectedCoach]);

  const loadData = async () => {
    setLoading(true);
    const startDate = `${mes}-01`;
    const endDate = new Date(Number(mes.split("-")[0]), Number(mes.split("-")[1]), 0).toISOString().split("T")[0];

    let movQuery = supabase.from("movimientos_liquidacion").select("*").gte("fecha", startDate).lte("fecha", endDate).order("fecha");
    if (selectedCoach !== "all") movQuery = movQuery.eq("coach_id", selectedCoach);
    let pendQuery = supabase.from("movimientos_liquidacion").select("*").eq("estado_economico", "pendiente_revision").order("fecha", { ascending: false }).limit(5000);
    if (selectedCoach !== "all") pendQuery = pendQuery.eq("coach_id", selectedCoach);
    let liqQuery = supabase.from("liquidaciones_mensuales").select("*").eq("mes", mes);
    if (selectedCoach !== "all") liqQuery = liqQuery.eq("coach_id", selectedCoach);

    const previousMonth = shiftMonth(mes, -1);
    const previousStart = `${previousMonth}-01`;
    const [previousYear, previousNumber] = previousMonth.split("-").map(Number);
    const previousEnd = new Date(previousYear, previousNumber, 0).toISOString().split("T")[0];
    let previousQuery = supabase.from("movimientos_liquidacion").select("id", { count: "exact", head: true }).gte("fecha", previousStart).lte("fecha", previousEnd);
    if (selectedCoach !== "all") previousQuery = previousQuery.eq("coach_id", selectedCoach);

    const [coachesRes, honRes, reglasRes, sedesRes, servRes, movs, liqs, alertRes, pendRes, previousRes] = await Promise.all([
      supabase.from("coaches").select("id, nombre").eq("estado", "activo").order("nombre"),
      supabase.from("honorarios").select("*").order("nombre_concepto"),
      supabase.from("reglas_liquidacion").select("*").order("tipo_actividad"),
      supabase.from("sedes").select("id, nombre"),
      supabase.from("servicios_turnera").select("id, nombre, tipo_actividad, honorario_id, activo").order("nombre"),
      movQuery,
      liqQuery,
      supabase.rpc("get_liquidaciones_alertas" as any),
      pendQuery,
      previousQuery,
    ]);

    setCoaches((coachesRes.data as any[]) || []);
    setHonorarios((honRes.data as any[]) || []);
    setReglas((reglasRes.data as any[]) || []);
    setSedes((sedesRes.data as any[]) || []);
    setServicios((servRes.data as any[]) || []);
    setMovimientos((movs.data as any[]) || []);
    setLiquidaciones((liqs.data as any[]) || []);
    setAlertas(Array.isArray(alertRes.data) ? alertRes.data[0] : alertRes.data);
    setPendientesGlobales((pendRes.data as any[]) || []);
    setPreviousMonthHasActivity((previousRes.count || 0) > 0);
    setLoading(false);
  };

  const coachName = (id: string) => coaches.find((c) => c.id === id)?.nombre || "–";
  const sedeName = (id: string | null) => sedes.find((s) => s.id === id)?.nombre || "";
  const honName = (id: string | null) => honorarios.find((h) => h.id === id)?.nombre_concepto || "";

  const formatMes = (m: string) => {
    const [y, mo] = m.split("-");
    return new Date(Number(y), Number(mo) - 1).toLocaleDateString("es-AR", { month: "long", year: "numeric" });
  };

  // Backlog global de revisión (todos los meses); alimenta la alerta y la pestaña Revisar.
  const pendientes = pendientesGlobales;
  const pendientesResumen = useMemo(() => ({
    count: pendientesGlobales.length,
    monto: pendientesGlobales.reduce((s, m) => s + Number(m.total || 0), 0),
    cargaCoach: pendientesGlobales.filter((m) => m.origen === "carga_coach").length,
    sinHonorario: pendientesGlobales.filter((m) => Number(m.total || 0) === 0).length,
  }), [pendientesGlobales]);

  const motivoPendiente = (m: any) => {
    if (m.origen === "carga_coach") return "Carga manual del coach";
    if (Number(m.total) === 0 && (m.observaciones || "").toLowerCase().includes("honorario")) return "Sin honorario configurado";
    if ((m.observaciones || "").toLowerCase().includes("regla")) return "Sin regla de liquidación";
    return m.observaciones || "Requiere revisión";
  };

  const coachSummaries = useMemo(() => {
    return coaches
      .map((c) => {
        const cm = movimientos.filter((m) => m.coach_id === c.id);
        const confirmado = cm.filter((m) => m.estado_economico === "liquidable" || m.estado_economico === "liquidada")
          .reduce((s, m) => s + Number(m.total || 0), 0);
        const estimado = cm.filter((m) => m.estado_operativo === "programada" || m.estado_operativo === "reservada")
          .reduce((s, m) => s + Number(m.total || 0), 0);
        const pend = cm.filter((m) => m.estado_economico === "pendiente_revision");
        const totalCargado = cm.filter((m) => m.estado_economico !== "no_liquidable")
          .reduce((s, m) => s + Number(m.total || 0), 0);
        return {
          ...c,
          movs: cm,
          clases: cm.filter((m) => m.origen === "agenda_admin").length,
          turnera: cm.filter((m) => m.origen === "turnera").length,
          manuales: cm.filter((m) => m.origen === "carga_coach").length,
          pendientes: pend.length,
          montoPendiente: pend.reduce((s, m) => s + Number(m.total || 0), 0),
          totalCargado,
          confirmado,
          estimado,
          liq: liquidaciones.find((l) => l.coach_id === c.id),
        };
      })
      .filter((c) => c.movs.length > 0 || c.liq);
  }, [coaches, movimientos, liquidaciones]);

  const monthOptions = Array.from({ length: 12 }, (_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  /* ---------- acciones ---------- */

  const saveHonorario = async () => {
    if (!honForm.nombre_concepto || !honForm.valor) return;
    const payload: any = {
      nombre_concepto: honForm.nombre_concepto,
      categoria: honForm.categoria,
      valor: Number(honForm.valor),
      coach_id: honForm.coach_id || null,
    };
    const { error } = editingHon
      ? await supabase.from("honorarios").update(payload).eq("id", editingHon.id)
      : await supabase.from("honorarios").insert(payload);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: editingHon ? "Honorario actualizado" : "Honorario creado" });
    setShowHonForm(false);
    setEditingHon(null);
    setHonForm({ nombre_concepto: "", categoria: "clase", valor: "", coach_id: "" });
    loadData();
  };

  const openHonForm = (hon?: any) => {
    if (hon) {
      setEditingHon(hon);
      setHonForm({ nombre_concepto: hon.nombre_concepto, categoria: hon.categoria, valor: String(hon.valor), coach_id: hon.coach_id || "" });
    } else {
      setEditingHon(null);
      setHonForm({ nombre_concepto: "", categoria: "clase", valor: "", coach_id: "" });
    }
    setShowHonForm(true);
  };

  const deleteHonorario = async (id: string) => {
    const { error } = await supabase.from("honorarios").delete().eq("id", id);
    if (error) { toast({ title: "No se pudo eliminar", description: error.message, variant: "destructive" }); return; }
    loadData();
  };

  const setServicioHonorario = async (servicioId: string, honorarioId: string | null) => {
    const { error } = await supabase.from("servicios_turnera").update({ honorario_id: honorarioId } as any).eq("id", servicioId);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Honorario del profesor actualizado" });
    loadData();
  };

  const addAjusteManual = async () => {
    if (!ajusteForm.coach_id || !ajusteForm.valor_base) return;
    const val = Number(ajusteForm.valor_base);
    const { error } = await supabase.from("movimientos_liquidacion").insert({
      coach_id: ajusteForm.coach_id,
      fecha: new Date().toISOString().split("T")[0],
      tipo_actividad: "ajuste",
      origen: "ajuste_manual",
      valor_base: val,
      total: val,
      estado_operativo: "realizada",
      estado_economico: "liquidable",
      observaciones: ajusteForm.observaciones || null,
    } as any);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Ajuste creado" });
    setShowAjusteForm(false);
    setAjusteForm({ coach_id: "", valor_base: "", observaciones: "" });
    loadData();
  };

  const prepararLiquidacion = async (coachId: string) => {
    setBusy(coachId);
    const { error } = await supabase.rpc("preparar_liquidacion_mensual" as any, { p_coach_id: coachId, p_mes: mes });
    setBusy(null);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Liquidación preparada", description: "Quedó en revisión con los movimientos del mes vinculados." });
    loadData();
  };

  const updateEstadoLiq = async (liqId: string, nuevoEstado: string, coach: { id: string; nombre: string; confirmado: number }) => {
    if (nuevoEstado === "pagada") {
      if (coach.confirmado <= 0) {
        toast({ title: "No hay monto confirmado para liquidar", description: "Revisá los movimientos del coach antes de marcar como pagada.", variant: "destructive" });
        return;
      }
      const { error } = await supabase.rpc("pay_liquidacion_coach" as any, {
        p_liquidacion_id: liqId, p_coach_id: coach.id, p_mes: mes, p_monto: coach.confirmado, p_moneda: "ARS",
      });
      if (error) { toast({ title: "Error al marcar como pagada", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Liquidación pagada", description: `Se registró el gasto de ${coach.nombre} por ${money(coach.confirmado)}.` });
      loadData();
      return;
    }
    const { error } = await supabase.from("liquidaciones_mensuales").update({ estado: nuevoEstado } as any).eq("id", liqId);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: `Liquidación marcada como ${nuevoEstado.replace("_", " ")}` });
    loadData();
  };

  const [liqToDelete, setLiqToDelete] = useState<null | { id: string; nombre: string; estado: string; movs: number; confirmado: number; estimado: number }>(null);
  const [deletingLiq, setDeletingLiq] = useState(false);

  const confirmDeleteLiq = async () => {
    if (!liqToDelete) return;
    setDeletingLiq(true);
    const { error } = await supabase.rpc("delete_liquidacion_mensual" as any, { p_liquidacion_id: liqToDelete.id });
    setDeletingLiq(false);
    if (error) { toast({ title: "No se pudo eliminar la liquidación", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Liquidación eliminada", description: `${liqToDelete.nombre} · ${formatMes(mes)}. Los movimientos del mes se conservan.` });
    setLiqToDelete(null);
    loadData();
  };

  const updateMovEstado = async (movId: string, nuevoEstado: string) => {
    const { error } = await supabase.from("movimientos_liquidacion").update({ estado_economico: nuevoEstado } as any).eq("id", movId);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: nuevoEstado === "liquidable" ? "Movimiento confirmado" : "Movimiento excluido" });
    loadData();
  };

  const exportExcel = async () => {
    const resumen: LiqResumenRow[] = coachSummaries.map((c) => ({
      coach: c.nombre,
      clases: c.clases,
      turnera: c.turnera,
      manuales: c.manuales,
      pendientes: c.pendientes,
      monto_pendiente: c.montoPendiente,
      confirmado: c.confirmado,
      estimado: c.estimado,
      estado_liquidacion: c.liq?.estado || "sin preparar",
    }));
    const detalle: LiqDetalleRow[] = movimientos.map((m) => ({
      fecha: m.fecha,
      coach: coachName(m.coach_id),
      origen: ORIGEN_LABELS[m.origen] || m.origen,
      tipo: TIPO_LABELS[m.tipo_actividad] || m.tipo_actividad,
      detalle: m.grupo || m.nombre_externo || m.evento || "",
      sede: sedeName(m.sede_id),
      estado_operativo: ESTADO_OP_LABELS[m.estado_operativo] || m.estado_operativo || "",
      estado_economico: m.estado_economico || "",
      valor_base: Number(m.valor_base || 0),
      viaticos: Number(m.viaticos || 0),
      extras: Number(m.extras || 0) + Number(m.entrada || 0) + Number(m.estacionamiento || 0),
      total: Number(m.total || 0),
      observaciones: m.observaciones || "",
      reserva_turnera_id: m.reserva_turnera_id || "",
      movimiento_id: m.id,
    }));
    const label = selectedCoach === "all" ? "Todos los coaches" : coachName(selectedCoach);
    const blob = await buildLiquidacionesWorkbook(formatMes(mes), label, resumen, detalle);
    downloadBlob(blob, `liquidaciones-${mes}${selectedCoach === "all" ? "" : `-${label.replace(/\s+/g, "-").toLowerCase()}`}.xlsx`);
  };

  /* ---------- navegación ---------- */

  const handleIrARevisar = () => {
    setTab("revisar");
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", "revisar");
      window.history.replaceState(null, "", url.toString());
    } catch { /* noop */ }
    // Esperar al re-render para que el contenido de Revisar exista antes de scrollear.
    window.setTimeout(() => {
      const el = document.getElementById("liquidaciones-tabs");
      if (!el) return;
      const top = el.getBoundingClientRect().top + window.scrollY - 72;
      window.scrollTo({ top: Math.max(top, 0), behavior: "smooth" });
    }, 80);
  };

  /* ---------- render ---------- */

  const renderDetalleTabla = (movs: any[]) => (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Fecha</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Detalle</TableHead>
            <TableHead className="text-right">Base</TableHead>
            <TableHead className="text-right">Viáticos</TableHead>
            <TableHead className="text-right">Entrada</TableHead>
            <TableHead className="text-right">Estacionamiento</TableHead>
            <TableHead className="text-right">Extras</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead>Estado económico</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {movs.length === 0 ? (
            <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground">Sin movimientos</TableCell></TableRow>
          ) : movs.map((m) => (
            <TableRow key={m.id}>
              <TableCell className="text-xs font-mono">
                {new Date(m.fecha + "T12:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" })}
              </TableCell>
              <TableCell className="text-xs">{TIPO_LABELS[m.tipo_actividad] || m.tipo_actividad}</TableCell>
              <TableCell className="text-xs min-w-[180px]">{m.grupo || m.nombre_externo || m.evento || m.observaciones || "–"}</TableCell>
              <TableCell className="text-right font-mono text-xs">{money(Number(m.valor_base || 0))}</TableCell>
              <TableCell className="text-right font-mono text-xs">{money(Number(m.viaticos || 0))}</TableCell>
              <TableCell className="text-right font-mono text-xs">{money(Number(m.entrada || 0))}</TableCell>
              <TableCell className="text-right font-mono text-xs">{money(Number(m.estacionamiento || 0))}</TableCell>
              <TableCell className="text-right font-mono text-xs">{money(Number(m.extras || 0))}</TableCell>
              <TableCell className="text-right font-mono font-medium">{money(Number(m.total || 0))}</TableCell>
              <TableCell><Badge variant="outline" className="text-[10px] whitespace-nowrap">{m.estado_economico}</Badge></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-heading font-bold text-foreground">Liquidaciones</h1>
          <p className="text-sm text-muted-foreground">Actividad confirmada de los profesores, revisión y pago mensual</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Select value={mes} onValueChange={setMes}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {monthOptions.map((m) => <SelectItem key={m} value={m} className="capitalize">{formatMes(m)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={selectedCoach} onValueChange={setSelectedCoach}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="Todos los coaches" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los coaches</SelectItem>
              {coaches.map((c) => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={() => setShowCargaRapida(true)}>
            <Plus className="w-4 h-4 mr-2" /> Carga rápida de profesor
          </Button>
          <Button variant="outline" onClick={exportExcel}>
            <Download className="w-4 h-4 mr-2" /> Descargar Excel
          </Button>
        </div>
      </div>

      <LiquidacionCargaRapidaDialog
        open={showCargaRapida}
        onOpenChange={setShowCargaRapida}
        coaches={coaches}
        mesInicial={mes}
        monthOptions={monthOptions}
        onSaved={loadData}
      />

      {isSuperAdmin && (
        <Card className="border-border bg-card/50">
          <CardContent className="p-3 flex items-center gap-2 flex-wrap">
            <p className="text-xs text-muted-foreground mr-auto">Super admin · probar el recordatorio de liquidación (no afecta envíos reales)</p>
            <Input className="w-[240px] h-9" type="email" placeholder="email@ejemplo.com" value={testEmail} onChange={(e) => setTestEmail(e.target.value)} />
            <Button size="sm" variant="outline" disabled={sendingTest} onClick={enviarRecordatorioPrueba}>
              {sendingTest && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Enviar recordatorio de prueba
            </Button>
          </CardContent>
        </Card>
      )}

      {pendientesResumen.count > 0 && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="p-4 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-foreground">
                  {pendientesResumen.count} movimiento{pendientesResumen.count === 1 ? "" : "s"} requiere{pendientesResumen.count === 1 ? "" : "n"} revisión
                </p>
                <p className="text-xs text-muted-foreground">
                  {pendientesResumen.cargaCoach} carga{pendientesResumen.cargaCoach === 1 ? "" : "s"} manual{pendientesResumen.cargaCoach === 1 ? "" : "es"} ·{" "}
                  {pendientesResumen.sinHonorario} sin honorario configurado · {money(pendientesResumen.monto)} en juego
                </p>
              </div>
            </div>
            <Button size="sm" onClick={handleIrARevisar}>Ir a Revisar</Button>
          </CardContent>
        </Card>
      )}

      {alertas?.turnera_sin_movimiento > 0 && (
        <Card className="border-border bg-card/50">
          <CardContent className="p-3 flex items-start gap-2">
            <Info className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground">
              {alertas.turnera_sin_movimiento} turno{alertas.turnera_sin_movimiento === 1 ? "" : "s"} de Turnera marcado{alertas.turnera_sin_movimiento === 1 ? "" : "s"} como realizado
              no tiene movimiento de liquidación (registros previos a esta mejora). Sólo informativo: no se generan automáticamente.
            </p>
          </CardContent>
        </Card>
      )}

      <Tabs id="liquidaciones-tabs" value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="resumen">Resumen</TabsTrigger>
          <TabsTrigger value="revisar">
            Revisar {pendientes.length > 0 && <Badge variant="secondary" className="ml-2 text-[10px]">{pendientes.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="honorarios">Honorarios</TabsTrigger>
          <TabsTrigger value="agenda">Agenda</TabsTrigger>
          <TabsTrigger value="reglas">Reglas</TabsTrigger>
        </TabsList>


        {/* ------- RESUMEN ------- */}
        <TabsContent value="resumen" className="space-y-4 mt-4">
          <h2 className="font-heading font-semibold text-lg capitalize">Liquidaciones por profesor · {formatMes(mes)}</h2>
          {loading ? (
            <Card><CardContent className="p-6 text-center text-muted-foreground">Cargando…</CardContent></Card>
          ) : coachSummaries.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center space-y-3">
                <p className="text-muted-foreground capitalize">No hay liquidaciones registradas para {formatMes(mes)}</p>
                {previousMonthHasActivity && (
                  <Button variant="outline" size="sm" onClick={() => setMes(shiftMonth(mes, -1))} className="capitalize">
                    Ver {formatMes(shiftMonth(mes, -1))}
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {coachSummaries.map((c) => (
                <Card key={c.id} className="bg-card border-border">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <button
                        className="flex items-center gap-2 text-left"
                        onClick={() => setExpanded(expanded === c.id ? null : c.id)}
                      >
                        {expanded === c.id ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        <span className="font-medium text-foreground">{c.nombre}</span>
                        {c.liq && <Badge variant="outline" className="text-[10px] capitalize">{String(c.liq.estado).replace("_", " ")}</Badge>}
                      </button>
                      <div className="flex gap-2 items-center flex-wrap">
                        <Button size="sm" variant="outline" onClick={() => setExpanded(expanded === c.id ? null : c.id)}>
                          {expanded === c.id ? "Ocultar detalle" : "Ver detalle"}
                        </Button>
                        {!c.liq && (
                          <Button size="sm" variant="outline" disabled={busy === c.id} onClick={() => prepararLiquidacion(c.id)}>
                            {busy === c.id ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null} Preparar liquidación
                          </Button>
                        )}
                        {c.liq && c.liq.estado !== "pagada" && (
                          <>
                            <Button size="sm" variant="ghost" disabled={busy === c.id} onClick={() => prepararLiquidacion(c.id)}>
                              Recalcular
                            </Button>
                            <Select onValueChange={(v) => updateEstadoLiq(c.liq.id, v, { id: c.id, nombre: c.nombre, confirmado: c.confirmado })}>
                              <SelectTrigger className="w-[150px] h-8 text-xs"><SelectValue placeholder="Cambiar estado" /></SelectTrigger>
                              <SelectContent>
                                {ESTADO_LIQ.map((e) => <SelectItem key={e} value={e} className="text-xs capitalize">{e.replace("_", " ")}</SelectItem>)}
                              </SelectContent>
                            </Select>
                            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setLiqToDelete({
                              id: c.liq.id, nombre: c.nombre, estado: String(c.liq.estado), movs: c.movs.length,
                              confirmado: Number(c.liq.total_confirmado || 0), estimado: Number(c.liq.total_estimado || 0),
                            })}>
                              Eliminar
                            </Button>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                      <div className="col-span-2 md:col-span-1 rounded-md bg-primary/5 border border-primary/20 p-3">
                        <p className="text-[11px] text-muted-foreground">Total cargado</p>
                        <p className="text-xl font-bold text-foreground">{money(c.totalCargado)}</p>
                      </div>
                      <div><p className="text-[11px] text-muted-foreground">Movimientos</p><p className="font-medium">{c.movs.length}</p></div>
                      <div>
                        <p className="text-[11px] text-muted-foreground">Pendiente de revisión</p>
                        <p className={`font-medium ${c.pendientes > 0 ? "text-amber-500" : ""}`}>{money(c.montoPendiente)}</p>
                      </div>
                      <div><p className="text-[11px] text-muted-foreground">Confirmado</p><p className="font-medium text-emerald-400">{money(c.confirmado)}</p></div>
                    </div>

                    {c.liq && (
                      <p className="text-xs text-muted-foreground">
                        Liquidación del mes: confirmado {money(Number(c.liq.total_confirmado || 0))} · estimado {money(Number(c.liq.total_estimado || 0))}
                      </p>
                    )}

                    {expanded === c.id && (
                      <div className="pt-2 border-t border-border space-y-2">
                        <p className="text-xs text-muted-foreground md:hidden">Deslizá la tabla hacia los costados para ver el detalle completo.</p>
                        {renderDetalleTabla(c.movs)}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          <Button variant="outline" size="sm" onClick={() => setShowAjusteForm(true)}>
            <Plus className="w-4 h-4 mr-2" /> Ajuste manual
          </Button>

          <AlertDialog open={!!liqToDelete} onOpenChange={(o) => { if (!o && !deletingLiq) setLiqToDelete(null); }}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>¿Eliminar esta liquidación?</AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <div className="space-y-2 text-sm">
                    {liqToDelete && (
                      <ul className="space-y-1 text-foreground">
                        <li><span className="text-muted-foreground">Profesor:</span> {liqToDelete.nombre}</li>
                        <li className="capitalize"><span className="text-muted-foreground normal-case">Mes:</span> {formatMes(mes)}</li>
                        <li className="capitalize"><span className="text-muted-foreground normal-case">Estado:</span> {liqToDelete.estado.replace("_", " ")}</li>
                        <li><span className="text-muted-foreground">Confirmado / estimado:</span> {money(liqToDelete.confirmado)} / {money(liqToDelete.estimado)}</li>
                        <li><span className="text-muted-foreground">Movimientos del mes:</span> {liqToDelete.movs}</li>
                      </ul>
                    )}
                    <p className="text-muted-foreground">Se borra solo la liquidación. Los movimientos (clases, turnos, ajustes) se conservan y podés volver a prepararla. No se puede eliminar si está pagada o ya tiene un gasto registrado.</p>
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={deletingLiq}>Cancelar</AlertDialogCancel>
                <Button variant="destructive" disabled={deletingLiq} onClick={confirmDeleteLiq}>
                  {deletingLiq ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null} Confirmar eliminación
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <Dialog open={showAjusteForm} onOpenChange={setShowAjusteForm}>
            <DialogContent>
              <DialogHeader><DialogTitle>Ajuste manual</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <Select value={ajusteForm.coach_id} onValueChange={(v) => setAjusteForm({ ...ajusteForm, coach_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar coach" /></SelectTrigger>
                  <SelectContent>
                    {coaches.map((c) => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input type="number" placeholder="Monto" value={ajusteForm.valor_base} onChange={(e) => setAjusteForm({ ...ajusteForm, valor_base: e.target.value })} />
                <Textarea placeholder="Observaciones" value={ajusteForm.observaciones} onChange={(e) => setAjusteForm({ ...ajusteForm, observaciones: e.target.value })} />
                <Button onClick={addAjusteManual} className="w-full">Crear ajuste</Button>
              </div>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* ------- REVISAR ------- */}
        <TabsContent value="revisar" className="mt-4 space-y-3">
          <p className="text-sm text-muted-foreground">
            Pendientes de todos los meses{selectedCoach !== "all" ? ` de ${coachName(selectedCoach)}` : ""}. Confirmá para que se liquiden o excluilos.
          </p>
          {pendientes.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {pendientes.length} pendiente{pendientes.length === 1 ? "" : "s"} · {money(pendientesResumen.monto)}
            </p>
          )}
          {pendientes.length > 0 && (
            <p className="text-xs text-muted-foreground md:hidden">Deslizá la tabla hacia los costados para ver las acciones.</p>
          )}
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mes</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Coach</TableHead>
                  <TableHead>Origen</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Detalle</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendientes.length === 0 ? (
                  <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">Nada pendiente de revisión 🎉</TableCell></TableRow>
                ) : pendientes.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="text-xs whitespace-nowrap">
                      {new Date(m.fecha + "T12:00:00").toLocaleDateString("es-AR", { month: "short", year: "numeric" })}
                    </TableCell>
                    <TableCell className="text-xs font-mono">
                      {new Date(m.fecha + "T12:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" })}
                    </TableCell>
                    <TableCell className="text-xs">{coachName(m.coach_id)}</TableCell>
                    <TableCell><Badge variant="outline" className="text-[10px]">{ORIGEN_LABELS[m.origen] || m.origen}</Badge></TableCell>
                    <TableCell className="text-xs">{TIPO_LABELS[m.tipo_actividad] || m.tipo_actividad}</TableCell>
                    <TableCell className="text-xs">{m.grupo || m.nombre_externo || m.evento || "–"}</TableCell>
                    <TableCell className="text-xs text-amber-500">{motivoPendiente(m)}</TableCell>
                    <TableCell className="text-right font-mono">{money(Number(m.total || 0))}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" className="text-xs h-7 text-emerald-400" onClick={() => updateMovEstado(m.id, "liquidable")}>Confirmar</Button>
                        <Button variant="ghost" size="sm" className="text-xs h-7 text-destructive" onClick={() => updateMovEstado(m.id, "no_liquidable")}>Excluir</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ------- HONORARIOS ------- */}
        <TabsContent value="honorarios" className="mt-4 space-y-4">
          <Card className="bg-card/50 border-border">
            <CardContent className="p-4 text-sm text-muted-foreground space-y-1">
              <p><span className="font-medium text-foreground">1.</span> Definí cuánto se paga por cada tipo de clase.</p>
              <p><span className="font-medium text-foreground">2.</span> Asigná ese honorario a la agenda grupal del profesor o al servicio de Turnera (pestaña Agenda).</p>
              <p><span className="font-medium text-foreground">3.</span> Valores usados por Liquidaciones. Los reintegros de entrada, estacionamiento y viáticos se cargan por separado.</p>
            </CardContent>
          </Card>

          <div className="space-y-3">
            <div className="flex justify-between items-center flex-wrap gap-2">
              <h2 className="font-heading font-semibold">Honorarios</h2>
              <Button size="sm" onClick={() => openHonForm()}><Plus className="w-4 h-4 mr-2" /> Nuevo</Button>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Concepto</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead>Profesor</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {honorarios.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No hay honorarios cargados.</TableCell></TableRow>
                ) : honorarios.map((h) => (
                  <TableRow key={h.id}>
                    <TableCell className="font-medium">{h.nombre_concepto}</TableCell>
                    <TableCell><Badge variant="secondary" className="text-xs capitalize">{h.categoria}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{h.coach_id ? coachName(h.coach_id) : "–"}</TableCell>
                    <TableCell className="text-right font-mono">{money(Number(h.valor))}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" className="text-xs" onClick={() => openHonForm(h)}>Editar</Button>
                        <Button variant="ghost" size="sm" className="text-xs text-destructive" onClick={() => deleteHonorario(h.id)}>Eliminar</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ------- AGENDA ------- */}
        <TabsContent value="agenda" className="mt-4 space-y-6">


          <div className="space-y-3">
            <h2 className="font-heading font-semibold">Agenda grupal por profesor</h2>
            <Select value={agendaCoach} onValueChange={setAgendaCoach}>
              <SelectTrigger className="w-[260px]"><SelectValue placeholder="Elegí un profesor" /></SelectTrigger>
              <SelectContent>
                {coaches.map((c) => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
              </SelectContent>
            </Select>
            {agendaCoach ? (
              <CoachAgendaGrupal coachId={agendaCoach} coachNombre={coachName(agendaCoach)} />
            ) : (
              <p className="text-sm text-muted-foreground">Elegí un profesor para precargar sus clases grupales y asociarles el honorario.</p>
            )}
          </div>

          <div className="space-y-3">
            <h2 className="font-heading font-semibold">Servicios de Turnera</h2>
            <p className="text-xs text-muted-foreground">
              Honorario del profesor por turno realizado. No es el precio que paga el alumno.
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Servicio</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Honorario del profesor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {servicios.length === 0 ? (
                  <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">No hay servicios.</TableCell></TableRow>
                ) : servicios.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium text-sm">
                      {s.nombre}
                      {!s.activo && <Badge variant="outline" className="ml-2 text-[10px]">inactivo</Badge>}
                    </TableCell>
                    <TableCell className="text-xs">{TIPO_LABELS[s.tipo_actividad] || s.tipo_actividad || "–"}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Select
                          value={s.honorario_id || "none"}
                          onValueChange={(v) => setServicioHonorario(s.id, v === "none" ? null : v)}
                        >
                          <SelectTrigger className="w-[240px] h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Sin honorario</SelectItem>
                            {honorarios.map((h) => (
                              <SelectItem key={h.id} value={h.id}>{h.nombre_concepto} · {money(Number(h.valor))}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {!s.honorario_id && <AlertTriangle className="w-4 h-4 text-amber-500" />}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>


        {/* ------- REGLAS ------- */}
        <TabsContent value="reglas" className="mt-4">
          <p className="text-sm text-muted-foreground mb-4">Reglas que definen si cada tipo de actividad se liquida según su estado operativo.</p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tipo actividad</TableHead>
                <TableHead>Estado operativo</TableHead>
                <TableHead>¿Liquida?</TableHead>
                <TableHead>% Pago</TableHead>
                <TableHead>Observación</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reglas.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs font-medium">{TIPO_LABELS[r.tipo_actividad] || r.tipo_actividad}</TableCell>
                  <TableCell><Badge variant="outline" className="text-[10px]">{ESTADO_OP_LABELS[r.estado_operativo] || r.estado_operativo}</Badge></TableCell>
                  <TableCell>{r.liquida ? <CheckCircle className="w-4 h-4 text-emerald-400" /> : <span className="text-muted-foreground text-xs">No</span>}</TableCell>
                  <TableCell className="text-xs font-mono">{r.porcentaje_pago}%</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.observacion || "–"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TabsContent>
      </Tabs>

      <Dialog open={showHonForm} onOpenChange={(open) => { setShowHonForm(open); if (!open) setEditingHon(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingHon ? "Editar honorario" : "Nuevo honorario"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Nombre del concepto" value={honForm.nombre_concepto} onChange={(e) => setHonForm({ ...honForm, nombre_concepto: e.target.value })} />
            <Select value={honForm.categoria} onValueChange={(v) => setHonForm({ ...honForm, categoria: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="clase">Clase</SelectItem>
                <SelectItem value="evento">Evento</SelectItem>
                <SelectItem value="evaluacion">Evaluación</SelectItem>
                <SelectItem value="otro">Otro</SelectItem>
              </SelectContent>
            </Select>
            <Input type="number" placeholder="Valor ($)" value={honForm.valor} onChange={(e) => setHonForm({ ...honForm, valor: e.target.value })} />
            <Select value={honForm.coach_id || "none"} onValueChange={(v) => setHonForm({ ...honForm, coach_id: v === "none" ? "" : v })}>
              <SelectTrigger><SelectValue placeholder="Profesor asignado (opcional)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin profesor fijo</SelectItem>
                {coaches.map((c) => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button onClick={saveHonorario} className="w-full">{editingHon ? "Guardar cambios" : "Crear"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>

  );
};

export default AdminLiquidaciones;
