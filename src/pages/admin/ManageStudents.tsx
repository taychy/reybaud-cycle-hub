import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { isDuplicateSubError, DUPLICATE_SUB_MSG } from "@/lib/subscriptionGuard";
import { endOfCalendarMonth } from "@/lib/subscriptionPeriod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuLabel } from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Search, Edit2, Check, X, CalendarCheck, Trash2, Plus, Eye, MailPlus, Upload, Users, CreditCard, AlertTriangle, FileText, MoreVertical, Palmtree, Ban, UserCheck, UserX, Pause, Play, RefreshCw, Copy, Smartphone, Pencil, ArrowUp, ArrowDown, ArrowUpDown, BellRing, DollarSign, Phone, MessageSquare, Mail, MapPin, Clock, HeartPulse, Maximize2, Minimize2, LogOut } from "lucide-react";
import ConfirmBajaDialog from "@/components/admin/ConfirmBajaDialog";
import type { Tables } from "@/integrations/supabase/types";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import { ImportStudentsContent } from "./ImportStudents";
import { StudentActivityLog } from "@/components/admin/StudentActivityLog";
import { StudentPlanSection } from "@/components/admin/StudentPlanSection";

import { StudentSaldoChip } from "@/components/admin/StudentSaldoChip";
import { MedicalCertificateSection } from "@/components/admin/MedicalCertificateSection";
import { StudentDiscountSection } from "@/components/admin/StudentDiscountSection";
import { StudentEmergencyFamilySection } from "@/components/admin/StudentEmergencyFamilySection";
import { StudentNotesSection } from "@/components/admin/StudentNotesSection";
import { logStudentActivity } from "@/lib/logStudentActivity";
import { getEffectiveSubStatus, isAdminPayableSubscription, SUB_STATUS_LABELS, SUB_STATUS_BADGE } from "@/lib/subscriptionStatus";
import { hasSubscriptionConflict } from "@/lib/subscriptionConflicts";
import { RegisterPaymentModal } from "@/components/admin/RegisterPaymentModal";
import { ManageSubscriptionModal } from "@/components/admin/ManageSubscriptionModal";

type Alumno = Tables<"alumnos">;
type Plan = Tables<"planes">;

interface SuscripcionConPlan {
  id: string;
  alumno_id: string;
  plan_id: string;
  estado: string;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  cancelada_at?: string | null;
  created_at: string;
  planes: { id: string; nombre: string; precio: number; moneda: string } | null;
}

