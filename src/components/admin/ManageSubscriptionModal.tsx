import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getEffectiveSubStatus, SUB_STATUS_LABELS, SUB_STATUS_BADGE, type EffectiveSubStatus } from "@/lib/subscriptionStatus";
import { logStudentActivity } from "@/lib/logStudentActivity";
import { isDuplicateSubError, DUPLICATE_SUB_MSG } from "@/lib/subscriptionGuard";
import { CreditCard, Play, Pause, XCircle, Plus, ArrowRightLeft, AlertTriangle, Clock, FileText, CalendarClock, Trash2 } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type Alumno = Tables<"alumnos">;

interface SuscripcionConPlan {
  id: string;
  alumno_id: string;
  plan_id: string;
  estado: string;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  cancelada_at?: string | null;
  created_at: string;
  metodo_pago?: string | null;
  planes: { id: string; nombre: string; precio: number; moneda: string } | null;
}

interface ManageSubscriptionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  alumno: Alumno | null;
  suscripciones: SuscripcionConPlan[];
  planes: { id: string; nombre: string; precio: number; moneda: string; activo: boolean }[];
  isSuperAdmin: boolean;
  onSuccess: () => void;
}

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

type ActionType = "cambiar_plan" | "agregar_plan" | "pausar" | "reactivar" | "activar" | "marcar_pago_pendiente" | "marcar_vencida" | "cancelar" | "cambiar_estado" | "editar_vencimiento" | "eliminar" | null;

