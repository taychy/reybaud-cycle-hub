import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { CreditCard, Play, Pause, XCircle, CalendarCheck, ArrowRightLeft, AlertTriangle, Plus, Bell, Eye, Tag, DollarSign, PauseCircle, RefreshCw, CheckCircle } from "lucide-react";
import PausaConfirmDialog from "@/components/PausaConfirmDialog";
import { toast } from "sonner";
import { logStudentActivity } from "@/lib/logStudentActivity";
import { isDuplicateSubError, DUPLICATE_SUB_MSG, detectDuplicateActiveSubs } from "@/lib/subscriptionGuard";
import { useStudentDiscounts } from "@/hooks/useStudentDiscounts";
import { getEffectiveSubStatus, SUB_STATUS_LABELS, SUB_STATUS_BADGE } from "@/lib/subscriptionStatus";
import type { Tables } from "@/integrations/supabase/types";
import { RegisterPaymentModal } from "@/components/admin/RegisterPaymentModal";
import { BonoClasesCard } from "@/components/admin/BonoClasesCard";

type Alumno = Tables<"alumnos">;
type Plan = Tables<"planes">;

interface SuscripcionData {
  id: string;
  alumno_id: string;
  plan_id: string;
  estado: string;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  cancelada_at?: string | null;
  cancelada_motivo?: string | null;
  mp_status: string | null;
  metodo_pago: string;
  origen_registro: string;
  created_at: string;
  descuento_id: string | null;
  precio_base: number | null;
  precio_final: number | null;
  auto_cobro_activo?: boolean | null;
  mp_preapproval_id?: string | null;
  clases_totales?: number | null;
  clases_consumidas?: number | null;
  clases_vencimiento?: string | null;
  planes: { id: string; nombre: string; precio: number; moneda: string; tipo_consumo?: string | null } | null;
  descuentos: { id: string; nombre: string; valor: number; tipo: string } | null;
}

interface Props {
  alumno: Alumno;
  isSuperAdmin: boolean;
  onRefresh: () => void;
  onAlumnoUpdate: (a: Alumno) => void;
  openOverduePreviewToken?: number;
}

/** States considered "operationally active" — shown in main list */
const ACTIVE_STATES = new Set(["activa", "pago_pendiente", "acceso_pausado", "pendiente", "pendiente_verificacion", "pausa"]);

const formatDate = (d: string | null) => {
  if (!d) return "—";
  const parts = d.substring(0, 10).split("-");
  const date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  return date.toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" });
};

const toLocalISODate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const calculateSubscriptionEndDate = (plan: Plan | undefined, fechaInicio: string) => {
  const [startY, startM, startD] = fechaInicio.split("-").map(Number);
  const start = new Date(startY, startM - 1, startD);

  if ((plan as any)?.tipo_consumo === "bono" && (plan as any)?.vigencia_dias) {
    const bonoEnd = new Date(start);
    bonoEnd.setDate(bonoEnd.getDate() + Number((plan as any).vigencia_dias));
    return toLocalISODate(bonoEnd);
  }

  const freq = (plan as any)?.frecuencia || "mensual";
  const monthsToAdd = freq === "trimestral" ? 3 : freq === "anual" ? 12 : 1;
  const endDate = new Date(startY, startM - 1 + monthsToAdd, startD);
  endDate.setDate(endDate.getDate() - 1);
  return toLocalISODate(endDate);
};

const getBonoSnapshotFields = (plan: Plan | undefined, fechaInicio: string) => {
  if ((plan as any)?.tipo_consumo !== "bono") {
    return { clases_totales: null, clases_vencimiento: null, clases_consumidas: 0 };
  }

  return {
    clases_totales: (plan as any)?.clases_incluidas ?? null,
    clases_vencimiento: (plan as any)?.vigencia_dias ? calculateSubscriptionEndDate(plan, fechaInicio) : null,
  };
};

const getPaymentMethodLabel = (method: string | null) => {
  if (!method) return "—";
  const map: Record<string, string> = { efectivo: "Efectivo", transferencia: "Transferencia", mercadopago: "Mercado Pago", tarjeta: "Tarjeta", plataforma_externa: "Otro" };
  return map[method] || method;
};

const isOverdueStatus = (estado: string) =>
  estado === "vencida" || estado === "pago_pendiente" || estado === "acceso_pausado";

