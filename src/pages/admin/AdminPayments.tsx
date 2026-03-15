import { useState, useEffect, useMemo, Fragment } from "react";
import { useSearchParams } from "react-router-dom";
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
import {
  Search, Filter, CheckCircle, Eye, Edit, Send, CreditCard, BanIcon,
  FileText, MessageSquare, RefreshCw, X, DollarSign, Clock, AlertTriangle, CheckCheck,
  ChevronDown, ChevronUp
} from "lucide-react";

type Suscripcion = {
  id: string;
  alumno_id: string;
  plan_id: string;
  estado: string;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  mp_status: string | null;
  mp_payment_id: string | null;
  created_at: string;
  updated_at: string;
  auto_renovacion: boolean;
  alumnos: {
    id: string;
    nombre: string;
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
};

const ESTADO_MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  activa: { label: "Pagado", variant: "default" },
  pendiente: { label: "Pendiente", variant: "secondary" },
  pendiente_verificacion: { label: "Informado", variant: "outline" },
  conciliado: { label: "Conciliado", variant: "default" },
  vencida: { label: "Vencido", variant: "destructive" },
  cancelada: { label: "Cancelado", variant: "destructive" },
};

const getPaymentStatus = (sub: Suscripcion): string => {
  if (sub.estado === "pendiente_verificacion") return "informado";
  if (sub.estado === "conciliado") return "conciliado";
  if (sub.estado === "activa") return "pagado";
  if (sub.estado === "cancelada") return "cancelado";
  // Check if overdue
  if (sub.fecha_fin && new Date(sub.fecha_fin) < new Date() && sub.estado !== "activa") return "vencido";
  if (sub.estado === "pendiente") return "pendiente";
  return sub.estado;
};

const getStatusBadge = (status: string) => {
  const map: Record<string, { label: string; className: string }> = {
    pagado: { label: "Pagado", className: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30" },
    pendiente: { label: "Pendiente", className: "bg-amber-500/15 text-amber-700 border-amber-500/30" },
    informado: { label: "Informado", className: "bg-blue-500/15 text-blue-700 border-blue-500/30" },
    conciliado: { label: "Conciliado", className: "bg-teal-500/15 text-teal-700 border-teal-500/30" },
    vencido: { label: "Vencido", className: "bg-red-500/15 text-red-700 border-red-500/30" },
    cancelado: { label: "Cancelado", className: "bg-muted text-muted-foreground border-border" },
  };
  const info = map[status] || { label: status, className: "" };
  return <Badge variant="outline" className={info.className}>{info.label}</Badge>;
};

const getMetodoPago = (sub: Suscripcion): string => {
  if (sub.mp_status === "efectivo" || sub.mp_status === "cash") return "Efectivo";
  if (sub.mp_status === "externo") return "Pago externo";
  if (sub.mp_payment_id) return "Tarjeta / MP";
  if (sub.mp_status === "manual") return "Manual";
  return "Sin definir";
};

const formatPrice = (p: number, moneda: string = "ARS") =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: moneda === "USD" ? "USD" : "ARS",
    minimumFractionDigits: 0,
  }).format(p);

const formatDate = (d: string | null) => {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
};

