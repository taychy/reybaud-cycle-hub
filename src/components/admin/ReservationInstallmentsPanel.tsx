import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertCircle, CalendarClock, CheckCircle2, Clock, Loader2,
  PiggyBank, RefreshCw, History, Sparkles, Ban, ArrowRightLeft,
} from "lucide-react";
import { formatPrice } from "@/lib/currency";
import AssignPaymentPlanDialog from "./AssignPaymentPlanDialog";
import ReassignPaymentDialog from "./ReassignPaymentDialog";

interface Installment {
  id: string;
  reservation_id: string;
  event_installment_id: string | null;
  installment_number: number;
  label: string;
  amount: number;
  currency: string;
  due_date: string | null;
  original_due_date: string | null;
  sort_order: number;
  status: string;
  paid_amount: number;
  condoned_amount: number;
  balance_due: number;
  status_reason: string | null;
  condoned_at: string | null;
  rescheduled_at: string | null;
  created_at: string;
  updated_at: string;
}

interface PaymentRow {
  id: string;
  installment_id: string | null;
  installment_number: number | null;
  amount: number;
  equivalent_amount_event_currency: number | null;
  status: string;
  payment_date: string;
  payment_method: string;
}

interface HistoryRow {
  id: string;
  reservation_installment_id: string | null;
  action: string;
  reason: string | null;
  changed_by: string | null;
  before: any;
  after: any;
  created_at: string;
}

interface Props {
  reservationId: string;
  reservationCurrency: string;
  reservationAmountTotal: number;
  reservationAmountPaid: number;
  hasEventInstallments: boolean;
  reservationPackageId?: string | null;
  reservationHasPaymentPlan?: boolean;
  onChanged?: () => void;
}

