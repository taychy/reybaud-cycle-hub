import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart, Building2 } from "lucide-react";

const fmt = (n: number) => `$${n.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;

const SuperAdminResumen = () => {
  const [loading, setLoading] = useState(true);
  const [planDist, setPlanDist] = useState<{ name: string; count: number; revenue: number }[]>([]);
  const [sedeDist, setSedeDist] = useState<{ name: string; count: number }[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [alumnosRes, subsRes, planesRes, sedesRes] = await Promise.all([
      supabase.from("alumnos").select("id, estado, sede_id"),
      supabase.from("suscripciones").select("id, plan_id, estado"),
      supabase.from("planes").select("id, nombre, precio"),
      supabase.from("sedes").select("id, nombre"),
    ]);

    const alumnos = alumnosRes.data || [];
    const subs = subsRes.data || [];
    const planes = planesRes.data || [];
    const sedes = sedesRes.data || [];
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

    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) return <div className="animate-pulse text-muted-foreground text-center py-12">Cargando resumen...</div>;

  const maxPlanCount = Math.max(...planDist.map(p => p.count), 1);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold uppercase tracking-wider">Resumen</h1>
        <p className="text-sm text-muted-foreground">Distribución de planes y sedes</p>
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
