import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DollarSign, TrendingUp, TrendingDown, Users, BarChart3,
  ArrowUpRight, ArrowDownRight, Minus, Receipt, Wallet,
  Target, AlertTriangle, Percent,
} from "lucide-react";

interface KPI {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
  trend?: { value: string; direction: "up" | "down" | "flat" };
  subtitle?: string;
}

interface PlanPerformance {
  name: string;
  inscriptos: number;
  facturacion: number;
  moneda: string;
  porcentaje: number; // share of total revenue
}

const fmt = (n: number) => `$${n.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;

const SuperAdminDashboard = () => {
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState<KPI[]>([]);
  const [monthlyData, setMonthlyData] = useState<{ month: string; ingresos: number; gastos: number }[]>([]);
  const [planPerformance, setPlanPerformance] = useState<PlanPerformance[]>([]);

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

      const [alumnosRes, subsRes, planesRes, gastosRes, storeOrdersRes] = await Promise.all([
        supabase.from("alumnos").select("id, estado, created_at"),
        supabase.from("suscripciones").select("id, alumno_id, plan_id, estado, fecha_inicio, fecha_fin, mp_status, created_at"),
        supabase.from("planes").select("id, nombre, precio"),
        supabase.from("gastos").select("id, monto, fecha").order("fecha", { ascending: false }).limit(500),
        supabase.from("store_orders").select("id, total, status, created_at"),
      ]);

      const alumnos = alumnosRes.data || [];
      const subs = subsRes.data || [];
      const planes = planesRes.data || [];
      const gastosData = gastosRes.data || [];
      const orders = (storeOrdersRes.data || []).filter((o: any) => o.status !== "cancelado");

      const planesMap = new Map(planes.map(p => [p.id, p]));

      const subsActivas = subs.filter(s => s.estado === "activa");
      const mrr = subsActivas.reduce((sum, s) => sum + (planesMap.get(s.plan_id)?.precio || 0), 0);

      const subsActivasLastMonth = subs.filter(s => {
        if (s.estado === "cancelada" || !s.fecha_inicio) return false;
        return s.fecha_inicio <= endOfLastMonth && (!s.fecha_fin || s.fecha_fin >= startOfLastMonth);
      });
      const mrrLastMonth = subsActivasLastMonth.reduce((sum, s) => sum + (planesMap.get(s.plan_id)?.precio || 0), 0);
      const mrrChange = mrrLastMonth > 0 ? ((mrr - mrrLastMonth) / mrrLastMonth * 100).toFixed(1) : "—";

      const cobradoEsteMes = subs
        .filter(s => s.estado === "activa" && s.fecha_inicio && s.fecha_inicio >= startOfMonth)
        .reduce((sum, s) => sum + (planesMap.get(s.plan_id)?.precio || 0), 0);

      const cobradoMesAnterior = subs
        .filter(s => {
          if (!s.fecha_inicio) return false;
          return s.fecha_inicio >= startOfLastMonth && s.fecha_inicio <= endOfLastMonth &&
            (s.estado === "activa" || s.mp_status === "conciliado");
        })
        .reduce((sum, s) => sum + (planesMap.get(s.plan_id)?.precio || 0), 0);

      const subsEstesMes = subs.filter(s => s.fecha_inicio && s.fecha_inicio >= startOfMonth);
      const cobradas = subsEstesMes.filter(s => s.estado === "activa");
      const tasaCobro = subsEstesMes.length > 0 ? Math.round((cobradas.length / subsEstesMes.length) * 100) : 100;

      const alumnosActivos = alumnos.filter(a => a.estado === "activo").length;
      const ticketPromedio = alumnosActivos > 0 ? Math.round(mrr / alumnosActivos) : 0;

      const storeMes = orders
        .filter((o: any) => o.created_at >= startOfMonth)
        .reduce((sum: number, o: any) => sum + (o.total || 0), 0);

      const gastosEsteMes = gastosData.filter((g: any) => g.fecha >= startOfMonth && (!g.moneda || g.moneda === "ARS")).reduce((sum: number, g: any) => sum + g.monto, 0);
      const gastosMesAnterior = gastosData.filter((g: any) => g.fecha >= startOfLastMonth && g.fecha <= endOfLastMonth && (!g.moneda || g.moneda === "ARS")).reduce((sum: number, g: any) => sum + g.monto, 0);

      const nuevosEsteMes = alumnos.filter(a => a.created_at >= startOfMonth).length;
      const inactivosEsteMes = subs.filter(s => (s.estado === "cancelada" || s.estado === "vencida") && s.created_at >= startOfMonth).length;
      const churnRate = alumnosActivos > 0 ? ((inactivosEsteMes / alumnosActivos) * 100).toFixed(1) : "0";

      const pendientes = subs.filter(s => s.estado === "pendiente");
      const montoPendiente = pendientes.reduce((sum, s) => sum + (planesMap.get(s.plan_id)?.precio || 0), 0);

      const ingresosTotal = cobradoEsteMes + storeMes;
      const rentabilidad = ingresosTotal - gastosEsteMes;

      setKpis([
        { label: "MRR", value: fmt(mrr), icon: DollarSign, color: "text-green-500", trend: mrrChange !== "—" ? { value: `${mrrChange}%`, direction: Number(mrrChange) >= 0 ? "up" : "down" } : undefined, subtitle: "Ingreso mensual recurrente" },
        { label: "Cobrado este mes", value: fmt(cobradoEsteMes), icon: Wallet, color: "text-emerald-500", trend: cobradoMesAnterior > 0 ? { value: `${((cobradoEsteMes - cobradoMesAnterior) / cobradoMesAnterior * 100).toFixed(0)}%`, direction: cobradoEsteMes >= cobradoMesAnterior ? "up" : "down" } : undefined, subtitle: `vs ${fmt(cobradoMesAnterior)} mes anterior` },
        { label: "Gastos del mes", value: fmt(gastosEsteMes), icon: Receipt, color: "text-red-500", trend: gastosMesAnterior > 0 ? { value: `${((gastosEsteMes - gastosMesAnterior) / gastosMesAnterior * 100).toFixed(0)}%`, direction: gastosEsteMes <= gastosMesAnterior ? "up" : "down" } : undefined, subtitle: `vs ${fmt(gastosMesAnterior)} mes anterior` },
        { label: "Resultado neto", value: fmt(rentabilidad), icon: Target, color: rentabilidad >= 0 ? "text-green-500" : "text-destructive", subtitle: "Ingresos − Gastos" },
        { label: "Tasa de cobro", value: `${tasaCobro}%`, icon: Percent, color: tasaCobro >= 80 ? "text-green-500" : "text-yellow-500", subtitle: `${cobradas.length}/${subsEstesMes.length} suscripciones` },
        { label: "Ticket promedio", value: fmt(ticketPromedio), icon: BarChart3, color: "text-primary", subtitle: `${alumnosActivos} alumnos activos` },
        { label: "Tienda este mes", value: fmt(storeMes), icon: DollarSign, color: "text-accent", subtitle: `${orders.filter((o: any) => o.created_at >= startOfMonth).length} pedidos` },
        { label: "Churn rate", value: `${churnRate}%`, icon: TrendingDown, color: Number(churnRate) > 5 ? "text-destructive" : "text-green-500", subtitle: `${inactivosEsteMes} bajas / ${nuevosEsteMes} altas` },
        { label: "Morosidad", value: fmt(montoPendiente), icon: AlertTriangle, color: montoPendiente > 0 ? "text-yellow-500" : "text-green-500", subtitle: `${pendientes.length} pagos pendientes` },
        { label: "Alumnos nuevos", value: nuevosEsteMes, icon: Users, color: "text-primary", subtitle: "Este mes" },
      ]);

      // Monthly trends (last 6 months)
      const monthly: { month: string; ingresos: number; gastos: number }[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const mStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        const mStart = `${mStr}-01`;
        const mEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split("T")[0];
        const monthNames = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

        const ing = subs
          .filter(s => s.fecha_inicio && s.fecha_inicio >= mStart && s.fecha_inicio <= mEnd && (s.estado === "activa" || s.mp_status === "conciliado"))
          .reduce((sum, s) => sum + (planesMap.get(s.plan_id)?.precio || 0), 0)
          + orders.filter((o: any) => o.created_at >= mStart && o.created_at <= mEnd + "T23:59:59")
            .reduce((sum: number, o: any) => sum + (o.total || 0), 0);

        const gast = gastosData.filter((g: any) => g.fecha >= mStart && g.fecha <= mEnd).reduce((sum: number, g: any) => sum + g.monto, 0);
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

  if (loading) return <div className="animate-pulse text-muted-foreground text-center py-12">Cargando métricas...</div>;

  const maxMonthly = Math.max(...monthlyData.map(m => Math.max(m.ingresos, m.gastos)), 1);

  const TrendIcon = ({ direction }: { direction: "up" | "down" | "flat" }) => {
    if (direction === "up") return <ArrowUpRight className="w-3 h-3 text-green-500" />;
    if (direction === "down") return <ArrowDownRight className="w-3 h-3 text-destructive" />;
    return <Minus className="w-3 h-3 text-muted-foreground" />;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold uppercase tracking-wider">Métricas</h1>
        <p className="text-sm text-muted-foreground">Control financiero y crecimiento</p>
      </div>

      {/* KPIs */}
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
              {k.subtitle && <p className="text-[10px] text-muted-foreground truncate">{k.subtitle}</p>}
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
                <div className="bg-green-500/80 rounded-full transition-all" style={{ width: `${(m.ingresos / maxMonthly) * 100}%` }} />
                <div className="bg-red-400/60 rounded-full transition-all" style={{ width: `${(m.gastos / maxMonthly) * 100}%` }} />
              </div>
            </div>
          ))}
          <div className="flex gap-4 text-[10px] text-muted-foreground pt-1">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500/80" /> Ingresos</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400/60" /> Gastos</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SuperAdminDashboard;
