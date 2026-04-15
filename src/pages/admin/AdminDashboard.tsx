import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Users, CreditCard, AlertTriangle, Clock, DollarSign, TrendingUp,
  Eye, Send, CalendarClock, CheckCircle, FileText, MessageCircle,
  Banknote, CreditCard as CardIcon, HelpCircle, Ban, Palmtree, Pause,
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "@/hooks/use-toast";

interface MetricCard {
  label: string;
  value: number | string;
  icon: React.ElementType;
  color: string;
}

interface UpcomingExpiration {
  alumno_id: string;
  alumno_nombre: string;
  alumno_telefono: string | null;
  plan_nombre: string;
  fecha_fin: string;
  monto: number;
  estado: string;
  suscripcion_id: string;
}

interface PendingPayment {
  alumno_id: string;
  alumno_nombre: string;
  alumno_telefono: string | null;
  plan_nombre: string;
  monto: number;
  fecha_inicio: string;
  estado: string;
  estado_detalle: string;
  mp_status: string | null;
  suscripcion_id: string;
}

interface Alert {
  type: "danger" | "warning" | "info";
  icon: React.ElementType;
  message: string;
  count: number;
  link: string;
}

// Payment status helpers
const getPaymentBadge = (estado: string, mpStatus: string | null) => {
  if (mpStatus === "informado") {
    return { label: "Informado", variant: "outline" as const, icon: FileText, className: "border-blue-500 text-blue-500" };
  }
  if (mpStatus === "efectivo_informado") {
    return { label: "Efectivo", variant: "outline" as const, icon: Banknote, className: "border-green-500 text-green-500" };
  }
  if (mpStatus === "externo_informado") {
    return { label: "Pago externo", variant: "outline" as const, icon: CardIcon, className: "border-purple-500 text-purple-500" };
  }
  return { label: "Pendiente", variant: "secondary" as const, icon: HelpCircle, className: "" };
};

const formatWhatsAppUrl = (telefono: string | null, nombre?: string) => {
  if (!telefono) return null;
  let clean = telefono.replace(/\D/g, "");
  // Asegurar formato internacional para Argentina
  if (clean.startsWith("15")) clean = "549" + clean.slice(2);
  else if (clean.startsWith("11") || clean.startsWith("0")) {
    if (clean.startsWith("0")) clean = clean.slice(1);
    clean = "549" + clean;
  } else if (!clean.startsWith("54")) {
    clean = "549" + clean;
  }
  const msg = nombre
    ? encodeURIComponent(`Hola ${nombre}, te contactamos desde Reybaud Ciclismo.`)
    : encodeURIComponent("Hola");
  return `https://wa.me/${clean}?text=${msg}`;
};

