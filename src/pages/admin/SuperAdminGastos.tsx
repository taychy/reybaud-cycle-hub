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
  CheckCircle2, Clock, RefreshCw, Building2, Home, Boxes,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";

type Ambito = "personal" | "emprendimiento" | "mixto";
type Frecuencia = "mensual" | "bimestral" | "trimestral" | "semestral" | "anual" | "variable";
type EstadoEjec = "pendiente" | "pagado" | "vencido" | "omitido" | "parcial";

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

  // Catálogo dialog
  const [catDialogOpen, setCatDialogOpen] = useState(false);
  const [editingRec, setEditingRec] = useState<Recurrente | null>(null);
  const [recForm, setRecForm] = useState({
    concepto: "", categoria: "Otros", ambito: "emprendimiento" as Ambito,
    responsable: "Tay", monto_estimado: "", moneda: "ARS",
    frecuencia: "mensual" as Frecuencia, dia_vencimiento: "10",
    forma_pago_default: "transferencia", proveedor: "", notas: "", activo: true,
  });

  // Pago dialog
  const [pagoDialogOpen, setPagoDialogOpen] = useState(false);
  const [payingEjec, setPayingEjec] = useState<{ ejec: Ejecucion; rec: Recurrente } | null>(null);
  const [pagos, setPagos] = useState<Array<{ id: string; monto: number; fecha: string; forma_pago: string; notas: string | null }>>([]);
  const [editingPagoId, setEditingPagoId] = useState<string | null>(null);
  const [pagoForm, setPagoForm] = useState({
    monto: "", fecha: new Date().toISOString().split("T")[0],
    forma_pago: "transferencia", notas: "",
  });


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
    setLoading(false);
  }, [mes]);

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
    const restante = Math.max((e.monto_previsto || rec.monto_estimado) - totalPagado, 0);
    setPagoForm({
      monto: String(restante || e.monto_previsto || rec.monto_estimado),
      fecha: new Date().toISOString().split("T")[0],
      forma_pago: rec.forma_pago_default || "transferencia",
      notas: "",
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
      const { error } = await supabase.rpc("register_gasto_pago" as any, {
        p_ejec_id: payingEjec.ejec.id, p_monto: monto, p_fecha: pagoForm.fecha,
        p_forma_pago: pagoForm.forma_pago, p_notas: pagoForm.notas || null,
      });
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Pago registrado", description: payingEjec.rec.concepto });
    }

    await loadPagosEjec(payingEjec.ejec.id);
    setEditingPagoId(null);
    setPagoForm(f => ({ ...f, monto: "", notas: "" }));
    loadData();
  };

  const startEditPago = (p: { id: string; monto: number; fecha: string; forma_pago: string; notas: string | null }) => {
    setEditingPagoId(p.id);
    setPagoForm({ monto: String(p.monto), fecha: p.fecha, forma_pago: p.forma_pago, notas: p.notas || "" });
  };

  const cancelEditPago = () => {
    setEditingPagoId(null);
    setPagoForm(f => ({ ...f, monto: "", notas: "" }));
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

  // -------- Catálogo ----------
  const resetRecForm = () => setRecForm({
    concepto: "", categoria: "Otros", ambito: "emprendimiento",
    responsable: "Tay", monto_estimado: "", moneda: "ARS",
    frecuencia: "mensual", dia_vencimiento: "10",
    forma_pago_default: "transferencia", proveedor: "", notas: "", activo: true,
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
              <li>Elegí el mes arriba a la derecha. Si está vacío se generan automáticamente las cuotas del catálogo.</li>
              <li>En la pestaña <b>Agenda</b> tocá <b>Pagar</b> en cada concepto que pagaste y completá monto, fecha y forma de pago. Pasa a verde y queda registrado en el histórico contable.</li>
              <li>En la pestaña <b>Matriz anual</b> podés ver todo el año tipo planilla. Tocá cualquier celda pendiente para marcar el pago directo.</li>
              <li>Lo nuevo que no esté en el catálogo lo agregás desde <b>Catálogo → Nuevo</b> y reaparece automáticamente cada mes.</li>
            </ol>
          </div>
        </CardContent>
      </Card>
        <div className="flex items-center gap-2">
          <Input type="month" value={mes} onChange={(e) => setMes(e.target.value)} className="w-44" />
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
        </TabsList>

        {/* AGENDA */}
        <TabsContent value="agenda" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-heading font-bold uppercase tracking-wider">Pendientes de pagar — {monthLabel(mes)}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {agenda.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground text-sm">
                  No hay pagos pendientes este mes. {ejecuciones.length === 0 && "Generá el mes para crear las cuotas."}
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
                      {agenda.map(({ e, rec }) => {
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
                            <TableCell className="text-right font-heading font-bold">{fmt(e.monto_previsto, e.moneda)}</TableCell>
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
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* MATRIZ */}
        <TabsContent value="matriz" className="mt-4">
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-heading font-bold uppercase tracking-wider">Matriz anual</CardTitle>
              <Select value={String(matrizYear)} onValueChange={(v) => setMatrizYear(Number(v))}>
                <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[2024, 2025, 2026, 2027].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
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
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.entries(recByCategoria).map(([cat, items]) => (
                      <>
                        <TableRow key={`h-${cat}`} className="bg-muted/40">
                          <TableCell colSpan={13} className="font-heading font-bold uppercase text-xs tracking-wider">{cat}</TableCell>
                        </TableRow>
                        {items.map(r => (
                          <TableRow key={r.id}>
                            <TableCell className="sticky left-0 bg-card text-sm font-medium">
                              <div className="flex items-center gap-2">
                                {ambitoBadge(r.ambito)}
                                <span>{r.concepto}</span>
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
                          </TableRow>
                        ))}
                      </>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* CATALOGO */}
        <TabsContent value="catalogo" className="mt-4">
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-heading font-bold uppercase tracking-wider">Catálogo de gastos recurrentes</CardTitle>
              <Button size="sm" variant="gold" className="gap-1" onClick={() => { setEditingRec(null); resetRecForm(); setCatDialogOpen(true); }}>
                <Plus className="w-4 h-4" /> Nuevo
              </Button>
            </CardHeader>
            <CardContent className="p-0">
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
                  {recurrentes.map(r => (
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
            </CardContent>
          </Card>
        </TabsContent>

        {/* HISTORICO */}
        <TabsContent value="historico" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-heading font-bold uppercase tracking-wider">Histórico contable</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {gastos.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground text-sm">Sin movimientos</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Categoría</TableHead>
                      <TableHead>Descripción</TableHead>
                      <TableHead>Forma de pago</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {gastos.slice(0, 30).map(g => (
                      <TableRow key={g.id}>
                        <TableCell className="text-xs">{parseDate(g.fecha)!.toLocaleDateString("es-AR")}</TableCell>
                        <TableCell><Badge variant="outline" className="text-xs">{g.categoria}</Badge></TableCell>
                        <TableCell className="text-sm max-w-[300px] truncate">{g.descripcion}</TableCell>
                        <TableCell className="text-xs">{FORMA_PAGO_LABELS[g.forma_pago] || g.forma_pago}</TableCell>
                        <TableCell className="text-right font-heading font-bold">{fmt(g.monto, g.moneda)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
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
      <Dialog open={pagoDialogOpen} onOpenChange={setPagoDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Registrar pago</DialogTitle></DialogHeader>
          {payingEjec && (
            <div className="space-y-3">
              <div className="p-3 rounded-md bg-muted/40 space-y-1">
                <div className="font-heading font-bold">{payingEjec.rec.concepto}</div>
                <div className="text-xs text-muted-foreground">
                  {payingEjec.rec.categoria} · {monthLabel(payingEjec.ejec.mes)} · vence {payingEjec.ejec.fecha_vencimiento ? parseDate(payingEjec.ejec.fecha_vencimiento)!.toLocaleDateString("es-AR") : "—"}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Monto real</Label>
                  <Input type="number" value={pagoForm.monto} onChange={(e) => setPagoForm(f => ({ ...f, monto: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Fecha de pago</Label>
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
              <Button onClick={confirmarPago} variant="gold" className="w-full">Confirmar pago</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SuperAdminGastos;
