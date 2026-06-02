import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { formatPrice } from "@/lib/currency";
import { supabase } from "@/integrations/supabase/client";
import { ArrowRightLeft, ArrowRight, Check, AlertTriangle, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useToast } from "@/hooks/use-toast";

interface Plan {
  id: string;
  nombre: string;
  precio: number;
  frecuencia: string;
}

interface ChangePlanDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentSubscription: {
    id: string;
    plan_id: string;
    plan_nombre: string;
    plan_precio: number;
    fecha_inicio: string | null;
    fecha_fin: string | null;
    precio_final: number | null;
    precio_base: number | null;
  };
  alumnoId: string;
  onPlanChanged: () => void;
}

async function logSolicitudCambioPlan(payload: {
  alumno_id: string;
  sub_actual_id: string;
  plan_actual_id: string;
  plan_actual_nombre: string;
  plan_nuevo_id: string;
  plan_nuevo_nombre: string;
  diferencia: number;
  nota: string;
}) {
  try {
    await supabase.from("solicitudes_cambio_plan" as any).insert({
      alumno_id: payload.alumno_id,
      sub_actual_id: payload.sub_actual_id,
      plan_actual_id: payload.plan_actual_id,
      plan_actual_nombre: payload.plan_actual_nombre,
      plan_nuevo_id: payload.plan_nuevo_id,
      plan_nuevo_nombre: payload.plan_nuevo_nombre,
      diferencia: payload.diferencia,
      scope: "actual",
      estado: "pendiente",
      nota: payload.nota,
    } as any);
  } catch (e) {
    console.warn("[solicitudes_cambio_plan] No se pudo registrar la solicitud:", e);
  }
}

function calcProrate(
  precioActual: number,
  precioNuevo: number,
  fechaInicio: string,
  fechaFin: string
) {
  const inicio = new Date(fechaInicio + "T00:00:00");
  const fin = new Date(fechaFin + "T23:59:59");
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const diasTotales = Math.max(1, Math.ceil((fin.getTime() - inicio.getTime()) / (1000 * 60 * 60 * 24)) + 1);
  const diasRestantes = Math.max(0, Math.ceil((fin.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24)));

  const creditoPorDiaNoUsado = (precioActual / diasTotales) * diasRestantes;
  const costoNuevoProrateado = (precioNuevo / diasTotales) * diasRestantes;
  const diferencia = costoNuevoProrateado - creditoPorDiaNoUsado;

  return {
    diasTotales,
    diasRestantes,
    credito: Math.round(creditoPorDiaNoUsado * 100) / 100,
    costoNuevo: Math.round(costoNuevoProrateado * 100) / 100,
    diferencia: Math.round(diferencia * 100) / 100,
  };
}

