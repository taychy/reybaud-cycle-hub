import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Wallet } from "lucide-react";
import { formatPrice } from "@/lib/currency";
import { toast } from "sonner";

const sb: any = supabase;

interface PagoDisponible {
  pago_origen_tipo: string;
  pago_origen_id: string;
  mp_payment_id: string | null;
  fecha: string;
  concepto: string;
  moneda: string;
  monto_bruto: number;
  monto_imputado: number;
  disponible: number;
}

interface Target {
  key: string;
  type: "suscripcion" | "reservation" | "cargo";
  id: string;
  label: string;
  currency: string;
  amount: number;
  icon: string;
}

export function SaldoDisponibleSection({
  alumnoId,
  onChanged,
}: {
  alumnoId: string;
  onChanged?: () => void;
}) {
  const [pagos, setPagos] = useState<PagoDisponible[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<PagoDisponible | null>(null);
  const [targets, setTargets] = useState<Target[]>([]);
  const [targetKey, setTargetKey] = useState("");
  const [monto, setMonto] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchPagos = useCallback(async () => {
    setLoading(true);
    const { data, error } = await sb
      .from("vw_pagos_disponibles")
      .select("*")
      .eq("alumno_id", alumnoId)
      .gt("disponible", 0)
      .order("fecha", { ascending: false });
    setLoading(false);
    if (!error) setPagos((data || []) as PagoDisponible[]);
  }, [alumnoId]);

  useEffect(() => {
    fetchPagos();
  }, [fetchPagos]);

  const openApply = async (p: PagoDisponible) => {
    setSelected(p);
    setTargetKey("");
    setMonto("");
    setTargets([]);
    const { data, error } = await sb.rpc("get_alumno_payment_targets", { _alumno_id: alumnoId });
    if (error) {
      toast.error("No se pudieron cargar las deudas pendientes");
      return;
    }
    const d = (data as any) ?? {};
    setTargets([
      ...((d.subscriptions ?? []) as any[]).map((s) => ({
        key: `suscripcion:${s.id}`, type: "suscripcion" as const, id: s.id,
        label: s.label, currency: s.currency, amount: Number(s.total) || 0, icon: "📅",
      })),
      ...((d.reservations ?? []) as any[]).map((r) => ({
        key: `reservation:${r.id}`, type: "reservation" as const, id: r.id,
        label: r.label, currency: r.currency, amount: Number(r.balance) || 0, icon: "🎟️",
      })),
      ...((d.cargos ?? []) as any[]).map((c) => ({
        key: `cargo:${c.id}`, type: "cargo" as const, id: c.id,
        label: c.label, currency: c.currency, amount: Number(c.balance) || 0, icon: "🧾",
      })),
    ]);
  };

  const target = useMemo(() => targets.find((t) => t.key === targetKey) || null, [targets, targetKey]);

  useEffect(() => {
    if (target && selected) {
      setMonto(String(Math.min(Number(selected.disponible), target.amount)));
    }
  }, [target, selected]);

  const apply = async () => {
    if (!selected || !target) return;
    const m = Number(monto);
    if (!m || m <= 0) {
      toast.error("Ingresá un importe válido");
      return;
    }
    if (m > Number(selected.disponible) + 0.01) {
      toast.error("El importe supera el saldo disponible del pago");
      return;
    }
    setSaving(true);
    const { error } = await sb.rpc("aplicar_saldo_disponible", {
      _pago_origen_tipo: selected.pago_origen_tipo,
      _pago_origen_id: selected.pago_origen_id,
      _obligacion_tipo: target.type,
      _obligacion_id: target.id,
      _monto: m,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message || "No se pudo aplicar el saldo");
      return;
    }
    toast.success(`Se aplicaron ${formatPrice(m, selected.moneda)} a ${target.label}`);
    setSelected(null);
    await fetchPagos();
    onChanged?.();
  };

  if (loading || pagos.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Wallet className="h-4 w-4 text-emerald-400" />
        <h4 className="text-sm font-heading font-semibold uppercase tracking-wider">Saldo disponible</h4>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {pagos.map((p) => (
          <Card key={`${p.pago_origen_tipo}:${p.pago_origen_id}`} className="p-3 border-emerald-500/30 bg-emerald-500/5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-xs text-muted-foreground truncate">
                  {p.concepto}
                  {p.mp_payment_id ? ` · op ${p.mp_payment_id}` : ""}
                </div>
                <div className="text-xl font-heading font-bold text-emerald-400">
                  {formatPrice(Number(p.disponible), p.moneda)}
                </div>
                {Number(p.monto_imputado) > 0 && (
                  <Badge variant="outline" className="mt-1 text-[10px]">
                    de {formatPrice(Number(p.monto_bruto), p.moneda)} · aplicado{" "}
                    {formatPrice(Number(p.monto_imputado), p.moneda)}
                  </Badge>
                )}
              </div>
              <Button size="sm" variant="outline" onClick={() => openApply(p)}>
                Aplicar a deuda
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Aplicar saldo disponible</DialogTitle>
            <DialogDescription>
              {selected
                ? `${selected.concepto} · disponible ${formatPrice(Number(selected.disponible), selected.moneda)}`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Deuda a saldar</Label>
              {targets.length === 0 ? (
                <p className="text-sm text-muted-foreground">Este alumno no tiene deudas pendientes.</p>
              ) : (
                <Select value={targetKey} onValueChange={setTargetKey}>
                  <SelectTrigger>
                    <SelectValue placeholder="Elegí la deuda" />
                  </SelectTrigger>
                  <SelectContent>
                    {targets.map((t) => (
                      <SelectItem key={t.key} value={t.key}>
                        {t.icon} {t.label} · {formatPrice(t.amount, t.currency)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            {target && selected && (
              <>
                <div className="space-y-1">
                  <Label className="text-xs">Monto a aplicar</Label>
                  <Input
                    type="number"
                    value={monto}
                    onChange={(e) => setMonto(e.target.value)}
                    min={0}
                    max={Number(selected.disponible)}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Podés aplicar una parte. Queda disponible{" "}
                    {formatPrice(Math.max(0, Number(selected.disponible) - (Number(monto) || 0)), selected.moneda)}.
                  </p>
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSelected(null)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={apply} disabled={saving || !target}>
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Aplicar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default SaldoDisponibleSection;
