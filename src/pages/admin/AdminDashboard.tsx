import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
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
  Banknote, CreditCard as CardIcon, HelpCircle, Ban, Palmtree, Pause, UserPlus, ArrowRightLeft,
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "@/hooks/use-toast";
import { getEffectiveSubStatus, isAdminPayableSubscription } from "@/lib/subscriptionStatus";
import { hasSubscriptionConflict } from "@/lib/subscriptionConflicts";
import BirthdayWidget from "@/components/admin/BirthdayWidget";
import DeliveryCashWidget from "@/components/admin/DeliveryCashWidget";
import WeeklyPendingsPanel from "@/components/admin/WeeklyPendingsPanel";
import {
  AlertBucket, BUCKET_LABEL, BUCKET_ORDER, DatedAlertItem, bucketForDate, toISODate, weekDays,
} from "@/lib/adminAlerts";


interface MetricCard {
  label: string;
  value: number | string;
  icon: React.ElementType;
  color: string;
  to?: string;
  hint?: string;
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
  bucket: AlertBucket;
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
  const [datedItems, setDatedItems] = useState<DatedAlertItem[]>([]);

  const [chequeoAlerts, setChequeoAlerts] = useState({ facturas: 0, pagos: 0, bajas: 0, nuevos: 0 });
  const [duplicadosCount, setDuplicadosCount] = useState(0);
  const [solicitudesCambioCount, setSolicitudesCambioCount] = useState(0);
  const [cuotasEventos, setCuotasEventos] = useState({ count: 0, vencidas: 0, monto: 0 });


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

      // Mantiene la cola de facturación al día antes de contar "hoy" (evita mostrar
      // datos desactualizados si nadie abrió la página de Facturación recientemente).
      try {
        await supabase.rpc("rebuild_facturacion_cola" as any, {});
      } catch {
        // Si falla (p.ej. permisos), seguimos con lo que ya haya en la tabla.
      }

      const [alumnosRes, subsActivasRes, allSubsRes, allAlumnosRes, facturasPendientesRes, cuotasRes] = await Promise.all([
        supabase.from("alumnos").select("id, estado, telefono, grupo").eq("estado", "activo"),
        supabase.from("suscripciones").select("*, alumnos(id, nombre, telefono), planes(nombre, precio, categoria)").in("estado", ["activa", "conciliado"]),
        supabase.from("suscripciones").select("*, alumnos(id, nombre, telefono), planes(nombre, precio, categoria)"),
        supabase.from("alumnos").select("id, estado, grupo, created_at"),
        // Fuente única de verdad: misma tabla que usa la página real de Facturación (evita
        // el desfasaje que había contando directamente sobre `suscripciones`).
        // Acotado a HOY: la tarjeta muestra la tarea del día, no el backlog acumulado.
        supabase.from("facturacion_cola" as any).select("id", { count: "exact", head: true })
          .eq("estado", "pendiente")
          .gte("pagado_at", `${today}T00:00:00`)
          .lte("pagado_at", `${today}T23:59:59.999`),
        // Paso B: cuotas de eventos por cobrar (saldo > 0)
        supabase.from("vw_pagos_por_cobrar" as any).select("source, amount, effective_status, due_date, alumno_nombre, concepto").eq("source", "cuota_evento"),
      ]);

      const alumnos = alumnosRes.data || [];
      const subsActivasRaw = subsActivasRes.data || [];
      // Sólo subs realmente vigentes: estado activa/conciliado + fecha_fin >= hoy + no canceladas.
      // Las que tienen fecha_fin < hoy son períodos cerrados (mes anterior ya consumido) — no
      // deben contar como "activas" ni inflar el contador de duplicados.
      const subsActivas = subsActivasRaw.filter((s: any) =>
        !s.cancelada_at && (!s.fecha_fin || s.fecha_fin >= today)
      );
      const allSubs = allSubsRes.data || [];
      const allAlumnos = allAlumnosRes.data || [];
      const cuotas = (cuotasRes.data as any[]) || [];

