import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { TrendingUp, TrendingDown, RefreshCw, Plus, Trash2, Wallet } from "lucide-react";
import { formatPrice, MONEDAS } from "@/lib/currency";
import { GASTO_PAYMENT_METHODS, formatGastoPaymentMethod } from "@/lib/gastoPaymentMethods";
import { formatPnl, pnlColor, type EventPnL } from "@/lib/mpFees";

interface GastoRow {
  id: string;
  fecha: string;
  descripcion: string | null;
  categoria: string | null;
  proveedor: string | null;
  monto: number;
  moneda: string;
  forma_pago: string | null;
}

const CATEGORIAS = ["Logística", "Alojamiento", "Comidas", "Transporte", "Premios", "Marketing", "Staff", "Otros"];

export function EventFinancePanel({ eventId, eventTitle }: { eventId: string; eventTitle?: string }) {
  const [pnl, setPnl] = useState<EventPnL | null>(null);
  const [gastos, setGastos] = useState<GastoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    fecha: new Date().toISOString().slice(0, 10),
    descripcion: "",
    categoria: "Otros",
    proveedor: "",
    monto: "",
    moneda: "ARS",
    forma_pago: "efectivo",
    notas: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    const [pnlRes, gastosRes] = await Promise.all([
      supabase.rpc("get_event_pnl", { p_event_id: eventId }),
      supabase
        .from("gastos")
        .select("id, fecha, descripcion, categoria, proveedor, monto, moneda, forma_pago")
        .eq("event_id", eventId)
        .order("fecha", { ascending: false }),
    ]);
    if (pnlRes.data && Array.isArray(pnlRes.data) && pnlRes.data[0]) {
      setPnl(pnlRes.data[0] as EventPnL);
    }
    setGastos((gastosRes.data as GastoRow[]) || []);
    setLoading(false);
  }, [eventId]);

  useEffect(() => { load(); }, [load]);

  const syncFees = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("backfill-mp-fees", {
        body: { days: 90, batch: 30, source: "reservas" },
      });
      if (error) throw error;
      const r = (data as any)?.results;
      toast({
        title: "Comisiones MP sincronizadas",
        description: `Reservas: ${r?.reservas ?? 0} · Errores: ${r?.errores?.length ?? 0}`,
      });
      await load();
    } catch (e) {
      toast({ variant: "destructive", title: "Error al sincronizar", description: String((e as Error).message) });
    } finally {
      setSyncing(false);
    }
  };

  const addGasto = async () => {
    const monto = Number(form.monto);
    if (!monto || monto <= 0) {
      toast({ variant: "destructive", title: "Monto inválido" });
      return;
    }
    if (!form.descripcion.trim()) {
      toast({ variant: "destructive", title: "Poné una descripción" });
      return;
    }
    setSaving(true);
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase.from("gastos").insert({
      event_id: eventId,
      fecha: form.fecha,
      descripcion: form.descripcion.trim(),
      categoria: form.categoria,
      proveedor: form.proveedor.trim() || null,
      monto,
      moneda: form.moneda,
      forma_pago: form.forma_pago,
      notas: form.notas.trim() || null,
      registrado_por: userData.user?.id,
      origen_registro: "manual",
      estado_conciliacion: "conciliado",
    });
    setSaving(false);
    if (error) {
      toast({ variant: "destructive", title: "Error al guardar", description: error.message });
      return;
    }
    toast({ title: "Gasto registrado" });
    setNewOpen(false);
    setForm({ ...form, descripcion: "", proveedor: "", monto: "", notas: "" });
    await load();
  };

  const deleteGasto = async (id: string) => {
    if (!confirm("¿Eliminar este gasto?")) return;
    const { error } = await supabase.from("gastos").delete().eq("id", id);
    if (error) {
      toast({ variant: "destructive", title: "Error", description: error.message });
      return;
    }
    toast({ title: "Gasto eliminado" });
    await load();
  };

  const moneda = pnl?.moneda || "ARS";

  return (
    <Card className="glass-card">
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <Wallet className="w-4 h-4" /> Finanzas del evento
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Ingresos netos (descontando comisión MP) menos gastos y honorarios.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={syncFees} disabled={syncing}>
          <RefreshCw className={`w-4 h-4 mr-1 ${syncing ? "animate-spin" : ""}`} />
          Sincronizar comisiones MP
        </Button>
      </CardHeader>

      <CardContent className="space-y-6">
        {loading ? (
          <div className="text-sm text-muted-foreground animate-pulse">Cargando...</div>
        ) : pnl ? (
          <>
            {/* P&L breakdown */}
            <div className="rounded-lg border border-border bg-secondary/20 divide-y divide-border">
              <PnlRow label="Ingresos brutos" value={pnl.ingresos_brutos} moneda={moneda} />
              <PnlRow label="− Comisión MP + IIBB" value={-pnl.comision_mp_total} moneda={moneda} muted />
              <PnlRow label="= Ingresos netos" value={pnl.ingresos_netos} moneda={moneda} strong />
              <PnlRow label="− Gastos directos" value={-pnl.gastos_directos} moneda={moneda} muted />
              <PnlRow label="− Honorarios coaches" value={-pnl.honorarios_coaches} moneda={moneda} muted />
              <div className="flex items-center justify-between px-4 py-3 bg-secondary/40">
                <span className="text-sm font-semibold">Resultado del evento</span>
                <span className={`text-lg font-bold flex items-center gap-1 ${pnlColor(pnl.resultado)}`}>
                  {pnl.resultado > 0 ? <TrendingUp className="w-4 h-4" /> : pnl.resultado < 0 ? <TrendingDown className="w-4 h-4" /> : null}
                  {formatPnl(pnl.resultado, moneda)}
                </span>
              </div>
            </div>

            {pnl.pagos_sin_fees > 0 && (
              <p className="text-xs text-amber-400">
                ⚠️ Hay {pnl.pagos_sin_fees} pago{pnl.pagos_sin_fees === 1 ? "" : "s"} de MP sin comisión cargada.
                Hacé clic en "Sincronizar comisiones MP" para calcular el neto real.
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Sin datos.</p>
        )}

        {/* Gastos del evento */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold">Gastos asociados ({gastos.length})</h4>
            <Dialog open={newOpen} onOpenChange={setNewOpen}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="w-4 h-4 mr-1" /> Registrar gasto</Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Registrar gasto {eventTitle ? `— ${eventTitle}` : ""}</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Fecha</Label>
                      <Input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
                    </div>
                    <div>
                      <Label>Categoría</Label>
                      <Select value={form.categoria} onValueChange={(v) => setForm({ ...form, categoria: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {CATEGORIAS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div>
                    <Label>Descripción</Label>
                    <Input value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} placeholder="Ej: Alquiler minibus" />
                  </div>
                  <div>
                    <Label>Proveedor (opcional)</Label>
                    <Input value={form.proveedor} onChange={(e) => setForm({ ...form, proveedor: e.target.value })} />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label>Monto</Label>
                      <Input type="number" step="0.01" value={form.monto} onChange={(e) => setForm({ ...form, monto: e.target.value })} />
                    </div>
                    <div>
                      <Label>Moneda</Label>
                      <Select value={form.moneda} onValueChange={(v) => setForm({ ...form, moneda: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {MONEDAS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Forma de pago</Label>
                      <Select value={form.forma_pago} onValueChange={(v) => setForm({ ...form, forma_pago: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {GASTO_PAYMENT_METHODS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div>
                    <Label>Notas (opcional)</Label>
                    <Textarea value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} rows={2} />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setNewOpen(false)}>Cancelar</Button>
                  <Button onClick={addGasto} disabled={saving}>{saving ? "Guardando..." : "Registrar gasto"}</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {gastos.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4 border border-dashed border-border rounded">
              Sin gastos asociados. Registrá el primero con "Registrar gasto".
            </p>
          ) : (
            <div className="space-y-2">
              {gastos.map((g) => (
                <div key={g.id} className="flex items-center justify-between p-3 bg-secondary/20 rounded border border-border text-sm">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">{g.categoria || "—"}</Badge>
                      <span className="font-medium truncate">{g.descripcion || "(sin descripción)"}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {g.fecha} · {formatGastoPaymentMethod(g.forma_pago)} {g.proveedor ? `· ${g.proveedor}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-semibold">{formatPrice(Number(g.monto), g.moneda || "ARS")}</span>
                    <Button variant="ghost" size="sm" onClick={() => deleteGasto(g.id)} className="text-red-400 hover:text-red-500">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function PnlRow({ label, value, moneda, muted, strong }: { label: string; value: number; moneda: string; muted?: boolean; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <span className={`text-sm ${strong ? "font-semibold" : muted ? "text-muted-foreground" : ""}`}>{label}</span>
      <span className={`text-sm ${strong ? "font-semibold" : ""} ${value < 0 ? "text-red-400" : ""}`}>
        {formatPrice(Math.abs(value), moneda)}
      </span>
    </div>
  );
}
