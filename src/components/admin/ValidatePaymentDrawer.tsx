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
import { CheckCircle, XCircle, FileText, Loader2, ExternalLink } from "lucide-react";
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
}

interface ValidatePaymentDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payment: PaymentRow | null;
  /** Moneda del evento. Fallback si el pago no tiene event_currency. */
  eventCurrency: string;
  onDone: () => void;
}

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

  const evCurr = payment?.event_currency || eventCurrency;
  const origAmt = payment?.original_amount ?? payment?.amount ?? 0;
  const origCurr = payment?.original_currency ?? payment?.currency ?? evCurr;
  const sameCurrency = origCurr === evCurr;

  // Reset al abrir
  useEffect(() => {
    if (open && payment) {
      setMode("validate");
      setReviewNotes("");
      setEquivalentTouched(false);
      if (sameCurrency) {
        setRate("1");
        setEquivalent(String(origAmt));
      } else {
        setRate(payment.exchange_rate_to_event_currency ? String(payment.exchange_rate_to_event_currency) : "");
        setEquivalent(payment.equivalent_amount_event_currency ? String(payment.equivalent_amount_event_currency) : "");
      }
    }
  }, [open, payment?.id]);

  // Auto-cálculo de equivalente cuando cambia rate y admin no editó manualmente
  useEffect(() => {
    if (!equivalentTouched) {
      const r = parseFloat(rate);
      if (!isNaN(r) && r > 0) {
        setEquivalent((origAmt * r).toFixed(2));
      }
    }
  }, [rate, origAmt, equivalentTouched]);

  // Resolver URL firmada del comprobante al abrir
  useEffect(() => {
    let cancelled = false;
    if (open && payment?.proof_url) {
      setLoadingProof(true);
      getPaymentProofSignedUrl(payment.proof_url).then((url) => {
        if (!cancelled) {
          setProofUrl(url);
          setLoadingProof(false);
        }
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
    const calc = origAmt * r;
    return Math.abs(calc - e) > 0.01;
  }, [rate, equivalent, origAmt]);

  if (!payment) return null;

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
      // Recalcular saldo (por si estaba en validado y se revirtió)
      await supabase.rpc("recalculate_reservation_payment_totals" as any, { p_reservation_id: payment.reservation_id });
      setSubmitting(false);
      toast({ title: "Pago rechazado." });
      onOpenChange(false);
      onDone();
      return;
    }

    // Validar
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
    if (isManualOverride && !reviewNotes.trim()) {
      toast({
        title: "Override manual: nota interna obligatoria.",
        description: "Editaste el equivalente respecto al cálculo automático. Justificá el motivo.",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
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
        reviewed_by: (await supabase.auth.getUser()).data.user?.id || null,
      } as any)
      .eq("id", payment.id);

    if (error) {
      setSubmitting(false);
      toast({ title: "Error al validar.", description: error.message, variant: "destructive" });
      return;
    }

    // Recalculo seguro: SUM(equivalent) WHERE status='validado'
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
          {/* Datos del pago */}
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

          {/* Tabs validar/rechazar */}
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
                  Nota interna {isManualOverride ? "*" : "(opcional)"}
                </Label>
                <Textarea
                  placeholder={isManualOverride ? "Motivo del override manual…" : "Detalles internos sobre la validación…"}
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
