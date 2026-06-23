import { useState, useEffect, useCallback, useImperativeHandle, forwardRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatPrice } from "@/lib/currency";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription,
} from "@/components/ui/drawer";
import {
  CheckCircle, Clock, Gift, CalendarDays,
  ExternalLink, Banknote, ChevronDown, ChevronUp, Loader2,
  CreditCard, Wallet, Wallet2,
} from "lucide-react";

interface Installment {
  id: string;
  label: string;
  installment_number: number;
  amount: number;
  currency: string;
  due_date: string | null;
  balance_due: number;
  paid_amount: number;
  condoned_amount: number;
  status: string;
  external_payment_url: string | null;
  sort_order: number;
  installment_type?: "sena" | "cuota" | null;
  due_date_original?: string | null;
}

interface PaymentRecord {
  id: string;
  amount: number;
  currency: string;
  original_amount: number | null;
  original_currency: string | null;
  equivalent_amount_event_currency: number | null;
  event_currency: string | null;
  status: string;
  payment_date: string;
  installment_id: string | null;
}

interface Props {
  reservationId: string;
  currency: string;
  amountTotal: number;
  amountPaid: number;
  balanceDue: number;
  onReportPayment: (installmentId?: string | null) => void;
  /** Pay an installment with Mercado Pago (delegates to parent that already has the MP logic) */
  onPayWithMP?: (installment: { id: string; installment_number: number; amount: number }) => void;
  /** Force the plan to be expanded on mount (e.g. when there is an overdue installment) */
  defaultExpanded?: boolean;
}

export interface StudentInstallmentsPlanHandle {
  expand: () => void;
  scrollAndExpand: () => void;
}

