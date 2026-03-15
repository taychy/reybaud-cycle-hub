import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Package, ShoppingCart, DollarSign, AlertTriangle, TrendingUp, Plus, Image, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";

interface KPI {
  totalProducts: number;
  activeProducts: number;
  totalOrders: number;
  pendingOrders: number;
  monthRevenue: number;
  lowStockCount: number;
}

const StoreDashboard = () => {
  const navigate = useNavigate();
  const [kpis, setKpis] = useState<KPI>({ totalProducts: 0, activeProducts: 0, totalOrders: 0, pendingOrders: 0, monthRevenue: 0, lowStockCount: 0 });
  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [lowStockProducts, setLowStockProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const [productsRes, ordersRes, lowStockRes] = await Promise.all([
        supabase.from("store_products").select("id, status, stock, min_stock, price"),
        supabase.from("store_orders").select("id, total, status, created_at, customer_name").order("created_at", { ascending: false }).limit(5),
        supabase.from("store_products").select("id, name, stock, min_stock, image_url").order("stock", { ascending: true }).limit(5),
      ]);

      const products = productsRes.data || [];
      const orders = ordersRes.data || [];
      const lowStock = (lowStockRes.data || []).filter((p: any) => p.stock <= p.min_stock);

      const now = new Date();
      const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
      const monthOrders = orders.filter((o: any) => o.created_at >= monthStart && o.status !== "cancelado");

      setKpis({
        totalProducts: products.length,
        activeProducts: products.filter((p: any) => p.status === "active").length,
        totalOrders: orders.length,
        pendingOrders: orders.filter((o: any) => o.status === "pendiente").length,
        monthRevenue: monthOrders.reduce((sum: number, o: any) => sum + (o.total || 0), 0),
        lowStockCount: lowStock.length,
      });
      setRecentOrders(orders);
      setLowStockProducts(lowStock);
      setLoading(false);
    };
    load();
  }, []);

  const kpiCards = [
    { label: "Productos activos", value: kpis.activeProducts, icon: Package, color: "text-primary" },
    { label: "Pedidos pendientes", value: kpis.pendingOrders, icon: ShoppingCart, color: "text-accent" },
    { label: "Ventas del mes", value: `$${kpis.monthRevenue.toLocaleString("es-AR")}`, icon: DollarSign, color: "text-green-500" },
    { label: "Stock bajo", value: kpis.lowStockCount, icon: AlertTriangle, color: kpis.lowStockCount > 0 ? "text-destructive" : "text-muted-foreground" },
  ];

  const statusLabel: Record<string, string> = {
    pendiente: "Pendiente",
    pagado: "Pagado",
    preparando: "Preparando",
    enviado: "Enviado",
    entregado: "Entregado",
  };

  const statusColor: Record<string, string> = {
    pendiente: "bg-yellow-500/20 text-yellow-400",
    pagado: "bg-green-500/20 text-green-400",
    preparando: "bg-accent/20 text-accent",
    enviado: "bg-primary/20 text-primary",
    entregado: "bg-muted text-muted-foreground",
  };

  if (loading) return <div className="animate-pulse text-muted-foreground">Cargando tienda...</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-heading font-bold text-foreground">Tienda</h1>
          <p className="text-sm text-muted-foreground">Panel de administración de la tienda</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" onClick={() => navigate("/admin/tienda/productos?action=create")}>
            <Plus className="w-4 h-4 mr-1" /> Crear producto
          </Button>
          <Button size="sm" variant="outline" onClick={() => navigate("/admin/tienda/banners")}>
            <Image className="w-4 h-4 mr-1" /> Banners
          </Button>
          <Button size="sm" variant="outline" onClick={() => navigate("/admin/tienda/promociones")}>
            <Tag className="w-4 h-4 mr-1" /> Promociones
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map((kpi) => (
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
        {/* Recent orders */}
        <div className="rounded-xl border border-border bg-card">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <h2 className="text-sm font-heading font-bold uppercase tracking-wider">Últimos pedidos</h2>
            <Button variant="ghost" size="sm" onClick={() => navigate("/admin/tienda/pedidos")} className="text-xs text-primary">
              Ver todos
            </Button>
          </div>
          <div className="divide-y divide-border">
            {recentOrders.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">No hay pedidos aún</div>
            ) : (
              recentOrders.map((order) => (
                <div key={order.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{order.customer_name}</p>
                    <p className="text-xs text-muted-foreground">{new Date(order.created_at).toLocaleDateString("es-AR")}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-[10px] font-heading font-bold uppercase px-2 py-0.5 rounded ${statusColor[order.status] || "bg-muted text-muted-foreground"}`}>
                      {statusLabel[order.status] || order.status}
                    </span>
                    <span className="text-sm font-heading font-bold">${order.total?.toLocaleString("es-AR")}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Low stock */}
        <div className="rounded-xl border border-border bg-card">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <h2 className="text-sm font-heading font-bold uppercase tracking-wider">Stock bajo</h2>
            <Button variant="ghost" size="sm" onClick={() => navigate("/admin/tienda/stock")} className="text-xs text-primary">
              Ver todo
            </Button>
          </div>
          <div className="divide-y divide-border">
            {lowStockProducts.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">Todo el stock está bien 👍</div>
            ) : (
              lowStockProducts.map((p) => (
                <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="w-10 h-10 rounded bg-secondary flex items-center justify-center overflow-hidden shrink-0">
                    {p.image_url ? <img src={p.image_url} className="w-full h-full object-cover" /> : <Package className="w-5 h-5 text-muted-foreground" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{p.name}</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-heading font-bold ${p.stock === 0 ? "text-destructive" : "text-yellow-400"}`}>{p.stock} uds</p>
                    <p className="text-[10px] text-muted-foreground">mín: {p.min_stock}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default StoreDashboard;
