import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { MONEDAS, formatPrice } from "@/lib/currency";
import { PAYMENT_METHODS, type PaymentMethodKey } from "@/lib/paymentMethods";
import { toast } from "sonner";

const NONE = "__none__";
const MP_KEYS: PaymentMethodKey[] = ["mp_externo_josi", "mp_externo_scarlett", "mp_externo_claudio", "mercadopago"];

export type CobranzaTargetType = "suscripcion" | "reservation" | "cargo" | "store_order";

interface DebtTarget {
  key: string;
  type: CobranzaTargetType;
  id: string;
  label: string;
  currency: string;
  amount: number;
  icon: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  alumnoId: string;
  /** Deuda preseleccionada (por ejemplo, un pedido de tienda). */
  preselect?: { type: CobranzaTargetType; id: string } | null;
  onSaved?: () => void;
}

/**
 * Registro de una cobranza real del cliente (no un ajuste administrativo).
 * Genera un único movimiento en cuenta corriente y, si se elige una deuda,
 * lo imputa a ella (pedidos de tienda incluidos).
 */
export function RegistrarCobranzaDialog({ open, onOpenChange, alumnoId, preselect, onSaved }: Props) {
  const today = new Date().toISOString().substring(0, 10);
  const [targets, setTargets] = useState<DebtTarget[]>([]);
  const [loadingTargets, setLoadingTargets] = useState(false);
  const [targetKey, setTargetKey] = useState<string>(NONE);
  const [monto, setMonto] = useState("");
  const [moneda, setMoneda] = useState("ARS");
  const [fecha, setFecha] = useState(today);
  const [medioPago, setMedioPago] = useState<string>("efectivo");
  const [cuentaMpId, setCuentaMpId] = useState<string | null>(null);
  const [cuentasMp, setCuentasMp] = useState<Array<{ id: string; slug: string }>>([]);
  const [referencia, setReferencia] = useState("");
  const [notas, setNotas] = useState("");
  const [saving, setSaving] = useState(false);
  const [touchedMonto, setTouchedMonto] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMonto("");
    setMoneda("ARS");
    setFecha(today);
    setMedioPago("efectivo");
    setReferencia("");
    setNotas("");
    setSaving(false);
    setTouchedMonto(false);
    setTargetKey(preselect ? `${preselect.type}:${preselect.id}` : NONE);
  }, [open, preselect, today]);

  useEffect(() => {
    if (!open || !alumnoId) return;
    let cancel = false;
    setLoadingTargets(true);
    Promise.all([
      supabase.rpc("get_alumno_payment_targets" as any, { _alumno_id: alumnoId }),
      supabase.rpc("get_alumno_store_order_targets" as any, { _alumno_id: alumnoId }),
    ]).then(([base, store]) => {
      if (cancel) return;
      setLoadingTargets(false);
      const d = (base.data as any) ?? {};
      const s = (store.data as any) ?? {};
      const rows: DebtTarget[] = [
        ...((s.store_orders ?? []) as any[]).map((o) => ({
          key: `store_order:${o.id}`, type: "store_order" as const, id: o.id,
          label: o.label, currency: o.currency, amount: Number(o.balance) || 0, icon: "🛍️",
        })),
        ...((d.subscriptions ?? []) as any[]).map((x) => ({
          key: `suscripcion:${x.id}`, type: "suscripcion" as const, id: x.id,
          label: x.label, currency: x.currency, amount: Number(x.balance ?? x.total) || 0, icon: "📅",
        })),
        ...((d.reservations ?? []) as any[]).map((x) => ({
          key: `reservation:${x.id}`, type: "reservation" as const, id: x.id,
          label: x.label, currency: x.currency, amount: Number(x.balance) || 0, icon: "🎟️",
        })),
        ...((d.cargos ?? []) as any[]).map((x) => ({
          key: `cargo:${x.id}`, type: "cargo" as const, id: x.id,
          label: x.label, currency: x.currency, amount: Number(x.balance) || 0, icon: "🧾",
        })),
      ];
      setTargets(rows);
    });
    return () => { cancel = true; };
  }, [open, alumnoId]);

  const target = useMemo(() => targets.find((t) => t.key === targetKey) || null, [targets, targetKey]);

  // Prellenar monto y moneda con la deuda elegida (mientras no lo editen a mano)
  useEffect(() => {
    if (!target) return;
    setMoneda(target.currency || "ARS");
    if (!touchedMonto) setMonto(String(target.amount || ""));
  }, [target, touchedMonto]);

  useEffect(() => {
    supabase.from("cuentas_mp" as any).select("id, slug").eq("activa", true)
      .then(({ data }) => setCuentasMp(((data as any) || [])));
  }, []);

  useEffect(() => {
    if (MP_KEYS.includes(medioPago as PaymentMethodKey)) {
      const slug = medioPago.replace("mp_externo_", "");
      setCuentaMpId(cuentasMp.find((c) => c.slug === slug)?.id || null);
    } else {
      setCuentaMpId(null);
    }
  }, [medioPago, cuentasMp]);

  const montoNum = Number(monto) || 0;
  const excedente = target ? Math.max(montoNum - target.amount, 0) : 0;
  const faltante = target ? Math.max(target.amount - montoNum, 0) : 0;
  const currencyMismatch = !!target && (target.currency || "ARS") !== moneda;

  const handleSave = async () => {
    if (!montoNum || montoNum <= 0) { toast.error("Monto inválido"); return; }
    if (currencyMismatch) { toast.error("La moneda no coincide con la deuda seleccionada"); return; }
    setSaving(true);

    const concepto = target ? `Cobranza — ${target.label}` : "Cobranza";
    const { data: { user } } = await supabase.auth.getUser();
    const res = await supabase.from("cuenta_ajustes").insert({
      alumno_id: alumnoId,
      tipo: "credito",
      concepto,
      monto: montoNum,
      moneda,
      fecha,
      notas: notas.trim() || null,
      medio_pago: medioPago === NONE ? null : medioPago,
      cuenta_mp_id: cuentaMpId,
      referencia_externa: referencia.trim() || null,
      created_by: user?.id || null,
    } as any).select("id").single();

    if (res.error) {
      setSaving(false);
      console.error(res.error);
      toast.error("No se pudo registrar la cobranza");
      return;
    }

    const newId = (res.data as any)?.id as string | undefined;
    if (newId && target) {
      const { error: applyErr } = await supabase.rpc("apply_credit_ajuste_to_target" as any, {
        _ajuste_id: newId,
        _target_type: target.type,
        _target_id: target.id,
      });
      setSaving(false);
      if (applyErr) {
        console.error(applyErr);
        toast.warning("Cobro registrado, pero no se pudo imputar a la deuda seleccionada");
        onSaved?.();
        onOpenChange(false);
        return;
      }
      toast.success(
        excedente > 0.01
          ? `Cobro registrado. Queda ${formatPrice(excedente, moneda)} de saldo a favor.`
          : faltante > 0.01
            ? `Pago parcial registrado. Queda pendiente ${formatPrice(faltante, moneda)}.`
            : "Cobro registrado e imputado",
      );
      onSaved?.();
      onOpenChange(false);
      return;
    }

    setSaving(false);
    toast.success("Cobro registrado como saldo a favor");
    onSaved?.();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !saving && onOpenChange(v)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar cobranza</DialogTitle>
          <DialogDescription className="text-xs">
            Registrá el dinero recibido del cliente y, si corresponde, imputalo a una deuda.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Imputar a</Label>
            <Select value={targetKey} onValueChange={(v) => { setTargetKey(v); setTouchedMonto(false); }} disabled={loadingTargets}>
              <SelectTrigger>
                <SelectValue placeholder={loadingTargets ? "Cargando deudas…" : "No imputar (queda saldo a favor)"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>No imputar (queda saldo a favor)</SelectItem>
                {targets.map((t) => (
                  <SelectItem key={t.key} value={t.key}>
                    {t.icon} {t.label} · {formatPrice(t.amount, t.currency)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!loadingTargets && targets.length === 0 && (
              <p className="text-[10px] text-muted-foreground">Este cliente no tiene deudas pendientes.</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Monto recibido</Label>
              <Input
                type="number" min="0" step="0.01" value={monto}
                onChange={(e) => { setTouchedMonto(true); setMonto(e.target.value); }}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Moneda</Label>
              <Select value={moneda} onValueChange={setMoneda}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MONEDAS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {target && montoNum > 0 && (
            <p className="text-[11px]">
              {excedente > 0.01 ? (
                <span className="text-emerald-400">
                  Cubre {target.label} y quedan {formatPrice(excedente, moneda)} como saldo a favor.
                </span>
              ) : faltante > 0.01 ? (
                <span className="text-amber-400">
                  Pago parcial · queda pendiente {formatPrice(faltante, moneda)}.
                </span>
              ) : (
                <span className="text-emerald-400">Cubre exactamente la deuda seleccionada.</span>
              )}
            </p>
          )}
          {currencyMismatch && (
            <p className="text-[11px] text-destructive">
              La deuda está en {target?.currency}. Elegí esa moneda para imputarla.
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Medio de pago</Label>
              <Select value={medioPago} onValueChange={setMedioPago}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m.key} value={m.key}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Fecha</Label>
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">
              N° operación / referencia <span className="text-muted-foreground">(opcional)</span>
            </Label>
            <Input
              value={referencia}
              onChange={(e) => setReferencia(e.target.value)}
              placeholder="Ej: 165305752054 · CBU últ. 4 · recibo Nº…"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Notas (opcional)</Label>
            <Textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving || montoNum <= 0 || currencyMismatch}>
            {saving ? "Registrando…" : "Registrar cobranza"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
