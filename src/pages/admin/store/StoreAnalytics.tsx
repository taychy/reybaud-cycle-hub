import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { TrendingUp, Package, DollarSign, BarChart3 } from "lucide-react";

const StoreAnalytics = () => {
  const [stats, setStats] = useState({
    totalRevenue: 0,
    totalOrders: 0,
    avgTicket: 0,
    topProducts: [] as { name: string; count: number; revenue: number }[],
    topCategories: [] as { name: string; revenue: number }[],
    weeklyRevenue: [] as { week: string; total: number }[],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const [ordersRes, itemsRes, categoriesRes] = await Promise.all([
        supabase.from("store_orders").select("id, total, status, created_at"),
        supabase.from("store_order_items").select("product_name, quantity, unit_price"),
        supabase.from("store_categories").select("id, name"),
      ]);

      const orders = (ordersRes.data || []).filter((o: any) => o.status !== "cancelado");
      const items = itemsRes.data || [];

      const totalRevenue = orders.reduce((s: number, o: any) => s + (o.total || 0), 0);
      const totalOrders = orders.length;
      const avgTicket = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;

      // Top products by quantity
      const productMap: Record<string, { count: number; revenue: number }> = {};
      items.forEach((item: any) => {
        if (!productMap[item.product_name]) productMap[item.product_name] = { count: 0, revenue: 0 };
        productMap[item.product_name].count += item.quantity;
        productMap[item.product_name].revenue += item.unit_price * item.quantity;
      });
      const topProducts = Object.entries(productMap)
        .map(([name, data]) => ({ name, ...data }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      // Weekly revenue (last 4 weeks)
      const weeklyRevenue: { week: string; total: number }[] = [];
      for (let i = 3; i >= 0; i--) {
        const end = new Date();
        end.setDate(end.getDate() - i * 7);
        const start = new Date(end);
        start.setDate(start.getDate() - 7);
        const weekOrders = orders.filter((o: any) => {
          const d = new Date(o.created_at);
          return d >= start && d < end;
        });
        weeklyRevenue.push({
          week: `Semana ${4 - i}`,
          total: weekOrders.reduce((s: number, o: any) => s + (o.total || 0), 0),
        });
      }

      setStats({ totalRevenue, totalOrders, avgTicket, topProducts, topCategories: [], weeklyRevenue });
      setLoading(false);
    };
    load();
  }, []);

  if (loading) return <div className="animate-pulse text-muted-foreground">Cargando analytics...</div>;

  const maxWeekly = Math.max(...stats.weeklyRevenue.map((w) => w.total), 1);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-heading font-bold">Analytics de Tienda</h1>

      {/* Summary KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: "Ingresos totales", value: `$${stats.totalRevenue.toLocaleString("es-AR")}`, icon: DollarSign, color: "text-green-500" },
          { label: "Pedidos totales", value: stats.totalOrders, icon: Package, color: "text-accent" },
          { label: "Ticket promedio", value: `$${stats.avgTicket.toLocaleString("es-AR")}`, icon: TrendingUp, color: "text-primary" },
        ].map((kpi) => (
          <div key={kpi.label} className="rounded-xl border border-border bg-card p-4 space-y-2">
            <div className="flex items-center gap-2">
              <kpi.icon className={`w-5 h-5 ${kpi.color}`} />
              <span className="text-xs text-muted-foreground font-heading uppercase tracking-wider">{kpi.label}</span>
            </div>
            <p className="text-2xl font-heading font-bold text-foreground">{kpi.value}</p>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Weekly revenue chart */}
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <h2 className="text-sm font-heading font-bold uppercase tracking-wider flex items-center gap-2"><BarChart3 className="w-4 h-4 text-primary" /> Ventas por semana</h2>
          <div className="space-y-3">
            {stats.weeklyRevenue.map((w) => (
              <div key={w.week} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">{w.week}</span>
                  <span className="font-heading font-bold">${w.total.toLocaleString("es-AR")}</span>
                </div>
                <div className="h-3 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-primary to-primary/70 rounded-full transition-all" style={{ width: `${(w.total / maxWeekly) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top products */}
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <h2 className="text-sm font-heading font-bold uppercase tracking-wider flex items-center gap-2"><Package className="w-4 h-4 text-accent" /> Productos más vendidos</h2>
          <div className="divide-y divide-border">
            {stats.topProducts.length > 0 ? stats.topProducts.map((p, idx) => (
              <div key={p.name} className="flex items-center gap-3 py-2.5">
                <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-heading font-bold flex items-center justify-center">{idx + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{p.name}</p>
                  <p className="text-xs text-muted-foreground">{p.count} vendidos</p>
                </div>
                <span className="font-heading font-bold text-sm">${p.revenue.toLocaleString("es-AR")}</span>
              </div>
            )) : (
              <div className="py-8 text-center text-muted-foreground text-sm">No hay datos de ventas aún</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default StoreAnalytics;
