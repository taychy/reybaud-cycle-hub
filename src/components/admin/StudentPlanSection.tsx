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
import { CreditCard, Play, Pause, XCircle, CalendarCheck, ArrowRightLeft, AlertTriangle, Plus, Bell, Eye, Tag } from "lucide-react";
import { toast } from "sonner";
import { logStudentActivity } from "@/lib/logStudentActivity";
import { useStudentDiscounts } from "@/hooks/useStudentDiscounts";
import { getEffectiveSubStatus, SUB_STATUS_LABELS } from "@/lib/subscriptionStatus";
import type { Tables } from "@/integrations/supabase/types";

type Alumno = Tables<"alumnos">;
type Plan = Tables<"planes">;

interface SuscripcionData {
  id: string;
  alumno_id: string;
  plan_id: string;
  estado: string;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  mp_status: string | null;
  created_at: string;
  descuento_id: string | null;
  precio_base: number | null;
  precio_final: number | null;
  planes: { id: string; nombre: string; precio: number; moneda: string } | null;
  descuentos: { id: string; nombre: string; valor: number; tipo: string } | null;
}

interface Props {
  alumno: Alumno;
  isSuperAdmin: boolean;
  onRefresh: () => void;
  onAlumnoUpdate: (a: Alumno) => void;
  openOverduePreviewToken?: number;
}

const getSubBadge = (estado: string) => {
  switch (estado) {
    case "activa": return { variant: "default" as const, className: "bg-emerald-600/20 text-emerald-400 border-emerald-500/30" };
    case "pausa": return { variant: "secondary" as const, className: "border-amber-500/50 text-amber-400" };
    case "pago_pendiente": return { variant: "outline" as const, className: "bg-amber-500/20 text-amber-400 border-amber-500/30" };
    case "acceso_pausado": return { variant: "destructive" as const, className: "bg-destructive/20 text-destructive border-destructive/30" };
    case "vencida": return { variant: "destructive" as const, className: "" };
    case "pendiente": case "pendiente_verificacion": return { variant: "outline" as const, className: "border-yellow-500/50 text-yellow-400" };
    case "cancelada": return { variant: "outline" as const, className: "text-muted-foreground" };
    default: return { variant: "outline" as const, className: "text-muted-foreground border-dashed" };
  }
};

const formatDate = (d: string | null) => {
  if (!d) return "—";
  const parts = d.substring(0, 10).split("-");
  const date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  return date.toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" });
};

const getPaymentMethodLabel = (method: string | null) => {
  if (!method) return "—";
  const map: Record<string, string> = { manual: "Manual (admin)", efectivo: "Efectivo", transferencia: "Transferencia", mercadopago: "Mercado Pago", tarjeta: "Tarjeta", approved: "Mercado Pago", "400": "Mercado Pago", cancelled: "Mercado Pago", conciliado: "—", pendiente_verificacion: "—" };
  return map[method] || method;
};

const isOverdueStatus = (estado: string) =>
  estado === "vencida" || estado === "pago_pendiente" || estado === "acceso_pausado";

