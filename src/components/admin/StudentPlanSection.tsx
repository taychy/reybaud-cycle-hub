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
import { CreditCard, Play, Pause, XCircle, CalendarCheck, ArrowRightLeft, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { logStudentActivity } from "@/lib/logStudentActivity";
import { useStudentDiscounts } from "@/hooks/useStudentDiscounts";
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
}

const getSubBadge = (estado: string) => {
  switch (estado) {
    case "activa": return { variant: "default" as const, className: "bg-emerald-600/20 text-emerald-400 border-emerald-500/30" };
    case "pausa": return { variant: "secondary" as const, className: "border-amber-500/50 text-amber-400" };
    case "vencida": return { variant: "destructive" as const, className: "" };
    case "pendiente": case "pendiente_verificacion": return { variant: "outline" as const, className: "border-yellow-500/50 text-yellow-400" };
    case "cancelada": return { variant: "outline" as const, className: "text-muted-foreground" };
    default: return { variant: "outline" as const, className: "text-muted-foreground border-dashed" };
  }
};

const formatDate = (d: string | null) => d ? new Date(d).toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const getPaymentMethodLabel = (method: string | null) => {
  if (!method) return "—";
  const map: Record<string, string> = {
    manual: "Manual (admin)",
    efectivo: "Efectivo",
    transferencia: "Transferencia",
    mercadopago: "Mercado Pago",
    tarjeta: "Tarjeta",
  };
  return map[method] || method;
};

