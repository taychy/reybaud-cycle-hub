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

type BusinessUnit = "escuela" | "tienda" | "viajes";
type UnitFilter = "global" | BusinessUnit;
type CurrencyTotals = Record<string, number>; // "ARS" | "USD" | "EUR" -> monto

interface MonthlyBreakdown {
  month: string;
  units: Record<BusinessUnit, { ingresos: CurrencyTotals; gastos: CurrencyTotals }>;
  global: { ingresos: CurrencyTotals; gastos: CurrencyTotals };
}

const UNITS: BusinessUnit[] = ["escuela", "tienda", "viajes"];
const UNIT_LABELS: Record<UnitFilter, string> = { global: "Global", escuela: "Escuela", tienda: "Tienda", viajes: "Viajes" };

const emptyCurrencyTotals = (): CurrencyTotals => ({});
const addTo = (bucket: CurrencyTotals, currency: string, amount: number) => {
  bucket[currency || "ARS"] = (bucket[currency || "ARS"] || 0) + amount;
};

const fmtCur = (n: number, currency: string) => {
  const symbol = currency === "USD" ? "US$" : currency === "EUR" ? "€" : "$";
  return `${symbol}${n.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;
};

const fmt = (n: number) => `$${n.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;

const SuperAdminDashboard = () => {
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState<KPI[]>([]);
  const [monthlyData, setMonthlyData] = useState<MonthlyBreakdown[]>([]);
  const [planPerformance, setPlanPerformance] = useState<PlanPerformance[]>([]);
  const [unitFilter, setUnitFilter] = useState<UnitFilter>("global");
  const [currencyFilter, setCurrencyFilter] = useState<string>("all");

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

      const [alumnosRes, subsRes, planesRes, gastosRes, storeOrdersRes, reservationPaymentsRes] = await Promise.all([
        supabase.from("alumnos").select("id, estado, created_at"),
        supabase.from("suscripciones").select("id, alumno_id, plan_id, estado, fecha_inicio, fecha_fin, mp_status, created_at"),
        // BUG (fix): faltaba "moneda" -> plan.moneda siempre daba undefined y todo se trataba como ARS por accidente
        supabase.from("planes").select("id, nombre, precio, moneda"),
        // BUG (fix): faltaba "moneda" en el select -> mismo problema en gastos. Se agrega unidad_negocio para el prorrateo.
        supabase.from("gastos").select("id, monto, fecha, moneda, unidad_negocio").order("fecha", { ascending: false }).limit(1000),
        supabase.from("store_orders").select("id, total, status, created_at"),
        // BUG (fix): no se consultaban los pagos de eventos/viajes. Solo cuentan los validados por un admin.
        supabase.from("reservation_payments" as any)
          .select("id, amount, currency, event_currency, equivalent_amount_event_currency, status, payment_date")
          .eq("status", "validado"),
      ]);

      const alumnos = alumnosRes.data || [];
      const subs = subsRes.data || [];
      const planes = planesRes.data || [];
      const gastosData = gastosRes.data || [];
      const orders = (storeOrdersRes.data || []).filter((o: any) => o.status !== "cancelado");
      const reservationPayments = (reservationPaymentsRes.data || []) as any[];

      const planesMap = new Map(planes.map(p => [p.id, p]));

      // BUG (fix): "activa" descartaba las suscripciones ya vencidas que sí se cobraron
      // (pasan a "finalizada" cuando termina el período). Se cuentan como cobradas
      // activa | finalizada | conciliado.
      const ESTADOS_COBRADOS = ["activa", "finalizada", "conciliado"];
      const subsActivas = subs.filter(s => s.estado === "activa");
      const mrr = subsActivas.reduce((sum, s) => sum + (planesMap.get(s.plan_id)?.precio || 0), 0);

      const subsActivasLastMonth = subs.filter(s => {
        if (s.estado === "cancelada" || !s.fecha_inicio) return false;
        return s.fecha_inicio <= endOfLastMonth && (!s.fecha_fin || s.fecha_fin >= startOfLastMonth);
      });
      const mrrLastMonth = subsActivasLastMonth.reduce((sum, s) => sum + (planesMap.get(s.plan_id)?.precio || 0), 0);
      const mrrChange = mrrLastMonth > 0 ? ((mrr - mrrLastMonth) / mrrLastMonth * 100).toFixed(1) : "—";

      const cobradoEsteMes = subs
        .filter(s => ESTADOS_COBRADOS.includes(s.estado) && s.fecha_inicio && s.fecha_inicio >= startOfMonth)
        .reduce((sum, s) => sum + (planesMap.get(s.plan_id)?.precio || 0), 0);

      const cobradoMesAnterior = subs
        .filter(s => {
          if (!s.fecha_inicio) return false;
          return s.fecha_inicio >= startOfLastMonth && s.fecha_inicio <= endOfLastMonth &&
            ESTADOS_COBRADOS.includes(s.estado);
        })
        .reduce((sum, s) => sum + (planesMap.get(s.plan_id)?.precio || 0), 0);

      const subsEstesMes = subs.filter(s => s.fecha_inicio && s.fecha_inicio >= startOfMonth);
      const cobradas = subsEstesMes.filter(s => s.estado === "activa");
      const tasaCobro = subsEstesMes.length > 0 ? Math.round((cobradas.length / subsEstesMes.length) * 100) : 100;

      const alumnosActivos = alumnos.filter(a => a.estado === "activo").length;
      const ticketPromedio = alumnosActivos > 0 ? Math.round(mrr / alumnosActivos) : 0;

      const ordersMes = orders.filter((o: any) => o.created_at >= startOfMonth && o.status === "pagado");
      const storeMes = ordersMes.reduce((sum: number, o: any) => sum + (o.total || 0), 0);

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
        { label: "Ventas tienda este mes", value: fmt(storeMes), icon: DollarSign, color: "text-accent", subtitle: `${ordersMes.length} pedidos pagados` },
        { label: "Churn rate", value: `${churnRate}%`, icon: TrendingDown, color: Number(churnRate) > 5 ? "text-destructive" : "text-green-500", subtitle: `${inactivosEsteMes} bajas / ${nuevosEsteMes} altas` },
        { label: "Morosidad", value: fmt(montoPendiente), icon: AlertTriangle, color: montoPendiente > 0 ? "text-yellow-500" : "text-green-500", subtitle: `${pendientes.length} pagos pendientes` },
        { label: "Alumnos nuevos", value: nuevosEsteMes, icon: Users, color: "text-primary", subtitle: "Este mes" },
      ]);

      // Plan performance
      const planPerfMap: Record<string, { name: string; inscriptos: number; facturacion: number; moneda: string }> = {};
      subsActivas.forEach(s => {
        const plan = planesMap.get(s.plan_id);
        if (!plan) return;
        if (!planPerfMap[s.plan_id]) planPerfMap[s.plan_id] = { name: plan.nombre, inscriptos: 0, facturacion: 0, moneda: (plan as any).moneda || "ARS" };
        planPerfMap[s.plan_id].inscriptos++;
        planPerfMap[s.plan_id].facturacion += plan.precio;
      });
      const totalFact = Object.values(planPerfMap).reduce((s, p) => s + p.facturacion, 0);
      const perfArr = Object.values(planPerfMap)
        .map(p => ({ ...p, porcentaje: totalFact > 0 ? Math.round((p.facturacion / totalFact) * 100) : 0 }))
        .sort((a, b) => b.facturacion - a.facturacion);
      setPlanPerformance(perfArr);

      // Monthly trends (last 6 months), por unidad de negocio y por moneda.
      const monthNames = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

      // Paso 1: ingresos directos por unidad+moneda y gastos directos por unidad+moneda,
      // más el pool de gastos "compartido" por moneda, para cada uno de los 6 meses.
      const rawMonths: {
        month: string;
        ingresos: Record<BusinessUnit, CurrencyTotals>;
        gastosDirectos: Record<BusinessUnit, CurrencyTotals>;
        gastosCompartidos: CurrencyTotals;
      }[] = [];

      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const mStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        const mStart = `${mStr}-01`;
        const mEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split("T")[0];

        const ingresos: Record<BusinessUnit, CurrencyTotals> = { escuela: emptyCurrencyTotals(), tienda: emptyCurrencyTotals(), viajes: emptyCurrencyTotals() };
        const gastosDirectos: Record<BusinessUnit, CurrencyTotals> = { escuela: emptyCurrencyTotals(), tienda: emptyCurrencyTotals(), viajes: emptyCurrencyTotals() };
        const gastosCompartidos: CurrencyTotals = emptyCurrencyTotals();

        // Escuela: suscripciones cuyo período arrancó ese mes y están cobradas
        subs
          .filter(s => s.fecha_inicio && s.fecha_inicio >= mStart && s.fecha_inicio <= mEnd && ESTADOS_COBRADOS.includes(s.estado))
          .forEach(s => {
            const plan = planesMap.get(s.plan_id);
            addTo(ingresos.escuela, plan?.moneda || "ARS", plan?.precio || 0);
          });

        // Tienda: ventas pagadas ese mes (asumido ARS -- no se detectó columna de moneda en store_orders)
        orders
          .filter((o: any) => o.status === "pagado" && o.created_at >= mStart && o.created_at <= mEnd + "T23:59:59")
          .forEach((o: any) => addTo(ingresos.tienda, "ARS", o.total || 0));

        // Viajes: reservation_payments validados con payment_date en el mes, agrupados por
        // la moneda del evento (equivalent_amount_event_currency si el pago fue en otra moneda)
        reservationPayments
          .filter((p: any) => p.payment_date && p.payment_date >= mStart && p.payment_date <= mEnd)
          .forEach((p: any) => {
            const currency = p.event_currency || p.currency || "ARS";
            const amount = p.equivalent_amount_event_currency ?? p.amount ?? 0;
            addTo(ingresos.viajes, currency, amount);
          });

        // Gastos: directos por unidad, o al pool de compartidos si no está clasificado
        gastosData
          .filter((g: any) => g.fecha >= mStart && g.fecha <= mEnd)
          .forEach((g: any) => {
            const moneda = g.moneda || "ARS";
            if (g.unidad_negocio === "escuela" || g.unidad_negocio === "tienda" || g.unidad_negocio === "viajes") {
              addTo(gastosDirectos[g.unidad_negocio as BusinessUnit], moneda, g.monto || 0);
            } else {
              addTo(gastosCompartidos, moneda, g.monto || 0);
            }
          });

        rawMonths.push({ month: monthNames[d.getMonth()], ingresos, gastosDirectos, gastosCompartidos });
      }

      // Paso 2: prorratear los gastos compartidos por unidad, usando el % de ingresos ARS
      // de cada unidad en una ventana móvil de 3 meses (mes actual + 2 anteriores dentro
      // de la ventana de 6 meses cargada). Simplificación: el peso se calcula solo con
      // ingresos ARS (para no depender de un tipo de cambio); el monto prorrateado se
      // aplica tal cual esté el gasto compartido, en su propia moneda.
      const ingresosArsPorMes = rawMonths.map(m => ({
        escuela: m.ingresos.escuela["ARS"] || 0,
        tienda: m.ingresos.tienda["ARS"] || 0,
        viajes: m.ingresos.viajes["ARS"] || 0,
      }));

      const monthly: MonthlyBreakdown[] = rawMonths.map((m, idx) => {
        const windowStart = Math.max(0, idx - 2);
        const windowSlice = ingresosArsPorMes.slice(windowStart, idx + 1);
        const avg: Record<BusinessUnit, number> = { escuela: 0, tienda: 0, viajes: 0 };
        UNITS.forEach(u => { avg[u] = windowSlice.reduce((s, w) => s + w[u], 0) / windowSlice.length; });
        const totalAvg = avg.escuela + avg.tienda + avg.viajes;
        const weight: Record<BusinessUnit, number> = totalAvg > 0
          ? { escuela: avg.escuela / totalAvg, tienda: avg.tienda / totalAvg, viajes: avg.viajes / totalAvg }
          : { escuela: 1 / 3, tienda: 1 / 3, viajes: 1 / 3 }; // sin ingresos en la ventana -> reparto parejo

        const units = {} as Record<BusinessUnit, { ingresos: CurrencyTotals; gastos: CurrencyTotals }>;
        UNITS.forEach(u => {
          const gastos: CurrencyTotals = { ...m.gastosDirectos[u] };
          Object.entries(m.gastosCompartidos).forEach(([currency, amount]) => {
            addTo(gastos, currency, amount * weight[u]);
          });
          units[u] = { ingresos: m.ingresos[u], gastos };
        });

        const global = { ingresos: emptyCurrencyTotals(), gastos: emptyCurrencyTotals() };
        UNITS.forEach(u => {
          Object.entries(units[u].ingresos).forEach(([c, v]) => addTo(global.ingresos, c, v));
          Object.entries(units[u].gastos).forEach(([c, v]) => addTo(global.gastos, c, v));
        });

        return { month: m.month, units, global };
      });

      setMonthlyData(monthly);
    } catch (err) {
      console.error("Error loading super admin dashboard:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) return <div className="animate-pulse text-muted-foreground text-center py-12">Cargando métricas...</div>;

  // Un máximo por moneda (ARS y USD/EUR tienen escalas muy distintas, no se pueden
  // graficar con la misma barra sin que una quede invisible).
  const dataForUnit = (m: MonthlyBreakdown) => (unitFilter === "global" ? m.global : m.units[unitFilter]);
  const maxByCurrency: CurrencyTotals = {};
  const availableCurrencies = new Set<string>();
  monthlyData.forEach(m => {
    const d = dataForUnit(m);
    [...Object.entries(d.ingresos), ...Object.entries(d.gastos)].forEach(([c, v]) => {
      maxByCurrency[c] = Math.max(maxByCurrency[c] || 1, v);
      if (v > 0) availableCurrencies.add(c);
    });
  });
  const currencyOptions = Array.from(availableCurrencies).sort((a, b) =>
    a === "ARS" ? -1 : b === "ARS" ? 1 : a.localeCompare(b)
  );

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
        <CardHeader className="pb-3 space-y-3">
          <CardTitle className="text-sm font-heading font-bold uppercase tracking-wider flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-primary" />
            Ingresos vs Gastos (6 meses)
          </CardTitle>
          <div className="flex gap-1.5 flex-wrap">
            {(["global", "escuela", "tienda", "viajes"] as UnitFilter[]).map(u => (
              <button
                key={u}
                onClick={() => setUnitFilter(u)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-medium uppercase tracking-wider transition-colors ${
                  unitFilter === u ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                {UNIT_LABELS[u]}
              </button>
            ))}
          </div>
          {currencyOptions.length > 1 && (
            <div className="flex gap-1.5 flex-wrap items-center">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider mr-1">Moneda</span>
              {(["all", ...currencyOptions] as string[]).map(c => (
                <button
                  key={c}
                  onClick={() => setCurrencyFilter(c)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-medium uppercase tracking-wider transition-colors ${
                    currencyFilter === c ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {c === "all" ? "Todas" : c}
                </button>
              ))}
            </div>
          )}
          {unitFilter !== "global" && (
            <p className="text-[10px] text-muted-foreground">
              Incluye gastos directos de {UNIT_LABELS[unitFilter].toLowerCase()} + su parte prorrateada de gastos compartidos.
            </p>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {monthlyData.map((m) => {
            const d = dataForUnit(m);
            const currencies = Array.from(new Set([...Object.keys(d.ingresos), ...Object.keys(d.gastos)]));
            if (currencies.length === 0) {
              return (
                <div key={m.month} className="flex justify-between text-xs">
                  <span className="text-muted-foreground font-medium">{m.month}</span>
                  <span className="text-muted-foreground">{fmtCur(0, "ARS")} / {fmtCur(0, "ARS")}</span>
                </div>
              );
            }
            return (
              <div key={m.month} className="space-y-1.5">
                <span className="text-xs text-muted-foreground font-medium">{m.month}</span>
                {currencies.sort((a, b) => (a === "ARS" ? -1 : b === "ARS" ? 1 : a.localeCompare(b))).map(c => {
                  const ing = d.ingresos[c] || 0;
                  const gas = d.gastos[c] || 0;
                  const max = maxByCurrency[c] || 1;
                  return (
                    <div key={c} className="space-y-1">
                      <div className="flex justify-between text-xs pl-2">
                        <span className="text-muted-foreground/70 text-[10px] font-mono">{c}</span>
                        <span className="font-heading">
                          <span className="text-green-500">{fmtCur(ing, c)}</span>
                          {" / "}
                          <span className="text-red-400">{fmtCur(gas, c)}</span>
                        </span>
                      </div>
                      <div className="flex gap-1 h-3 pl-2">
                        <div className="bg-green-500/80 rounded-full transition-all" style={{ width: `${(ing / max) * 100}%` }} />
                        <div className="bg-red-400/60 rounded-full transition-all" style={{ width: `${(gas / max) * 100}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
          <div className="flex gap-4 text-[10px] text-muted-foreground pt-1">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500/80" /> Ingresos</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400/60" /> Gastos</span>
          </div>
        </CardContent>
      </Card>

      {/* Plan Performance */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-heading font-bold uppercase tracking-wider flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-accent" />
            Rendimiento por plan
          </CardTitle>
          <p className="text-[10px] text-muted-foreground">Inscriptos activos y facturación mensual estimada</p>
        </CardHeader>
        <CardContent>
          {planPerformance.length > 0 ? (
            <div className="space-y-0 divide-y divide-border">
              {/* Header */}
              <div className="grid grid-cols-12 gap-2 pb-2 text-[10px] font-heading uppercase tracking-wider text-muted-foreground">
                <span className="col-span-5">Plan</span>
                <span className="col-span-2 text-center">Inscriptos</span>
                <span className="col-span-3 text-right">Facturación</span>
                <span className="col-span-2 text-right">% del total</span>
              </div>
              {planPerformance.map((p) => {
                const maxFact = Math.max(...planPerformance.map(x => x.facturacion), 1);
                return (
                  <div key={p.name} className="py-2.5 space-y-1.5">
                    <div className="grid grid-cols-12 gap-2 items-center">
                      <span className="col-span-5 text-sm font-medium truncate">{p.name}</span>
                      <span className="col-span-2 text-center">
                        <span className="inline-flex items-center justify-center bg-primary/10 text-primary text-xs font-bold rounded-full w-8 h-6">{p.inscriptos}</span>
                      </span>
                      <span className="col-span-3 text-right text-sm font-heading font-bold">
                        {p.moneda === "USD" ? "US" : ""}${p.facturacion.toLocaleString("es-AR", { maximumFractionDigits: 0 })}
                      </span>
                      <span className="col-span-2 text-right text-xs text-muted-foreground font-mono">{p.porcentaje}%</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-accent to-accent/50 rounded-full transition-all" style={{ width: `${(p.facturacion / maxFact) * 100}%` }} />
                    </div>
                  </div>
                );
              })}
              {/* Totals */}
              <div className="grid grid-cols-12 gap-2 pt-3 items-center">
                <span className="col-span-5 text-sm font-heading font-bold uppercase">Total</span>
                <span className="col-span-2 text-center text-sm font-bold">{planPerformance.reduce((s, p) => s + p.inscriptos, 0)}</span>
                <span className="col-span-3 text-right text-sm font-heading font-bold text-accent">
                  {fmt(planPerformance.reduce((s, p) => s + p.facturacion, 0))}
                </span>
                <span className="col-span-2 text-right text-xs text-muted-foreground">100%</span>
              </div>
            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground text-sm">No hay suscripciones activas</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default SuperAdminDashboard;
