import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatPrice } from "@/lib/currency";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CheckCircle, Clock, AlertCircle, Gift, CalendarDays,
  ExternalLink, Banknote, ChevronDown, ChevronUp, Loader2,
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

const isOverdue = (dueDate: string | null, status: string) => {
  if (!dueDate || status === "pagada" || status === "condonada") return false;
  const [y, m, d] = dueDate.split("-").map(Number);
  const due = new Date(y, m - 1, d);
  return due < new Date();
};

const StudentInstallmentsPlan = ({
  reservationId, currency, amountTotal, amountPaid, balanceDue, onReportPayment,
}: Props) => {
  const [installments, setInstallments] = useState<Installment[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

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

  const getPaymentsForInstallment = (instId: string) =>
    payments.filter(p => p.installment_id === instId);

  const generalPayments = payments.filter(p => !p.installment_id);

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <h3 className="font-heading font-semibold text-sm uppercase tracking-wide text-foreground">
          Plan de pagos
        </h3>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="space-y-0.5">
            <span className="text-muted-foreground">Total</span>
            <p className="font-semibold text-foreground">{formatPrice(amountTotal, currency)}</p>
          </div>
          <div className="space-y-0.5">
            <span className="text-muted-foreground">Pagado</span>
            <p className="font-semibold text-emerald-400">{formatPrice(amountPaid, currency)}</p>
          </div>
          {totalCondoned > 0 && (
            <div className="space-y-0.5">
              <span className="text-muted-foreground">Bonificado</span>
              <p className="font-semibold text-cyan-400">{formatPrice(totalCondoned, currency)}</p>
            </div>
          )}
          <div className="space-y-0.5">
            <span className="text-muted-foreground">Saldo</span>
            <p className={`font-semibold ${balanceDue > 0 ? "text-amber-400" : "text-emerald-400"}`}>
              {formatPrice(balanceDue, currency)}
            </p>
          </div>
        </div>
      </div>

      {/* Installment cards */}
      <div className="space-y-2">
        {installments.map((inst) => {
          const cfg = statusConfig[inst.status] || statusConfig.pendiente;
          const Icon = cfg.icon;
          const overdue = isOverdue(inst.due_date, inst.status);
          const instPayments = getPaymentsForInstallment(inst.id);
          const isExpanded = expandedId === inst.id;
          const canPay = ["pendiente", "parcial", "reprogramada"].includes(inst.status);

          return (
            <div
              key={inst.id}
              className={`rounded-xl border p-3 space-y-2 transition-colors ${
                overdue ? "border-destructive/40 bg-destructive/5" : "border-border bg-card"
              }`}
            >
              {/* Header row */}
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


              {/* Amount row */}
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

              {/* Progress detail for partial/paid */}
              {(inst.paid_amount > 0 || inst.condoned_amount > 0) && (
                <div className="flex gap-3 text-[11px]">
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

              {/* Payments toggle */}
              {instPayments.length > 0 && (
                <button
                  onClick={() => setExpandedId(isExpanded ? null : inst.id)}
                  className="flex items-center gap-1 text-[11px] text-primary hover:underline"
                >
                  {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  {instPayments.length} pago{instPayments.length > 1 ? "s" : ""} registrado{instPayments.length > 1 ? "s" : ""}
                </button>
              )}

              {/* Expanded payments list */}
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

              {/* Action buttons */}
              {canPay && (
                <div className="flex gap-2 pt-1">
                  {inst.external_payment_url && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 text-xs h-8"
                      onClick={() => window.open(inst.external_payment_url!, "_blank")}
                    >
                      <ExternalLink className="w-3 h-3 mr-1" /> Pagar online
                    </Button>
                  )}
                  <Button
                    variant="default"
                    size="sm"
                    className="flex-1 text-xs h-8"
                    onClick={() => onReportPayment(inst.id)}
                  >
                    <Banknote className="w-3 h-3 mr-1" /> Informar pago
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* General payments */}
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

      {/* General payment option */}
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
    </div>
  );
};

export default StudentInstallmentsPlan;
