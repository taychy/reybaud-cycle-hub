import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { formatPrice } from "@/lib/currency";
import { PAYMENT_METHODS } from "@/lib/paymentMethods";
import { Loader2, Pencil, Ban, AlertTriangle } from "lucide-react";
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription,
} from "@/components/ui/drawer";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface PaymentRow {
  id: string;
  reservation_id: string;
  amount: number;
  currency: string;
  original_amount: number | null;
  original_currency: string | null;
  payment_date: string;
  payment_method: string;
  payment_reference: string | null;
  notes: string | null;
  status: string;
  anulado_at?: string | null;
}

interface EditPaymentDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payment: PaymentRow | null;
  mode: "edit" | "annul";
  onDone: () => void;
}

const ALLOWED_CURRENCIES = ["EUR", "USD", "ARS"];

const EditPaymentDrawer = ({ open, onOpenChange, payment, mode, onDone }: EditPaymentDrawerProps) => {
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);

  // Edit fields
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [paymentDate, setPaymentDate] = useState("");
  const [method, setMethod] = useState("efectivo");
  const [notes, setNotes] = useState("");

  // Annul fields
  const [annulReason, setAnnulReason] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    if (open && payment) {
      const origAmt = payment.original_amount ?? payment.amount;
      const origCurr = payment.original_currency ?? payment.currency;
      setAmount(origAmt.toString());
      setCurrency(origCurr);
      setPaymentDate(payment.payment_date);
      setMethod(payment.payment_method);
      setNotes(payment.notes || "");
      setAnnulReason("");
    }
  }, [open, payment?.id]);

  if (!payment) return null;

  const origAmt = payment.original_amount ?? payment.amount;
  const origCurr = payment.original_currency ?? payment.currency;

  const handleEdit = async () => {
    const newAmt = parseFloat(amount);
    if (!newAmt || newAmt <= 0) {
      toast({ title: "Monto inválido.", variant: "destructive" });
      return;
    }
    setSubmitting(true);

    const user = (await supabase.auth.getUser()).data.user;
    const userId = user?.id || null;
    const userEmail = user?.email || null;

    // Track changes
    const changes: { field: string; old_val: string; new_val: string }[] = [];
    if (newAmt !== origAmt) changes.push({ field: "amount", old_val: origAmt.toString(), new_val: newAmt.toString() });
    if (currency !== origCurr) changes.push({ field: "currency", old_val: origCurr, new_val: currency });
    if (paymentDate !== payment.payment_date) changes.push({ field: "payment_date", old_val: payment.payment_date, new_val: paymentDate });
    if (method !== payment.payment_method) changes.push({ field: "payment_method", old_val: payment.payment_method, new_val: method });
    if (notes.trim() !== (payment.notes || "").trim()) changes.push({ field: "notes", old_val: payment.notes || "", new_val: notes.trim() });

    if (changes.length === 0) {
      toast({ title: "No hay cambios para guardar." });
      setSubmitting(false);
      return;
    }

    // Insert audit records
    for (const c of changes) {
      await supabase.from("reservation_payment_changes" as any).insert({
        payment_id: payment.id,
        reservation_id: payment.reservation_id,
        action: "edicion",
        field_changed: c.field,
        old_value: c.old_val,
        new_value: c.new_val,
        reason: null,
        changed_by: userId,
        changed_by_email: userEmail,
      } as any);
    }

    // Update the payment
    const sameCurrency = currency === (payment.original_currency ?? payment.currency);
    const updatePayload: Record<string, any> = {
      amount: newAmt,
      currency: currency,
      original_amount: newAmt,
      original_currency: currency,
      payment_date: paymentDate,
      payment_method: method,
      notes: notes.trim() || null,
    };
    // If same currency and validated, update equivalent too
    if (payment.status === "validado" && sameCurrency) {
      updatePayload.equivalent_amount_event_currency = newAmt;
      updatePayload.exchange_rate_to_event_currency = 1;
    }

    const { error } = await supabase
      .from("reservation_payments" as any)
      .update(updatePayload as any)
      .eq("id", payment.id);

    if (error) {
      toast({ title: "Error al editar.", description: error.message, variant: "destructive" });
      setSubmitting(false);
      return;
    }

    // Recalculate totals
    await supabase.rpc("recalculate_reservation_payment_totals" as any, { p_reservation_id: payment.reservation_id });

    setSubmitting(false);
    toast({ title: "Pago editado correctamente." });
    onOpenChange(false);
    onDone();
  };

  const handleAnnul = async () => {
    if (!annulReason.trim()) {
      toast({ title: "El motivo de anulación es obligatorio.", variant: "destructive" });
      return;
    }
    setShowConfirm(true);
  };

  const confirmAnnul = async () => {
    setShowConfirm(false);
    setSubmitting(true);

    const user = (await supabase.auth.getUser()).data.user;
    const userId = user?.id || null;
    const userEmail = user?.email || null;

    // Audit record
    await supabase.from("reservation_payment_changes" as any).insert({
      payment_id: payment.id,
      reservation_id: payment.reservation_id,
      action: "anulacion",
      field_changed: null,
      old_value: `${origAmt} ${origCurr}`,
      new_value: null,
      reason: annulReason.trim(),
      changed_by: userId,
      changed_by_email: userEmail,
    } as any);

    // Update the payment
    const { error } = await supabase
      .from("reservation_payments" as any)
      .update({
        status: "anulado",
        anulado_at: new Date().toISOString(),
        anulado_por: userId,
        anulado_motivo: annulReason.trim(),
      } as any)
      .eq("id", payment.id);

    if (error) {
      toast({ title: "Error al anular.", description: error.message, variant: "destructive" });
      setSubmitting(false);
      return;
    }

    // Recalculate totals
    await supabase.rpc("recalculate_reservation_payment_totals" as any, { p_reservation_id: payment.reservation_id });

    setSubmitting(false);
    toast({ title: "Pago anulado. El saldo fue recalculado." });
    onOpenChange(false);
    onDone();
  };

  return (
    <>
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[92vh]">
          <DrawerHeader className="text-left">
            <DrawerTitle className="font-heading text-lg flex items-center gap-2">
              {mode === "edit" ? (
                <><Pencil className="w-4 h-4" /> Editar pago</>
              ) : (
                <><Ban className="w-4 h-4 text-destructive" /> Anular pago</>
              )}
            </DrawerTitle>
            <DrawerDescription>
              {mode === "edit"
                ? "Modificá los datos del pago. Los cambios quedan registrados en el historial."
                : "El pago dejará de contar para el total. Esta acción es irreversible."}
            </DrawerDescription>
          </DrawerHeader>

          <div className="px-4 pb-6 space-y-4 overflow-y-auto">
            {/* Current payment summary */}
            <div className="rounded-lg border border-border p-3 bg-muted/30 space-y-1">
              <p className="text-xs text-muted-foreground">Pago actual</p>
              <p className="text-sm font-semibold">
                {formatPrice(origAmt, origCurr)} — <span className="capitalize">{payment.payment_method}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                {new Date(payment.payment_date + "T12:00:00").toLocaleDateString("es-AR")}
                {payment.payment_reference && ` · Ref: ${payment.payment_reference}`}
              </p>
            </div>

            {mode === "edit" ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Monto *</Label>
                    <Input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Moneda *</Label>
                    <Select value={currency} onValueChange={setCurrency}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ALLOWED_CURRENCIES.map((c) => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Fecha</Label>
                    <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Medio de pago</Label>
                    <Select value={method} onValueChange={setMethod}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {PAYMENT_METHODS.map((m) => (
                          <SelectItem key={m.key} value={m.key}>{m.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Nota interna</Label>
                  <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Opcional" />
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>Cancelar</Button>
                  <Button className="flex-1" disabled={submitting} onClick={handleEdit}>
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Pencil className="w-4 h-4 mr-1" />}
                    Guardar cambios
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                  <div className="text-xs text-destructive">
                    <p className="font-semibold">Atención</p>
                    <p>El pago quedará marcado como anulado y no se contará para el saldo. Esta acción no se puede deshacer.</p>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Motivo de anulación *</Label>
                  <Textarea
                    value={annulReason}
                    onChange={(e) => setAnnulReason(e.target.value)}
                    rows={3}
                    placeholder="Ej: Pago cargado por error en la reserva equivocada"
                  />
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>Cancelar</Button>
                  <Button variant="destructive" className="flex-1" disabled={submitting || !annulReason.trim()} onClick={handleAnnul}>
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Ban className="w-4 h-4 mr-1" />}
                    Anular pago
                  </Button>
                </div>
              </>
            )}
          </div>
        </DrawerContent>
      </Drawer>

      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Confirmar anulación?</AlertDialogTitle>
            <AlertDialogDescription>
              Se anulará el pago de {formatPrice(origAmt, origCurr)}. El saldo de la reserva se recalculará automáticamente.
              <br /><br />
              <strong>Motivo:</strong> {annulReason}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmAnnul} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Confirmar anulación
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default EditPaymentDrawer;
