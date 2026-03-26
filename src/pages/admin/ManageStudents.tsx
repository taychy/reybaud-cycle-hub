import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, UserCheck, UserX, Edit2, Check, X, CalendarCheck, Trash2, Plus, Eye, MailPlus, Upload, Users, CreditCard, Palmtree, Ban, Clock, AlertTriangle, FileText } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import { ImportStudentsContent } from "./ImportStudents";

type Alumno = Tables<"alumnos">;
type Plan = Tables<"planes">;

interface SuscripcionConPlan {
  id: string;
  alumno_id: string;
  plan_id: string;
  estado: string;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  planes: { id: string; nombre: string; precio: number; moneda: string } | null;
}

const GRUPOS = ["G1", "G2", "G3", "G4", "Principiante", "Sin grupo"] as const;

// Valid user state transitions
const VALID_TRANSITIONS_ADMIN: Record<string, string[]> = {
  pendiente: ["activo", "inactivo"],
  activo: ["vacaciones", "inactivo"],
  vacaciones: ["activo"],
  inactivo: ["activo"],
  bloqueado: [], // only super_admin can unblock
};

const VALID_TRANSITIONS_SUPER: Record<string, string[]> = {
  pendiente: ["activo", "inactivo"],
  activo: ["vacaciones", "inactivo", "bloqueado"],
  vacaciones: ["activo"],
  inactivo: ["activo"],
  bloqueado: ["activo"],
};

// Valid subscription state transitions
const VALID_SUB_TRANSITIONS: Record<string, string[]> = {
  activa: ["vencida", "pausa"],
  vencida: ["activa", "cancelada"],
  pausa: ["activa"],
  pendiente: ["activa", "cancelada"],
  pendiente_verificacion: ["activa", "cancelada"],
  cancelada: [],
};

// Invalid combinations: user_estado + sub_estado
const INVALID_COMBOS: [string, string][] = [
  ["vacaciones", "activa"],
  ["inactivo", "activa"],
  ["bloqueado", "activa"],
];

const isInconsistent = (userEstado: string, subEstado: string | undefined): boolean => {
  if (!subEstado) return false;
  return INVALID_COMBOS.some(([u, s]) => u === userEstado && s === subEstado);
};

