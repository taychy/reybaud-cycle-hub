import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatPrice } from "@/lib/currency";
import { rpcErrorMessage } from "@/lib/edgeErrors";
import { summarizeDebtDistribution } from "@/lib/debtDistribution";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

interface PaymentSource {
  sourceType: "mp_movement";
  sourceId: string;
  label: string;
  currency: string;
  gross: number;
  available: number;
}

interface Target {
  key: string;
  type: "suscripcion" | "reserva" | "otro";
  id: string;
  label: string;
  currency: string;
  amount: number;
}

export function MultiDebtImputationDialog({
  open,
  onOpenChange,
  alumnoId,
  payment,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  alumnoId: string | null;
  payment: PaymentSource | null;
  onChanged?: () => void | Promise<void>;
}) {
  const [targets, setTargets] = useState<Target[]>([]);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const batchId = useRef("");

  useEffect(() => {
    if (!open || !alumnoId || !payment) return;
    let active = true;
    setAmounts({});
    setTargets([]);
    setLoading(true);
    batchId.current = crypto.randomUUID();
    void supabase.rpc("get_alumno_payment_targets", { _alumno_id: alumnoId }).then(({ data, error }) => {
      if (!active) return;
      setLoading(false);
      if (error) {
        toast.error(rpcErrorMessage(error, "No se pudieron cargar las deudas pendientes"));
        return;
      }
      const d = (data as any) ?? {};
      const next: Target[] = [
        ...((d.subscriptions ?? []) as any[]).map((s) => ({
          key: `suscripcion:${s.id}`, type: "suscripcion" as const, id: s.id,
          label: s.label, currency: s.currency, amount: Number(s.balance ?? s.total) || 0,
        })),
        ...((d.reservations ?? []) as any[]).map((r) => ({
          key: `reserva:${r.id}`, type: "reserva" as const, id: r.id,
          label: r.label, currency: r.currency, amount: Number(r.balance) || 0,
        })),
        ...((d.cargos ?? []) as any[]).map((c) => ({
          key: `otro:${c.id}`, type: "otro" as const, id: c.id,
          label: c.label, currency: c.currency, amount: Number(c.balance) || 0,
        })),
      ];
      setTargets(next.filter((target) => target.amount > 0 && target.currency.toUpperCase() === payment.currency.toUpperCase()));
    });
    return () => { active = false; };
  }, [open, alumnoId, payment?.sourceId]);

  const selectedRows = useMemo(() => targets
    .filter((target) => amounts[target.key] !== undefined)
    .map((target) => ({ key: target.key, amount: amounts[target.key], maximum: target.amount })), [targets, amounts]);

  const summary = useMemo(() => payment
    ? summarizeDebtDistribution(Number(payment.gross), Number(payment.available), selectedRows)
    : null, [payment, selectedRows]);

  const toggleTarget = (target: Target, checked: boolean) => {
    setAmounts((current) => {
      const next = { ...current };
      if (!checked) delete next[target.key];
      else next[target.key] = String(Math.min(target.amount, Number(payment?.available ?? 0)));
      return next;
    });
  };

  const apply = async () => {
    if (!payment || !summary?.valid || saving) return;
    const debts = targets.filter((target) => amounts[target.key] !== undefined).map((target) => ({
      obligacion_tipo: target.type,
      obligacion_id: target.id,
      monto: Number(amounts[target.key]),
    }));
    setSaving(true);
    const { error } = await supabase.rpc("imputar_pago_en_deudas", {
      _pago_origen_tipo: payment.sourceType,
      _pago_origen_id: payment.sourceId,
      _deudas: debts,
      _lote_id: batchId.current,
    });
    setSaving(false);
    if (error) {
      toast.error(rpcErrorMessage(error, "No se pudo distribuir el pago"));
      return;
    }
    toast.success(`Se distribuyeron ${formatPrice(summary.allocated, payment.currency)} entre ${debts.length} deudas`);
    onOpenChange(false);
    await onChanged?.();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Distribuir un pago entre deudas</DialogTitle>
          <DialogDescription>{payment?.label}</DialogDescription>
        </DialogHeader>

        {payment && summary && (
          <div className="grid grid-cols-2 gap-2 rounded-md border bg-muted/30 p-3 text-sm sm:grid-cols-4">
            <div><div className="text-xs text-muted-foreground">Ingreso total</div><div className="font-semibold">{formatPrice(payment.gross, payment.currency)}</div></div>
            <div><div className="text-xs text-muted-foreground">Ya utilizado</div><div className="font-semibold">{formatPrice(summary.alreadyUsed, payment.currency)}</div></div>
            <div><div className="text-xs text-muted-foreground">A distribuir</div><div className="font-semibold">{formatPrice(summary.allocated, payment.currency)}</div></div>
            <div><div className="text-xs text-muted-foreground">Remanente</div><div className={`font-semibold ${summary.remaining < 0 ? "text-destructive" : ""}`}>{formatPrice(summary.remaining, payment.currency)}</div></div>
          </div>
        )}

        <div className="space-y-2">
          {loading && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Buscando deudas vigentes…</div>}
          {!loading && targets.length === 0 && <p className="text-sm text-muted-foreground">No hay deudas pendientes en la moneda de este pago.</p>}
          {targets.map((target) => {
            const checked = amounts[target.key] !== undefined;
            return (
              <div key={target.key} className={`rounded-md border p-3 ${checked ? "border-primary" : ""}`}>
                <label className="flex cursor-pointer items-start gap-3">
                  <input type="checkbox" className="mt-1 h-4 w-4" checked={checked} onChange={(event) => toggleTarget(target, event.target.checked)} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{target.label}</span>
                    <span className="block text-xs text-muted-foreground">Pendiente {formatPrice(target.amount, target.currency)}</span>
                  </span>
                </label>
                {checked && (
                  <div className="mt-2 flex items-center gap-2 pl-7">
                    <span className="text-xs text-muted-foreground">Importe</span>
                    <Input type="number" inputMode="decimal" min={0} max={target.amount} value={amounts[target.key]} onChange={(event) => setAmounts((current) => ({ ...current, [target.key]: event.target.value }))} className="ml-auto w-36" />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {selectedRows.length > 0 && payment && (
          <div className="rounded-md border p-3 text-xs text-muted-foreground">
            Revisá antes de guardar: se aplicarán {formatPrice(summary?.allocated ?? 0, payment.currency)} y quedarán {formatPrice(summary?.remaining ?? 0, payment.currency)} disponibles. El ingreso no se vuelve a registrar.
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={apply} disabled={saving || loading || !summary?.valid}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirmar distribución
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default MultiDebtImputationDialog;
