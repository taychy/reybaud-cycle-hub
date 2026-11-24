import { useCallback, useEffect, useState } from "react";
import { Loader2, CalendarClock } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatPrice } from "@/lib/currency";
import { rpcErrorMessage } from "@/lib/edgeErrors";
import { TURNERA_LABEL } from "@/lib/turneraPayment";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface TurneraDebt { id: string; label: string; currency: string; amount: number }
interface MpOption { id: string; mp_payment_id: string; amount: number; currency: string; fecha_movimiento: string | null }

const rpc = supabase.rpc as unknown as (fn: string, args: Record<string, unknown>) => Promise<{ data: any; error: any }>;
const METODOS = [
  { value: "transferencia", label: "Transferencia" },
  { value: "efectivo", label: "Efectivo" },
  { value: "otro", label: "Otro" },
];

/** Deudas de clases eventuales: se cobran en la reserva concreta, sin crear ni activar mensualidades. */
export function TurneraDebtsCard({ alumnoId, onChanged }: { alumnoId: string; onChanged?: () => void }) {
  const [debts, setDebts] = useState<TurneraDebt[]>([]);
  const [unavailable, setUnavailable] = useState(false);
  const [target, setTarget] = useState<TurneraDebt | null>(null);
  const [mpOptions, setMpOptions] = useState<MpOption[]>([]);
  const [mpId, setMpId] = useState<string>("");
  const [metodo, setMetodo] = useState("transferencia");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await rpc("get_alumno_turnera_debts", { _alumno_id: alumnoId });
    if (error) { setUnavailable(true); setDebts([]); return; }
    setUnavailable(false);
    setDebts(((data ?? []) as any[]).map((d) => ({ id: d.id, label: d.label, currency: d.currency, amount: Number(d.amount) || 0 })));
  }, [alumnoId]);

  useEffect(() => { void load(); }, [load]);

  const openFor = async (d: TurneraDebt) => {
    setTarget(d); setMpId(""); setMetodo("transferencia"); setMpOptions([]);
    // Solo cobros MP emitidos para ESTA reserva y sin vínculo previo.
    const { data } = await supabase.from("mp_account_movements")
      .select("id, mp_payment_id, amount, currency, fecha_movimiento")
      .eq("external_reference", `turnera:${d.id}`)
      .is("suscripcion_id", null).is("reservation_payment_id", null);
    setMpOptions(((data ?? []) as any[]).map((m) => ({ ...m, amount: Number(m.amount) || 0 })));
  };

  const save = async () => {
    if (!target || saving) return;
    setSaving(true);
    const { data, error } = await rpc("admin_register_turnera_payment", {
      _reserva_id: target.id, _monto: target.amount, _moneda: target.currency,
      _metodo: mpId ? "mercadopago" : metodo, _mp_movement_id: mpId || null, _alumno_id: alumnoId,
    });
    setSaving(false);
    if (error) { toast.error(rpcErrorMessage(error, "No se pudo registrar el pago. No se modificó nada.")); return; }
    toast.success(data?.duplicate ? "Ese pago ya estaba registrado en esta clase" : "Pago registrado en la clase");
    setTarget(null);
    await load();
    onChanged?.();
  };

  if (unavailable) {
    return (
      <Card className="p-3 text-xs text-muted-foreground">
        {TURNERA_LABEL}: el cobro por reserva todavía no está habilitado. Registrá estas clases sin crear mensualidades.
      </Card>
    );
  }
  if (debts.length === 0) return null;

  return (
    <Card className="p-4 space-y-2">
      <div className="flex items-center gap-2">
        <CalendarClock className="h-4 w-4 text-primary" />
        <h4 className="text-sm font-semibold">{TURNERA_LABEL} · pendientes</h4>
      </div>
      <p className="text-xs text-muted-foreground">Cada clase se cobra por separado, aunque sean del mismo mes. No genera mensualidad.</p>
      {debts.map((d) => (
        <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2">
          <div className="min-w-0">
            <div className="text-sm">{d.label}</div>
            <Badge variant="outline" className="mt-1">{formatPrice(d.amount, d.currency)}</Badge>
          </div>
          <Button size="sm" variant="outline" onClick={() => void openFor(d)}>Registrar pago</Button>
        </div>
      ))}

      <Dialog open={!!target} onOpenChange={(o) => !saving && !o && setTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar pago de la clase</DialogTitle>
            <DialogDescription>{target?.label} · {target && formatPrice(target.amount, target.currency)}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            {mpOptions.length > 0 && (
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Cobro de Mercado Pago de esta clase</div>
                {mpOptions.map((m) => (
                  <label key={m.id} className="flex items-center gap-2">
                    <input type="radio" name="mp" checked={mpId === m.id} onChange={() => setMpId(m.id)} />
                    Operación {m.mp_payment_id} · {formatPrice(m.amount, m.currency)}
                  </label>
                ))}
                <label className="flex items-center gap-2">
                  <input type="radio" name="mp" checked={mpId === ""} onChange={() => setMpId("")} /> Pago manual
                </label>
              </div>
            )}
            {!mpId && (
              <select className="w-full rounded-md border bg-background p-2" value={metodo} onChange={(e) => setMetodo(e.target.value)}>
                {METODOS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            )}
            <p className="text-xs text-muted-foreground">Se registra una sola vez en esta reserva. Si ya figura pagada o el cobro está usado en otra deuda, no se guarda nada.</p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTarget(null)} disabled={saving}>Cancelar</Button>
            <Button onClick={() => void save()} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Confirmar pago
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export default TurneraDebtsCard;
