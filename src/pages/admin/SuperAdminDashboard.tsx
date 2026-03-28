import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  DollarSign, TrendingUp, TrendingDown, Users, BarChart3, PieChart,
  ArrowUpRight, ArrowDownRight, Minus, Plus, Receipt, Wallet,
  Target, AlertTriangle, Percent, Building2, Calendar, Trash2, Edit2,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface KPI {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
  trend?: { value: string; direction: "up" | "down" | "flat" };
  subtitle?: string;
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
  created_at: string;
}

const CATEGORIAS_GASTO = [
  "Alquiler", "Sueldos", "Seguros", "Servicios", "Marketing",
  "Equipamiento", "Mantenimiento", "Impuestos", "Comisiones", "Otros",
];

const fmt = (n: number) => `$${n.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;

const SuperAdminDashboard = () => {
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState<KPI[]>([]);
  const [planDist, setPlanDist] = useState<{ name: string; count: number; revenue: number }[]>([]);
  const [sedeDist, setSedeDist] = useState<{ name: string; count: number }[]>([]);
  const [monthlyData, setMonthlyData] = useState<{ month: string; ingresos: number; gastos: number }[]>([]);
  const [gastos, setGastos] = useState<GastoRow[]>([]);
  const [gastoDialogOpen, setGastoDialogOpen] = useState(false);
  const [editingGasto, setEditingGasto] = useState<GastoRow | null>(null);

  // Gasto form state
  const [gastoForm, setGastoForm] = useState({
    categoria: "Otros",
    subcategoria: "",
    descripcion: "",
    monto: "",
    fecha: new Date().toISOString().split("T")[0],
    recurrente: false,
    frecuencia: "",
    proveedor: "",
    notas: "",
    forma_pago: "efectivo",
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const now = new Date();
      const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastMonthStr = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, "0")}`;
      const startOfMonth = `${thisMonth}-01`;
      const startOfLastMonth = `${lastMonthStr}-01`;
      const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split("T")[0];
      const today = now.toISOString().split("T")[0];

      const [alumnosRes, subsRes, planesRes, sedesRes, gastosRes, storeOrdersRes] = await Promise.all([
        supabase.from("alumnos").select("id, estado, sede_id, created_at"),
        supabase.from("suscripciones").select("id, alumno_id, plan_id, estado, fecha_inicio, fecha_fin, mp_status, created_at"),
        supabase.from("planes").select("id, nombre, precio"),
        supabase.from("sedes").select("id, nombre"),
        supabase.from("gastos").select("*").order("fecha", { ascending: false }).limit(500),
        supabase.from("store_orders").select("id, total, status, created_at"),
      ]);

      const alumnos = alumnosRes.data || [];
      const subs = subsRes.data || [];
      const planes = planesRes.data || [];
      const sedes = sedesRes.data || [];
      const gastosData = (gastosRes.data || []) as GastoRow[];
      const orders = (storeOrdersRes.data || []).filter((o: any) => o.status !== "cancelado");
      setGastos(gastosData);

      const planesMap = new Map(planes.map(p => [p.id, p]));

      // --- KPIs ---
      const subsActivas = subs.filter(s => s.estado === "activa");
      const mrr = subsActivas.reduce((sum, s) => {
        const plan = planesMap.get(s.plan_id);
        return sum + (plan?.precio || 0);
      }, 0);

      // Last month MRR approximation
      const subsActivasLastMonth = subs.filter(s => {
        if (s.estado === "cancelada" || !s.fecha_inicio) return false;
        return s.fecha_inicio <= endOfLastMonth && (!s.fecha_fin || s.fecha_fin >= startOfLastMonth);
      });
      const mrrLastMonth = subsActivasLastMonth.reduce((sum, s) => {
        const plan = planesMap.get(s.plan_id);
        return sum + (plan?.precio || 0);
      }, 0);
      const mrrChange = mrrLastMonth > 0 ? ((mrr - mrrLastMonth) / mrrLastMonth * 100).toFixed(1) : "—";

      // Cobrado este mes
      const cobradoEsteMes = subs
        .filter(s => s.estado === "activa" && s.fecha_inicio && s.fecha_inicio >= startOfMonth)
        .reduce((sum, s) => sum + (planesMap.get(s.plan_id)?.precio || 0), 0);

      // Cobrado mes anterior
      const cobradoMesAnterior = subs
        .filter(s => {
          if (!s.fecha_inicio) return false;
          return s.fecha_inicio >= startOfLastMonth && s.fecha_inicio <= endOfLastMonth &&
            (s.estado === "activa" || s.mp_status === "conciliado");
        })
        .reduce((sum, s) => sum + (planesMap.get(s.plan_id)?.precio || 0), 0);

      // Tasa de cobro
      const subsEstesMes = subs.filter(s => s.fecha_inicio && s.fecha_inicio >= startOfMonth);
      const cobradas = subsEstesMes.filter(s => s.estado === "activa");
      const tasaCobro = subsEstesMes.length > 0
        ? Math.round((cobradas.length / subsEstesMes.length) * 100)
        : 100;

      // Ticket promedio
      const alumnosActivos = alumnos.filter(a => a.estado === "activo").length;
      const ticketPromedio = alumnosActivos > 0 ? Math.round(mrr / alumnosActivos) : 0;

      // Ingresos tienda este mes
      const storeMes = orders
        .filter((o: any) => o.created_at >= startOfMonth)
        .reduce((sum: number, o: any) => sum + (o.total || 0), 0);

      // Gastos este mes
      const gastosEsteMes = gastosData
        .filter(g => g.fecha >= startOfMonth)
        .reduce((sum, g) => sum + g.monto, 0);

      // Gastos mes anterior
      const gastosMesAnterior = gastosData
        .filter(g => g.fecha >= startOfLastMonth && g.fecha <= endOfLastMonth)
        .reduce((sum, g) => sum + g.monto, 0);

      // Churn
      const nuevosEsteMes = alumnos.filter(a => a.created_at >= startOfMonth).length;
      const inactivosEsteMes = subs.filter(s =>
        (s.estado === "cancelada" || s.estado === "vencida") &&
        s.created_at >= startOfMonth
      ).length;
      const churnRate = alumnosActivos > 0 ? ((inactivosEsteMes / alumnosActivos) * 100).toFixed(1) : "0";

      // Morosidad
      const pendientes = subs.filter(s => s.estado === "pendiente");
      const montoPendiente = pendientes.reduce((sum, s) => sum + (planesMap.get(s.plan_id)?.precio || 0), 0);

      // Rentabilidad
      const ingresosTotal = cobradoEsteMes + storeMes;
      const rentabilidad = ingresosTotal - gastosEsteMes;

      setKpis([
        {
          label: "MRR", value: fmt(mrr), icon: DollarSign, color: "text-green-500",
          trend: mrrChange !== "—"
            ? { value: `${mrrChange}%`, direction: Number(mrrChange) >= 0 ? "up" : "down" }
            : undefined,
          subtitle: "Ingreso mensual recurrente",
        },
        {
          label: "Cobrado este mes", value: fmt(cobradoEsteMes), icon: Wallet, color: "text-emerald-500",
          trend: cobradoMesAnterior > 0
            ? {
                value: `${((cobradoEsteMes - cobradoMesAnterior) / cobradoMesAnterior * 100).toFixed(0)}%`,
                direction: cobradoEsteMes >= cobradoMesAnterior ? "up" : "down",
              }
            : undefined,
          subtitle: `vs ${fmt(cobradoMesAnterior)} mes anterior`,
        },
        {
          label: "Gastos del mes", value: fmt(gastosEsteMes), icon: Receipt, color: "text-red-500",
          trend: gastosMesAnterior > 0
            ? {
                value: `${((gastosEsteMes - gastosMesAnterior) / gastosMesAnterior * 100).toFixed(0)}%`,
                direction: gastosEsteMes <= gastosMesAnterior ? "up" : "down",
              }
            : undefined,
          subtitle: `vs ${fmt(gastosMesAnterior)} mes anterior`,
        },
        {
          label: "Resultado neto", value: fmt(rentabilidad), icon: Target,
          color: rentabilidad >= 0 ? "text-green-500" : "text-destructive",
          subtitle: "Ingresos − Gastos",
        },
        {
          label: "Tasa de cobro", value: `${tasaCobro}%`, icon: Percent, color: tasaCobro >= 80 ? "text-green-500" : "text-yellow-500",
          subtitle: `${cobradas.length}/${subsEstesMes.length} suscripciones`,
        },
        {
          label: "Ticket promedio", value: fmt(ticketPromedio), icon: BarChart3, color: "text-primary",
          subtitle: `${alumnosActivos} alumnos activos`,
        },
        {
          label: "Tienda este mes", value: fmt(storeMes), icon: DollarSign, color: "text-accent",
          subtitle: `${orders.filter((o: any) => o.created_at >= startOfMonth).length} pedidos`,
        },
        {
          label: "Churn rate", value: `${churnRate}%`, icon: TrendingDown, color: Number(churnRate) > 5 ? "text-destructive" : "text-green-500",
          subtitle: `${inactivosEsteMes} bajas / ${nuevosEsteMes} altas`,
        },
        {
          label: "Morosidad", value: fmt(montoPendiente), icon: AlertTriangle, color: montoPendiente > 0 ? "text-yellow-500" : "text-green-500",
          subtitle: `${pendientes.length} pagos pendientes`,
        },
        {
          label: "Alumnos nuevos", value: nuevosEsteMes, icon: Users, color: "text-primary",
          subtitle: "Este mes",
        },
      ]);

      // --- Plan distribution ---
      const planCount: Record<string, { count: number; revenue: number }> = {};
      subsActivas.forEach(s => {
        const plan = planesMap.get(s.plan_id);
        if (!plan) return;
        if (!planCount[plan.nombre]) planCount[plan.nombre] = { count: 0, revenue: 0 };
        planCount[plan.nombre].count++;
        planCount[plan.nombre].revenue += plan.precio;
      });
      setPlanDist(
        Object.entries(planCount)
          .map(([name, d]) => ({ name, ...d }))
          .sort((a, b) => b.count - a.count)
      );

      // --- Sede distribution ---
      const sedeMap = new Map(sedes.map(s => [s.id, s.nombre]));
      const sedeCount: Record<string, number> = {};
      alumnos.filter(a => a.estado === "activo").forEach(a => {
        const name = a.sede_id ? (sedeMap.get(a.sede_id) || "Sin sede") : "Sin sede";
        sedeCount[name] = (sedeCount[name] || 0) + 1;
      });
      setSedeDist(
        Object.entries(sedeCount)
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count)
      );

      // --- Monthly trends (last 6 months) ---
      const monthly: { month: string; ingresos: number; gastos: number }[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const mStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        const mStart = `${mStr}-01`;
        const mEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split("T")[0];

        const ing = subs
          .filter(s => s.fecha_inicio && s.fecha_inicio >= mStart && s.fecha_inicio <= mEnd && (s.estado === "activa" || s.mp_status === "conciliado"))
          .reduce((sum, s) => sum + (planesMap.get(s.plan_id)?.precio || 0), 0)
          + orders.filter((o: any) => o.created_at >= mStart && o.created_at <= mEnd + "T23:59:59")
            .reduce((sum: number, o: any) => sum + (o.total || 0), 0);

        const gast = gastosData
          .filter(g => g.fecha >= mStart && g.fecha <= mEnd)
          .reduce((sum, g) => sum + g.monto, 0);

        const monthNames = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
        monthly.push({ month: monthNames[d.getMonth()], ingresos: ing, gastos: gast });
      }
      setMonthlyData(monthly);
    } catch (err) {
      console.error("Error loading super admin dashboard:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSaveGasto = async () => {
    if (!gastoForm.descripcion || !gastoForm.monto) {
      toast({ title: "Completá descripción y monto", variant: "destructive" });
      return;
    }
    const payload = {
      categoria: gastoForm.categoria,
      subcategoria: gastoForm.subcategoria || null,
      descripcion: gastoForm.descripcion,
      monto: Number(gastoForm.monto),
      fecha: gastoForm.fecha,
      recurrente: gastoForm.recurrente,
      frecuencia: gastoForm.recurrente ? gastoForm.frecuencia || null : null,
      proveedor: gastoForm.proveedor || null,
      notas: gastoForm.notas || null,
      forma_pago: gastoForm.forma_pago,
    };

    if (editingGasto) {
      const { error } = await supabase.from("gastos").update(payload as any).eq("id", editingGasto.id);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Gasto actualizado" });
    } else {
      const { error } = await supabase.from("gastos").insert(payload as any);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Gasto registrado" });
    }

    setGastoDialogOpen(false);
    setEditingGasto(null);
    resetForm();
    loadData();
  };

  const handleDeleteGasto = async (id: string) => {
    const { error } = await supabase.from("gastos").delete().eq("id", id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Gasto eliminado" });
    loadData();
  };

  const resetForm = () => {
    setGastoForm({
      categoria: "Otros", subcategoria: "", descripcion: "", monto: "",
      fecha: new Date().toISOString().split("T")[0], recurrente: false,
      frecuencia: "", proveedor: "", notas: "", forma_pago: "efectivo",
    });
  };

  const openEditGasto = (g: GastoRow) => {
    setEditingGasto(g);
    setGastoForm({
      categoria: g.categoria,
      subcategoria: g.subcategoria || "",
      descripcion: g.descripcion,
      monto: String(g.monto),
      fecha: g.fecha,
      recurrente: g.recurrente,
      frecuencia: g.frecuencia || "",
      proveedor: g.proveedor || "",
      notas: g.notas || "",
      forma_pago: (g as any).forma_pago || "efectivo",
    });
    setGastoDialogOpen(true);
  };

  if (loading) {
    return <div className="animate-pulse text-muted-foreground text-center py-12">Cargando métricas...</div>;
  }

  const maxMonthly = Math.max(...monthlyData.map(m => Math.max(m.ingresos, m.gastos)), 1);
  const maxPlanCount = Math.max(...planDist.map(p => p.count), 1);

  const TrendIcon = ({ direction }: { direction: "up" | "down" | "flat" }) => {
    if (direction === "up") return <ArrowUpRight className="w-3 h-3 text-green-500" />;
    if (direction === "down") return <ArrowDownRight className="w-3 h-3 text-destructive" />;
    return <Minus className="w-3 h-3 text-muted-foreground" />;
  };

  // Gastos by category for this month
  const startOfMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-01`;
  const gastosPorCategoria = gastos
    .filter(g => g.fecha >= startOfMonth)
    .reduce((acc, g) => {
      acc[g.categoria] = (acc[g.categoria] || 0) + g.monto;
      return acc;
    }, {} as Record<string, number>);
  const gastosCatArray = Object.entries(gastosPorCategoria)
    .map(([cat, total]) => ({ cat, total }))
    .sort((a, b) => b.total - a.total);
  const maxGastoCat = Math.max(...gastosCatArray.map(g => g.total), 1);

  const FORMA_PAGO_LABELS: Record<string, string> = {
    efectivo: "Efectivo",
    tarjeta_credito: "Tarjeta de Crédito",
    mp_personal: "MP Personal",
    mp_josi: "MP Josi",
    mp_escuela: "MP Escuela",
    mp_tienda: "MP Tienda",
    mc_personal: "MC Personal",
    banco: "Banco",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold uppercase tracking-wider">Métricas</h1>
          <p className="text-sm text-muted-foreground">Control financiero y crecimiento</p>
        </div>
      </div>

      <Tabs defaultValue="metricas" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="metricas">Métricas</TabsTrigger>
          <TabsTrigger value="gastos">Gastos</TabsTrigger>
          <TabsTrigger value="resumen">Resumen</TabsTrigger>
        </TabsList>

        {/* TAB 1: Métricas */}
        <TabsContent value="metricas" className="space-y-6">
          {/* Financial KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {kpis.map((k) => (
              <Card key={k.label} className="border-border">
                <CardContent className="p-4 space-y-1">
                  <div className="flex items-center gap-2">
                    <k.icon className={`w-4 h-4 ${k.color}`} />
                    <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider truncate">{k.label}</span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <p className="text-xl font-bold font-heading">{k.value}</p>
                    {k.trend && (
                      <span className="flex items-center gap-0.5 text-xs">
                        <TrendIcon direction={k.trend.direction} />
                        {k.trend.value}
                      </span>
                    )}
                  </div>
                  {k.subtitle && (
                    <p className="text-[10px] text-muted-foreground truncate">{k.subtitle}</p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Revenue vs Expenses trend */}
          <Card className="border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-heading font-bold uppercase tracking-wider flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-primary" />
                Ingresos vs Gastos (6 meses)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {monthlyData.map((m) => (
                <div key={m.month} className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground font-medium">{m.month}</span>
                    <span className="font-heading">
                      <span className="text-green-500">{fmt(m.ingresos)}</span>
                      {" / "}
                      <span className="text-red-400">{fmt(m.gastos)}</span>
                    </span>
                  </div>
                  <div className="flex gap-1 h-3">
                    <div
                      className="bg-green-500/80 rounded-full transition-all"
                      style={{ width: `${(m.ingresos / maxMonthly) * 100}%` }}
                    />
                    <div
                      className="bg-red-400/60 rounded-full transition-all"
                      style={{ width: `${(m.gastos / maxMonthly) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
              <div className="flex gap-4 text-[10px] text-muted-foreground pt-1">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500/80" /> Ingresos</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400/60" /> Gastos</span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 2: Gastos */}
        <TabsContent value="gastos" className="space-y-6">
          {/* Gastos por categoría */}
          <Card className="border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-heading font-bold uppercase tracking-wider flex items-center gap-2">
                <Receipt className="w-4 h-4 text-destructive" />
                Gastos del mes por categoría
              </CardTitle>
            </CardHeader>
            <CardContent>
              {gastosCatArray.length > 0 ? (
                <div className="space-y-3">
                  {gastosCatArray.map((g) => (
                    <div key={g.cat} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{g.cat}</span>
                        <span className="font-heading font-bold">{fmt(g.total)}</span>
                      </div>
                      <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-destructive/70 rounded-full" style={{ width: `${(g.total / maxGastoCat) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center text-muted-foreground text-sm">No hay gastos registrados este mes</div>
              )}
            </CardContent>
          </Card>

          {/* Expense Management Table */}
          <Card className="border-border">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-heading font-bold uppercase tracking-wider flex items-center gap-2">
                  <Wallet className="w-4 h-4 text-primary" />
                  Gestión de gastos
                </CardTitle>
                <Dialog open={gastoDialogOpen} onOpenChange={(open) => {
                  setGastoDialogOpen(open);
                  if (!open) { setEditingGasto(null); resetForm(); }
                }}>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="gold" className="gap-1">
                      <Plus className="w-4 h-4" /> Registrar gasto
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-md">
                    <DialogHeader>
                      <DialogTitle>{editingGasto ? "Editar gasto" : "Registrar gasto"}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">Categoría</Label>
                          <Select value={gastoForm.categoria} onValueChange={(v) => setGastoForm(f => ({ ...f, categoria: v }))}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {CATEGORIAS_GASTO.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Fecha</Label>
                          <Input type="date" value={gastoForm.fecha} onChange={(e) => setGastoForm(f => ({ ...f, fecha: e.target.value }))} />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Descripción</Label>
                        <Input value={gastoForm.descripcion} onChange={(e) => setGastoForm(f => ({ ...f, descripcion: e.target.value }))} placeholder="Ej: Alquiler local Palermo" />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">Monto ($)</Label>
                          <Input type="number" value={gastoForm.monto} onChange={(e) => setGastoForm(f => ({ ...f, monto: e.target.value }))} placeholder="0" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Proveedor</Label>
                          <Input value={gastoForm.proveedor} onChange={(e) => setGastoForm(f => ({ ...f, proveedor: e.target.value }))} placeholder="Opcional" />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Forma de pago</Label>
                        <Select value={gastoForm.forma_pago} onValueChange={(v) => setGastoForm(f => ({ ...f, forma_pago: v }))}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="efectivo">Efectivo</SelectItem>
                            <SelectItem value="tarjeta_credito">Tarjeta de Crédito</SelectItem>
                            <SelectItem value="mp_personal">Mercado Pago Personal</SelectItem>
                            <SelectItem value="mp_josi">Mercado Pago Josi</SelectItem>
                            <SelectItem value="mp_escuela">Mercado Pago Escuela</SelectItem>
                            <SelectItem value="mp_tienda">Mercado Pago Tienda</SelectItem>
                            <SelectItem value="mc_personal">Mercado Crédito Personal</SelectItem>
                            <SelectItem value="banco">Banco</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-center gap-3">
                        <Switch checked={gastoForm.recurrente} onCheckedChange={(v) => setGastoForm(f => ({ ...f, recurrente: v }))} />
                        <Label className="text-xs">Gasto recurrente</Label>
                        {gastoForm.recurrente && (
                          <Select value={gastoForm.frecuencia} onValueChange={(v) => setGastoForm(f => ({ ...f, frecuencia: v }))}>
                            <SelectTrigger className="w-32"><SelectValue placeholder="Frecuencia" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="mensual">Mensual</SelectItem>
                              <SelectItem value="trimestral">Trimestral</SelectItem>
                              <SelectItem value="anual">Anual</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Notas</Label>
                        <Textarea value={gastoForm.notas} onChange={(e) => setGastoForm(f => ({ ...f, notas: e.target.value }))} rows={2} placeholder="Opcional" />
                      </div>
                      <Button onClick={handleSaveGasto} className="w-full" variant="gold">
                        {editingGasto ? "Guardar cambios" : "Registrar gasto"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {gastos.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground text-sm">
                  No hay gastos registrados. Agregá tu primer gasto para empezar a ver métricas de rentabilidad.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Fecha</TableHead>
                        <TableHead>Categoría</TableHead>
                        <TableHead>Descripción</TableHead>
                        <TableHead>Forma de pago</TableHead>
                        <TableHead>Proveedor</TableHead>
                        <TableHead className="text-right">Monto</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead className="w-20">Acción</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {gastos.slice(0, 20).map((g) => (
                        <TableRow key={g.id}>
                          <TableCell className="text-xs">{new Date(g.fecha + "T12:00:00").toLocaleDateString("es-AR")}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">{g.categoria}</Badge>
                          </TableCell>
                          <TableCell className="text-sm max-w-[200px] truncate">{g.descripcion}</TableCell>
                          <TableCell className="text-xs">{FORMA_PAGO_LABELS[(g as any).forma_pago] || "Efectivo"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{g.proveedor || "—"}</TableCell>
                          <TableCell className="text-right font-heading font-bold">{fmt(g.monto)}</TableCell>
                          <TableCell>
                            {g.recurrente ? (
                              <Badge variant="secondary" className="text-[10px]">{g.frecuencia || "Recurrente"}</Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">Único</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEditGasto(g)}>
                                <Edit2 className="w-3 h-3" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleDeleteGasto(g.id)}>
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 3: Resumen */}
        <TabsContent value="resumen" className="space-y-6">
          <div className="grid lg:grid-cols-2 gap-6">
            {/* Plan distribution */}
            <Card className="border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-heading font-bold uppercase tracking-wider flex items-center gap-2">
                  <PieChart className="w-4 h-4 text-accent" />
                  Distribución por plan
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="divide-y divide-border">
                  {planDist.length > 0 ? planDist.map((p, idx) => (
                    <div key={p.name} className="py-2.5 space-y-1">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center">{idx + 1}</span>
                          <span className="text-sm font-medium truncate">{p.name}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-sm font-heading font-bold">{p.count}</span>
                          <span className="text-xs text-muted-foreground ml-1">· {fmt(p.revenue)}</span>
                        </div>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-primary to-primary/60 rounded-full" style={{ width: `${(p.count / maxPlanCount) * 100}%` }} />
                      </div>
                    </div>
                  )) : (
                    <div className="py-8 text-center text-muted-foreground text-sm">Sin datos</div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Sede distribution */}
            <Card className="border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-heading font-bold uppercase tracking-wider flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-primary" />
                  Alumnos por sede
                </CardTitle>
              </CardHeader>
              <CardContent>
                {sedeDist.length > 0 ? (
                  <div className="space-y-3">
                    {sedeDist.map((s) => (
                      <div key={s.name} className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">{s.name}</span>
                          <span className="font-heading font-bold">{s.count}</span>
                        </div>
                        <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-accent/80 rounded-full" style={{ width: `${(s.count / Math.max(...sedeDist.map(x => x.count))) * 100}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-8 text-center text-muted-foreground text-sm">Sin datos de sedes</div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default SuperAdminDashboard;
