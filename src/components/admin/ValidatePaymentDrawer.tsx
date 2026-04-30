import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { formatPrice } from "@/lib/currency";
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription,
} from "@/components/ui/drawer";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { CheckCircle, XCircle, FileText, Loader2, ExternalLink, AlertTriangle, Receipt } from "lucide-react";
import { getPaymentProofSignedUrl } from "@/lib/paymentProofs";

interface PaymentRow {
  id: string;
  reservation_id: string;
  original_amount: number | null;
  original_currency: string | null;
  amount: number;
  currency: string;
  event_currency: string | null;
  exchange_rate_to_event_currency: number | null;
  equivalent_amount_event_currency: number | null;
  payment_method: string;
  payment_reference: string | null;
  payment_date: string;
  notes: string | null;
  proof_url: string | null;
  status: string;
  installment_id?: string | null;
  installment_number?: number | null;
}

interface Installment {
  id: string;
  label: string;
  installment_number: number;
  amount: number;
  currency: string;
  balance_due: number;
  due_date: string | null;
  status: string;
  sort_order: number;
}

interface ValidatePaymentDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payment: PaymentRow | null;
  eventCurrency: string;
  onDone: () => void;
}

const GENERAL_VALUE = "__general__";

const ValidatePaymentDrawer = ({
  open, onOpenChange, payment, eventCurrency, onDone,
}: ValidatePaymentDrawerProps) => {
  const { toast } = useToast();
  const [mode, setMode] = useState<"validate" | "reject">("validate");
  const [rate, setRate] = useState<string>("");
  const [equivalent, setEquivalent] = useState<string>("");
  const [equivalentTouched, setEquivalentTouched] = useState(false);
  const [reviewNotes, setReviewNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [loadingProof, setLoadingProof] = useState(false);

  // Installment state
  const [installments, setInstallments] = useState<Installment[]>([]);
  const [loadingInstallments, setLoadingInstallments] = useState(false);
  const [selectedInstallmentId, setSelectedInstallmentId] = useState<string>(GENERAL_VALUE);

  const evCurr = payment?.event_currency || eventCurrency;
  const origAmt = payment?.original_amount ?? payment?.amount ?? 0;
  const origCurr = payment?.original_currency ?? payment?.currency ?? evCurr;
  const sameCurrency = origCurr === evCurr;

  // Was the payment already validated?
  const wasAlreadyValidated = payment?.status === "validado";

  // Did admin change the installment assignment?
  const installmentChanged = useMemo(() => {
    if (!payment) return false;
    const originalId = payment.installment_id || GENERAL_VALUE;
    return selectedInstallmentId !== originalId;
  }, [payment, selectedInstallmentId]);

  // Load installments for this reservation
  useEffect(() => {
    if (!open || !payment?.reservation_id) {
      setInstallments([]);
      return;
    }
    setLoadingInstallments(true);
    supabase
      .from("reservation_installments" as any)
      .select("id, label, installment_number, amount, currency, balance_due, due_date, status, sort_order")
      .eq("reservation_id", payment.reservation_id)
      .order("sort_order", { ascending: true })
      .then(({ data }) => {
        setInstallments((data as any as Installment[]) || []);
        setLoadingInstallments(false);
      });
  }, [open, payment?.reservation_id]);

  // Reset form on open
  useEffect(() => {
    if (open && payment) {
      setMode("validate");
      setReviewNotes("");
      setEquivalentTouched(false);
      setSelectedInstallmentId(payment.installment_id || GENERAL_VALUE);
      if (sameCurrency) {
        setRate("1");
        setEquivalent(String(origAmt));
      } else {
        setRate(payment.exchange_rate_to_event_currency ? String(payment.exchange_rate_to_event_currency) : "");
        setEquivalent(payment.equivalent_amount_event_currency ? String(payment.equivalent_amount_event_currency) : "");
      }
    }
  }, [open, payment?.id]);

  // Auto-calc equivalent when rate changes and admin hasn't manually edited
  useEffect(() => {
    if (!equivalentTouched) {
      const r = parseFloat(rate);
      if (!isNaN(r) && r > 0) {
        setEquivalent((origAmt * r).toFixed(2));
      }
    }
  }, [rate, origAmt, equivalentTouched]);

  // Resolve signed URL for proof
  useEffect(() => {
    let cancelled = false;
    if (open && payment?.proof_url) {
      setLoadingProof(true);
      getPaymentProofSignedUrl(payment.proof_url).then((url) => {
        if (!cancelled) { setProofUrl(url); setLoadingProof(false); }
      });
    } else {
      setProofUrl(null);
    }
    return () => { cancelled = true; };
  }, [open, payment?.proof_url]);

  const isManualOverride = useMemo(() => {
    const r = parseFloat(rate);
    const e = parseFloat(equivalent);
    if (isNaN(r) || isNaN(e)) return false;
    return Math.abs(origAmt * r - e) > 0.01;
  }, [rate, equivalent, origAmt]);

  // Whether motivo is required
  const motivoRequired = useMemo(() => {
    // Case: manual override
    if (mode === "validate" && isManualOverride) return true;
    // Case: reassigning already-validated payment
    if (mode === "validate" && wasAlreadyValidated && installmentChanged) return true;
    // Case: general payment when there are pending installments
    if (mode === "validate" && selectedInstallmentId === GENERAL_VALUE && installments.some(i => i.status === "pendiente" || i.status === "parcial")) return true;
    // Case: reject
    if (mode === "reject") return true;
    return false;
  }, [mode, isManualOverride, wasAlreadyValidated, installmentChanged, selectedInstallmentId, installments]);

  const selectedInstallment = useMemo(
    () => installments.find(i => i.id === selectedInstallmentId),
    [installments, selectedInstallmentId],
  );

  if (!payment) return null;

  const formatDueDate = (d: string | null) => {
    if (!d) return "Sin vencimiento";
    const [y, m, day] = d.split("-");
    return `${day}/${m}/${y}`;
  };

  const handleSubmit = async () => {
    if (mode === "reject") {
      if (!reviewNotes.trim()) {
        toast({ title: "Indicá el motivo del rechazo.", variant: "destructive" });
        return;
      }
      setSubmitting(true);
      const { error } = await supabase
        .from("reservation_payments" as any)
        .update({
          status: "rechazado",
          review_action: "rechazado",
          review_notes: reviewNotes.trim(),
          reviewed_at: new Date().toISOString(),
          reviewed_by: (await supabase.auth.getUser()).data.user?.id || null,
        } as any)
        .eq("id", payment.id);
      if (error) {
        setSubmitting(false);
        toast({ title: "Error al rechazar.", description: error.message, variant: "destructive" });
        return;
      }
      await supabase.rpc("recalculate_reservation_payment_totals" as any, { p_reservation_id: payment.reservation_id });
      setSubmitting(false);
      toast({ title: "Pago rechazado." });
      onOpenChange(false);
      onDone();
      return;
    }

    // Validate mode
    const r = parseFloat(rate);
    const eq = parseFloat(equivalent);
    if (isNaN(r) || r <= 0) {
      toast({ title: "Cargá una cotización válida.", variant: "destructive" });
      return;
    }
    if (isNaN(eq) || eq <= 0) {
      toast({ title: "El equivalente reconocido debe ser mayor a 0.", variant: "destructive" });
      return;
    }
    if (motivoRequired && !reviewNotes.trim()) {
      const reason = isManualOverride
        ? "Override manual: nota interna obligatoria."
        : (wasAlreadyValidated && installmentChanged)
          ? "Reasignación de cuota: motivo obligatorio."
          : "Pago general con cuotas pendientes: motivo obligatorio.";
      toast({ title: reason, variant: "destructive" });
      return;
    }

    setSubmitting(true);

    const userId = (await supabase.auth.getUser()).data.user?.id || null;
    const newInstallmentId = selectedInstallmentId === GENERAL_VALUE ? null : selectedInstallmentId;
    const newInstallmentNumber = selectedInstallmentId === GENERAL_VALUE
      ? null
      : (selectedInstallment?.installment_number ?? null);

    // If reassigning a validated payment, log history first
    if (wasAlreadyValidated && installmentChanged) {
      const prevId = payment.installment_id || null;
      await supabase.from("reservation_installment_history" as any).insert({
        action: "payment_reassigned",
        reservation_id: payment.reservation_id,
        payment_id: payment.id,
        previous_installment_id: prevId,
        new_installment_id: newInstallmentId,
        reservation_installment_id: newInstallmentId,
        before: { installment_id: prevId, installment_number: payment.installment_number },
        after: { installment_id: newInstallmentId, installment_number: newInstallmentNumber },
        reason: reviewNotes.trim(),
        changed_by: userId,
      } as any);
    }

    // Update payment
    const { error } = await supabase
      .from("reservation_payments" as any)
      .update({
        status: "validado",
        review_action: "validado",
        review_notes: reviewNotes.trim() || null,
        manual_override: isManualOverride,
        exchange_rate_to_event_currency: r,
        equivalent_amount_event_currency: eq,
        event_currency: evCurr,
        reviewed_at: new Date().toISOString(),
        reviewed_by: userId,
        installment_id: newInstallmentId,
        installment_number: newInstallmentNumber,
      } as any)
      .eq("id", payment.id);

    if (error) {
      setSubmitting(false);
      toast({ title: "Error al validar.", description: error.message, variant: "destructive" });
      return;
    }

    // Recalculate
    const { error: rpcErr } = await supabase.rpc(
      "recalculate_reservation_payment_totals" as any,
      { p_reservation_id: payment.reservation_id },
    );
    setSubmitting(false);
    if (rpcErr) {
      toast({ title: "Pago validado, pero falló el recálculo.", description: rpcErr.message, variant: "destructive" });
    } else {
      toast({ title: "Pago validado y saldo recalculado." });
    }
    onOpenChange(false);
    onDone();
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[92vh]">
        <DrawerHeader className="text-left">
          <DrawerTitle className="font-heading text-lg">
            {mode === "validate" ? "Validar pago" : "Rechazar pago"}
          </DrawerTitle>
          <DrawerDescription>
            {mode === "validate"
              ? "Confirmá la cotización aplicada y el equivalente reconocido en la moneda del evento."
              : "El pago se marcará como rechazado. El motivo se le mostrará al alumno."}
          </DrawerDescription>
        </DrawerHeader>

        <div className="px-4 pb-6 space-y-4 overflow-y-auto">
          {/* Payment summary */}
          <div className="rounded-lg border border-border p-3 space-y-2 bg-muted/30">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Informado</span>
              <span className="font-semibold">{formatPrice(origAmt, origCurr)}</span>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Medio</span><span className="capitalize">{payment.payment_method}</span>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Fecha</span>
              <span>{new Date(payment.payment_date + "T12:00:00").toLocaleDateString("es-AR")}</span>
            </div>
            {payment.payment_reference && (
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Referencia</span><span className="truncate ml-2">{payment.payment_reference}</span>
              </div>
            )}
            {payment.notes && (
              <p className="text-xs text-muted-foreground italic">"{payment.notes}"</p>
            )}
            {payment.proof_url && (
              <div className="pt-1">
                {loadingProof ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="w-3 h-3 animate-spin" /> Cargando comprobante…
                  </div>
                ) : proofUrl ? (
                  <a href={proofUrl} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline">
                    <FileText className="w-3.5 h-3.5" /> Ver comprobante <ExternalLink className="w-3 h-3" />
                  </a>
                ) : (
                  <span className="text-xs text-destructive">No se pudo cargar el comprobante.</span>
                )}
              </div>
            )}
          </div>

          {/* Installment selector */}
          {!loadingInstallments && installments.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Receipt className="w-3.5 h-3.5" /> Imputar a cuota
              </Label>
              <RadioGroup
                value={selectedInstallmentId}
                onValueChange={setSelectedInstallmentId}
                className="gap-1.5"
              >
                {installments.map((inst) => (
                  <label
                    key={inst.id}
                    className={`flex items-start gap-2.5 rounded-lg border p-2.5 cursor-pointer transition-colors ${
                      selectedInstallmentId === inst.id
                        ? "border-primary bg-primary/5"
                        : "border-border bg-card hover:bg-muted/40"
                    }`}
                  >
                    <RadioGroupItem value={inst.id} className="mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">
                          #{inst.installment_number} — {inst.label}
                        </span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                          inst.status === "pagada" ? "bg-green-500/20 text-green-400"
                          : inst.status === "parcial" ? "bg-amber-500/20 text-amber-400"
                          : "bg-muted text-muted-foreground"
                        }`}>
                          {inst.status}
                        </span>
                      </div>
                      <div className="flex gap-3 text-[11px] text-muted-foreground mt-0.5">
                        <span>Total: {formatPrice(inst.amount, inst.currency)}</span>
                        <span>Saldo: {formatPrice(inst.balance_due, inst.currency)}</span>
                        {inst.due_date && <span>Vence: {formatDueDate(inst.due_date)}</span>}
                      </div>
                    </div>
                  </label>
                ))}
                {/* General option */}
                <label
                  className={`flex items-center gap-2.5 rounded-lg border p-2.5 cursor-pointer transition-colors ${
                    selectedInstallmentId === GENERAL_VALUE
                      ? "border-primary bg-primary/5"
                      : "border-border bg-card hover:bg-muted/40"
                  }`}
                >
                  <RadioGroupItem value={GENERAL_VALUE} className="shrink-0" />
                  <span className="text-sm">Pago general (sin cuota específica)</span>
                </label>
              </RadioGroup>

              {/* Warning: general with pending installments */}
              {selectedInstallmentId === GENERAL_VALUE && installments.some(i => i.status === "pendiente" || i.status === "parcial") && (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2.5 text-[11px] text-amber-300 flex items-start gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span>Hay cuotas pendientes. Si dejás este pago como general, el motivo es obligatorio.</span>
                </div>
              )}

              {/* Warning: reassigning validated payment */}
              {wasAlreadyValidated && installmentChanged && (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2.5 text-[11px] text-amber-300 flex items-start gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span>Estás reasignando un pago ya validado. El motivo es obligatorio y quedará registrado en el historial.</span>
                </div>
              )}
            </div>
          )}

          {loadingInstallments && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
              <Loader2 className="w-3 h-3 animate-spin" /> Cargando cuotas…
            </div>
          )}

          {/* No installments info */}
          {!loadingInstallments && installments.length === 0 && (
            <div className="text-xs text-muted-foreground bg-muted/30 rounded-lg p-2.5">
              Pago general — esta reserva no tiene cuotas configuradas.
            </div>
          )}

          {/* Tabs validate/reject */}
          <div className="flex gap-2">
            <Button
              variant={mode === "validate" ? "default" : "outline"}
              size="sm"
              className="flex-1"
              onClick={() => setMode("validate")}
            >
              <CheckCircle className="w-3.5 h-3.5 mr-1" /> Validar
            </Button>
            <Button
              variant={mode === "reject" ? "destructive" : "outline"}
              size="sm"
              className="flex-1"
              onClick={() => setMode("reject")}
            >
              <XCircle className="w-3.5 h-3.5 mr-1" /> Rechazar
            </Button>
          </div>

          {mode === "validate" ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">
                    Cotización ({origCurr} → {evCurr}) *
                  </Label>
                  <Input
                    type="number"
                    step="0.000001"
                    min="0"
                    value={rate}
                    disabled={sameCurrency}
                    onChange={(e) => { setRate(e.target.value); setEquivalentTouched(false); }}
                  />
                  {sameCurrency && (
                    <p className="text-[10px] text-muted-foreground">Misma moneda: cotización fija en 1.</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Equivalente reconocido ({evCurr}) *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={equivalent}
                    onChange={(e) => { setEquivalent(e.target.value); setEquivalentTouched(true); }}
                  />
                </div>
              </div>

              {isManualOverride && (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2.5 text-[11px] text-amber-300">
                  ⚠️ Override manual: el equivalente difiere del cálculo automático ({(origAmt * (parseFloat(rate) || 0)).toFixed(2)} {evCurr}). Justificá el motivo en la nota interna (obligatorio).
                </div>
              )}

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">
                  Nota interna {motivoRequired ? "*" : "(opcional)"}
                </Label>
                <Textarea
                  placeholder={
                    motivoRequired
                      ? (wasAlreadyValidated && installmentChanged)
                        ? "Motivo de la reasignación de cuota…"
                        : isManualOverride
                          ? "Motivo del override manual…"
                          : "Motivo por el que se deja como pago general…"
                      : "Detalles internos sobre la validación…"
                  }
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  rows={2}
                  maxLength={500}
                />
              </div>

              <Button variant="default" className="w-full" disabled={submitting} onClick={handleSubmit}>
                {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-2" />}
                Validar y reconocer {equivalent ? formatPrice(parseFloat(equivalent), evCurr) : ""}
              </Button>
            </>
          ) : (
            <>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Motivo del rechazo *</Label>
                <Textarea
                  placeholder="Ej: comprobante ilegible, monto no coincide…"
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  rows={3}
                  maxLength={500}
                />
              </div>
              <Button variant="destructive" className="w-full" disabled={submitting} onClick={handleSubmit}>
                {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <XCircle className="w-4 h-4 mr-2" />}
                Rechazar pago
              </Button>
            </>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
};

export default ValidatePaymentDrawer;
