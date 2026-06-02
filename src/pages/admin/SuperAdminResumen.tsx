import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart, Building2, FileText, CreditCard, AlertTriangle, ArrowRight } from "lucide-react";

const fmt = (n: number) => `$${n.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;

const currentMonthKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const MONTHS_ES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const monthLabel = (key: string) => {
  const [y, m] = key.split("-").map(Number);
  return `${MONTHS_ES[m - 1]} ${y}`;
};

// Igual criterio que AdminPayments: pertenece al mes si cobertura (fecha_fin/inicio) cae ahí
// o si se registró ese mes.
const subInMonth = (s: any, monthKey: string): boolean => {
  const coverage = s.fecha_fin || s.fecha_inicio;
  if (coverage && coverage.substring(0, 7) === monthKey) return true;
  const created = s.created_at ? s.created_at.substring(0, 7) : null;
  return created === monthKey;
};

const SuperAdminResumen = () => {
  const [loading, setLoading] = useState(true);
  const [planDist, setPlanDist] = useState<{ name: string; count: number; revenue: number }[]>([]);
  const [sedeDist, setSedeDist] = useState<{ name: string; count: number }[]>([]);
  const [alerts, setAlerts] = useState({ facturas: 0, pagos: 0, bajas: 0 });
  const [periodoBajas] = useState(currentMonthKey());

  const loadData = useCallback(async () => {
    setLoading(true);
    const [alumnosRes, subsRes, planesRes, sedesRes, allSubsRes, facturasRes] = await Promise.all([
      supabase.from("alumnos").select("id, estado, sede_id"),
      supabase.from("suscripciones").select("id, plan_id, estado"),
      supabase.from("planes").select("id, nombre, precio"),
      supabase.from("sedes").select("id, nombre"),
      supabase.from("suscripciones").select("id, alumno_id, plan_id, estado, fecha_inicio, fecha_fin, created_at, chequeado_admin, origen_registro, mp_status, baja_chequeada"),
      supabase.from("facturas").select("referencia_id, referencia_tipo").eq("referencia_tipo", "suscripcion"),
    ]);

    const alumnos = alumnosRes.data || [];
    const subs = subsRes.data || [];
    const planes = planesRes.data || [];
    const sedes = sedesRes.data || [];
    const allSubs = (allSubsRes.data || []) as any[];
    const facturas = facturasRes.data || [];
    const planesMap = new Map(planes.map(p => [p.id, p]));

    // Plan distribution
    const subsActivas = subs.filter(s => s.estado === "activa");
    const planCount: Record<string, { count: number; revenue: number }> = {};
    subsActivas.forEach(s => {
      const plan = planesMap.get(s.plan_id);
      if (!plan) return;
      if (!planCount[plan.nombre]) planCount[plan.nombre] = { count: 0, revenue: 0 };
      planCount[plan.nombre].count++;
      planCount[plan.nombre].revenue += plan.precio;
    });
    setPlanDist(Object.entries(planCount).map(([name, d]) => ({ name, ...d })).sort((a, b) => b.count - a.count));

    // Sede distribution
    const sedeMap = new Map(sedes.map(s => [s.id, s.nombre]));
    const sedeCount: Record<string, number> = {};
    alumnos.filter(a => a.estado === "activo").forEach(a => {
      const name = a.sede_id ? (sedeMap.get(a.sede_id) || "Sin sede") : "Sin sede";
      sedeCount[name] = (sedeCount[name] || 0) + 1;
    });
    setSedeDist(Object.entries(sedeCount).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count));

    // Alerts ─────────────────────────────────────────
    const curMonth = periodoBajas; // YYYY-MM del mes actual
    const today = new Date();
    const todayISO = today.toISOString().split("T")[0];
    const prevMonthDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const prevMonthKey = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, "0")}`;
    const [pY, pM] = prevMonthKey.split("-").map(Number);
    const prevMonthStart = `${prevMonthKey}-01`;
    const prevMonthEnd = new Date(pY, pM, 0).toISOString().split("T")[0];

    // 1. Pagos a chequear: subs cobradas del mes actual sin marca chequeado_admin
    const pagosACheckar = allSubs.filter(s =>
      (s.estado === "activa" || s.estado === "conciliado") &&
      !s.chequeado_admin &&
      subInMonth(s, curMonth)
    ).length;

    // 2. Facturas por realizar: subs cobradas del mes actual sin factura asociada
    const factSet = new Set(facturas.map((f: any) => f.referencia_id));
    const facturasPendientes = allSubs.filter(s =>
      (s.estado === "activa" || s.estado === "conciliado") &&
      !factSet.has(s.id) &&
      subInMonth(s, curMonth)
    ).length;

    // 3. Bajas: alumnos sin sub activa HOY que sí tenían sub activa el mes anterior.
    //    "Sub activa en mes X" = cualquier sub con cobertura (fecha_inicio<=fin_mes y (fecha_fin null o >=inicio_mes))
    //    "Sub activa hoy" = estado activa/conciliado y vigente (fecha_fin null o >= hoy)
    const hadSubInPrev = (alumnoId: string) =>
      allSubs.some(s =>
        s.alumno_id === alumnoId &&
        s.fecha_inicio && s.fecha_inicio <= prevMonthEnd &&
        (!s.fecha_fin || s.fecha_fin >= prevMonthStart)
      );
    const hasActiveToday = (alumnoId: string) =>
      allSubs.some(s =>
        s.alumno_id === alumnoId &&
        (s.estado === "activa" || s.estado === "conciliado") &&
        (!s.fecha_inicio || s.fecha_inicio <= todayISO) &&
        (!s.fecha_fin || s.fecha_fin >= todayISO)
      );
    const alumnoIds = Array.from(new Set(allSubs.map(s => s.alumno_id)));
    const bajasPendientes = alumnoIds.filter(id => hadSubInPrev(id) && !hasActiveToday(id)).length;

    setAlerts({ facturas: facturasPendientes, pagos: pagosACheckar, bajas: bajasPendientes });

    setLoading(false);
  }, [periodoBajas]);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) return <div className="animate-pulse text-muted-foreground text-center py-12">Cargando resumen...</div>;

  const maxPlanCount = Math.max(...planDist.map(p => p.count), 1);

  const alertCards = [
    {
      label: "Facturas por realizar",
      count: alerts.facturas,
      icon: FileText,
      tone: "yellow",
      to: "/admin/facturacion",
      hint: "Pagos cobrados sin factura emitida",
    },
    {
      label: "Pagos a chequear",
      count: alerts.pagos,
      icon: CreditCard,
      tone: "orange",
      to: "/admin/pagos?chequeo=pendientes",
      hint: "Conciliar contra MP / transferencia / efectivo",
    },
    {
      label: "Bajas a chequear",
      count: alerts.bajas,
      icon: AlertTriangle,
      tone: "red",
      to: "/admin/bajas",
      hint: `Alumnos sin renovar en ${periodoBajas}`,
    },
  ];

  const toneClass: Record<string, string> = {
    yellow: "border-yellow-500/40 bg-yellow-500/5 hover:bg-yellow-500/10 text-yellow-600",
    orange: "border-orange-500/40 bg-orange-500/5 hover:bg-orange-500/10 text-orange-600",
    red: "border-red-500/40 bg-red-500/5 hover:bg-red-500/10 text-red-600",
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold uppercase tracking-wider">Resumen</h1>
        <p className="text-sm text-muted-foreground">Alertas pendientes y distribución</p>
      </div>

      {/* Alerts */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {alertCards.map((a) => (
          <Link key={a.label} to={a.to} className={`group border rounded-lg p-4 transition-colors ${toneClass[a.tone]}`}>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <a.icon className="w-4 h-4" />
                <span className="text-[11px] font-heading uppercase tracking-wider">{a.label}</span>
              </div>
              <ArrowRight className="w-4 h-4 opacity-50 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-heading font-bold">{a.count}</span>
              {a.count === 0 && <span className="text-[11px] text-muted-foreground">Todo al día</span>}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">{a.hint}</p>
          </Link>
        ))}
      </div>

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
    </div>
  );
};

export default SuperAdminResumen;
