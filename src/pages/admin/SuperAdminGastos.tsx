import { useEffect, useState, useCallback, useMemo } from "react";
import { formatPrice } from "@/lib/currency";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Plus, Receipt, Wallet, Trash2, Edit2, AlertTriangle, Calendar,
  CheckCircle2, Clock, RefreshCw, Building2, Home, Boxes, CreditCard, TrendingDown, Link2,
  ChevronDown, ChevronUp,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";

type Ambito = "personal" | "emprendimiento" | "mixto";
type Frecuencia = "mensual" | "bimestral" | "trimestral" | "semestral" | "anual" | "variable";
type TipoGasto = "fijo" | "variable";
type EstadoEjec = "pendiente" | "pagado" | "vencido" | "omitido" | "parcial";

type ModalidadPago = "anticipado" | "vencido";

interface Recurrente {
  id: string;
  concepto: string;
  categoria: string;
  ambito: Ambito;
  responsable: string | null;
  monto_estimado: number;
  moneda: string;
  frecuencia: Frecuencia;
  dia_vencimiento: number | null;
  forma_pago_default: string | null;
  proveedor: string | null;
  notas: string | null;
  activo: boolean;
  tipo: TipoGasto;
  modalidad_pago: ModalidadPago;
}

interface Ejecucion {
  id: string;
  recurrente_id: string;
  mes: string;
  fecha_vencimiento: string | null;
  monto_previsto: number;
  moneda: string;
  estado: EstadoEjec;
  monto_pagado: number | null;
  fecha_pago: string | null;
  forma_pago: string | null;
  notas: string | null;
}

interface GastoRow {
  id: string;
  categoria: string;
  subcategoria: string | null;
  descripcion: string;
  monto: number;
  moneda: string;
  fecha: string;
  recurrente: boolean;
  frecuencia: string | null;
  proveedor: string | null;
  notas: string | null;
  forma_pago: string;
  created_at: string;
  mp_payment_id?: string | null;
  mp_status?: string | null;
  mp_external_reference?: string | null;
  origen_registro?: string | null;
  estado_conciliacion?: string | null;
}

const CATEGORIAS = ["Sueldos","Sueldos Variables","Vehiculo","Oficina","Servicios","Software","Honorarios","Marketing","Impuestos","Tarjetas","Educacion","Extras","Inversiones","Otros"];
const FORMA_PAGO_OPTS = [
  { v: "efectivo", l: "Efectivo" },
  { v: "transferencia", l: "Transferencia" },
  { v: "tarjeta_credito", l: "Tarjeta de Crédito" },
  { v: "mp_personal", l: "MP Personal" },
  { v: "mp_josi", l: "MP Josi" },
  { v: "mp_escuela", l: "MP Escuela" },
  { v: "mp_tienda", l: "MP Tienda" },
  { v: "mc_personal", l: "MC Personal" },
  { v: "banco", l: "Banco" },
];

const FORMA_PAGO_LABELS: Record<string, string> = Object.fromEntries(FORMA_PAGO_OPTS.map(o => [o.v, o.l]));

