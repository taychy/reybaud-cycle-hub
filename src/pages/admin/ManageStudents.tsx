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
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Search, Edit2, Check, X, CalendarCheck, Trash2, Plus, Eye, MailPlus, Upload, Users, CreditCard, AlertTriangle, FileText, MoreVertical, Palmtree, Ban, UserCheck, UserX, Pause, Play, RefreshCw, Copy, Smartphone } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import { ImportStudentsContent } from "./ImportStudents";
import { StudentActivityLog } from "@/components/admin/StudentActivityLog";
import { logStudentActivity } from "@/lib/logStudentActivity";

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

const VALID_TRANSITIONS_ADMIN: Record<string, string[]> = {
  pendiente: ["activo", "inactivo"],
  activo: ["vacaciones", "inactivo"],
  vacaciones: ["activo"],
  inactivo: ["activo"],
  bloqueado: [],
};

const VALID_TRANSITIONS_SUPER: Record<string, string[]> = {
  pendiente: ["activo", "inactivo"],
  activo: ["vacaciones", "inactivo", "bloqueado"],
  vacaciones: ["activo"],
  inactivo: ["activo"],
  bloqueado: ["activo"],
};

const VALID_SUB_TRANSITIONS: Record<string, string[]> = {
  activa: ["vencida", "pausa"],
  vencida: ["activa", "cancelada"],
  pausa: ["activa"],
  pendiente: ["activa", "cancelada"],
  pendiente_verificacion: ["activa", "cancelada"],
  cancelada: [],
};

const INVALID_COMBOS: [string, string][] = [
  ["vacaciones", "activa"],
  ["inactivo", "activa"],
  ["bloqueado", "activa"],
];

const isInconsistent = (userEstado: string, subEstado: string | undefined): boolean => {
  if (!subEstado) return false;
  return INVALID_COMBOS.some(([u, s]) => u === userEstado && s === subEstado);
};

// Direct field access — data is now properly split in DB
const getApellido = (alumno: Alumno): string => (alumno as any).apellido || "";
const getFullName = (alumno: Alumno) => {
  const apellido = getApellido(alumno);
  return apellido ? `${alumno.nombre} ${apellido}` : alumno.nombre;
};

