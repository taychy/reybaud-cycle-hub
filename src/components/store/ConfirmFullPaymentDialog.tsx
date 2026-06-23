import { useEffect, useState } from "react";
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
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: string;
  monto: number;
  moneda: string;
  defaultMethod?: string | null;
  onConfirm: (value: ConfirmFullPaymentValue) => Promise<void> | void;
}

/**
 * Diálogo reutilizable para confirmar manualmente un pago total
 * (pedidos de tienda y preventas — saldo o total).
 */
export function ConfirmFullPaymentDialog({
  open, onOpenChange, title, description, monto, moneda, defaultMethod, onConfirm,
}: Props) {
  const [metodo, setMetodo] = useState<string>(defaultMethod || "efectivo");
  const [referencia, setReferencia] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setMetodo(defaultMethod || "efectivo");
      setReferencia("");
      setSaving(false);
    }
  }, [open, defaultMethod]);

  const handleConfirm = async () => {
    setSaving(true);
    try {
      await onConfirm({ metodo_pago: metodo, referencia: referencia.trim() || null });
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
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Monto</span>
            <span className="font-heading font-bold text-lg text-primary">{formatPrice(monto, moneda)}</span>
          </div>

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
          <Button onClick={handleConfirm} disabled={saving}>
            {saving ? "Registrando…" : "Confirmar pago"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