export function ManageSubscriptionModal({ open, onOpenChange, alumno, suscripciones, planes, isSuperAdmin, onSuccess }: ManageSubscriptionModalProps) {
  const [selectedAction, setSelectedAction] = useState<ActionType>(null);
  const [newPlanId, setNewPlanId] = useState("");
  const [manualFechaFin, setManualFechaFin] = useState("");
  const [motivo, setMotivo] = useState("");
  const [subChangeTarget, setSubChangeTarget] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [selectedSubId, setSelectedSubId] = useState<string | null>(null);

  // Reset on open
  useEffect(() => {
    if (open) {
      setSelectedAction(null);
      setNewPlanId("");
      setMotivo("");
      setSubChangeTarget("");
      setSaving(false);
      setConfirmCancel(false);
      setConfirmDelete(false);
      setDeleteConfirmText("");
      setSelectedSubId(null);
      const now = new Date();
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      setManualFechaFin(lastDay.toISOString().split("T")[0]);
    }
  }, [open]);

  const alumnoSubs = useMemo(() => {
    if (!alumno) return [];
    return suscripciones
      .filter(s => s.alumno_id === alumno.id)
      .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
  }, [alumno, suscripciones]);

  // Default "primary" sub (most relevant non-cancelled, fallback to most recent)
  const defaultSub = useMemo(() => {
    return alumnoSubs.find(s => {
      const eff = getEffectiveSubStatus({ estado: s.estado, fecha_fin: s.fecha_fin, cancelada_at: s.cancelada_at });
      return eff !== "cancelada";
    }) || alumnoSubs[0] || null;
  }, [alumnoSubs]);

  // Active target sub: user-selected or default
  const primarySub = useMemo(() => {
    if (selectedSubId) {
      const found = alumnoSubs.find(s => s.id === selectedSubId);
      if (found) return found;
    }
    return defaultSub;
  }, [selectedSubId, alumnoSubs, defaultSub]);

  const handleSelectSub = (subId: string) => {
    if (subId === primarySub?.id) return;
    setSelectedSubId(subId);
    setSelectedAction(null);
    setMotivo("");
    setNewPlanId("");
    setSubChangeTarget("");
  };

  const effectiveStatus: EffectiveSubStatus | "sin_suscripcion" = primarySub
    ? getEffectiveSubStatus({ estado: primarySub.estado, fecha_fin: primarySub.fecha_fin, cancelada_at: primarySub.cancelada_at })
    : "sin_suscripcion";

  // Context-aware available actions
  const availableActions = useMemo(() => {
    const actions: { type: ActionType; label: string; icon: any; destructive?: boolean }[] = [];

    if (effectiveStatus === "sin_suscripcion" || effectiveStatus === "cancelada") {
      actions.push({ type: "agregar_plan", label: "Agregar plan", icon: Plus });
    }

    if (primarySub && effectiveStatus !== "cancelada" && effectiveStatus !== "sin_suscripcion") {
      actions.push({ type: "cambiar_plan", label: "Cambiar plan", icon: ArrowRightLeft });
    }

    if (effectiveStatus === "activa") {
      actions.push({ type: "pausar", label: "Pausar suscripción", icon: Pause });
    }

    if (effectiveStatus === "pausa") {
      actions.push({ type: "reactivar", label: "Reactivar suscripción", icon: Play });
    }

    if (effectiveStatus === "vencida" || effectiveStatus === "pago_pendiente" || effectiveStatus === "acceso_pausado" || effectiveStatus === "pendiente" || effectiveStatus === "pendiente_verificacion") {
      actions.push({ type: "activar", label: "Activar manualmente", icon: Play });
    }

    if (primarySub && effectiveStatus !== "cancelada" && effectiveStatus !== "sin_suscripcion") {
      actions.push({ type: "editar_vencimiento", label: "Editar vencimiento", icon: CalendarClock });
    }

    if (effectiveStatus === "activa" || effectiveStatus === "cancelada") {
      actions.push({ type: "marcar_pago_pendiente", label: "Marcar como impaga / pago pendiente", icon: Clock });
    }

    if (primarySub && effectiveStatus !== "cancelada" && effectiveStatus !== "sin_suscripcion") {
      actions.push({ type: "cambiar_estado", label: "Cambiar estado manualmente", icon: FileText });
    }

    if (primarySub && effectiveStatus !== "cancelada" && effectiveStatus !== "sin_suscripcion") {
      actions.push({ type: "cancelar", label: "Cancelar suscripción", icon: XCircle, destructive: true });
    }

    if (primarySub) {
      actions.push({ type: "eliminar", label: "Eliminar suscripción (error de carga)", icon: Trash2, destructive: true });
    }

    return actions;
  }, [effectiveStatus, primarySub]);

  const getActorRole = () => isSuperAdmin ? "super_admin" : "admin";

  const handleExecute = async () => {
    if (!alumno) return;
    setSaving(true);
    try {
      switch (selectedAction) {
        case "cambiar_plan": {
          if (!newPlanId || !primarySub) { toast.error("Seleccioná un plan"); break; }
          const selectedPlan = planes.find(p => p.id === newPlanId);
          await supabase.from("suscripciones").update({ plan_id: newPlanId } as any).eq("id", primarySub.id);
          supabase.functions.invoke("notify-student-update", {
            body: { alumno_id: alumno.id, type: "plan_cambiado", plan_nombre: selectedPlan?.nombre, plan_precio: selectedPlan?.precio, plan_moneda: selectedPlan?.moneda },
          }).catch(() => {});
          toast.success(`Plan actualizado: ${selectedPlan?.nombre}`);
          await logStudentActivity({ alumnoId: alumno.id, eventType: "cambio_plan", title: "Cambio de plan", description: `Nuevo plan: ${selectedPlan?.nombre || "—"}`, actorRole: getActorRole(), referenceType: "plan", referenceId: newPlanId, referenceLabel: selectedPlan?.nombre });
          break;
        }
        case "agregar_plan": {
          if (!newPlanId) { toast.error("Seleccioná un plan"); break; }
          const today = new Date();
          const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
          const selectedPlan = planes.find(p => p.id === newPlanId);
          const { error: insErr } = await supabase.from("suscripciones").insert({
            alumno_id: alumno.id, plan_id: newPlanId, estado: "activa",
            fecha_inicio: todayStr, fecha_fin: manualFechaFin,
            mp_status: "manual", metodo_pago: "efectivo", origen_registro: "cargado_admin",
          } as any);
          if (insErr) {
            if (isDuplicateSubError(insErr)) { toast.error(DUPLICATE_SUB_MSG); break; }
            throw insErr;
          }
          await supabase.from("alumnos").update({ estado: "activo" }).eq("id", alumno.id);
          supabase.functions.invoke("notify-student-update", { body: { alumno_id: alumno.id, type: "habilitado", fecha_vencimiento: manualFechaFin } }).catch(() => {});
          toast.success(`Plan ${selectedPlan?.nombre} asignado hasta ${manualFechaFin}`);
          await logStudentActivity({ alumnoId: alumno.id, eventType: "alta_suscripcion", title: "Plan asignado manualmente", description: `${selectedPlan?.nombre} hasta ${manualFechaFin}`, actorRole: getActorRole() });
          break;
        }
        case "pausar": {
          if (!primarySub) break;
          await supabase.from("suscripciones").update({ estado: "pausa" }).eq("id", primarySub.id);
          toast.success("Suscripción pausada");
          await logStudentActivity({ alumnoId: alumno.id, eventType: "estado_suscripcion", title: "Suscripción → pausa", description: motivo || "Pausada por admin", actorRole: getActorRole() });
          break;
        }
        case "reactivar":
        case "activar": {
          if (!primarySub) break;
          await supabase.from("suscripciones").update({ estado: "activa" }).eq("id", primarySub.id);
          toast.success("Suscripción reactivada");
          await logStudentActivity({ alumnoId: alumno.id, eventType: "estado_suscripcion", title: "Suscripción → activa", description: motivo || "Reactivada por admin", actorRole: getActorRole() });
          break;
        }
        case "marcar_pago_pendiente": {
          if (!primarySub) break;
          // Move fecha_fin to yesterday and clear any cancellation so the sub
          // becomes effectively "vencida"/"pago_pendiente" (debt visible to alumno).
          const yesterday = new Date();
          yesterday.setDate(yesterday.getDate() - 1);
          const ydStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;
          await supabase.from("suscripciones").update({
            estado: "vencida",
            fecha_fin: ydStr,
            cancelada_at: null,
            cancelada_motivo: null,
            auto_renovacion: false,
          } as any).eq("id", primarySub.id);
          toast.success("Marcado como impaga / pago pendiente");
          await logStudentActivity({ alumnoId: alumno.id, eventType: "estado_suscripcion", title: "Marcada pago pendiente", description: motivo || "Sub marcada como impaga por admin", actorRole: getActorRole() });
          break;
        }
        case "marcar_vencida": {
          if (!primarySub) break;
          await supabase.from("suscripciones").update({ estado: "vencida" }).eq("id", primarySub.id);
          toast.success("Marcada como vencida");
          await logStudentActivity({ alumnoId: alumno.id, eventType: "estado_suscripcion", title: "Suscripción → vencida", description: motivo || "Marcada por admin", actorRole: getActorRole() });
          break;
        }
        case "cancelar": {
          if (!primarySub) break;
          if (!motivo.trim()) { toast.error("Ingresá un motivo para cancelar"); setSaving(false); return; }
          await supabase.from("suscripciones").update({
            estado: "cancelada",
            cancelada_motivo: motivo,
            cancelada_at: new Date().toISOString(),
          } as any).eq("id", primarySub.id);
          toast.success("Suscripción cancelada");
          await logStudentActivity({ alumnoId: alumno.id, eventType: "estado_suscripcion", title: "Suscripción cancelada", description: `Motivo: ${motivo}`, actorRole: getActorRole() });
          break;
        }
        case "cambiar_estado": {
          if (!primarySub || !subChangeTarget) { toast.error("Seleccioná un estado"); break; }
          const updateData: any = { estado: subChangeTarget };
          if (subChangeTarget === "cancelada") {
            updateData.cancelada_motivo = motivo || "Cambio manual";
            updateData.cancelada_at = new Date().toISOString();
          }
          await supabase.from("suscripciones").update(updateData).eq("id", primarySub.id);
          toast.success(`Suscripción → ${subChangeTarget}`);
          await logStudentActivity({ alumnoId: alumno.id, eventType: "estado_suscripcion", title: `Suscripción → ${subChangeTarget}`, description: motivo || "Cambio manual", actorRole: getActorRole() });
          break;
        }
      }

      // Audit log
      const { data: { session } } = await supabase.auth.getSession();
      if (session && selectedAction) {
        await supabase.from("audit_log").insert({
          user_id: session.user.id,
          user_email: session.user.email,
          user_role: getActorRole(),
          action: `gestionar_suscripcion_${selectedAction}`,
          entity_type: "suscripcion",
          entity_id: primarySub?.id || alumno.id,
          details: { alumno: alumno.nombre, accion: selectedAction, motivo: motivo || null },
        } as any);
      }

      onSuccess();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Error al ejecutar la acción");
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (d: string | null) => {
    if (!d) return "—";
    const parts = d.substring(0, 10).split("-");
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  };

  if (!alumno) return null;

  const badgeCfg: { className: string } = effectiveStatus !== "sin_suscripcion"
    ? (SUB_STATUS_BADGE[effectiveStatus] || { className: "" })
    : { className: "text-muted-foreground border-dashed" };
  const statusLabel = effectiveStatus !== "sin_suscripcion"
    ? (SUB_STATUS_LABELS[effectiveStatus] || effectiveStatus)
    : "Sin suscripción";

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg bg-card border-border max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading uppercase tracking-wider flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-primary" />
              Gestionar suscripción
            </DialogTitle>
            <DialogDescription>
              {alumno.nombre} {(alumno as any).apellido || ""}
            </DialogDescription>
          </DialogHeader>

          {/* Current status overview */}
          <div className="rounded-lg border border-border bg-secondary/30 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground uppercase tracking-wider">Estado actual</span>
              <Badge variant="outline" className={`text-xs ${badgeCfg.className}`}>{statusLabel}</Badge>
            </div>
            {primarySub?.planes && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Plan</span>
                <span className="text-sm font-medium text-foreground">{primarySub.planes.nombre}</span>
              </div>
            )}
            {primarySub?.fecha_inicio && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Inicio</span>
                <span className="text-sm text-foreground">{formatDate(primarySub.fecha_inicio)}</span>
              </div>
            )}
            {primarySub?.fecha_fin && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Vencimiento</span>
                <span className="text-sm text-foreground">{formatDate(primarySub.fecha_fin)}</span>
              </div>
            )}
            {primarySub?.metodo_pago && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Método de pago</span>
                <span className="text-sm text-foreground capitalize">{primarySub.metodo_pago}</span>
              </div>
            )}
          </div>

          {/* Subscription picker — clickable list of all subs */}
          {alumnoSubs.length > 1 && (
            <div className="space-y-1.5">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                Seleccionar suscripción ({alumnoSubs.length})
              </p>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {alumnoSubs.map(s => {
                  const eff = getEffectiveSubStatus({ estado: s.estado, fecha_fin: s.fecha_fin, cancelada_at: s.cancelada_at });
                  const isActive = s.id === primarySub?.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => handleSelectSub(s.id)}
                      className={`w-full flex items-center justify-between py-1.5 px-2 rounded text-xs transition-colors text-left ${
                        isActive
                          ? "bg-primary/15 border border-primary/40"
                          : "bg-secondary/20 border border-transparent hover:bg-secondary/40"
                      }`}
                    >
                      <span className={isActive ? "text-foreground font-medium" : "text-foreground"}>
                        {s.planes?.nombre || "—"}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">{formatDate(s.fecha_inicio)} — {formatDate(s.fecha_fin)}</span>
                        <Badge variant="outline" className={`text-[10px] ${SUB_STATUS_BADGE[eff]?.className || ""}`}>
                          {SUB_STATUS_LABELS[eff] || eff}
                        </Badge>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <Separator />

          {/* Action selection */}
          {!selectedAction ? (
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Acciones disponibles</p>
              {availableActions.length === 0 && (
                <p className="text-sm text-muted-foreground py-4 text-center">No hay acciones disponibles para el estado actual.</p>
              )}
              {availableActions.map(a => (
                <Button
                  key={a.type}
                  variant={a.destructive ? "destructive" : "ghost"}
                  className={`w-full justify-start gap-2 h-10 ${a.destructive ? "" : "hover:bg-secondary"}`}
                  onClick={() => {
                    if (a.type === "cancelar") {
                      setSelectedAction(a.type);
                    } else {
                      setSelectedAction(a.type);
                    }
                  }}
                >
                  <a.icon className="w-4 h-4" />
                  {a.label}
                </Button>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => { setSelectedAction(null); setMotivo(""); setNewPlanId(""); setSubChangeTarget(""); }}>
                ← Volver a acciones
              </Button>

              {/* Cambiar plan */}
              {selectedAction === "cambiar_plan" && (
                <div className="space-y-3">
                  <p className="text-sm font-medium">Cambiar plan</p>
                  {primarySub?.planes && (
                    <p className="text-xs text-muted-foreground">Plan actual: {primarySub.planes.nombre} — {primarySub.planes.moneda} {primarySub.planes.precio}</p>
                  )}
                  <Select value={newPlanId} onValueChange={setNewPlanId}>
                    <SelectTrigger className="bg-secondary border-border"><SelectValue placeholder="Seleccionar nuevo plan" /></SelectTrigger>
                    <SelectContent>
                      {planes.filter(p => p.activo).map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.nombre} — {p.moneda} {p.precio}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Agregar plan */}
              {selectedAction === "agregar_plan" && (
                <div className="space-y-3">
                  <p className="text-sm font-medium">Agregar plan</p>
                  <Select value={newPlanId} onValueChange={setNewPlanId}>
                    <SelectTrigger className="bg-secondary border-border"><SelectValue placeholder="Seleccionar plan" /></SelectTrigger>
                    <SelectContent>
                      {planes.filter(p => p.activo).map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.nombre} — {p.moneda} {p.precio}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="space-y-2">
                    <Label className="text-xs">Fecha de vencimiento</Label>
                    <Input type="date" value={manualFechaFin} onChange={e => setManualFechaFin(e.target.value)} className="bg-secondary border-border" />
                  </div>
                </div>
              )}

              {/* Pausar / Reactivar / Activar */}
              {(selectedAction === "pausar" || selectedAction === "reactivar" || selectedAction === "activar") && (
                <div className="space-y-3">
                  <p className="text-sm font-medium">
                    {selectedAction === "pausar" ? "Pausar suscripción" : selectedAction === "reactivar" ? "Reactivar suscripción" : "Activar suscripción manualmente"}
                  </p>
                  <div className="space-y-2">
                    <Label className="text-xs">Motivo (opcional)</Label>
                    <Input value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ej: Solicitud del alumno" className="bg-secondary border-border text-sm" />
                  </div>
                </div>
              )}

              {/* Marcar pago pendiente */}
              {selectedAction === "marcar_pago_pendiente" && (
                <div className="space-y-3">
                  <p className="text-sm font-medium">Marcar como pago pendiente</p>
                  <div className="rounded-md bg-amber-500/10 border border-amber-500/30 p-2 text-xs text-amber-400 flex items-center gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    Se adelantará la fecha de vencimiento para que el sistema refleje pago pendiente.
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Motivo (opcional)</Label>
                    <Input value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Motivo..." className="bg-secondary border-border text-sm" />
                  </div>
                </div>
              )}

              {/* Cancelar */}
              {selectedAction === "cancelar" && (
                <div className="space-y-3">
                  <p className="text-sm font-medium text-destructive">Cancelar suscripción</p>
                  <div className="rounded-md bg-destructive/10 border border-destructive/30 p-2 text-xs text-destructive flex items-center gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    Esta acción cancelará la suscripción. El alumno mantendrá acceso hasta la fecha de vencimiento actual.
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Motivo (obligatorio)</Label>
                    <Textarea value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Motivo de la cancelación..." className="bg-secondary border-border text-sm min-h-[60px]" />
                  </div>
                </div>
              )}

              {/* Cambiar estado manualmente */}
              {selectedAction === "cambiar_estado" && primarySub && (() => {
                const fallbackTransitions = ["activa", "pausa", "vencida", "cancelada"];
                const transitions = (VALID_SUB_TRANSITIONS[primarySub.estado] && VALID_SUB_TRANSITIONS[primarySub.estado].length > 0)
                  ? VALID_SUB_TRANSITIONS[primarySub.estado]
                  : fallbackTransitions.filter(s => s !== primarySub.estado);
                return (
                <div className="space-y-3">
                  <p className="text-sm font-medium">Cambiar estado manualmente</p>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">Actual:</span>
                    <Badge variant="outline" className={`text-xs ${(badgeCfg as any).className || ""}`}>{statusLabel}</Badge>
                  </div>
                  <Select value={subChangeTarget} onValueChange={setSubChangeTarget}>
                    <SelectTrigger className="bg-secondary border-border text-xs"><SelectValue placeholder="Seleccionar estado" /></SelectTrigger>
                    <SelectContent className="z-[100] bg-popover">
                      {transitions.map(e => (
                        <SelectItem key={e} value={e} className="text-xs">{SUB_STATUS_LABELS[e] || e}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="space-y-2">
                    <Label className="text-xs">Motivo (opcional)</Label>
                    <Input value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Motivo del cambio..." className="bg-secondary border-border text-sm" />
                  </div>
                </div>
                );
              })()}
            </div>
          )}

          {selectedAction && (
            <DialogFooter>
              <Button variant="outline" onClick={() => { setSelectedAction(null); setMotivo(""); }}>Cancelar</Button>
              <Button
                variant={selectedAction === "cancelar" ? "destructive" : "gold"}
                disabled={saving || (selectedAction === "cancelar" && !motivo.trim()) || ((selectedAction === "cambiar_plan" || selectedAction === "agregar_plan") && !newPlanId) || (selectedAction === "cambiar_estado" && !subChangeTarget)}
                onClick={selectedAction === "cancelar" ? () => setConfirmCancel(true) : handleExecute}
              >
                {saving ? "Guardando..." : "Confirmar"}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/* Cancel confirmation */}
      <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Cancelar suscripción de {alumno?.nombre}?</AlertDialogTitle>
            <AlertDialogDescription>
              Se cancelará la suscripción actual. El alumno mantendrá acceso hasta la fecha de vencimiento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Volver</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setConfirmCancel(false); handleExecute(); }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Confirmar cancelación
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