const AdminPayments = () => {
  const [searchParams] = useSearchParams();
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

  // Dialogs
  const [confirmAction, setConfirmAction] = useState<{ type: string; sub: Suscripcion } | null>(null);
  const [editFechaDialog, setEditFechaDialog] = useState<Suscripcion | null>(null);
  const [editFechaValue, setEditFechaValue] = useState("");
  const [manualPayDialog, setManualPayDialog] = useState<Suscripcion | null>(null);
  const [manualPayData, setManualPayData] = useState<ManualPaymentData>({ observaciones: "", metodo: "efectivo", fecha_pago: new Date().toISOString().split("T")[0] });
  const [recordatorioDialog, setRecordatorioDialog] = useState<Suscripcion | null>(null);
  const [recordatorioMsg, setRecordatorioMsg] = useState("");

  const fetchData = async () => {
    setLoading(true);
    const [subsRes, sedesRes, planesRes] = await Promise.all([
      supabase
        .from("suscripciones")
        .select("*, alumnos(id, nombre, email, telefono, sede_id), planes(id, nombre, precio, moneda, frecuencia)")
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

  const filtered = useMemo(() => {
    return suscripciones.filter((s) => {
      const status = getPaymentStatus(s);
      if (filterEstado !== "todos" && status !== filterEstado) return false;
      if (filterPlan !== "todos" && s.plan_id !== filterPlan) return false;
      if (filterSede !== "todos" && s.alumnos?.sede_id !== filterSede) return false;
      if (filterAlumno && !s.alumnos?.nombre.toLowerCase().includes(filterAlumno.toLowerCase())) return false;
      if (filterMetodo !== "todos") {
        const metodo = getMetodoPago(s).toLowerCase();
        if (!metodo.includes(filterMetodo.toLowerCase())) return false;
      }
      if (filterFechaDesde && s.created_at < filterFechaDesde) return false;
      if (filterFechaHasta && s.created_at > filterFechaHasta + "T23:59:59") return false;
      return true;
    });
  }, [suscripciones, filterEstado, filterPlan, filterSede, filterAlumno, filterMetodo, filterFechaDesde, filterFechaHasta]);

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
    }).eq("id", sub.id);
    if (!error) {
      await supabase.from("alumnos").update({ estado: "activo" }).eq("id", sub.alumno_id);
      await logAudit("marcar_pagado", sub.id, { alumno: sub.alumnos?.nombre });
      toast({ title: "Pago registrado", description: `Se marcó como pagado para ${sub.alumnos?.nombre}` });
      fetchData();
    } else {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
    setConfirmAction(null);
  };

  const handleConciliar = async (sub: Suscripcion) => {
    const { error } = await supabase.from("suscripciones").update({ estado: "conciliado" as string }).eq("id", sub.id);
    if (!error) {
      await supabase.from("alumnos").update({ estado: "activo" }).eq("id", sub.alumno_id);
      await logAudit("conciliar_pago", sub.id, { alumno: sub.alumnos?.nombre });
      toast({ title: "Pago conciliado", description: `Se concilió el pago de ${sub.alumnos?.nombre}` });
      fetchData();
    }
    setConfirmAction(null);
  };

  const handleSuspender = async (sub: Suscripcion) => {
    const { error } = await supabase.from("suscripciones").update({ estado: "cancelada", cancelada_at: new Date().toISOString(), cancelada_motivo: "Suspensión por falta de pago" }).eq("id", sub.id);
    if (!error) {
      await supabase.from("alumnos").update({ estado: "inactivo" }).eq("id", sub.alumno_id);
      await logAudit("suspender_acceso", sub.id, { alumno: sub.alumnos?.nombre });
      toast({ title: "Acceso suspendido", description: `Se suspendió el acceso de ${sub.alumnos?.nombre}` });
      fetchData();
    }
    setConfirmAction(null);
  };

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
    const now = new Date();
    const fechaFin = new Date(now);
    fechaFin.setMonth(fechaFin.getMonth() + 1);
    const { error } = await supabase.from("suscripciones").update({
      estado: "activa",
      fecha_inicio: manualPayData.fecha_pago,
      fecha_fin: fechaFin.toISOString().split("T")[0],
      mp_status: manualPayData.metodo === "efectivo" ? "efectivo" : "externo",
    }).eq("id", manualPayDialog.id);
    if (!error) {
      await supabase.from("alumnos").update({ estado: "activo" }).eq("id", manualPayDialog.alumno_id);
      await logAudit("pago_manual", manualPayDialog.id, {
        alumno: manualPayDialog.alumnos?.nombre,
        metodo: manualPayData.metodo,
        fecha_pago: manualPayData.fecha_pago,
        observaciones: manualPayData.observaciones,
      });
      toast({ title: "Pago manual registrado" });
      fetchData();
    }
    setManualPayDialog(null);
    setManualPayData({ observaciones: "", metodo: "efectivo", fecha_pago: new Date().toISOString().split("T")[0] });
  };

  const handleRecordatorio = (sub: Suscripcion) => {
    const tel = sub.alumnos?.telefono;
    if (!tel) {
      toast({ title: "Sin teléfono", description: "Este alumno no tiene teléfono registrado", variant: "destructive" });
      return;
    }
    const msg = recordatorioMsg || `Hola ${sub.alumnos?.nombre}, te recordamos que tu pago de ${sub.planes?.nombre} está pendiente. ¡Gracias!`;
    const clean = tel.replace(/\D/g, "");
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

  // Summary counts
  const summary = useMemo(() => {
    const counts = { pagado: 0, pendiente: 0, informado: 0, conciliado: 0, vencido: 0 };
    suscripciones.forEach((s) => {
      const st = getPaymentStatus(s);
      if (st in counts) counts[st as keyof typeof counts]++;
    });
    return counts;
  }, [suscripciones]);

  if (loading) {
    return <div className="flex items-center justify-center py-20 text-muted-foreground">Cargando pagos...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold text-foreground">Pagos y Cobranzas</h1>
        <p className="text-sm text-muted-foreground mt-1">Gestión integral de pagos, conciliación y cobranza</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="cursor-pointer hover:border-emerald-500/50 transition-colors" onClick={() => setFilterEstado("pagado")}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-emerald-600"><CheckCircle className="w-4 h-4" /><span className="text-xs font-medium">Pagados</span></div>
            <p className="text-2xl font-bold mt-1">{summary.pagado}</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-amber-500/50 transition-colors" onClick={() => setFilterEstado("pendiente")}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-amber-600"><Clock className="w-4 h-4" /><span className="text-xs font-medium">Pendientes</span></div>
            <p className="text-2xl font-bold mt-1">{summary.pendiente}</p>
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
                  <SelectItem value="pendiente">Pendiente</SelectItem>
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
                  <SelectItem value="efectivo">Efectivo</SelectItem>
                  <SelectItem value="tarjeta">Tarjeta / MP</SelectItem>
                  <SelectItem value="externo">Pago externo</SelectItem>
                  <SelectItem value="manual">Manual</SelectItem>
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
                  <TableHead>Alumno</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead>F. Emisión</TableHead>
                  <TableHead>F. Vencimiento</TableHead>
                  <TableHead>F. Pago</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Método</TableHead>
                  <TableHead>Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">No se encontraron pagos con los filtros seleccionados</TableCell></TableRow>
                ) : (
                  filtered.map((sub) => {
                    const status = getPaymentStatus(sub);
                    return (
                      <TableRow key={sub.id}>
                        <TableCell className="font-medium text-sm">{sub.alumnos?.nombre || "—"}</TableCell>
                        <TableCell className="text-sm">{sub.planes?.nombre || "—"}</TableCell>
                        <TableCell className="text-right text-sm font-medium">{sub.planes ? formatPrice(sub.planes.precio, sub.planes.moneda) : "—"}</TableCell>
                        <TableCell className="text-sm">{formatDate(sub.created_at)}</TableCell>
                        <TableCell className="text-sm">{formatDate(sub.fecha_fin)}</TableCell>
                        <TableCell className="text-sm">{sub.estado === "activa" || sub.estado === "conciliado" ? formatDate(sub.fecha_inicio) : "—"}</TableCell>
                        <TableCell>{getStatusBadge(status)}</TableCell>
                        <TableCell><Badge variant="outline" className="text-xs">{getMetodoPago(sub)}</Badge></TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 flex-wrap">
                            {(status === "pendiente" || status === "vencido") && (
                              <Button variant="ghost" size="icon" className="h-7 w-7" title="Marcar como pagado" onClick={() => setConfirmAction({ type: "pagar", sub })}>
                                <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                              </Button>
                            )}
                            {status === "informado" && (
                              <Button variant="ghost" size="icon" className="h-7 w-7" title="Conciliar pago" onClick={() => setConfirmAction({ type: "conciliar", sub })}>
                                <CheckCheck className="w-3.5 h-3.5 text-teal-600" />
                              </Button>
                            )}
                            <Button variant="ghost" size="icon" className="h-7 w-7" title="Editar vencimiento" onClick={() => { setEditFechaDialog(sub); setEditFechaValue(sub.fecha_fin || ""); }}>
                              <Edit className="w-3.5 h-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" title="Registrar pago manual" onClick={() => setManualPayDialog(sub)}>
                              <CreditCard className="w-3.5 h-3.5 text-blue-600" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" title="Enviar recordatorio" onClick={() => setRecordatorioDialog(sub)}>
                              <MessageSquare className="w-3.5 h-3.5 text-green-600" />
                            </Button>
                            {status !== "cancelado" && (
                              <Button variant="ghost" size="icon" className="h-7 w-7" title="Suspender acceso" onClick={() => setConfirmAction({ type: "suspender", sub })}>
                                <BanIcon className="w-3.5 h-3.5 text-red-500" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
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
              {confirmAction?.type === "conciliar" && "¿Conciliar pago?"}
              {confirmAction?.type === "suspender" && "¿Suspender acceso?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction?.type === "pagar" && `Se marcará como pagado el plan ${confirmAction.sub.planes?.nombre} de ${confirmAction.sub.alumnos?.nombre}. Se activará el acceso del alumno.`}
              {confirmAction?.type === "conciliar" && `Se validará el pago informado por ${confirmAction.sub.alumnos?.nombre} para el plan ${confirmAction.sub.planes?.nombre}.`}
              {confirmAction?.type === "suspender" && `Se suspenderá el acceso de ${confirmAction.sub.alumnos?.nombre}. El alumno no podrá acceder a entrenamientos ni eventos.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className={confirmAction?.type === "suspender" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
              onClick={() => {
                if (!confirmAction) return;
                if (confirmAction.type === "pagar") handleMarcarPagado(confirmAction.sub);
                if (confirmAction.type === "conciliar") handleConciliar(confirmAction.sub);
                if (confirmAction.type === "suspender") handleSuspender(confirmAction.sub);
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
                  <SelectItem value="efectivo">Efectivo</SelectItem>
                  <SelectItem value="transferencia">Transferencia</SelectItem>
                  <SelectItem value="otro">Otro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Fecha de pago</Label>
              <Input type="date" value={manualPayData.fecha_pago} onChange={(e) => setManualPayData((p) => ({ ...p, fecha_pago: e.target.value }))} />
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
    </div>
  );
};

export default AdminPayments;
