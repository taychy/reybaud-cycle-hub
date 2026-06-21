import { useState, useRef, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { formatPrice, MONEDAS } from "@/lib/currency";
import {
  Banknote, Loader2, CheckCircle, Upload, X, FileText,
} from "lucide-react";
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription,
} from "@/components/ui/drawer";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { PAYMENT_METHODS } from "@/lib/paymentMethods";

interface Reservation {
  id: string;
  amount_total: number | null;
  amount_paid: number;
  balance_due: number | null;
  reservation_status: string;
  payment_status: string;
}

interface InstallmentOption {
  id: string;
  installment_number: number;
  label: string;
  amount: number;
  currency: string;
  due_date: string | null;
  balance_due: number;
  status: string;
}

interface ReportPaymentDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reservation: Reservation;
  alumnoId: string;
  currency: string;
  onSuccess: () => void;
  /** If set, preselect this installment when opening */
  preselectedInstallmentId?: string | null;
}

const ALLOWED_CURRENCIES = ["EUR", "USD", "ARS"];

const fmtDate = (d?: string | null) => {
  if (!d) return "";
  const [y, m, dd] = d.split("-");
  return `${dd}/${m}/${y}`;
};

const ReportPaymentDrawer = ({
  open, onOpenChange, reservation, alumnoId, currency, onSuccess, preselectedInstallmentId,
}: ReportPaymentDrawerProps) => {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [mode, setMode] = useState<"paid" | "cash_announce">("paid");

  // Cash announce state
  const [cashNote, setCashNote] = useState("");
  const [cashPlace, setCashPlace] = useState("sede");
  const [cashDeadline, setCashDeadline] = useState("");
  const [cashCalc, setCashCalc] = useState<{ amount: number; currency: string; concepto: string } | null>(null);

  const [amount, setAmount] = useState(reservation.balance_due?.toString() || "");
  const [paymentCurrency, setPaymentCurrency] = useState(currency);
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState("efectivo");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [proofPath, setProofPath] = useState<string | null>(null);
  const [proofFileName, setProofFileName] = useState<string | null>(null);

  // --- Installment selector state ---
  const [installments, setInstallments] = useState<InstallmentOption[]>([]);
  const [loadingInstallments, setLoadingInstallments] = useState(false);
  // "next" = próxima cuota, "other:<id>" = otra cuota, "general" = pago general
  const [installmentChoice, setInstallmentChoice] = useState<string>("general");


  // Fetch installments when drawer opens
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const fetchInstallments = async () => {
      setLoadingInstallments(true);
      const { data } = await supabase
        .from("reservation_installments")
        .select("id,installment_number,label,amount,currency,due_date,balance_due,status")
        .eq("reservation_id", reservation.id)
        .in("status", ["pendiente", "parcial", "reprogramada"])
        .order("sort_order", { ascending: true })
        .order("installment_number", { ascending: true });
      if (cancelled) return;
      const items = (data as InstallmentOption[] | null) || [];
      setInstallments(items);
      if (preselectedInstallmentId && items.find(i => i.id === preselectedInstallmentId)) {
        const target = items.find(i => i.id === preselectedInstallmentId)!;
        const isNext = items[0]?.id === preselectedInstallmentId;
        setInstallmentChoice(isNext ? "next" : `other:${preselectedInstallmentId}`);
        setAmount(target.balance_due.toString());
      } else if (items.length > 0) {
        setInstallmentChoice("next");
        setAmount(items[0].balance_due.toString());
      } else {
        setInstallmentChoice("general");
      }
      setLoadingInstallments(false);
    };
    fetchInstallments();
    return () => { cancelled = true; };
  }, [open, reservation.id]);

  const hasInstallments = installments.length > 0;

  const nextInstallment = installments[0] || null;

  const otherInstallments = useMemo(
    () => (installments.length > 1 ? installments.slice(1) : []),
    [installments]
  );

  // Resolve selected installment
  const selectedInstallment = useMemo<InstallmentOption | null>(() => {
    if (installmentChoice === "next" && nextInstallment) return nextInstallment;
    if (installmentChoice.startsWith("other:")) {
      const id = installmentChoice.replace("other:", "");
      return installments.find((i) => i.id === id) || null;
    }
    return null;
  }, [installmentChoice, nextInstallment, installments]);

  // When choice changes, update suggested amount
  const handleInstallmentChoiceChange = (value: string) => {
    setInstallmentChoice(value);
    if (value === "general") {
      setAmount(reservation.balance_due?.toString() || "");
    } else if (value === "next" && nextInstallment) {
      setAmount(nextInstallment.balance_due.toString());
    } else if (value.startsWith("other:")) {
      const id = value.replace("other:", "");
      const inst = installments.find((i) => i.id === id);
      if (inst) setAmount(inst.balance_due.toString());
    }
  };

  const isCashMethod = method === "efectivo";
  const proofRequired = !isCashMethod;
  const referenceOrNotesRequired = isCashMethod;

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "El archivo no puede superar 10 MB.", variant: "destructive" });
      return;
    }
    setUploading(true);
    const ext = file.name.split(".").pop() || "bin";
    const path = `${alumnoId}/${reservation.id}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from("payment-proofs")
      .upload(path, file, { upsert: false, contentType: file.type });
    setUploading(false);
    if (error) {
      toast({ title: "Error al subir el comprobante.", description: error.message, variant: "destructive" });
      return;
    }
    setProofPath(path);
    setProofFileName(file.name);
  };

  const removeProof = () => {
    setProofPath(null);
    setProofFileName(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const validate = (): string | null => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return "Ingresá un monto válido.";
    if (!ALLOWED_CURRENCIES.includes(paymentCurrency)) return "Moneda no soportada.";
    if (proofRequired && !proofPath) return "El comprobante es obligatorio para este medio de pago.";
    if (referenceOrNotesRequired && !reference.trim() && !notes.trim()) {
      return "Para pagos en efectivo, agregá una referencia o nota.";
    }
    return null;
  };

  const handleSubmit = async () => {
    const err = validate();
    if (err) {
      toast({ title: err, variant: "destructive" });
      return;
    }
    setSubmitting(true);

    const amt = parseFloat(amount);

    const { error: payErr } = await supabase
      .from("reservation_payments" as any)
      .insert({
        reservation_id: reservation.id,
        alumno_id: alumnoId,
        amount: amt,
        currency: paymentCurrency,
        original_amount: amt,
        original_currency: paymentCurrency,
        event_currency: currency,
        exchange_rate_to_event_currency: paymentCurrency === currency ? 1 : null,
        equivalent_amount_event_currency: paymentCurrency === currency ? amt : null,
        payment_date: paymentDate,
        payment_method: method,
        payment_reference: reference.trim() || null,
        notes: notes.trim() || null,
        proof_url: proofPath,
        status: "informado",
        installment_id: selectedInstallment?.id || null,
        installment_number: selectedInstallment?.installment_number || null,
      } as any);

    if (payErr) {
      toast({ title: "Error al informar el pago.", description: payErr.message, variant: "destructive" });
      setSubmitting(false);
      return;
    }

    const oldPaymentStatus = reservation.payment_status;
    await supabase
      .from("event_reservations" as any)
      .update({
        payment_status: "pago_informado",
        estado: "pendiente_verificacion",
      } as any)
      .eq("id", reservation.id);

    const installmentLabel = selectedInstallment
      ? ` → ${selectedInstallment.label}`
      : "";

    await supabase.from("reservation_status_history" as any).insert({
      reservation_id: reservation.id,
      old_payment_status: oldPaymentStatus,
      new_payment_status: "pago_informado",
      old_reservation_status: reservation.reservation_status,
      new_reservation_status: reservation.reservation_status,
      changed_by_role: "alumno",
      note: `Pago informado: ${formatPrice(amt, paymentCurrency)} via ${method}${installmentLabel}`,
    } as any);

    setSubmitting(false);
    setSuccess(true);
    onSuccess();
    toast({ title: "Pago informado correctamente." });
  };

  // Load cash amount preview when switching to cash mode
  useEffect(() => {
    if (mode !== "cash_announce" || !open) return;
    (async () => {
      const { data } = await supabase.rpc("importe_a_pagar_ahora", { _reservation_id: reservation.id });
      if (data) setCashCalc({
        amount: Number((data as any).amount || 0),
        currency: (data as any).currency || currency,
        concepto: (data as any).concepto || "saldo",
      });
    })();
  }, [mode, open, reservation.id, currency]);

  const submitCashAnnounce = async () => {
    setSubmitting(true);
    const { data, error } = await supabase.rpc("announce_cash_payment", {
      _reservation_id: reservation.id,
      _nota: cashNote || null,
      _lugar: cashPlace || null,
      _fecha_limite: cashDeadline || null,
    });
    setSubmitting(false);
    if (error) {
      toast({ title: "No se pudo anunciar", description: error.message, variant: "destructive" });
      return;
    }
    setSuccess(true);
    onSuccess();
    toast({
      title: (data as any)?.reused ? "Anuncio actualizado" : "Aviso enviado",
      description: "Recordá: este aviso NO acredita el pago. Te confirmamos cuando lo cobremos.",
    });
  };

  const handleClose = () => {
    onOpenChange(false);
    setTimeout(() => {
      setSuccess(false);
      setMode("paid");
      setAmount(reservation.balance_due?.toString() || "");
      setPaymentCurrency(currency);
      setPaymentDate(new Date().toISOString().slice(0, 10));
      setMethod("efectivo");
      setReference("");
      setNotes("");
      setProofPath(null);
      setProofFileName(null);
      setInstallmentChoice("general");
      setInstallments([]);
      setCashNote(""); setCashPlace("sede"); setCashDeadline(""); setCashCalc(null);
    }, 300);
  };


  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[92vh]">
        <DrawerHeader className="text-left">
          <DrawerTitle className="font-heading text-lg">
            {success ? "¡Pago informado!" : "Informar pago"}
          </DrawerTitle>
          <DrawerDescription>
            {success
              ? "Recibimos tu aviso de pago. Nuestro equipo lo va a revisar y reconocer en la moneda del evento."
              : "Informá el pago tal como lo realizaste. Administración va a validar el comprobante y aplicar la cotización correspondiente."}
          </DrawerDescription>
        </DrawerHeader>

        <div className="px-4 pb-6 space-y-4 overflow-y-auto">
          {success ? (
            <div className="text-center py-6 space-y-4">
              <CheckCircle className="w-14 h-14 text-emerald-400 mx-auto" />
              <p className="text-sm text-muted-foreground">
                Tu pago quedó pendiente de validación. Cuando administración lo reconozca, vas a ver el equivalente en {currency} aplicado a tu saldo.
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

              {/* --- Installment selector --- */}
              {!loadingInstallments && hasInstallments && (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">¿A qué querés aplicar este pago?</Label>
                  <RadioGroup
                    value={installmentChoice}
                    onValueChange={handleInstallmentChoiceChange}
                    className="space-y-2"
                  >
                    {/* Next installment */}
                    {nextInstallment && (
                      <label
                        htmlFor="inst-next"
                        className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                          installmentChoice === "next"
                            ? "border-primary bg-primary/5"
                            : "border-border bg-muted/20"
                        }`}
                      >
                        <RadioGroupItem value="next" id="inst-next" className="mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold">{nextInstallment.label}</p>
                          <p className="text-[11px] text-muted-foreground">
                            Saldo: {formatPrice(nextInstallment.balance_due, nextInstallment.currency)}
                            {nextInstallment.due_date && ` · Vence ${fmtDate(nextInstallment.due_date)}`}
                          </p>
                        </div>
                      </label>
                    )}

                    {/* Other installments */}
                    {otherInstallments.map((inst) => (
                      <label
                        key={inst.id}
                        htmlFor={`inst-${inst.id}`}
                        className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                          installmentChoice === `other:${inst.id}`
                            ? "border-primary bg-primary/5"
                            : "border-border bg-muted/20"
                        }`}
                      >
                        <RadioGroupItem value={`other:${inst.id}`} id={`inst-${inst.id}`} className="mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold">{inst.label}</p>
                          <p className="text-[11px] text-muted-foreground">
                            Saldo: {formatPrice(inst.balance_due, inst.currency)}
                            {inst.due_date && ` · Vence ${fmtDate(inst.due_date)}`}
                          </p>
                        </div>
                      </label>
                    ))}

                    {/* General payment */}
                    <label
                      htmlFor="inst-general"
                      className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                        installmentChoice === "general"
                          ? "border-primary bg-primary/5"
                          : "border-border bg-muted/20"
                      }`}
                    >
                      <RadioGroupItem value="general" id="inst-general" className="mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold">Pago general / no sé</p>
                        <p className="text-[11px] text-muted-foreground">
                          Si no estás seguro, podés elegir esta opción. Administración lo imputará correctamente al validarlo.
                        </p>
                      </div>
                    </label>
                  </RadioGroup>
                </div>
              )}

              {loadingInstallments && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" /> Cargando cuotas…
                </p>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Monto pagado *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Ej: 250"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Moneda *</Label>
                  <Select value={paymentCurrency} onValueChange={setPaymentCurrency}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MONEDAS.filter(m => ALLOWED_CURRENCIES.includes(m.value)).map((m) => (
                        <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {paymentCurrency !== currency && (
                <p className="text-[11px] text-muted-foreground bg-muted/40 rounded-md p-2 leading-relaxed">
                  Vas a informar en <strong>{paymentCurrency}</strong>. Administración va a aplicar la cotización oficial y reconocer el equivalente en <strong>{currency}</strong> al validar.
                </p>
              )}

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Fecha de pago</Label>
                <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
              </div>

              <div className="space-y-2">
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

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">
                  Referencia / Comprobante {referenceOrNotesRequired ? "*" : "(opcional)"}
                </Label>
                <Input
                  placeholder="Ej: nro de transferencia, ID de pago…"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  maxLength={200}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">
                  Adjuntar comprobante {proofRequired ? "*" : "(opcional)"}
                </Label>
                {proofPath ? (
                  <div className="flex items-center gap-2 rounded-md border border-border p-2 bg-muted/30">
                    <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className="text-xs flex-1 truncate">{proofFileName}</span>
                    <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={removeProof}>
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="w-full h-20 rounded-md border-2 border-dashed border-border hover:border-primary/50 bg-muted/30 flex flex-col items-center justify-center gap-1 text-muted-foreground text-xs transition-colors disabled:opacity-50"
                  >
                    {uploading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <Upload className="w-4 h-4" />
                        <span>Subir imagen o PDF</span>
                      </>
                    )}
                  </button>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,application/pdf"
                  className="hidden"
                  onChange={handleFileSelect}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Comentario (opcional)</Label>
                <Textarea
                  placeholder="Algún dato adicional para el equipo…"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  maxLength={500}
                />
              </div>

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={handleClose}>Cancelar</Button>
                <Button variant="gold" className="flex-1" disabled={submitting || uploading} onClick={handleSubmit}>
                  {submitting ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Enviando…</>
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