const ManageStudents = () => {
  const [alumnos, setAlumnos] = useState<Alumno[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("todos");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editGrupo, setEditGrupo] = useState<string>("");
  const [manualSubAlumno, setManualSubAlumno] = useState<Alumno | null>(null);
  const [manualFechaFin, setManualFechaFin] = useState("");
  const [savingManual, setSavingManual] = useState(false);
  const [deleteAlumno, setDeleteAlumno] = useState<Alumno | null>(null);
  const [detailAlumno, setDetailAlumno] = useState<Alumno | null>(null);

  // State change dialog
  const [stateChangeAlumno, setStateChangeAlumno] = useState<Alumno | null>(null);
  const [stateChangeTarget, setStateChangeTarget] = useState<string>("");
  const [stateChangeMotivo, setStateChangeMotivo] = useState("");
  const [stateChangeNota, setStateChangeNota] = useState("");
  const [savingState, setSavingState] = useState(false);

  // Sub state change dialog
  const [subChangeAlumno, setSubChangeAlumno] = useState<Alumno | null>(null);
  const [subChangeTarget, setSubChangeTarget] = useState<string>("");
  const [subChangeMotivo, setSubChangeMotivo] = useState("");
  const [savingSub, setSavingSub] = useState(false);

  // Create dialog
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ nombre: "", email: "", telefono: "", documento: "" });
  const [creating, setCreating] = useState(false);

  // Admin role
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const isMobile = useIsMobile();

  useEffect(() => {
    const checkRole = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setCurrentUserId(session.user.id);
        const { data: profile } = await supabase
          .from("admin_profiles")
          .select("role")
          .eq("user_id", session.user.id)
          .maybeSingle();
        setIsSuperAdmin(profile?.role === "super_admin");
      }
    };
    checkRole();
  }, []);

  const fetchAlumnos = async () => {
    const { data } = await supabase.from("alumnos").select("*").order("nombre");
    setAlumnos(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchAlumnos(); }, []);

  const handleCreateAlumno = async () => {
    if (!createForm.nombre.trim() || !createForm.email.trim()) {
      toast.error("Nombre y email son obligatorios");
      return;
    }
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke("invite-user", {
        body: {
          type: "alumno",
          nombre: createForm.nombre.trim(),
          email: createForm.email.trim(),
          telefono: createForm.telefono.trim() || null,
          documento: createForm.documento.trim() || null,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(data?.message || "Alumno creado e invitación enviada");
      setShowCreate(false);
      setCreateForm({ nombre: "", email: "", telefono: "", documento: "" });
      fetchAlumnos();
    } catch (err: any) {
      toast.error(err.message || "Error al crear alumno");
    } finally {
      setCreating(false);
    }
  };

  const [resending, setResending] = useState<string | null>(null);

  const handleResendInvite = async (alumno: Alumno) => {
    const lastSent = (alumno as any).last_invite_sent_at;
    if (lastSent && Date.now() - new Date(lastSent).getTime() < 60_000) {
      toast.error("Esperá 1 minuto antes de reenviar la invitación");
      return;
    }
    setResending(alumno.id);
    try {
      const { data, error } = await supabase.functions.invoke("resend-invite", {
        body: { user_type: "alumno", email: alumno.email },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`Invitación reenviada a ${alumno.email}`);
      fetchAlumnos();
    } catch (err: any) {
      toast.error(err.message || "Error al reenviar invitación");
    } finally {
      setResending(null);
    }
  };

  // Open state change dialog with valid transitions
  const openStateChange = (alumno: Alumno, targetEstado: string) => {
    setStateChangeAlumno(alumno);
    setStateChangeTarget(targetEstado);
    setStateChangeMotivo("");
    setStateChangeNota("");
  };

  const getValidTransitions = (estado: string) => {
    return isSuperAdmin
      ? (VALID_TRANSITIONS_SUPER[estado] || [])
      : (VALID_TRANSITIONS_ADMIN[estado] || []);
  };

  const executeStateChange = async () => {
    if (!stateChangeAlumno || !stateChangeTarget) return;
    setSavingState(true);

    const alumno = stateChangeAlumno;
    const newEstado = stateChangeTarget;

    // Update user state
    const updateData: any = { estado: newEstado };
    if (stateChangeNota) {
      updateData.notas = [alumno.notas, `[${new Date().toLocaleDateString("es-AR")}] ${stateChangeNota}`].filter(Boolean).join("\n");
    }
    await supabase.from("alumnos").update(updateData).eq("id", alumno.id);

    // Auto-manage subscription states
    if (newEstado === "vacaciones") {
      await supabase
        .from("suscripciones")
        .update({ estado: "pausa" })
        .eq("alumno_id", alumno.id)
        .eq("estado", "activa");
    }
    if (newEstado === "activo" && alumno.estado === "vacaciones") {
      await supabase
        .from("suscripciones")
        .update({ estado: "activa" })
        .eq("alumno_id", alumno.id)
        .eq("estado", "pausa");
    }
    if (newEstado === "bloqueado") {
      await supabase
        .from("suscripciones")
        .update({ estado: "cancelada", cancelada_motivo: stateChangeMotivo || "Usuario bloqueado" } as any)
        .eq("alumno_id", alumno.id)
        .in("estado", ["activa", "pausa"]);
    }

    toast.success(`${alumno.nombre} ahora está ${newEstado}`);
    fetchAlumnos();

    // Audit log
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      await supabase.from("audit_log").insert({
        user_id: session.user.id,
        user_email: session.user.email,
        user_role: isSuperAdmin ? "super_admin" : "admin",
        action: "cambio_estado",
        entity_type: "alumno",
        entity_id: alumno.id,
        details: {
          estado_anterior: alumno.estado,
          estado_nuevo: newEstado,
          motivo: stateChangeMotivo || null,
          nota: stateChangeNota || null,
        },
      } as any);
    }

    // Send email notification when enabling
    if (newEstado === "activo") {
      const { data: subs } = await supabase.from("suscripciones").select("fecha_fin").eq("alumno_id", alumno.id).eq("estado", "activa").order("fecha_fin", { ascending: false }).limit(1);
      const fechaFin = subs?.[0]?.fecha_fin || null;
      supabase.functions.invoke("notify-student-update", {
        body: { alumno_id: alumno.id, type: "habilitado", fecha_vencimiento: fechaFin },
      }).catch(() => {});
    }

    setSavingState(false);
    setStateChangeAlumno(null);
  };

  // Subscription state change
  const openSubChange = (alumno: Alumno) => {
    setSubChangeAlumno(alumno);
    setSubChangeTarget("");
    setSubChangeMotivo("");
  };

  const executeSubChange = async () => {
    if (!subChangeAlumno || !subChangeTarget) return;
    setSavingSub(true);

    const sub = getActiveSub(subChangeAlumno.id);
    if (!sub) {
      toast.error("No se encontró suscripción para modificar");
      setSavingSub(false);
      return;
    }

    // Check for inconsistency
    if (isInconsistent(subChangeAlumno.estado, subChangeTarget)) {
      toast.error(`Combinación inválida: usuario "${subChangeAlumno.estado}" + suscripción "${subChangeTarget}". Corregí primero el estado del usuario.`);
      setSavingSub(false);
      return;
    }

    const updateData: any = { estado: subChangeTarget };
    if (subChangeTarget === "cancelada" && subChangeMotivo) {
      updateData.cancelada_motivo = subChangeMotivo;
      updateData.cancelada_at = new Date().toISOString();
    }

    await supabase.from("suscripciones").update(updateData).eq("id", sub.id);

    // Audit
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      await supabase.from("audit_log").insert({
        user_id: session.user.id,
        user_email: session.user.email,
        user_role: isSuperAdmin ? "super_admin" : "admin",
        action: "cambio_estado_suscripcion",
        entity_type: "suscripcion",
        entity_id: sub.id,
        details: {
          alumno: subChangeAlumno.nombre,
          estado_anterior: sub.estado,
          estado_nuevo: subChangeTarget,
          motivo: subChangeMotivo || null,
        },
      } as any);
    }

    toast.success(`Suscripción de ${subChangeAlumno.nombre} actualizada a "${subChangeTarget}"`);
    setSavingSub(false);
    setSubChangeAlumno(null);
    fetchAlumnos();
  };

  const saveGrupo = async (id: string) => {
    await supabase.from("alumnos").update({ grupo: editGrupo as any }).eq("id", id);
    setEditingId(null);
    setAlumnos(prev => prev.map(a => a.id === id ? { ...a, grupo: editGrupo as any } : a));
    toast.success("Grupo actualizado");
    fetchAlumnos();

    if (editGrupo && editGrupo !== "Sin grupo") {
      supabase.functions.invoke("notify-student-update", {
        body: { alumno_id: id, type: "grupo_asignado", grupo: editGrupo },
      }).catch(() => {});
    }
  };

  const handleManualSub = async () => {
    if (!manualSubAlumno || !manualFechaFin) return;
    setSavingManual(true);

    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

    const { data: planesData } = await supabase.from("planes").select("id").eq("activo", true).limit(1);
    const planId = planesData?.[0]?.id;

    if (!planId) {
      toast.error("No hay planes activos para asociar la suscripción.");
      setSavingManual(false);
      return;
    }

    const { data: pendingSubs } = await supabase
      .from("suscripciones")
      .select("id")
      .eq("alumno_id", manualSubAlumno.id)
      .eq("estado", "pendiente_verificacion");

    const hasPendingPayment = pendingSubs && pendingSubs.length > 0;

    await supabase
      .from("suscripciones")
      .update({ estado: "vencida" })
      .eq("alumno_id", manualSubAlumno.id)
      .eq("estado", "activa");

    if (hasPendingPayment) {
      await supabase
        .from("suscripciones")
        .update({ estado: "activa", fecha_inicio: todayStr, fecha_fin: manualFechaFin })
        .eq("alumno_id", manualSubAlumno.id)
        .eq("estado", "pendiente_verificacion");
    } else {
      const { error } = await supabase.from("suscripciones").insert({
        alumno_id: manualSubAlumno.id,
        plan_id: planId,
        estado: "activa",
        fecha_inicio: todayStr,
        fecha_fin: manualFechaFin,
        mp_status: "manual",
      });

      if (error) {
        toast.error("Error al crear la suscripción.");
        setSavingManual(false);
        return;
      }
    }

    await supabase.from("alumnos").update({ estado: "activo" }).eq("id", manualSubAlumno.id);

    const emailType = hasPendingPayment ? "pago_confirmado" : "habilitado";
    supabase.functions.invoke("notify-student-update", {
      body: { alumno_id: manualSubAlumno.id, type: emailType, fecha_vencimiento: manualFechaFin },
    }).catch(() => {});

    toast.success(`Suscripción manual creada para ${manualSubAlumno.nombre} hasta ${manualFechaFin}`);
    setManualSubAlumno(null);
    setManualFechaFin("");
    setSavingManual(false);
    fetchAlumnos();
  };

  const handleDeleteAlumno = async () => {
    if (!deleteAlumno) return;
    await supabase.from("entrenamientos_realizados").delete().eq("alumno_id", deleteAlumno.id);
    await supabase.from("suscripciones").delete().eq("alumno_id", deleteAlumno.id);
    const { error } = await supabase.from("alumnos").delete().eq("id", deleteAlumno.id);
    if (error) {
      toast.error("Error al eliminar el alumno.");
    } else {
      toast.success(`${deleteAlumno.nombre} fue eliminado.`);
    }
    setDeleteAlumno(null);
    fetchAlumnos();
  };

  // Subscriptions
  const [suscripciones, setSuscripciones] = useState<SuscripcionConPlan[]>([]);
  const [planes, setPlanes] = useState<Plan[]>([]);
  const [changePlanAlumno, setChangePlanAlumno] = useState<Alumno | null>(null);
  const [newPlanId, setNewPlanId] = useState("");
  const [savingPlan, setSavingPlan] = useState(false);

  useEffect(() => {
    supabase.from("suscripciones").select("id, alumno_id, plan_id, estado, fecha_inicio, fecha_fin, planes(id, nombre, precio, moneda)").then(({ data }) => {
      setSuscripciones((data as any) || []);
    });
    supabase.from("planes").select("*").eq("activo", true).order("nombre").then(({ data }) => {
      setPlanes(data || []);
    });
  }, [alumnos]);

  const getActiveSub = (alumnoId: string) => {
    return suscripciones.find(s => s.alumno_id === alumnoId && (s.estado === "activa" || s.estado === "pendiente_verificacion" || s.estado === "pausa"));
  };

  const getAnySub = (alumnoId: string) => {
    // Get most recent subscription regardless of state
    const subs = suscripciones.filter(s => s.alumno_id === alumnoId);
    return subs.sort((a, b) => (b.fecha_fin || "").localeCompare(a.fecha_fin || ""))[0] || null;
  };

  const handleChangePlan = async () => {
    if (!changePlanAlumno || !newPlanId) return;
    setSavingPlan(true);
    try {
      const activeSub = getActiveSub(changePlanAlumno.id);
      const selectedPlan = planes.find(p => p.id === newPlanId);
      
      if (activeSub) {
        const { error } = await supabase.from("suscripciones").update({ plan_id: newPlanId } as any).eq("id", activeSub.id);
        if (error) throw error;
      } else {
        const today = new Date();
        const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
        const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        const endStr = lastDay.toISOString().split("T")[0];
        const { error } = await supabase.from("suscripciones").insert({
          alumno_id: changePlanAlumno.id,
          plan_id: newPlanId,
          estado: "activa",
          fecha_inicio: todayStr,
          fecha_fin: endStr,
          mp_status: "manual",
        });
        if (error) throw error;
      }

      supabase.functions.invoke("notify-student-update", {
        body: {
          alumno_id: changePlanAlumno.id,
          type: "plan_cambiado",
          plan_nombre: selectedPlan?.nombre || "Nuevo plan",
          plan_precio: selectedPlan?.precio,
          plan_moneda: selectedPlan?.moneda,
        },
      }).catch(() => {});

      toast.success(`Plan actualizado para ${changePlanAlumno.nombre}`);
      setChangePlanAlumno(null);
      setNewPlanId("");
      fetchAlumnos();
    } catch (err: any) {
      toast.error(err.message || "Error al cambiar el plan");
    } finally {
      setSavingPlan(false);
    }
  };

  const isPending = (a: Alumno) => {
    const hasPendingPayment = suscripciones.some(s => s.alumno_id === a.id && s.estado === "pendiente_verificacion");
    const needsPassword = !(a as any).password_set && (a as any).invited_at;
    const noGroup = a.grupo === "Sin grupo" && a.estado === "activo";
    return hasPendingPayment || needsPassword || noGroup;
  };

  // Detect inconsistencies
  const getAlumnoInconsistency = (alumno: Alumno): string | null => {
    const sub = getActiveSub(alumno.id);
    if (sub && isInconsistent(alumno.estado, sub.estado)) {
      return `${alumno.estado} + suscripción ${sub.estado}`;
    }
    return null;
  };

  const pendingCount = alumnos.filter(isPending).length;
  const activeCount = alumnos.filter(a => a.estado === "activo").length;
  const inactiveCount = alumnos.filter(a => a.estado === "inactivo").length;
  const blockedCount = alumnos.filter(a => a.estado === "bloqueado").length;
  const vacacionesCount = alumnos.filter(a => a.estado === "vacaciones").length;
  const inconsistentCount = alumnos.filter(a => getAlumnoInconsistency(a) !== null).length;

  const getEstadoBadge = (estado: string) => {
    switch (estado) {
      case "activo": return { variant: "default" as const, className: "" };
      case "inactivo": return { variant: "outline" as const, className: "" };
      case "bloqueado": return { variant: "destructive" as const, className: "" };
      case "vacaciones": return { variant: "secondary" as const, className: "border-blue-500/50 text-blue-500" };
      case "pendiente": return { variant: "outline" as const, className: "border-yellow-500/50 text-yellow-500" };
      default: return { variant: "outline" as const, className: "" };
    }
  };

  const getSubBadge = (estado: string) => {
    switch (estado) {
      case "activa": return { variant: "default" as const, className: "" };
      case "pausa": return { variant: "secondary" as const, className: "border-amber-500/50 text-amber-500" };
      case "vencida": return { variant: "destructive" as const, className: "" };
      case "pendiente": return { variant: "outline" as const, className: "border-yellow-500/50 text-yellow-500" };
      case "pendiente_verificacion": return { variant: "outline" as const, className: "border-yellow-500/50 text-yellow-500" };
      case "cancelada": return { variant: "outline" as const, className: "" };
      default: return { variant: "outline" as const, className: "" };
    }
  };

  const filtered = alumnos.filter((a) => {
    const matchesSearch = a.nombre.toLowerCase().includes(search.toLowerCase()) ||
      a.email.toLowerCase().includes(search.toLowerCase());
    if (!matchesSearch) return false;
    if (statusFilter === "pendientes") return isPending(a);
    if (statusFilter === "activos") return a.estado === "activo";
    if (statusFilter === "inactivos") return a.estado === "inactivo";
    if (statusFilter === "bloqueados") return a.estado === "bloqueado";
    if (statusFilter === "vacaciones") return a.estado === "vacaciones";
    if (statusFilter === "inconsistentes") return getAlumnoInconsistency(a) !== null;
    return true;
  });

  const openManualSub = (alumno: Alumno) => {
    setManualSubAlumno(alumno);
    const now = new Date();
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    setManualFechaFin(lastDay.toISOString().split("T")[0]);
  };

  // Render sub cell content
  const renderSubInfo = (alumno: Alumno) => {
    const sub = getActiveSub(alumno.id);
    const planName = sub?.planes?.nombre;
    const inconsistency = getAlumnoInconsistency(alumno);
    return (
      <div className="flex items-center gap-1 flex-wrap">
        {planName ? (
          <>
            <Badge variant="outline" className="text-xs cursor-pointer" onClick={() => { setChangePlanAlumno(alumno); setNewPlanId(sub?.plan_id || ""); }}>
              {planName}
              <Edit2 className="w-2.5 h-2.5 ml-1" />
            </Badge>
            {sub && sub.estado !== "activa" && (
              <Badge variant={getSubBadge(sub.estado).variant} className={`text-xs ${getSubBadge(sub.estado).className}`}>
                {sub.estado}
              </Badge>
            )}
          </>
        ) : (
          <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => { setChangePlanAlumno(alumno); setNewPlanId(""); }}>
            <CreditCard className="w-3 h-3 mr-1" /> Asignar
          </Button>
        )}
        {inconsistency && (
          <Badge variant="destructive" className="text-xs gap-1">
            <AlertTriangle className="w-2.5 h-2.5" />
            Inconsistente
          </Badge>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-xl md:text-2xl font-heading font-bold uppercase tracking-wider text-foreground">
              Alumnos
            </h2>
            {pendingCount > 0 && (
              <Badge variant="destructive" className="text-xs animate-pulse">
                {pendingCount} pendiente{pendingCount > 1 ? "s" : ""}
              </Badge>
            )}
            {inconsistentCount > 0 && (
              <Badge variant="destructive" className="text-xs gap-1">
                <AlertTriangle className="w-3 h-3" />
                {inconsistentCount} inconsistencia{inconsistentCount > 1 ? "s" : ""}
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {alumnos.length} alumnos registrados
          </p>
        </div>
      </div>

      <Tabs defaultValue="lista" className="w-full">
        <TabsList className="bg-secondary">
          <TabsTrigger value="lista" className="gap-1.5">
            <Users className="w-4 h-4" />
            Lista
          </TabsTrigger>
          <TabsTrigger value="importar" className="gap-1.5">
            <Upload className="w-4 h-4" />
            Importar
          </TabsTrigger>
        </TabsList>

        <TabsContent value="lista" className="space-y-5 mt-4">
          <div className="flex items-center justify-end">
            <Button variant="gold" size={isMobile ? "sm" : "default"} onClick={() => setShowCreate(true)}>
              <Plus className="w-4 h-4 mr-1" /> {isMobile ? "Nuevo" : "Agregar Alumno"}
            </Button>
          </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre o email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-secondary border-border"
          />
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          {([
            { key: "todos", label: `Todos (${alumnos.length})` },
            { key: "pendientes", label: `Pend. (${pendingCount})` },
            { key: "activos", label: `Activos (${activeCount})` },
            { key: "inactivos", label: `Inact. (${inactiveCount})` },
            { key: "bloqueados", label: `Bloq. (${blockedCount})` },
            { key: "vacaciones", label: `Vac. (${vacacionesCount})` },
            ...(inconsistentCount > 0 ? [{ key: "inconsistentes", label: `⚠ Incons. (${inconsistentCount})` }] : []),
          ]).map((f) => (
            <Button
              key={f.key}
              variant={statusFilter === f.key ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter(f.key)}
              className="text-xs"
            >
              {f.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Mobile card list */}
      {isMobile ? (
        <div className="space-y-3">
          {loading ? (
            <p className="text-center text-muted-foreground py-8">Cargando...</p>
          ) : filtered.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No se encontraron alumnos</p>
          ) : (
            filtered.map((alumno) => {
              const inconsistency = getAlumnoInconsistency(alumno);
              return (
                <div
                  key={alumno.id}
                  className={`glass-card rounded-lg p-4 space-y-2 ${inconsistency ? "border-destructive/50 border" : ""}`}
                  onClick={() => setDetailAlumno(alumno)}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-foreground text-sm truncate mr-2">
                      {alumno.nombre}
                    </span>
                    <Eye className="w-4 h-4 text-muted-foreground shrink-0" />
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge
                      variant={alumno.grupo === "Sin grupo" ? "destructive" : "secondary"}
                      className="font-mono text-xs"
                    >
                      {alumno.grupo}
                    </Badge>
                    <Badge variant={getEstadoBadge(alumno.estado).variant} className={`text-xs ${getEstadoBadge(alumno.estado).className}`}>
                      {alumno.estado}
                    </Badge>
                    {inconsistency && (
                      <Badge variant="destructive" className="text-xs gap-1">
                        <AlertTriangle className="w-2.5 h-2.5" /> Inconsistente
                      </Badge>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : (
        /* Desktop table */
        <div className="glass-card rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-muted-foreground">Nombre</TableHead>
                <TableHead className="text-muted-foreground hidden lg:table-cell">Email</TableHead>
                <TableHead className="text-muted-foreground">Grupo</TableHead>
                <TableHead className="text-muted-foreground">Plan / Suscripción</TableHead>
                <TableHead className="text-muted-foreground">Estado</TableHead>
                <TableHead className="text-muted-foreground text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">Cargando...</TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">No se encontraron alumnos</TableCell>
                </TableRow>
              ) : (
                filtered.map((alumno) => {
                  const grupoPreferido = (alumno as any).grupo_preferido;
                  const needsValidation = grupoPreferido && alumno.grupo === "Sin grupo";
                  const inconsistency = getAlumnoInconsistency(alumno);
                  return (
                    <TableRow key={alumno.id} className={`border-border ${needsValidation ? "bg-primary/5" : ""} ${inconsistency ? "bg-destructive/5" : ""}`}>
                      <TableCell className="font-medium text-foreground">
                        {alumno.nombre}
                        {needsValidation && (
                          <span className="ml-2 text-xs text-primary font-normal">Eligió: {grupoPreferido}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground hidden lg:table-cell">{alumno.email}</TableCell>
                      <TableCell>
                        {editingId === alumno.id ? (
                          <div className="flex items-center gap-1">
                            <select
                              value={editGrupo}
                              onChange={(e) => setEditGrupo(e.target.value)}
                              className="h-8 w-28 rounded-md border border-input bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                            >
                              {GRUPOS.map((g) => (
                                <option key={g} value={g}>{g}</option>
                              ))}
                            </select>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => saveGrupo(alumno.id)}>
                              <Check className="w-3 h-3 text-primary" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingId(null)}>
                              <X className="w-3 h-3" />
                            </Button>
                          </div>
                        ) : (
                          <Badge
                            variant={alumno.grupo === "Sin grupo" ? "destructive" : "secondary"}
                            className="font-mono text-xs cursor-pointer"
                            onClick={() => { setEditingId(alumno.id); setEditGrupo(alumno.grupo); }}
                          >
                            {alumno.grupo}
                            <Edit2 className="w-2.5 h-2.5 ml-1" />
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>{renderSubInfo(alumno)}</TableCell>
                      <TableCell>
                        <Badge variant={getEstadoBadge(alumno.estado).variant} className={`text-xs ${getEstadoBadge(alumno.estado).className}`}>
                          {alumno.estado}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right space-x-1">
                        {!(alumno as any).password_set && (alumno as any).invited_at && (
                          <Button variant="ghost" size="sm" disabled={resending === alumno.id} onClick={() => handleResendInvite(alumno)} className="text-xs" title="Reenviar invitación">
                            <MailPlus className="w-3 h-3 mr-1" /> {resending === alumno.id ? "Enviando…" : "Reenviar"}
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => openManualSub(alumno)} className="text-xs" title="Habilitar suscripción manual">
                          <CalendarCheck className="w-3 h-3 mr-1" /> Habilitar
                        </Button>
                        {/* State transition dropdown */}
                        {getValidTransitions(alumno.estado).length > 0 && (
                          <Select onValueChange={(val) => openStateChange(alumno, val)}>
                            <SelectTrigger className="h-7 w-32 text-xs bg-secondary border-border inline-flex">
                              <SelectValue placeholder="Estado →" />
                            </SelectTrigger>
                            <SelectContent>
                              {getValidTransitions(alumno.estado).map(e => (
                                <SelectItem key={e} value={e} className="text-xs">{e}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                        {/* Sub state change */}
                        {getActiveSub(alumno.id) && (
                          <Button variant="ghost" size="sm" onClick={() => openSubChange(alumno)} className="text-xs" title="Cambiar estado de suscripción">
                            <FileText className="w-3 h-3 mr-1" /> Sub.
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => setDetailAlumno(alumno)} className="text-xs">
                          <Eye className="w-3 h-3" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setDeleteAlumno(alumno)} className="text-xs text-destructive hover:text-destructive">
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Detail dialog */}
      <Dialog open={!!detailAlumno} onOpenChange={(open) => { if (!open) setDetailAlumno(null); }}>
        <DialogContent className="sm:max-w-md bg-card border-border max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading uppercase tracking-wider text-base">
              {detailAlumno?.nombre}
            </DialogTitle>
          </DialogHeader>
          {detailAlumno && (
            <div className="space-y-4 py-2">
              {/* Inconsistency alert */}
              {getAlumnoInconsistency(detailAlumno) && (
                <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
                  <span className="text-xs text-destructive">
                    Combinación inconsistente: {getAlumnoInconsistency(detailAlumno)}
                  </span>
                </div>
              )}

              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Email</span>
                  <span className="text-foreground text-right break-all ml-4">{detailAlumno.email}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">DNI/CUIT</span>
                  <span className="text-foreground font-mono">{detailAlumno.documento || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Teléfono</span>
                  <span className="text-foreground">{detailAlumno.telefono || "—"}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Grupo</span>
                  <Select
                    value={editGrupo || detailAlumno.grupo}
                    onValueChange={async (val) => {
                      setEditGrupo(val);
                      await supabase.from("alumnos").update({ grupo: val as any }).eq("id", detailAlumno.id);
                      toast.success("Grupo actualizado");
                      setDetailAlumno({ ...detailAlumno, grupo: val as any });
                      fetchAlumnos();
                      if (val !== "Sin grupo") {
                        supabase.functions.invoke("notify-student-update", {
                          body: { alumno_id: detailAlumno.id, type: "grupo_asignado", grupo: val },
                        }).catch(() => {});
                      }
                    }}
                  >
                    <SelectTrigger className="w-36 h-8 bg-secondary border-border text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="z-[100]">
                      {GRUPOS.map((g) => (
                        <SelectItem key={g} value={g}>{g}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Plan</span>
                  {(() => {
                    const sub = getActiveSub(detailAlumno.id);
                    return sub?.planes?.nombre ? (
                      <div className="flex items-center gap-1">
                        <Badge variant="outline" className="text-xs">{sub.planes.nombre}</Badge>
                        {sub.estado !== "activa" && (
                          <Badge variant={getSubBadge(sub.estado).variant} className={`text-xs ${getSubBadge(sub.estado).className}`}>
                            {sub.estado}
                          </Badge>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-xs">Sin plan</span>
                    );
                  })()}
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Estado</span>
                  <Badge variant={getEstadoBadge(detailAlumno.estado).variant} className={`text-xs ${getEstadoBadge(detailAlumno.estado).className}`}>
                    {detailAlumno.estado}
                  </Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Último acceso</span>
                  <span className="text-foreground text-xs">
                    {detailAlumno.updated_at
                      ? new Date(detailAlumno.updated_at).toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" })
                      : "—"}
                  </span>
                </div>
                {detailAlumno.notas && (
                  <div className="pt-2 border-t border-border">
                    <span className="text-muted-foreground text-xs block mb-1">Notas internas</span>
                    <p className="text-xs text-foreground whitespace-pre-wrap bg-secondary/50 rounded-md p-2">{detailAlumno.notas}</p>
                  </div>
                )}
                {(() => {
                  const sub = getActiveSub(detailAlumno.id);
                  if (!sub) return null;
                  return (
                    <div className="pt-2 border-t border-border space-y-1">
                      <span className="text-muted-foreground text-xs block">Suscripción</span>
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Inicio</span>
                        <span>{sub.fecha_inicio ? new Date(sub.fecha_inicio).toLocaleDateString("es-AR") : "—"}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Fin</span>
                        <span>{sub.fecha_fin ? new Date(sub.fecha_fin).toLocaleDateString("es-AR") : "—"}</span>
                      </div>
                    </div>
                  );
                })()}
              </div>
              <div className="flex flex-col gap-2 pt-2 border-t border-border">
                <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => {
                  setChangePlanAlumno(detailAlumno);
                  const sub = getActiveSub(detailAlumno.id);
                  setNewPlanId(sub?.plan_id || "");
                  setDetailAlumno(null);
                }}>
                  <CreditCard className="w-3 h-3 mr-2" /> Cambiar plan
                </Button>
                <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => {
                  openManualSub(detailAlumno);
                  setDetailAlumno(null);
                }}>
                  <CalendarCheck className="w-3 h-3 mr-2" /> Habilitar suscripción
                </Button>
                {getActiveSub(detailAlumno.id) && (
                  <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => {
                    openSubChange(detailAlumno);
                    setDetailAlumno(null);
                  }}>
                    <FileText className="w-3 h-3 mr-2" /> Cambiar estado suscripción
                  </Button>
                )}
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Cambiar estado usuario</Label>
                  {getValidTransitions(detailAlumno.estado).length > 0 ? (
                    <Select onValueChange={(val) => { openStateChange(detailAlumno, val); setDetailAlumno(null); }}>
                      <SelectTrigger className="bg-secondary border-border text-xs">
                        <SelectValue placeholder={`Estado actual: ${detailAlumno.estado}`} />
                      </SelectTrigger>
                      <SelectContent>
                        {getValidTransitions(detailAlumno.estado).map(e => (
                          <SelectItem key={e} value={e} className="text-xs">{e}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {detailAlumno.estado === "bloqueado" && !isSuperAdmin
                        ? "Solo Super Admin puede desbloquear"
                        : "Sin transiciones disponibles"}
                    </p>
                  )}
                </div>
                <Button variant="outline" size="sm" className="w-full justify-start text-destructive hover:text-destructive" onClick={() => {
                  setDeleteAlumno(detailAlumno);
                  setDetailAlumno(null);
                }}>
                  <Trash2 className="w-3 h-3 mr-2" /> Eliminar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* State change confirmation dialog */}
      <Dialog open={!!stateChangeAlumno} onOpenChange={(open) => { if (!open) setStateChangeAlumno(null); }}>
        <DialogContent className="sm:max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="font-heading uppercase tracking-wider">
              Cambiar estado de usuario
            </DialogTitle>
          </DialogHeader>
          {stateChangeAlumno && (
            <div className="space-y-4 py-2">
              <p className="text-sm text-muted-foreground">
                Alumno: <span className="text-foreground font-medium">{stateChangeAlumno.nombre}</span>
              </p>
              <div className="flex items-center gap-2 text-sm">
                <Badge variant={getEstadoBadge(stateChangeAlumno.estado).variant} className={`text-xs ${getEstadoBadge(stateChangeAlumno.estado).className}`}>
                  {stateChangeAlumno.estado}
                </Badge>
                <span className="text-muted-foreground">→</span>
                <Badge variant={getEstadoBadge(stateChangeTarget).variant} className={`text-xs ${getEstadoBadge(stateChangeTarget).className}`}>
                  {stateChangeTarget}
                </Badge>
              </div>

              {/* Auto-actions info */}
              {stateChangeTarget === "vacaciones" && (
                <p className="text-xs text-muted-foreground bg-secondary/50 rounded-md p-2">
                  ⚡ Las suscripciones activas se pausarán automáticamente.
                </p>
              )}
              {stateChangeTarget === "activo" && stateChangeAlumno.estado === "vacaciones" && (
                <p className="text-xs text-muted-foreground bg-secondary/50 rounded-md p-2">
                  ⚡ Las suscripciones en pausa se reactivarán automáticamente.
                </p>
              )}
              {stateChangeTarget === "bloqueado" && (
                <p className="text-xs text-destructive bg-destructive/10 rounded-md p-2">
                  ⚠ Se cancelarán todas las suscripciones activas/pausadas de este usuario.
                </p>
              )}

              <div className="space-y-2">
                <Label className="text-xs">Motivo (opcional)</Label>
                <Input
                  value={stateChangeMotivo}
                  onChange={(e) => setStateChangeMotivo(e.target.value)}
                  placeholder="Ej: Solicitud del alumno, falta de pago..."
                  className="bg-secondary border-border text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Nota interna (opcional)</Label>
                <Textarea
                  value={stateChangeNota}
                  onChange={(e) => setStateChangeNota(e.target.value)}
                  placeholder="Nota visible solo para administradores..."
                  className="bg-secondary border-border text-sm min-h-[60px]"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setStateChangeAlumno(null)}>Cancelar</Button>
            <Button
              variant={stateChangeTarget === "bloqueado" ? "destructive" : "gold"}
              disabled={savingState}
              onClick={executeStateChange}
            >
              {savingState ? "Guardando..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Subscription state change dialog */}
      <Dialog open={!!subChangeAlumno} onOpenChange={(open) => { if (!open) setSubChangeAlumno(null); }}>
        <DialogContent className="sm:max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="font-heading uppercase tracking-wider">
              Cambiar estado de suscripción
            </DialogTitle>
          </DialogHeader>
          {subChangeAlumno && (() => {
            const sub = getActiveSub(subChangeAlumno.id);
            const currentSubEstado = sub?.estado || "sin_suscripcion";
            const validTransitions = VALID_SUB_TRANSITIONS[currentSubEstado] || [];
            return (
              <div className="space-y-4 py-2">
                <p className="text-sm text-muted-foreground">
                  Alumno: <span className="text-foreground font-medium">{subChangeAlumno.nombre}</span>
                </p>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Suscripción actual:</span>
                  <Badge variant={getSubBadge(currentSubEstado).variant} className={`text-xs ${getSubBadge(currentSubEstado).className}`}>
                    {currentSubEstado}
                  </Badge>
                </div>
                {sub?.fecha_fin && (
                  <p className="text-xs text-muted-foreground">
                    Vence: {new Date(sub.fecha_fin).toLocaleDateString("es-AR")}
                  </p>
                )}
                <div className="space-y-2">
                  <Label className="text-xs">Nuevo estado</Label>
                  <Select value={subChangeTarget} onValueChange={setSubChangeTarget}>
                    <SelectTrigger className="bg-secondary border-border text-xs">
                      <SelectValue placeholder="Seleccionar estado" />
                    </SelectTrigger>
                    <SelectContent>
                      {validTransitions.map(e => {
                        const wouldBeInvalid = isInconsistent(subChangeAlumno.estado, e);
                        return (
                          <SelectItem key={e} value={e} className={`text-xs ${wouldBeInvalid ? "text-destructive" : ""}`}>
                            {e} {wouldBeInvalid ? "⚠ inconsistente" : ""}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
                {subChangeTarget && isInconsistent(subChangeAlumno.estado, subChangeTarget) && (
                  <div className="rounded-md border border-destructive/50 bg-destructive/10 p-2 text-xs text-destructive flex items-center gap-2">
                    <AlertTriangle className="w-3 h-3 shrink-0" />
                    Combinación inválida: usuario "{subChangeAlumno.estado}" + suscripción "{subChangeTarget}"
                  </div>
                )}
                <div className="space-y-2">
                  <Label className="text-xs">Motivo (opcional)</Label>
                  <Input
                    value={subChangeMotivo}
                    onChange={(e) => setSubChangeMotivo(e.target.value)}
                    placeholder="Motivo del cambio..."
                    className="bg-secondary border-border text-sm"
                  />
                </div>
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSubChangeAlumno(null)}>Cancelar</Button>
            <Button
              variant="gold"
              disabled={!subChangeTarget || savingSub || (subChangeAlumno ? isInconsistent(subChangeAlumno.estado, subChangeTarget) : false)}
              onClick={executeSubChange}
            >
              {savingSub ? "Guardando..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manual subscription dialog */}
      <Dialog open={!!manualSubAlumno} onOpenChange={(open) => { if (!open) setManualSubAlumno(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading uppercase tracking-wider">
              Habilitar suscripción manual
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Alumno: <span className="text-foreground font-medium">{manualSubAlumno?.nombre}</span>
            </p>
            <div className="space-y-2">
              <Label htmlFor="fecha-fin">Fecha de vencimiento</Label>
              <Input
                id="fecha-fin"
                type="date"
                value={manualFechaFin}
                onChange={(e) => setManualFechaFin(e.target.value)}
                className="bg-secondary border-border"
              />
              <p className="text-xs text-muted-foreground">
                Útil para pagos en efectivo o meses por adelantado
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManualSubAlumno(null)}>Cancelar</Button>
            <Button variant="gold" disabled={!manualFechaFin || savingManual} onClick={handleManualSub}>
              {savingManual ? "Guardando..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteAlumno} onOpenChange={(open) => { if (!open) setDeleteAlumno(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar a {deleteAlumno?.nombre}?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminarán todos sus datos, suscripciones y registros de entrenamientos. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteAlumno} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Create alumno dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="font-heading uppercase tracking-wider">Agregar Alumno</DialogTitle>
            <DialogDescription>Se enviará una invitación por email para que active su cuenta.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nombre completo *</Label>
              <Input value={createForm.nombre} onChange={(e) => setCreateForm({ ...createForm, nombre: e.target.value })} className="bg-secondary border-border" placeholder="Juan Pérez" />
            </div>
            <div className="space-y-2">
              <Label>Email *</Label>
              <Input type="email" value={createForm.email} onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })} className="bg-secondary border-border" placeholder="alumno@ejemplo.com" />
            </div>
            <div className="space-y-2">
              <Label>Teléfono</Label>
              <Input value={createForm.telefono} onChange={(e) => setCreateForm({ ...createForm, telefono: e.target.value })} className="bg-secondary border-border" placeholder="Opcional" />
            </div>
            <div className="space-y-2">
              <Label>DNI/CUIT</Label>
              <Input value={createForm.documento} onChange={(e) => setCreateForm({ ...createForm, documento: e.target.value })} className="bg-secondary border-border" placeholder="Opcional" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancelar</Button>
            <Button variant="gold" disabled={creating} onClick={handleCreateAlumno}>
              {creating ? "Enviando..." : "Enviar invitación"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change plan dialog */}
      <Dialog open={!!changePlanAlumno} onOpenChange={(open) => { if (!open) { setChangePlanAlumno(null); setNewPlanId(""); } }}>
        <DialogContent className="sm:max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="font-heading uppercase tracking-wider">Cambiar plan</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Alumno: <span className="text-foreground font-medium">{changePlanAlumno?.nombre}</span>
            </p>
            {(() => {
              const sub = changePlanAlumno ? getActiveSub(changePlanAlumno.id) : null;
              return sub?.planes ? (
                <p className="text-sm text-muted-foreground">
                  Plan actual: <span className="text-foreground font-medium">{sub.planes.nombre}</span> — {sub.planes.moneda} {sub.planes.precio}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">Sin plan activo actualmente</p>
              );
            })()}
            <div className="space-y-2">
              <Label>Nuevo plan</Label>
              <Select value={newPlanId} onValueChange={setNewPlanId}>
                <SelectTrigger className="bg-secondary border-border">
                  <SelectValue placeholder="Seleccionar plan" />
                </SelectTrigger>
                <SelectContent>
                  {planes.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nombre} — {p.moneda} {p.precio}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              El alumno recibirá un email informándole del cambio de plan.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setChangePlanAlumno(null); setNewPlanId(""); }}>Cancelar</Button>
            <Button variant="gold" disabled={!newPlanId || savingPlan} onClick={handleChangePlan}>
              {savingPlan ? "Guardando..." : "Confirmar cambio"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
        </TabsContent>

        <TabsContent value="importar" className="mt-4">
          <ImportStudentsContent />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ManageStudents;
