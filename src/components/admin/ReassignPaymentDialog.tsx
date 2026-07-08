import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, ArrowRightLeft } from "lucide-react";
import { formatPrice } from "@/lib/currency";

interface Installment {
  id: string;
  installment_number: number;
  label: string;
  amount: number;
  currency: string;
  balance_due: number;
  status: string;
}

interface Payment {
  id: string;
  amount: number;
  installment_id: string | null;
  payment_date: string;
  payment_method: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  payment: Payment | null;
  installments: Installment[];
  onReassigned?: () => void;
}

export default function ReassignPaymentDialog({
  open, onOpenChange, payment, installments, onReassigned,
}: Props) {
  const [selected, setSelected] = useState<string>("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!payment || !selected) return;
    setSaving(true);
    const { error } = await supabase.rpc("reassign_payment_to_installment" as any, {
      p_payment_id: payment.id,
      p_target_installment_id: selected,
      p_admin_note: note.trim() || null,
    });
    setSaving(false);
    if (error) {
      toast.error("No se pudo reasignar el pago", { description: error.message });
      return;
    }
    toast.success("Pago reasignado. Cuotas y saldo recalculados.");
    onReassigned?.();
    onOpenChange(false);
    setSelected("");
    setNote("");
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) { setSelected(""); setNote(""); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="w-4 h-4 text-primary" /> Reasignar pago
          </DialogTitle>
          <DialogDescription>
            El pago se mueve a otra cuota. Sus datos (fecha, comprobante, referencia) se conservan intactos — solo cambia a qué cuota queda imputado.
          </DialogDescription>
        </DialogHeader>

        {payment && (
          <div className="space-y-3">
            <div className="rounded-md bg-muted/40 p-3 text-xs space-y-0.5">
              <p><span className="text-muted-foreground">Monto:</span> <b>{formatPrice(payment.amount, "ARS")}</b></p>
              <p><span className="text-muted-foreground">Método:</span> {payment.payment_method}</p>
              <p><span className="text-muted-foreground">Fecha:</span> {payment.payment_date}</p>
              <p><span className="text-muted-foreground">Cuota actual:</span> {payment.installment_id ? "asignada" : "sin cuota"}</p>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Elegí la cuota destino</Label>
              <div className="max-h-64 overflow-y-auto space-y-1 border border-border rounded-md p-1">
                {installments.map((it) => {
                  const active = selected === it.id;
                  const isCurrent = payment.installment_id === it.id;
                  return (
                    <button
                      key={it.id}
                      type="button"
                      onClick={() => setSelected(it.id)}
                      disabled={isCurrent}
                      className={`w-full text-left rounded px-2 py-1.5 text-xs transition ${
                        active ? "bg-primary/15 border border-primary/40" :
                        isCurrent ? "opacity-40" :
                        "hover:bg-muted/40 border border-transparent"
                      }`}
                    >
                      <div className="flex justify-between">
                        <span className="font-medium">
                          {it.label} {isCurrent && <em className="text-[10px] text-muted-foreground">(actual)</em>}
                        </span>
                        <span className={it.balance_due > 0 ? "text-amber-500" : "text-muted-foreground"}>
                          Saldo: {formatPrice(it.balance_due, it.currency)}
                        </span>
                      </div>
                      <div className="flex justify-between text-[10px] text-muted-foreground">
                        <span>Monto {formatPrice(it.amount, it.currency)}</span>
                        <span>{it.status}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <Label className="text-xs">Nota admin (opcional)</Label>
              <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)}
                placeholder="Motivo del reajuste" />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={!selected || saving}>
            {saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            Reasignar pago
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