const fmt = (n: number, m: string = "ARS") => formatPrice(n || 0, m);
const monthLabel = (m: string) => {
  const [y, mm] = m.split("-");
  return new Date(Number(y), Number(mm) - 1, 1).toLocaleDateString("es-AR", { month: "long", year: "numeric" });
};
const nowMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const parseDate = (s: string | null) => {
  if (!s) return null;
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const daysTo = (s: string | null) => {
  const d = parseDate(s);
  if (!d) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
};

const ambitoBadge = (a: Ambito) => {
  const map: Record<Ambito, { l: string; cn: string; Icon: typeof Building2 }> = {
    emprendimiento: { l: "Empresa", cn: "bg-primary/15 text-primary border-primary/30", Icon: Building2 },
    personal: { l: "Personal", cn: "bg-accent/15 text-accent border-accent/30", Icon: Home },
    mixto: { l: "Mixto", cn: "bg-muted text-foreground border-border", Icon: Boxes },
  };
  const { l, cn, Icon } = map[a];
  return <Badge variant="outline" className={`gap-1 ${cn}`}><Icon className="w-3 h-3" />{l}</Badge>;
};

const estadoBadge = (e: EstadoEjec, dias: number | null) => {
  if (e === "pagado") return <Badge className="bg-green-500/15 text-green-500 border-green-500/30 gap-1"><CheckCircle2 className="w-3 h-3" />Pagado</Badge>;
  if (e === "vencido") return <Badge variant="destructive" className="gap-1"><AlertTriangle className="w-3 h-3" />Vencido</Badge>;
  if (e === "omitido") return <Badge variant="outline">Omitido</Badge>;
  if (e === "parcial") return <Badge className="bg-yellow-500/15 text-yellow-500 border-yellow-500/30">Parcial</Badge>;
  if (dias !== null && dias <= 3) return <Badge className="bg-orange-500/15 text-orange-500 border-orange-500/30 gap-1"><Clock className="w-3 h-3" />Vence en {dias}d</Badge>;
  return <Badge variant="outline" className="gap-1"><Clock className="w-3 h-3" />Pendiente</Badge>;
};

const SuperAdminGastos = () => {
  const [loading, setLoading] = useState(true);
  const [mes, setMes] = useState(nowMonth());
  const [recurrentes, setRecurrentes] = useState<Recurrente[]>([]);
  const [ejecuciones, setEjecuciones] = useState<Ejecucion[]>([]);
  const [gastos, setGastos] = useState<GastoRow[]>([]);

  // Buscadores por pestaña
  const [searchAgenda, setSearchAgenda] = useState("");
  const [searchMatriz, setSearchMatriz] = useState("");
  const [searchCatalogo, setSearchCatalogo] = useState("");
  const [searchHistorico, setSearchHistorico] = useState("");
  const [searchConciliar, setSearchConciliar] = useState("");

  // Catálogo dialog
  const [catDialogOpen, setCatDialogOpen] = useState(false);
  const [editingRec, setEditingRec] = useState<Recurrente | null>(null);
  const [recForm, setRecForm] = useState({
    concepto: "", categoria: "Otros", ambito: "emprendimiento" as Ambito,
    responsable: "Tay", monto_estimado: "", moneda: "ARS",
    frecuencia: "mensual" as Frecuencia, dia_vencimiento: "10",
    forma_pago_default: "transferencia", proveedor: "", notas: "", activo: true,
    tipo: "fijo" as TipoGasto,
    modalidad_pago: "anticipado" as ModalidadPago,
  });
  const [catalogoTipoTab, setCatalogoTipoTab] = useState<TipoGasto>("fijo");
  const [deudaExpanded, setDeudaExpanded] = useState(false);

  // Pago dialog
  const [pagoDialogOpen, setPagoDialogOpen] = useState(false);
  const [payingEjec, setPayingEjec] = useState<{ ejec: Ejecucion; rec: Recurrente } | null>(null);
  const [pagos, setPagos] = useState<Array<{ id: string; monto: number; fecha: string; forma_pago: string; notas: string | null; es_excedente?: boolean; motivo_excedente?: string | null }>>([]);
  const [prevPeriodInfo, setPrevPeriodInfo] = useState<{ mes: string; total: number } | null>(null);
  const [editingPagoId, setEditingPagoId] = useState<string | null>(null);
  const [pagoForm, setPagoForm] = useState({
    monto: "", fecha: new Date().toISOString().split("T")[0],
    forma_pago: "transferencia", notas: "",
    nuevo_previsto: "", // si != original, ajusta previsto en el mismo paso
    es_excedente: false,
    motivo_excedente: "",
  });


  // Deuda
  const [deudaSaldos, setDeudaSaldos] = useState<Record<string, { saldo: number; moneda: string }>>({});
  const [deudaDialogOpen, setDeudaDialogOpen] = useState(false);
  const [deudaRec, setDeudaRec] = useState<Recurrente | null>(null);
  const [deudaMovs, setDeudaMovs] = useState<Array<{ id: string; tipo: string; monto: number; fecha: string; concepto: string | null; forma_pago: string | null; notas: string | null; gasto_id: string | null }>>([]);
  const [deudaDetalle, setDeudaDetalle] = useState<{ automatica: number; cargos: number; ajustes: number; pagos: number; saldo: number; moneda: string } | null>(null);
  const [editingDeudaMovId, setEditingDeudaMovId] = useState<string | null>(null);
  const [deudaForm, setDeudaForm] = useState({
    tipo: "pago" as "pago" | "cargo" | "ajuste",
    monto: "", fecha: new Date().toISOString().split("T")[0],
    forma_pago: "transferencia", concepto: "", notas: "",
  });

  const loadDeudaSaldos = useCallback(async () => {
    const { data } = await supabase.rpc("get_all_gastos_saldo_deuda" as any);
    const map: Record<string, { saldo: number; moneda: string }> = {};
    for (const row of (data || []) as any[]) {
      map[row.recurrente_id] = { saldo: Number(row.saldo_total || 0), moneda: row.moneda || "ARS" };
    }
    setDeudaSaldos(map);
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [recRes, ejecRes, gastosRes] = await Promise.all([
      supabase.from("gastos_recurrentes").select("*").order("categoria").order("concepto"),
      supabase.from("gastos_ejecuciones").select("*").eq("mes", mes),
      supabase.from("gastos").select("*").order("fecha", { ascending: false }).limit(200),
    ]);
    setRecurrentes((recRes.data || []) as any);
    setEjecuciones((ejecRes.data || []) as any);
    setGastos((gastosRes.data || []) as any);
    await loadDeudaSaldos();
    setLoading(false);
  }, [mes, loadDeudaSaldos]);

  useEffect(() => { loadData(); }, [loadData]);

  // Auto-generar ejecuciones si el mes está vacío y no es un mes pasado lejano
  useEffect(() => {
    if (loading) return;
    if (ejecuciones.length > 0) return;
    // Solo auto-genera para el mes actual o futuros (evita ensuciar histórico)
    if (mes < nowMonth()) return;
    (async () => {
      await supabase.rpc("generate_gastos_ejecuciones_month", { p_mes: mes });
      loadData();
    })();
  }, [loading, ejecuciones.length, mes, loadData]);

  const generarMes = async () => {
    const { error } = await supabase.rpc("generate_gastos_ejecuciones_month", { p_mes: mes });
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Mes generado", description: `Ejecuciones de ${monthLabel(mes)} actualizadas` });
    loadData();
  };

  // -------- KPIs ----------
  const kpis = useMemo(() => {
    const k = {
      total: 0, pagado: 0, pendiente: 0, vencido: 0,
      personal: 0, empresa: 0, mixto: 0, vencidoCount: 0, proximosCount: 0,
    };
    for (const e of ejecuciones) {
      const rec = recurrentes.find(r => r.id === e.recurrente_id);
      if (!rec) continue;
      k.total += e.monto_previsto || 0;
      if (e.estado === "pagado") k.pagado += e.monto_pagado || e.monto_previsto || 0;
      else k.pendiente += e.monto_previsto || 0;
      if (e.estado === "vencido") { k.vencido += e.monto_previsto || 0; k.vencidoCount++; }
      const d = daysTo(e.fecha_vencimiento);
      if (e.estado === "pendiente" && d !== null && d >= 0 && d <= 7) k.proximosCount++;
      if (rec.ambito === "personal") k.personal += e.monto_previsto || 0;
      else if (rec.ambito === "emprendimiento") k.empresa += e.monto_previsto || 0;
      else k.mixto += e.monto_previsto || 0;
    }
    return k;
  }, [ejecuciones, recurrentes]);

  // Agenda (pendientes + parciales ordenados por fecha). Pagadas se gestionan desde matriz o histórico.
  const agenda = useMemo(() => {
    return ejecuciones
      .filter(e => e.estado === "pendiente" || e.estado === "vencido" || e.estado === "parcial")
      .map(e => ({ e, rec: recurrentes.find(r => r.id === e.recurrente_id)! }))
      .filter(x => x.rec)
      .sort((a, b) => (a.e.fecha_vencimiento || "").localeCompare(b.e.fecha_vencimiento || ""));
  }, [ejecuciones, recurrentes]);


  // -------- Acciones ----------
  const loadPagosEjec = async (ejecId: string) => {
    const { data } = await supabase
      .from("gastos_ejecucion_pagos" as any)
      .select("id,monto,fecha,forma_pago,notas")
      .eq("ejecucion_id", ejecId)
      .order("fecha", { ascending: true });
    setPagos((data || []) as any);
  };

  const openPagar = async (e: Ejecucion, rec: Recurrente) => {
    setPayingEjec({ ejec: e, rec });
    setEditingPagoId(null);
    await loadPagosEjec(e.id);
    const totalPagado = (await supabase
      .from("gastos_ejecucion_pagos" as any)
      .select("monto").eq("ejecucion_id", e.id)).data?.reduce((s: number, p: any) => s + Number(p.monto || 0), 0) || 0;

    // "Previsto" dinámico = sumatoria de pagos de la última ejecución anterior pagada/parcial
    let previstoBase = e.monto_previsto || rec.monto_estimado || 0;
    let prevInfo: { mes: string; total: number } | null = null;
    const { data: prevEjecs } = await supabase
      .from("gastos_ejecuciones")
      .select("id, mes, estado")
      .eq("recurrente_id", rec.id)
      .lt("mes", e.mes)
      .in("estado", ["pagado", "parcial"])
      .order("mes", { ascending: false })
      .limit(1);
    const prevEjec = prevEjecs?.[0];
    if (prevEjec) {
      const { data: prevPagos } = await supabase
        .from("gastos_ejecucion_pagos" as any)
        .select("monto")
        .eq("ejecucion_id", prevEjec.id);
      const sum = (prevPagos || []).reduce((s: number, p: any) => s + Number(p.monto || 0), 0);
      if (sum > 0) {
        previstoBase = sum;
        prevInfo = { mes: prevEjec.mes, total: sum };
      }
    }
    setPrevPeriodInfo(prevInfo);

    const restante = Math.max(previstoBase - totalPagado, 0);
    setPagoForm({
      monto: String(restante || previstoBase),
      fecha: new Date().toISOString().split("T")[0],
      forma_pago: rec.forma_pago_default || "transferencia",
      notas: "",
      nuevo_previsto: String(previstoBase),
      es_excedente: false,
      motivo_excedente: "",
    });
    setPagoDialogOpen(true);
  };

  const confirmarPago = async () => {
    if (!payingEjec) return;
    const monto = Number(pagoForm.monto);
    if (!monto || monto <= 0) { toast({ title: "Monto inválido", variant: "destructive" }); return; }

    if (editingPagoId) {
      const { error } = await supabase.rpc("update_gasto_pago" as any, {
        p_pago_id: editingPagoId, p_monto: monto, p_fecha: pagoForm.fecha,
        p_forma_pago: pagoForm.forma_pago, p_notas: pagoForm.notas || null,
      });
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Pago actualizado" });
    } else {
      const previstoOriginal = payingEjec.ejec.monto_previsto || 0;
      const nuevoPrev = Number(pagoForm.nuevo_previsto);
      const ajustaPrev = !pagoForm.es_excedente && nuevoPrev > 0 && nuevoPrev !== previstoOriginal;
      const { error } = await supabase.rpc("register_gasto_pago_v2" as any, {
        p_ejec_id: payingEjec.ejec.id,
        p_monto: monto,
        p_fecha: pagoForm.fecha,
        p_forma_pago: pagoForm.forma_pago,
        p_notas: pagoForm.notas || null,
        p_es_excedente: pagoForm.es_excedente,
        p_motivo_excedente: pagoForm.es_excedente ? (pagoForm.motivo_excedente || null) : null,
        p_nuevo_previsto: ajustaPrev ? nuevoPrev : null,
      });
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
      toast({ title: pagoForm.es_excedente ? "Excedente registrado" : "Pago registrado", description: payingEjec.rec.concepto });
    }

    await loadPagosEjec(payingEjec.ejec.id);
    setEditingPagoId(null);
    setPagoForm(f => ({ ...f, monto: "", notas: "", es_excedente: false, motivo_excedente: "" }));
    loadData();
  };

  const startEditPago = (p: { id: string; monto: number; fecha: string; forma_pago: string; notas: string | null }) => {
    setEditingPagoId(p.id);
    setPagoForm({ monto: String(p.monto), fecha: p.fecha, forma_pago: p.forma_pago, notas: p.notas || "", nuevo_previsto: "", es_excedente: false, motivo_excedente: "" });
  };

  const cancelEditPago = () => {
    setEditingPagoId(null);
    setPagoForm(f => ({ ...f, monto: "", notas: "" }));
  };
  const openHistoricoEdit = async (g: GastoRow) => {
    const { data: pago } = await supabase
      .from("gastos_ejecucion_pagos" as any)
      .select("id,ejecucion_id,monto,fecha,forma_pago,notas")
      .eq("gasto_id", g.id).maybeSingle();
    if (!pago) {
      toast({ title: "Pago no vinculado", description: "Este movimiento es histórico libre. Eliminalo y recargalo desde la agenda.", variant: "destructive" });
      return;
    }
    const p: any = pago;
    const { data: ejec } = await supabase.from("gastos_ejecuciones").select("*").eq("id", p.ejecucion_id).maybeSingle();
    if (!ejec) { toast({ title: "Cuota no encontrada", variant: "destructive" }); return; }
    const rec = recurrentes.find(r => r.id === ejec.recurrente_id);
    if (!rec) { toast({ title: "Concepto no encontrado", variant: "destructive" }); return; }
    setPayingEjec({ ejec: ejec as any, rec });
    await loadPagosEjec(ejec.id);
    setEditingPagoId(p.id);
    setPagoForm({ monto: String(p.monto), fecha: p.fecha, forma_pago: p.forma_pago, notas: p.notas || "" });
    setPagoDialogOpen(true);
  };

  const deleteHistorico = async (g: GastoRow) => {
    const { data: pago } = await supabase
      .from("gastos_ejecucion_pagos" as any)
      .select("id").eq("gasto_id", g.id).maybeSingle();
    if (!confirm("¿Eliminar este movimiento del histórico? También se ajusta el estado de la cuota.")) return;
    if (pago) {
      const { error } = await supabase.rpc("delete_gasto_pago" as any, { p_pago_id: (pago as any).id });
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    } else {
      const { error } = await supabase.from("gastos").delete().eq("id", g.id);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    }
    toast({ title: "Movimiento eliminado" });
    loadData();
  };

  const confirmarConciliacion = async (g: GastoRow) => {
    const { error } = await supabase.from("gastos")
      .update({ estado_conciliacion: "conciliado" })
      .eq("id", g.id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Gasto conciliado" });
    loadData();
  };


  const deletePago = async (id: string) => {
    if (!confirm("¿Eliminar este pago? El estado de la cuota se va a recalcular.")) return;
    const { error } = await supabase.rpc("delete_gasto_pago" as any, { p_pago_id: id });
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Pago eliminado" });
    if (payingEjec) await loadPagosEjec(payingEjec.ejec.id);
    if (editingPagoId === id) cancelEditPago();
    loadData();
  };


  const omitirEjec = async (id: string) => {
    const { error } = await supabase.from("gastos_ejecuciones").update({ estado: "omitido" as EstadoEjec }).eq("id", id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Marcado como omitido" });
    loadData();
  };

  // -------- Deuda ----------
  const loadDeudaMovs = async (recId: string) => {
    const { data } = await supabase
      .from("gastos_deuda_movimientos" as any)
      .select("id,tipo,monto,fecha,concepto,forma_pago,notas,gasto_id")
      .eq("recurrente_id", recId)
      .order("fecha", { ascending: false });
    setDeudaMovs((data || []) as any);
  };

  const loadDeudaDetalle = async (recId: string) => {
    const { data } = await supabase.rpc("get_gasto_recurrente_saldo_deuda" as any, { p_rec_id: recId });
    const row: any = (data && (data as any[])[0]) || null;
    if (row) {
      setDeudaDetalle({
        automatica: Number(row.deuda_automatica || 0),
        cargos: Number(row.cargos_manuales || 0),
        ajustes: Number(row.ajustes || 0),
        pagos: Number(row.pagos_deuda || 0),
        saldo: Number(row.saldo_total || 0),
        moneda: row.moneda || "ARS",
      });
    } else setDeudaDetalle(null);
  };

  const openDeuda = async (rec: Recurrente) => {
    setDeudaRec(rec);
    setEditingDeudaMovId(null);
    setDeudaForm({
      tipo: "pago", monto: "", fecha: new Date().toISOString().split("T")[0],
      forma_pago: rec.forma_pago_default || "transferencia", concepto: "", notas: "",
    });
    await Promise.all([loadDeudaMovs(rec.id), loadDeudaDetalle(rec.id)]);
    setDeudaDialogOpen(true);
  };

  const confirmarDeudaMov = async () => {
    if (!deudaRec) return;
    const monto = Number(deudaForm.monto);
    if (!monto || monto <= 0) { toast({ title: "Monto inválido", variant: "destructive" }); return; }

    if (editingDeudaMovId) {
      const { error } = await supabase.rpc("update_gasto_deuda_mov" as any, {
        p_id: editingDeudaMovId, p_monto: monto, p_fecha: deudaForm.fecha,
        p_forma_pago: deudaForm.forma_pago || null,
        p_concepto: deudaForm.concepto || null,
        p_notas: deudaForm.notas || null,
      });
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Movimiento actualizado" });
    } else if (deudaForm.tipo === "pago") {
      const { error } = await supabase.rpc("register_gasto_deuda_pago" as any, {
        p_rec_id: deudaRec.id, p_monto: monto, p_fecha: deudaForm.fecha,
        p_forma_pago: deudaForm.forma_pago, p_notas: deudaForm.notas || null,
      });
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Pago a deuda registrado" });
    } else {
      const { error } = await supabase.rpc("register_gasto_deuda_cargo" as any, {
        p_rec_id: deudaRec.id, p_tipo: deudaForm.tipo, p_monto: monto, p_fecha: deudaForm.fecha,
        p_concepto: deudaForm.concepto || null, p_notas: deudaForm.notas || null,
      });
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
      toast({ title: deudaForm.tipo === "cargo" ? "Cargo agregado" : "Ajuste registrado" });
    }

    setEditingDeudaMovId(null);
    setDeudaForm(f => ({ ...f, monto: "", notas: "", concepto: "" }));
    await Promise.all([loadDeudaMovs(deudaRec.id), loadDeudaDetalle(deudaRec.id)]);
    loadData();
  };

  const startEditDeudaMov = (m: any) => {
    setEditingDeudaMovId(m.id);
    setDeudaForm({
      tipo: m.tipo, monto: String(m.monto), fecha: m.fecha,
      forma_pago: m.forma_pago || "transferencia",
      concepto: m.concepto || "", notas: m.notas || "",
    });
  };

  const cancelEditDeudaMov = () => {
    setEditingDeudaMovId(null);
    setDeudaForm(f => ({ ...f, monto: "", notas: "", concepto: "" }));
  };

  const deleteDeudaMov = async (id: string) => {
    if (!confirm("¿Eliminar este movimiento de deuda?")) return;
    const { error } = await supabase.rpc("delete_gasto_deuda_mov" as any, { p_id: id });
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Movimiento eliminado" });
    if (deudaRec) await Promise.all([loadDeudaMovs(deudaRec.id), loadDeudaDetalle(deudaRec.id)]);
    if (editingDeudaMovId === id) cancelEditDeudaMov();
    loadData();
  };


  // -------- Catálogo ----------
  const resetRecForm = () => setRecForm({
    concepto: "", categoria: "Otros", ambito: "emprendimiento",
    responsable: "Tay", monto_estimado: "", moneda: "ARS",
    frecuencia: "mensual", dia_vencimiento: "10",
    forma_pago_default: "transferencia", proveedor: "", notas: "", activo: true,
    tipo: catalogoTipoTab,
  });

  const openEditRec = (r: Recurrente) => {
    setEditingRec(r);
    setRecForm({
      concepto: r.concepto, categoria: r.categoria, ambito: r.ambito,
      responsable: r.responsable || "Tay", monto_estimado: String(r.monto_estimado),
      moneda: r.moneda, frecuencia: r.frecuencia,
      dia_vencimiento: String(r.dia_vencimiento || 10),
      forma_pago_default: r.forma_pago_default || "transferencia",
      proveedor: r.proveedor || "", notas: r.notas || "", activo: r.activo,
      tipo: r.tipo || "fijo",
    });
    setCatDialogOpen(true);
  };

  const saveRec = async () => {
    if (!recForm.concepto.trim()) { toast({ title: "Falta el concepto", variant: "destructive" }); return; }
    const payload = {
      concepto: recForm.concepto.trim(),
      categoria: recForm.categoria,
      ambito: recForm.ambito,
      responsable: recForm.responsable || null,
      monto_estimado: Number(recForm.monto_estimado) || 0,
      moneda: recForm.moneda,
      frecuencia: recForm.frecuencia,
      dia_vencimiento: recForm.dia_vencimiento ? Number(recForm.dia_vencimiento) : null,
      forma_pago_default: recForm.forma_pago_default,
      proveedor: recForm.proveedor || null,
      notas: recForm.notas || null,
      activo: recForm.activo,
      tipo: recForm.tipo,
    };
    if (editingRec) {
      const { error } = await supabase.from("gastos_recurrentes").update(payload as any).eq("id", editingRec.id);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Actualizado" });
    } else {
      const { error } = await supabase.from("gastos_recurrentes").insert(payload as any);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Concepto agregado" });
    }
    setCatDialogOpen(false); setEditingRec(null); resetRecForm();
    loadData();
  };

  const deleteRec = async (id: string) => {
    if (!confirm("¿Eliminar este concepto recurrente? También se borrarán sus ejecuciones futuras.")) return;
    const { error } = await supabase.from("gastos_recurrentes").delete().eq("id", id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Eliminado" });
    loadData();
  };

  // -------- Matriz (concepto × mes) ----------
  const [matrizYear, setMatrizYear] = useState(new Date().getFullYear());
  const [matrizData, setMatrizData] = useState<Record<string, Record<number, Ejecucion | null>>>({});

  const loadMatriz = useCallback(async () => {
    const ini = `${matrizYear}-01`; const fin = `${matrizYear}-12`;
    const { data } = await supabase.from("gastos_ejecuciones").select("*").gte("mes", ini).lte("mes", fin);
    const grid: Record<string, Record<number, Ejecucion | null>> = {};
    for (const e of (data || []) as Ejecucion[]) {
      const m = Number(e.mes.split("-")[1]);
      if (!grid[e.recurrente_id]) grid[e.recurrente_id] = {};
      grid[e.recurrente_id][m] = e;
    }
    setMatrizData(grid);
  }, [matrizYear]);

  useEffect(() => { loadMatriz(); }, [loadMatriz, ejecuciones]);

  if (loading) return <div className="animate-pulse text-muted-foreground text-center py-12">Cargando gastos...</div>;

  const recByCategoria = recurrentes.reduce((acc, r) => {
    (acc[r.categoria] = acc[r.categoria] || []).push(r);
    return acc;
  }, {} as Record<string, Recurrente[]>);
  const categoriaOrden = ["Sueldos", "Impuestos", "Sueldos variables", "Servicios", "Vehiculo"];
  const recByCategoriaOrdenado = Object.entries(recByCategoria).sort(([a], [b]) => {
    const ia = categoriaOrden.findIndex(c => c.toLowerCase() === a.toLowerCase());
    const ib = categoriaOrden.findIndex(c => c.toLowerCase() === b.toLowerCase());
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-heading font-bold uppercase tracking-wider">Gastos</h1>
          <p className="text-sm text-muted-foreground">Catálogo recurrente, agenda de pagos y control mensual</p>
      </div>

      {/* Banner cómo cargar pagos */}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="p-4 flex gap-3 items-start text-sm">
          <Wallet className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-heading font-bold text-foreground">Cómo cargo lo que pago cada mes</div>
            <ol className="text-muted-foreground text-xs space-y-0.5 list-decimal pl-4">
              <li>Elegí el mes en el selector de abajo. Si está vacío se generan automáticamente las cuotas del catálogo.</li>
              <li>En la pestaña <b>Agenda</b> tocá <b>Pagar</b> en cada concepto que pagaste y completá monto, fecha y forma de pago. Pasa a verde y queda registrado en el histórico contable.</li>
              <li>En la pestaña <b>Matriz anual</b> podés ver todo el año tipo planilla. Tocá cualquier celda pendiente para marcar el pago directo.</li>
              <li>Lo nuevo que no esté en el catálogo lo agregás desde <b>Catálogo → Nuevo</b> y reaparece automáticamente cada mes.</li>
            </ol>
          </div>
        </CardContent>
      </Card>
        <div className="flex items-center gap-2">
          <Input type="month" value={mes} onChange={(e) => setMes(e.target.value)} className="w-56 pr-3 text-foreground [color-scheme:dark]" />
          <Button variant="outline" size="sm" onClick={generarMes} className="gap-1">
            <RefreshCw className="w-4 h-4" /> Generar mes
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground uppercase tracking-wider">Total previsto</div>
          <div className="text-xl font-heading font-bold mt-1">{fmt(kpis.total)}</div>
          <div className="text-[11px] text-muted-foreground mt-1">{monthLabel(mes)}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground uppercase tracking-wider">Pagado</div>
          <div className="text-xl font-heading font-bold mt-1 text-green-500">{fmt(kpis.pagado)}</div>
          <div className="text-[11px] text-muted-foreground mt-1">{kpis.total > 0 ? Math.round((kpis.pagado / kpis.total) * 100) : 0}% del mes</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground uppercase tracking-wider">Pendiente</div>
          <div className="text-xl font-heading font-bold mt-1 text-orange-500">{fmt(kpis.pendiente)}</div>
          <div className="text-[11px] text-muted-foreground mt-1">{kpis.proximosCount} vencen en 7 días</div>
        </CardContent></Card>
        <Card className={kpis.vencidoCount > 0 ? "border-destructive" : ""}>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground uppercase tracking-wider">Vencido</div>
            <div className="text-xl font-heading font-bold mt-1 text-destructive">{fmt(kpis.vencido)}</div>
            <div className="text-[11px] text-muted-foreground mt-1">{kpis.vencidoCount} item{kpis.vencidoCount !== 1 ? "s" : ""}</div>
          </CardContent>
        </Card>
      </div>

      {/* Personal vs Empresa */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-heading font-bold uppercase tracking-wider">Distribución del mes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[
            { l: "Emprendimiento", v: kpis.empresa, Icon: Building2, cn: "bg-primary" },
            { l: "Personal", v: kpis.personal, Icon: Home, cn: "bg-accent" },
            { l: "Mixto", v: kpis.mixto, Icon: Boxes, cn: "bg-muted-foreground" },
          ].map(({ l, v, Icon, cn }) => (
            <div key={l} className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="flex items-center gap-1.5 text-muted-foreground"><Icon className="w-3.5 h-3.5" />{l}</span>
                <span className="font-heading font-bold">{fmt(v)}</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div className={`h-full ${cn} rounded-full`} style={{ width: `${kpis.total > 0 ? (v / kpis.total) * 100 : 0}%` }} />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Tabs defaultValue="agenda">
        <TabsList>
          <TabsTrigger value="agenda" className="gap-1"><Calendar className="w-4 h-4" />Agenda</TabsTrigger>
          <TabsTrigger value="matriz" className="gap-1"><Boxes className="w-4 h-4" />Matriz anual</TabsTrigger>
          <TabsTrigger value="catalogo" className="gap-1"><Wallet className="w-4 h-4" />Catálogo</TabsTrigger>
          <TabsTrigger value="historico" className="gap-1"><Receipt className="w-4 h-4" />Histórico</TabsTrigger>
          <TabsTrigger value="conciliar" className="gap-1 relative">
            <Link2 className="w-4 h-4" />Conciliar MP
            {gastos.filter(g => g.estado_conciliacion === "pendiente_conciliar").length > 0 && (
              <Badge variant="destructive" className="ml-1 h-5 px-1.5 text-[10px]">
                {gastos.filter(g => g.estado_conciliacion === "pendiente_conciliar").length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* AGENDA */}
        <TabsContent value="agenda" className="mt-4 space-y-4">
          {(() => {
            const deudasList = recurrentes
              .filter(r => deudaSaldos[r.id] && deudaSaldos[r.id].saldo > 0)
              .sort((a, b) => (deudaSaldos[b.id]?.saldo || 0) - (deudaSaldos[a.id]?.saldo || 0));
            if (deudasList.length === 0) return null;
            const totalesPorMoneda: Record<string, number> = {};
            deudasList.forEach(r => {
              const d = deudaSaldos[r.id];
              totalesPorMoneda[d.moneda] = (totalesPorMoneda[d.moneda] || 0) + d.saldo;
            });
            return (
              <Card className="border-destructive/40 bg-destructive/5">
                <button
                  type="button"
                  onClick={() => setDeudaExpanded(v => !v)}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-destructive/10 transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-wrap">
                    <CreditCard className="w-4 h-4 text-destructive shrink-0" />
                    <span className="text-xs font-heading font-bold uppercase tracking-wider text-destructive">
                      Con deuda acumulada
                    </span>
                    <Badge variant="outline" className="text-[10px] border-destructive/40 text-destructive">
                      {deudasList.length}
                    </Badge>
                    <span className="text-xs text-muted-foreground">·</span>
                    {Object.entries(totalesPorMoneda).map(([moneda, total], i) => (
                      <span key={moneda} className="text-xs font-heading font-bold text-destructive">
                        {i > 0 && <span className="text-muted-foreground mx-1">+</span>}
                        {fmt(total, moneda)}
                      </span>
                    ))}
                  </div>
                  {deudaExpanded
                    ? <ChevronUp className="w-4 h-4 text-destructive shrink-0" />
                    : <ChevronDown className="w-4 h-4 text-destructive shrink-0" />}
                </button>
                {deudaExpanded && (
                  <CardContent className="p-0 border-t border-destructive/20">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Concepto</TableHead>
                          <TableHead>Categoría</TableHead>
                          <TableHead>Ámbito</TableHead>
                          <TableHead className="text-right">Saldo deuda</TableHead>
                          <TableHead className="w-32">Acción</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {deudasList.map(r => (
                          <TableRow key={r.id}>
                            <TableCell className="font-medium">{r.concepto}</TableCell>
                            <TableCell><Badge variant="outline" className="text-xs">{r.categoria}</Badge></TableCell>
                            <TableCell>{ambitoBadge(r.ambito)}</TableCell>
                            <TableCell className="text-right font-heading font-bold text-destructive">
                              {fmt(deudaSaldos[r.id].saldo, deudaSaldos[r.id].moneda)}
                            </TableCell>
                            <TableCell>
                              <Button size="sm" variant="outline" className="h-7 text-xs gap-1 border-destructive/40 text-destructive hover:bg-destructive/10" onClick={() => openDeuda(r)}>
                                <TrendingDown className="w-3 h-3" /> Gestionar
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                )}
              </Card>
            );
          })()}
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between gap-3 flex-wrap">
              <CardTitle className="text-sm font-heading font-bold uppercase tracking-wider">Pendientes de pagar — {monthLabel(mes)}</CardTitle>
              <Input
                placeholder="Buscar concepto, categoría o responsable..."
                value={searchAgenda}
                onChange={(e) => setSearchAgenda(e.target.value)}
                className="h-8 w-full sm:w-72 text-xs"
              />
            </CardHeader>
            <CardContent className="p-0">
              {(() => {
                const q = searchAgenda.trim().toLowerCase();
                const filtered = q
                  ? agenda.filter(({ rec }) =>
                      [rec.concepto, rec.categoria, rec.responsable, rec.proveedor]
                        .filter(Boolean).join(" ").toLowerCase().includes(q))
                  : agenda;
                return filtered.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground text-sm">
                  {q ? "Sin resultados para tu búsqueda." : <>No hay pagos pendientes este mes. {ejecuciones.length === 0 && "Generá el mes para crear las cuotas."}</>}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Estado</TableHead>
                        <TableHead>Concepto</TableHead>
                        <TableHead>Ámbito</TableHead>
                        <TableHead>Categoría</TableHead>
                        <TableHead>Vence</TableHead>
                        <TableHead>Resp.</TableHead>
                        <TableHead className="text-right">Monto</TableHead>
                        <TableHead className="w-32">Acción</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map(({ e, rec }) => {
                        const d = daysTo(e.fecha_vencimiento);
                        return (
                          <TableRow key={e.id} className={e.estado === "vencido" ? "bg-destructive/5" : ""}>
                            <TableCell>{estadoBadge(e.estado, d)}</TableCell>
                            <TableCell className="font-medium">{rec.concepto}</TableCell>
                            <TableCell>{ambitoBadge(rec.ambito)}</TableCell>
                            <TableCell><Badge variant="outline" className="text-xs">{rec.categoria}</Badge></TableCell>
                            <TableCell className="text-xs">
                              {e.fecha_vencimiento ? parseDate(e.fecha_vencimiento)!.toLocaleDateString("es-AR") : "—"}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">{rec.responsable || "—"}</TableCell>
                            <TableCell className="text-right font-heading font-bold">
                              {e.estado === "parcial" && e.monto_pagado ? (
                                <div className="flex flex-col items-end leading-tight">
                                  <span className="text-yellow-500 text-xs">{fmt(e.monto_pagado, e.moneda)} pagado</span>
                                  <span>Resta {fmt((e.monto_previsto || 0) - (e.monto_pagado || 0), e.moneda)}</span>
                                </div>
                              ) : fmt(e.monto_previsto, e.moneda)}
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                <Button size="sm" variant="gold" className="h-7 text-xs" onClick={() => openPagar(e, rec)}>Pagar</Button>
                                <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" onClick={() => omitirEjec(e.id)} title="Marcar omitido">
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              );
              })()}
            </CardContent>
          </Card>
        </TabsContent>

        {/* MATRIZ */}
        <TabsContent value="matriz" className="mt-4">
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between gap-3 flex-wrap">
              <CardTitle className="text-sm font-heading font-bold uppercase tracking-wider">Matriz anual</CardTitle>
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Buscar concepto o categoría..."
                  value={searchMatriz}
                  onChange={(e) => setSearchMatriz(e.target.value)}
                  className="h-8 w-full sm:w-64 text-xs"
                />
                <Select value={String(matrizYear)} onValueChange={(v) => setMatrizYear(Number(v))}>
                  <SelectTrigger className="w-28 h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[2024, 2025, 2026, 2027].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="sticky left-0 bg-card min-w-[200px]">Concepto</TableHead>
                      {["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"].map((m, i) => (
                        <TableHead key={i} className="text-center text-xs">{m}</TableHead>
                      ))}
                      <TableHead className="text-right text-xs font-heading uppercase tracking-wider bg-muted/40 sticky right-0">Total año</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(() => {
                      const q = searchMatriz.trim().toLowerCase();
                      const matrizFiltered = q
                        ? recByCategoriaOrdenado
                            .map(([cat, items]) => [cat, items.filter(r =>
                              [r.concepto, r.categoria, r.proveedor, r.responsable]
                                .filter(Boolean).join(" ").toLowerCase().includes(q)
                            )] as [string, typeof items])
                            .filter(([, items]) => items.length > 0)
                        : recByCategoriaOrdenado;
                      return matrizFiltered.map(([cat, items]) => (
                      <>
                        <TableRow key={`h-${cat}`} className="bg-muted/40">
                          <TableCell colSpan={14} className="font-heading font-bold uppercase text-xs tracking-wider">{cat}</TableCell>
                        </TableRow>
                        {items.map(r => {
                          const deuda = deudaSaldos[r.id];
                          const hasDeuda = !!deuda && deuda.saldo > 0;
                          let totalAnual = 0;
                          let monedaRow = r.moneda;
                          for (let mm = 1; mm <= 12; mm++) {
                            const ej = matrizData[r.id]?.[mm];
                            if (ej) {
                              totalAnual += Number(ej.monto_pagado || ej.monto_previsto || 0);
                              if (ej.moneda) monedaRow = ej.moneda;
                            }
                          }
                          return (
                          <TableRow key={r.id} className={hasDeuda ? "border-l-2 border-l-destructive" : ""}>
                            <TableCell className="sticky left-0 bg-card text-sm font-medium">
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-2">
                                  {ambitoBadge(r.ambito)}
                                  <span>{r.concepto}</span>
                                </div>
                                {hasDeuda && (
                                  <button
                                    onClick={() => openDeuda(r)}
                                    className="inline-flex items-center gap-1 text-[11px] text-destructive hover:underline self-start"
                                    title="Ver y gestionar deuda"
                                  >
                                    <CreditCard className="w-3 h-3" />
                                    Debe {fmt(deuda.saldo, deuda.moneda)}
                                  </button>
                                )}
                              </div>
                            </TableCell>
                            {Array.from({ length: 12 }, (_, i) => i + 1).map(mm => {
                              const ej = matrizData[r.id]?.[mm];
                              const monto = ej?.monto_pagado || ej?.monto_previsto || 0;
                              let cls = "text-muted-foreground/40";
                              if (ej?.estado === "pagado") cls = "text-green-500 bg-green-500/5";
                              else if (ej?.estado === "vencido") cls = "text-destructive bg-destructive/5 font-bold";
                              else if (ej?.estado === "parcial") cls = "text-yellow-500 bg-yellow-500/5";
                              else if (ej?.estado === "pendiente") cls = "text-orange-500";
                              const clickable = !!ej && ej.estado !== "omitido";
                              return (
                                <TableCell
                                  key={mm}
                                  className={`text-center text-xs ${cls} ${clickable ? "cursor-pointer hover:bg-primary/10" : ""}`}
                                  onClick={() => { if (clickable && ej) openPagar(ej, r); }}
                                  title={clickable ? "Marcar pago" : undefined}
                                >
                                  {monto > 0 ? Math.round(monto / 1000) + "k" : "—"}
                                </TableCell>
                              );
                            })}
                            <TableCell className="text-right text-xs font-heading font-bold bg-muted/30 sticky right-0">
                              {totalAnual > 0 ? fmt(totalAnual, monedaRow) : "—"}
                            </TableCell>
                          </TableRow>
                        );})}
                      </>
                    ));
                    })()}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* CATALOGO */}
        <TabsContent value="catalogo" className="mt-4">
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between gap-3 flex-wrap">
              <CardTitle className="text-sm font-heading font-bold uppercase tracking-wider">Catálogo de gastos recurrentes</CardTitle>
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Buscar concepto, categoría o proveedor..."
                  value={searchCatalogo}
                  onChange={(e) => setSearchCatalogo(e.target.value)}
                  className="h-8 w-full sm:w-72 text-xs"
                />
                <Button size="sm" variant="gold" className="gap-1" onClick={() => { setEditingRec(null); setRecForm(f => ({ ...f, concepto: "", categoria: "Otros", ambito: "emprendimiento", responsable: "Tay", monto_estimado: "", moneda: "ARS", frecuencia: catalogoTipoTab === "variable" ? "variable" : "mensual", dia_vencimiento: "10", forma_pago_default: "transferencia", proveedor: "", notas: "", activo: true, tipo: catalogoTipoTab })); setCatDialogOpen(true); }}>
                  <Plus className="w-4 h-4" /> Nuevo
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Tabs value={catalogoTipoTab} onValueChange={(v) => setCatalogoTipoTab(v as TipoGasto)}>
                <div className="px-4 pt-2">
                  <TabsList>
                    <TabsTrigger value="fijo">
                      Fijos ({recurrentes.filter(r => (r.tipo || "fijo") === "fijo").length})
                    </TabsTrigger>
                    <TabsTrigger value="variable">
                      Variables ({recurrentes.filter(r => r.tipo === "variable").length})
                    </TabsTrigger>
                  </TabsList>
                </div>
                <TabsContent value={catalogoTipoTab} className="mt-2">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Concepto</TableHead>
                        <TableHead>Categoría</TableHead>
                        <TableHead>Ámbito</TableHead>
                        <TableHead>Frec.</TableHead>
                        <TableHead>Vence día</TableHead>
                        <TableHead>Resp.</TableHead>
                        <TableHead className="text-right">Estimado</TableHead>
                        <TableHead>Activo</TableHead>
                        <TableHead className="w-20">Acción</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recurrentes
                        .filter(r => (r.tipo || "fijo") === catalogoTipoTab)
                        .filter(r => {
                          const q = searchCatalogo.trim().toLowerCase();
                          if (!q) return true;
                          return [r.concepto, r.categoria, r.proveedor, r.responsable]
                            .filter(Boolean).join(" ").toLowerCase().includes(q);
                        })
                        .map(r => (
                        <TableRow key={r.id} className={!r.activo ? "opacity-50" : ""}>
                          <TableCell className="font-medium text-sm">{r.concepto}</TableCell>
                          <TableCell><Badge variant="outline" className="text-xs">{r.categoria}</Badge></TableCell>
                          <TableCell>{ambitoBadge(r.ambito)}</TableCell>
                          <TableCell className="text-xs">{r.frecuencia}</TableCell>
                          <TableCell className="text-xs">{r.dia_vencimiento || "—"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{r.responsable || "—"}</TableCell>
                          <TableCell className="text-right text-sm">{fmt(r.monto_estimado, r.moneda)}</TableCell>
                          <TableCell>{r.activo ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : "—"}</TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEditRec(r)}><Edit2 className="w-3 h-3" /></Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => deleteRec(r.id)}><Trash2 className="w-3 h-3" /></Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </TabsContent>

        {/* HISTORICO */}
        <TabsContent value="historico" className="mt-4">
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between gap-3 flex-wrap">
              <CardTitle className="text-sm font-heading font-bold uppercase tracking-wider">Histórico contable</CardTitle>
              <Input
                placeholder="Buscar descripción, categoría o forma de pago..."
                value={searchHistorico}
                onChange={(e) => setSearchHistorico(e.target.value)}
                className="h-8 w-full sm:w-80 text-xs"
              />
            </CardHeader>
            <CardContent className="p-0">
              {(() => {
                const q = searchHistorico.trim().toLowerCase();
                const filteredG = q
                  ? gastos.filter(g => [g.descripcion, g.categoria, g.subcategoria, g.proveedor, FORMA_PAGO_LABELS[g.forma_pago] || g.forma_pago, g.notas]
                      .filter(Boolean).join(" ").toLowerCase().includes(q))
                  : gastos;
                return filteredG.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground text-sm">{q ? "Sin resultados." : "Sin movimientos"}</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Categoría</TableHead>
                      <TableHead>Descripción</TableHead>
                      <TableHead>Forma de pago</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                      <TableHead className="w-20">Acción</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(q ? filteredG : filteredG.slice(0, 30)).map(g => (
                      <TableRow key={g.id}>
                        <TableCell className="text-xs">{parseDate(g.fecha)!.toLocaleDateString("es-AR")}</TableCell>
                        <TableCell><Badge variant="outline" className="text-xs">{g.categoria}</Badge></TableCell>
                        <TableCell className="text-sm max-w-[300px] truncate">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate">{g.descripcion}</span>
                            {g.mp_payment_id && (
                              <Badge variant="secondary" className="text-[10px] h-5 px-1.5 shrink-0" title={`MP ${g.mp_payment_id} · ${g.mp_status ?? ""}`}>
                                MP
                              </Badge>
                            )}
                            {g.estado_conciliacion === "pendiente_conciliar" && (
                              <Badge variant="destructive" className="text-[10px] h-5 px-1.5 shrink-0" title="Pendiente de conciliar">
                                ⚠
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs">{FORMA_PAGO_LABELS[g.forma_pago] || g.forma_pago}</TableCell>
                        <TableCell className="text-right font-heading font-bold">{fmt(g.monto, g.moneda)}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openHistoricoEdit(g)} title="Editar"><Edit2 className="w-3 h-3" /></Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => deleteHistorico(g)} title="Eliminar"><Trash2 className="w-3 h-3" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              );
              })()}
            </CardContent>
          </Card>
        </TabsContent>

        {/* CONCILIAR MP */}
        <TabsContent value="conciliar" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-heading font-bold uppercase tracking-wider flex items-center gap-2">
                <Link2 className="w-4 h-4" />Pagos de Mercado Pago pendientes de conciliar
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Movimientos creados automáticamente desde el webhook de MP que no pudieron vincularse a un gasto existente. Revisalos, ajustá la categoría/descripción si hace falta y confirmá la conciliación, o eliminá si es duplicado.
              </p>
            </CardHeader>
            <CardContent className="p-0">
              {(() => {
                const pendientes = gastos.filter(g => g.estado_conciliacion === "pendiente_conciliar");
                if (pendientes.length === 0) {
                  return <div className="py-12 text-center text-muted-foreground text-sm">✓ No hay pagos MP pendientes de conciliar</div>;
                }
                return (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Fecha</TableHead>
                        <TableHead>Descripción</TableHead>
                        <TableHead>Proveedor / Pagador</TableHead>
                        <TableHead>MP ID</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Monto</TableHead>
                        <TableHead className="w-32">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pendientes.map(g => (
                        <TableRow key={g.id}>
                          <TableCell className="text-xs">{parseDate(g.fecha)!.toLocaleDateString("es-AR")}</TableCell>
                          <TableCell className="text-sm max-w-[260px] truncate">{g.descripcion}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{g.proveedor || "—"}</TableCell>
                          <TableCell className="text-[10px] font-mono">{g.mp_payment_id}</TableCell>
                          <TableCell><Badge variant="outline" className="text-[10px]">{g.mp_status}</Badge></TableCell>
                          <TableCell className="text-right font-heading font-bold">{fmt(g.monto, g.moneda)}</TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openHistoricoEdit(g)} title="Editar"><Edit2 className="w-3 h-3" /></Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-green-600" onClick={() => confirmarConciliacion(g)} title="Confirmar conciliación"><CheckCircle2 className="w-3 h-3" /></Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => deleteHistorico(g)} title="Eliminar"><Trash2 className="w-3 h-3" /></Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                );
              })()}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* DIALOG: Catálogo */}
      <Dialog open={catDialogOpen} onOpenChange={(o) => { setCatDialogOpen(o); if (!o) { setEditingRec(null); resetRecForm(); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingRec ? "Editar concepto" : "Nuevo concepto recurrente"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Concepto</Label>
              <Input value={recForm.concepto} onChange={(e) => setRecForm(f => ({ ...f, concepto: e.target.value }))} placeholder="Ej: Alquiler Oficina" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Tipo de gasto (pestaña)</Label>
              <Select value={recForm.tipo} onValueChange={(v) => setRecForm(f => ({ ...f, tipo: v as TipoGasto }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="fijo">Fijo (importe y frecuencia conocidos)</SelectItem>
                  <SelectItem value="variable">Variable (monto/frecuencia cambian)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Categoría</Label>
                <Select value={recForm.categoria} onValueChange={(v) => setRecForm(f => ({ ...f, categoria: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CATEGORIAS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Ámbito</Label>
                <Select value={recForm.ambito} onValueChange={(v) => setRecForm(f => ({ ...f, ambito: v as Ambito }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="emprendimiento">Emprendimiento</SelectItem>
                    <SelectItem value="personal">Personal</SelectItem>
                    <SelectItem value="mixto">Mixto</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Moneda</Label>
                <Select value={recForm.moneda} onValueChange={(v) => setRecForm(f => ({ ...f, moneda: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ARS">$ ARS</SelectItem>
                    <SelectItem value="USD">US$ USD</SelectItem>
                    <SelectItem value="EUR">€ EUR</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Monto estimado</Label>
                <Input type="number" value={recForm.monto_estimado} onChange={(e) => setRecForm(f => ({ ...f, monto_estimado: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Día venc.</Label>
                <Input type="number" min={1} max={31} value={recForm.dia_vencimiento} onChange={(e) => setRecForm(f => ({ ...f, dia_vencimiento: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Frecuencia</Label>
                <Select value={recForm.frecuencia} onValueChange={(v) => setRecForm(f => ({ ...f, frecuencia: v as Frecuencia }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mensual">Mensual</SelectItem>
                    <SelectItem value="bimestral">Bimestral</SelectItem>
                    <SelectItem value="trimestral">Trimestral</SelectItem>
                    <SelectItem value="semestral">Semestral</SelectItem>
                    <SelectItem value="anual">Anual</SelectItem>
                    <SelectItem value="variable">Variable</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Responsable</Label>
                <Select value={recForm.responsable} onValueChange={(v) => setRecForm(f => ({ ...f, responsable: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Tay">Tay</SelectItem>
                    <SelectItem value="Clau">Clau</SelectItem>
                    <SelectItem value="Ambos">Ambos</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Forma de pago habitual</Label>
              <Select value={recForm.forma_pago_default} onValueChange={(v) => setRecForm(f => ({ ...f, forma_pago_default: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{FORMA_PAGO_OPTS.map(o => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Proveedor (opcional)</Label>
              <Input value={recForm.proveedor} onChange={(e) => setRecForm(f => ({ ...f, proveedor: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Notas</Label>
              <Textarea rows={2} value={recForm.notas} onChange={(e) => setRecForm(f => ({ ...f, notas: e.target.value }))} />
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={recForm.activo} onCheckedChange={(v) => setRecForm(f => ({ ...f, activo: v }))} />
              <Label className="text-xs">Activo (genera ejecuciones cada mes)</Label>
            </div>
            <Button onClick={saveRec} className="w-full" variant="gold">{editingRec ? "Guardar" : "Crear concepto"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* DIALOG: Pagar */}
      <Dialog open={pagoDialogOpen} onOpenChange={(o) => { setPagoDialogOpen(o); if (!o) { setEditingPagoId(null); setPagos([]); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingPagoId ? "Editar pago" : "Registrar pago"}</DialogTitle></DialogHeader>
          {payingEjec && (() => {
            const totalPagado = pagos.reduce((s, p) => s + Number(p.monto || 0), 0);
            const previstoOriginal = payingEjec.ejec.monto_previsto || 0;
            const previsto = prevPeriodInfo?.total ?? previstoOriginal;
            const restante = Math.max(previsto - totalPagado, 0);
            return (
              <div className="space-y-3">
                <div className="p-3 rounded-md bg-muted/40 space-y-1">
                  <div className="font-heading font-bold">{payingEjec.rec.concepto}</div>
                  <div className="text-xs text-muted-foreground">
                    {payingEjec.rec.categoria} · {monthLabel(payingEjec.ejec.mes)} · vence {payingEjec.ejec.fecha_vencimiento ? parseDate(payingEjec.ejec.fecha_vencimiento)!.toLocaleDateString("es-AR") : "—"}
                  </div>
                  <div className="flex gap-3 text-xs pt-1 flex-wrap">
                    <span>Previsto: <b>{fmt(previsto, payingEjec.ejec.moneda)}</b></span>
                    <span className="text-green-500">Pagado: <b>{fmt(totalPagado, payingEjec.ejec.moneda)}</b></span>
                    <span className={restante > 0 ? "text-orange-500" : "text-muted-foreground"}>Resta: <b>{fmt(restante, payingEjec.ejec.moneda)}</b></span>
                  </div>
                  {prevPeriodInfo ? (
                    <div className="text-[11px] text-muted-foreground italic pt-0.5">
                      Basado en lo pagado en {monthLabel(prevPeriodInfo.mes)} ({fmt(prevPeriodInfo.total, payingEjec.ejec.moneda)}). Estimado original: {fmt(previstoOriginal, payingEjec.ejec.moneda)}.
                    </div>
                  ) : (
                    <div className="text-[11px] text-muted-foreground italic pt-0.5">
                      Sin pagos previos: se usa el monto estimado del concepto.
                    </div>
                  )}
                </div>

                {pagos.length > 0 && (
                  <div className="border rounded-md divide-y">
                    <div className="px-3 py-2 text-xs font-heading font-bold uppercase tracking-wider text-muted-foreground bg-muted/30">Pagos registrados</div>
                    {pagos.map(p => (
                      <div key={p.id} className={`p-2.5 flex items-center justify-between gap-2 text-sm ${editingPagoId === p.id ? "bg-primary/5" : ""}`}>
                        <div className="min-w-0 flex-1">
                          <div className="font-medium">{fmt(p.monto, payingEjec.ejec.moneda)} <span className="text-xs text-muted-foreground font-normal">· {FORMA_PAGO_LABELS[p.forma_pago] || p.forma_pago}</span></div>
                          <div className="text-xs text-muted-foreground">{parseDate(p.fecha)!.toLocaleDateString("es-AR")}{p.notas ? ` · ${p.notas}` : ""}</div>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEditPago(p)} title="Editar"><Edit2 className="w-3 h-3" /></Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => deletePago(p.id)} title="Eliminar"><Trash2 className="w-3 h-3" /></Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="border rounded-md p-3 space-y-3">
                  <div className="text-xs font-heading font-bold uppercase tracking-wider text-muted-foreground">
                    {editingPagoId ? "Editando pago" : (pagos.length > 0 ? "Agregar otro pago" : "Nuevo pago")}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Monto</Label>
                      <Input type="number" value={pagoForm.monto} onChange={(e) => setPagoForm(f => ({ ...f, monto: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Fecha</Label>
                      <Input type="date" value={pagoForm.fecha} onChange={(e) => setPagoForm(f => ({ ...f, fecha: e.target.value }))} />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Forma de pago</Label>
                    <Select value={pagoForm.forma_pago} onValueChange={(v) => setPagoForm(f => ({ ...f, forma_pago: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{FORMA_PAGO_OPTS.map(o => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Notas (opcional)</Label>
                    <Textarea rows={2} value={pagoForm.notas} onChange={(e) => setPagoForm(f => ({ ...f, notas: e.target.value }))} />
                  </div>
                  <div className="flex gap-2">
                    {editingPagoId && <Button variant="outline" className="flex-1" onClick={cancelEditPago}>Cancelar</Button>}
                    <Button onClick={confirmarPago} variant="gold" className="flex-1">
                      {editingPagoId ? "Guardar cambios" : "Confirmar pago"}
                    </Button>
                  </div>
                </div>

                <Button variant="ghost" className="w-full" onClick={() => setPagoDialogOpen(false)}>Cerrar</Button>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* DIALOG: Deuda */}
      <Dialog open={deudaDialogOpen} onOpenChange={(o) => { setDeudaDialogOpen(o); if (!o) { setDeudaRec(null); setEditingDeudaMovId(null); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-destructive" />
              Deuda — {deudaRec?.concepto}
            </DialogTitle>
          </DialogHeader>
          {deudaRec && (
            <div className="space-y-3">
              {/* Resumen */}
              {deudaDetalle && (
                <div className="p-3 rounded-md bg-muted/40 space-y-1.5">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Saldo actual</span>
                    <span className={`font-heading font-bold text-lg ${deudaDetalle.saldo > 0 ? "text-destructive" : "text-green-500"}`}>
                      {fmt(deudaDetalle.saldo, deudaDetalle.moneda)}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-1 text-[11px] text-muted-foreground pt-1 border-t border-border/50">
                    <div>Auto (cuotas vencidas): <b className="text-foreground">{fmt(deudaDetalle.automatica, deudaDetalle.moneda)}</b></div>
                    <div>+ Cargos manuales: <b className="text-foreground">{fmt(deudaDetalle.cargos, deudaDetalle.moneda)}</b></div>
                    <div>± Ajustes: <b className="text-foreground">{fmt(deudaDetalle.ajustes, deudaDetalle.moneda)}</b></div>
                    <div>− Pagos a deuda: <b className="text-green-500">{fmt(deudaDetalle.pagos, deudaDetalle.moneda)}</b></div>
                  </div>
                </div>
              )}

              {/* Historial movimientos manuales */}
              {deudaMovs.length > 0 && (
                <div className="border rounded-md divide-y">
                  <div className="px-3 py-2 text-xs font-heading font-bold uppercase tracking-wider text-muted-foreground bg-muted/30">
                    Movimientos manuales
                  </div>
                  {deudaMovs.map(m => {
                    const tipoLabel = m.tipo === "pago" ? "Pago" : m.tipo === "cargo" ? "Cargo" : "Ajuste";
                    const color = m.tipo === "pago" ? "text-green-500" : m.tipo === "cargo" ? "text-destructive" : "text-yellow-500";
                    return (
                      <div key={m.id} className={`p-2.5 flex items-center justify-between gap-2 text-sm ${editingDeudaMovId === m.id ? "bg-primary/5" : ""}`}>
                        <div className="min-w-0 flex-1">
                          <div className="font-medium flex items-center gap-2">
                            <Badge variant="outline" className={`text-[10px] ${color}`}>{tipoLabel}</Badge>
                            <span className={color}>{m.tipo === "pago" ? "−" : "+"}{fmt(m.monto, deudaDetalle?.moneda || "ARS")}</span>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {parseDate(m.fecha)!.toLocaleDateString("es-AR")}
                            {m.forma_pago ? ` · ${FORMA_PAGO_LABELS[m.forma_pago] || m.forma_pago}` : ""}
                            {m.concepto ? ` · ${m.concepto}` : ""}
                            {m.notas ? ` · ${m.notas}` : ""}
                          </div>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEditDeudaMov(m)} title="Editar"><Edit2 className="w-3 h-3" /></Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => deleteDeudaMov(m.id)} title="Eliminar"><Trash2 className="w-3 h-3" /></Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Formulario */}
              <div className="border rounded-md p-3 space-y-3">
                <div className="text-xs font-heading font-bold uppercase tracking-wider text-muted-foreground">
                  {editingDeudaMovId ? "Editando movimiento" : "Nuevo movimiento"}
                </div>
                {!editingDeudaMovId && (
                  <div className="space-y-1">
                    <Label className="text-xs">Tipo</Label>
                    <Select value={deudaForm.tipo} onValueChange={(v) => setDeudaForm(f => ({ ...f, tipo: v as any }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pago">Pago a deuda (resta saldo, genera asiento)</SelectItem>
                        <SelectItem value="cargo">Cargo (suma deuda: intereses, deuda inicial)</SelectItem>
                        <SelectItem value="ajuste">Ajuste (corregir diferencia con el banco)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Monto</Label>
                    <Input type="number" value={deudaForm.monto} onChange={(e) => setDeudaForm(f => ({ ...f, monto: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Fecha</Label>
                    <Input type="date" value={deudaForm.fecha} onChange={(e) => setDeudaForm(f => ({ ...f, fecha: e.target.value }))} className="text-foreground [color-scheme:dark]" />
                  </div>
                </div>
                {deudaForm.tipo === "pago" && (
                  <div className="space-y-1">
                    <Label className="text-xs">Forma de pago</Label>
                    <Select value={deudaForm.forma_pago} onValueChange={(v) => setDeudaForm(f => ({ ...f, forma_pago: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{FORMA_PAGO_OPTS.map(o => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                )}
                {deudaForm.tipo !== "pago" && (
                  <div className="space-y-1">
                    <Label className="text-xs">Concepto (opcional)</Label>
                    <Input value={deudaForm.concepto} onChange={(e) => setDeudaForm(f => ({ ...f, concepto: e.target.value }))} placeholder="Ej: Intereses mes 10" />
                  </div>
                )}
                <div className="space-y-1">
                  <Label className="text-xs">Notas (opcional)</Label>
                  <Textarea rows={2} value={deudaForm.notas} onChange={(e) => setDeudaForm(f => ({ ...f, notas: e.target.value }))} />
                </div>
                <div className="flex gap-2">
                  {editingDeudaMovId && <Button variant="outline" className="flex-1" onClick={cancelEditDeudaMov}>Cancelar</Button>}
                  <Button onClick={confirmarDeudaMov} variant="gold" className="flex-1">
                    {editingDeudaMovId ? "Guardar cambios" : "Confirmar"}
                  </Button>
                </div>
              </div>

              <Button variant="ghost" className="w-full" onClick={() => setDeudaDialogOpen(false)}>Cerrar</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SuperAdminGastos;