export function StudentPlanSection({ alumno, isSuperAdmin, onRefresh, onAlumnoUpdate, openOverduePreviewToken }: Props) {
  const [subs, setSubs] = useState<SuscripcionData[]>([]);
  const [planes, setPlanes] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
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
  const [removeSubId, setRemoveSubId] = useState<string | null>(null);

  // Email preview state
  const [previewSub, setPreviewSub] = useState<SuscripcionData | null>(null);
  const [sendingNotif, setSendingNotif] = useState(false);
  const [lastHandledOverduePreviewToken, setLastHandledOverduePreviewToken] = useState<number | null>(null);

  const actorRole = isSuperAdmin ? "super_admin" : "admin";

  const fetchData = async () => {
    setLoading(true);
    const [subsRes, planesRes, discountsRes] = await Promise.all([
      supabase.from("suscripciones").select("id, alumno_id, plan_id, estado, fecha_inicio, fecha_fin, mp_status, created_at, descuento_id, precio_base, precio_final, planes(id, nombre, precio, moneda), descuentos(id, nombre, valor, tipo)")
        .eq("alumno_id", alumno.id)
        .order("created_at", { ascending: false }),
      supabase.from("planes").select("*").eq("activo", true).order("nombre"),
      supabase.from("descuentos").select("id, nombre, valor, tipo, categoria").eq("activo", true).eq("categoria", "segunda_actividad"),
    ]);
    setSubs((subsRes.data as any) || []);
    setPlanes(planesRes.data || []);
    setAvailableDiscounts((discountsRes.data as any) || []);
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

  // Categorize subscriptions using shared effective status
  const activeSubs = subs.filter(s => {
    const eff = getEffectiveSubStatus({ estado: s.estado, fecha_fin: s.fecha_fin });
    return eff === "activa" || eff === "pendiente_verificacion" || eff === "pausa" || eff === "pago_pendiente";
  });
  const historicSubs = subs.filter(s => !activeSubs.includes(s));

  const getEffStatus = (s: SuscripcionData) => getEffectiveSubStatus({ estado: s.estado, fecha_fin: s.fecha_fin });

  // --- Actions ---
  const handlePauseSub = async (subId: string) => {
    await supabase.from("suscripciones").update({ estado: "pausa" }).eq("id", subId);
    const sub = subs.find(s => s.id === subId);
    toast.success("Suscripción pausada");
    await logStudentActivity({ alumnoId: alumno.id, eventType: "estado_suscripcion", title: "Suscripción → pausa", description: `Plan "${sub?.planes?.nombre || "—"}" pausado`, actorRole });
    fetchData();
    onRefresh();
  };

  const handleReactivateSub = async (subId: string) => {
    await supabase.from("suscripciones").update({ estado: "activa" }).eq("id", subId);
    const sub = subs.find(s => s.id === subId);
    toast.success("Suscripción reactivada");
    await logStudentActivity({ alumnoId: alumno.id, eventType: "estado_suscripcion", title: "Suscripción → activa", description: `Plan "${sub?.planes?.nombre || "—"}" reactivado`, actorRole });
    fetchData();
    onRefresh();
  };

  const handleRemovePlan = async () => {
    if (!removeSubId) return;
    const sub = subs.find(s => s.id === removeSubId);
    await supabase.from("suscripciones").update({ estado: "cancelada", cancelada_motivo: "Plan removido por admin", cancelada_at: new Date().toISOString() } as any).eq("id", removeSubId);
    toast.success("Plan removido");
    await logStudentActivity({ alumnoId: alumno.id, eventType: "cambio_plan", title: "Plan removido", description: `Se removió el plan "${sub?.planes?.nombre || "—"}"`, actorRole, referenceLabel: sub?.planes?.nombre || "—" });
    setShowRemovePlan(false);
    setRemoveSubId(null);
    fetchData();
    onRefresh();
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
        // Add a NEW subscription without touching existing ones
        const endDate = new Date(changeFechaInicio);
        endDate.setMonth(endDate.getMonth() + 1);
        endDate.setDate(0);
        const endStr = endDate.toISOString().split("T")[0];
        await supabase.from("suscripciones").insert({
          alumno_id: alumno.id,
          plan_id: newPlanId,
          estado: "activa",
          fecha_inicio: changeFechaInicio,
          fecha_fin: endStr,
          mp_status: "manual",
        });
        toast.success(`Plan "${selectedPlan?.nombre}" agregado`);
        await logStudentActivity({
          alumnoId: alumno.id, eventType: "cambio_plan", title: "Plan agregado",
          description: `Se agregó "${selectedPlan?.nombre || "—"}" desde ${new Date(changeFechaInicio).toLocaleDateString("es-AR")}${changeNote ? `. Nota: ${changeNote}` : ""}`,
          actorRole, referenceType: "plan", referenceId: newPlanId, referenceLabel: selectedPlan?.nombre || "—",
        });
      } else {
        // Change an existing subscription's plan
        const sub = subs.find(s => s.id === dialogSubId);
        const oldPlanName = sub?.planes?.nombre || "Sin plan";
        await supabase.from("suscripciones").update({ plan_id: newPlanId, fecha_inicio: changeFechaInicio } as any).eq("id", dialogSubId!);
        toast.success(`Plan actualizado`);
        await logStudentActivity({
          alumnoId: alumno.id, eventType: "cambio_plan", title: "Cambio de plan",
          description: `Cambió de "${oldPlanName}" a "${selectedPlan?.nombre || "—"}"${changeNote ? `. Nota: ${changeNote}` : ""}`,
          actorRole, referenceType: "plan", referenceId: newPlanId, referenceLabel: selectedPlan?.nombre || "—",
        });
      }

      // Notify student
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

  const renderSubCard = (sub: SuscripcionData, index: number) => {
    const effectiveEstado = getEffStatus(sub);
    const effectiveBadge = getSubBadge(effectiveEstado);
    const isActive = effectiveEstado === "activa" || effectiveEstado === "pendiente_verificacion" || effectiveEstado === "pausa" || effectiveEstado === "pago_pendiente";

    // Discount logic
    const isSecondary = index > 0;
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

    return (
      <div key={sub.id} className="rounded-lg border border-border bg-secondary/30 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-foreground">{sub.planes?.nombre || "Sin plan"}</span>
          <Badge variant={effectiveBadge.variant} className={`text-[10px] ${effectiveBadge.className}`}>
            {effectiveEstado === "pendiente_verificacion" ? "Pendiente" : effectiveEstado}
          </Badge>
        </div>

        <div className="space-y-1 text-[11px]">
          {sub.fecha_inicio && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Inicio</span>
              <span className="text-foreground">{formatDate(sub.fecha_inicio)}</span>
            </div>
          )}
          {sub.fecha_fin && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Vencimiento</span>
              <span className={effectiveEstado === "pago_pendiente" || effectiveEstado === "acceso_pausado" || effectiveEstado === "vencida" ? "text-destructive font-medium" : "text-foreground"}>
                {formatDate(sub.fecha_fin)}
              </span>
            </div>
          )}
          {sub.mp_status && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Medio de pago</span>
              <span className="text-foreground">{getPaymentMethodLabel(sub.mp_status)}</span>
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
        </div>

        {/* Per-subscription actions */}
        {isActive && (
          <div className="flex flex-wrap gap-1 pt-1">
            <Button variant="outline" size="sm" className="text-[10px] h-6 px-2" onClick={() => openChangePlan(sub.id)}>
              <ArrowRightLeft className="w-3 h-3 mr-0.5" /> Cambiar
            </Button>
            {sub.estado === "activa" && (
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

        {/* Notify overdue button for expired/pending statuses */}
        {isOverdueStatus(effectiveEstado) && (
          <div className="pt-1">
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
          <Button variant="gold" size="sm" className="text-[10px] h-6 px-2" onClick={openAddPlan}>
            <Plus className="w-3 h-3 mr-0.5" /> Agregar plan
          </Button>
        </div>

        {/* Active subscriptions */}
        {activeSubs.length > 0 ? (
          <div className="space-y-2">
            {activeSubs.map((sub, i) => renderSubCard(sub, i))}
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
              {historicSubs.slice(0, 5).map((sub, i) => renderSubCard(sub, activeSubs.length + i))}
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
      <Dialog open={showRemovePlan} onOpenChange={setShowRemovePlan}>
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
            <Button variant="outline" onClick={() => setShowRemovePlan(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleRemovePlan}>Confirmar</Button>
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
                {/* Email metadata */}
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

                {/* Email body preview */}
                <div className="rounded-md border border-border bg-white p-4 space-y-3">
                  <h3 className="text-[#d4820a] font-semibold text-base">⚠️ Mensualidad vencida</h3>
                  <p className="text-sm text-[#333]">
                    Hola <strong>{firstName}</strong>, te informamos que tu mensualidad en Ciclismo Reybaud se encuentra vencida{fechaText ? <> desde el <strong>{fechaText}</strong></> : ""}.
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

                {/* Plan info */}
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
    </>
  );
}
