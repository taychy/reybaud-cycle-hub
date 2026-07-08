import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Sparkles, AlertCircle } from "lucide-react";
import { assignPaymentPlanToReservation } from "@/lib/assignPaymentPlan";
import { formatPrice } from "@/lib/currency";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  reservationId: string;
  packageId: string | null;
  precioFinal: number;
  currency: string;
  onAssigned?: () => void;
}

interface PlanRow {
  id: string;
  nombre: string;
  cantidad_cuotas: number;
  sena_tipo: string;
  sena_valor: number;
}

export default function AssignPaymentPlanDialog({
  open, onOpenChange, reservationId, packageId, precioFinal, currency, onAssigned,
}: Props) {
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !packageId) return;
    setSelected("");
    setLoading(true);
    supabase
      .from("event_package_payment_plans" as any)
      .select("id, nombre, cantidad_cuotas, sena_tipo, sena_valor")
      .eq("package_id", packageId)
      .is("archived_at", null)
      .eq("activo", true)
      .order("version", { ascending: false })
      .then(({ data }) => {
        setPlans((data as any) || []);
        setLoading(false);
      });
  }, [open, packageId]);

  const submit = async () => {
    if (!selected) return;
    setSaving(true);
    const res = await assignPaymentPlanToReservation({
      reservationId,
      paymentPlanId: selected,
      precioFinal,
    });
    setSaving(false);
    if (!res.ok) {
      toast.error("No se pudo asignar el plan", { description: res.error });
      return;
    }
    toast.success(`Plan asignado: se generaron ${res.installments} cuotas y se imputaron los pagos existentes.`);
    onAssigned?.();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" /> Asignar plan de pagos
          </DialogTitle>
          <DialogDescription>
            Elegí un plan del paquete. Se generarán las cuotas sobre {formatPrice(precioFinal, currency)} y los pagos existentes de la reserva se imputarán en orden (primero la seña).
          </DialogDescription>
        </DialogHeader>

        {!packageId && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs flex gap-2">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <p>Esta reserva todavía no tiene paquete. Primero asigná uno desde <b>Cambiar paquete</b>.</p>
          </div>
        )}

        {packageId && (
          <div className="space-y-3">
            {loading ? (
              <p className="text-xs text-muted-foreground">Cargando planes…</p>
            ) : plans.length === 0 ? (
              <p className="text-xs text-muted-foreground">Este paquete no tiene planes de pago configurados.</p>
            ) : (
              <div className="space-y-2">
                <Label className="text-xs">Plan disponible</Label>
                {plans.map((pl) => {
                  const active = selected === pl.id;
                  return (
                    <button
                      key={pl.id}
                      type="button"
                      onClick={() => setSelected(pl.id)}
                      className={`w-full text-left rounded-md border px-3 py-2 text-sm transition ${
                        active ? "border-primary bg-primary/10" : "border-border hover:bg-muted/40"
                      }`}
                    >
                      <div className="flex justify-between">
                        <span className="font-medium">{pl.nombre}</span>
                        <span className="text-xs text-muted-foreground">{pl.cantidad_cuotas} cuotas</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Seña: {pl.sena_tipo === "monto_fijo" ? formatPrice(Number(pl.sena_valor), currency) : `${pl.sena_valor}% del paquete`}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={!selected || saving || !packageId}>
            {saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            Asignar plan y generar cuotas
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