export function StudentPlanSection({ alumno, isSuperAdmin, onRefresh, onAlumnoUpdate, openOverduePreviewToken }: Props) {
  const [subs, setSubs] = useState<SuscripcionData[]>([]);
  const [planes, setPlanes] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [duplicateAlert, setDuplicateAlert] = useState<{ plan_nombre: string; fecha_fin: string }[]>([]);
  const { discounts, applyDiscount, loading: discountsLoading, subscriptionCount } = useStudentDiscounts(alumno.id);

  // Dialog state
  const [dialogMode, setDialogMode] = useState<"add" | "change">("add");
  const [dialogSubId, setDialogSubId] = useState<string | null>(null);
  const [showPlanDialog, setShowPlanDialog] = useState(false);
  const [newPlanId, setNewPlanId] = useState("");
  const [changeFechaInicio, setChangeFechaInicio] = useState("");
  const [changeNote, setChangeNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [applySecondActivityDiscount, setApplySecondActivityDiscount] = useState(false);
  const [availableDiscounts, setAvailableDiscounts] = useState<{ id: string; nombre: string; valor: number; tipo: string }[]>([]);
  // Remove plan confirm
  const [showRemovePlan, setShowRemovePlan] = useState(false);
  // Asignar Pausa
  const [showPausaDialog, setShowPausaDialog] = useState(false);
  const [pausaPlan, setPausaPlan] = useState<Plan | null>(null);
  const [assigningPausa, setAssigningPausa] = useState(false);
  const [removeSubId, setRemoveSubId] = useState<string | null>(null);
  const [removingSub, setRemovingSub] = useState(false);
  const [regPaySubId, setRegPaySubId] = useState<string | null>(null);

  // Email preview state
  const [previewSub, setPreviewSub] = useState<SuscripcionData | null>(null);
  const [sendingNotif, setSendingNotif] = useState(false);
  const [lastHandledOverduePreviewToken, setLastHandledOverduePreviewToken] = useState<number | null>(null);

  const actorRole = isSuperAdmin ? "super_admin" : "admin";

  const fetchData = async () => {
    setLoading(true);
    const [subsRes, planesRes, discountsRes] = await Promise.all([
      supabase.from("suscripciones").select("id, alumno_id, plan_id, estado, fecha_inicio, fecha_fin, cancelada_at, cancelada_motivo, mp_status, metodo_pago, origen_registro, created_at, descuento_id, precio_base, precio_final, auto_cobro_activo, mp_preapproval_id, clases_totales, clases_consumidas, clases_vencimiento, planes(id, nombre, precio, moneda, tipo_consumo), descuentos(id, nombre, valor, tipo)")
        .eq("alumno_id", alumno.id)
        .order("created_at", { ascending: false }),
      supabase.from("planes").select("*").eq("activo", true).order("nombre"),
      supabase.from("descuentos").select("id, nombre, valor, tipo, categoria").eq("activo", true).eq("categoria", "segunda_actividad"),
    ]);
    const allSubs = (subsRes.data as any) || [];
    setSubs(allSubs);
    setPlanes(planesRes.data || []);
    setAvailableDiscounts((discountsRes.data as any) || []);

    // Detect duplicates client-side from fetched data
    const operationalOnly = allSubs.filter((s: SuscripcionData) => ACTIVE_STATES.has(getEffStatus(s)) && !s.cancelada_at);
    const dupeGroups: Record<string, { plan_nombre: string; fecha_fin: string; count: number }> = {};
    for (const s of operationalOnly) {
      const key = `${s.plan_id}|${s.fecha_fin}`;
      if (!dupeGroups[key]) dupeGroups[key] = { plan_nombre: s.planes?.nombre || "—", fecha_fin: s.fecha_fin || "—", count: 0 };
      dupeGroups[key].count++;
    }
    setDuplicateAlert(Object.values(dupeGroups).filter(g => g.count > 1));

    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [alumno.id]);

  useEffect(() => {
    if (!openOverduePreviewToken || openOverduePreviewToken === lastHandledOverduePreviewToken) return;

    const overdueSub = subs.find((sub) => isOverdueStatus(getEffStatus(sub)));
    if (!overdueSub) return;

    setPreviewSub(overdueSub);
    setLastHandledOverduePreviewToken(openOverduePreviewToken);
  }, [openOverduePreviewToken, lastHandledOverduePreviewToken, subs]);

  const getEffStatus = (s: SuscripcionData) => getEffectiveSubStatus({ estado: s.estado, fecha_fin: s.fecha_fin, cancelada_at: s.cancelada_at });

  // Categorize subscriptions: active operational vs history
  // Orden: la suscripción del período actual (vigente hoy) primero,
  // luego próximos períodos por fecha_inicio asc, luego el resto por fecha_inicio desc.
  const todayISO = new Date().toISOString().slice(0, 10);
  const activeSubs = subs
    .filter((s) => ACTIVE_STATES.has(getEffStatus(s)))
    .sort((a, b) => {
      const ai = (a.fecha_inicio || "").slice(0, 10);
      const bi = (b.fecha_inicio || "").slice(0, 10);
      const af = (a.fecha_fin || "").slice(0, 10);
      const bf = (b.fecha_fin || "").slice(0, 10);
      const aCurrent = ai <= todayISO && af >= todayISO;
      const bCurrent = bi <= todayISO && bf >= todayISO;
      if (aCurrent && !bCurrent) return -1;
      if (!aCurrent && bCurrent) return 1;
      // Próximos (inicio > hoy) primero asc, vencidos al final desc
      const aFuture = ai > todayISO;
      const bFuture = bi > todayISO;
      if (aFuture && !bFuture) return -1;
      if (!aFuture && bFuture) return 1;
      if (aFuture && bFuture) return ai.localeCompare(bi);
      return bi.localeCompare(ai);
    });
  const historicSubs = subs.filter((s) => !activeSubs.includes(s));


  // --- Actions ---
  const handlePauseSub = async (subId: string) => {
    const { error } = await supabase.from("suscripciones").update({ estado: "pausa" }).eq("id", subId);
    if (error) { toast.error("Error al pausar la suscripción"); return; }
    const sub = subs.find(s => s.id === subId);
    toast.success("Suscripción pausada");
    await logStudentActivity({ alumnoId: alumno.id, eventType: "estado_suscripcion", title: "Suscripción → pausa", description: `Plan "${sub?.planes?.nombre || "—"}" pausado`, actorRole });
    fetchData();
    onRefresh();
  };

  const handleReactivateSub = async (subId: string) => {
    const { error } = await supabase.from("suscripciones").update({ estado: "activa" }).eq("id", subId);
    if (error) {
      if (isDuplicateSubError(error)) { toast.error(DUPLICATE_SUB_MSG); return; }
      toast.error("Error al reactivar la suscripción");
      return;
    }
    const sub = subs.find(s => s.id === subId);
    toast.success("Suscripción reactivada");
    await logStudentActivity({ alumnoId: alumno.id, eventType: "estado_suscripcion", title: "Suscripción → activa", description: `Plan "${sub?.planes?.nombre || "—"}" reactivado`, actorRole });
    fetchData();
    onRefresh();
  };

  const handleRemovePlan = async () => {
    if (!removeSubId) return;
    setRemovingSub(true);
    try {
      const sub = subs.find(s => s.id === removeSubId);
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const removalEndDate = toLocalISODate(yesterday);
      const { error, count } = await supabase
        .from("suscripciones")
        .update({
          estado: "cancelada",
          cancelada_motivo: "Plan removido por admin",
          cancelada_at: new Date().toISOString(),
          auto_renovacion: false,
          auto_cobro_activo: false,
          // Admin "Quitar" = baja inmediata: cerramos fecha_fin ayer para que
          // no siga contando como vigente por la política de cortesía.
          fecha_fin: removalEndDate,
        } as any)
        .eq("id", removeSubId)
        .select("id");

      if (error) {
        toast.error("Error al quitar el plan: " + (error.message || "Error desconocido"));
        return;
      }

      // Verify the update actually happened
      const { data: verify } = await supabase
        .from("suscripciones")
        .select("estado, cancelada_at")
        .eq("id", removeSubId)
        .single();

      if (!verify || verify.estado !== "cancelada" || !verify.cancelada_at) {
        toast.error("El plan no se pudo cancelar correctamente. Intentá de nuevo.");
        return;
      }

      // Audit log
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data: adminProfile } = await supabase.from("admin_profiles").select("email, role").eq("user_id", session.user.id).single();
        await supabase.from("audit_log").insert([{
          user_id: session.user.id,
          user_email: adminProfile?.email || session.user.email || "",
          user_role: adminProfile?.role || "admin",
          action: "quitar_plan",
          entity_type: "suscripcion",
          entity_id: removeSubId,
          details: {
            alumno: alumno.nombre,
            plan: sub?.planes?.nombre || "—",
            estado_anterior: sub?.estado,
          },
        }]);
      }

      toast.success("Plan removido correctamente");
      await logStudentActivity({ alumnoId: alumno.id, eventType: "cambio_plan", title: "Plan removido", description: `Se removió el plan "${sub?.planes?.nombre || "—"}"`, actorRole, referenceLabel: sub?.planes?.nombre || "—" });
      setShowRemovePlan(false);
      setRemoveSubId(null);
      fetchData();
      onRefresh();
    } catch (err: any) {
      toast.error(err.message || "Error inesperado al quitar el plan");
    } finally {
      setRemovingSub(false);
    }
  };

  const openAssignPausa = () => {
    const p = planes.find((pl: any) => pl.categoria === "pausa");
    if (!p) {
      toast.error("No hay plan de pausa configurado. Creá uno con categoría 'pausa' en Configuración.");
      return;
    }
    setPausaPlan(p);
    setShowPausaDialog(true);
  };

  const handleAssignPausa = async (fechaRegreso: string) => {
    if (!pausaPlan) return;
    setAssigningPausa(true);
    setShowPausaDialog(false);
    try {
      const today = new Date();
      const fechaInicio = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      const { error } = await supabase.from("suscripciones").insert({
        alumno_id: alumno.id,
        plan_id: pausaPlan.id,
        estado: "activa",
        fecha_inicio: fechaInicio,
        fecha_fin: fechaRegreso,
        mp_status: "manual",
        metodo_pago: "efectivo",
        origen_registro: "cargado_admin",
        precio_base: pausaPlan.precio || 0,
        precio_final: pausaPlan.precio || 0,
      } as any);
      if (error) {
        if (String(error.message || "").includes("BLOCKED_BY_ACTIVE_PAUSA")) {
          toast.error("El alumno ya está en pausa.");
        } else if (String(error.message || "").includes("PAUSA_BLOCKED_BY_ACTIVE_SUB")) {
          toast.error("El alumno tiene un plan vigente. Cancelalo primero para asignar la pausa.");
        } else if (String(error.message || "").includes("PAUSA_TOO_LONG")) {
          toast.error("La pausa no puede durar más de 2 meses.");
        } else {
          toast.error("Error al asignar la pausa: " + error.message);
        }
        return;
      }

      // Email pausa_activada (fire and forget)
      supabase.functions.invoke("notify-student-update", {
        body: { alumno_id: alumno.id, type: "pausa_activada", pausa_fecha_regreso: fechaRegreso },
      }).catch(() => {});

      await logStudentActivity({
        alumnoId: alumno.id,
        eventType: "estado_suscripcion",
        title: "Pausa asignada",
        description: `Pausa activada hasta ${fechaRegreso}`,
        actorRole,
      });

      toast.success("Pausa asignada correctamente");
      await fetchData();
      onRefresh();
    } catch (err: any) {
      toast.error(err.message || "Error inesperado al asignar la pausa");
    } finally {
      setAssigningPausa(false);
      setPausaPlan(null);
    }
  };

  const openAddPlan = () => {
    const todayStr = new Date().toISOString().split("T")[0];
    setDialogMode("add");
    setDialogSubId(null);
    setNewPlanId("");
    setChangeFechaInicio(todayStr);
    setChangeNote("");
    setApplySecondActivityDiscount(false);
    setShowPlanDialog(true);
  };

  const openChangePlan = (subId: string) => {
    const sub = subs.find(s => s.id === subId);
    const todayStr = new Date().toISOString().split("T")[0];
    setDialogMode("change");
    setDialogSubId(subId);
    setNewPlanId(sub?.plan_id || "");
    setChangeFechaInicio(todayStr);
    setChangeNote("");
    setShowPlanDialog(true);
  };

  const handleSavePlan = async () => {
    if (!newPlanId) return;
    setSaving(true);
    try {
      const selectedPlan = planes.find(p => p.id === newPlanId);

      if (dialogMode === "add") {
        const endStr = calculateSubscriptionEndDate(selectedPlan, changeFechaInicio);
        const precioBase = selectedPlan?.precio || 0;
        const discount = applySecondActivityDiscount ? availableDiscounts[0] : null;
        let precioFinal = precioBase;
        if (discount) {
          precioFinal = discount.tipo === "porcentaje"
            ? Math.round(precioBase * (1 - discount.valor / 100))
            : Math.max(0, precioBase - discount.valor);
        }

        const { data: newSub, error: insertError } = await supabase.from("suscripciones").insert({
          alumno_id: alumno.id,
          plan_id: newPlanId,
          estado: "activa",
          fecha_inicio: changeFechaInicio,
          fecha_fin: endStr,
          mp_status: "manual",
          metodo_pago: "efectivo",
          origen_registro: "cargado_admin",
          descuento_id: discount?.id || null,
          precio_base: precioBase,
          precio_final: precioFinal,
          ...getBonoSnapshotFields(selectedPlan, changeFechaInicio),
        } as any).select("id").single();

        if (insertError) {
          if (isDuplicateSubError(insertError)) { toast.error(DUPLICATE_SUB_MSG); setSaving(false); return; }
          throw insertError;
        }

        if (discount && newSub) {
          await supabase.from("descuentos_alumno").insert({
            alumno_id: alumno.id,
            descuento_id: discount.id,
            nota: `Aplicado automáticamente al agregar segunda actividad: ${selectedPlan?.nombre || "—"}`,
            asignado_por: (await supabase.auth.getUser()).data.user?.id || null,
          });
        }

        const discountText = discount ? ` (con dto. ${discount.nombre}: ${discount.tipo === "porcentaje" ? `${discount.valor}%` : `$${discount.valor}`})` : "";
        toast.success(`Plan "${selectedPlan?.nombre}" agregado${discountText}`);
        await logStudentActivity({
          alumnoId: alumno.id, eventType: "cambio_plan", title: "Plan agregado",
          description: `Se agregó "${selectedPlan?.nombre || "—"}" desde ${new Date(changeFechaInicio).toLocaleDateString("es-AR")}${discountText}${changeNote ? `. Nota: ${changeNote}` : ""}`,
          actorRole, referenceType: "plan", referenceId: newPlanId, referenceLabel: selectedPlan?.nombre || "—",
        });
      } else {
        const sub = subs.find(s => s.id === dialogSubId);
        const oldPlanName = sub?.planes?.nombre || "Sin plan";
        const cEndStr = calculateSubscriptionEndDate(selectedPlan, changeFechaInicio);
        const { error } = await supabase.from("suscripciones").update({
          plan_id: newPlanId,
          fecha_inicio: changeFechaInicio,
          fecha_fin: cEndStr,
          estado: "activa",
          cancelada_at: null,
          cancelada_motivo: null,
          ...getBonoSnapshotFields(selectedPlan, changeFechaInicio),
        } as any).eq("id", dialogSubId!);

        if (error) {
          if (isDuplicateSubError(error)) { toast.error(DUPLICATE_SUB_MSG); setSaving(false); return; }
          throw error;
        }
        toast.success(`Plan actualizado`);
        await logStudentActivity({
          alumnoId: alumno.id, eventType: "cambio_plan", title: "Cambio de plan",
          description: `Cambió de "${oldPlanName}" a "${selectedPlan?.nombre || "—"}"${changeNote ? `. Nota: ${changeNote}` : ""}`,
          actorRole, referenceType: "plan", referenceId: newPlanId, referenceLabel: selectedPlan?.nombre || "—",
        });
      }

      supabase.functions.invoke("notify-student-update", {
        body: { alumno_id: alumno.id, type: "plan_cambiado", plan_nombre: selectedPlan?.nombre || "Nuevo plan", plan_precio: selectedPlan?.precio, plan_moneda: selectedPlan?.moneda },
      }).catch(() => {});

      setShowPlanDialog(false);
      fetchData();
      onRefresh();
    } catch (err: any) {
      toast.error(err.message || "Error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <CreditCard className="w-4 h-4" /> Planes y Suscripciones
        </h3>
        <p className="text-xs text-muted-foreground">Cargando...</p>
      </div>
    );
  }

  const renderSubCard = (sub: SuscripcionData, index: number, isHistoric: boolean) => {
    const effectiveEstado = getEffStatus(sub);
    const badgeCfg = SUB_STATUS_BADGE[effectiveEstado] || SUB_STATUS_BADGE.cancelada || { className: "text-muted-foreground border-dashed" };
    const statusLabel = SUB_STATUS_LABELS[effectiveEstado] || effectiveEstado;
    const isActive = ACTIVE_STATES.has(effectiveEstado);

    // Discount logic
    const totalActive = activeSubs.length;
    const isSecondary = totalActive > 1 && index === 0;
    const planPrice = sub.planes?.precio || 0;
    const moneda = sub.planes?.moneda || "ARS";
    const hasSavedDiscount = sub.descuento_id && sub.descuentos;
    const liveDiscount = !hasSavedDiscount ? applyDiscount(planPrice, "planes", isSecondary) : null;
    const hasLiveDiscount = liveDiscount && liveDiscount.discount;
    const hasAnyDiscount = hasSavedDiscount || hasLiveDiscount;

    const displayBase = hasSavedDiscount ? (sub.precio_base ?? planPrice) : planPrice;
    const displayFinal = hasSavedDiscount
      ? (sub.precio_final ?? planPrice)
      : hasLiveDiscount ? liveDiscount.final : planPrice;
    const discountLabel = hasSavedDiscount
      ? `${sub.descuentos!.nombre} (${sub.descuentos!.tipo === "fijo" ? `$${sub.descuentos!.valor}` : `${sub.descuentos!.valor}%`})`
      : hasLiveDiscount ? `${liveDiscount.discount!.nombre} (${liveDiscount.discount!.tipo === "fijo" ? `$${liveDiscount.discount!.valor}` : `${liveDiscount.discount!.valor}%`})` : "";
    const savings = displayBase - displayFinal;

    // Etiqueta de período (sólo para activas)
    const fiISO = (sub.fecha_inicio || "").slice(0, 10);
    const ffISO = (sub.fecha_fin || "").slice(0, 10);
    let periodTag: { label: string; className: string } | null = null;
    if (!isHistoric && fiISO && ffISO) {
      if (fiISO <= todayISO && ffISO >= todayISO) {
        periodTag = { label: "Período actual", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" };
      } else if (fiISO > todayISO) {
        periodTag = { label: "Próximo período", className: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30" };
      } else if (ffISO < todayISO) {
        periodTag = { label: "Período vencido", className: "bg-destructive/15 text-destructive border-destructive/30" };
      }
    }

    // Duración del período (para que se entienda de un vistazo)
    let periodDays: number | null = null;
    if (fiISO && ffISO) {
      const [fy, fm, fd] = fiISO.split("-").map(Number);
      const [ey, em, ed] = ffISO.split("-").map(Number);
      const start = new Date(fy, fm - 1, fd);
      const end = new Date(ey, em - 1, ed);
      periodDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    }
    const isSuspiciousPeriod = periodDays !== null && periodDays <= 1;

    return (
      <div key={sub.id} className={`rounded-lg border p-3 space-y-2 ${isHistoric ? "border-border/50 bg-muted/20 opacity-80" : "border-border bg-secondary/30"}`}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-medium text-foreground">{sub.planes?.nombre || "Sin plan"}</span>
            {periodTag && (
              <Badge variant="outline" className={`text-[10px] ${periodTag.className}`}>
                {periodTag.label}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {sub.auto_cobro_activo && (
              <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/30 gap-1">
                <RefreshCw className="w-2.5 h-2.5" />
                Auto-cobro
              </Badge>
            )}
            <Badge variant="outline" className={`text-[10px] ${badgeCfg.className}`}>
              {statusLabel}
            </Badge>
          </div>
        </div>

        <div className="space-y-1 text-[11px]">
          {sub.fecha_inicio && sub.fecha_fin && (
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Período</span>
              <span className={isSuspiciousPeriod ? "text-amber-400 font-medium flex items-center gap-1" : "text-foreground"}>
                {isSuspiciousPeriod && <AlertTriangle className="w-3 h-3" />}
                {formatDate(sub.fecha_inicio)} → <span className={isOverdueStatus(effectiveEstado) ? "text-destructive font-medium" : ""}>{formatDate(sub.fecha_fin)}</span>
                {periodDays !== null && (
                  <span className="text-muted-foreground ml-1">({periodDays}d)</span>
                )}
              </span>
            </div>
          )}
          {(!sub.fecha_inicio || !sub.fecha_fin) && sub.fecha_inicio && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Inicio</span>
              <span className="text-foreground">{formatDate(sub.fecha_inicio)}</span>
            </div>
          )}
          {(!sub.fecha_inicio || !sub.fecha_fin) && sub.fecha_fin && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Vencimiento</span>
              <span className={isOverdueStatus(effectiveEstado) ? "text-destructive font-medium" : "text-foreground"}>
                {formatDate(sub.fecha_fin)}
              </span>
            </div>
          )}

          {sub.metodo_pago && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Medio de pago</span>
              <span className="text-foreground">{getPaymentMethodLabel(sub.metodo_pago)}</span>
            </div>
          )}

          {/* Price / Discount */}
          <div className="flex justify-between">
            <span className="text-muted-foreground">Precio</span>
            <span className={`font-mono ${hasAnyDiscount ? "text-muted-foreground line-through" : "text-foreground"}`}>
              {moneda} {displayBase}
            </span>
          </div>
          {hasAnyDiscount && (
            <>
              <div className="flex justify-between">
                <span className="text-emerald-400">{discountLabel}</span>
                <span className="text-emerald-400 font-mono">-{moneda} {savings}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground font-medium">Final</span>
                <span className="text-foreground font-mono font-medium">{moneda} {displayFinal}</span>
              </div>
            </>
          )}

          {/* Show cancellation reason in history */}
          {isHistoric && sub.cancelada_motivo && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Motivo</span>
              <span className="text-muted-foreground italic">{sub.cancelada_motivo}</span>
            </div>
          )}
        </div>

        {/* Bono de clases — Fase 1 */}
        {sub.planes?.tipo_consumo === "bono" && sub.clases_totales != null && (
          <BonoClasesCard
            sub={{
              id: sub.id,
              clases_totales: sub.clases_totales,
              clases_consumidas: sub.clases_consumidas ?? 0,
              clases_vencimiento: sub.clases_vencimiento ?? null,
            }}
            planNombre={sub.planes?.nombre || "Plan"}
            onChange={onRefresh}
          />
        )}

        {/* Actions for ACTIVE subs only */}
        {!isHistoric && isActive && (
          <div className="flex flex-wrap gap-1 pt-1">
            <Button variant="outline" size="sm" className="text-[10px] h-6 px-2" onClick={() => openChangePlan(sub.id)}>
              <ArrowRightLeft className="w-3 h-3 mr-0.5" /> Cambiar
            </Button>
            {(sub.estado === "activa" || effectiveEstado === "activa") && !sub.cancelada_at && (
              <Button variant="outline" size="sm" className="text-[10px] h-6 px-2" onClick={() => handlePauseSub(sub.id)}>
                <Pause className="w-3 h-3 mr-0.5" /> Pausar
              </Button>
            )}
            {sub.estado === "pausa" && (
              <Button variant="outline" size="sm" className="text-[10px] h-6 px-2" onClick={() => handleReactivateSub(sub.id)}>
                <Play className="w-3 h-3 mr-0.5" /> Reactivar
              </Button>
            )}
            <Button variant="outline" size="sm" className="text-[10px] h-6 px-2 text-destructive hover:text-destructive" onClick={() => { setRemoveSubId(sub.id); setShowRemovePlan(true); }}>
              <XCircle className="w-3 h-3 mr-0.5" /> Quitar
            </Button>
          </div>
        )}

        {/* Pago informado pendiente de validación → botones Validar / Rechazar */}
        {!isHistoric && effectiveEstado === "pendiente_verificacion" && (
          <div className="pt-1 flex gap-1">
            <Button
              variant="default"
              size="sm"
              className="text-[10px] h-6 px-2 bg-emerald-600 hover:bg-emerald-700 text-white flex-1"
              onClick={async () => {
                const { data, error } = await supabase.functions.invoke("admin-subscription-action", {
                  body: { sub_id: sub.id, action: "approve" },
                });
                if (error || (data as any)?.error) {
                  toast.error((data as any)?.error || error?.message || "No se pudo validar");
                } else {
                  toast.success("Pago validado");
                  onRefresh();
                }
              }}
            >
              <CheckCircle className="w-3 h-3 mr-0.5" /> Validar
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-[10px] h-6 px-2 text-destructive border-destructive/40 hover:bg-destructive/10 flex-1"
              onClick={async () => {
                const reason = window.prompt("Motivo del rechazo (se incluye en el email al alumno):", "") || "";
                const { data, error } = await supabase.functions.invoke("admin-subscription-action", {
                  body: { sub_id: sub.id, action: "reject", reason },
                });
                if (error || (data as any)?.error) {
                  toast.error((data as any)?.error || error?.message || "No se pudo rechazar");
                } else {
                  toast.success("Pago rechazado y email enviado");
                  onRefresh();
                }
              }}
            >
              <XCircle className="w-3 h-3 mr-0.5" /> Rechazar
            </Button>
          </div>
        )}

        {/* Overdue actions — only for active subs, NOT history */}
        {!isHistoric && isOverdueStatus(effectiveEstado) && (
          <div className="pt-1 space-y-1">
            <Button
              variant="outline"
              size="sm"
              className="text-[10px] h-6 px-2 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10 w-full"
              onClick={() => setRegPaySubId(sub.id)}
            >
              <DollarSign className="w-3 h-3 mr-0.5" /> Registrar pago
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-[10px] h-6 px-2 text-amber-400 border-amber-500/30 hover:bg-amber-500/10 w-full"
              onClick={() => setPreviewSub(sub)}
            >
              <Eye className="w-3 h-3 mr-0.5" /> Vista previa y enviar notificación
            </Button>
          </div>
        )}


        {/* History: no action buttons except View Detail (future) */}
      </div>
    );
  };

  const removeSub = subs.find(s => s.id === removeSubId);

  return (
    <>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <CreditCard className="w-4 h-4" /> Planes y Suscripciones
            {activeSubs.length > 0 && (
              <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
                {activeSubs.length} activo{activeSubs.length !== 1 ? "s" : ""}
              </Badge>
            )}
          </h3>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" className="text-[10px] h-6 px-2 border-amber-500/40 text-amber-400 hover:bg-amber-500/10" onClick={openAssignPausa} disabled={assigningPausa}>
              <PauseCircle className="w-3 h-3 mr-0.5" /> {assigningPausa ? "Asignando..." : "Asignar pausa"}
            </Button>
            <Button variant="gold" size="sm" className="text-[10px] h-6 px-2" onClick={openAddPlan}>
              <Plus className="w-3 h-3 mr-0.5" /> Agregar plan
            </Button>
          </div>
        </div>

        {/* Duplicate alert */}
        {duplicateAlert.length > 0 && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-md p-3 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
            <div className="text-xs text-amber-300">
              <span className="font-semibold">Suscripciones duplicadas detectadas.</span>
              {duplicateAlert.map((d, i) => (
                <span key={i} className="block mt-0.5">• {d.plan_nombre} — vence {d.fecha_fin}</span>
              ))}
              <span className="block mt-1 text-amber-400/70">Revisar conciliación: cancelar o fusionar la duplicada.</span>
            </div>
          </div>
        )}

        {/* Active subscriptions */}
        {activeSubs.length > 0 ? (
          <div className="space-y-2">
            {activeSubs.map((sub, i) => renderSubCard(sub, i, false))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Sin planes activos</p>
        )}

        {/* Historic subscriptions (collapsed) */}
        {historicSubs.length > 0 && (
          <details className="group">
            <summary className="text-[10px] text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
              Historial ({historicSubs.length} plan{historicSubs.length !== 1 ? "es" : ""})
            </summary>
            <div className="space-y-2 mt-2">
              {historicSubs.slice(0, 5).map((sub, i) => renderSubCard(sub, activeSubs.length + i, true))}
              {historicSubs.length > 5 && (
                <p className="text-[10px] text-muted-foreground text-center">
                  y {historicSubs.length - 5} más...
                </p>
              )}
            </div>
          </details>
        )}
      </div>

      {/* ===== ADD/CHANGE PLAN DIALOG ===== */}
      <Dialog open={showPlanDialog} onOpenChange={setShowPlanDialog}>
        <DialogContent className="sm:max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="font-heading uppercase tracking-wider">
              {dialogMode === "add" ? "Agregar plan" : "Cambiar plan"}
            </DialogTitle>
            <DialogDescription>
              Alumno: {alumno.nombre} {(alumno as any).apellido || ""}
              {dialogMode === "change" && dialogSubId && (
                <> · Plan actual: {subs.find(s => s.id === dialogSubId)?.planes?.nombre || "—"}</>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-xs">{dialogMode === "add" ? "Plan a agregar" : "Nuevo plan"}</Label>
              <Select value={newPlanId} onValueChange={setNewPlanId}>
                <SelectTrigger className="bg-secondary border-border">
                  <SelectValue placeholder="Seleccionar plan" />
                </SelectTrigger>
                <SelectContent className="z-[200]">
                  {planes.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nombre} — {p.moneda} {p.precio}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Fecha de inicio</Label>
              <Input type="date" value={changeFechaInicio} onChange={(e) => setChangeFechaInicio(e.target.value)} className="bg-secondary border-border text-sm" />
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Nota interna (opcional)</Label>
              <Textarea value={changeNote} onChange={(e) => setChangeNote(e.target.value)} placeholder="Ej: Segunda actividad, solicitud del alumno..." className="bg-secondary border-border text-sm min-h-[50px]" />
            </div>

            {/* Second activity discount toggle */}
            {dialogMode === "add" && activeSubs.length > 0 && availableDiscounts.length > 0 && newPlanId && (() => {
              const selectedPlan = planes.find(p => p.id === newPlanId);
              const discount = availableDiscounts[0];
              const precioBase = selectedPlan?.precio || 0;
              const precioFinal = discount.tipo === "porcentaje"
                ? Math.round(precioBase * (1 - discount.valor / 100))
                : Math.max(0, precioBase - discount.valor);
              return (
                <div className="rounded-md bg-purple-500/10 border border-purple-500/30 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Tag className="w-3.5 h-3.5 text-purple-400" />
                      <span className="text-xs font-medium text-purple-300">{discount.nombre}</span>
                      <Badge variant="outline" className="text-[10px] bg-purple-500/20 text-purple-400 border-purple-500/30">
                        {discount.tipo === "porcentaje" ? `${discount.valor}%` : `$${discount.valor}`}
                      </Badge>
                    </div>
                    <Switch
                      checked={applySecondActivityDiscount}
                      onCheckedChange={setApplySecondActivityDiscount}
                    />
                  </div>
                  {applySecondActivityDiscount && (
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-muted-foreground">Precio con descuento:</span>
                      <span className="text-purple-300 font-semibold">
                        <span className="line-through text-muted-foreground mr-2">{selectedPlan?.moneda} {precioBase.toLocaleString()}</span>
                        {selectedPlan?.moneda} {precioFinal.toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPlanDialog(false)}>Cancelar</Button>
            <Button variant="gold" disabled={!newPlanId || saving} onClick={handleSavePlan}>
              {saving ? "Guardando..." : dialogMode === "add" ? "Agregar" : "Confirmar cambio"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== REMOVE PLAN DIALOG ===== */}
      <Dialog open={showRemovePlan} onOpenChange={(open) => { if (!removingSub) setShowRemovePlan(open); }}>
        <DialogContent className="sm:max-w-sm bg-card border-border">
          <DialogHeader>
            <DialogTitle className="font-heading uppercase tracking-wider">Quitar plan</DialogTitle>
            <DialogDescription>
              Se cancelará solo este plan de {alumno.nombre}. Los demás planes no se verán afectados.
            </DialogDescription>
          </DialogHeader>
          {removeSub?.planes && (
            <div className="rounded-md bg-destructive/10 border border-destructive/30 p-3 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
              <span className="text-xs text-destructive">Se cancelará: {removeSub.planes.nombre}</span>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRemovePlan(false)} disabled={removingSub}>Cancelar</Button>
            <Button variant="destructive" onClick={handleRemovePlan} disabled={removingSub}>
              {removingSub ? "Quitando..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Email Preview Dialog */}
      <Dialog open={!!previewSub} onOpenChange={(open) => { if (!open) setPreviewSub(null); }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="w-4 h-4" /> Vista previa del email
            </DialogTitle>
            <DialogDescription>
              Revisá el contenido antes de enviar la notificación a {alumno.nombre} ({alumno.email})
            </DialogDescription>
          </DialogHeader>
          
          {previewSub && (() => {
            const firstName = alumno.nombre?.split(" ")[0] || alumno.nombre;
            const fechaText = previewSub.fecha_fin
              ? (() => {
                  const [y, m, d] = previewSub.fecha_fin.split("-").map(Number);
                  return new Date(y, m - 1, d).toLocaleDateString("es-AR", { day: "2-digit", month: "long", year: "numeric" });
                })()
              : null;
            return (
              <div className="space-y-4">
                <div className="rounded-md border border-border bg-secondary/30 p-3 space-y-1 text-xs">
                  <div className="flex gap-2">
                    <span className="text-muted-foreground font-medium w-16">Para:</span>
                    <span className="text-foreground">{alumno.email}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-muted-foreground font-medium w-16">Asunto:</span>
                    <span className="text-foreground">⚠️ Tu mensualidad está vencida</span>
                  </div>
                </div>

                <div className="rounded-md border border-border bg-white p-4 space-y-3">
                  <h3 className="text-[#d4820a] font-semibold text-base">⚠️ Mensualidad vencida</h3>
                  <p className="text-sm text-[#333]">
                    Hola <strong>{firstName}</strong>, te informamos que tu mensualidad en Ciclismo Reybaud venció{fechaText ? <> el <strong>{fechaText}</strong></> : ""}.
                  </p>
                  <p className="text-sm text-[#333]">
                    Para mantener tu acceso completo a la app y a tus entrenamientos, te pedimos que regularices tu pago lo antes posible.
                  </p>
                  <p className="text-sm text-[#333]">
                    Podés hacerlo directamente desde la app o contactando a administración.
                  </p>
                  <div className="text-center pt-2">
                    <span className="inline-block px-5 py-2 bg-[#d4820a] text-white rounded-lg text-sm font-semibold">
                      Regularizar pago
                    </span>
                  </div>
                  <p className="text-[#999] text-xs text-center pt-2">
                    Ciclismo Reybaud — Escuela de ciclismo
                  </p>
                </div>

                <div className="rounded-md border border-border bg-secondary/30 p-3 text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Plan</span>
                    <span className="text-foreground font-medium">{previewSub.planes?.nombre || "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Vencimiento</span>
                    <span className="text-foreground font-medium">{fechaText || "—"}</span>
                  </div>
                </div>
              </div>
            );
          })()}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setPreviewSub(null)}>Cancelar</Button>
            <Button
              variant="default"
              disabled={sendingNotif}
              onClick={async () => {
                if (!previewSub) return;
                setSendingNotif(true);
                try {
                  await supabase.functions.invoke("notify-student-update", {
                    body: {
                      alumno_id: alumno.id,
                      type: "pago_vencido",
                      fecha_vencimiento: previewSub.fecha_fin,
                    },
                  });
                  toast.success("Notificación enviada al alumno");
                  await logStudentActivity({
                    alumnoId: alumno.id,
                    eventType: "mail",
                    title: "Aviso de pago vencido enviado",
                    description: `Se notificó al alumno sobre pago pendiente del plan "${previewSub.planes?.nombre || "—"}"`,
                    actorRole,
                  });
                  setPreviewSub(null);
                } catch {
                  toast.error("Error al enviar notificación");
                } finally {
                  setSendingNotif(false);
                }
              }}
            >
              <Bell className="w-4 h-4 mr-1" />
              {sendingNotif ? "Enviando..." : "Confirmar y enviar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Register Payment Modal */}
      <RegisterPaymentModal
        open={!!regPaySubId}
        onOpenChange={(open) => !open && setRegPaySubId(null)}
        alumnoId={alumno.id}
        alumnoNombre={alumno.nombre}
        subscripcionId={regPaySubId}
        onSuccess={() => { fetchData(); onRefresh(); }}
      />

      {/* Asignar Pausa Dialog */}
      {pausaPlan && (
        <PausaConfirmDialog
          open={showPausaDialog}
          alumnoId={alumno.id}
          planNombre={pausaPlan.nombre}
          onCancel={() => { setShowPausaDialog(false); setPausaPlan(null); }}
          onConfirm={handleAssignPausa}
        />
      )}
    </>
  );
}
