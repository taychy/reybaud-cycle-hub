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
  onChanged?: () => void;
}

export const ReservationBasePriceEditor = ({
  reservationId,
  eventPrice,
  eventCurrency,
  currentPriceSnapshot,
  onChanged,
}: Props) => {
  const [value, setValue] = useState<string>(
    currentPriceSnapshot != null ? String(currentPriceSnapshot) : String(eventPrice ?? 0),
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setValue(currentPriceSnapshot != null ? String(currentPriceSnapshot) : String(eventPrice ?? 0));
  }, [currentPriceSnapshot, eventPrice, reservationId]);

  const numeric = parseFloat(value);
  const isOverride =
    currentPriceSnapshot != null && Number(currentPriceSnapshot) !== Number(eventPrice);
  const dirty = !isNaN(numeric) && Number(numeric) !== Number(currentPriceSnapshot ?? eventPrice);

  const save = async (newPrice: number | null) => {
    setSaving(true);
    const { error } = await supabase
      .from("event_reservations" as any)
      .update({ price_snapshot: newPrice })
      .eq("id", reservationId);
    if (error) {
      setSaving(false);
      toast.error("Error: " + error.message);
      return;
    }
    const { error: recalcErr } = await supabase.rpc(
      "recalculate_reservation_amount_total" as any,
      { p_reservation_id: reservationId },
    );
    setSaving(false);
    if (recalcErr) {
      toast.error("Guardado, pero falló el recalculo: " + recalcErr.message);
      return;
    }
    toast.success(newPrice == null ? "Precio restaurado al del evento" : "Precio del participante actualizado");
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
        Precio del evento: {formatPrice(eventPrice ?? 0, eventCurrency as any)}. Editalo si este
        participante paga un monto distinto (ej.: menos días).
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
            onClick={() => save(eventPrice ?? 0)}
            title="Restaurar al precio del evento"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
};

export default ReservationBasePriceEditor;
