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
import { TrendingUp, TrendingDown, RefreshCw, Plus, Trash2, Wallet, Link2, AlertTriangle } from "lucide-react";
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

interface MpViajesRow {
  movement_id: string;
  mp_payment_id: string;
  amount: number;
  currency: string;
  description: string | null;
  external_reference: string | null;
  fecha_movimiento: string;
  cuenta_mp_id: string;
  cuenta_nombre: string;
  gasto_id: string | null;
  gasto_event_id: string | null;
  estado_asociacion: "pendiente" | "gasto_sin_evento" | "asociado_evento" | "otro_evento";
}

const CATEGORIAS = ["Logística", "Alojamiento", "Comidas", "Transporte", "Premios", "Marketing", "Staff", "Otros"];

export function EventFinancePanel({ eventId, eventTitle }: { eventId: string; eventTitle?: string }) {
  const [pnl, setPnl] = useState<EventPnL | null>(null);
  const [gastos, setGastos] = useState<GastoRow[]>([]);
  const [mpViajes, setMpViajes] = useState<MpViajesRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncingOutflows, setSyncingOutflows] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mpDialog, setMpDialog] = useState<MpViajesRow | null>(null);
  const [mpSaving, setMpSaving] = useState(false);
  const [mpForm, setMpForm] = useState({
    categoria: "Otros",
    descripcion: "",
    proveedor: "",
    notas: "",
  });
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
    const [pnlRes, gastosRes, mpRes] = await Promise.all([
      supabase.rpc("get_event_pnl", { p_event_id: eventId }),
      supabase
        .from("gastos")
        .select("id, fecha, descripcion, categoria, proveedor, monto, moneda, forma_pago")
        .eq("event_id", eventId)
        .order("fecha", { ascending: false }),
      supabase.rpc("get_event_mp_viajes_outflows" as any, { p_event_id: eventId }),
    ]);
    if (pnlRes.data && Array.isArray(pnlRes.data) && pnlRes.data[0]) {
      setPnl(pnlRes.data[0] as EventPnL);
    }
    setGastos((gastosRes.data as GastoRow[]) || []);
    if (!mpRes.error) setMpViajes(((mpRes.data as any[]) || []) as MpViajesRow[]);
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

  const syncViajesOutflows = async () => {
    setSyncingOutflows(true);
    try {
      const { data: accountId, error: accountErr } = await supabase.rpc("get_viajes_mp_account_id" as any);
      if (accountErr) throw accountErr;
      if (!accountId) throw new Error("No está configurada la cuenta MP de Viajes/Eventos.");

      const { error } = await supabase.functions.invoke("sync-mp-account-movements", {
        body: { days: 90, cuenta_id: accountId },
      });
      if (error) throw error;

      await load();
      toast({
        title: "Salidas MP Viajes sincronizadas",
        description: "Los movimientos nuevos quedaron disponibles para asociarlos al evento.",
      });
    } catch (e) {
      toast({
        variant: "destructive",
        title: "No se pudieron sincronizar las salidas",
        description: String((e as Error).message),
      });
    } finally {
      setSyncingOutflows(false);
    }
  };

  const openMpDialog = (m: MpViajesRow) => {
    setMpDialog(m);
    setMpForm({
      categoria: "Otros",
      descripcion: m.description?.trim() || `Egreso MP Viajes ${m.mp_payment_id}`,
      proveedor: "",
      notas: m.external_reference ? `Ref. MP: ${m.external_reference}` : "",
    });
  };

  const associateMpOutflow = async () => {
    if (!mpDialog) return;
    if (!mpForm.descripcion.trim()) {
      toast({ variant: "destructive", title: "Poné una descripción" });
      return;
    }
    setMpSaving(true);
    try {
      const { error } = await supabase.rpc("link_mp_viajes_outflow_to_event" as any, {
        p_movement_id: mpDialog.movement_id,
        p_event_id: eventId,
        p_categoria: mpForm.categoria,
        p_descripcion: mpForm.descripcion.trim(),
        p_proveedor: mpForm.proveedor.trim() || null,
        p_notas: mpForm.notas.trim() || null,
      });
      if (error) throw error;
      toast({ title: "Salida MP asociada al evento" });
      setMpDialog(null);
      await load();
    } catch (e) {
      toast({
        variant: "destructive",
        title: "No se pudo asociar",
        description: String((e as Error).message),
      });
    } finally {
      setMpSaving(false);
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
  const mpPendientes = mpViajes.filter((m) => m.estado_asociacion === "pendiente" || m.estado_asociacion === "gasto_sin_evento");
  const mpAsociados = mpViajes.filter((m) => m.estado_asociacion === "asociado_evento");

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
        <div className="flex flex-wrap gap-2 justify-end">
          <Button variant="outline" size="sm" onClick={syncViajesOutflows} disabled={syncingOutflows}>
            <RefreshCw className={`w-4 h-4 mr-1 ${syncingOutflows ? "animate-spin" : ""}`} />
            Sincronizar salidas MP Viajes
          </Button>
          <Button variant="outline" size="sm" onClick={syncFees} disabled={syncing}>
            <RefreshCw className={`w-4 h-4 mr-1 ${syncing ? "animate-spin" : ""}`} />
            Sincronizar comisiones MP
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {loading ? (
          <div className="text-sm text-muted-foreground animate-pulse">Cargando...</div>
        ) : pnl ? (
          <>
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

        <div className="space-y-3 rounded-lg border border-border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <Link2 className="w-4 h-4" /> Salidas de MP Viajes
              </h4>
              <p className="text-xs text-muted-foreground mt-0.5">
                Se sincronizan desde la cuenta MP de Viajes/Eventos. No se descuentan del resultado hasta que las asocies a este evento.
              </p>
            </div>
            <div className="flex gap-2">
              <Badge variant={mpPendientes.length > 0 ? "destructive" : "secondary"}>
                {mpPendientes.length} sin asociar
              </Badge>
              <Badge variant="outline">{mpAsociados.length} asociadas</Badge>
            </div>
          </div>

          {mpPendientes.length === 0 ? (
            <div className="text-xs text-muted-foreground py-2">
              No hay salidas MP Viajes pendientes de asociar en el período de este evento.
            </div>
          ) : (
            <div className="space-y-2">
              {mpPendientes.map((m) => (
                <div key={m.movement_id} className="flex flex-col sm:flex-row sm:items-center gap-3 rounded border border-amber-500/25 bg-amber-500/5 p-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-[10px]">{m.cuenta_nombre}</Badge>
                      {m.estado_asociacion === "gasto_sin_evento" && (
                        <Badge className="bg-cyan-500/15 text-cyan-300 border-cyan-500/30 text-[10px]">
                          Ya categorizado · falta evento
                        </Badge>
                      )}
                      <span className="text-sm font-medium truncate">{m.description || "Movimiento MP sin descripción"}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {new Date(m.fecha_movimiento).toLocaleString("es-AR")} · MP {m.mp_payment_id}
                      {m.external_reference ? ` · ref ${m.external_reference}` : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-semibold text-orange-400">− {formatPrice(Number(m.amount), m.currency || "ARS")}</span>
                    <Button size="sm" onClick={() => openMpDialog(m)}>Asociar al evento</Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {mpPendientes.length > 0 && (
            <div className="text-[11px] text-muted-foreground flex gap-1.5 items-start">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              No asociamos automáticamente todas las salidas: una misma cuenta MP puede contener impuestos, transferencias o pagos de otros viajes. La asociación explícita evita cargar costos al evento equivocado.
            </div>
          )}
        </div>

        <Dialog open={!!mpDialog} onOpenChange={(open) => !open && setMpDialog(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Asociar salida MP a {eventTitle || "este evento"}</DialogTitle>
            </DialogHeader>
            {mpDialog && (
              <div className="space-y-3">
                <div className="rounded border bg-secondary/20 p-3 text-sm">
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">Monto</span>
                    <span className="font-semibold">{formatPrice(Number(mpDialog.amount), mpDialog.currency || "ARS")}</span>
                  </div>
                  <div className="flex justify-between gap-3 mt-1">
                    <span className="text-muted-foreground">Fecha</span>
                    <span>{new Date(mpDialog.fecha_movimiento).toLocaleString("es-AR")}</span>
                  </div>
                  <div className="flex justify-between gap-3 mt-1">
                    <span className="text-muted-foreground">MP ID</span>
                    <span className="font-mono text-xs">{mpDialog.mp_payment_id}</span>
                  </div>
                </div>
                <div>
                  <Label>Categoría</Label>
                  <Select value={mpForm.categoria} onValueChange={(v) => setMpForm({ ...mpForm, categoria: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIAS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Descripción</Label>
                  <Input value={mpForm.descripcion} onChange={(e) => setMpForm({ ...mpForm, descripcion: e.target.value })} />
                </div>
                <div>
                  <Label>Proveedor (opcional)</Label>
                  <Input value={mpForm.proveedor} onChange={(e) => setMpForm({ ...mpForm, proveedor: e.target.value })} />
                </div>
                <div>
                  <Label>Notas (opcional)</Label>
                  <Textarea value={mpForm.notas} onChange={(e) => setMpForm({ ...mpForm, notas: e.target.value })} rows={2} />
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setMpDialog(null)}>Cancelar</Button>
              <Button onClick={associateMpOutflow} disabled={mpSaving}>
                {mpSaving ? "Asociando..." : "Asociar y descontar del evento"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

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
