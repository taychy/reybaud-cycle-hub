import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Tag, RotateCcw, Save } from "lucide-react";
import { formatPrice } from "@/lib/currency";

interface Props {
  reservationId: string;
  eventPrice: number;
  eventCurrency: string;
  currentPriceSnapshot: number | null;
  /** Paquete de la reserva (si el evento trabaja con paquetes) */
  packageId?: string | null;
  packageName?: string | null;
  packagePrice?: number | null;
  onChanged?: () => void;
}

export const ReservationBasePriceEditor = ({
  reservationId,
  eventPrice,
  eventCurrency,
  currentPriceSnapshot,
  packageId,
  packageName,
  packagePrice,
  onChanged,
}: Props) => {
  // Referencia: precio del paquete si hay paquete; sino el del evento
  const hasPackage = !!packageId && packagePrice != null;
  const referencePrice = hasPackage ? Number(packagePrice) : Number(eventPrice ?? 0);
  const referenceLabel = hasPackage
    ? `Precio del paquete${packageName ? ` "${packageName}"` : ""}`
    : "Precio del evento";

  const [value, setValue] = useState<string>(
    currentPriceSnapshot != null ? String(currentPriceSnapshot) : String(referencePrice),
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setValue(currentPriceSnapshot != null ? String(currentPriceSnapshot) : String(referencePrice));
  }, [currentPriceSnapshot, referencePrice, reservationId]);

  const numeric = parseFloat(value);
  const isOverride =
    currentPriceSnapshot != null && Number(currentPriceSnapshot) !== Number(referencePrice);
  const dirty = !isNaN(numeric) && Number(numeric) !== Number(currentPriceSnapshot ?? referencePrice);

  /** p_price = null → restaura al precio de referencia resuelto en la base */
  const save = async (newPrice: number | null) => {
    setSaving(true);
    const { data, error } = await supabase.rpc(
      "admin_set_reservation_price_snapshot" as any,
      {
        p_reservation_id: reservationId,
        p_price: newPrice,
        p_note:
          newPrice == null
            ? "Restaurar precio de referencia desde panel admin"
            : "Edición de precio del participante desde panel admin",
      },
    );
    setSaving(false);
    if (error) {
      toast.error("Error: " + error.message);
      return;
    }
    const res = data as any;
    toast.success(
      newPrice == null
        ? "Precio restaurado al de referencia"
        : "Precio del participante actualizado",
      {
        description: res
          ? `Total ${formatPrice(Number(res.amount_total || 0), eventCurrency as any)} · Pagado ${formatPrice(
              Number(res.amount_paid || 0),
              eventCurrency as any,
            )} · Saldo ${formatPrice(Number(res.balance_due || 0), eventCurrency as any)}`
          : undefined,
      },
    );
    onChanged?.();
  };

  return (
    <div className="space-y-2 rounded-lg border border-border/50 p-2 bg-muted/10">
      <div className="flex items-center gap-2">
        <Tag className="w-4 h-4 text-amber-400" />
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Precio base del viaje
        </h4>
        {isOverride && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">
            personalizado
          </span>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">
        {referenceLabel}: {formatPrice(referencePrice, eventCurrency as any)}. Editalo si este
        participante paga un monto distinto (ej.: menos días). Se recalcula el total y se
        redistribuyen sólo las cuotas abiertas: los pagos y las cuotas ya pagadas no se tocan.
      </p>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          step="0.01"
          min={0}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="h-8"
        />
        <span className="text-xs text-muted-foreground">{eventCurrency}</span>
        <Button
          size="sm"
          className="h-8 gap-1"
          disabled={saving || !dirty || isNaN(numeric) || numeric < 0}
          onClick={() => save(numeric)}
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Guardar
        </Button>
        {isOverride && (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 gap-1"
            disabled={saving}
            onClick={() => save(null)}
            title={hasPackage ? "Restaurar al precio del paquete" : "Restaurar al precio del evento"}
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
};

export default ReservationBasePriceEditor;
