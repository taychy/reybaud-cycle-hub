import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import DayNavigatorBar from "@/components/admin/DayNavigatorBar";
import {
  AlertTriangle, Package, Truck, RefreshCw, ShoppingBag, CalendarDays,
  CheckCircle2, ClipboardList, ChevronRight,
} from "lucide-react";

const sb: any = supabase;

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const addDays = (iso: string, n: number) => {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
};

const fmtDay = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const label = dt.toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "short" });
  return label.charAt(0).toUpperCase() + label.slice(1);
};

interface AlertCard {
  key: string;
  icon: any;
  count: number;
  title: string;
  desc: string;
  cta: string;
  to: string;
  tone: "danger" | "warn" | "info";
}

interface WeekItem {
  fecha: string;
  label: string;
  detail: string;
  to: string;
}

const toneCls: Record<string, string> = {
  danger: "border-destructive/40 bg-destructive/5",
  warn: "border-yellow-500/40 bg-yellow-500/5",
  info: "border-primary/40 bg-primary/5",
};

const toneText: Record<string, string> = {
  danger: "text-destructive",
  warn: "text-yellow-500",
  info: "text-primary",
};

interface Props {
  /** Procesos guiados en curso, para mostrarlos en la columna semanal */
  procesosEnCurso?: { id: string; nombre: string; started_at: string }[];
}