// Profile completeness detection
const getProfileMissing = (alumno: Alumno, subEstado: string): string[] => {
  const missing: string[] = [];
  if (!getApellido(alumno)) missing.push("Apellido");
  if (!alumno.telefono) missing.push("Teléfono");
  if (!alumno.documento) missing.push("DNI/CUIT");
  if (alumno.grupo === "Sin grupo" && alumno.estado === "activo") missing.push("Grupo");
  if (subEstado === "sin_suscripcion" && alumno.estado === "activo") missing.push("Plan/Suscripción");
  return missing;
};
const isProfileIncomplete = (alumno: Alumno, subEstado: string) => getProfileMissing(alumno, subEstado).length > 0;

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

  // Drawer detail
  const [drawerAlumno, setDrawerAlumno] = useState<Alumno | null>(null);
  const [editingDetail, setEditingDetail] = useState(false);
  const [detailForm, setDetailForm] = useState({ nombre: "", apellido: "", email: "", telefono: "", documento: "", notas: "" });

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
  const [createForm, setCreateForm] = useState({ nombre: "", apellido: "", email: "", telefono: "", documento: "" });
  const [creating, setCreating] = useState(false);

  // Admin role
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const [resending, setResending] = useState<string | null>(null);
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

  // Subscriptions
  const [suscripciones, setSuscripciones] = useState<SuscripcionConPlan[]>([]);
  const [planes, setPlanes] = useState<Plan[]>([]);
  const [changePlanAlumno, setChangePlanAlumno] = useState<Alumno | null>(null);
  const [newPlanId, setNewPlanId] = useState("");
  const [savingPlan, setSavingPlan] = useState(false);

  // Sedes
  const [sedes, setSedes] = useState<{ id: string; nombre: string }[]>([]);

  useEffect(() => {
    supabase.from("suscripciones").select("id, alumno_id, plan_id, estado, fecha_inicio, fecha_fin, planes(id, nombre, precio, moneda)").then(({ data }) => {
      setSuscripciones((data as any) || []);
    });
    supabase.from("planes").select("*").eq("activo", true).order("nombre").then(({ data }) => {
      setPlanes(data || []);
    });
    supabase.from("sedes").select("id, nombre").eq("activa", true).order("nombre").then(({ data }) => {
      setSedes(data || []);
    });
  }, [alumnos]);

  const getActiveSub = (alumnoId: string) => {
    const today = new Date().toISOString().split("T")[0];
    return suscripciones.find(s => s.alumno_id === alumnoId && (s.estado === "activa" || s.estado === "pendiente_verificacion" || s.estado === "pausa") && (!s.fecha_fin || s.fecha_fin >= today));
  };

  const getAnySub = (alumnoId: string) => {
    const subs = suscripciones.filter(s => s.alumno_id === alumnoId);
    return subs.sort((a, b) => (b.fecha_fin || "").localeCompare(a.fecha_fin || ""))[0] || null;
  };

  const getSubEstadoLabel = (alumnoId: string): string => {
    const active = getActiveSub(alumnoId);
    if (active) return active.estado;
    const any = getAnySub(alumnoId);
    if (any) {
      if (any.estado === "vencida") return "vencida";
      if (any.estado === "cancelada") return "cancelada";
      return any.estado;
    }
    return "sin_suscripcion";
  };

  const getAlumnoInconsistency = (alumno: Alumno): string | null => {
    const sub = getActiveSub(alumno.id);
    if (sub && isInconsistent(alumno.estado, sub.estado)) {
      return `${alumno.estado} + suscripción ${sub.estado}`;
    }
    return null;
  };

  const getValidTransitions = (estado: string) => {
    return isSuperAdmin
      ? (VALID_TRANSITIONS_SUPER[estado] || [])
      : (VALID_TRANSITIONS_ADMIN[estado] || []);
  };

  // --- Counts ---
  const pendingCount = alumnos.filter(a => a.estado === "pendiente").length;
  const activeCount = alumnos.filter(a => a.estado === "activo").length;
  const vacacionesCount = alumnos.filter(a => a.estado === "vacaciones").length;
  const inactiveCount = alumnos.filter(a => a.estado === "inactivo").length;
  const blockedCount = alumnos.filter(a => a.estado === "bloqueado").length;
  const vencidosCount = alumnos.filter(a => {
    const subE = getSubEstadoLabel(a.id);
    return subE === "vencida" && a.estado === "activo";
  }).length;
  const sinGrupoCount = alumnos.filter(a => a.grupo === "Sin grupo" && a.estado === "activo").length;
  const inconsistentCount = alumnos.filter(a => getAlumnoInconsistency(a) !== null).length;
  const incompletosCount = alumnos.filter(a => isProfileIncomplete(a, getSubEstadoLabel(a.id))).length;

  // --- Duplicates detection (by email) ---
  const duplicateEmailSet = new Set<string>();
  const emailCount: Record<string, number> = {};
  alumnos.forEach(a => {
    const e = a.email.toLowerCase().trim();
    emailCount[e] = (emailCount[e] || 0) + 1;
  });
  Object.entries(emailCount).forEach(([email, count]) => {
    if (count > 1) duplicateEmailSet.add(email);
  });
  // Also detect by nombre+apellido
  const nameCount: Record<string, number> = {};
  alumnos.forEach(a => {
    const key = `${a.nombre.toLowerCase().trim()}|${(getApellido(a) || "").toLowerCase().trim()}`;
    if (key !== "|") nameCount[key] = (nameCount[key] || 0) + 1;
  });
  const duplicateNameSet = new Set<string>();
  Object.entries(nameCount).forEach(([key, count]) => {
    if (count > 1) duplicateNameSet.add(key);
  });
  const isDuplicate = (a: Alumno) => {
    const emailDup = duplicateEmailSet.has(a.email.toLowerCase().trim());
    const nameKey = `${a.nombre.toLowerCase().trim()}|${(getApellido(a) || "").toLowerCase().trim()}`;
    const nameDup = duplicateNameSet.has(nameKey);
    return emailDup || nameDup;
  };
  const duplicadosCount = alumnos.filter(isDuplicate).length;

  // --- Access status ---
  const conAccesoCount = alumnos.filter(a => !!a.user_id).length;
  const sinAccesoCount = alumnos.filter(a => !a.user_id).length;

  // --- Filters ---
  const filtered = alumnos.filter((a) => {
    const matchesSearch = a.nombre.toLowerCase().includes(search.toLowerCase()) ||
      a.email.toLowerCase().includes(search.toLowerCase()) ||
      getApellido(a).toLowerCase().includes(search.toLowerCase());
    if (!matchesSearch) return false;
    switch (statusFilter) {
      case "pendientes": return a.estado === "pendiente";
      case "activos": return a.estado === "activo";
      case "vacaciones": return a.estado === "vacaciones";
      case "inactivos": return a.estado === "inactivo";
      case "bloqueados": return a.estado === "bloqueado";
      case "vencidos": return getSubEstadoLabel(a.id) === "vencida" && a.estado === "activo";
      case "sin_grupo": return a.grupo === "Sin grupo" && a.estado === "activo";
      case "inconsistentes": return getAlumnoInconsistency(a) !== null;
      case "incompletos": return isProfileIncomplete(a, getSubEstadoLabel(a.id));
      case "duplicados": return isDuplicate(a);
      case "con_acceso": return !!a.user_id;
      case "sin_acceso": return !a.user_id;
      default: return true;
    }
  });

  // --- Badges ---
  const getEstadoBadge = (estado: string) => {
    switch (estado) {
      case "activo": return { variant: "default" as const, className: "bg-emerald-600/20 text-emerald-400 border-emerald-500/30" };
      case "inactivo": return { variant: "outline" as const, className: "text-muted-foreground" };
      case "bloqueado": return { variant: "destructive" as const, className: "" };
      case "vacaciones": return { variant: "secondary" as const, className: "border-blue-500/50 text-blue-400" };
      case "pendiente": return { variant: "outline" as const, className: "border-yellow-500/50 text-yellow-400" };
      default: return { variant: "outline" as const, className: "" };
    }
  };

  const getSubBadge = (estado: string) => {
    switch (estado) {
      case "activa": return { variant: "default" as const, className: "bg-emerald-600/20 text-emerald-400 border-emerald-500/30" };
      case "pausa": return { variant: "secondary" as const, className: "border-amber-500/50 text-amber-400" };
      case "vencida": return { variant: "destructive" as const, className: "" };
      case "pendiente": case "pendiente_verificacion": return { variant: "outline" as const, className: "border-yellow-500/50 text-yellow-400" };
      case "cancelada": return { variant: "outline" as const, className: "text-muted-foreground" };
      case "sin_suscripcion": return { variant: "outline" as const, className: "text-muted-foreground border-dashed" };
      default: return { variant: "outline" as const, className: "" };
    }
  };

  // --- Context-sensitive actions for dropdown ---
  const getContextActions = (alumno: Alumno) => {
    const actions: { label: string; icon: any; action: () => void; destructive?: boolean; separator?: boolean }[] = [];
    const sub = getActiveSub(alumno.id);
    const estado = alumno.estado;

    actions.push({ label: "Ver detalle", icon: Eye, action: () => openDrawer(alumno) });

    // State transitions
    if (estado === "inactivo" || estado === "vacaciones") {
      actions.push({ label: "Reactivar", icon: Play, action: () => openStateChange(alumno, "activo") });
    }
    if (estado === "activo") {
      actions.push({ label: "Pausar (vacaciones)", icon: Palmtree, action: () => openStateChange(alumno, "vacaciones") });
      actions.push({ label: "Desactivar", icon: UserX, action: () => openStateChange(alumno, "inactivo") });
    }
    if (estado === "activo" && isSuperAdmin) {
      actions.push({ label: "Bloquear", icon: Ban, action: () => openStateChange(alumno, "bloqueado"), destructive: true });
    }
    if (estado === "bloqueado" && isSuperAdmin) {
      actions.push({ label: "Desbloquear", icon: UserCheck, action: () => openStateChange(alumno, "activo") });
    }
    if (estado === "pendiente") {
      actions.push({ label: "Aprobar (activar)", icon: UserCheck, action: () => openStateChange(alumno, "activo") });
    }

    actions.push({ label: "", icon: null, action: () => {}, separator: true });

    // Subscription actions
    if (sub && sub.estado === "activa") {
      actions.push({ label: "Pausar suscripción", icon: Pause, action: () => { setSubChangeAlumno(alumno); setSubChangeTarget("pausa"); setSubChangeMotivo(""); } });
    }
    if (sub && sub.estado === "pausa") {
      actions.push({ label: "Reactivar suscripción", icon: Play, action: () => { setSubChangeAlumno(alumno); setSubChangeTarget("activa"); setSubChangeMotivo(""); } });
    }
    if (sub) {
      actions.push({ label: "Cambiar estado suscripción", icon: FileText, action: () => openSubChange(alumno) });
    }
    actions.push({ label: "Habilitar suscripción manual", icon: CalendarCheck, action: () => openManualSub(alumno) });
    actions.push({ label: "Cambiar plan", icon: CreditCard, action: () => { setChangePlanAlumno(alumno); setNewPlanId(getActiveSub(alumno.id)?.plan_id || ""); } });

    actions.push({ label: "", icon: null, action: () => {}, separator: true });

    // Resend invite
    if (!(alumno as any).password_set && (alumno as any).invited_at) {
      actions.push({ label: "Reenviar invitación", icon: MailPlus, action: () => handleResendInvite(alumno) });
    }

    actions.push({ label: "Eliminar", icon: Trash2, action: () => setDeleteAlumno(alumno), destructive: true });

    return actions;
  };

  // --- Drawer ---
  const openDrawer = (alumno: Alumno) => {
    setDrawerAlumno(alumno);
    setEditingDetail(false);
    setDetailForm({
      nombre: alumno.nombre,
      apellido: getApellido(alumno),
      email: alumno.email,
      telefono: alumno.telefono || "",
      documento: alumno.documento || "",
      notas: alumno.notas || "",
    });
  };

  const saveDetail = async () => {
    if (!drawerAlumno) return;
    const fullName = detailForm.apellido ? `${detailForm.nombre} ${detailForm.apellido}` : detailForm.nombre;
    await supabase.from("alumnos").update({
      nombre: fullName,
      apellido: detailForm.apellido || null,
      email: detailForm.email,
      telefono: detailForm.telefono || null,
      documento: detailForm.documento || null,
      notas: detailForm.notas || null,
    } as any).eq("id", drawerAlumno.id);
    toast.success("Datos actualizados");
    setEditingDetail(false);
    fetchAlumnos();
    // Refresh drawer data
    const { data } = await supabase.from("alumnos").select("*").eq("id", drawerAlumno.id).maybeSingle();
    if (data) setDrawerAlumno(data);
  };

  // --- Handlers (same logic as before) ---
  const handleCreateAlumno = async () => {
    if (!createForm.nombre.trim() || !createForm.email.trim()) {
      toast.error("Nombre y email son obligatorios");
      return;
    }
    setCreating(true);
    try {
      const fullName = createForm.apellido ? `${createForm.nombre.trim()} ${createForm.apellido.trim()}` : createForm.nombre.trim();
      const { data, error } = await supabase.functions.invoke("invite-user", {
        body: {
          type: "alumno",
          nombre: fullName,
          email: createForm.email.trim(),
          telefono: createForm.telefono.trim() || null,
          documento: createForm.documento.trim() || null,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      // Save apellido if provided
      if (createForm.apellido.trim()) {
        await supabase.from("alumnos").update({ apellido: createForm.apellido.trim() } as any).eq("email", createForm.email.trim());
      }
      // Log activity
      const { data: newAlumno } = await supabase.from("alumnos").select("id").eq("email", createForm.email.trim().toLowerCase()).maybeSingle();
      if (newAlumno) {
        await logStudentActivity({ alumnoId: newAlumno.id, eventType: "alta", title: "Alta de alumno", description: `Creado e invitación enviada a ${createForm.email.trim()}`, actorRole: isSuperAdmin ? "super_admin" : "admin" });
      }
      toast.success(data?.message || "Alumno creado e invitación enviada");
      setShowCreate(false);
      setCreateForm({ nombre: "", apellido: "", email: "", telefono: "", documento: "" });
      fetchAlumnos();
    } catch (err: any) {
      toast.error(err.message || "Error al crear alumno");
    } finally {
      setCreating(false);
    }
  };

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
      await logStudentActivity({ alumnoId: alumno.id, eventType: "reenvio_invitacion", title: "Reenvío de invitación", description: `Email reenviado a ${alumno.email}`, actorRole: isSuperAdmin ? "super_admin" : "admin" });
    } catch (err: any) {
      toast.error(err.message || "Error al reenviar invitación");
    } finally {
      setResending(null);
    }
  };

  const openStateChange = (alumno: Alumno, targetEstado: string) => {
    setStateChangeAlumno(alumno);
    setStateChangeTarget(targetEstado);
    setStateChangeMotivo("");
    setStateChangeNota("");
  };

  const executeStateChange = async () => {
    if (!stateChangeAlumno || !stateChangeTarget) return;
    setSavingState(true);
    const alumno = stateChangeAlumno;
    const newEstado = stateChangeTarget;
    const updateData: any = { estado: newEstado };
    if (stateChangeNota) {
      updateData.notas = [alumno.notas, `[${new Date().toLocaleDateString("es-AR")}] ${stateChangeNota}`].filter(Boolean).join("\n");
    }
    await supabase.from("alumnos").update(updateData).eq("id", alumno.id);
    if (newEstado === "vacaciones") {
      await supabase.from("suscripciones").update({ estado: "pausa" }).eq("alumno_id", alumno.id).eq("estado", "activa");
    }
    if (newEstado === "activo" && alumno.estado === "vacaciones") {
      await supabase.from("suscripciones").update({ estado: "activa" }).eq("alumno_id", alumno.id).eq("estado", "pausa");
    }
    if (newEstado === "bloqueado") {
      await supabase.from("suscripciones").update({ estado: "cancelada", cancelada_motivo: stateChangeMotivo || "Usuario bloqueado" } as any).eq("alumno_id", alumno.id).in("estado", ["activa", "pausa"]);
    }
    toast.success(`${alumno.nombre} ahora está ${newEstado}`);
    await logStudentActivity({ alumnoId: alumno.id, eventType: "estado_usuario", title: `Estado → ${newEstado}`, description: `Cambio de "${alumno.estado}" a "${newEstado}"${stateChangeMotivo ? `. Motivo: ${stateChangeMotivo}` : ""}`, actorRole: isSuperAdmin ? "super_admin" : "admin" });
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      await supabase.from("audit_log").insert({
        user_id: session.user.id,
        user_email: session.user.email,
        user_role: isSuperAdmin ? "super_admin" : "admin",
        action: "cambio_estado",
        entity_type: "alumno",
        entity_id: alumno.id,
        details: { estado_anterior: alumno.estado, estado_nuevo: newEstado, motivo: stateChangeMotivo || null, nota: stateChangeNota || null },
      } as any);
    }
    if (newEstado === "activo") {
      const { data: subs } = await supabase.from("suscripciones").select("fecha_fin").eq("alumno_id", alumno.id).eq("estado", "activa").order("fecha_fin", { ascending: false }).limit(1);
      supabase.functions.invoke("notify-student-update", {
        body: { alumno_id: alumno.id, type: "habilitado", fecha_vencimiento: subs?.[0]?.fecha_fin || null },
      }).catch(() => {});
    }
    setSavingState(false);
    setStateChangeAlumno(null);
    fetchAlumnos();
  };

  const openSubChange = (alumno: Alumno) => {
    setSubChangeAlumno(alumno);
    setSubChangeTarget("");
    setSubChangeMotivo("");
  };

  const executeSubChange = async () => {
    if (!subChangeAlumno || !subChangeTarget) return;
    setSavingSub(true);
    const sub = getActiveSub(subChangeAlumno.id);
    if (!sub) { toast.error("No se encontró suscripción para modificar"); setSavingSub(false); return; }
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
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      await supabase.from("audit_log").insert({
        user_id: session.user.id, user_email: session.user.email,
        user_role: isSuperAdmin ? "super_admin" : "admin",
        action: "cambio_estado_suscripcion", entity_type: "suscripcion", entity_id: sub.id,
        details: { alumno: subChangeAlumno.nombre, estado_anterior: sub.estado, estado_nuevo: subChangeTarget, motivo: subChangeMotivo || null },
      } as any);
    }
    toast.success(`Suscripción de ${subChangeAlumno.nombre} actualizada a "${subChangeTarget}"`);
    await logStudentActivity({ alumnoId: subChangeAlumno.id, eventType: "estado_suscripcion", title: `Suscripción → ${subChangeTarget}`, description: `Cambio de "${sub.estado}" a "${subChangeTarget}"${subChangeMotivo ? `. Motivo: ${subChangeMotivo}` : ""}`, actorRole: isSuperAdmin ? "super_admin" : "admin", referenceType: "suscripcion", referenceId: sub.id });
    setSavingSub(false);
    setSubChangeAlumno(null);
    fetchAlumnos();
  };

  const openManualSub = (alumno: Alumno) => {
    setManualSubAlumno(alumno);
    const now = new Date();
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    setManualFechaFin(lastDay.toISOString().split("T")[0]);
  };

  const handleManualSub = async () => {
    if (!manualSubAlumno || !manualFechaFin) return;
    setSavingManual(true);
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const { data: planesData } = await supabase.from("planes").select("id").eq("activo", true).limit(1);
    const planId = planesData?.[0]?.id;
    if (!planId) { toast.error("No hay planes activos."); setSavingManual(false); return; }
    const { data: pendingSubs } = await supabase.from("suscripciones").select("id").eq("alumno_id", manualSubAlumno.id).eq("estado", "pendiente_verificacion");
    const hasPendingPayment = pendingSubs && pendingSubs.length > 0;
    await supabase.from("suscripciones").update({ estado: "vencida" }).eq("alumno_id", manualSubAlumno.id).eq("estado", "activa");
    if (hasPendingPayment) {
      await supabase.from("suscripciones").update({ estado: "activa", fecha_inicio: todayStr, fecha_fin: manualFechaFin }).eq("alumno_id", manualSubAlumno.id).eq("estado", "pendiente_verificacion");
    } else {
      const { error } = await supabase.from("suscripciones").insert({ alumno_id: manualSubAlumno.id, plan_id: planId, estado: "activa", fecha_inicio: todayStr, fecha_fin: manualFechaFin, mp_status: "manual" });
      if (error) { toast.error("Error al crear la suscripción."); setSavingManual(false); return; }
    }
    await supabase.from("alumnos").update({ estado: "activo" }).eq("id", manualSubAlumno.id);
    const emailType = hasPendingPayment ? "pago_confirmado" : "habilitado";
    supabase.functions.invoke("notify-student-update", { body: { alumno_id: manualSubAlumno.id, type: emailType, fecha_vencimiento: manualFechaFin } }).catch(() => {});
    toast.success(`Suscripción manual creada para ${manualSubAlumno.nombre} hasta ${manualFechaFin}`);
    await logStudentActivity({ alumnoId: manualSubAlumno.id, eventType: "pago", title: "Suscripción manual habilitada", description: `Vencimiento: ${manualFechaFin}`, actorRole: isSuperAdmin ? "super_admin" : "admin", referenceType: "suscripcion", referenceLabel: `Hasta ${manualFechaFin}` });
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
    if (error) { toast.error("Error al eliminar."); } else { toast.success(`${deleteAlumno.nombre} fue eliminado.`); }
    setDeleteAlumno(null);
    if (drawerAlumno?.id === deleteAlumno.id) setDrawerAlumno(null);
    fetchAlumnos();
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
        const { error } = await supabase.from("suscripciones").insert({ alumno_id: changePlanAlumno.id, plan_id: newPlanId, estado: "activa", fecha_inicio: todayStr, fecha_fin: endStr, mp_status: "manual" });
        if (error) throw error;
      }
      supabase.functions.invoke("notify-student-update", {
        body: { alumno_id: changePlanAlumno.id, type: "plan_cambiado", plan_nombre: selectedPlan?.nombre || "Nuevo plan", plan_precio: selectedPlan?.precio, plan_moneda: selectedPlan?.moneda },
      }).catch(() => {});
      toast.success(`Plan actualizado para ${changePlanAlumno.nombre}`);
      await logStudentActivity({ alumnoId: changePlanAlumno.id, eventType: "cambio_plan", title: "Cambio de plan", description: `Nuevo plan: ${selectedPlan?.nombre || "—"}`, actorRole: isSuperAdmin ? "super_admin" : "admin", referenceType: "plan", referenceId: newPlanId, referenceLabel: selectedPlan?.nombre || "—" });
      setChangePlanAlumno(null);
      setNewPlanId("");
      fetchAlumnos();
    } catch (err: any) {
      toast.error(err.message || "Error al cambiar el plan");
    } finally {
      setSavingPlan(false);
    }
  };

  const saveGrupo = async (id: string) => {
    await supabase.from("alumnos").update({ grupo: editGrupo as any }).eq("id", id);
    setEditingId(null);
    setAlumnos(prev => prev.map(a => a.id === id ? { ...a, grupo: editGrupo as any } : a));
    toast.success("Grupo actualizado");
    fetchAlumnos();
    if (editGrupo && editGrupo !== "Sin grupo") {
      supabase.functions.invoke("notify-student-update", { body: { alumno_id: id, type: "grupo_asignado", grupo: editGrupo } }).catch(() => {});
    }
  };

  // --- Filter chips ---
  const filters = [
    { key: "todos", label: "Todos", count: alumnos.length },
    { key: "pendientes", label: "Pendientes", count: pendingCount },
    { key: "activos", label: "Activos", count: activeCount },
    { key: "vacaciones", label: "Vacaciones", count: vacacionesCount },
    { key: "inactivos", label: "Inactivos", count: inactiveCount },
    { key: "bloqueados", label: "Bloqueados", count: blockedCount },
    { key: "vencidos", label: "Vencidos", count: vencidosCount },
    { key: "sin_grupo", label: "Sin grupo", count: sinGrupoCount },
    ...(inconsistentCount > 0 ? [{ key: "inconsistentes", label: "⚠ Incons.", count: inconsistentCount }] : []),
    ...(incompletosCount > 0 ? [{ key: "incompletos", label: "Incompletos", count: incompletosCount }] : []),
    ...(duplicadosCount > 0 ? [{ key: "duplicados", label: "Duplicados", count: duplicadosCount }] : []),
    { key: "con_acceso", label: "Con acceso", count: conAccesoCount },
    { key: "sin_acceso", label: "Sin acceso", count: sinAccesoCount },
  ];

  const formatDate = (d: string | null) => d ? new Date(d).toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" }) : "—";

  // --- RENDER ---
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl md:text-2xl font-heading font-bold uppercase tracking-wider text-foreground">
            Alumnos
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {alumnos.length} registrados · {activeCount} activos
          </p>
        </div>
      </div>

      <Tabs defaultValue="lista" className="w-full">
        <TabsList className="bg-secondary">
          <TabsTrigger value="lista" className="gap-1.5"><Users className="w-4 h-4" />Lista</TabsTrigger>
          <TabsTrigger value="importar" className="gap-1.5"><Upload className="w-4 h-4" />Importar</TabsTrigger>
        </TabsList>

        <TabsContent value="lista" className="space-y-5 mt-4">
          {/* Search + Add */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Buscar por nombre o email..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 bg-secondary border-border" />
            </div>
            <Button variant="gold" size={isMobile ? "sm" : "default"} onClick={() => setShowCreate(true)}>
              <Plus className="w-4 h-4 mr-1" /> {isMobile ? "Nuevo" : "Agregar Alumno"}
            </Button>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {filters.map((f) => (
              <Button
                key={f.key}
                variant={statusFilter === f.key ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter(f.key)}
                className="text-xs h-7"
              >
                {f.label} ({f.count})
              </Button>
            ))}
          </div>

          {/* Table / Cards */}
          {isMobile ? (
            <div className="space-y-2">
              {loading ? (
                <p className="text-center text-muted-foreground py-8">Cargando...</p>
              ) : filtered.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No se encontraron alumnos</p>
              ) : (
                filtered.map((alumno) => {
                  const apellido = getApellido(alumno);
                  const subEstado = getSubEstadoLabel(alumno.id);
                  const inconsistency = getAlumnoInconsistency(alumno);
                  const missing = getProfileMissing(alumno, subEstado);
                  return (
                    <div
                      key={alumno.id}
                      className={`glass-card rounded-lg p-3 space-y-2 cursor-pointer active:scale-[0.99] transition-transform ${inconsistency ? "border-destructive/50 border" : ""}`}
                      onClick={() => openDrawer(alumno)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="min-w-0">
                          <span className="font-medium text-foreground text-sm block truncate">{alumno.nombre}</span>
                          {apellido && <span className="text-xs text-muted-foreground truncate block">{apellido}</span>}
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-56">
                            {getContextActions(alumno).map((a, i) =>
                              a.separator ? <DropdownMenuSeparator key={i} /> : (
                                <DropdownMenuItem key={i} onClick={(e) => { e.stopPropagation(); a.action(); }} className={a.destructive ? "text-destructive focus:text-destructive" : ""}>
                                  {a.icon && <a.icon className="w-4 h-4 mr-2" />}
                                  {a.label}
                                </DropdownMenuItem>
                              )
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge variant={alumno.grupo === "Sin grupo" ? "destructive" : "secondary"} className="font-mono text-[10px]">{alumno.grupo}</Badge>
                        <Badge variant={getEstadoBadge(alumno.estado).variant} className={`text-[10px] ${getEstadoBadge(alumno.estado).className}`}>{alumno.estado}</Badge>
                        <Badge variant={getSubBadge(subEstado).variant} className={`text-[10px] ${getSubBadge(subEstado).className}`}>{subEstado === "sin_suscripcion" ? "Sin plan" : subEstado}</Badge>
                        {inconsistency && <Badge variant="destructive" className="text-[10px] gap-0.5"><AlertTriangle className="w-2.5 h-2.5" />!</Badge>}
                        {missing.length > 0 && !inconsistency && <Badge variant="outline" className="text-[10px] border-amber-500/50 text-amber-400 gap-0.5">Incompleto</Badge>}
                        {isDuplicate(alumno) && <Badge variant="outline" className="text-[10px] border-amber-500/50 text-amber-400 gap-0.5"><Copy className="w-2.5 h-2.5" />Dup</Badge>}
                        {!alumno.user_id && <Badge variant="outline" className="text-[10px] border-muted-foreground/30 text-muted-foreground gap-0.5">Sin acceso</Badge>}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          ) : (
            <div className="glass-card rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="text-muted-foreground">Nombre</TableHead>
                    <TableHead className="text-muted-foreground">Apellido</TableHead>
                    <TableHead className="text-muted-foreground">Grupo</TableHead>
                    <TableHead className="text-muted-foreground">Estado</TableHead>
                    <TableHead className="text-muted-foreground">Suscripción</TableHead>
                    <TableHead className="text-muted-foreground hidden xl:table-cell">Último acceso</TableHead>
                    <TableHead className="text-muted-foreground w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Cargando...</TableCell></TableRow>
                  ) : filtered.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No se encontraron alumnos</TableCell></TableRow>
                  ) : (
                    filtered.map((alumno) => {
                      const apellido = getApellido(alumno);
                      const subEstado = getSubEstadoLabel(alumno.id);
                      const inconsistency = getAlumnoInconsistency(alumno);
                      const missing = getProfileMissing(alumno, subEstado);
                      return (
                        <TableRow key={alumno.id} className={`border-border cursor-pointer hover:bg-muted/30 ${inconsistency ? "bg-destructive/5" : ""}`} onClick={() => openDrawer(alumno)}>
                          <TableCell className="font-medium text-foreground">
                            <div className="flex items-center gap-1.5">
                              {alumno.nombre}
                              <span title={alumno.user_id ? "Tiene acceso a la app" : "Sin acceso a la app"}>
                                <Smartphone className={`w-3.5 h-3.5 shrink-0 ${alumno.user_id ? "text-emerald-500" : "text-muted-foreground/40"}`} />
                              </span>
                              {isDuplicate(alumno) && <span title="Posible duplicado"><Copy className="w-3 h-3 text-amber-500 shrink-0" /></span>}
                              {missing.length > 0 && !inconsistency && (
                                <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" title={`Faltan: ${missing.join(", ")}`} />
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground">{apellido || <span className="text-amber-400/70 italic">sin apellido</span>}</TableCell>
                          <TableCell>
                            <Badge variant={alumno.grupo === "Sin grupo" ? "destructive" : "secondary"} className="font-mono text-xs">{alumno.grupo}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={getEstadoBadge(alumno.estado).variant} className={`text-xs ${getEstadoBadge(alumno.estado).className}`}>{alumno.estado}</Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Badge variant={getSubBadge(subEstado).variant} className={`text-xs ${getSubBadge(subEstado).className}`}>
                        <Badge variant={getSubBadge(subEstado).variant} className={`text-[10px] ${getSubBadge(subEstado).className}`}>{subEstado === "sin_suscripcion" ? "Sin plan" : subEstado}</Badge>
                              </Badge>
                              {inconsistency && <AlertTriangle className="w-3 h-3 text-destructive" />}
                            </div>
                          </TableCell>
                          <TableCell className="hidden xl:table-cell text-xs text-muted-foreground">
                            {formatDate(alumno.updated_at)}
                          </TableCell>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                  <MoreVertical className="w-4 h-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-56">
                                {getContextActions(alumno).map((a, i) =>
                                  a.separator ? <DropdownMenuSeparator key={i} /> : (
                                    <DropdownMenuItem key={i} onClick={() => a.action()} className={a.destructive ? "text-destructive focus:text-destructive" : ""}>
                                      {a.icon && <a.icon className="w-4 h-4 mr-2" />}
                                      {a.label}
                                    </DropdownMenuItem>
                                  )
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          )}

          {/* ===== RIGHT DRAWER (Detail) ===== */}
          <Sheet open={!!drawerAlumno} onOpenChange={(open) => { if (!open) setDrawerAlumno(null); }}>
            <SheetContent className="w-full sm:max-w-lg overflow-y-auto bg-card border-border">
              <SheetHeader>
                <SheetTitle className="font-heading uppercase tracking-wider text-base flex items-center gap-2">
                  Ficha del Alumno
                  {drawerAlumno && getAlumnoInconsistency(drawerAlumno) && (
                    <Badge variant="destructive" className="text-[10px] gap-0.5"><AlertTriangle className="w-3 h-3" /> Inconsistente</Badge>
                  )}
                </SheetTitle>
              </SheetHeader>

              {drawerAlumno && (() => {
                const sub = getActiveSub(drawerAlumno.id) || getAnySub(drawerAlumno.id);
                const subEstado = getSubEstadoLabel(drawerAlumno.id);
                const inconsistency = getAlumnoInconsistency(drawerAlumno);
                const missing = getProfileMissing(drawerAlumno, subEstado);
                return (
                  <div className="space-y-6 py-4">
                    {/* Inconsistency alert */}
                    {inconsistency && (
                      <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
                        <span className="text-xs text-destructive">Combinación inconsistente: {inconsistency}</span>
                      </div>
                    )}

                    {/* Incomplete profile alert */}
                    {missing.length > 0 && (
                      <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 space-y-1">
                        <span className="text-xs font-medium text-amber-400">Perfil incompleto</span>
                        <p className="text-xs text-amber-400/80">Faltan: {missing.join(", ")}</p>
                      </div>
                    )}

                    {/* Personal data */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-foreground">Datos personales</h3>
                        <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => setEditingDetail(!editingDetail)}>
                          <Edit2 className="w-3 h-3 mr-1" /> {editingDetail ? "Cancelar" : "Editar"}
                        </Button>
                      </div>

                      {editingDetail ? (
                        <div className="space-y-3">
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <Label className="text-xs">Nombre</Label>
                              <Input value={detailForm.nombre} onChange={(e) => setDetailForm({ ...detailForm, nombre: e.target.value })} className="bg-secondary border-border text-sm h-8" />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Apellido</Label>
                              <Input value={detailForm.apellido} onChange={(e) => setDetailForm({ ...detailForm, apellido: e.target.value })} className="bg-secondary border-border text-sm h-8" />
                            </div>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Email</Label>
                            <Input value={detailForm.email} onChange={(e) => setDetailForm({ ...detailForm, email: e.target.value })} className="bg-secondary border-border text-sm h-8" />
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <Label className="text-xs">Teléfono</Label>
                              <Input value={detailForm.telefono} onChange={(e) => setDetailForm({ ...detailForm, telefono: e.target.value })} className="bg-secondary border-border text-sm h-8" placeholder="Ej: 5491140312299" />
                              <p className="text-[10px] text-muted-foreground">Formato: 549 + código de área + número (sin 15)</p>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">DNI/CUIT</Label>
                              <Input value={detailForm.documento} onChange={(e) => setDetailForm({ ...detailForm, documento: e.target.value })} className="bg-secondary border-border text-sm h-8" placeholder="Ej: 17951790" />
                              <p className="text-[10px] text-muted-foreground">Solo números, sin puntos ni guiones</p>
                            </div>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Notas internas</Label>
                            <Textarea value={detailForm.notas} onChange={(e) => setDetailForm({ ...detailForm, notas: e.target.value })} className="bg-secondary border-border text-sm min-h-[60px]" />
                          </div>
                          <Button variant="gold" size="sm" onClick={saveDetail} className="w-full">Guardar cambios</Button>
                        </div>
                      ) : (
                        <div className="space-y-2 text-sm">
                          <DetailRow label="Nombre" value={drawerAlumno.nombre} />
                          <DetailRow label="Apellido" value={getApellido(drawerAlumno) || "—"} />
                          <DetailRow label="Email" value={drawerAlumno.email} mono />
                          <DetailRow label="Teléfono" value={drawerAlumno.telefono || "—"} />
                          <DetailRow label="DNI/CUIT" value={drawerAlumno.documento || "—"} mono />
                        </div>
                      )}
                    </div>

                    <Separator />

                    {/* Estado & grupo */}
                    <div className="space-y-3">
                      <h3 className="text-sm font-semibold text-foreground">Estado y grupo</h3>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">Estado usuario</span>
                          <Badge variant={getEstadoBadge(drawerAlumno.estado).variant} className={`text-xs ${getEstadoBadge(drawerAlumno.estado).className}`}>
                            {drawerAlumno.estado}
                          </Badge>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">Estado suscripción</span>
                          <Badge variant={getSubBadge(subEstado).variant} className={`text-xs ${getSubBadge(subEstado).className}`}>
                            {subEstado === "sin_suscripcion" ? "Sin plan" : subEstado}
                          </Badge>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">Grupo</span>
                          <Select
                            value={drawerAlumno.grupo}
                            onValueChange={async (val) => {
                              await supabase.from("alumnos").update({ grupo: val as any }).eq("id", drawerAlumno.id);
                              toast.success("Grupo actualizado");
                              setDrawerAlumno({ ...drawerAlumno, grupo: val as any });
                              fetchAlumnos();
                              if (val !== "Sin grupo") {
                                supabase.functions.invoke("notify-student-update", { body: { alumno_id: drawerAlumno.id, type: "grupo_asignado", grupo: val } }).catch(() => {});
                              }
                            }}
                          >
                            <SelectTrigger className="w-28 h-7 bg-secondary border-border text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="z-[100]">
                              {GRUPOS.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">Sede</span>
                          <Select
                            value={drawerAlumno.sede_id || "sin_sede"}
                            onValueChange={async (val) => {
                              const newVal = val === "sin_sede" ? null : val;
                              await supabase.from("alumnos").update({ sede_id: newVal } as any).eq("id", drawerAlumno.id);
                              toast.success("Sede actualizada");
                              setDrawerAlumno({ ...drawerAlumno, sede_id: newVal });
                              fetchAlumnos();
                            }}
                          >
                            <SelectTrigger className="w-32 h-7 bg-secondary border-border text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="z-[100]">
                              <SelectItem value="sin_sede">Sin sede</SelectItem>
                              {sedes.map((s) => <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <DetailRow label="Plan" value={sub?.planes?.nombre || "Sin plan"} />
                        <DetailRow label="Fecha de alta" value={formatDate(drawerAlumno.created_at)} />
                        <DetailRow label="Último acceso" value={formatDate(drawerAlumno.updated_at)} />
                      </div>
                    </div>

                    <Separator />

                    {/* Subscription details */}
                    {sub && (
                      <>
                        <div className="space-y-3">
                          <h3 className="text-sm font-semibold text-foreground">Suscripción</h3>
                          <div className="space-y-2 text-sm">
                            <DetailRow label="Plan" value={sub.planes?.nombre || "—"} />
                            <DetailRow label="Estado" value={sub.estado} />
                            <DetailRow label="Inicio" value={formatDate(sub.fecha_inicio)} />
                            <DetailRow label="Vencimiento" value={formatDate(sub.fecha_fin)} />
                          </div>
                        </div>
                        <Separator />
                      </>
                    )}

                    {/* Notas internas */}
                    {drawerAlumno.notas && !editingDetail && (
                      <>
                        <div className="space-y-2">
                          <h3 className="text-sm font-semibold text-foreground">Notas internas</h3>
                          <p className="text-xs text-foreground whitespace-pre-wrap bg-secondary/50 rounded-md p-3">{drawerAlumno.notas}</p>
                        </div>
                        <Separator />
                      </>
                    )}

                    {/* Activity Log */}
                    <StudentActivityLog alumnoId={drawerAlumno.id} />
                    <Separator />

                    {/* Actions */}
                    <div className="space-y-2">
                      <h3 className="text-sm font-semibold text-foreground">Acciones</h3>
                      <div className="grid grid-cols-2 gap-2">
                        {/* State transitions */}
                        {getValidTransitions(drawerAlumno.estado).map(e => (
                          <Button key={e} variant="outline" size="sm" className="text-xs justify-start" onClick={() => { openStateChange(drawerAlumno, e); setDrawerAlumno(null); }}>
                            {e === "activo" && <Play className="w-3 h-3 mr-1.5" />}
                            {e === "vacaciones" && <Palmtree className="w-3 h-3 mr-1.5" />}
                            {e === "inactivo" && <UserX className="w-3 h-3 mr-1.5" />}
                            {e === "bloqueado" && <Ban className="w-3 h-3 mr-1.5" />}
                            {e.charAt(0).toUpperCase() + e.slice(1)}
                          </Button>
                        ))}
                        {/* Sub actions */}
                        <Button variant="outline" size="sm" className="text-xs justify-start" onClick={() => { setChangePlanAlumno(drawerAlumno); setNewPlanId(getActiveSub(drawerAlumno.id)?.plan_id || ""); setDrawerAlumno(null); }}>
                          <CreditCard className="w-3 h-3 mr-1.5" /> Cambiar plan
                        </Button>
                        <Button variant="outline" size="sm" className="text-xs justify-start" onClick={() => { openManualSub(drawerAlumno); setDrawerAlumno(null); }}>
                          <CalendarCheck className="w-3 h-3 mr-1.5" /> Habilitar sub
                        </Button>
                        {getActiveSub(drawerAlumno.id) && (
                          <Button variant="outline" size="sm" className="text-xs justify-start" onClick={() => { openSubChange(drawerAlumno); setDrawerAlumno(null); }}>
                            <FileText className="w-3 h-3 mr-1.5" /> Estado sub
                          </Button>
                        )}
                        {!(drawerAlumno as any).password_set && (drawerAlumno as any).invited_at && (
                          <Button variant="outline" size="sm" className="text-xs justify-start" disabled={resending === drawerAlumno.id} onClick={() => handleResendInvite(drawerAlumno)}>
                            <MailPlus className="w-3 h-3 mr-1.5" /> Reenviar invite
                          </Button>
                        )}
                      </div>
                      <Button variant="outline" size="sm" className="w-full text-xs text-destructive hover:text-destructive justify-start mt-2" onClick={() => { setDeleteAlumno(drawerAlumno); setDrawerAlumno(null); }}>
                        <Trash2 className="w-3 h-3 mr-1.5" /> Eliminar alumno
                      </Button>
                    </div>
                  </div>
                );
              })()}
            </SheetContent>
          </Sheet>

          {/* ===== DIALOGS (unchanged logic) ===== */}

          {/* State change confirmation */}
          <Dialog open={!!stateChangeAlumno} onOpenChange={(open) => { if (!open) setStateChangeAlumno(null); }}>
            <DialogContent className="sm:max-w-md bg-card border-border">
              <DialogHeader>
                <DialogTitle className="font-heading uppercase tracking-wider">Cambiar estado</DialogTitle>
              </DialogHeader>
              {stateChangeAlumno && (
                <div className="space-y-4 py-2">
                  <p className="text-sm text-muted-foreground">
                    Alumno: <span className="text-foreground font-medium">{stateChangeAlumno.nombre}</span>
                  </p>
                  <div className="flex items-center gap-2 text-sm">
                    <Badge variant={getEstadoBadge(stateChangeAlumno.estado).variant} className={`text-xs ${getEstadoBadge(stateChangeAlumno.estado).className}`}>{stateChangeAlumno.estado}</Badge>
                    <span className="text-muted-foreground">→</span>
                    <Badge variant={getEstadoBadge(stateChangeTarget).variant} className={`text-xs ${getEstadoBadge(stateChangeTarget).className}`}>{stateChangeTarget}</Badge>
                  </div>
                  {stateChangeTarget === "vacaciones" && <p className="text-xs text-muted-foreground bg-secondary/50 rounded-md p-2">⚡ Las suscripciones activas se pausarán automáticamente.</p>}
                  {stateChangeTarget === "activo" && stateChangeAlumno.estado === "vacaciones" && <p className="text-xs text-muted-foreground bg-secondary/50 rounded-md p-2">⚡ Las suscripciones en pausa se reactivarán automáticamente.</p>}
                  {stateChangeTarget === "bloqueado" && <p className="text-xs text-destructive bg-destructive/10 rounded-md p-2">⚠ Se cancelarán todas las suscripciones activas/pausadas.</p>}
                  <div className="space-y-2">
                    <Label className="text-xs">Motivo (opcional)</Label>
                    <Input value={stateChangeMotivo} onChange={(e) => setStateChangeMotivo(e.target.value)} placeholder="Ej: Solicitud del alumno..." className="bg-secondary border-border text-sm" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Nota interna (opcional)</Label>
                    <Textarea value={stateChangeNota} onChange={(e) => setStateChangeNota(e.target.value)} placeholder="Nota visible solo para administradores..." className="bg-secondary border-border text-sm min-h-[60px]" />
                  </div>
                </div>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setStateChangeAlumno(null)}>Cancelar</Button>
                <Button variant={stateChangeTarget === "bloqueado" ? "destructive" : "gold"} disabled={savingState} onClick={executeStateChange}>
                  {savingState ? "Guardando..." : "Confirmar"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Subscription state change */}
          <Dialog open={!!subChangeAlumno} onOpenChange={(open) => { if (!open) setSubChangeAlumno(null); }}>
            <DialogContent className="sm:max-w-md bg-card border-border">
              <DialogHeader>
                <DialogTitle className="font-heading uppercase tracking-wider">Cambiar estado de suscripción</DialogTitle>
              </DialogHeader>
              {subChangeAlumno && (() => {
                const sub = getActiveSub(subChangeAlumno.id);
                const currentSubEstado = sub?.estado || "sin_suscripcion";
                const validTransitions = VALID_SUB_TRANSITIONS[currentSubEstado] || [];
                return (
                  <div className="space-y-4 py-2">
                    <p className="text-sm text-muted-foreground">Alumno: <span className="text-foreground font-medium">{subChangeAlumno.nombre}</span></p>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">Suscripción actual:</span>
                      <Badge variant={getSubBadge(currentSubEstado).variant} className={`text-xs ${getSubBadge(currentSubEstado).className}`}>{currentSubEstado}</Badge>
                    </div>
                    {sub?.fecha_fin && <p className="text-xs text-muted-foreground">Vence: {new Date(sub.fecha_fin).toLocaleDateString("es-AR")}</p>}
                    <div className="space-y-2">
                      <Label className="text-xs">Nuevo estado</Label>
                      <Select value={subChangeTarget} onValueChange={setSubChangeTarget}>
                        <SelectTrigger className="bg-secondary border-border text-xs"><SelectValue placeholder="Seleccionar estado" /></SelectTrigger>
                        <SelectContent>
                          {validTransitions.map(e => {
                            const wouldBeInvalid = isInconsistent(subChangeAlumno.estado, e);
                            return <SelectItem key={e} value={e} className={`text-xs ${wouldBeInvalid ? "text-destructive" : ""}`}>{e} {wouldBeInvalid ? "⚠ inconsistente" : ""}</SelectItem>;
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
                      <Input value={subChangeMotivo} onChange={(e) => setSubChangeMotivo(e.target.value)} placeholder="Motivo del cambio..." className="bg-secondary border-border text-sm" />
                    </div>
                  </div>
                );
              })()}
              <DialogFooter>
                <Button variant="outline" onClick={() => setSubChangeAlumno(null)}>Cancelar</Button>
                <Button variant="gold" disabled={!subChangeTarget || savingSub || (subChangeAlumno ? isInconsistent(subChangeAlumno.estado, subChangeTarget) : false)} onClick={executeSubChange}>
                  {savingSub ? "Guardando..." : "Confirmar"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Manual subscription */}
          <Dialog open={!!manualSubAlumno} onOpenChange={(open) => { if (!open) setManualSubAlumno(null); }}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader><DialogTitle className="font-heading uppercase tracking-wider">Habilitar suscripción manual</DialogTitle></DialogHeader>
              <div className="space-y-4 py-2">
                <p className="text-sm text-muted-foreground">Alumno: <span className="text-foreground font-medium">{manualSubAlumno?.nombre}</span></p>
                <div className="space-y-2">
                  <Label htmlFor="fecha-fin">Fecha de vencimiento</Label>
                  <Input id="fecha-fin" type="date" value={manualFechaFin} onChange={(e) => setManualFechaFin(e.target.value)} className="bg-secondary border-border" />
                  <p className="text-xs text-muted-foreground">Útil para pagos en efectivo o meses por adelantado</p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setManualSubAlumno(null)}>Cancelar</Button>
                <Button variant="gold" disabled={!manualFechaFin || savingManual} onClick={handleManualSub}>{savingManual ? "Guardando..." : "Confirmar"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Delete confirmation */}
          <AlertDialog open={!!deleteAlumno} onOpenChange={(open) => { if (!open) setDeleteAlumno(null); }}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>¿Eliminar a {deleteAlumno?.nombre}?</AlertDialogTitle>
                <AlertDialogDescription>Se eliminarán todos sus datos, suscripciones y registros. Esta acción no se puede deshacer.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleDeleteAlumno} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Eliminar</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Create alumno */}
          <Dialog open={showCreate} onOpenChange={setShowCreate}>
            <DialogContent className="sm:max-w-md bg-card border-border">
              <DialogHeader>
                <DialogTitle className="font-heading uppercase tracking-wider">Agregar Alumno</DialogTitle>
                <DialogDescription>Se enviará una invitación por email para que active su cuenta.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Nombre *</Label>
                    <Input value={createForm.nombre} onChange={(e) => setCreateForm({ ...createForm, nombre: e.target.value })} className="bg-secondary border-border" placeholder="Juan" />
                  </div>
                  <div className="space-y-2">
                    <Label>Apellido</Label>
                    <Input value={createForm.apellido} onChange={(e) => setCreateForm({ ...createForm, apellido: e.target.value })} className="bg-secondary border-border" placeholder="Pérez" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Email *</Label>
                  <Input type="email" value={createForm.email} onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })} className="bg-secondary border-border" placeholder="alumno@ejemplo.com" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Teléfono</Label>
                    <Input value={createForm.telefono} onChange={(e) => setCreateForm({ ...createForm, telefono: e.target.value })} className="bg-secondary border-border" placeholder="Ej: 5491140312299" />
                    <p className="text-[10px] text-muted-foreground">Formato: 549 + código de área + número (sin 15)</p>
                  </div>
                  <div className="space-y-2">
                    <Label>DNI/CUIT</Label>
                    <Input value={createForm.documento} onChange={(e) => setCreateForm({ ...createForm, documento: e.target.value })} className="bg-secondary border-border" placeholder="Ej: 17951790" />
                    <p className="text-[10px] text-muted-foreground">Solo números, sin puntos ni guiones</p>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowCreate(false)}>Cancelar</Button>
                <Button variant="gold" disabled={creating} onClick={handleCreateAlumno}>{creating ? "Enviando..." : "Enviar invitación"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Change plan */}
          <Dialog open={!!changePlanAlumno} onOpenChange={(open) => { if (!open) { setChangePlanAlumno(null); setNewPlanId(""); } }}>
            <DialogContent className="sm:max-w-md bg-card border-border">
              <DialogHeader><DialogTitle className="font-heading uppercase tracking-wider">Cambiar plan</DialogTitle></DialogHeader>
              <div className="space-y-4 py-2">
                <p className="text-sm text-muted-foreground">Alumno: <span className="text-foreground font-medium">{changePlanAlumno?.nombre}</span></p>
                {(() => {
                  const sub = changePlanAlumno ? getActiveSub(changePlanAlumno.id) : null;
                  return sub?.planes ? (
                    <p className="text-sm text-muted-foreground">Plan actual: <span className="text-foreground font-medium">{sub.planes.nombre}</span> — {sub.planes.moneda} {sub.planes.precio}</p>
                  ) : <p className="text-sm text-muted-foreground">Sin plan activo</p>;
                })()}
                <div className="space-y-2">
                  <Label>Nuevo plan</Label>
                  <Select value={newPlanId} onValueChange={setNewPlanId}>
                    <SelectTrigger className="bg-secondary border-border"><SelectValue placeholder="Seleccionar plan" /></SelectTrigger>
                    <SelectContent>{planes.map((p) => <SelectItem key={p.id} value={p.id}>{p.nombre} — {p.moneda} {p.precio}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <p className="text-xs text-muted-foreground">El alumno recibirá un email informándole del cambio.</p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setChangePlanAlumno(null); setNewPlanId(""); }}>Cancelar</Button>
                <Button variant="gold" disabled={!newPlanId || savingPlan} onClick={handleChangePlan}>{savingPlan ? "Guardando..." : "Confirmar"}</Button>
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

// Small detail row helper
const DetailRow = ({ label, value, mono }: { label: string; value: string; mono?: boolean }) => (
  <div className="flex justify-between items-center">
    <span className="text-muted-foreground text-xs">{label}</span>
    <span className={`text-foreground text-xs text-right break-all ml-4 ${mono ? "font-mono" : ""}`}>{value}</span>
  </div>
);

export default ManageStudents;
