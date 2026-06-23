import { useEffect, useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { PAYMENT_METHODS } from "@/lib/paymentMethods";
import { formatPrice } from "@/lib/currency";

export interface ConfirmFullPaymentValue {
  metodo_pago: string;
  referencia?: string | null;
  monto: number;
  partial: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: string;
  /** Monto máximo / pendiente a cobrar. */
  monto: number;
  moneda: string;
  defaultMethod?: string | null;
  /** Permite registrar montos parciales (< monto). */
  allowPartial?: boolean;
  onConfirm: (value: ConfirmFullPaymentValue) => Promise<void> | void;
}

/**
 * Diálogo reutilizable para confirmar manualmente un pago
 * (pedidos de tienda y preventas — total, saldo o parcial).
 */
export function ConfirmFullPaymentDialog({
  open, onOpenChange, title, description, monto, moneda, defaultMethod,
  allowPartial = true, onConfirm,
}: Props) {
  const [metodo, setMetodo] = useState<string>(defaultMethod || "efectivo");
  const [referencia, setReferencia] = useState("");
  const [montoInput, setMontoInput] = useState<string>(String(monto || 0));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setMetodo(defaultMethod || "efectivo");
      setReferencia("");
      setMontoInput(String(monto || 0));
      setSaving(false);
    }
  }, [open, defaultMethod, monto]);

  const montoNum = Number(montoInput) || 0;
  const restante = useMemo(() => Math.max(monto - montoNum, 0), [monto, montoNum]);
  const isPartial = allowPartial && montoNum > 0 && montoNum < monto;
  const invalid = montoNum <= 0 || montoNum > monto;

  const handleConfirm = async () => {
    if (invalid) return;
    setSaving(true);
    try {
      await onConfirm({
        metodo_pago: metodo,
        referencia: referencia.trim() || null,
        monto: montoNum,
        partial: isPartial,
      });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !saving && onOpenChange(v)}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="rounded-lg border border-border bg-secondary/30 p-3 flex items-center justify-between">
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Pendiente</span>
            <span className="font-heading font-bold text-lg text-primary">{formatPrice(monto, moneda)}</span>
          </div>

          {allowPartial && (
            <div className="space-y-1.5">
              <Label className="text-xs">Monto a registrar</Label>
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                max={monto}
                step="0.01"
                value={montoInput}
                onChange={(e) => setMontoInput(e.target.value)}
              />
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <button
                  type="button"
                  className="underline hover:text-foreground"
                  onClick={() => setMontoInput(String(monto))}
                >
                  Usar total
                </button>
                {isPartial && (
                  <span className="text-amber-400">
                    Pago parcial · queda {formatPrice(restante, moneda)}
                  </span>
                )}
                {invalid && montoNum > monto && (
                  <span className="text-destructive">Excede el pendiente</span>
                )}
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">Medio de pago</Label>
            <Select value={metodo} onValueChange={setMetodo}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m.key} value={m.key}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">
              N° operación / referencia <span className="text-muted-foreground">(opcional)</span>
            </Label>
            <Input
              value={referencia}
              onChange={(e) => setReferencia(e.target.value)}
              placeholder="Ej: 165305752054 · CBU últ. 4 · recibo Nº…"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={saving || invalid}>
            {saving ? "Registrando…" : isPartial ? "Registrar pago parcial" : "Confirmar pago"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