      const alumnosActivos = alumnos.length;
      const alumnosBloqueados = allAlumnos.filter(a => a.estado === "bloqueado").length;
      const alumnosVacaciones = allAlumnos.filter(a => a.estado === "vacaciones").length;
      const alumnosInactivos = allAlumnos.filter(a => a.estado === "inactivo").length;
      const suscripcionesActivas = subsActivas.length;
      const subsPausa = allSubs.filter(s => s.estado === "pausa").length;

      // Helper: precio efectivo (respeta descuentos y overrides)
      const precioDe = (s: any) => Number(s.precio_final ?? (s.planes as any)?.precio ?? 0);

      // A1 + A3: clasificamos por estado EFECTIVO (mismo motor que ve el alumno)
      // — "Por cobrar"  = pendiente + pago_pendiente (gracia día 1-5)
      // — "Vencidos"    = vencida + acceso_pausado (post día 5, sin pago)
      const subsConEffect = allSubs
        .filter(s => !(s as any).cancelada_at && s.estado !== "cancelada")
        .map(s => ({
          s,
          eff: getEffectiveSubStatus({
            estado: s.estado,
            fecha_fin: s.fecha_fin,
            cancelada_at: (s as any).cancelada_at,
            mp_status: (s as any).mp_status,
            origen_registro: (s as any).origen_registro,
          }),
        }));

      const porCobrar = subsConEffect.filter(x => x.eff === "pendiente" || x.eff === "pago_pendiente");
      const vencidas  = subsConEffect.filter(x => x.eff === "vencida"   || x.eff === "acceso_pausado");
      const pagosPendientes = porCobrar.length;
      const pagosVencidos   = vencidas.length;

      // A2 + A5: usar precio_final y considerar 'conciliado' como cobrado
      const cobradoEsteMes = allSubs
        .filter(s => (s.estado === "activa" || s.estado === "conciliado") && s.fecha_inicio && s.fecha_inicio >= startOfMonth)
        .reduce((sum, s) => sum + precioDe(s), 0);

      const montoPendienteSubs = porCobrar.reduce((sum, x) => sum + precioDe(x.s), 0);
      const montoVencidoSubs   = vencidas.reduce((sum, x) => sum + precioDe(x.s), 0);

      // Paso B: cuotas de eventos
      const cuotasCount = cuotas.length;
      const cuotasVencidas = cuotas.filter(c => c.effective_status === "vencida").length;
      const cuotasMonto = cuotas.reduce((sum, c) => sum + Number(c.amount || 0), 0);
      setCuotasEventos({ count: cuotasCount, vencidas: cuotasVencidas, monto: cuotasMonto });

      // Duplicados reales: alumnos cuyas suscripciones vigentes violan las reglas de modalidad
      // (2+ grupales, 2+ pista, una "pausa" + cualquier otra, o "otro" duplicado exacto).
      // Renovaciones legítimas (mes anterior cerrado + mes actual) NO cuentan.
      const subsPorAlumnoArr: Record<string, any[]> = {};
      subsActivas.forEach((s: any) => {
        (subsPorAlumnoArr[s.alumno_id] ||= []).push(s);
      });
      const conMultiples = Object.values(subsPorAlumnoArr).filter(arr => hasSubscriptionConflict(arr as any)).length;
      setDuplicadosCount(conMultiples);