export function StudentPlanSection({ alumno, isSuperAdmin, onRefresh, onAlumnoUpdate }: Props) {
  const [subs, setSubs] = useState<SuscripcionData[]>([]);
  const [planes, setPlanes] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const { discounts, applyDiscount, loading: discountsLoading } = useStudentDiscounts(alumno.id);

  // Change plan dialog
  const [showChangePlan, setShowChangePlan] = useState(false);
  const [newPlanId, setNewPlanId] = useState("");
  const [changeFechaInicio, setChangeFechaInicio] = useState("");
  const [changeMode, setChangeMode] = useState<"immediate" | "renewal">("immediate");
  const [changeNote, setChangeNote] = useState("");
  const [saving, setSaving] = useState(false);

  // Remove plan confirm
  const [showRemovePlan, setShowRemovePlan] = useState(false);

  const actorRole = isSuperAdmin ? "super_admin" : "admin";

  const fetchData = async () => {
    setLoading(true);
    const [subsRes, planesRes] = await Promise.all([
      supabase.from("suscripciones").select("id, alumno_id, plan_id, estado, fecha_inicio, fecha_fin, mp_status, created_at, descuento_id, precio_base, precio_final, planes(id, nombre, precio, moneda), descuentos(id, nombre, valor, tipo)")
        .eq("alumno_id", alumno.id)
        .order("created_at", { ascending: false }),
      supabase.from("planes").select("*").eq("activo", true).order("nombre"),
    ]);
    setSubs((subsRes.data as any) || []);
    setPlanes(planesRes.data || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [alumno.id]);

  const activeSub = subs.find(s => {
    const today = new Date().toISOString().split("T")[0];
    return (s.estado === "activa" || s.estado === "pendiente_verificacion" || s.estado === "pausa") && (!s.fecha_fin || s.fecha_fin >= today);
  });
  const latestSub = subs[0] || null;
  const currentSub = activeSub || latestSub;

  // --- Actions ---
  const handlePauseSub = async () => {
    if (!activeSub) return;
    await supabase.from("suscripciones").update({ estado: "pausa" }).eq("id", activeSub.id);
    toast.success("Suscripción pausada");
    await logStudentActivity({ alumnoId: alumno.id, eventType: "estado_suscripcion", title: "Suscripción → pausa", description: `Pausada manualmente`, actorRole });
    fetchData();
    onRefresh();
  };

  const handleReactivateSub = async () => {
    if (!activeSub && !latestSub) return;
    const sub = activeSub || latestSub!;
    await supabase.from("suscripciones").update({ estado: "activa" }).eq("id", sub.id);
    toast.success("Suscripción reactivada");
    await logStudentActivity({ alumnoId: alumno.id, eventType: "estado_suscripcion", title: "Suscripción → activa", description: `Reactivada manualmente`, actorRole });
    fetchData();
    onRefresh();
  };

  const handleRemovePlan = async () => {
    if (!currentSub) return;
    await supabase.from("suscripciones").update({ estado: "cancelada", cancelada_motivo: "Plan removido por admin", cancelada_at: new Date().toISOString() } as any).eq("id", currentSub.id);
    toast.success("Plan removido");
    await logStudentActivity({ alumnoId: alumno.id, eventType: "cambio_plan", title: "Plan removido", description: `Se removió el plan "${currentSub.planes?.nombre || "—"}"`, actorRole, referenceLabel: currentSub.planes?.nombre || "—" });
    setShowRemovePlan(false);
    fetchData();
    onRefresh();
  };

  const openChangePlan = () => {
    const today = new Date().toISOString().split("T")[0];
    setNewPlanId(activeSub?.plan_id || "");
    setChangeFechaInicio(today);
    setChangeMode("immediate");
    setChangeNote("");
    setShowChangePlan(true);
  };

  const handleChangePlan = async () => {
    if (!newPlanId) return;
    setSaving(true);
    try {
      const selectedPlan = planes.find(p => p.id === newPlanId);
      const oldPlanName = currentSub?.planes?.nombre || "Sin plan";

      if (changeMode === "immediate") {
        if (activeSub) {
          await supabase.from("suscripciones").update({ plan_id: newPlanId, fecha_inicio: changeFechaInicio } as any).eq("id", activeSub.id);
        } else {
          const endDate = new Date(changeFechaInicio);
          endDate.setMonth(endDate.getMonth() + 1);
          endDate.setDate(0); // last day of month
          const endStr = endDate.toISOString().split("T")[0];
          // Mark any existing active/pausa subs as vencida
          await supabase.from("suscripciones").update({ estado: "vencida" }).eq("alumno_id", alumno.id).in("estado", ["activa", "pausa"]);
          await supabase.from("suscripciones").insert({
            alumno_id: alumno.id,
            plan_id: newPlanId,
            estado: "activa",
            fecha_inicio: changeFechaInicio,
            fecha_fin: endStr,
            mp_status: "manual",
          });
        }
      } else {
        // Scheduled for renewal — just update the plan_id for next cycle
        if (activeSub) {
          await supabase.from("suscripciones").update({ plan_id: newPlanId } as any).eq("id", activeSub.id);
        }
      }

      // Notify student
      supabase.functions.invoke("notify-student-update", {
        body: { alumno_id: alumno.id, type: "plan_cambiado", plan_nombre: selectedPlan?.nombre || "Nuevo plan", plan_precio: selectedPlan?.precio, plan_moneda: selectedPlan?.moneda },
      }).catch(() => {});

      const modeLabel = changeMode === "immediate"
        ? `con vigencia desde ${new Date(changeFechaInicio).toLocaleDateString("es-AR")}`
        : "programado para próxima renovación";

      toast.success(`Plan actualizado para ${alumno.nombre}`);
      await logStudentActivity({
        alumnoId: alumno.id,
        eventType: "cambio_plan",
        title: "Cambio de plan",
        description: `Cambió de "${oldPlanName}" a "${selectedPlan?.nombre || "—"}" ${modeLabel}${changeNote ? `. Nota: ${changeNote}` : ""}`,
        actorRole,
        referenceType: "plan",
        referenceId: newPlanId,
        referenceLabel: selectedPlan?.nombre || "—",
      });

      setShowChangePlan(false);
      fetchData();
      onRefresh();
    } catch (err: any) {
      toast.error(err.message || "Error al cambiar el plan");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <CreditCard className="w-4 h-4" /> Plan y Suscripción
        </h3>
        <p className="text-xs text-muted-foreground">Cargando...</p>
      </div>
    );
  }

  const subEstado = activeSub?.estado || (latestSub ? latestSub.estado : "sin_suscripcion");
  const subBadge = getSubBadge(subEstado);

  return (
    <>
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <CreditCard className="w-4 h-4" /> Plan y Suscripción
        </h3>

        <div className="space-y-2 text-sm">
          {/* Plan actual */}
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground text-xs">Plan actual</span>
            <span className="text-foreground text-xs font-medium">{currentSub?.planes?.nombre || "Sin plan"}</span>
          </div>

          {/* Estado suscripción */}
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground text-xs">Estado suscripción</span>
            <Badge variant={subBadge.variant} className={`text-xs ${subBadge.className}`}>
              {subEstado === "sin_suscripcion" ? "Sin plan" : subEstado}
            </Badge>
          </div>

          {/* Fecha inicio */}
          {currentSub?.fecha_inicio && (
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground text-xs">Inicio del plan</span>
              <span className="text-foreground text-xs">{formatDate(currentSub.fecha_inicio)}</span>
            </div>
          )}

          {/* Vencimiento */}
          {currentSub?.fecha_fin && (
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground text-xs">Próximo vencimiento</span>
              <span className={`text-xs ${new Date(currentSub.fecha_fin) < new Date() ? "text-destructive font-medium" : "text-foreground"}`}>
                {formatDate(currentSub.fecha_fin)}
              </span>
            </div>
          )}

          {/* Medio de pago */}
          {currentSub?.mp_status && (
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground text-xs">Medio de pago</span>
              <span className="text-foreground text-xs">{getPaymentMethodLabel(currentSub.mp_status)}</span>
            </div>
          )}

          {/* Precio */}
          {currentSub?.planes && (
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground text-xs">Precio del plan</span>
              <span className={`text-xs font-mono ${currentSub.descuento_id ? "text-muted-foreground line-through" : "text-foreground"}`}>
                {currentSub.planes.moneda} {currentSub.precio_base ?? currentSub.planes.precio}
              </span>
            </div>
          )}

          {/* Descuento aplicado */}
          {currentSub?.descuento_id && currentSub.descuentos && (
            <div className="flex justify-between items-center">
              <span className="text-xs text-emerald-400">
                {currentSub.descuentos.nombre} ({currentSub.descuentos.tipo === "fijo" ? `$${currentSub.descuentos.valor}` : `${currentSub.descuentos.valor}%`})
              </span>
              <span className="text-xs text-emerald-400 font-mono">
                -{currentSub.planes.moneda} {(currentSub.precio_base ?? currentSub.planes.precio) - (currentSub.precio_final ?? currentSub.planes.precio)}
              </span>
            </div>
          )}

          {/* Precio final */}
          {currentSub?.descuento_id && currentSub.precio_final != null && (
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground text-xs font-medium">Precio final</span>
              <span className="text-foreground text-xs font-mono font-medium">{currentSub.planes?.moneda} {currentSub.precio_final}</span>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-1.5 pt-1">
          <Button variant="gold" size="sm" className="text-xs h-7" onClick={openChangePlan}>
            <ArrowRightLeft className="w-3 h-3 mr-1" /> {currentSub?.planes ? "Cambiar plan" : "Asignar plan"}
          </Button>
          {activeSub?.estado === "activa" && (
            <Button variant="outline" size="sm" className="text-xs h-7" onClick={handlePauseSub}>
              <Pause className="w-3 h-3 mr-1" /> Pausar
            </Button>
          )}
          {(activeSub?.estado === "pausa" || (!activeSub && latestSub?.estado === "pausa")) && (
            <Button variant="outline" size="sm" className="text-xs h-7" onClick={handleReactivateSub}>
              <Play className="w-3 h-3 mr-1" /> Reactivar
            </Button>
          )}
          {currentSub && currentSub.estado !== "cancelada" && (
            <Button variant="outline" size="sm" className="text-xs h-7 text-destructive hover:text-destructive" onClick={() => setShowRemovePlan(true)}>
              <XCircle className="w-3 h-3 mr-1" /> Quitar plan
            </Button>
          )}
        </div>
      </div>

      {/* ===== CHANGE PLAN DIALOG ===== */}
      <Dialog open={showChangePlan} onOpenChange={setShowChangePlan}>
        <DialogContent className="sm:max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="font-heading uppercase tracking-wider">
              {currentSub?.planes ? "Cambiar plan" : "Asignar plan"}
            </DialogTitle>
            <DialogDescription>
              Alumno: {alumno.nombre} {(alumno as any).apellido || ""}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Current plan */}
            {currentSub?.planes && (
              <div className="rounded-md bg-secondary/50 p-3 space-y-1">
                <span className="text-xs text-muted-foreground">Plan actual</span>
                <p className="text-sm font-medium text-foreground">{currentSub.planes.nombre} — {currentSub.planes.moneda} {currentSub.planes.precio}</p>
                {currentSub.fecha_fin && (
                  <p className="text-xs text-muted-foreground">Vence: {formatDate(currentSub.fecha_fin)}</p>
                )}
              </div>
            )}

            {/* New plan selection */}
            <div className="space-y-2">
              <Label className="text-xs">Nuevo plan</Label>
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

            {/* Start date */}
            <div className="space-y-2">
              <Label className="text-xs">Fecha de inicio del cambio</Label>
              <Input
                type="date"
                value={changeFechaInicio}
                onChange={(e) => setChangeFechaInicio(e.target.value)}
                className="bg-secondary border-border text-sm"
              />
            </div>

            {/* Change mode */}
            {activeSub && (
              <div className="space-y-2">
                <Label className="text-xs">¿Cuándo aplicar el cambio?</Label>
                <RadioGroup value={changeMode} onValueChange={(v) => setChangeMode(v as "immediate" | "renewal")} className="space-y-2">
                  <div className="flex items-start space-x-2">
                    <RadioGroupItem value="immediate" id="immediate" className="mt-0.5" />
                    <div>
                      <Label htmlFor="immediate" className="text-xs font-medium cursor-pointer">Reemplazar inmediatamente</Label>
                      <p className="text-[10px] text-muted-foreground">El plan anterior se reemplaza ahora</p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-2">
                    <RadioGroupItem value="renewal" id="renewal" className="mt-0.5" />
                    <div>
                      <Label htmlFor="renewal" className="text-xs font-medium cursor-pointer">Programar para próxima renovación</Label>
                      <p className="text-[10px] text-muted-foreground">El plan actual se mantiene hasta su vencimiento</p>
                    </div>
                  </div>
                </RadioGroup>
              </div>
            )}

            {/* Internal note */}
            <div className="space-y-2">
              <Label className="text-xs">Nota interna (opcional)</Label>
              <Textarea
                value={changeNote}
                onChange={(e) => setChangeNote(e.target.value)}
                placeholder="Ej: Upgrade solicitado por el alumno..."
                className="bg-secondary border-border text-sm min-h-[50px]"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowChangePlan(false)}>Cancelar</Button>
            <Button variant="gold" disabled={!newPlanId || saving} onClick={handleChangePlan}>
              {saving ? "Guardando..." : "Confirmar cambio"}
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
              Se cancelará la suscripción de {alumno.nombre}. Esta acción se registrará en la actividad.
            </DialogDescription>
          </DialogHeader>
          {currentSub?.planes && (
            <div className="rounded-md bg-destructive/10 border border-destructive/30 p-3 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
              <span className="text-xs text-destructive">Se cancelará: {currentSub.planes.nombre}</span>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRemovePlan(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleRemovePlan}>Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