export default function ChangePlanDrawer({
  open,
  onOpenChange,
  currentSubscription,
  alumnoId,
  onPlanChanged,
}: ChangePlanDrawerProps) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [planes, setPlanes] = useState<Plan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [processing, setProcessing] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open) return;
    setSelectedPlan(null);
    supabase
      .from("planes")
      .select("id, nombre, precio, frecuencia")
      .eq("activo", true)
      .neq("id", currentSubscription.plan_id)
      .order("precio", { ascending: false })
      .then(({ data }) => {
        // Only show plans with similar billing type (exclude unique programs)
        const filtered = (data || []).filter(
          (p: any) => p.frecuencia !== "unico" && p.frecuencia !== "personalizada"
        );
        setPlanes(filtered as Plan[]);
        setLoading(false);
      });
  }, [open, currentSubscription.plan_id]);

  const precioActual =
    currentSubscription.precio_final ??
    currentSubscription.precio_base ??
    currentSubscription.plan_precio;

  const prorate =
    selectedPlan && currentSubscription.fecha_inicio && currentSubscription.fecha_fin
      ? calcProrate(
          precioActual,
          selectedPlan.precio,
          currentSubscription.fecha_inicio,
          currentSubscription.fecha_fin
        )
      : null;

  const isUpgrade = !!prorate && prorate.diferencia > 0;
  const isDowngradeOrEqual = !!prorate && prorate.diferencia <= 0;

  /**
   * UPGRADE: redirige al checkout normal con el plan preseleccionado.
   * No cancela el plan viejo todavía: eso ocurre cuando se confirma el pago.
   */
  const handleGoToCheckout = async () => {
    if (!selectedPlan || !prorate) return;
    await logSolicitudCambioPlan({
      alumno_id: alumnoId,
      sub_actual_id: currentSubscription.id,
      plan_actual_id: currentSubscription.plan_id,
      plan_actual_nombre: currentSubscription.plan_nombre,
      plan_nuevo_id: selectedPlan.id,
      plan_nuevo_nombre: selectedPlan.nombre,
      diferencia: prorate.diferencia,
      nota: `Cambio de plan en período actual (upgrade). Diferencia a pagar: ${formatPrice(prorate.diferencia)}. Pendiente confirmación de pago.`,
    });
    localStorage.setItem("registro_alumno_id", alumnoId);
    localStorage.setItem("alumno_renewal", "1");
    localStorage.setItem("upgrade_from_sub_id", currentSubscription.id);
    localStorage.setItem("upgrade_preselect_plan_id", selectedPlan.id);
    onOpenChange(false);
    navigate("/planes");
  };

  /**
   * DOWNGRADE / SIN DIFERENCIA: switch directo, acreditando saldo a favor.
   */
  const handleDirectSwitch = async () => {
    if (!selectedPlan || !prorate) return;
    setProcessing(true);

    try {
      const cancelledAt = new Date().toISOString();

      // 1. Cancelar suscripción anterior (estado completo)
      const { error: cancelErr } = await supabase
        .from("suscripciones")
        .update({
          estado: "cancelada",
          cancelada_at: cancelledAt,
          cancelada_motivo: `Cambio a "${selectedPlan.nombre}"`,
          auto_renovacion: false,
        } as any)
        .eq("id", currentSubscription.id);

      if (cancelErr) throw cancelErr;

      // 2. Crear suscripción nueva activa, manteniendo el período actual
      const { data: newSub, error: insertErr } = await supabase
        .from("suscripciones")
        .insert({
          alumno_id: alumnoId,
          plan_id: selectedPlan.id,
          estado: "activa",
          fecha_inicio: currentSubscription.fecha_inicio || new Date().toISOString().split("T")[0],
          fecha_fin: currentSubscription.fecha_fin,
          auto_renovacion: true,
          precio_base: selectedPlan.precio,
          precio_final: selectedPlan.precio,
        } as any)
        .select("id")
        .single();

      if (insertErr) {
        // Rollback manual de la cancelación
        await supabase
          .from("suscripciones")
          .update({
            estado: "activa",
            cancelada_at: null,
            cancelada_motivo: null,
          } as any)
          .eq("id", currentSubscription.id);
        throw insertErr;
      }

      // 3. Acreditar saldo a favor por días no usados (solo si hay diferencia negativa)
      if (prorate.diferencia < 0) {
        const creditToAdd = Math.abs(prorate.diferencia);
        const { data: alumnoData } = await supabase
          .from("alumnos")
          .select("saldo_a_favor")
          .eq("id", alumnoId)
          .single();

        const currentSaldo = (alumnoData as any)?.saldo_a_favor || 0;
        await supabase
          .from("alumnos")
          .update({ saldo_a_favor: currentSaldo + creditToAdd } as any)
          .eq("id", alumnoId);
      }

      // 4. Loguear el cambio
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from("cambios_plan").insert({
        alumno_id: alumnoId,
        suscripcion_anterior_id: currentSubscription.id,
        suscripcion_nueva_id: newSub.id,
        plan_anterior_id: currentSubscription.plan_id,
        plan_nuevo_id: selectedPlan.id,
        precio_anterior: precioActual,
        precio_nuevo: selectedPlan.precio,
        dias_restantes: prorate.diasRestantes,
        dias_totales: prorate.diasTotales,
        credito_calculado: prorate.credito,
        costo_nuevo_prorrateado: prorate.costoNuevo,
        diferencia: prorate.diferencia,
        saldo_aplicado: prorate.diferencia < 0 ? Math.abs(prorate.diferencia) : 0,
        realizado_por: user?.id ?? null,
        notas: prorate.diferencia < 0
          ? `Saldo a favor acreditado: ${formatPrice(Math.abs(prorate.diferencia))}`
          : "Cambio sin diferencia",
      } as any);

      toast({
        title: "Plan cambiado exitosamente",
        description:
          prorate.diferencia < 0
            ? `Ahora tenés ${selectedPlan.nombre}. Saldo a favor acreditado: ${formatPrice(Math.abs(prorate.diferencia))}.`
            : `Ahora tenés ${selectedPlan.nombre}.`,
      });

      await logSolicitudCambioPlan({
        alumno_id: alumnoId,
        sub_actual_id: currentSubscription.id,
        plan_actual_id: currentSubscription.plan_id,
        plan_actual_nombre: currentSubscription.plan_nombre,
        plan_nuevo_id: selectedPlan.id,
        plan_nuevo_nombre: selectedPlan.nombre,
        diferencia: prorate.diferencia,
        nota: prorate.diferencia < 0
          ? `Downgrade aplicado automáticamente. Saldo a favor acreditado: ${formatPrice(Math.abs(prorate.diferencia))}.`
          : `Cambio de plan sin diferencia, aplicado automáticamente.`,
      });

      onPlanChanged();
      onOpenChange(false);
    } catch (err: any) {
      console.error("Error changing plan:", err);
      toast({
        title: "Error",
        description: "No se pudo cambiar el plan. Intentá de nuevo.",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="bg-card border-border max-h-[85vh]">
        <DrawerHeader className="text-left">
          <DrawerTitle className="flex items-center gap-2 text-foreground">
            <ArrowRightLeft className="w-5 h-5 text-primary" />
            Cambiar de plan
          </DrawerTitle>
          <DrawerDescription>
            Plan actual: <span className="font-semibold text-foreground">{currentSubscription.plan_nombre}</span>
          </DrawerDescription>
        </DrawerHeader>

        <div className="px-4 pb-4 space-y-4 overflow-y-auto">
          {loading ? (
            <div className="py-8 text-center text-muted-foreground animate-pulse">
              Cargando planes...
            </div>
          ) : (
            <>
              {/* Plan selection */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Elegí tu nuevo plan
                </p>
                {planes.map((plan) => {
                  const isSelected = selectedPlan?.id === plan.id;
                  return (
                    <button
                      key={plan.id}
                      onClick={() => setSelectedPlan(plan)}
                      className={`w-full rounded-lg border p-3 text-left transition-all ${
                        isSelected
                          ? "border-primary bg-primary/10"
                          : "border-border hover:border-primary/50 bg-card/50"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-foreground">{plan.nombre}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold gold-text-gradient">
                            {formatPrice(plan.precio)}
                          </span>
                          {isSelected && <Check className="w-4 h-4 text-primary" />}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Prorate breakdown */}
              {selectedPlan && prorate && (
                <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Detalle del cambio
                  </p>

                  <div className="space-y-1.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Días restantes del período</span>
                      <span className="font-medium text-foreground">
                        {prorate.diasRestantes} de {prorate.diasTotales}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Crédito plan actual</span>
                      <span className="font-medium text-emerald-400">
                        +{formatPrice(prorate.credito)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Costo nuevo (prorrateado)</span>
                      <span className="font-medium text-foreground">
                        {formatPrice(prorate.costoNuevo)}
                      </span>
                    </div>

                    <div className="border-t border-border pt-2 mt-2">
                      <div className="flex justify-between items-center">
                        <span className="font-semibold text-foreground">
                          {isUpgrade
                            ? "Diferencia a pagar"
                            : prorate.diferencia < 0
                            ? "Saldo a tu favor"
                            : "Sin diferencia"}
                        </span>
                        <span
                          className={`font-bold text-lg ${
                            isUpgrade
                              ? "text-amber-400"
                              : prorate.diferencia < 0
                              ? "text-emerald-400"
                              : "text-foreground"
                          }`}
                        >
                          {isUpgrade
                            ? formatPrice(prorate.diferencia)
                            : prorate.diferencia < 0
                            ? formatPrice(Math.abs(prorate.diferencia))
                            : "$0"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {isUpgrade && (
                    <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 p-3">
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <p className="text-xs font-semibold text-amber-300">
                          Este cambio requiere abonar la diferencia.
                        </p>
                        <p className="text-xs text-amber-300/80">
                          Te llevamos al checkout para que elijas el método de pago. Tu plan actual sigue activo hasta que confirmes el pago del nuevo.
                        </p>
                      </div>
                    </div>
                  )}

                  {prorate.diferencia < 0 && (
                    <div className="flex items-start gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3">
                      <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      <p className="text-xs text-emerald-300">
                        Tendrás un saldo a favor de {formatPrice(Math.abs(prorate.diferencia))} que se descontará
                        de tu próxima renovación.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <DrawerFooter className="border-t border-border">
          {isUpgrade ? (
            <Button
              variant="gold"
              disabled={!selectedPlan || processing}
              onClick={handleGoToCheckout}
              className="w-full"
            >
              <CreditCard className="w-4 h-4 mr-2" />
              Ir a pagar la diferencia
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          ) : (
            <Button
              variant="gold"
              disabled={!selectedPlan || processing || !isDowngradeOrEqual}
              onClick={handleDirectSwitch}
              className="w-full"
            >
              {processing ? (
                "Procesando..."
              ) : (
                <>
                  Confirmar cambio
                  <ArrowRight className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>
          )}
          <DrawerClose asChild>
            <Button variant="outline" className="w-full border-border">
              Cancelar
            </Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
