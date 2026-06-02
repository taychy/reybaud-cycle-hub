import { useState, useEffect, useMemo, Fragment } from "react";
import { formatPrice } from "@/lib/currency";
import { PAYMENT_METHODS, getPaymentMethodLabel } from "@/lib/paymentMethods";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Search, Filter, CheckCircle, Eye, Pencil, Send, CreditCard,
  FileText, Bell, RefreshCw, X, DollarSign, Clock, AlertTriangle, CheckCheck,
  ChevronDown, ChevronUp, ArrowUp, ArrowDown, ArrowUpDown
} from "lucide-react";
import { RegisterPaymentModal } from "@/components/admin/RegisterPaymentModal";
import { BillingInvoiceLauncher } from "@/components/admin/BillingInvoiceLauncher";
import { getEffectiveSubStatus } from "@/lib/subscriptionStatus";

type Suscripcion = {
  id: string;
  alumno_id: string;
  plan_id: string;
  estado: string;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  mp_status: string | null;
  mp_payment_id: string | null;
  metodo_pago: string;
  origen_registro: string;
  notas: string | null;
  created_at: string;
  updated_at: string;
  auto_renovacion: boolean;
  auto_cobro_activo?: boolean | null;
  mp_preapproval_id?: string | null;
  mp_preapproval_status?: string | null;
  chequeado_admin?: boolean;
  chequeado_admin_at?: string | null;

  alumnos: {
    id: string;
    nombre: string;
    apellido: string | null;
    email: string;
    telefono: string | null;
    sede_id: string | null;
  } | null;
  planes: {
    id: string;
    nombre: string;
    precio: number;
    moneda: string;
    frecuencia: string;
  } | null;
};

type ManualPaymentData = {
  observaciones: string;
  metodo: string;
  fecha_pago: string;
  fecha_fin: string;
};

const ESTADO_MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  activa: { label: "Pagado", variant: "default" },
  pendiente: { label: "Por cobrar", variant: "secondary" },
  pendiente_verificacion: { label: "Informado", variant: "outline" },
  conciliado: { label: "Conciliado", variant: "default" },
  vencida: { label: "Vencido", variant: "destructive" },
  cancelada: { label: "Cancelado", variant: "destructive" },
};

const PAID_ORIGEN = ["automatico", "cargado_admin"];



const getPaymentStatus = (sub: Suscripcion): string => {
  // 1) Cancelada → cancelado (independiente del cálculo efectivo)
  if (sub.estado === "cancelada") return "cancelado";
  if (sub.estado === "conciliado") return "conciliado";

  // 2) Caso especial: vencida con origen "pagado" (cobro confirmado pero período vencido)
  //    se sigue contando como pagado dentro de su período. La aplicación del período
  //    se hace por separado en el KPI.
  if (sub.estado === "vencida" && PAID_ORIGEN.includes(sub.origen_registro)) return "pagado";

  // 3) Para el resto, usamos getEffectiveSubStatus (mismo motor que ve el alumno)
  const eff = getEffectiveSubStatus({
    estado: sub.estado,
    fecha_fin: sub.fecha_fin,
    cancelada_at: null, // ya manejamos cancelada arriba
  });

  switch (eff) {
    case "activa": return "pagado";
    case "pendiente_verificacion": return "informado";
    case "pendiente": return "por_cobrar";
    case "pago_pendiente": return "por_cobrar"; // día 1-5 del mes siguiente: gracia
    case "acceso_pausado": return "vencido";    // después del día 5 sin pago
    case "vencida": return "vencido";
    case "cancelada": return "cancelado";
    case "pausa": return "cancelado";
    default: return eff;
  }
};

// "YYYY-MM" del mes actual para default del filtro de período
const currentPeriodKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

// Devuelve true si la sub pertenece al período (mes) elegido. "all" = sin filtro.
// Una sub pertenece al período si su cobertura (fecha_fin/fecha_inicio) cae ahí,
// O si fue creada/registrada ese mes (cubre pagos adelantados del próximo período).
const subInPeriod = (sub: Suscripcion, periodo: string): boolean => {
  if (periodo === "all") return true;
  const coverage = sub.fecha_fin || sub.fecha_inicio;
  if (coverage && coverage.substring(0, 7) === periodo) return true;
  const created = sub.created_at ? sub.created_at.substring(0, 7) : null;
  if (created && created === periodo) return true;
  return false;
};