const GRUPOS = ["G1", "G2", "G3", "G4", "Principiante", "Personalizado", "Sin grupo"] as const;

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
  pago_pendiente: ["activa", "cancelada"],
  acceso_pausado: ["activa", "cancelada"],
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
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [alumnos, setAlumnos] = useState<Alumno[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(searchParams.get("buscar") || "");
  const [statusFilter, setStatusFilter] = useState<string>(searchParams.get("filter") || "todos");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editGrupo, setEditGrupo] = useState<string>("");
  const [manualSubAlumno, setManualSubAlumno] = useState<Alumno | null>(null);
  const [manualFechaFin, setManualFechaFin] = useState("");
  const [savingManual, setSavingManual] = useState(false);
  const [deleteAlumno, setDeleteAlumno] = useState<Alumno | null>(null);

  // Drawer detail
  const [drawerAlumno, setDrawerAlumno] = useState<Alumno | null>(null);
  const [drawerExpanded, setDrawerExpanded] = useState(false);
  // Baja flow
  const [bajaAdminAlumno, setBajaAdminAlumno] = useState<Alumno | null>(null);
  const [bajaSolicitud, setBajaSolicitud] = useState<any>(null);
  const [reactivateAlumno, setReactivateAlumno] = useState<Alumno | null>(null);
  const [reactivateLoading, setReactivateLoading] = useState(false);
  const [editingDetail, setEditingDetail] = useState(false);
  const [detailForm, setDetailForm] = useState({ nombre: "", apellido: "", email: "", emails_adicionales: "", telefono: "", documento: "", notas: "", nombres_bancarios: "" });

  // Abrir drawer desde query ?alumno=ID (+ opcional &section=cuenta para scrollear)
  const alumnoQueryId = searchParams.get("alumno");
  const sectionQuery = searchParams.get("section");
  useEffect(() => {
    if (!alumnoQueryId || alumnos.length === 0) return;
    if (drawerAlumno?.id === alumnoQueryId) return;
    const found = alumnos.find(a => a.id === alumnoQueryId);
    if (found) setDrawerAlumno(found);
  }, [alumnoQueryId, alumnos]);

  // Scroll a la sección solicitada cuando el drawer ya está abierto
  useEffect(() => {
    if (!drawerAlumno || !sectionQuery) return;
    const anchorMap: Record<string, string> = {
      cuenta: "ficha-cuenta-corriente",
    };
    const id = anchorMap[sectionQuery];
    if (!id) return;
    // Esperar a que el drawer monte el contenido
    const t = setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 400);
    return () => clearTimeout(t);
  }, [drawerAlumno?.id, sectionQuery]);

  // State change dialog
  const [stateChangeAlumno, setStateChangeAlumno] = useState<Alumno | null>(null);
  const [stateChangeTarget, setStateChangeTarget] = useState<string>("");
  const [stateChangeMotivo, setStateChangeMotivo] = useState("");
  const [stateChangeNota, setStateChangeNota] = useState("");
  const [savingState, setSavingState] = useState(false);
  // Pause-specific extra fields (when target = vacaciones)
  const [pauseMotivoTipo, setPauseMotivoTipo] = useState<string>("");
  const [pauseFechaRetorno, setPauseFechaRetorno] = useState<string>("");
  const [pauseFollowup, setPauseFollowup] = useState<string>("");

  // Register contact dialog (paused student follow-up)
  const [contactAlumno, setContactAlumno] = useState<Alumno | null>(null);
  const [contactCanal, setContactCanal] = useState<string>("whatsapp");
  const [contactNota, setContactNota] = useState("");
  const [contactProxFollowup, setContactProxFollowup] = useState<string>("");
  const [savingContact, setSavingContact] = useState(false);

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
  const [overduePreviewRequestToken, setOverduePreviewRequestToken] = useState(0);
  const [regPayAlumno, setRegPayAlumno] = useState<Alumno | null>(null);
  const [manageSubAlumno, setManageSubAlumno] = useState<Alumno | null>(null);
  const isMobile = useIsMobile();

  // Sorting
  type SortKey = "nombre" | "apellido" | "grupo" | "estado" | "suscripcion" | "ultimo_acceso";
  type SortDir = "asc" | "desc" | null;
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);

  const toggleSort = (key: SortKey) => {
    if (sortKey !== key) { setSortKey(key); setSortDir("asc"); }
    else if (sortDir === "asc") { setSortDir("desc"); }
    else { setSortKey(null); setSortDir(null); }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown className="w-3 h-3 text-muted-foreground/50" />;
    return sortDir === "asc" ? <ArrowUp className="w-3 h-3 text-primary" /> : <ArrowDown className="w-3 h-3 text-primary" />;
  };

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
    supabase.from("suscripciones").select("id, alumno_id, plan_id, estado, fecha_inicio, fecha_fin, cancelada_at, created_at, planes(id, nombre, precio, moneda, categoria)").order("created_at", { ascending: false }).then(({ data }) => {
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
    return suscripciones.find(s => {
      if (s.alumno_id !== alumnoId) return false;
      const eff = getEffectiveSubStatus({ estado: s.estado, fecha_fin: s.fecha_fin, cancelada_at: s.cancelada_at });
      return eff === "activa" || eff === "pendiente_verificacion" || eff === "pausa" || eff === "pago_pendiente";
    });
  };

  const getPayableSub = (alumnoId: string) =>
    suscripciones.find(s => s.alumno_id === alumnoId && isAdminPayableSubscription(s));

  const getAnySub = (alumnoId: string) => {
    const subs = suscripciones.filter(s => s.alumno_id === alumnoId);
    return subs.sort((a, b) => (b.fecha_fin || "").localeCompare(a.fecha_fin || ""))[0] || null;
  };

  const getSubEstadoLabel = (alumnoId: string): string => {
    // Prioridad: 1) sub activa vigente (manda siempre);
    // 2) sub "cobrable" (vencida/pendiente) SOLO si no hay otra activa para el mismo plan;
    // 3) cualquiera (la más reciente por fecha_fin).
    const active = getActiveSub(alumnoId);
    if (active) {
      return getEffectiveSubStatus({ estado: active.estado, fecha_fin: active.fecha_fin, cancelada_at: active.cancelada_at });
    }
    const payable = getPayableSub(alumnoId);
    if (payable) {
      return getEffectiveSubStatus({ estado: payable.estado, fecha_fin: payable.fecha_fin, cancelada_at: payable.cancelada_at });
    }
    const any = getAnySub(alumnoId);
    if (any) {
      return getEffectiveSubStatus({ estado: any.estado, fecha_fin: any.fecha_fin, cancelada_at: any.cancelada_at });
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
  const pagoPendienteCount = alumnos.filter(a => getSubEstadoLabel(a.id) === "pago_pendiente").length;
  const accesoPausadoCount = alumnos.filter(a => getSubEstadoLabel(a.id) === "acceso_pausado").length;
  const sinGrupoCount = alumnos.filter(a => a.grupo === "Sin grupo" && a.estado === "activo").length;
  const inconsistentCount = alumnos.filter(a => getAlumnoInconsistency(a) !== null).length;
  const incompletosCount = alumnos.filter(a => isProfileIncomplete(a, getSubEstadoLabel(a.id))).length;
  const thirtyDaysAgoIso = new Date(Date.now() - 30 * 86400000).toISOString();
  const nuevosCount = alumnos.filter(a => a.created_at && a.created_at >= thirtyDaysAgoIso).length;

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

  // Alumnos con conflicto real de modalidad (no contar renovaciones legítimas ni
  // coexistencia válida entre Grupal + Pista + Asesoría).
  const today = new Date().toISOString().split("T")[0];
  const vigentesByAlumno: Record<string, any[]> = {};
  suscripciones.forEach(s => {
    if (s.estado === "activa" && !(s as any).cancelada_at && (!s.fecha_fin || s.fecha_fin >= today)) {
      (vigentesByAlumno[s.alumno_id] ||= []).push(s);
    }
  });
  const hasMultiSubs = (a: Alumno) => hasSubscriptionConflict(vigentesByAlumno[a.id] || []);
  const multiSubsCount = alumnos.filter(hasMultiSubs).length;

  // --- Access status ---
  const conAccesoCount = alumnos.filter(a => !!a.user_id).length;
  const sinAccesoCount = alumnos.filter(a => !a.user_id).length;

  // --- Plan-based counts ---
  const planCounts: Record<string, { name: string; count: number }> = {};
  const sinPlanIds = new Set<string>();
  alumnos.forEach(a => {
    const sub = getActiveSub(a.id) || getAnySub(a.id);
    if (sub && sub.planes) {
      const planId = sub.plan_id;
      if (!planCounts[planId]) planCounts[planId] = { name: (sub.planes as any).nombre, count: 0 };
      planCounts[planId].count++;
    } else {
      sinPlanIds.add(a.id);
    }
  });
  const sinPlanCount = sinPlanIds.size;

  // Alumnos activos sin suscripción activa vigente (= "sin plan activo")
  const sinPlanActivoCount = alumnos.filter(a => a.estado === "activo" && !getActiveSub(a.id)).length;

  // --- Filters ---
  const filtered = alumnos.filter((a) => {
    const normalizedSearch = search.toLowerCase().trim();
    const fullName = `${a.nombre} ${getApellido(a)}`.toLowerCase().replace(/\s+/g, " ").trim();
    const nombresBancarios: string[] = ((a as any).nombres_bancarios || []) as string[];
    const matchesSearch = fullName.includes(normalizedSearch) ||
      a.email.toLowerCase().includes(normalizedSearch) ||
      a.nombre.toLowerCase().includes(normalizedSearch) ||
      getApellido(a).toLowerCase().includes(normalizedSearch) ||
      nombresBancarios.some((nb) => (nb || "").toLowerCase().includes(normalizedSearch));
    if (!matchesSearch) return false;
    switch (statusFilter) {
      case "pendientes": return a.estado === "pendiente";
      case "activos": return a.estado === "activo";
      case "vacaciones": return a.estado === "vacaciones";
      case "inactivos": return a.estado === "inactivo";
      case "bloqueados": return a.estado === "bloqueado";
      case "vencidos": return getSubEstadoLabel(a.id) === "vencida" && a.estado === "activo";
      case "pago_pendiente": return getSubEstadoLabel(a.id) === "pago_pendiente";
      case "acceso_pausado": return getSubEstadoLabel(a.id) === "acceso_pausado";
      case "sin_grupo": return a.grupo === "Sin grupo" && a.estado === "activo";
      case "inconsistentes": return getAlumnoInconsistency(a) !== null;
      case "incompletos": return isProfileIncomplete(a, getSubEstadoLabel(a.id));
      case "duplicados": return isDuplicate(a);
      case "multi_subs": return hasMultiSubs(a);
      case "con_acceso": return !!a.user_id;
      case "sin_acceso": return !a.user_id;
      case "sin_plan": return sinPlanIds.has(a.id);
      case "sin_plan_activo": return a.estado === "activo" && !getActiveSub(a.id);
      case "nuevos": return !!a.created_at && a.created_at >= thirtyDaysAgoIso;
      default:
        if (statusFilter.startsWith("plan_")) {
          const planId = statusFilter.replace("plan_", "");
          const sub = getActiveSub(a.id) || getAnySub(a.id);
          return sub?.plan_id === planId;
        }
        return true;
    }
  });

  // --- Sorting ---
  const sorted = [...filtered].sort((a, b) => {
    if (!sortKey || !sortDir) return 0;
    let cmp = 0;
    switch (sortKey) {
      case "nombre": cmp = a.nombre.localeCompare(b.nombre, "es"); break;
      case "apellido": cmp = getApellido(a).localeCompare(getApellido(b), "es"); break;
      case "grupo": cmp = (a.grupo || "").localeCompare(b.grupo || "", "es"); break;
      case "estado": cmp = a.estado.localeCompare(b.estado, "es"); break;
      case "suscripcion": cmp = getSubEstadoLabel(a.id).localeCompare(getSubEstadoLabel(b.id), "es"); break;
      case "ultimo_acceso": cmp = (a.updated_at || "").localeCompare(b.updated_at || ""); break;
    }
    return sortDir === "desc" ? -cmp : cmp;
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
      case "pago_pendiente": return { variant: "outline" as const, className: "bg-amber-500/20 text-amber-400 border-amber-500/30" };
      case "acceso_pausado": return { variant: "destructive" as const, className: "bg-destructive/20 text-destructive border-destructive/30" };
      case "vencida": return { variant: "destructive" as const, className: "" };
      case "pendiente": case "pendiente_verificacion": return { variant: "outline" as const, className: "border-yellow-500/50 text-yellow-400" };
      case "cancelada": return { variant: "outline" as const, className: "text-muted-foreground" };
      case "sin_suscripcion": return { variant: "outline" as const, className: "text-muted-foreground border-dashed" };
      default: return { variant: "outline" as const, className: "" };
    }
  };

  // --- Context-sensitive actions for dropdown ---
  const getContextActions = (alumno: Alumno) => {
    const actions: { label: string; icon: any; action: () => void; destructive?: boolean; separator?: boolean; groupLabel?: string }[] = [];
    const sub = getActiveSub(alumno.id);
    const estado = alumno.estado;

    // --- General ---
    actions.push({ label: "", icon: null, action: () => {}, groupLabel: "General" });
    actions.push({ label: "Abrir ficha", icon: Eye, action: () => openDrawer(alumno) });
    if (isSuperAdmin) {
      actions.push({ label: "Ver como usuario", icon: Eye, action: () => navigate(`/admin/ver-como/${alumno.id}`) });
    }

    // --- Finanzas / suscripción ---
    actions.push({ label: "", icon: null, action: () => {}, separator: true });
    actions.push({ label: "", icon: null, action: () => {}, groupLabel: "Finanzas / suscripción" });
    actions.push({ label: "Registrar pago", icon: DollarSign, action: () => setRegPayAlumno(alumno) });
    actions.push({ label: "Gestionar suscripción", icon: CreditCard, action: () => setManageSubAlumno(alumno) });

    // --- Comunicación ---
    actions.push({ label: "", icon: null, action: () => {}, separator: true });
    actions.push({ label: "", icon: null, action: () => {}, groupLabel: "Comunicación" });
    if (!(alumno as any).password_set) {
      actions.push({ label: (alumno as any).invited_at ? "Reenviar invitación" : "Enviar invitación", icon: MailPlus, action: () => handleResendInvite(alumno) });
    }
    const subEstadoForNotif = getSubEstadoLabel(alumno.id);
    if (subEstadoForNotif === "pago_pendiente" || subEstadoForNotif === "acceso_pausado" || subEstadoForNotif === "vencida") {
      actions.push({ label: "Vista previa y enviar", icon: BellRing, action: () => openOverduePreview(alumno) });
    }

    // --- Acceso ---
    actions.push({ label: "", icon: null, action: () => {}, separator: true });
    actions.push({ label: "", icon: null, action: () => {}, groupLabel: "Acceso" });
    if (estado === "inactivo" || estado === "vacaciones") {
      actions.push({ label: "Reactivar acceso", icon: Play, action: () => openStateChange(alumno, "activo") });
    }
    if (estado === "activo") {
      actions.push({ label: "Pausar (vacaciones)", icon: Palmtree, action: () => openStateChange(alumno, "vacaciones") });
      actions.push({ label: "Desactivar acceso", icon: UserX, action: () => openStateChange(alumno, "inactivo") });
      actions.push({ label: "Dar de baja", icon: LogOut, action: () => handleStartBajaAdmin(alumno), destructive: true });
    }
    if (estado === "inactivo") {
      actions.push({ label: "Reactivar alumno", icon: UserCheck, action: () => setReactivateAlumno(alumno) });
    }
    if (estado === "pendiente") {
      actions.push({ label: "Aprobar (activar)", icon: UserCheck, action: () => openStateChange(alumno, "activo") });
    }
    if (estado === "activo" && isSuperAdmin) {
      actions.push({ label: "Bloquear usuario", icon: Ban, action: () => openStateChange(alumno, "bloqueado"), destructive: true });
    }
    if (estado === "bloqueado" && isSuperAdmin) {
      actions.push({ label: "Desbloquear", icon: UserCheck, action: () => openStateChange(alumno, "activo") });
    }

    // --- Zona de riesgo ---
    actions.push({ label: "", icon: null, action: () => {}, separator: true });
    actions.push({ label: "", icon: null, action: () => {}, groupLabel: "Zona de riesgo" });
    actions.push({ label: "Eliminar", icon: Trash2, action: () => setDeleteAlumno(alumno), destructive: true });

    return actions;
  };

  // Inicia la baja por admin: crea la solicitud y abre el confirm dialog
  const handleStartBajaAdmin = async (alumno: Alumno) => {
    const { data: solId, error } = await supabase.rpc("request_baja_alumno", {
      p_alumno_id: alumno.id,
      p_motivo: "otro",
      p_motivo_otro_detalle: "Baja iniciada por administración",
      p_origen: "admin",
    });
    if (error || !solId) { toast.error(error?.message || "No se pudo crear la solicitud"); return; }
    const { data: sol } = await supabase
      .from("bajas_solicitudes")
      .select("id, alumno_id, motivo, motivo_otro_detalle, comentario, snapshot")
      .eq("id", solId as unknown as string)
      .maybeSingle();
    if (!sol) { toast.error("No se pudo cargar la solicitud"); return; }
    setBajaAdminAlumno(alumno);
    setBajaSolicitud({ ...sol, alumno_nombre: `${alumno.nombre} ${alumno.apellido ?? ""}`.trim() });
  };

  const handleReactivate = async () => {
    if (!reactivateAlumno) return;
    setReactivateLoading(true);
    const { error } = await supabase.rpc("reactivar_alumno", { p_alumno_id: reactivateAlumno.id });
    setReactivateLoading(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Alumno reactivado. Deberá contratar un nuevo plan.");
    setAlumnos((prev) => prev.map((a) => a.id === reactivateAlumno.id ? { ...a, estado: "activo" } as any : a));
    setReactivateAlumno(null);
  };

  // --- Drawer ---
  const openDrawer = (alumno: Alumno) => {
    setDrawerAlumno(alumno);
    setEditingDetail(false);
    setDetailForm({
      nombre: alumno.nombre,
      apellido: getApellido(alumno),
      email: alumno.email,
      emails_adicionales: (((alumno as any).emails_adicionales as string[]) || []).join(", "),
      telefono: alumno.telefono || "",
      documento: alumno.documento || "",
      notas: alumno.notas || "",
      nombres_bancarios: ((alumno as any).nombres_bancarios || []).join(", "),
    });
  };

  const saveDetail = async () => {
    if (!drawerAlumno) return;

    const nombresBancariosArr = detailForm.nombres_bancarios
      .split(/[,\n;]/)
      .map((s) => s.trim())
      .filter(Boolean);

    const mainEmailLower = detailForm.email.trim().toLowerCase();
    const emailsAdicionalesArr = Array.from(new Set(
      detailForm.emails_adicionales
        .split(/[,\n;\s]+/)
        .map((s) => s.trim().toLowerCase())
        .filter((s) => s && s.includes("@") && s !== mainEmailLower)
    ));

    const payload = {
      nombre: detailForm.nombre.trim(),
      apellido: detailForm.apellido.trim() || null,
      email: mainEmailLower,
      emails_adicionales: emailsAdicionalesArr,
      telefono: detailForm.telefono.trim() || null,
      documento: detailForm.documento.trim() || null,
      notas: detailForm.notas.trim() || null,
      nombres_bancarios: nombresBancariosArr,
    } as any;

    const { data, error } = await supabase
      .from("alumnos")
      .update(payload)
      .eq("id", drawerAlumno.id)
      .select("*")
      .single();

    if (error) {
      console.error("Error updating alumno:", error);
      toast.error(error.message || "Error al guardar los cambios");
      return;
    }

    const updatedAlumno = (data || { ...drawerAlumno, ...payload }) as Alumno;

    setAlumnos((prev) => prev.map((alumno) => (
      alumno.id === updatedAlumno.id ? updatedAlumno : alumno
    )));
    setDrawerAlumno(updatedAlumno);
    setDetailForm({
      nombre: updatedAlumno.nombre,
      apellido: getApellido(updatedAlumno),
      email: updatedAlumno.email,
      emails_adicionales: (((updatedAlumno as any).emails_adicionales as string[]) || []).join(", "),
      telefono: updatedAlumno.telefono || "",
      documento: updatedAlumno.documento || "",
      notas: updatedAlumno.notas || "",
      nombres_bancarios: (((updatedAlumno as any).nombres_bancarios as string[]) || []).join(", "),
    });

    toast.success("Datos actualizados");
    await logStudentActivity({ alumnoId: drawerAlumno.id, eventType: "edicion_datos", title: "Edición de datos", description: "Datos personales modificados desde la ficha", actorRole: isSuperAdmin ? "super_admin" : "admin" });
    setEditingDetail(false);
    await fetchAlumnos();
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

  const openOverduePreview = (alumno: Alumno) => {
    if (!drawerAlumno || drawerAlumno.id !== alumno.id) {
      openDrawer(alumno);
    }
    setOverduePreviewRequestToken((current) => current + 1);
  };

  const openStateChange = (alumno: Alumno, targetEstado: string) => {
    setStateChangeAlumno(alumno);
    setStateChangeTarget(targetEstado);
    setStateChangeMotivo("");
    setStateChangeNota("");
    // Defaults for pause flow
    if (targetEstado === "vacaciones") {
      setPauseMotivoTipo("");
      setPauseFechaRetorno("");
      const d = new Date();
      d.setDate(d.getDate() + 7);
      setPauseFollowup(d.toISOString().slice(0, 10));
    }
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
    // Pause-specific: persist motivo, fecha estimada de retorno, próximo follow-up
    if (newEstado === "vacaciones") {
      updateData.pause_motivo = pauseMotivoTipo || stateChangeMotivo || null;
      updateData.pause_fecha_estimada_retorno = pauseFechaRetorno || null;
      updateData.pause_proximo_followup = pauseFollowup || null;
      updateData.pause_ultimo_contacto_at = null;
    }
    // Returning to active: clear pause tracking fields
    if (newEstado === "activo" && alumno.estado === "vacaciones") {
      updateData.pause_motivo = null;
      updateData.pause_fecha_estimada_retorno = null;
      updateData.pause_proximo_followup = null;
      updateData.pause_ultimo_contacto_at = null;
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
    // Refresh drawer if still open
    if (drawerAlumno && drawerAlumno.id === alumno.id) {
      setDrawerAlumno({ ...alumno, estado: newEstado } as any);
    }
    // Refresh suscripciones
    supabase.from("suscripciones").select("id, alumno_id, plan_id, estado, fecha_inicio, fecha_fin, planes(id, nombre, precio, moneda, categoria)").then(({ data }) => {
      setSuscripciones((data as any) || []);
    });
  };

  const openContactDialog = (alumno: Alumno) => {
    setContactAlumno(alumno);
    setContactCanal("whatsapp");
    setContactNota("");
    const d = new Date();
    d.setDate(d.getDate() + 7);
    setContactProxFollowup(d.toISOString().slice(0, 10));
  };

  const executeContactRegistration = async () => {
    if (!contactAlumno) return;
    setSavingContact(true);
    const alumno = contactAlumno;
    const nowIso = new Date().toISOString();
    const canalLabel: Record<string, string> = {
      whatsapp: "WhatsApp",
      llamada: "Llamada",
      email: "Email",
      presencial: "Presencial",
    };
    const { error } = await supabase.from("alumnos").update({
      pause_ultimo_contacto_at: nowIso,
      pause_proximo_followup: contactProxFollowup || null,
    } as any).eq("id", alumno.id);
    if (error) {
      toast.error("No se pudo registrar el contacto");
      setSavingContact(false);
      return;
    }
    await logStudentActivity({
      alumnoId: alumno.id,
      eventType: "contacto_pausa",
      title: `Contacto vía ${canalLabel[contactCanal] || contactCanal}`,
      description: contactNota || "Sin notas adicionales",
      actorRole: isSuperAdmin ? "super_admin" : "admin",
    });
    toast.success("Contacto registrado");
    setSavingContact(false);
    setContactAlumno(null);
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
    setManualFechaFin(endOfCalendarMonth());
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
    await supabase.from("suscripciones").update({ estado: "vencida" }).eq("alumno_id", manualSubAlumno.id).eq("estado", "activa").lt("fecha_fin", todayStr);
    if (hasPendingPayment) {
      await supabase.from("suscripciones").update({ estado: "activa", fecha_inicio: todayStr, fecha_fin: manualFechaFin }).eq("alumno_id", manualSubAlumno.id).eq("estado", "pendiente_verificacion");
    } else {
      const { error } = await supabase.from("suscripciones").insert({ alumno_id: manualSubAlumno.id, plan_id: planId, estado: "activa", fecha_inicio: todayStr, fecha_fin: manualFechaFin, mp_status: "manual", metodo_pago: "efectivo", origen_registro: "cargado_admin" } as any);
      if (error) { 
        toast.error(isDuplicateSubError(error) ? DUPLICATE_SUB_MSG : "Error al crear la suscripción."); 
        setSavingManual(false); 
        return; 
      }
    }
    await supabase.from("alumnos").update({ estado: "activo" }).eq("id", manualSubAlumno.id);
    const emailType = hasPendingPayment ? "pago_confirmado" : "habilitado";
    supabase.functions.invoke("notify-student-update", { body: { alumno_id: manualSubAlumno.id, type: emailType, fecha_vencimiento: manualFechaFin } }).catch(() => {});
    
    // Auto-facturar: create factura record and attempt AFIP emission
    const selectedPlan = planes.find(p => p.id === planId);
    if (selectedPlan) {
      supabase.functions.invoke("auto-facturar", {
        body: {
          alumno_id: manualSubAlumno.id,
          concepto: `Suscripción ${selectedPlan.nombre} — ${manualFechaFin}`,
          monto: selectedPlan.precio,
          referencia_tipo: "suscripcion",
          segmento: "escuela",
        },
      }).then(({ data }) => {
        if (data?.emitted) {
          toast.success(`Factura AFIP emitida: N° ${data.numero_comprobante}`);
        } else if (data?.created) {
          // Record created but not auto-emitted, silent - admin can emit manually
        }
      }).catch(() => {});
    }

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
        const { error } = await supabase.from("suscripciones").insert({ alumno_id: changePlanAlumno.id, plan_id: newPlanId, estado: "activa", fecha_inicio: todayStr, fecha_fin: endStr, mp_status: "manual", metodo_pago: "efectivo", origen_registro: "cargado_admin" } as any);
        if (error) { 
          if (isDuplicateSubError(error)) toast.error(DUPLICATE_SUB_MSG);
          else throw error; 
          setSavingPlan(false); return; 
        }
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
    { key: "nuevos", label: "Nuevos (30d)", count: nuevosCount },
    { key: "pendientes", label: "Pendientes", count: pendingCount },
    { key: "activos", label: "Activos", count: activeCount },
    { key: "vacaciones", label: "Vacaciones", count: vacacionesCount },
    { key: "inactivos", label: "Inactivos", count: inactiveCount },
    { key: "bloqueados", label: "Bloqueados", count: blockedCount },
    { key: "vencidos", label: "Vencidos", count: vencidosCount },
    ...(pagoPendienteCount > 0 ? [{ key: "pago_pendiente", label: "Pago pendiente", count: pagoPendienteCount }] : []),
    ...(accesoPausadoCount > 0 ? [{ key: "acceso_pausado", label: "Acceso pausado", count: accesoPausadoCount }] : []),
    { key: "sin_grupo", label: "Sin grupo", count: sinGrupoCount },
    ...(inconsistentCount > 0 ? [{ key: "inconsistentes", label: "⚠ Incons.", count: inconsistentCount }] : []),
    ...(incompletosCount > 0 ? [{ key: "incompletos", label: "Incompletos", count: incompletosCount }] : []),
    ...(duplicadosCount > 0 ? [{ key: "duplicados", label: "Duplicados", count: duplicadosCount }] : []),
    ...(multiSubsCount > 0 ? [{ key: "multi_subs", label: "Conflicto modalidad", count: multiSubsCount }] : []),
    { key: "con_acceso", label: "Con acceso", count: conAccesoCount },
    { key: "sin_acceso", label: "Sin acceso", count: sinAccesoCount },
    ...Object.entries(planCounts).map(([planId, { name, count }]) => ({
      key: `plan_${planId}`, label: name, count,
    })),
    { key: "sin_plan", label: "Sin plan", count: sinPlanCount },
    ...(sinPlanActivoCount > 0 ? [{ key: "sin_plan_activo", label: "Sin plan activo", count: sinPlanActivoCount }] : []),
  ];

  const formatDate = (d: string | null) => d ? new Date(d).toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" }) : "—";

  // --- Pause-tracking helpers ---
  const PAUSE_MOTIVO_LABELS: Record<string, string> = {
    lesion: "Lesión", enfermedad: "Enfermedad", viaje: "Viaje",
    embarazo: "Embarazo", personal: "Personal", otro: "Otro",
  };
  const PAUSE_MOTIVO_ICONS: Record<string, any> = {
    lesion: HeartPulse, enfermedad: HeartPulse, viaje: MapPin,
    embarazo: HeartPulse, personal: Users, otro: FileText,
  };
  const parseDateLocal = (s: string | null | undefined): Date | null => {
    if (!s) return null;
    const parts = s.substring(0, 10).split("-");
    if (parts.length !== 3) return null;
    return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  };
  const daysBetween = (a: Date, b: Date) => Math.floor((b.getTime() - a.getTime()) / 86400000);
  const today0 = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })();

  const getFollowupUrgency = (alumno: any): { label: string; tone: "danger" | "warn" | "ok" | "muted"; days: number | null } => {
    const f = parseDateLocal(alumno.pause_proximo_followup);
    if (!f) return { label: "Sin agendar", tone: "warn", days: null };
    const diff = daysBetween(today0, f);
    if (diff < 0) return { label: `Vencido hace ${Math.abs(diff)}d`, tone: "danger", days: diff };
    if (diff === 0) return { label: "Hoy", tone: "warn", days: 0 };
    if (diff <= 2) return { label: `En ${diff}d`, tone: "warn", days: diff };
    return { label: `En ${diff}d`, tone: "ok", days: diff };
  };

  const pausados = alumnos
    .filter(a => a.estado === "vacaciones")
    .map(a => {
      const u = getFollowupUrgency(a as any);
      const ultimoCambio = parseDateLocal((a as any).updated_at?.toString().slice(0, 10) || null);
      const diasPausado = ultimoCambio ? Math.max(0, daysBetween(ultimoCambio, today0)) : 0;
      return { alumno: a, urgency: u, diasPausado };
    })
    .sort((x, y) => {
      const order = { danger: 0, warn: 1, ok: 2, muted: 3 } as const;
      return order[x.urgency.tone] - order[y.urgency.tone];
    });


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
              <Input placeholder="Buscar por nombre, email o nombre bancario..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 bg-secondary border-border" />

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

          {/* ===== Specialized Pausados board ===== */}
          {statusFilter === "vacaciones" ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <div className="glass-card rounded-md p-3">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total pausados</p>
                  <p className="text-2xl font-heading font-bold text-foreground mt-1">{pausados.length}</p>
                </div>
                <div className="glass-card rounded-md p-3 border border-destructive/30">
                  <p className="text-[10px] uppercase tracking-wider text-destructive">Follow-up vencido</p>
                  <p className="text-2xl font-heading font-bold text-destructive mt-1">{pausados.filter(p => p.urgency.tone === "danger").length}</p>
                </div>
                <div className="glass-card rounded-md p-3 border border-amber-500/30">
                  <p className="text-[10px] uppercase tracking-wider text-amber-400">Esta semana</p>
                  <p className="text-2xl font-heading font-bold text-amber-400 mt-1">{pausados.filter(p => p.urgency.tone === "warn").length}</p>
                </div>
                <div className="glass-card rounded-md p-3">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Sin agenda</p>
                  <p className="text-2xl font-heading font-bold text-foreground mt-1">{pausados.filter(p => !p.alumno.pause_proximo_followup).length}</p>
                </div>
              </div>

              {pausados.length === 0 ? (
                <div className="glass-card rounded-lg p-12 text-center text-muted-foreground">
                  <Palmtree className="w-10 h-10 mx-auto mb-3 opacity-40" />
                  <p>No hay alumnos en vacaciones.</p>
                </div>
              ) : (
                <div className="glass-card rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-border hover:bg-transparent">
                        <TableHead className="text-muted-foreground">Alumno</TableHead>
                        <TableHead className="text-muted-foreground">Motivo</TableHead>
                        <TableHead className="text-muted-foreground hidden md:table-cell">Días pausado</TableHead>
                        <TableHead className="text-muted-foreground">Próx. follow-up</TableHead>
                        <TableHead className="text-muted-foreground hidden lg:table-cell">Retorno estimado</TableHead>
                        <TableHead className="text-muted-foreground hidden lg:table-cell">Último contacto</TableHead>
                        <TableHead className="text-muted-foreground"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pausados.map(({ alumno, urgency, diasPausado }) => {
                        const a: any = alumno;
                        const motivoKey = a.pause_motivo || "otro";
                        const MotivoIcon = PAUSE_MOTIVO_ICONS[motivoKey] || FileText;
                        const motivoLabel = PAUSE_MOTIVO_LABELS[motivoKey] || a.pause_motivo || "—";
                        const fechaRetorno = parseDateLocal(a.pause_fecha_estimada_retorno);
                        const ultContacto = a.pause_ultimo_contacto_at ? new Date(a.pause_ultimo_contacto_at) : null;
                        const ultContactoStr = ultContacto
                          ? `${daysBetween(new Date(ultContacto.getFullYear(), ultContacto.getMonth(), ultContacto.getDate()), today0)}d atrás`
                          : "Sin contacto";
                        const urgencyClass =
                          urgency.tone === "danger" ? "bg-destructive/20 text-destructive border-destructive/40" :
                          urgency.tone === "warn" ? "bg-amber-500/20 text-amber-400 border-amber-500/40" :
                          urgency.tone === "ok" ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40" :
                          "text-muted-foreground border-dashed";
                        return (
                          <TableRow key={alumno.id} className="border-border hover:bg-muted/30 cursor-pointer" onClick={() => openDrawer(alumno)}>
                            <TableCell>
                              <div className="font-medium text-foreground text-sm">{alumno.nombre} {getApellido(alumno)}</div>
                              <div className="text-xs text-muted-foreground">{alumno.grupo}</div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs gap-1">
                                <MotivoIcon className="w-3 h-3" />
                                {motivoLabel}
                              </Badge>
                            </TableCell>
                            <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{diasPausado}d</TableCell>
                            <TableCell>
                              <Badge variant="outline" className={`text-xs gap-1 ${urgencyClass}`}>
                                <Clock className="w-3 h-3" />
                                {urgency.label}
                              </Badge>
                              {a.pause_proximo_followup && (
                                <div className="text-[10px] text-muted-foreground mt-0.5">{formatDate(a.pause_proximo_followup)}</div>
                              )}
                            </TableCell>
                            <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                              {fechaRetorno ? formatDate(a.pause_fecha_estimada_retorno) : <span className="italic">no definida</span>}
                            </TableCell>
                            <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">{ultContactoStr}</TableCell>
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center gap-1.5 justify-end">
                                <Button size="sm" variant="gold" className="h-7 text-xs" onClick={() => openContactDialog(alumno)}>
                                  <MessageSquare className="w-3 h-3 mr-1" /> Registrar contacto
                                </Button>
                                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openStateChange(alumno, "activo")}>
                                  <Play className="w-3 h-3 mr-1" /> Reactivar
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          ) : (

          /* Table / Cards */
          isMobile ? (
            <div className="space-y-2">
              {loading ? (
                <p className="text-center text-muted-foreground py-8">Cargando...</p>
              ) : sorted.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No se encontraron alumnos</p>
              ) : (
                sorted.map((alumno) => {
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
                              a.separator ? <DropdownMenuSeparator key={i} /> :
                              a.groupLabel ? <DropdownMenuLabel key={i} className="text-[10px] uppercase tracking-wider text-muted-foreground font-normal">{a.groupLabel}</DropdownMenuLabel> : (
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
                        <Badge variant={getSubBadge(subEstado).variant} className={`text-[10px] ${getSubBadge(subEstado).className}`}>{subEstado === "sin_suscripcion" ? "Sin plan" : (SUB_STATUS_LABELS[subEstado] || subEstado)}</Badge>
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
                    <TableHead className="text-muted-foreground cursor-pointer select-none" onClick={() => toggleSort("nombre")}>
                      <span className="flex items-center gap-1">Nombre <SortIcon col="nombre" /></span>
                    </TableHead>
                    <TableHead className="text-muted-foreground cursor-pointer select-none" onClick={() => toggleSort("apellido")}>
                      <span className="flex items-center gap-1">Apellido <SortIcon col="apellido" /></span>
                    </TableHead>
                    <TableHead className="text-muted-foreground cursor-pointer select-none" onClick={() => toggleSort("grupo")}>
                      <span className="flex items-center gap-1">Grupo <SortIcon col="grupo" /></span>
                    </TableHead>
                    <TableHead className="text-muted-foreground cursor-pointer select-none" onClick={() => toggleSort("estado")}>
                      <span className="flex items-center gap-1">Estado <SortIcon col="estado" /></span>
                    </TableHead>
                    <TableHead className="text-muted-foreground cursor-pointer select-none" onClick={() => toggleSort("suscripcion")}>
                      <span className="flex items-center gap-1">Suscripción <SortIcon col="suscripcion" /></span>
                    </TableHead>
                    <TableHead className="text-muted-foreground hidden xl:table-cell cursor-pointer select-none" onClick={() => toggleSort("ultimo_acceso")}>
                      <span className="flex items-center gap-1">Último acceso <SortIcon col="ultimo_acceso" /></span>
                    </TableHead>
                    <TableHead className="text-muted-foreground w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Cargando...</TableCell></TableRow>
                  ) : sorted.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No se encontraron alumnos</TableCell></TableRow>
                  ) : (
                    sorted.map((alumno) => {
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
                        <Badge variant={getSubBadge(subEstado).variant} className={`text-[10px] ${getSubBadge(subEstado).className}`}>{subEstado === "sin_suscripcion" ? "Sin plan" : (SUB_STATUS_LABELS[subEstado] || subEstado)}</Badge>
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
                                  a.separator ? <DropdownMenuSeparator key={i} /> :
                                  a.groupLabel ? <DropdownMenuLabel key={i} className="text-[10px] uppercase tracking-wider text-muted-foreground font-normal">{a.groupLabel}</DropdownMenuLabel> : (
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
          ))}

          {/* ===== RIGHT DRAWER (Detail) ===== */}
          <Sheet open={!!drawerAlumno} onOpenChange={(open) => { if (!open) { setDrawerAlumno(null); setDrawerExpanded(false); } }}>
            <SheetContent
              className={`overflow-y-auto bg-card border-border transition-[max-width] duration-200 ${
                drawerExpanded
                  ? "w-screen sm:max-w-none"
                  : "w-full sm:max-w-[1100px]"
              }`}
            >
              <SheetHeader>
                <SheetTitle className="font-heading uppercase tracking-wider text-base flex items-center gap-2 pr-10 flex-wrap">
                  Ficha del Alumno
                  {drawerAlumno && getAlumnoInconsistency(drawerAlumno) && (
                    <Badge variant="destructive" className="text-[10px] gap-0.5"><AlertTriangle className="w-3 h-3" /> Inconsistente</Badge>
                  )}
                  {drawerAlumno && (
                    <StudentSaldoChip
                      alumnoId={drawerAlumno.id}
                      onClick={() => navigate(`/admin/cuenta-corriente?alumno=${drawerAlumno.id}`)}
                    />
                  )}

                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 ml-auto"
                    onClick={() => setDrawerExpanded((v) => !v)}
                    title={drawerExpanded ? "Contraer" : "Expandir"}
                  >
                    {drawerExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                  </Button>
                </SheetTitle>
              </SheetHeader>

              {drawerAlumno && (() => {
                const sub = getActiveSub(drawerAlumno.id) || getAnySub(drawerAlumno.id);
                const subEstado = getSubEstadoLabel(drawerAlumno.id);
                const inconsistency = getAlumnoInconsistency(drawerAlumno);
                const missing = getProfileMissing(drawerAlumno, subEstado);
                return (
                  <div className="space-y-6 py-4">
                    {/* Impersonation button for super admin */}
                    {isSuperAdmin && (
                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={() => navigate(`/admin/ver-como/${drawerAlumno.id}`)}
                      >
                        <Eye className="w-4 h-4 mr-2" />
                        Ver como usuario
                      </Button>
                    )}
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
                            <Label className="text-xs">Email principal (login)</Label>
                            <Input value={detailForm.email} onChange={(e) => setDetailForm({ ...detailForm, email: e.target.value })} className="bg-secondary border-border text-sm h-8" />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Emails adicionales (copia de comunicaciones)</Label>
                            <Input
                              value={detailForm.emails_adicionales}
                              onChange={(e) => setDetailForm({ ...detailForm, emails_adicionales: e.target.value })}
                              className="bg-secondary border-border text-sm h-8"
                              placeholder="Ej: mama@mail.com, contador@estudio.com"
                            />
                            <p className="text-[10px] text-muted-foreground">
                              Reciben en copia los mails automáticos (habilitación, grupo, cambios de plan). Separar con coma. No se usan para login.
                            </p>
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
                            <Label className="text-xs">Nombres bancarios / titulares</Label>
                            <Input
                              value={detailForm.nombres_bancarios}
                              onChange={(e) => setDetailForm({ ...detailForm, nombres_bancarios: e.target.value })}
                              className="bg-secondary border-border text-sm h-8"
                              placeholder="Ej: Juan Pérez SRL, María García"
                            />
                            <p className="text-[10px] text-muted-foreground">
                              Titulares con los que el alumno aparece en transferencias bancarias / MP (separar con coma). Aparece en el buscador.
                            </p>
                          </div>
                          {/* Las notas internas se gestionan abajo como lista (multiples notas) */}
                          <Button variant="gold" size="sm" onClick={saveDetail} className="w-full">Guardar cambios</Button>
                        </div>
                      ) : (
                        <div className="space-y-2 text-sm">
                          <DetailRow label="Nombre" value={drawerAlumno.nombre} />
                          <DetailRow label="Apellido" value={getApellido(drawerAlumno) || "—"} />
                          <DetailRow label="Email" value={drawerAlumno.email} mono />
                          {(((drawerAlumno as any).emails_adicionales as string[]) || []).length > 0 && (
                            <DetailRow
                              label="Emails en copia"
                              value={(((drawerAlumno as any).emails_adicionales as string[]) || []).join(", ")}
                              mono
                            />
                          )}
                          <DetailRow label="Teléfono" value={drawerAlumno.telefono || "—"} />
                          <DetailRow label="DNI/CUIT" value={drawerAlumno.documento || "—"} mono />
                          {(((drawerAlumno as any).nombres_bancarios as string[]) || []).length > 0 && (
                            <DetailRow
                              label="Nombres bancarios"
                              value={(((drawerAlumno as any).nombres_bancarios as string[]) || []).join(", ")}
                            />
                          )}
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
                          <div className="flex items-center gap-1.5">
                            <Badge variant={getEstadoBadge(drawerAlumno.estado).variant} className={`text-xs ${getEstadoBadge(drawerAlumno.estado).className}`}>
                              {drawerAlumno.estado}
                            </Badge>
                            {getValidTransitions(drawerAlumno.estado).length > 0 && (
                              <Select
                                value=""
                                onValueChange={(val) => {
                                  openStateChange(drawerAlumno, val);
                                }}
                              >
                                <SelectTrigger className="w-7 h-7 p-0 bg-secondary border-border [&>svg]:hidden">
                                  <Pencil className="w-3 h-3 mx-auto text-muted-foreground" />
                                </SelectTrigger>
                                <SelectContent className="z-[200]">
                                  {getValidTransitions(drawerAlumno.estado).map(e => (
                                    <SelectItem key={e} value={e} className="text-xs">{e.charAt(0).toUpperCase() + e.slice(1)}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                          </div>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">Estado suscripción</span>
                          <Badge variant={getSubBadge(subEstado).variant} className={`text-xs ${getSubBadge(subEstado).className}`}>
                            {subEstado === "sin_suscripcion" ? "Sin plan" : (SUB_STATUS_LABELS[subEstado] || subEstado)}
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
                            <SelectTrigger className="w-36 h-7 bg-secondary border-border text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="z-[200]" position="popper" sideOffset={4}>
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
                        <DetailRow label="Fecha de alta" value={formatDate(drawerAlumno.created_at)} />
                        <DetailRow label="Último acceso" value={formatDate(drawerAlumno.updated_at)} />
                      </div>
                    </div>

                    <Separator />

                    {/* Plan y Suscripción */}
                    <StudentPlanSection
                      alumno={drawerAlumno}
                      isSuperAdmin={isSuperAdmin}
                      openOverduePreviewToken={overduePreviewRequestToken}
                      onRefresh={() => {
                        fetchAlumnos();
                        supabase.from("suscripciones").select("id, alumno_id, plan_id, estado, fecha_inicio, fecha_fin, planes(id, nombre, precio, moneda, categoria)").then(({ data }) => {
                          setSuscripciones((data as any) || []);
                        });
                      }}
                      onAlumnoUpdate={(a) => setDrawerAlumno(a)}
                    />
                    <Separator />

                    {/* Descuentos y grupo familiar */}

                    <StudentDiscountSection alumno={drawerAlumno} />

                    <Separator />

                    {/* Emergencia, cobertura y familiares */}
                    <StudentEmergencyFamilySection alumno={drawerAlumno} />

                    <Separator />


                    {/* Apto Físico */}
                    <MedicalCertificateSection
                      alumno={drawerAlumno}
                      isSuperAdmin={isSuperAdmin}
                      onAlumnoUpdate={(a) => {
                        setDrawerAlumno(a);
                        setAlumnos(prev => prev.map(al => al.id === a.id ? a : al));
                      }}
                    />
                    <Separator />
                    <StudentNotesSection alumnoId={drawerAlumno.id} />
                    <Separator />

                    {/* Activity Log */}
                    <StudentActivityLog alumnoId={drawerAlumno.id} />
                    <Separator />

                    {/* Actions */}
                    <div className="space-y-2">
                      <h3 className="text-sm font-semibold text-foreground">Acciones</h3>
                      <div className="grid grid-cols-2 gap-2">
                        {/* State transitions */}
                        {getValidTransitions(drawerAlumno.estado).map(e => (
                          <Button key={e} variant="outline" size="sm" className="text-xs justify-start" onClick={() => openStateChange(drawerAlumno, e)}>
                            {e === "activo" && <Play className="w-3 h-3 mr-1.5" />}
                            {e === "vacaciones" && <Palmtree className="w-3 h-3 mr-1.5" />}
                            {e === "inactivo" && <UserX className="w-3 h-3 mr-1.5" />}
                            {e === "bloqueado" && <Ban className="w-3 h-3 mr-1.5" />}
                            {e === "inactivo" ? "Baja" : e.charAt(0).toUpperCase() + e.slice(1)}
                          </Button>
                        ))}
                        {/* Sub state change */}
                        <Button variant="outline" size="sm" className="text-xs justify-start" onClick={() => setManageSubAlumno(drawerAlumno)}>
                          <FileText className="w-3 h-3 mr-1.5" /> Gestionar suscripción
                        </Button>
                        {!(drawerAlumno as any).password_set && (
                          <Button variant="outline" size="sm" className="text-xs justify-start" disabled={resending === drawerAlumno.id} onClick={() => handleResendInvite(drawerAlumno)}>
                            <MailPlus className="w-3 h-3 mr-1.5" /> {(drawerAlumno as any).invited_at ? "Reenviar invite" : "Enviar invite"}
                          </Button>
                        )}
                        {(() => {
                          const dSubEstado = getSubEstadoLabel(drawerAlumno.id);
                          return (dSubEstado === "pago_pendiente" || dSubEstado === "acceso_pausado" || dSubEstado === "vencida") ? (
                            <Button variant="outline" size="sm" className="text-xs justify-start text-orange-600 hover:text-orange-700" onClick={() => openOverduePreview(drawerAlumno)}>
                              <BellRing className="w-3 h-3 mr-1.5" /> Vista previa y enviar
                            </Button>
                          ) : null;
                        })()}
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

                  {stateChangeTarget === "vacaciones" && (
                    <div className="space-y-3 rounded-md border border-blue-500/20 bg-blue-500/5 p-3">
                      <p className="text-xs font-medium text-blue-400 uppercase tracking-wider">Seguimiento de la pausa</p>
                      <div className="space-y-2">
                        <Label className="text-xs">Motivo de la pausa</Label>
                        <Select value={pauseMotivoTipo} onValueChange={setPauseMotivoTipo}>
                          <SelectTrigger className="bg-secondary border-border text-sm"><SelectValue placeholder="Seleccionar motivo" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="lesion">Lesión</SelectItem>
                            <SelectItem value="enfermedad">Enfermedad</SelectItem>
                            <SelectItem value="viaje">Viaje</SelectItem>
                            <SelectItem value="embarazo">Embarazo</SelectItem>
                            <SelectItem value="personal">Motivo personal</SelectItem>
                            <SelectItem value="otro">Otro</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1.5">
                          <Label className="text-xs">Retorno estimado</Label>
                          <Input type="date" value={pauseFechaRetorno} onChange={(e) => setPauseFechaRetorno(e.target.value)} className="bg-secondary border-border text-xs" />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Próximo follow-up</Label>
                          <Input type="date" value={pauseFollowup} onChange={(e) => setPauseFollowup(e.target.value)} className="bg-secondary border-border text-xs" />
                        </div>
                      </div>
                      <p className="text-[11px] text-muted-foreground">El follow-up te recuerda contactar al alumno en el tablero "Vacaciones".</p>
                    </div>
                  )}
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

          {/* Register contact (paused student follow-up) */}
          <Dialog open={!!contactAlumno} onOpenChange={(open) => { if (!open) setContactAlumno(null); }}>
            <DialogContent className="sm:max-w-md bg-card border-border">
              <DialogHeader>
                <DialogTitle className="font-heading uppercase tracking-wider">Registrar contacto</DialogTitle>
              </DialogHeader>
              {contactAlumno && (
                <div className="space-y-4 py-2">
                  <p className="text-sm text-muted-foreground">
                    Alumno: <span className="text-foreground font-medium">{contactAlumno.nombre} {getApellido(contactAlumno)}</span>
                  </p>
                  <div className="space-y-2">
                    <Label className="text-xs">Canal</Label>
                    <Select value={contactCanal} onValueChange={setContactCanal}>
                      <SelectTrigger className="bg-secondary border-border text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="whatsapp">WhatsApp</SelectItem>
                        <SelectItem value="llamada">Llamada</SelectItem>
                        <SelectItem value="email">Email</SelectItem>
                        <SelectItem value="presencial">Presencial</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">¿Cómo le fue? (nota interna)</Label>
                    <Textarea value={contactNota} onChange={(e) => setContactNota(e.target.value)} placeholder="Ej: Sigue con dolor, vuelve en 2 semanas..." className="bg-secondary border-border text-sm min-h-[70px]" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Próximo follow-up</Label>
                    <Input type="date" value={contactProxFollowup} onChange={(e) => setContactProxFollowup(e.target.value)} className="bg-secondary border-border text-sm" />
                  </div>
                </div>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setContactAlumno(null)}>Cancelar</Button>
                <Button variant="gold" disabled={savingContact} onClick={executeContactRegistration}>
                  {savingContact ? "Guardando..." : "Registrar"}
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
                  <Label htmlFor="fecha-fin">Vence (fin de mes calendario)</Label>
                  <Input id="fecha-fin" type="date" value={manualFechaFin} readOnly className="bg-muted/40 border-border cursor-not-allowed" />
                  <p className="text-xs text-muted-foreground">Todas las mensualidades cierran el último día del mes calendario. No se permite vencimiento "rolling" a 30 días.</p>
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

      {/* Register Payment Modal */}
      <RegisterPaymentModal
        open={!!regPayAlumno}
        onOpenChange={(open) => !open && setRegPayAlumno(null)}
        alumnoId={regPayAlumno?.id}
        alumnoNombre={regPayAlumno ? getFullName(regPayAlumno) : null}
        onSuccess={fetchAlumnos}
      />

      {/* Manage Subscription Modal */}
      <ManageSubscriptionModal
        open={!!manageSubAlumno}
        onOpenChange={(open) => !open && setManageSubAlumno(null)}
        alumno={manageSubAlumno}
        suscripciones={suscripciones as any}
        planes={planes as any}
        isSuperAdmin={isSuperAdmin}
        onSuccess={() => { fetchAlumnos(); supabase.from("suscripciones").select("id, alumno_id, plan_id, estado, fecha_inicio, fecha_fin, cancelada_at, created_at, metodo_pago, planes(id, nombre, precio, moneda, categoria)").order("created_at", { ascending: false }).then(({ data }) => setSuscripciones((data as any) || [])); }}
      />

      {bajaSolicitud && bajaAdminAlumno && (
        <ConfirmBajaDialog
          open={!!bajaSolicitud}
          onOpenChange={(v) => { if (!v) { setBajaSolicitud(null); setBajaAdminAlumno(null); } }}
          solicitud={bajaSolicitud}
          onConfirmed={() => {
            setAlumnos((prev) => prev.map((a) => a.id === bajaAdminAlumno.id ? { ...a, estado: "inactivo", grupo: "Sin grupo" } as any : a));
            setBajaSolicitud(null);
            setBajaAdminAlumno(null);
          }}
        />
      )}

      <AlertDialog open={!!reactivateAlumno} onOpenChange={(v) => { if (!v) setReactivateAlumno(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reactivar alumno</AlertDialogTitle>
            <AlertDialogDescription>
              El alumno volverá a estado <b>activo</b>, pero <b>no</b> se restauran las suscripciones anteriores.
              Deberá contratar un nuevo plan para acceder a entrenamientos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={reactivateLoading}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleReactivate} disabled={reactivateLoading}>
              {reactivateLoading ? "Reactivando..." : "Reactivar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