      setMetrics([
        { label: "Alumnos activos", value: alumnosActivos, icon: Users, color: "text-primary", to: "/admin/alumnos?filter=activos", hint: "Ver lista de alumnos activos" },
        { label: "Suscripciones activas", value: suscripcionesActivas, icon: TrendingUp, color: "text-accent", to: "/admin/pagos?estado=pagado", hint: conMultiples > 0 ? `${conMultiples} alumno(s) con conflicto de modalidad` : "Ver pagos activos" },
        { label: "Pagos pendientes", value: pagosPendientes, icon: Clock, color: "text-yellow-500", to: "/admin/pagos?estado=por_cobrar", hint: "Pendientes + gracia día 1-5" },
        { label: "Monto pendiente", value: `$${montoPendienteSubs.toLocaleString("es-AR")}`, icon: CreditCard, color: "text-yellow-500", to: "/admin/pagos?estado=por_cobrar", hint: `Subs por cobrar · vencidas: $${montoVencidoSubs.toLocaleString("es-AR")}` },
        { label: "Vacaciones", value: alumnosVacaciones, icon: Palmtree, color: "text-blue-500", to: "/admin/alumnos?filter=vacaciones", hint: "Alumnos en vacaciones" },
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

      // Pending payments with detailed status (mismo criterio que el KPI: pendiente + pago_pendiente)
      const recentPending = porCobrar
        .map(x => x.s)
        .sort((a, b) => (a.created_at > b.created_at ? -1 : 1))
        .slice(0, 10)
        .map(s => {
          const alumno = s.alumnos as any;
          const plan = s.planes as any;
          const badge = getPaymentBadge(s.estado, s.metodo_pago);
          return {
            alumno_id: s.alumno_id,
            alumno_nombre: alumno?.nombre || "—",
            alumno_telefono: alumno?.telefono || null,
            plan_nombre: plan?.nombre || "—",
            monto: Number((s as any).precio_final ?? plan?.precio ?? 0),
            fecha_inicio: s.created_at,
            estado: badge.label,
            estado_detalle: s.metodo_pago || "sin_pago",
            mp_status: s.mp_status,
            suscripcion_id: s.id,
          };
        });
      setPendingPayments(recentPending);

      // ================= ALERTAS ORGANIZADAS POR DÍA =================
      // Cada alerta se ancla a una fecha operativa y cae en un balde:
      // vencido (fecha < hoy) · hoy · semana (lun-dom en curso) · sin_fecha.
      const week = weekDays();
      const weekEnd = week[6];
      const dated: DatedAlertItem[] = [];
      const alertsList: Alert[] = [];

      // — Vencimientos de suscripciones (fecha operativa = fecha_fin)
      subsActivas
        .filter((s: any) => s.fecha_fin && s.fecha_fin >= today && s.fecha_fin <= weekEnd)
        .forEach((s: any) => {
          dated.push({
            date: s.fecha_fin.substring(0, 10),
            kind: "Vence suscripción",
            label: (s.alumnos as any)?.nombre || "Alumno",
            link: "/admin/pagos?estado=por_cobrar",
            tone: "warning",
          });
        });

      // — Subs vencidas / acceso pausado (backlog)
      vencidas.forEach((x) => {
        const s: any = x.s;
        dated.push({
          date: (s.fecha_fin || today).substring(0, 10),
          kind: "Pago vencido sin cobrar",
          label: (s.alumnos as any)?.nombre || "Alumno",
          link: "/admin/pagos?estado=vencido",
          tone: "danger",
        });
      });

      // — Cuotas de eventos (fecha operativa = due_date)
      cuotas
        .filter((c: any) => c.due_date && c.due_date <= weekEnd)
        .forEach((c: any) => {
          dated.push({
            date: c.due_date.substring(0, 10),
            kind: "Cuota de evento",
            label: c.alumno_nombre || c.concepto || "Cuota",
            link: "/admin/eventos",
            tone: c.due_date < today ? "danger" : "warning",
          });
        });

      if (pagosVencidos > 0) {
        alertsList.push({ type: "danger", icon: AlertTriangle, message: `${pagosVencidos} pago(s) vencido(s) sin cobrar`, count: pagosVencidos, link: "/admin/pagos?estado=vencido", bucket: "vencido" });
      }
      if (cuotasVencidas > 0) {
        alertsList.push({ type: "danger", icon: CalendarClock, message: `${cuotasVencidas} cuota(s) de evento vencida(s) sin cobrar`, count: cuotasVencidas, link: "/admin/eventos", bucket: "vencido" });
      }

      // Vencimientos de plan separados por día: hoy vs resto de la semana
      const venceHoy = subsActivas.filter((s: any) => s.fecha_fin && s.fecha_fin.substring(0, 10) === today).length;
      const venceSemana = subsActivas.filter(
        (s: any) => s.fecha_fin && s.fecha_fin > today && s.fecha_fin <= weekEnd
      ).length;
      const vencePronto = subsActivas.filter(
        (s: any) => s.fecha_fin && s.fecha_fin > weekEnd && s.fecha_fin <= in7Days
      ).length;
      if (venceHoy > 0) {
        alertsList.push({ type: "warning", icon: Clock, message: `${venceHoy} suscripción(es) vence(n) HOY`, count: venceHoy, link: "/admin/pagos?estado=por_cobrar", bucket: "hoy" });
      }
      if (venceSemana > 0) {
        alertsList.push({ type: "warning", icon: Clock, message: `${venceSemana} suscripción(es) vence(n) esta semana`, count: venceSemana, link: "/admin/pagos?estado=por_cobrar", bucket: "semana" });
      }
      if (vencePronto > 0) {
        alertsList.push({ type: "info", icon: Clock, message: `${vencePronto} suscripción(es) vence(n) en los próximos días`, count: vencePronto, link: "/admin/pagos?estado=por_cobrar", bucket: "sin_fecha" });
      }

      const informados = allSubs.filter(s => s.origen_registro === "informado_alumno" && s.estado === "pendiente").length;
      if (informados > 0) {
        alertsList.push({ type: "warning", icon: FileText, message: `${informados} pago(s) informado(s) sin conciliar`, count: informados, link: "/admin/pagos?estado=informado", bucket: "hoy" });
      }

      const alumnoIdsConSub = new Set(subsActivas.map(s => s.alumno_id));
      const sinPlan = alumnos.filter(a => !alumnoIdsConSub.has(a.id)).length;
      if (sinPlan > 0) {
        alertsList.push({ type: "info", icon: Users, message: `${sinPlan} alumno(s) activo(s) sin plan activo`, count: sinPlan, link: "/admin/alumnos?filter=sin_plan_activo", bucket: "sin_fecha" });
      }
      if (alumnosBloqueados > 0) {
        alertsList.push({ type: "danger", icon: Ban, message: `${alumnosBloqueados} alumno(s) bloqueado(s)`, count: alumnosBloqueados, link: "/admin/alumnos?filter=bloqueados", bucket: "vencido" });
      }
      if (alumnosVacaciones > 0) {
        alertsList.push({ type: "info", icon: Palmtree, message: `${alumnosVacaciones} alumno(s) en vacaciones`, count: alumnosVacaciones, link: "/admin/alumnos?filter=vacaciones", bucket: "sin_fecha" });
      }
      const sinGrupo = allAlumnos.filter(a => a.grupo === "Sin grupo" && a.estado === "activo").length;
      if (sinGrupo > 0) {
        alertsList.push({ type: "warning", icon: Users, message: `${sinGrupo} alumno(s) activo(s) sin grupo asignado`, count: sinGrupo, link: "/admin/alumnos?filter=sin_grupo", bucket: "sin_fecha" });
      }
      // Inconsistency detection
      const INVALID_COMBOS: [string, string][] = [["vacaciones", "activa"], ["inactivo", "activa"], ["bloqueado", "activa"]];
      const inconsistentCount = allAlumnos.filter(a => {
        const sub = allSubs.find(s => {
          if (s.alumno_id !== a.id) return false;
          const eff = getEffectiveSubStatus({ estado: s.estado, fecha_fin: s.fecha_fin, cancelada_at: (s as any).cancelada_at });
          return eff === "activa" || eff === "pausa";
        });
        if (!sub) return false;
        const effSub = getEffectiveSubStatus({ estado: sub.estado, fecha_fin: sub.fecha_fin, cancelada_at: (sub as any).cancelada_at });
        return INVALID_COMBOS.some(([u, s]) => u === a.estado && s === effSub);
      }).length;
      if (inconsistentCount > 0) {
        alertsList.push({ type: "danger", icon: AlertTriangle, message: `${inconsistentCount} alumno(s) con combinación de estados inconsistente`, count: inconsistentCount, link: "/admin/alumnos?filter=inconsistentes", bucket: "vencido" });
      }

      // Solicitudes de cambio de plan pendientes — SLA de 2 días desde la solicitud
      const { data: solicitudesData } = await supabase
        .from("solicitudes_cambio_plan" as any)
        .select("id, created_at, estado")
        .eq("estado", "pendiente");
      const solicitudes = (solicitudesData as any[]) || [];
      setSolicitudesCambioCount(solicitudes.length);
      solicitudes.forEach((sol: any) => {
        const base = new Date(sol.created_at);
        base.setDate(base.getDate() + 2);
        const iso = toISODate(base);
        if (iso <= weekEnd) {
          dated.push({
            date: iso,
            kind: "Solicitud de cambio de plan",
            label: "Responder al alumno",
            link: "/admin/solicitudes-cambio-plan",
            tone: iso < today ? "danger" : "warning",
          });
        }
      });
      if (solicitudes.length > 0) {
        const masUrgente = solicitudes
          .map((s: any) => {
            const d = new Date(s.created_at);
            d.setDate(d.getDate() + 2);
            return toISODate(d);
          })
          .sort()[0];
        alertsList.push({
          type: "warning",
          icon: ArrowRightLeft,
          message: `${solicitudes.length} solicitud(es) de cambio de plan pendiente(s) de revisión`,
          count: solicitudes.length,
          link: "/admin/solicitudes-cambio-plan",
          bucket: bucketForDate(masUrgente),
        });
      }

      setAlerts(alertsList);
      setDatedItems(dated.sort((a, b) => (a.date < b.date ? -1 : 1)));


      // Chequeo alerts (Facturas / Pagos / Bajas / Nuevos) — todas cuentan lo del DÍA DE HOY,
      // no el backlog acumulado. El backlog completo se sigue pudiendo navegar día por día
      // en cada vista ("Ver →"), yendo hacia atrás.
      const pagosACheckar = allSubs.filter((s: any) =>
        (s.estado === "activa" || s.estado === "conciliado") && !s.chequeado_admin &&
        s.created_at && s.created_at >= `${today}T00:00:00` && s.created_at <= `${today}T23:59:59.999`
      ).length;
      const facturasPendientes = facturasPendientesRes.count || 0;
      const d = new Date();
      const periodo = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const [y, m] = periodo.split("-").map(Number);
      const monthStart = `${periodo}-01`;
      const monthEnd = new Date(y, m, 0).toISOString().split("T")[0];
      const bajasDelMes = allSubs.filter((s: any) => {
        if (!s.fecha_fin || s.fecha_fin < monthStart || s.fecha_fin > monthEnd) return false;
        if (!["vencida", "cancelada"].includes(s.estado)) return false;
        const renewed = allSubs.some((o: any) => o.alumno_id === s.alumno_id && o.fecha_inicio && o.fecha_inicio > monthEnd);
        return !renewed;
      });
      const bajasPendientes = bajasDelMes.filter((s: any) => !s.baja_chequeada && s.fecha_fin === today).length;
      const nuevosHoy = allAlumnos.filter((a: any) =>
        a.created_at && a.created_at >= `${today}T00:00:00` && a.created_at <= `${today}T23:59:59.999`
      ).length;
      setChequeoAlerts({ facturas: facturasPendientes, pagos: pagosACheckar, bajas: bajasPendientes, nuevos: nuevosHoy });
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
          .update({ estado: "activa", mp_status: "conciliado", origen_registro: "cargado_admin" } as any)
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
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-heading font-bold uppercase tracking-wider">Resumen</h1>
        <Link to="/admin/procesos/plantillas">
          <Button variant="outline" size="sm">
            <FileText className="w-4 h-4 mr-1" /> Plantillas de procesos
          </Button>
        </Link>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {metrics.map((m) => {
          const inner = (
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <m.icon className={`w-4 h-4 ${m.color}`} />
                <span className="text-xs text-muted-foreground truncate">{m.label}</span>
              </div>
              <p className="text-xl font-bold font-heading">{m.value}</p>
              {m.hint && <p className="text-[10px] text-muted-foreground mt-1 truncate">{m.hint}</p>}
            </CardContent>
          );
          return m.to ? (
            <Link key={m.label} to={m.to} className="block">
              <Card className="border-border hover:border-primary/50 hover:bg-muted/30 transition-colors cursor-pointer h-full">
                {inner}
              </Card>
            </Link>
          ) : (
            <Card key={m.label} className="border-border">{inner}</Card>
          );
        })}
      </div>

      {/* Aviso de inconsistencia alumnos vs suscripciones */}
      {duplicadosCount > 0 && (
        <Link
          to="/admin/alumnos?filter=multi_subs"
          className="flex items-center gap-3 rounded-md border border-blue-500/40 bg-blue-500/5 hover:bg-blue-500/10 p-3 transition-colors"
        >
          <AlertTriangle className="w-5 h-5 shrink-0 text-blue-500" />
          <div className="flex-1 text-sm">
            <span className="font-medium">{duplicadosCount} alumno(s) con más de una suscripción activa</span>
            <p className="text-xs text-muted-foreground">Esto explica que haya más suscripciones que alumnos activos. Ver detalle →</p>
          </div>
        </Link>
      )}


      {/* Alertas de chequeo (Facturas / Pagos / Bajas / Nuevos) — tareas de HOY */}
      <div className="space-y-2">
        <p className="text-xs font-heading uppercase tracking-wider text-muted-foreground">Tareas de hoy</p>
        {[
          { label: "Facturas por realizar", count: chequeoAlerts.facturas, icon: FileText, to: "/admin/facturacion/por-dia", hint: "Subs cobradas hoy sin factura emitida", tone: "border-yellow-500/40 bg-yellow-500/5 hover:bg-yellow-500/10 text-yellow-500" },
          { label: "Pagos a chequear", count: chequeoAlerts.pagos, icon: CreditCard, to: "/admin/pagos/por-dia", hint: "Pagos de hoy a conciliar", tone: "border-orange-500/40 bg-orange-500/5 hover:bg-orange-500/10 text-orange-500" },
          { label: "Bajas a chequear", count: chequeoAlerts.bajas, icon: AlertTriangle, to: "/admin/bajas/por-dia", hint: "Alumnos que vencen hoy sin renovar", tone: "border-destructive/50 bg-destructive/10 hover:bg-destructive/20 text-destructive" },
          { label: "Nuevos usuarios", count: chequeoAlerts.nuevos, icon: UserPlus, to: "/admin/alumnos/nuevos-por-dia", hint: "Registrados hoy", tone: "border-emerald-500/40 bg-emerald-500/5 hover:bg-emerald-500/10 text-emerald-500" },
        ].map((a) => (
          <Link key={a.label} to={a.to} className={`group flex items-center justify-between gap-3 border rounded-lg px-4 py-3 transition-colors ${a.tone}`}>
            <div className="flex items-center gap-3 min-w-0">
              <a.icon className="w-4 h-4 shrink-0" />
              <span className="text-2xl font-heading font-bold tabular-nums w-10 text-right">{a.count}</span>
              <div className="min-w-0">
                <div className="text-[11px] font-heading uppercase tracking-wider truncate">{a.label}</div>
                <p className="text-[11px] text-muted-foreground truncate">
                  {a.count === 0 ? "Todo al día" : a.hint}
                </p>
              </div>
            </div>
            <span className="text-xs opacity-70 group-hover:opacity-100 shrink-0">Ver →</span>
          </Link>
        ))}
      </div>

      {/* Cumpleaños */}
      <BirthdayWidget />

      {/* Tienda / Entregas - Caja abierta */}
      <DeliveryCashWidget />

      {/* Alertas operativas agrupadas por urgencia + pendientes de la semana */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        <div className="lg:col-span-2 space-y-4">
          {BUCKET_ORDER.map((bucket) => {
            const group = alerts.filter((a) => a.bucket === bucket);
            if (group.length === 0) return null;
            return (
              <div key={bucket} className="space-y-2">
                <p className="text-xs font-heading uppercase tracking-wider text-muted-foreground">
                  {BUCKET_LABEL[bucket]}
                </p>
                {group.map((a, i) => (
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
            );
          })}
          {!loading && alerts.length === 0 && (
            <p className="text-sm text-muted-foreground">Sin alertas abiertas. Todo al día.</p>
          )}
        </div>

        <WeeklyPendingsPanel items={datedItems} loading={loading} />
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