const statusConfig: Record<string, { label: string; color: string; icon: typeof CheckCircle }> = {
  pagada: { label: "Pagada", color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30", icon: CheckCircle },
  parcial: { label: "Parcial", color: "bg-amber-500/20 text-amber-400 border-amber-500/30", icon: Clock },
  pendiente: { label: "Pendiente", color: "bg-muted text-muted-foreground border-border", icon: Clock },
  condonada: { label: "Bonificada", color: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30", icon: Gift },
  reprogramada: { label: "Reprogramada", color: "bg-blue-500/20 text-blue-400 border-blue-500/30", icon: CalendarDays },
};

const paymentStatusBadge: Record<string, { label: string; cls: string }> = {
  informado: { label: "En revisión", cls: "bg-amber-500/20 text-amber-400" },
  validado: { label: "Validado", cls: "bg-emerald-500/20 text-emerald-400" },
  rechazado: { label: "Rechazado", cls: "bg-destructive/20 text-destructive" },
};

const fmtDate = (d: string | null) => {
  if (!d) return null;
  const [y, m, dd] = d.split("-");
  return `${dd}/${m}/${y}`;
};

const fmtShortDate = (d: string | null) => {
  if (!d) return null;
  const [y, m, dd] = d.split("-").map(Number);
  return new Date(y, m - 1, dd).toLocaleDateString("es-AR", { day: "numeric", month: "short" });
};

const isOverdue = (dueDate: string | null, status: string) => {
  if (!dueDate || status === "pagada" || status === "condonada") return false;
  const [y, m, d] = dueDate.split("-").map(Number);
  const due = new Date(y, m - 1, d);
  return due < new Date();
};

const StudentInstallmentsPlan = forwardRef<StudentInstallmentsPlanHandle, Props>(({
  reservationId, currency, amountTotal, amountPaid, balanceDue,
  onReportPayment, onPayWithMP, defaultExpanded,
}, ref) => {
  const [installments, setInstallments] = useState<Installment[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [planOpen, setPlanOpen] = useState<boolean>(!!defaultExpanded);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [paySheet, setPaySheet] = useState<{ open: boolean; inst: Installment | null }>({ open: false, inst: null });

  useImperativeHandle(ref, () => ({
    expand: () => setPlanOpen(true),
    scrollAndExpand: () => {
      setPlanOpen(true);
      setTimeout(() => {
        const el = document.getElementById("plan-pagos");
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
        // Highlight next pending
        const next = installments.find(i => ["pendiente", "parcial", "reprogramada"].includes(i.status) && (i.balance_due ?? 0) > 0);
        if (next) {
          setHighlightId(next.id);
          setTimeout(() => setHighlightId(null), 2400);
        }
      }, 80);
    },
  }), [installments]);

  const load = useCallback(async () => {
    setLoading(true);
    const [instRes, payRes] = await Promise.all([
      supabase
        .from("reservation_installments" as any)
        .select("id,label,installment_number,amount,currency,due_date,balance_due,paid_amount,condoned_amount,status,external_payment_url,sort_order,installment_type,due_date_original")
        .eq("reservation_id", reservationId)
        .order("sort_order", { ascending: true }),

      supabase
        .from("reservation_payments" as any)
        .select("id,amount,currency,original_amount,original_currency,equivalent_amount_event_currency,event_currency,status,payment_date,installment_id")
        .eq("reservation_id", reservationId)
        .order("created_at", { ascending: false }),
    ]);
    setInstallments((instRes.data as any as Installment[]) || []);
    setPayments((payRes.data as any as PaymentRecord[]) || []);
    setLoading(false);
  }, [reservationId]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Cargando plan de pagos…
      </div>
    );
  }

  if (installments.length === 0) return null;

  const totalCondoned = installments.reduce((s, i) => s + (i.condoned_amount || 0), 0);
  const nextPending = installments.find(i => ["pendiente", "parcial", "reprogramada"].includes(i.status) && (i.balance_due ?? 0) > 0);
  const anyOverdue = installments.some(i => isOverdue(i.due_date, i.status));

  const getPaymentsForInstallment = (instId: string) =>
    payments.filter(p => p.installment_id === instId);

  const generalPayments = payments.filter(p => !p.installment_id);

  const handlePay = (inst: Installment) => {
    // If MP is available → open chooser sheet. Otherwise go straight to report.
    if (onPayWithMP) {
      setPaySheet({ open: true, inst });
    } else {
      onReportPayment(inst.id);
    }
  };

  return (
    <div id="plan-pagos" className="space-y-3">
      {/* Collapsible header with summary */}
      <button
        type="button"
        onClick={() => setPlanOpen(o => !o)}
        className={`w-full rounded-xl border p-4 text-left transition-colors ${
          anyOverdue ? "border-destructive/40 bg-destructive/5" : "border-border bg-card hover:bg-muted/40"
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-heading font-semibold text-sm uppercase tracking-wide text-foreground">
              Mi plan de pagos
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              <span className="text-emerald-400 font-medium">{formatPrice(amountPaid, currency)}</span>
              {" / "}{formatPrice(amountTotal, currency)}
              {balanceDue > 0 && nextPending?.due_date && (
                <> · Próxima vence <span className={`font-medium ${anyOverdue ? "text-destructive" : "text-foreground"}`}>{fmtShortDate(nextPending.due_date)}</span></>
              )}
            </p>
          </div>
          {planOpen ? (
            <ChevronUp className="w-5 h-5 text-muted-foreground shrink-0" />
          ) : (
            <ChevronDown className="w-5 h-5 text-muted-foreground shrink-0" />
          )}
        </div>
      </button>

      {planOpen && (
        <>
          {/* Detailed summary */}
          {totalCondoned > 0 && (
            <div className="text-[11px] text-cyan-400 px-1">
              Bonificado: {formatPrice(totalCondoned, currency)}
            </div>
          )}

          {/* Installment cards */}
          <div className="space-y-2">
            {installments.map((inst) => {
              const cfg = statusConfig[inst.status] || statusConfig.pendiente;
              const Icon = cfg.icon;
              const overdue = isOverdue(inst.due_date, inst.status);
              const instPayments = getPaymentsForInstallment(inst.id);
              const isExpanded = expandedId === inst.id;
              const canPay = ["pendiente", "parcial", "reprogramada"].includes(inst.status) && (inst.balance_due ?? 0) > 0;
              const highlighted = highlightId === inst.id;

              return (
                <div
                  key={inst.id}
                  className={`rounded-xl border p-3 space-y-2 transition-all ${
                    highlighted ? "border-primary bg-primary/10 ring-2 ring-primary/40" :
                    overdue ? "border-destructive/40 bg-destructive/5" : "border-border bg-card"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Icon className={`w-4 h-4 shrink-0 ${
                        inst.status === "pagada" ? "text-emerald-400"
                        : inst.status === "condonada" ? "text-cyan-400"
                        : overdue ? "text-destructive"
                        : "text-muted-foreground"
                      }`} />
                      <span className="text-sm font-medium truncate">
                        {inst.installment_type === "sena" ? "Seña" : inst.label}
                      </span>
                      {inst.installment_type === "sena" && (
                        <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-primary/15 text-primary border-primary/30">
                          Seña
                        </Badge>
                      )}
                      {inst.due_date_original && inst.due_date && inst.due_date !== inst.due_date_original && (
                        <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-blue-500/15 text-blue-400 border-blue-500/30"
                          title={`Originalmente vencía el ${fmtDate(inst.due_date_original)}`}>
                          Reprogramada
                        </Badge>
                      )}
                    </div>
                    <Badge variant="outline" className={`text-[10px] shrink-0 ${cfg.color}`}>
                      {overdue ? "Vencida" : cfg.label}
                    </Badge>
                  </div>

                  <div className="flex items-baseline justify-between text-xs">
                    <div className="flex gap-3 text-muted-foreground">
                      <span>Total: {formatPrice(inst.amount, inst.currency)}</span>
                      {inst.due_date && (
                        <span className={overdue ? "text-destructive font-medium" : ""}>
                          Vence: {fmtDate(inst.due_date)}
                        </span>
                      )}
                    </div>
                  </div>

                  {(inst.paid_amount > 0 || inst.condoned_amount > 0) && (
                    <div className="flex gap-3 text-[11px] flex-wrap">
                      {inst.paid_amount > 0 && (
                        <span className="text-emerald-400">
                          Pagado: {formatPrice(inst.paid_amount, inst.currency)}
                        </span>
                      )}
                      {inst.condoned_amount > 0 && (
                        <span className="text-cyan-400">
                          Bonificado: {formatPrice(inst.condoned_amount, inst.currency)}
                        </span>
                      )}
                      {inst.balance_due > 0 && (
                        <span className="text-amber-400 font-medium">
                          Saldo: {formatPrice(inst.balance_due, inst.currency)}
                        </span>
                      )}
                    </div>
                  )}

                  {instPayments.length > 0 && (
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : inst.id)}
                      className="flex items-center gap-1 text-[11px] text-primary hover:underline"
                    >
                      {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      {instPayments.length} pago{instPayments.length > 1 ? "s" : ""} registrado{instPayments.length > 1 ? "s" : ""}
                    </button>
                  )}

                  {isExpanded && instPayments.length > 0 && (
                    <div className="space-y-1 pl-6">
                      {instPayments.map((p) => {
                        const pBadge = paymentStatusBadge[p.status] || paymentStatusBadge.informado;
                        const displayAmt = p.original_amount ?? p.amount;
                        const displayCurr = p.original_currency ?? p.currency;
                        return (
                          <div key={p.id} className="flex items-center justify-between text-[11px] rounded-lg bg-muted/30 px-2.5 py-1.5">
                            <div className="flex items-center gap-2">
                              <span>{formatPrice(displayAmt, displayCurr)}</span>
                              <span className="text-muted-foreground">{fmtDate(p.payment_date)}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              {p.status === "validado" && p.equivalent_amount_event_currency && p.event_currency && displayCurr !== p.event_currency && (
                                <span className="text-muted-foreground">
                                  ≈ {formatPrice(p.equivalent_amount_event_currency, p.event_currency)}
                                </span>
                              )}
                              <Badge variant="outline" className={`text-[9px] px-1.5 py-0 ${pBadge.cls}`}>
                                {pBadge.label}
                              </Badge>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Unified PAY button */}
                  {canPay && (
                    <div className="flex gap-2 pt-1">
                      {inst.external_payment_url && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 text-xs h-9"
                          onClick={() => window.open(inst.external_payment_url!, "_blank")}
                        >
                          <ExternalLink className="w-3 h-3 mr-1" /> Pagar online
                        </Button>
                      )}
                      <Button
                        variant="gold"
                        size="sm"
                        className="flex-1 text-xs h-9"
                        onClick={() => handlePay(inst)}
                      >
                        <Wallet className="w-3.5 h-3.5 mr-1.5" /> Pagar
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {generalPayments.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-3 space-y-2">
              <span className="text-xs font-medium text-muted-foreground">Pagos generales</span>
              <div className="space-y-1">
                {generalPayments.map((p) => {
                  const pBadge = paymentStatusBadge[p.status] || paymentStatusBadge.informado;
                  const displayAmt = p.original_amount ?? p.amount;
                  const displayCurr = p.original_currency ?? p.currency;
                  return (
                    <div key={p.id} className="flex items-center justify-between text-[11px] rounded-lg bg-muted/30 px-2.5 py-1.5">
                      <div className="flex items-center gap-2">
                        <span>{formatPrice(displayAmt, displayCurr)}</span>
                        <span className="text-muted-foreground">{fmtDate(p.payment_date)}</span>
                      </div>
                      <Badge variant="outline" className={`text-[9px] px-1.5 py-0 ${pBadge.cls}`}>
                        {pBadge.label}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {balanceDue > 0 && (
            <div className="text-center space-y-1.5 pt-1">
              <button
                onClick={() => onReportPayment(null)}
                className="text-xs text-primary hover:underline"
              >
                Informar pago general
              </button>
              <p className="text-[10px] text-muted-foreground px-4">
                Si no estás seguro a qué cuota corresponde, podés informar un pago general y administración lo imputará correctamente.
              </p>
            </div>
          )}
        </>
      )}

      {/* Pay sheet: MP vs Informar otro medio */}
      <Drawer
        open={paySheet.open}
        onOpenChange={(o) => setPaySheet(s => ({ ...s, open: o }))}
      >
        <DrawerContent className="max-h-[85vh]">
          <DrawerHeader className="text-left">
            <DrawerTitle className="font-heading uppercase tracking-wider text-base">
              {paySheet.inst?.installment_type === "sena" ? "Pagar seña" : paySheet.inst?.label || "Pagar cuota"}
            </DrawerTitle>
            <DrawerDescription className="text-xs">
              {paySheet.inst && (
                <>Saldo a pagar: <span className="text-foreground font-semibold">{formatPrice(paySheet.inst.balance_due ?? paySheet.inst.amount, paySheet.inst.currency)}</span></>
              )}
            </DrawerDescription>
          </DrawerHeader>
          <div className="px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] space-y-2">
            <Button
              variant="gold"
              className="w-full h-12 text-sm"
              onClick={() => {
                if (!paySheet.inst || !onPayWithMP) return;
                const inst = paySheet.inst;
                setPaySheet({ open: false, inst: null });
                onPayWithMP({
                  id: inst.id,
                  installment_number: inst.installment_number,
                  amount: inst.balance_due ?? inst.amount,
                });
              }}
            >
              <CreditCard className="w-4 h-4 mr-2" />
              Pagar con Mercado Pago
            </Button>
            <Button
              variant="outline"
              className="w-full h-12 text-sm"
              onClick={() => {
                if (!paySheet.inst) return;
                const id = paySheet.inst.id;
                setPaySheet({ open: false, inst: null });
                onReportPayment(id);
              }}
            >
              <Wallet2 className="w-4 h-4 mr-2" />
              Informar otro medio de pago
            </Button>
            <p className="text-[11px] text-muted-foreground text-center pt-2">
              Si pagás con Mercado Pago, el pago se acredita automáticamente en tu cuenta.
            </p>
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
});

StudentInstallmentsPlan.displayName = "StudentInstallmentsPlan";

export default StudentInstallmentsPlan;
