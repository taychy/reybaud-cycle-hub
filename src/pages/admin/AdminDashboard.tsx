import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Users, TrendingUp, FileText, ArrowRightLeft, CalendarClock,
  CreditCard, Store, Wallet, ArrowRight,
} from "lucide-react";

/**
 * Resumen operativo — versión liviana (reducción de carga de base).
 *
 * Sólo consulta contadores (`count: "exact", head: true`) y no descarga
 * colecciones completas ni ejecuta mantenimiento al abrir la pantalla.
 * Los paneles pesados (resumen financiero del mes, calendario operativo,
 * cumpleaños, caja de entregas) siguen existiendo en sus módulos originales
 * y se acceden desde los accesos rápidos de abajo.
 */

interface Counter {
  label: string;
  value: number | null;
  hint: string;
  icon: React.ElementType;
  color: string;
  to: string;
}

const AdminDashboard = () => {
  const [loading, setLoading] = useState(true);
  const [alumnosActivos, setAlumnosActivos] = useState<number | null>(null);
  const [subsActivas, setSubsActivas] = useState<number | null>(null);
  const [facturasHoy, setFacturasHoy] = useState<number | null>(null);
  const [solicitudesCambio, setSolicitudesCambio] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const today = new Date().toISOString().split("T")[0];
      try {
        const [alumnosRes, subsRes, facturasRes, solicitudesRes] = await Promise.all([
          supabase.from("alumnos").select("id", { count: "exact", head: true }).eq("estado", "activo"),
          // Mismo criterio conservador que se venía usando: estados vigentes,
          // no cancelada y período no cerrado.
          supabase
            .from("suscripciones")
            .select("id", { count: "exact", head: true })
            .in("estado", ["activa", "conciliado"])
            .is("cancelada_at", null)
            .or(`fecha_fin.is.null,fecha_fin.gte.${today}`),
          supabase
            .from("facturacion_cola" as any)
            .select("id", { count: "exact", head: true })
            .eq("estado", "pendiente")
            .gte("pagado_at", `${today}T00:00:00`)
            .lte("pagado_at", `${today}T23:59:59.999`),
          supabase
            .from("solicitudes_cambio_plan" as any)
            .select("id", { count: "exact", head: true })
            .eq("estado", "pendiente"),
        ]);
        if (!alive) return;
        setAlumnosActivos(alumnosRes.count ?? null);
        setSubsActivas(subsRes.count ?? null);
        setFacturasHoy(facturasRes.count ?? null);
        setSolicitudesCambio(solicitudesRes.count ?? null);
      } catch (err) {
        console.error("Error loading dashboard counters:", err);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const counters: Counter[] = [
    {
      label: "Alumnos activos", value: alumnosActivos, hint: "Ver lista de alumnos activos",
      icon: Users, color: "text-primary", to: "/admin/alumnos?filter=activos",
    },
    {
      label: "Suscripciones activas", value: subsActivas, hint: "Vigentes hoy",
      icon: TrendingUp, color: "text-accent", to: "/admin/pagos?estado=pagado",
    },
    {
      label: "Facturas por emitir", value: facturasHoy, hint: "Pagos cobrados hoy",
      icon: FileText, color: "text-blue-500", to: "/admin/facturacion/por-dia",
    },
    {
      label: "Cambios de plan", value: solicitudesCambio, hint: "Solicitudes pendientes",
      icon: ArrowRightLeft, color: "text-yellow-500", to: "/admin/alumnos?tab=cambios-plan",
    },
  ];

  const accesos = [
    { label: "Pagos y cobranzas", desc: "Por cobrar, vencidos y conciliación", icon: CreditCard, to: "/admin/pagos" },
    { label: "Agenda", desc: "Clases, turnos y disponibilidad", icon: CalendarClock, to: "/admin/agenda" },
    { label: "Facturación", desc: "Cola del día y facturas emitidas", icon: FileText, to: "/admin/facturacion" },
    { label: "Tienda y entregas", desc: "Pedidos, caja y listas de entrega", icon: Store, to: "/admin/entregas" },
    { label: "Gastos y finanzas", desc: "Cómo viene el mes y pagos previstos", icon: Wallet, to: "/admin/gastos" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-heading font-bold uppercase tracking-wider">Resumen operativo</h1>
          <span className="hidden sm:inline-flex items-center gap-1 text-xs text-muted-foreground border border-border rounded-full px-2 py-0.5">
            <CalendarClock className="w-3 h-3" />
            {new Date().toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "numeric" })}
          </span>
        </div>
        <Link to="/admin/procesos/plantillas">
          <Button variant="outline" size="sm">
            <FileText className="w-4 h-4 mr-1" /> Plantillas de procesos
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {counters.map((c) => (
          <Link key={c.label} to={c.to} className="block">
            <Card className="border-border hover:border-primary/50 transition-colors h-full">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <c.icon className={`w-4 h-4 ${c.color}`} />
                  <span className="text-xs text-muted-foreground truncate">{c.label}</span>
                </div>
                <p className="text-2xl font-heading font-bold tabular-nums">
                  {loading ? "…" : (c.value ?? "—")}
                </p>
                <p className="text-[10px] text-muted-foreground mt-1 truncate">{c.hint}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-heading uppercase tracking-wider">Accesos rápidos</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {accesos.map((a) => (
            <Link
              key={a.to}
              to={a.to}
              className="flex items-center gap-3 rounded-md border border-border/60 hover:border-primary/50 hover:bg-muted/30 transition-colors px-3 py-2.5"
            >
              <a.icon className="w-4 h-4 text-primary shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{a.label}</p>
                <p className="text-[11px] text-muted-foreground truncate">{a.desc}</p>
              </div>
              <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            </Link>
          ))}
        </CardContent>
      </Card>

      <p className="text-[11px] text-muted-foreground">
        Panel simplificado temporalmente para reducir la carga del sistema. El detalle completo sigue
        disponible en cada sección.
      </p>
    </div>
  );
};

export default AdminDashboard;
