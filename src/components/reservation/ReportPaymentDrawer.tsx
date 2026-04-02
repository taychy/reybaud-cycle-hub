import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { formatPrice } from "@/lib/currency";
import {
  Banknote, Loader2, CheckCircle, Calendar,
} from "lucide-react";
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription,
} from "@/components/ui/drawer";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { PAYMENT_METHODS } from "@/lib/paymentMethods";

interface Reservation {
  id: string;
  amount_total: number | null;
  amount_paid: number;
  balance_due: number | null;
  reservation_status: string;
  payment_status: string;
}

interface ReportPaymentDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reservation: Reservation;
  alumnoId: string;
  currency: string;
  onSuccess: () => void;
}

const ReportPaymentDrawer = ({
  open, onOpenChange, reservation, alumnoId, currency, onSuccess,
}: ReportPaymentDrawerProps) => {
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [amount, setAmount] = useState(reservation.balance_due?.toString() || "");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState("efectivo");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");

  const handleSubmit = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      toast({ title: "Ingresá un monto válido.", variant: "destructive" });
      return;
    }
    setSubmitting(true);

    // Insert payment record
    const { error: payErr } = await supabase
      .from("reservation_payments" as any)
      .insert({
        reservation_id: reservation.id,
        alumno_id: alumnoId,
        amount: parseFloat(amount),
        currency,
        payment_date: paymentDate,
        payment_method: method,
        payment_reference: reference.trim() || null,
        notes: notes.trim() || null,
        status: "informado",
      } as any);

    if (payErr) {
      toast({ title: "Error al informar el pago.", description: payErr.message, variant: "destructive" });
      setSubmitting(false);
      return;
    }

    // Update reservation payment status
    const oldPaymentStatus = reservation.payment_status;
    await supabase
      .from("event_reservations" as any)
      .update({
        payment_status: "pago_informado",
        estado: "pendiente_verificacion",
      } as any)
      .eq("id", reservation.id);

    // Log history
    await supabase.from("reservation_status_history" as any).insert({
      reservation_id: reservation.id,
      old_payment_status: oldPaymentStatus,
      new_payment_status: "pago_informado",
      old_reservation_status: reservation.reservation_status,
      new_reservation_status: reservation.reservation_status,
      changed_by_role: "alumno",
      note: `Pago informado: ${formatPrice(parseFloat(amount), currency)} via ${method}`,
    } as any);

    setSubmitting(false);
    setSuccess(true);
    onSuccess();
    toast({ title: "Pago informado correctamente." });
  };

  const handleClose = () => {
    onOpenChange(false);
    setTimeout(() => {
      setSuccess(false);
      setAmount(reservation.balance_due?.toString() || "");
      setPaymentDate(new Date().toISOString().slice(0, 10));
      setMethod("efectivo");
      setReference("");
      setNotes("");
    }, 300);
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[90vh]">
        <DrawerHeader className="text-left">
          <DrawerTitle className="font-heading text-lg">
            {success ? "¡Pago informado!" : "Informar pago"}
          </DrawerTitle>
          <DrawerDescription>
            {success
              ? "Recibimos tu aviso de pago. Nuestro equipo lo va a revisar."
              : "¿Ya realizaste el pago de este evento? Informalo acá para que el equipo lo revise y actualice tu estado."}
          </DrawerDescription>
        </DrawerHeader>

        <div className="px-4 pb-6 space-y-4 overflow-y-auto">
          {success ? (
            <div className="text-center py-6 space-y-4">
              <CheckCircle className="w-14 h-14 text-emerald-400 mx-auto" />
              <p className="text-sm text-muted-foreground">
                Tu aviso de pago quedó registrado. Te avisaremos cuando sea validado.
              </p>
              <Button variant="gold" className="w-full" onClick={handleClose}>
                Cerrar
              </Button>
            </div>
          ) : (
            <>
              {reservation.balance_due != null && reservation.balance_due > 0 && (
                <div className="glass-card rounded-xl p-4 text-center">
                  <p className="text-xs text-muted-foreground">Saldo pendiente</p>
                  <p className="text-xl font-heading font-bold text-primary">
                    {formatPrice(reservation.balance_due, currency)}
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Monto pagado *</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Ej: 50000"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Fecha de pago</Label>
                <Input
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Medio de pago</Label>
                <Select value={method} onValueChange={setMethod}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map((m) => (
                      <SelectItem key={m.key} value={m.key}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Referencia / Comprobante (opcional)</Label>
                <Input
                  placeholder="Ej: nro de transferencia, ID de pago..."
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  maxLength={200}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Observaciones (opcional)</Label>
                <Textarea
                  placeholder="Algún dato adicional..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  maxLength={500}
                />
              </div>

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={handleClose}>
                  Cancelar
                </Button>
                <Button variant="gold" className="flex-1" disabled={submitting} onClick={handleSubmit}>
                  {submitting ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Enviando...</>
                  ) : (
                    <><Banknote className="w-4 h-4 mr-2" /> Informar pago</>
                  )}
                </Button>
              </div>
            </>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
};

export default ReportPaymentDrawer;