const AdminDashboard = () => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<MetricCard[]>([]);
  const [expirations, setExpirations] = useState<UpcomingExpiration[]>([]);
  const [pendingPayments, setPendingPayments] = useState<PendingPayment[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);

  // Confirmation dialog state
  const [confirmAction, setConfirmAction] = useState<{
    title: string;
    description: string;
    onConfirm: () => Promise<void>;
  } | null>(null);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    setLoading(true);
    try {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
      const today = now.toISOString().split("T")[0];
      const in7Days = new Date(now.getTime() + 7 * 86400000).toISOString().split("T")[0];

      const [alumnosRes, subsActivasRes, allSubsRes, allAlumnosRes] = await Promise.all([
        supabase.from("alumnos").select("id, estado, telefono, grupo").eq("estado", "activo"),
        supabase.from("suscripciones").select("*, alumnos(id, nombre, telefono), planes(nombre, precio)").eq("estado", "activa"),
        supabase.from("suscripciones").select("*, alumnos(id, nombre, telefono), planes(nombre, precio)"),
        supabase.from("alumnos").select("id, estado, grupo"),
      ]);

      const alumnos = alumnosRes.data || [];
      const subsActivas = subsActivasRes.data || [];
      const allSubs = allSubsRes.data || [];
      const allAlumnos = allAlumnosRes.data || [];

      const alumnosActivos = alumnos.length;
      const alumnosBloqueados = allAlumnos.filter(a => a.estado === "bloqueado").length;
      const alumnosVacaciones = allAlumnos.filter(a => a.estado === "vacaciones").length;
      const alumnosInactivos = allAlumnos.filter(a => a.estado === "inactivo").length;
      const suscripcionesActivas = subsActivas.length;
      const subsPausa = allSubs.filter(s => s.estado === "pausa").length;
      const pendientes = allSubs.filter(s => s.estado === "pendiente");
      const pagosPendientes = pendientes.length;

      // Only count as "vencido" subscriptions that are truly unpaid:
      // - fecha_fin expired
      // - estado is pendiente or vencida
      // - mp_status indicates no payment was made (not manual/conciliado/approved)
      const PAID_STATUSES = ["manual", "conciliado", "approved", "efectivo_informado", "externo_informado", "informado"];
      const vencidas = allSubs.filter(s => {
        if (!s.fecha_fin) return false;
        return s.fecha_fin < today && s.estado !== "cancelada";
      });
      const pagosVencidos = vencidas.filter(s =>
        (s.estado === "pendiente" || s.estado === "vencida") &&
        !PAID_STATUSES.includes(s.mp_status || "")
      ).length;

      const cobradoEsteMes = allSubs
        .filter(s => s.estado === "activa" && s.fecha_inicio && s.fecha_inicio >= startOfMonth)
        .reduce((sum, s) => sum + ((s.planes as any)?.precio || 0), 0);

      const montoPendiente = pendientes.reduce((sum, s) => sum + ((s.planes as any)?.precio || 0), 0);

      setMetrics([
        { label: "Alumnos activos", value: alumnosActivos, icon: Users, color: "text-primary" },
        { label: "Suscripciones activas", value: suscripcionesActivas, icon: TrendingUp, color: "text-accent" },
        { label: "Pagos pendientes", value: pagosPendientes, icon: Clock, color: "text-yellow-500" },
        { label: "Pagos vencidos", value: pagosVencidos, icon: AlertTriangle, color: "text-destructive" },
        { label: "Cobrado este mes", value: `$${cobradoEsteMes.toLocaleString("es-AR")}`, icon: DollarSign, color: "text-green-500" },
        { label: "Monto pendiente", value: `$${montoPendiente.toLocaleString("es-AR")}`, icon: CreditCard, color: "text-yellow-500" },
        { label: "Bloqueados", value: alumnosBloqueados, icon: Ban, color: "text-destructive" },
        { label: "Vacaciones", value: alumnosVacaciones, icon: Palmtree, color: "text-blue-500" },
        { label: "Inactivos", value: alumnosInactivos, icon: Users, color: "text-muted-foreground" },
        { label: "Subs. en pausa", value: subsPausa, icon: Pause, color: "text-blue-500" },
      ]);

      // Upcoming expirations
      const in30Days = new Date(now.getTime() + 30 * 86400000).toISOString().split("T")[0];
      const upcoming = subsActivas
        .filter(s => s.fecha_fin && s.fecha_fin >= today && s.fecha_fin <= in30Days)
        .sort((a, b) => (a.fecha_fin! > b.fecha_fin! ? 1 : -1))
        .slice(0, 10)
        .map(s => {
          const alumno = s.alumnos as any;
          const plan = s.planes as any;
          const daysLeft = Math.ceil((new Date(s.fecha_fin!).getTime() - now.getTime()) / 86400000);
          return {
            alumno_id: s.alumno_id,
            alumno_nombre: alumno?.nombre || "—",
            alumno_telefono: alumno?.telefono || null,
            plan_nombre: plan?.nombre || "—",
            fecha_fin: s.fecha_fin!,
            monto: plan?.precio || 0,
            estado: daysLeft <= 7 ? "Por vencer" : "Activa",
            suscripcion_id: s.id,
          };
        });
      setExpirations(upcoming);

      // Pending payments with detailed status
      const recentPending = pendientes
        .sort((a, b) => (a.created_at > b.created_at ? -1 : 1))
        .slice(0, 10)
        .map(s => {
          const alumno = s.alumnos as any;
          const plan = s.planes as any;
          const badge = getPaymentBadge(s.estado, s.mp_status);
          return {
            alumno_id: s.alumno_id,
            alumno_nombre: alumno?.nombre || "—",
            alumno_telefono: alumno?.telefono || null,
            plan_nombre: plan?.nombre || "—",
            monto: plan?.precio || 0,
            fecha_inicio: s.created_at,
            estado: badge.label,
            estado_detalle: s.mp_status || "sin_pago",
            mp_status: s.mp_status,
            suscripcion_id: s.id,
          };
        });
      setPendingPayments(recentPending);

      // Alerts
      const alertsList: Alert[] = [];
      if (pagosVencidos > 0) {
        alertsList.push({ type: "danger", icon: AlertTriangle, message: `${pagosVencidos} pago(s) vencido(s) sin cobrar`, count: pagosVencidos, link: "/admin/pagos?estado=vencido" });
      }
      const porVencer = subsActivas.filter(s => s.fecha_fin && s.fecha_fin >= today && s.fecha_fin <= in7Days).length;
      if (porVencer > 0) {
        alertsList.push({ type: "warning", icon: Clock, message: `${porVencer} suscripción(es) vence(n) en los próximos 7 días`, count: porVencer, link: "/admin/pagos?estado=por_cobrar" });
      }
      const alumnoIdsConSub = new Set(subsActivas.map(s => s.alumno_id));
      const sinPlan = alumnos.filter(a => !alumnoIdsConSub.has(a.id)).length;
      if (sinPlan > 0) {
        alertsList.push({ type: "info", icon: Users, message: `${sinPlan} alumno(s) activo(s) sin plan activo`, count: sinPlan, link: "/admin/alumnos" });
      }
      const informados = allSubs.filter(s => (s.mp_status === "informado" || s.mp_status === "efectivo_informado" || s.mp_status === "externo_informado") && s.estado === "pendiente").length;
      if (informados > 0) {
        alertsList.push({ type: "warning", icon: FileText, message: `${informados} pago(s) informado(s) sin conciliar`, count: informados, link: "/admin/pagos?estado=informado" });
      }
      if (alumnosBloqueados > 0) {
        alertsList.push({ type: "danger", icon: Ban, message: `${alumnosBloqueados} alumno(s) bloqueado(s)`, count: alumnosBloqueados, link: "/admin/alumnos" });
      }
      if (alumnosVacaciones > 0) {
        alertsList.push({ type: "info", icon: Palmtree, message: `${alumnosVacaciones} alumno(s) en vacaciones`, count: alumnosVacaciones, link: "/admin/alumnos" });
      }
      const sinGrupo = allAlumnos.filter(a => a.grupo === "Sin grupo" && a.estado === "activo").length;
      if (sinGrupo > 0) {
        alertsList.push({ type: "warning", icon: Users, message: `${sinGrupo} alumno(s) activo(s) sin grupo asignado`, count: sinGrupo, link: "/admin/alumnos" });
      }
      // Inconsistency detection
      const INVALID_COMBOS: [string, string][] = [["vacaciones", "activa"], ["inactivo", "activa"], ["bloqueado", "activa"]];
      const inconsistentCount = allAlumnos.filter(a => {
        const sub = allSubs.find(s => s.alumno_id === a.id && (s.estado === "activa" || s.estado === "pausa"));
        return sub ? INVALID_COMBOS.some(([u, s]) => u === a.estado && s === sub.estado) : false;
      }).length;
      if (inconsistentCount > 0) {
        alertsList.push({ type: "danger", icon: AlertTriangle, message: `${inconsistentCount} alumno(s) con combinación de estados inconsistente`, count: inconsistentCount, link: "/admin/alumnos" });
      }
      setAlerts(alertsList);
    } catch (err) {
      console.error("Error loading dashboard:", err);
    } finally {
      setLoading(false);
    }
  };

  const requestMarkPaid = (suscripcionId: string, alumnoNombre: string) => {
    setConfirmAction({
      title: "Confirmar cobro",
      description: `¿Estás seguro de marcar como cobrado el pago de ${alumnoNombre}? Esta acción activará su suscripción.`,
      onConfirm: async () => {
        const { error } = await supabase
          .from("suscripciones")
          .update({ estado: "activa", mp_status: "conciliado" } as any)
          .eq("id", suscripcionId);
        if (error) {
          toast({ title: "Error", description: error.message, variant: "destructive" });
        } else {
          // Log action
          const { data: { session } } = await supabase.auth.getSession();
          if (session) {
            await supabase.from("audit_log").insert({
              user_id: session.user.id,
              user_email: session.user.email,
              user_role: "admin",
              action: "marcar_pagado",
              entity_type: "suscripcion",
              entity_id: suscripcionId,
              details: { alumno: alumnoNombre },
            } as any);
          }
          toast({ title: "Pago marcado como cobrado" });
          loadDashboard();
        }
        setConfirmAction(null);
      },
    });
  };

  const openWhatsApp = (telefono: string | null, nombre: string) => {
    const url = formatWhatsAppUrl(telefono, nombre);
    if (!url) {
      toast({ title: "Sin teléfono", description: `${nombre} no tiene número de teléfono registrado.`, variant: "destructive" });
      return;
    }
    window.open(url, "_blank");
  };

  const alertColorMap: Record<string, string> = {
    danger: "border-destructive/50 bg-destructive/10",
    warning: "border-yellow-500/50 bg-yellow-500/10",
    info: "border-accent/50 bg-accent/10",
  };
  const alertIconColorMap: Record<string, string> = {
    danger: "text-destructive",
    warning: "text-yellow-500",
    info: "text-accent",
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-pulse text-muted-foreground">Cargando dashboard...</div>
      </div>
    );
  }

  const PaymentBadgeComponent = ({ mpStatus }: { mpStatus: string | null }) => {
    const badge = getPaymentBadge("pendiente", mpStatus);
    const Icon = badge.icon;
    return (
      <Badge variant={badge.variant} className={`text-xs gap-1 ${badge.className}`}>
        <Icon className="w-3 h-3" />
        {badge.label}
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-heading font-bold uppercase tracking-wider">Resumen</h1>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {metrics.map((m) => (
          <Card key={m.label} className="border-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <m.icon className={`w-4 h-4 ${m.color}`} />
                <span className="text-xs text-muted-foreground truncate">{m.label}</span>
              </div>
              <p className="text-xl font-bold font-heading">{m.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Alertas operativas - clickable */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((a, i) => (
            <div
              key={i}
              onClick={() => navigate(a.link)}
              className={`flex items-center gap-3 rounded-md border p-3 cursor-pointer transition-opacity hover:opacity-80 ${alertColorMap[a.type]}`}
            >
              <a.icon className={`w-5 h-5 shrink-0 ${alertIconColorMap[a.type]}`} />
              <span className="text-sm flex-1">{a.message}</span>
              <span className="text-xs text-muted-foreground">Ver →</span>
            </div>
          ))}
        </div>
      )}

      {/* Two blocks */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* A. Próximos vencimientos */}
        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-heading uppercase tracking-wider flex items-center gap-2">
              <CalendarClock className="w-4 h-4 text-primary" />
              Próximos vencimientos
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {expirations.length === 0 ? (
              <p className="text-muted-foreground text-sm p-6 pt-0">No hay vencimientos próximos.</p>
            ) : isMobile ? (
              <div className="space-y-2 px-4 pb-4">
                {expirations.map((e) => (
                  <div key={e.suscripcion_id} className="rounded-md border border-border p-3 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm cursor-pointer hover:text-primary hover:underline transition-colors" onClick={() => navigate(`/admin/alumnos?buscar=${encodeURIComponent(e.alumno_nombre)}`)}>{e.alumno_nombre}</span>
                      <Badge variant={e.estado === "Por vencer" ? "destructive" : "secondary"} className="text-xs">{e.estado}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{e.plan_nombre} · ${e.monto.toLocaleString("es-AR")}</p>
                    <p className="text-xs text-muted-foreground">Vence: {new Date(e.fecha_fin).toLocaleDateString("es-AR")}</p>
                    <div className="flex gap-2 pt-1">
                      <Button size="sm" variant="ghost" className="text-xs h-7" onClick={() => openWhatsApp(e.alumno_telefono, e.alumno_nombre)}>
                        <MessageCircle className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Alumno</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Vencimiento</TableHead>
                    <TableHead>Monto</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Acción</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expirations.map((e) => (
                    <TableRow key={e.suscripcion_id}>
                      <TableCell className="font-medium">
                        <span className="cursor-pointer hover:text-primary hover:underline transition-colors" onClick={() => navigate(`/admin/alumnos?buscar=${encodeURIComponent(e.alumno_nombre)}`)}>
                          {e.alumno_nombre}
                        </span>
                      </TableCell>
                      <TableCell>{e.plan_nombre}</TableCell>
                      <TableCell>{new Date(e.fecha_fin).toLocaleDateString("es-AR")}</TableCell>
                      <TableCell>${e.monto.toLocaleString("es-AR")}</TableCell>
                      <TableCell>
                        <Badge variant={e.estado === "Por vencer" ? "destructive" : "secondary"}>{e.estado}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" title="Ver detalle"><Eye className="w-4 h-4" /></Button>
                          <Button variant="ghost" size="icon" title="Contactar por WhatsApp" onClick={() => openWhatsApp(e.alumno_telefono, e.alumno_nombre)}>
                            <MessageCircle className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* B. Pagos pendientes */}
        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-heading uppercase tracking-wider flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-yellow-500" />
              Pagos pendientes
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {pendingPayments.length === 0 ? (
              <p className="text-muted-foreground text-sm p-6 pt-0">No hay pagos pendientes.</p>
            ) : isMobile ? (
              <div className="space-y-2 px-4 pb-4">
                {pendingPayments.map((p) => (
                  <div key={p.suscripcion_id} className="rounded-md border border-border p-3 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm cursor-pointer hover:text-primary hover:underline transition-colors" onClick={() => navigate(`/admin/alumnos?buscar=${encodeURIComponent(p.alumno_nombre)}`)}>{p.alumno_nombre}</span>
                      <PaymentBadgeComponent mpStatus={p.mp_status} />
                    </div>
                    <p className="text-xs text-muted-foreground">{p.plan_nombre} · ${p.monto.toLocaleString("es-AR")}</p>
                    <div className="flex gap-2 pt-1">
                      <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => requestMarkPaid(p.suscripcion_id, p.alumno_nombre)}>
                        <CheckCircle className="w-3 h-3 mr-1" /> Cobrado
                      </Button>
                      <Button size="sm" variant="ghost" className="text-xs h-7" onClick={() => openWhatsApp(p.alumno_telefono, p.alumno_nombre)}>
                        <MessageCircle className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Alumno</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Monto</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Acción</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingPayments.map((p) => (
                    <TableRow key={p.suscripcion_id}>
                      <TableCell className="font-medium">
                        <span className="cursor-pointer hover:text-primary hover:underline transition-colors" onClick={() => navigate(`/admin/alumnos?buscar=${encodeURIComponent(p.alumno_nombre)}`)}>
                          {p.alumno_nombre}
                        </span>
                      </TableCell>
                      <TableCell>{p.plan_nombre}</TableCell>
                      <TableCell>${p.monto.toLocaleString("es-AR")}</TableCell>
                      <TableCell>{new Date(p.fecha_inicio).toLocaleDateString("es-AR")}</TableCell>
                      <TableCell>
                        <PaymentBadgeComponent mpStatus={p.mp_status} />
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" title="Marcar como pagado" onClick={() => requestMarkPaid(p.suscripcion_id, p.alumno_nombre)}>
                            <CheckCircle className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" title="Contactar por WhatsApp" onClick={() => openWhatsApp(p.alumno_telefono, p.alumno_nombre)}>
                            <MessageCircle className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>


      {/* Confirmation Dialog */}
      <AlertDialog open={!!confirmAction} onOpenChange={(open) => { if (!open) setConfirmAction(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmAction?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirmAction?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmAction?.onConfirm()}>Confirmar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminDashboard;