const statusMeta: Record<string, { label: string; cls: string }> = {
  pendiente:    { label: "Pendiente",    cls: "bg-muted text-muted-foreground border-border" },
  parcial:      { label: "Parcial",      cls: "bg-sky-500/15 text-sky-500 border-sky-500/30" },
  pagada:       { label: "Pagada",       cls: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30" },
  condonada:    { label: "Condonada",    cls: "bg-violet-500/15 text-violet-500 border-violet-500/30" },
  reprogramada: { label: "Reprogramada", cls: "bg-amber-500/15 text-amber-500 border-amber-500/30" },
};

const fmtDate = (d?: string | null) => {
  if (!d) return "—";
  const [y, m, dd] = d.split("-");
  return `${dd}/${m}/${y}`;
};

const ReservationInstallmentsPanel = ({
  reservationId,
  reservationCurrency,
  reservationAmountTotal,
  reservationAmountPaid,
  hasEventInstallments,
  reservationPackageId,
  reservationHasPaymentPlan,
  onChanged,
}: Props) => {
  const [items, setItems] = useState<Installment[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [assignPlanOpen, setAssignPlanOpen] = useState(false);
  const [reassignPayment, setReassignPayment] = useState<PaymentRow | null>(null);

  const [condoneOpen, setCondoneOpen] = useState<Installment | null>(null);
  const [condoneAmount, setCondoneAmount] = useState("");
  const [condoneReason, setCondoneReason] = useState("");

  const [rescheduleOpen, setRescheduleOpen] = useState<Installment | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleReason, setRescheduleReason] = useState("");

  const [historyOpen, setHistoryOpen] = useState<Installment | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: ins }, { data: pays }] = await Promise.all([
      supabase
        .from("reservation_installments")
        .select("*")
        .eq("reservation_id", reservationId)
        .order("sort_order", { ascending: true })
        .order("installment_number", { ascending: true }),
      supabase
        .from("reservation_payments")
        .select("id,installment_id,amount,equivalent_amount_event_currency,status,payment_date,payment_method")
        .eq("reservation_id", reservationId),
    ]);
    setItems((ins as any) || []);
    setPayments((pays as any) || []);
    setLoading(false);
  }, [reservationId]);

  useEffect(() => { load(); }, [load]);

  const totals = useMemo(() => {
    const condoned = items.reduce((s, i) => s + Number(i.condoned_amount || 0), 0);
    const paid = items.reduce((s, i) => s + Number(i.paid_amount || 0), 0);
    const balance = Math.max(reservationAmountTotal - reservationAmountPaid - condoned, 0);
    return { condoned, paid, balance };
  }, [items, reservationAmountTotal, reservationAmountPaid]);

  const paymentsByInstallment = useMemo(() => {
    const map: Record<string, PaymentRow[]> = {};
    payments.forEach((p) => {
      if (!p.installment_id) return;
      (map[p.installment_id] ||= []).push(p);
    });
    return map;
  }, [payments]);

  const handleMaterialize = async () => {
    setActing("materialize");
    const { data, error } = await supabase.rpc("materialize_reservation_installments" as any, {
      p_reservation_id: reservationId,
    });
    setActing(null);
    if (error) {
      toast.error("No se pudo materializar el plan de cuotas");
      return;
    }
    const inserted = (data as number) ?? 0;
    if (inserted > 0) {
      toast.success(`Se generaron ${inserted} cuota(s) para esta reserva`);
    } else {
      toast.info("No había cuotas nuevas para generar");
    }
    await load();
    onChanged?.();
  };

  const submitCondone = async () => {
    if (!condoneOpen) return;
    if (!condoneReason.trim() || condoneReason.trim().length < 3) {
      toast.error("El motivo es obligatorio (mínimo 3 caracteres)");
      return;
    }
    const amt = parseFloat(condoneAmount);
    if (!amt || amt <= 0) {
      toast.error("Monto inválido");
      return;
    }
    setActing(condoneOpen.id);
    const { error } = await supabase.rpc("condone_installment" as any, {
      p_installment_id: condoneOpen.id,
      p_amount: amt,
      p_reason: condoneReason.trim(),
    });
    setActing(null);
    if (error) {
      toast.error(error.message || "No se pudo condonar la cuota");
      return;
    }
    toast.success("Crédito otorgado a la cuota");
    setCondoneOpen(null);
    setCondoneAmount("");
    setCondoneReason("");
    await load();
    onChanged?.();
  };

  const submitReschedule = async () => {
    if (!rescheduleOpen) return;
    if (!rescheduleReason.trim() || rescheduleReason.trim().length < 3) {
      toast.error("El motivo es obligatorio (mínimo 3 caracteres)");
      return;
    }
    if (!rescheduleDate) {
      toast.error("Indicá la nueva fecha de vencimiento");
      return;
    }
    setActing(rescheduleOpen.id);
    const { error } = await supabase.rpc("reschedule_installment" as any, {
      p_installment_id: rescheduleOpen.id,
      p_new_due_date: rescheduleDate,
      p_reason: rescheduleReason.trim(),
    });
    setActing(null);
    if (error) {
      toast.error(error.message || "No se pudo reprogramar la cuota");
      return;
    }
    toast.success("Cuota reprogramada");
    setRescheduleOpen(null);
    setRescheduleDate("");
    setRescheduleReason("");
    await load();
    onChanged?.();
  };

  const openHistory = async (inst: Installment) => {
    setHistoryOpen(inst);
    setLoadingHistory(true);
    const { data } = await supabase
      .from("reservation_installment_history")
      .select("*")
      .eq("reservation_installment_id", inst.id)
      .order("created_at", { ascending: false });
    setHistory((data as any) || []);
    setLoadingHistory(false);
  };

  if (loading) {
    return <p className="text-xs text-muted-foreground">Cargando cuotas…</p>;
  }

  // Empty state
  if (items.length === 0) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Cuotas de la reserva</h4>
        </div>
        <div className="rounded-xl border border-dashed border-border p-4 text-center space-y-3">
          <p className="text-xs text-muted-foreground">
            {hasEventInstallments
              ? "Esta reserva todavía no tiene cuotas materializadas."
              : "El evento no tiene plan de cuotas activo. Esta reserva se cobra como pago único."}
          </p>
          {hasEventInstallments && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleMaterialize}
              disabled={acting === "materialize"}
            >
              {acting === "materialize" ? (
                <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5 mr-1" />
              )}
              Generar plan de cuotas para esta reserva
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Cuotas de la reserva
        </h4>
        <div className="flex gap-2">
          {hasEventInstallments && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-[11px]"
              onClick={handleMaterialize}
              disabled={acting === "materialize"}
              title="Re-materializar (idempotente: agrega cuotas faltantes de la plantilla)"
            >
              {acting === "materialize" ? (
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              ) : (
                <RefreshCw className="w-3 h-3 mr-1" />
              )}
              Sincronizar plantilla
            </Button>
          )}
        </div>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-muted/30 px-2 py-2">
          <p className="text-[10px] text-muted-foreground uppercase">Pagado</p>
          <p className="text-sm font-semibold text-emerald-500">
            {formatPrice(reservationAmountPaid, reservationCurrency)}
          </p>
        </div>
        <div className="rounded-lg bg-muted/30 px-2 py-2">
          <p className="text-[10px] text-muted-foreground uppercase">Crédito otorgado</p>
          <p className="text-sm font-semibold text-violet-400">
            {formatPrice(totals.condoned, reservationCurrency)}
          </p>
        </div>
        <div className="rounded-lg bg-muted/30 px-2 py-2">
          <p className="text-[10px] text-muted-foreground uppercase">Saldo</p>
          <p className={`text-sm font-semibold ${totals.balance > 0 ? "text-amber-500" : "text-muted-foreground"}`}>
            {formatPrice(totals.balance, reservationCurrency)}
          </p>
        </div>
      </div>

      <div className="space-y-2">
        {items.map((it) => {
          const meta = statusMeta[it.status] || statusMeta.pendiente;
          const overdue =
            it.due_date &&
            it.status !== "pagada" &&
            it.status !== "condonada" &&
            new Date(it.due_date + "T23:59:59") < new Date();
          const linkedPays = paymentsByInstallment[it.id] || [];
          const validatedLinkedCount = linkedPays.filter((p) => p.status === "validado").length;

          return (
            <div
              key={it.id}
              className={`rounded-lg border p-3 space-y-2 ${
                overdue ? "border-destructive/30 bg-destructive/5" : "border-border/60 bg-muted/20"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold">
                      {it.label || `Cuota ${it.installment_number}`}
                    </span>
                    <Badge variant="outline" className={`text-[10px] border ${meta.cls}`}>
                      {meta.label}
                    </Badge>
                    {overdue && (
                      <Badge variant="outline" className="text-[10px] border-destructive/40 text-destructive bg-destructive/10">
                        Vencida
                      </Badge>
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground flex items-center gap-2 mt-1 flex-wrap">
                    <span className="inline-flex items-center gap-1">
                      <CalendarClock className="w-3 h-3" />
                      Vence {fmtDate(it.due_date)}
                      {it.original_due_date && it.original_due_date !== it.due_date && (
                        <span className="text-muted-foreground/60 line-through ml-1">
                          {fmtDate(it.original_due_date)}
                        </span>
                      )}
                    </span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold">{formatPrice(Number(it.amount), it.currency)}</p>
                  <p className="text-[10px] text-muted-foreground">monto</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center pt-1">
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase">Pagado</p>
                  <p className="text-xs font-semibold text-emerald-500">
                    {formatPrice(Number(it.paid_amount || 0), it.currency)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase">Condonado</p>
                  <p className="text-xs font-semibold text-violet-400">
                    {formatPrice(Number(it.condoned_amount || 0), it.currency)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase">Saldo</p>
                  <p className={`text-xs font-semibold ${Number(it.balance_due) > 0 ? "text-amber-500" : "text-muted-foreground"}`}>
                    {formatPrice(Number(it.balance_due || 0), it.currency)}
                  </p>
                </div>
              </div>

              {validatedLinkedCount > 0 && (
                <p className="text-[11px] text-muted-foreground">
                  {validatedLinkedCount} pago(s) imputado(s) a esta cuota
                </p>
              )}

              {it.status_reason && (
                <p className="text-[11px] text-muted-foreground italic border-l-2 border-border pl-2">
                  Motivo: {it.status_reason}
                </p>
              )}

              <div className="flex flex-wrap gap-1 pt-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-[11px]"
                  onClick={() => {
                    setCondoneOpen(it);
                    const remaining = Math.max(
                      Number(it.amount) - Number(it.paid_amount || 0) - Number(it.condoned_amount || 0),
                      0
                    );
                    setCondoneAmount(remaining.toFixed(2));
                    setCondoneReason("");
                  }}
                  disabled={Number(it.balance_due) <= 0}
                >
                  <PiggyBank className="w-3 h-3 mr-1" /> Otorgar crédito
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-[11px]"
                  onClick={() => {
                    setRescheduleOpen(it);
                    setRescheduleDate(it.due_date || "");
                    setRescheduleReason("");
                  }}
                  disabled={it.status === "pagada" || it.status === "condonada"}
                >
                  <CalendarClock className="w-3 h-3 mr-1" /> Reprogramar
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-[11px]"
                  onClick={() => openHistory(it)}
                >
                  <History className="w-3 h-3 mr-1" /> Historial
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-[10px] text-muted-foreground italic">
        El crédito otorgado no modifica el precio total de la reserva. Saldo = Total − Pagado − Crédito.
      </p>

      {/* Dialog: Condonar */}
      <Dialog open={!!condoneOpen} onOpenChange={(o) => !o && setCondoneOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PiggyBank className="w-4 h-4 text-violet-400" /> Otorgar crédito / Condonar
            </DialogTitle>
            <DialogDescription>
              Reduce el saldo de la cuota sin tocar el precio total. Queda registrado como crédito administrativo.
            </DialogDescription>
          </DialogHeader>
          {condoneOpen && (
            <div className="space-y-3">
              <div className="rounded-lg bg-muted/40 p-3 text-xs space-y-1">
                <p><span className="text-muted-foreground">Cuota:</span> {condoneOpen.label}</p>
                <p><span className="text-muted-foreground">Monto:</span> {formatPrice(Number(condoneOpen.amount), condoneOpen.currency)}</p>
                <p><span className="text-muted-foreground">Saldo actual:</span> {formatPrice(Number(condoneOpen.balance_due || 0), condoneOpen.currency)}</p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Monto a otorgar como crédito ({condoneOpen.currency}) *</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={condoneAmount}
                  onChange={(e) => setCondoneAmount(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Motivo *</Label>
                <Textarea
                  value={condoneReason}
                  onChange={(e) => setCondoneReason(e.target.value)}
                  placeholder="Ej: descuento por inscripción anticipada, beca parcial, ajuste comercial…"
                  rows={3}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCondoneOpen(null)}>Cancelar</Button>
            <Button
              onClick={submitCondone}
              disabled={acting === condoneOpen?.id}
            >
              {acting === condoneOpen?.id && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}
              Confirmar crédito
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Reprogramar */}
      <Dialog open={!!rescheduleOpen} onOpenChange={(o) => !o && setRescheduleOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarClock className="w-4 h-4 text-amber-400" /> Reprogramar cuota
            </DialogTitle>
            <DialogDescription>
              Cambia la fecha de vencimiento. Conservamos la fecha original como referencia histórica.
            </DialogDescription>
          </DialogHeader>
          {rescheduleOpen && (
            <div className="space-y-3">
              <div className="rounded-lg bg-muted/40 p-3 text-xs space-y-1">
                <p><span className="text-muted-foreground">Cuota:</span> {rescheduleOpen.label}</p>
                <p><span className="text-muted-foreground">Vencimiento actual:</span> {fmtDate(rescheduleOpen.due_date)}</p>
                {rescheduleOpen.original_due_date && rescheduleOpen.original_due_date !== rescheduleOpen.due_date && (
                  <p><span className="text-muted-foreground">Fecha original:</span> {fmtDate(rescheduleOpen.original_due_date)}</p>
                )}
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Nueva fecha *</Label>
                <Input
                  type="date"
                  value={rescheduleDate}
                  onChange={(e) => setRescheduleDate(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Motivo *</Label>
                <Textarea
                  value={rescheduleReason}
                  onChange={(e) => setRescheduleReason(e.target.value)}
                  placeholder="Ej: prórroga acordada con el alumno, ajuste por cambio de fecha del viaje…"
                  rows={3}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRescheduleOpen(null)}>Cancelar</Button>
            <Button
              onClick={submitReschedule}
              disabled={acting === rescheduleOpen?.id}
            >
              {acting === rescheduleOpen?.id && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}
              Reprogramar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Historial */}
      <Dialog open={!!historyOpen} onOpenChange={(o) => !o && setHistoryOpen(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="w-4 h-4" /> Historial de la cuota
            </DialogTitle>
            <DialogDescription>
              {historyOpen?.label} — auditoría completa de cambios.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto space-y-2">
            {loadingHistory ? (
              <p className="text-xs text-muted-foreground">Cargando…</p>
            ) : history.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sin eventos registrados.</p>
            ) : (
              history.map((h) => (
                <div key={h.id} className="rounded-lg border border-border/60 p-3 text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="text-[10px]">{h.action}</Badge>
                    <span className="text-muted-foreground">
                      {new Date(h.created_at).toLocaleString("es-AR")}
                    </span>
                  </div>
                  {h.reason && <p>Motivo: {h.reason}</p>}
                  {h.changed_by && (
                    <p className="text-muted-foreground text-[10px]">por {h.changed_by}</p>
                  )}
                </div>
              ))
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setHistoryOpen(null)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ReservationInstallmentsPanel;