const DepositoPanelDia = ({ procesosEnCurso = [] }: Props) => {
  const navigate = useNavigate();
  const [dia, setDia] = useState<string>(todayStr());
  const [loading, setLoading] = useState(true);
  const [alerts, setAlerts] = useState<AlertCard[]>([]);
  const [week, setWeek] = useState<WeekItem[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const hoy = dia;
    const esHoy = dia === todayStr();
    const fin = addDays(hoy, 7);

    const [ordersRes, deliveriesRes, cambiosRes, supplierRes, vanRes, stockRes] = await Promise.all([
      sb.from("store_orders").select("id, order_number, customer_name, status, created_at").eq("status", "pagado"),
      sb.from("delivery_lists").select("id, titulo, fecha_entrega, estado").eq("estado", "abierta"),
      sb.from("store_cambios").select("id, estado").in("estado", ["aprobado", "en_deposito", "listo_retiro"]),
      sb.from("supplier_orders").select("id, numero, proveedor_nombre, estado, fecha_estimada_entrega").not("estado", "in", "(cerrado,cancelado)"),
      sb.from("vehiculo_cargas").select("id, fecha_salida, estado").order("fecha_salida", { ascending: false }).limit(5),
      sb.from("store_products").select("id, stock, min_stock").eq("status", "active"),
    ]);

    const orders = ordersRes.data || [];
    const deliveries = deliveriesRes.data || [];
    const cambios = cambiosRes.data || [];
    const supplier = supplierRes.data || [];
    const vans = vanRes.data || [];
    const productos = (stockRes.data || []).filter((p: any) => (p.stock ?? 0) <= (p.min_stock ?? 0));

    const sinStock = productos.filter((p: any) => (p.stock ?? 0) <= 0).length;
    const stockBajo = productos.length - sinStock;

    const entregasHoy = deliveries.filter((d: any) => d.fecha_entrega && (esHoy ? d.fecha_entrega <= hoy : d.fecha_entrega === hoy));
    const vanHoy = vans.find((v: any) => v.fecha_salida === hoy);

    const cards: AlertCard[] = [];

    if (esHoy && orders.length > 0) {
      cards.push({
        key: "preparar",
        icon: ShoppingBag,
        count: orders.length,
        title: "Pedidos por preparar",
        desc: "Ventas pagadas esperando armado del paquete.",
        cta: "Preparar pedidos",
        to: "/deposito/ventas?tab=pedidos",
        tone: "info",
      });
    }
    if (entregasHoy.length > 0) {
      cards.push({
        key: "entregas",
        icon: Truck,
        count: entregasHoy.length,
        title: esHoy ? "Entregas para hoy" : "Entregas de ese día",
        desc: entregasHoy.map((d: any) => d.titulo).slice(0, 2).join(" · "),
        cta: "Abrir listas",
        to: "/deposito/entregas",
        tone: "warn",
      });
    }
    if (esHoy && !vanHoy) {
      cards.push({
        key: "camioneta",
        icon: Package,
        count: 1,
        title: "Chequeo de camioneta pendiente",
        desc: "Todavía no cargaste el chequeo de cajas de hoy.",
        cta: "Iniciar chequeo",
        to: "/deposito/camioneta",
        tone: "warn",
      });
    }
    if (esHoy && cambios.length > 0) {
      cards.push({
        key: "cambios",
        icon: RefreshCw,
        count: cambios.length,
        title: "Cambios pendientes",
        desc: "Cambios aprobados esperando recepción o entrega.",
        cta: "Ver cambios",
        to: "/deposito/cambios",
        tone: "info",
      });
    }
    if (esHoy && supplier.length > 0) {
      cards.push({
        key: "proveedor",
        icon: ClipboardList,
        count: supplier.length,
        title: "Pedidos a proveedor abiertos",
        desc: "Controlá la mercadería recibida contra el pedido.",
        cta: "Ver pedidos",
        to: "/deposito/pedidos-proveedor",
        tone: "info",
      });
    }
    if (esHoy && (sinStock > 0 || stockBajo > 0)) {
      cards.push({
        key: "stock",
        icon: AlertTriangle,
        count: sinStock + stockBajo,
        title: sinStock > 0 ? `${sinStock} sin stock · ${stockBajo} bajo mínimo` : "Productos bajo el mínimo",
        desc: "Avisale al admin para reponer.",
        cta: "Ver stock",
        to: "/deposito/stock",
        tone: sinStock > 0 ? "danger" : "warn",
      });
    }

    // ==== Semana ====
    const items: WeekItem[] = [];
    deliveries.forEach((d: any) => {
      if (d.fecha_entrega && d.fecha_entrega > hoy && d.fecha_entrega <= fin) {
        items.push({ fecha: d.fecha_entrega, label: "Entrega", detail: d.titulo, to: `/deposito/entregas/${d.id}` });
      }
    });
    supplier.forEach((s: any) => {
      if (s.fecha_estimada_entrega && s.fecha_estimada_entrega <= fin) {
        items.push({
          fecha: s.fecha_estimada_entrega,
          label: "Llega pedido",
          detail: `${s.numero || ""} ${s.proveedor_nombre || ""}`.trim(),
          to: "/deposito/pedidos-proveedor",
        });
      }
    });
    procesosEnCurso.forEach((p) => {
      items.push({
        fecha: p.started_at.slice(0, 10),
        label: "Proceso en curso",
        detail: p.nombre,
        to: `/deposito/procesos/${p.id}`,
      });
    });
    items.sort((a, b) => a.fecha.localeCompare(b.fecha));

    setAlerts(cards);
    setWeek(items);
    setLoading(false);
  }, [dia, JSON.stringify(procesosEnCurso.map((p) => p.id))]);

  useEffect(() => { load(); }, [load]);

  const grouped = week.reduce<Record<string, WeekItem[]>>((acc, it) => {
    (acc[it.fecha] ||= []).push(it);
    return acc;
  }, {});

  return (
    <section className="space-y-4">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-heading font-bold uppercase tracking-wider">Panel del día</h1>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Actualizar
          </Button>
        </div>
        <DayNavigatorBar
          label={fmtDay(dia)}
          selected={dia}
          minISO={addDays(todayStr(), -90)}
          todayISO={addDays(todayStr(), 90)}
          canGoPrev
          canGoNext
          isToday={dia === todayStr()}
          onPrev={() => setDia((d) => addDays(d, -1))}
          onNext={() => setDia((d) => addDays(d, 1))}
          onToday={() => setDia(todayStr())}
          onPick={(iso) => setDia(iso)}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* HOY */}
        <div className="lg:col-span-2 space-y-3">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            {dia === todayStr() ? "Qué hacer hoy" : `Qué hay para ${fmtDay(dia)}`}
          </p>
          {loading ? (
            <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Cargando…</CardContent></Card>
          ) : alerts.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <CheckCircle2 className="w-10 h-10 mx-auto text-green-500 mb-2" />
                <h3 className="font-heading text-base font-bold">Todo en orden</h3>
                <p className="text-muted-foreground text-xs">No hay tareas pendientes para este día.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {alerts.map((a) => (
                <Card key={a.key} className={toneCls[a.tone]}>
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <a.icon className={`w-4 h-4 ${toneText[a.tone]}`} />
                        <p className="font-heading font-bold text-sm uppercase tracking-wide">{a.title}</p>
                      </div>
                      <Badge variant="secondary" className="shrink-0">{a.count}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">{a.desc}</p>
                    <Button size="sm" className="w-full" onClick={() => navigate(a.to)}>
                      {a.cta} <ChevronRight className="w-3 h-3 ml-1" />
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* SEMANA */}
        <div className="space-y-3">
          <p className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1">
            <CalendarDays className="w-3.5 h-3.5" /> Próximos 7 días
          </p>
          <Card>
            <CardContent className="p-3 space-y-3">
              {Object.keys(grouped).length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">Sin pendientes agendados.</p>
              ) : (
                Object.entries(grouped).map(([fecha, its]) => (
                  <div key={fecha} className="space-y-1">
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border pb-1">
                      {fmtDay(fecha)}
                    </p>
                    {its.map((it, idx) => (
                      <button
                        key={idx}
                        onClick={() => navigate(it.to)}
                        className="w-full text-left flex items-center justify-between gap-2 px-2 py-1.5 rounded hover:bg-muted/50 transition-colors"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-medium truncate">{it.detail || it.label}</p>
                          <p className="text-[10px] text-muted-foreground">{it.label}</p>
                        </div>
                        <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />
                      </button>
                    ))}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
};

export default DepositoPanelDia;