const getStatusBadge = (status: string) => {
  const map: Record<string, { label: string; className: string }> = {
    pagado: { label: "Pagado", className: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30" },
    por_cobrar: { label: "Por cobrar", className: "bg-amber-500/15 text-amber-700 border-amber-500/30" },
    informado: { label: "Informado", className: "bg-blue-500/15 text-blue-700 border-blue-500/30" },
    conciliado: { label: "Conciliado", className: "bg-teal-500/15 text-teal-700 border-teal-500/30" },
    vencido: { label: "Vencido", className: "bg-red-500/15 text-red-700 border-red-500/30" },
    cancelado: { label: "Cancelado", className: "bg-muted text-muted-foreground border-border" },
  };
  const info = map[status] || { label: status, className: "" };
  return <Badge variant="outline" className={info.className}>{info.label}</Badge>;
};

const getMethodDisplay = (sub: Suscripcion) => {
  const methodLabel = getPaymentMethodLabel(sub.metodo_pago);

  // "Otro" detail: extract free text from notas if present
  const isOtro = (sub.metodo_pago || "").toLowerCase() === "otro";
  const otherDetail = (() => {
    if (!isOtro || !sub.notas) return null;
    const m = sub.notas.match(/Otro medio informado por alumno:\s*(.+)/i);
    return m ? m[1].trim() : sub.notas.trim();
  })();

  // Detect auto-renewal pending charge (created by cron, no payment yet)
  const isAutoRenewalPending =
    sub.origen_registro === "automatico" &&
    sub.estado === "pendiente" &&
    !(sub as any).mp_payment_id &&
    ((sub.metodo_pago || "").toLowerCase() === "pendiente" ||
      (sub.metodo_pago || "").toLowerCase() === "efectivo");

  if (isAutoRenewalPending) {
    return { method: "Renovación automática", origin: "Pendiente de cobro" };
  }

  // Primary line: WHO reported the payment (= origin)
  const originPrimaryMap: Record<string, string> = {
    automatico: "Mercado Pago (automático)",
    informado_alumno: "Informado por alumno",
    cargado_admin: "Cargado por admin",
  };
  const primary = originPrimaryMap[sub.origen_registro] || methodLabel;

  // Secondary line: HOW (the actual medium)
  let secondary: string;
  if (sub.origen_registro === "automatico") {
    secondary = "Pasarela MP";
  } else if (isOtro && otherDetail) {
    secondary = `Otro: ${otherDetail}`;
  } else {
    secondary = methodLabel;
  }

  return { method: primary, origin: secondary };
};

// formatPrice imported from @/lib/currency

const formatDate = (d: string | null) => {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
};

const AdminPayments = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [suscripciones, setSuscripciones] = useState<Suscripcion[]>([]);
  const [sedes, setSedes] = useState<{ id: string; nombre: string }[]>([]);
  const [planes, setPlanes] = useState<{ id: string; nombre: string }[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters - initialize from URL params
  const [filterEstado, setFilterEstado] = useState(searchParams.get("estado") || "todos");
  const [filterPlan, setFilterPlan] = useState("todos");
  const [filterSede, setFilterSede] = useState("todos");
  const [filterMetodo, setFilterMetodo] = useState("todos");
  const [filterAlumno, setFilterAlumno] = useState("");
  const [filterFechaDesde, setFilterFechaDesde] = useState("");
  const [filterFechaHasta, setFilterFechaHasta] = useState("");
  const [filterPeriodo, setFilterPeriodo] = useState<string>(currentPeriodKey());
  const [filterChequeo, setFilterChequeo] = useState<string>(searchParams.get("chequeo") || "todos");


  // Expandable rows
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  // Sorting
  type SortKey = "alumno" | "plan" | "vencimiento" | "estado" | "metodo" | "operacion";
  const [sortKey, setSortKey] = useState<SortKey>("operacion");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir(key === "vencimiento" || key === "operacion" ? "desc" : "asc"); }
  };
  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return <ArrowUpDown className="w-3 h-3 inline ml-1 opacity-50" />;
    return sortDir === "asc"
      ? <ArrowUp className="w-3 h-3 inline ml-1" />
      : <ArrowDown className="w-3 h-3 inline ml-1" />;
  };

  // Dialogs
  const [confirmAction, setConfirmAction] = useState<{ type: string; sub: Suscripcion } | null>(null);
  const [editFechaDialog, setEditFechaDialog] = useState<Suscripcion | null>(null);
  const [editFechaValue, setEditFechaValue] = useState("");
  const [manualPayDialog, setManualPayDialog] = useState<Suscripcion | null>(null);
  const [manualPayData, setManualPayData] = useState<ManualPaymentData>({ observaciones: "", metodo: "efectivo", fecha_pago: new Date().toISOString().split("T")[0], fecha_fin: "" });
  const [recordatorioDialog, setRecordatorioDialog] = useState<Suscripcion | null>(null);
  const [recordatorioMsg, setRecordatorioMsg] = useState("");
  const [showRegisterPayment, setShowRegisterPayment] = useState(false);
  // Correct method dialog (for student-reported payments)
  const [correctMethodDialog, setCorrectMethodDialog] = useState<Suscripcion | null>(null);
  const [correctMethodValue, setCorrectMethodValue] = useState("efectivo");

  const fetchData = async () => {
    setLoading(true);
    const [subsRes, sedesRes, planesRes] = await Promise.all([
      supabase
        .from("suscripciones")
        .select("*, alumnos(id, nombre, apellido, email, telefono, sede_id), planes(id, nombre, precio, moneda, frecuencia)")
        .order("created_at", { ascending: false }),
      supabase.from("sedes").select("id, nombre").eq("activa", true),
      supabase.from("planes").select("id, nombre"),
    ]);
    if (subsRes.data) setSuscripciones(subsRes.data as unknown as Suscripcion[]);
    if (sedesRes.data) setSedes(sedesRes.data);
    if (planesRes.data) setPlanes(planesRes.data);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  // Precarga datos al abrir el modal de pago manual: fecha de pago = hoy,
  // fecha de vencimiento = vencimiento actual de la suscripción (si existe).
  useEffect(() => {
    if (!manualPayDialog) return;
    setManualPayData({
      observaciones: manualPayDialog.notas || "",
      metodo: manualPayDialog.metodo_pago || "efectivo",
      fecha_pago: new Date().toISOString().split("T")[0],
      fecha_fin: manualPayDialog.fecha_fin || "",
    });
  }, [manualPayDialog]);

  const filtered = useMemo(() => {
    const list = suscripciones.filter((s) => {
      if (!subInPeriod(s, filterPeriodo)) return false;
      const status = getPaymentStatus(s);
      if (filterEstado !== "todos" && status !== filterEstado) return false;
      if (filterPlan !== "todos" && s.plan_id !== filterPlan) return false;
      if (filterSede !== "todos" && s.alumnos?.sede_id !== filterSede) return false;
      if (filterAlumno && ![s.alumnos?.nombre, s.alumnos?.apellido].filter(Boolean).join(" ").toLowerCase().includes(filterAlumno.toLowerCase())) return false;
      if (filterMetodo !== "todos") {
        if (s.metodo_pago !== filterMetodo) return false;
      }
      if (filterFechaDesde && s.created_at < filterFechaDesde) return false;
      if (filterFechaHasta && s.created_at > filterFechaHasta + "T23:59:59") return false;
      if (filterChequeo === "pendientes" && s.chequeado_admin) return false;
      if (filterChequeo === "chequeados" && !s.chequeado_admin) return false;
      return true;
    });


    const dir = sortDir === "asc" ? 1 : -1;
    const cmp = (a: string | number | null | undefined, b: string | number | null | undefined) => {
      const av = a ?? "";
      const bv = b ?? "";
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    };
    const getOperacion = (s: Suscripcion) =>
      (PAID_ORIGEN.includes(s.origen_registro) ? (s.fecha_inicio || s.updated_at) : s.updated_at) || s.created_at;

    list.sort((a, b) => {
      switch (sortKey) {
        case "alumno":
          return cmp(
            [a.alumnos?.nombre, a.alumnos?.apellido].filter(Boolean).join(" ").toLowerCase(),
            [b.alumnos?.nombre, b.alumnos?.apellido].filter(Boolean).join(" ").toLowerCase()
          );
        case "plan": return cmp(a.planes?.nombre?.toLowerCase(), b.planes?.nombre?.toLowerCase());
        case "vencimiento": return cmp(a.fecha_fin, b.fecha_fin);
        case "estado": return cmp(getPaymentStatus(a), getPaymentStatus(b));
        case "metodo": return cmp(a.metodo_pago, b.metodo_pago);
        case "operacion": return cmp(getOperacion(a), getOperacion(b));
        default: return 0;
      }
    });
    return list;
  }, [suscripciones, filterEstado, filterPlan, filterSede, filterAlumno, filterMetodo, filterFechaDesde, filterFechaHasta, filterPeriodo, filterChequeo, sortKey, sortDir]);

  const handleToggleChequeado = async (sub: Suscripcion) => {
    const next = !sub.chequeado_admin;
    const { data: { session } } = await supabase.auth.getSession();
    const { error } = await supabase.from("suscripciones").update({
      chequeado_admin: next,
      chequeado_admin_at: next ? new Date().toISOString() : null,
      chequeado_admin_by: next ? session?.user?.id ?? null : null,
    } as any).eq("id", sub.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    await logAudit(next ? "pago_chequeado" : "pago_descheckado", sub.id, { alumno: sub.alumnos?.nombre });
    setSuscripciones(prev => prev.map(x => x.id === sub.id ? { ...x, chequeado_admin: next } : x));
    toast({ title: next ? "Pago chequeado" : "Chequeo removido" });
  };


  const logAudit = async (action: string, entityId: string, details: Record<string, string | number | boolean | null | undefined>) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { data: adminProfile } = await supabase.from("admin_profiles").select("email, role").eq("user_id", session.user.id).single();
    await supabase.from("audit_log").insert([{
      user_id: session.user.id,
      user_email: adminProfile?.email || session.user.email || "",
      user_role: adminProfile?.role || "admin",
      action,
      entity_type: "suscripcion",
      entity_id: entityId,
      details,
    }]);
  };

  const handleMarcarPagado = async (sub: Suscripcion) => {
    const now = new Date();
    const fechaFin = new Date(now);
    fechaFin.setMonth(fechaFin.getMonth() + 1);
    const { error } = await supabase.from("suscripciones").update({
      estado: "activa",
      fecha_inicio: now.toISOString().split("T")[0],
      fecha_fin: fechaFin.toISOString().split("T")[0],
      mp_status: sub.mp_status || "manual",
      origen_registro: "cargado_admin",
    } as any).eq("id", sub.id);
    if (!error) {
      await supabase.from("alumnos").update({ estado: "activo" }).eq("id", sub.alumno_id);
      await logAudit("marcar_pagado", sub.id, { alumno: sub.alumnos?.nombre });
      
      // Auto-facturar
      if (sub.planes) {
        supabase.functions.invoke("auto-facturar", {
          body: {
            alumno_id: sub.alumno_id,
            concepto: `Suscripción ${sub.planes.nombre}`,
            monto: sub.planes.precio,
            referencia_tipo: "suscripcion",
            referencia_id: sub.id,
            segmento: "escuela",
          },
        }).then(({ data }) => {
          if (data?.emitted) {
            toast({ title: "Factura AFIP emitida", description: `N° ${data.numero_comprobante}` });
          }
        }).catch(() => {});
      }

      toast({ title: "Pago registrado", description: `Se marcó como pagado para ${sub.alumnos?.nombre}` });
      fetchData();
    } else {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
    setConfirmAction(null);
  };

  // Nota: las acciones "Conciliar" y "Suspender acceso" se removieron de esta vista
  // para simplificar la operatoria diaria y evitar ruido visual.



  const handleEditFecha = async () => {
    if (!editFechaDialog || !editFechaValue) return;
    const { error } = await supabase.from("suscripciones").update({ fecha_fin: editFechaValue }).eq("id", editFechaDialog.id);
    if (!error) {
      await logAudit("editar_vencimiento", editFechaDialog.id, { alumno: editFechaDialog.alumnos?.nombre, nueva_fecha: editFechaValue });
      toast({ title: "Fecha actualizada" });
      fetchData();
    }
    setEditFechaDialog(null);
  };

  const handleRegistrarManual = async () => {
    if (!manualPayDialog) return;

    // Validaciones
    if (!manualPayData.metodo) {
      toast({ title: "Falta método de pago", variant: "destructive" });
      return;
    }
    if (!manualPayData.fecha_pago) {
      toast({ title: "Falta fecha de pago", variant: "destructive" });
      return;
    }
    if (!manualPayData.fecha_fin) {
      toast({ title: "Falta fecha de vencimiento", variant: "destructive" });
      return;
    }
    if (manualPayData.fecha_fin < manualPayData.fecha_pago) {
      toast({
        title: "Fechas inválidas",
        description: "La fecha de vencimiento no puede ser anterior a la fecha de pago.",
        variant: "destructive",
      });
      return;
    }

    const { error } = await supabase.from("suscripciones").update({
      estado: "activa",
      fecha_inicio: manualPayData.fecha_pago,
      fecha_fin: manualPayData.fecha_fin,
      mp_status: manualPayData.metodo,
      metodo_pago: manualPayData.metodo,
      origen_registro: "cargado_admin",
      notas: manualPayData.observaciones || null,
    } as any).eq("id", manualPayDialog.id);
    if (!error) {
      await supabase.from("alumnos").update({ estado: "activo" }).eq("id", manualPayDialog.alumno_id);
      await logAudit("pago_manual", manualPayDialog.id, {
        alumno: manualPayDialog.alumnos?.nombre,
        metodo: manualPayData.metodo,
        fecha_pago: manualPayData.fecha_pago,
        fecha_fin: manualPayData.fecha_fin,
        observaciones: manualPayData.observaciones,
      });

      // Auto-facturar
      if (manualPayDialog.planes) {
        supabase.functions.invoke("auto-facturar", {
          body: {
            alumno_id: manualPayDialog.alumno_id,
            concepto: `Suscripción ${manualPayDialog.planes.nombre}`,
            monto: manualPayDialog.planes.precio,
            referencia_tipo: "suscripcion",
            referencia_id: manualPayDialog.id,
            segmento: "escuela",
          },
        }).then(({ data }) => {
          if (data?.emitted) {
            toast({ title: "Factura AFIP emitida", description: `N° ${data.numero_comprobante}` });
          }
        }).catch(() => {});
      }

      toast({ title: "Pago manual registrado" });
      setManualPayDialog(null);
      fetchData();
    } else {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleCorrectMethod = async () => {
    if (!correctMethodDialog) return;
    const oldMethod = correctMethodDialog.metodo_pago;
    const { error } = await supabase
      .from("suscripciones")
      .update({ metodo_pago: correctMethodValue } as any)
      .eq("id", correctMethodDialog.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    await logAudit("corregir_metodo_pago", correctMethodDialog.id, {
      alumno: correctMethodDialog.alumnos?.nombre,
      metodo_anterior: oldMethod,
      metodo_nuevo: correctMethodValue,
    });
    toast({ title: "Método corregido", description: `Se actualizó el método de pago a ${getPaymentMethodLabel(correctMethodValue)}.` });
    setCorrectMethodDialog(null);
    fetchData();
  };

  const handleRecordatorio = (sub: Suscripcion) => {
    const tel = sub.alumnos?.telefono;
    if (!tel) {
      toast({ title: "Sin teléfono", description: "Este alumno no tiene teléfono registrado", variant: "destructive" });
      return;
    }
    const msg = recordatorioMsg || `Hola ${sub.alumnos?.nombre}, te recordamos que tu pago de ${sub.planes?.nombre} está pendiente. ¡Gracias!`;
    let clean = tel.replace(/\D/g, "");
    // Asegurar formato internacional para Argentina
    if (clean.startsWith("15")) clean = "549" + clean.slice(2);
    else if (clean.startsWith("11") || clean.startsWith("0")) {
      if (clean.startsWith("0")) clean = clean.slice(1);
      clean = "549" + clean;
    } else if (!clean.startsWith("54")) {
      clean = "549" + clean;
    }
    window.open(`https://wa.me/${clean}?text=${encodeURIComponent(msg)}`, "_blank");
    logAudit("enviar_recordatorio", sub.id, { alumno: sub.alumnos?.nombre });
    setRecordatorioDialog(null);
    setRecordatorioMsg("");
  };

  const clearFilters = () => {
    setFilterEstado("todos");
    setFilterPlan("todos");
    setFilterSede("todos");
    setFilterMetodo("todos");
    setFilterAlumno("");
    setFilterFechaDesde("");
    setFilterFechaHasta("");
  };

  // Summary counts (scoped to selected period)
  const summary = useMemo(() => {
    const counts = { pagado: 0, por_cobrar: 0, informado: 0, conciliado: 0, vencido: 0 };
    suscripciones.forEach((s) => {
      if (!subInPeriod(s, filterPeriodo)) return;
      const st = getPaymentStatus(s);
      if (st in counts) counts[st as keyof typeof counts]++;
    });
    return counts;
  }, [suscripciones, filterPeriodo]);

  // Period selector options: last 12 months + "all"
  const periodOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = [{ value: "all", label: "Todos los meses" }];
    const monthNames = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = `${monthNames[d.getMonth()]} ${d.getFullYear()}`;
      opts.push({ value: key, label: i === 0 ? `${label} (actual)` : label });
    }
    return opts;
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center py-20 text-muted-foreground">Cargando pagos...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-heading font-bold text-foreground">Pagos y Cobranzas</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gestión integral de pagos, conciliación y cobranza · <span className="text-foreground font-medium">{periodOptions.find(o => o.value === filterPeriodo)?.label || filterPeriodo}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={filterPeriodo} onValueChange={setFilterPeriodo}>
            <SelectTrigger className="h-9 text-sm w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent className="max-h-[300px]">
              {periodOptions.map(o => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={() => setShowRegisterPayment(true)} className="gap-1.5">
            <DollarSign className="w-4 h-4" />
            Registrar pago
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="cursor-pointer hover:border-emerald-500/50 transition-colors" onClick={() => setFilterEstado("pagado")}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-emerald-600"><CheckCircle className="w-4 h-4" /><span className="text-xs font-medium">Pagados</span></div>
            <p className="text-2xl font-bold mt-1">{summary.pagado}</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-amber-500/50 transition-colors" onClick={() => setFilterEstado("por_cobrar")}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-amber-600"><Clock className="w-4 h-4" /><span className="text-xs font-medium">Por cobrar</span></div>
            <p className="text-2xl font-bold mt-1">{summary.por_cobrar}</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-blue-500/50 transition-colors" onClick={() => setFilterEstado("informado")}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-blue-600"><FileText className="w-4 h-4" /><span className="text-xs font-medium">Informados</span></div>
            <p className="text-2xl font-bold mt-1">{summary.informado}</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-teal-500/50 transition-colors" onClick={() => setFilterEstado("conciliado")}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-teal-600"><CheckCheck className="w-4 h-4" /><span className="text-xs font-medium">Conciliados</span></div>
            <p className="text-2xl font-bold mt-1">{summary.conciliado}</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-red-500/50 transition-colors" onClick={() => setFilterEstado("vencido")}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-red-600"><AlertTriangle className="w-4 h-4" /><span className="text-xs font-medium">Vencidos</span></div>
            <p className="text-2xl font-bold mt-1">{summary.vencido}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2"><Filter className="w-4 h-4" /> Filtros</CardTitle>
            <Button variant="ghost" size="sm" onClick={clearFilters} className="text-xs"><X className="w-3 h-3 mr-1" />Limpiar</Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <Label className="text-xs mb-1 block">Alumno</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar alumno..." value={filterAlumno} onChange={(e) => setFilterAlumno(e.target.value)} className="pl-8 h-9 text-sm" />
              </div>
            </div>
            <div>
              <Label className="text-xs mb-1 block">Estado</Label>
              <Select value={filterEstado} onValueChange={setFilterEstado}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="pagado">Pagado</SelectItem>
                  <SelectItem value="por_cobrar">Por cobrar</SelectItem>
                  <SelectItem value="informado">Informado</SelectItem>
                  <SelectItem value="conciliado">Conciliado</SelectItem>
                  <SelectItem value="vencido">Vencido</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs mb-1 block">Plan</Label>
              <Select value={filterPlan} onValueChange={setFilterPlan}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  {planes.map((p) => <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs mb-1 block">Sede</Label>
              <Select value={filterSede} onValueChange={setFilterSede}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todas</SelectItem>
                  {sedes.map((s) => <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs mb-1 block">Método de pago</Label>
              <Select value={filterMetodo} onValueChange={setFilterMetodo}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m.key} value={m.key}>{m.label}</SelectItem>
                  ))}
                  
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs mb-1 block">Chequeo admin</Label>
              <Select value={filterChequeo} onValueChange={setFilterChequeo}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="pendientes">Pendientes de chequeo</SelectItem>
                  <SelectItem value="chequeados">Chequeados</SelectItem>
                </SelectContent>
              </Select>
            </div>


            <div>
              <Label className="text-xs mb-1 block">Fecha desde</Label>
              <Input type="date" value={filterFechaDesde} onChange={(e) => setFilterFechaDesde(e.target.value)} className="h-9 text-sm" />
            </div>
            <div>
              <Label className="text-xs mb-1 block">Fecha hasta</Label>
              <Input type="date" value={filterFechaHasta} onChange={(e) => setFilterFechaHasta(e.target.value)} className="h-9 text-sm" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Payments table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Pagos ({filtered.length})</CardTitle>
            <Button variant="ghost" size="sm" onClick={fetchData}><RefreshCw className="w-4 h-4 mr-1" />Actualizar</Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("alumno")}>Alumno<SortIcon k="alumno" /></TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("plan")}>Plan<SortIcon k="plan" /></TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("vencimiento")}>Vencimiento<SortIcon k="vencimiento" /></TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("operacion")}>F. operación<SortIcon k="operacion" /></TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("estado")}>Estado<SortIcon k="estado" /></TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("metodo")}>Método<SortIcon k="metodo" /></TableHead>
                  <TableHead>Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No se encontraron pagos con los filtros seleccionados</TableCell></TableRow>
                ) : (
                  filtered.map((sub) => {
                    const status = getPaymentStatus(sub);
                    const isExpanded = expandedRow === sub.id;
                    return (
                      <Fragment key={sub.id}>
                        <TableRow 
                          className={`cursor-pointer transition-colors ${sub.chequeado_admin ? "bg-emerald-500/10 hover:bg-emerald-500/15" : "hover:bg-muted/50"}`}
                          onClick={() => setExpandedRow(isExpanded ? null : sub.id)}
                        >

                          <TableCell className="px-2">
                            {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                          </TableCell>
                          <TableCell className="font-medium text-sm">
                            <span
                              className="cursor-pointer hover:text-primary hover:underline transition-colors"
                              onClick={(e) => { e.stopPropagation(); navigate(`/admin/alumnos?buscar=${encodeURIComponent([sub.alumnos?.nombre, sub.alumnos?.apellido].filter(Boolean).join(" "))}`) }}
                            >
                              {[sub.alumnos?.nombre, sub.alumnos?.apellido].filter(Boolean).join(" ") || "—"}
                            </span>
                          </TableCell>
                          <TableCell className="text-sm">{sub.planes?.nombre || "—"}</TableCell>
                          <TableCell className="text-sm">{formatDate(sub.fecha_fin)}</TableCell>
                          <TableCell className="text-sm">{formatDate(PAID_ORIGEN.includes(sub.origen_registro) ? (sub.fecha_inicio || sub.updated_at) : sub.updated_at)}</TableCell>
                          <TableCell>{getStatusBadge(status)}</TableCell>
                          <TableCell>
                            {(() => {
                              const rp = getMethodDisplay(sub);
                              return (
                                <div className="leading-tight">
                                  <span className="text-sm font-medium">{rp.method}</span>
                                  {rp.origin !== "—" && (
                                    <span className="block text-[11px] text-muted-foreground">{rp.origin}</span>
                                  )}
                                </div>
                              );
                            })()}
                          </TableCell>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <TooltipProvider delayDuration={200}>
                              <div className="flex items-center gap-1 flex-wrap">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant={sub.chequeado_admin ? "default" : "outline"}
                                      size="sm"
                                      className={`h-7 px-2 text-[11px] ${sub.chequeado_admin ? "bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600" : ""}`}
                                      onClick={() => handleToggleChequeado(sub)}
                                    >
                                      <CheckCheck className="w-3 h-3 mr-1" />
                                      {sub.chequeado_admin ? "Chequeado" : "Chequear"}
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>{sub.chequeado_admin ? "Quitar marca de chequeado" : "Marcar como chequeado (conciliado con MP/transferencia/efectivo)"}</TooltipContent>
                                </Tooltip>

                                {(status === "pendiente" || status === "vencido") && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setConfirmAction({ type: "pagar", sub })}>
                                        <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Marcar como pagado</TooltipContent>
                                  </Tooltip>
                                )}
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditFechaDialog(sub); setEditFechaValue(sub.fecha_fin || ""); }}>
                                      <Pencil className="w-3.5 h-3.5 text-foreground/70" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Editar vencimiento</TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setManualPayDialog(sub)}>
                                      <CreditCard className="w-3.5 h-3.5 text-blue-600" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Registrar pago manual</TooltipContent>
                                </Tooltip>
                                {sub.origen_registro === "informado_alumno" && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setCorrectMethodDialog(sub); setCorrectMethodValue(sub.metodo_pago || "efectivo"); }}>
                                        <Pencil className="w-3.5 h-3.5 text-blue-500" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Corregir método informado</TooltipContent>
                                  </Tooltip>
                                )}
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setRecordatorioDialog(sub)}>
                                      <Bell className="w-3.5 h-3.5 text-amber-600" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Enviar recordatorio</TooltipContent>
                                </Tooltip>
                                {status === "pagado" && sub.planes && (
                                  <BillingInvoiceLauncher
                                    source={{
                                      alumno_id: sub.alumno_id,
                                      cliente_nombre: [sub.alumnos?.nombre, sub.alumnos?.apellido].filter(Boolean).join(" "),
                                      concepto: `Suscripción ${sub.planes.nombre}`,
                                      monto: sub.planes.precio,
                                      referencia_tipo: "suscripcion",
                                      referencia_id: sub.id,
                                      segmento: "escuela",
                                      metodo_pago: sub.metodo_pago,
                                      origen_registro: sub.origen_registro,
                                    }}
                                    variant="icon"
                                    onEmitted={fetchData}
                                  />
                                )}
                              </div>
                            </TooltipProvider>
                          </TableCell>
                        </TableRow>
                        {isExpanded && (
                          <TableRow className="bg-muted/30 hover:bg-muted/30">
                            <TableCell colSpan={8} className="p-0">
                              <div className="px-6 py-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm border-b border-border/50">
                                <div>
                                  <p className="text-xs text-muted-foreground mb-0.5">Monto</p>
                                  <p className="font-semibold">{sub.planes ? formatPrice(sub.planes.precio, sub.planes.moneda) : "—"}</p>
                                </div>
                                <div>
                                  <p className="text-xs text-muted-foreground mb-0.5">F. Emisión</p>
                                  <p className="font-medium">{formatDate(sub.created_at)}</p>
                                </div>
                                <div>
                                  <p className="text-xs text-muted-foreground mb-0.5">F. Inicio</p>
                                  <p className="font-medium">{formatDate(sub.fecha_inicio)}</p>
                                </div>
                                <div>
                                  <p className="text-xs text-muted-foreground mb-0.5">F. Pago</p>
                                  <p className="font-medium">{sub.estado === "activa" || sub.estado === "conciliado" ? formatDate(sub.fecha_inicio) : "—"}</p>
                                </div>
                                <div>
                                  <p className="text-xs text-muted-foreground mb-0.5">Email</p>
                                  <p className="font-medium truncate">{sub.alumnos?.email || "—"}</p>
                                </div>
                                <div>
                                  <p className="text-xs text-muted-foreground mb-0.5">Teléfono</p>
                                  <p className="font-medium">{sub.alumnos?.telefono || "—"}</p>
                                </div>
                                <div>
                                  <p className="text-xs text-muted-foreground mb-0.5">Cobro automático</p>
                                  <p className="font-medium">
                                    {sub.auto_cobro_activo && sub.mp_preapproval_id
                                      ? "Autorizado MP"
                                      : sub.mp_preapproval_id
                                        ? `Pendiente (${sub.mp_preapproval_status || "MP"})`
                                        : sub.auto_renovacion
                                          ? "Marcado sin autorización"
                                          : "No"}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-xs text-muted-foreground mb-0.5">Frecuencia</p>
                                  <p className="font-medium">{sub.planes?.frecuencia || "—"}</p>
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Confirm action dialog */}
      <AlertDialog open={!!confirmAction} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction?.type === "pagar" && "¿Marcar como pagado?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction?.type === "pagar" && `Se marcará como pagado el plan ${confirmAction.sub.planes?.nombre} de ${confirmAction.sub.alumnos?.nombre}. Se activará el acceso del alumno.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!confirmAction) return;
                if (confirmAction.type === "pagar") handleMarcarPagado(confirmAction.sub);
              }}
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit fecha dialog */}
      <Dialog open={!!editFechaDialog} onOpenChange={(open) => !open && setEditFechaDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Editar fecha de vencimiento</DialogTitle>
            <DialogDescription>Cambiar la fecha de vencimiento para {editFechaDialog?.alumnos?.nombre}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nueva fecha de vencimiento</Label>
              <Input type="date" value={editFechaValue} onChange={(e) => setEditFechaValue(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditFechaDialog(null)}>Cancelar</Button>
            <Button onClick={handleEditFecha}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manual payment dialog */}
      <Dialog open={!!manualPayDialog} onOpenChange={(open) => !open && setManualPayDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar pago manual</DialogTitle>
            <DialogDescription>Registrar pago manual para {manualPayDialog?.alumnos?.nombre} — {manualPayDialog?.planes?.nombre}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Método de pago</Label>
              <Select value={manualPayData.metodo} onValueChange={(v) => setManualPayData((p) => ({ ...p, metodo: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m.key} value={m.key}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Fecha de pago</Label>
              <Input type="date" value={manualPayData.fecha_pago} onChange={(e) => setManualPayData((p) => ({ ...p, fecha_pago: e.target.value }))} />
            </div>
            <div>
              <Label>Fecha de vencimiento</Label>
              <Input
                type="date"
                value={manualPayData.fecha_fin}
                min={manualPayData.fecha_pago || undefined}
                onChange={(e) => setManualPayData((p) => ({ ...p, fecha_fin: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Define hasta qué fecha queda activo este pago.
              </p>
            </div>
            <div>
              <Label>Observaciones</Label>
              <Textarea placeholder="Notas sobre el pago..." value={manualPayData.observaciones} onChange={(e) => setManualPayData((p) => ({ ...p, observaciones: e.target.value }))} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManualPayDialog(null)}>Cancelar</Button>
            <Button onClick={handleRegistrarManual}>Registrar pago</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Recordatorio dialog */}
      <Dialog open={!!recordatorioDialog} onOpenChange={(open) => !open && setRecordatorioDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Enviar recordatorio por WhatsApp</DialogTitle>
            <DialogDescription>Se abrirá WhatsApp Web con el mensaje para {recordatorioDialog?.alumnos?.nombre}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Mensaje</Label>
              <Textarea
                value={recordatorioMsg || `Hola ${recordatorioDialog?.alumnos?.nombre}, te recordamos que tu pago de ${recordatorioDialog?.planes?.nombre} está pendiente. ¡Gracias!`}
                onChange={(e) => setRecordatorioMsg(e.target.value)}
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRecordatorioDialog(null)}>Cancelar</Button>
            <Button onClick={() => recordatorioDialog && handleRecordatorio(recordatorioDialog)}>
              <Send className="w-4 h-4 mr-1" />Enviar por WhatsApp
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Correct method dialog (for student-reported payments) */}
      <Dialog open={!!correctMethodDialog} onOpenChange={(open) => !open && setCorrectMethodDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Corregir método de pago</DialogTitle>
            <DialogDescription>
              {correctMethodDialog?.alumnos?.nombre} informó este pago como{" "}
              <strong>{getPaymentMethodLabel(correctMethodDialog?.metodo_pago)}</strong>.
              Si el medio real fue otro, corregilo acá.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Método real</Label>
              <Select value={correctMethodValue} onValueChange={setCorrectMethodValue}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m.key} value={m.key}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCorrectMethodDialog(null)}>Cancelar</Button>
            <Button onClick={handleCorrectMethod}>Guardar corrección</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Register Payment Modal */}
      <RegisterPaymentModal
        open={showRegisterPayment}
        onOpenChange={setShowRegisterPayment}
        onSuccess={fetchData}
      />
    </div>
  );
};

export default AdminPayments;
