import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, GraduationCap, Plane, ShoppingBag, Wallet, Lock, Unlock, RefreshCw, ChevronDown, ChevronUp, Landmark, AlertTriangle, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { formatPrice } from "@/lib/currency";

type Unidad = "escuela" | "viajes" | "tienda";

interface Totales {
  escuela: number; viajes: number; tienda: number;
  escuela_count: number; viajes_count: number; tienda_count: number;
}
interface DetalleRow {
  ref_id: string; alumno_nombre: string; monto: number; moneda: string; hora: string; descripcion: string;
}
interface Cierre {
  id: string;
  fecha: string;
  efectivo_escuela_sistema: number;
  efectivo_viajes_sistema: number;
  efectivo_tienda_sistema: number;
  efectivo_escuela_contado: number | null;
  efectivo_viajes_contado: number | null;
  efectivo_tienda_contado: number | null;
  diferencia_escuela: number | null;
  diferencia_viajes: number | null;
  diferencia_tienda: number | null;
  diferencia_total: number | null;
  notas: string | null;
  estado: string;
  cerrado_at: string | null;
}

interface Conciliacion {
  mp_app_total: number; mp_app_count: number;
  mp_banco_total: number; mp_banco_count: number;
  transfer_app_total: number; transfer_app_count: number;
  huerfanos_count: number; huerfanos_monto: number;
  egresos_app_total?: number; egresos_app_count?: number;
  egresos_banco_total?: number; egresos_banco_count?: number;
}
interface ConciliacionCuenta {
  cuenta_id: string | null;
  cuenta_nombre: string;
  mp_app_total: number; mp_app_count: number;
  mp_banco_total: number; mp_banco_count: number;
  egresos_app_total: number; egresos_app_count: number;
  egresos_banco_total: number; egresos_banco_count: number;
  diferencia: number;
}

interface CashBoxBalance {
  baseline_date: string | null;
  baseline_amount: number;
  ingresos: number;
  egresos: number;
  expected_amount: number;
  movements_count: number;
  review_count: number;
  review_amount: number;
  other_currencies: Record<string, { ingresos: number; egresos: number; neto: number; movimientos: number }>;
}

interface CashBoxMovement {
  movement_date: string;
  occurred_at: string;
  direction: "baseline" | "ingreso" | "egreso";
  unit: string;
  origin: string;
  ref_id: string | null;
  description: string;
  person: string | null;
  amount: number;
  currency: string;
  needs_review: boolean;
  note: string | null;
}

const todayStr = () => format(new Date(), "yyyy-MM-dd");

export default function AdminCierreCaja() {
  const [fecha, setFecha] = useState(todayStr());
  const [totales, setTotales] = useState<Totales | null>(null);
  const [conc, setConc] = useState<Conciliacion | null>(null);
  const [concCuentas, setConcCuentas] = useState<ConciliacionCuenta[]>([]);
  const [cierre, setCierre] = useState<Cierre | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [contado, setContado] = useState<Record<Unidad, string>>({ escuela: "", viajes: "", tienda: "" });
  const [notas, setNotas] = useState("");
  const [expanded, setExpanded] = useState<Record<Unidad, boolean>>({ escuela: false, viajes: false, tienda: false });
  const [detalles, setDetalles] = useState<Record<Unidad, DetalleRow[]>>({ escuela: [], viajes: [], tienda: [] });
  const [historial, setHistorial] = useState<Cierre[]>([]);
  const [cashBox, setCashBox] = useState<CashBoxBalance | null>(null);
  const [cashMovements, setCashMovements] = useState<CashBoxMovement[]>([]);
  const [cashExpanded, setCashExpanded] = useState(false);
  const [showMovementForm, setShowMovementForm] = useState(false);
  const [savingMovement, setSavingMovement] = useState(false);
  const [movementForm, setMovementForm] = useState({
    direction: "egreso",
    unit: "general",
    amount: "",
    currency: "ARS",
    description: "",
    notes: "",
  });

  const cerrado = cierre?.estado === "cerrado";

  async function loadAll() {
    setLoading(true);
    try {
      const [tRes, kRes, kcRes, cRes, hRes, cashRes, cashMovRes] = await Promise.all([
        supabase.rpc("get_efectivo_del_dia", { p_fecha: fecha }),
        supabase.rpc("get_conciliacion_del_dia", { p_fecha: fecha }),
        supabase.rpc("get_conciliacion_por_cuenta_del_dia" as any, { p_fecha: fecha }),
        supabase.from("cierres_caja_diarios").select("*").eq("fecha", fecha).maybeSingle(),
        supabase.from("cierres_caja_diarios").select("*").order("fecha", { ascending: false }).limit(30),
        supabase.rpc("get_cash_box_balance" as any, { p_hasta: todayStr() }),
        supabase.rpc("get_cash_box_movements" as any, { p_hasta: todayStr() }),
      ]);
      if (tRes.error) throw tRes.error;
      const t = (tRes.data as any)?.[0] || tRes.data;
      setTotales(t || { escuela: 0, viajes: 0, tienda: 0, escuela_count: 0, viajes_count: 0, tienda_count: 0 });
      if (kRes.error) throw kRes.error;
      const k = (kRes.data as any)?.[0] || kRes.data;
      setConc(k || null);
      if (!kcRes.error) setConcCuentas(((kcRes.data as any) || []) as ConciliacionCuenta[]);

      if (cRes.error && cRes.error.code !== "PGRST116") throw cRes.error;
      const c = cRes.data as Cierre | null;
      setCierre(c);
      setContado({
        escuela: c?.efectivo_escuela_contado != null ? String(c.efectivo_escuela_contado) : "",
        viajes: c?.efectivo_viajes_contado != null ? String(c.efectivo_viajes_contado) : "",
        tienda: c?.efectivo_tienda_contado != null ? String(c.efectivo_tienda_contado) : "",
      });
      setNotas(c?.notas || "");

      if (hRes.data) setHistorial(hRes.data as Cierre[]);
      if (!cashRes.error) {
        const cb = (cashRes.data as any)?.[0] || cashRes.data;
        setCashBox(cb || null);
      }
      if (!cashMovRes.error) setCashMovements(((cashMovRes.data as any) || []) as CashBoxMovement[]);
    } catch (e: any) {
      toast.error("Error al cargar", { description: e.message });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadAll(); }, [fecha]);

  async function toggleDetalle(u: Unidad) {
    const willOpen = !expanded[u];
    setExpanded((p) => ({ ...p, [u]: willOpen }));
    if (willOpen && detalles[u].length === 0) {
      const { data, error } = await supabase.rpc("get_efectivo_detalle_del_dia", { p_fecha: fecha, p_unidad: u });
      if (error) { toast.error("Error detalle", { description: error.message }); return; }
      setDetalles((p) => ({ ...p, [u]: (data as any) || [] }));
    }
  }

  const totalSistema = (totales?.escuela ?? 0) + (totales?.viajes ?? 0) + (totales?.tienda ?? 0);
  const totalContado = (Number(contado.escuela) || 0) + (Number(contado.viajes) || 0) + (Number(contado.tienda) || 0);
  const diferenciaTotal = totalContado - totalSistema;

  const diffEscuela = contado.escuela === "" ? null : Number(contado.escuela) - (totales?.escuela ?? 0);
  const diffViajes = contado.viajes === "" ? null : Number(contado.viajes) - (totales?.viajes ?? 0);
  const diffTienda = contado.tienda === "" ? null : Number(contado.tienda) - (totales?.tienda ?? 0);

  async function guardar(cerrar: boolean) {
    if (!totales) return;
    setSaving(true);
    try {
      const payload: any = {
        fecha,
        efectivo_escuela_sistema: totales.escuela,
        efectivo_viajes_sistema: totales.viajes,
        efectivo_tienda_sistema: totales.tienda,
        efectivo_escuela_contado: contado.escuela === "" ? null : Number(contado.escuela),
        efectivo_viajes_contado: contado.viajes === "" ? null : Number(contado.viajes),
        efectivo_tienda_contado: contado.tienda === "" ? null : Number(contado.tienda),
        diferencia_escuela: diffEscuela,
        diferencia_viajes: diffViajes,
        diferencia_tienda: diffTienda,
        diferencia_total: (diffEscuela ?? 0) + (diffViajes ?? 0) + (diffTienda ?? 0),
        mp_app_total: conc?.mp_app_total ?? null,
        mp_banco_total: conc?.mp_banco_total ?? null,
        transfer_app_total: conc?.transfer_app_total ?? null,
        huerfanos_count: conc?.huerfanos_count ?? null,
        huerfanos_monto: conc?.huerfanos_monto ?? null,
        notas: notas || null,
      };
      if (cerrar) {
        const { data: u } = await supabase.auth.getUser();
        payload.estado = "cerrado";
        payload.cerrado_at = new Date().toISOString();
        payload.cerrado_por = u.user?.id;
      }
      const { error } = await supabase
        .from("cierres_caja_diarios")
        .upsert(payload, { onConflict: "fecha" });
      if (error) throw error;
      toast.success(cerrar ? "Caja cerrada" : "Guardado");
      loadAll();
    } catch (e: any) {
      toast.error("Error al guardar", { description: e.message });
    } finally {
      setSaving(false);
    }
  }

  async function reabrir() {
    if (!cierre) return;
    if (!confirm("¿Reabrir el cierre de este día?")) return;
    const { error } = await supabase
      .from("cierres_caja_diarios")
      .update({ estado: "abierto", cerrado_at: null, cerrado_por: null })
      .eq("id", cierre.id);
    if (error) { toast.error("Error", { description: error.message }); return; }
    toast.success("Cierre reabierto");
    loadAll();
  }

  const unidades: { key: Unidad; label: string; icon: any; sistema: number; count: number; diff: number | null }[] = [
    { key: "escuela", label: "Escuela", icon: GraduationCap, sistema: totales?.escuela ?? 0, count: totales?.escuela_count ?? 0, diff: diffEscuela },
    { key: "viajes", label: "Viajes / Eventos", icon: Plane, sistema: totales?.viajes ?? 0, count: totales?.viajes_count ?? 0, diff: diffViajes },
    { key: "tienda", label: "Tienda", icon: ShoppingBag, sistema: totales?.tienda ?? 0, count: totales?.tienda_count ?? 0, diff: diffTienda },
  ];

  async function registrarMovimientoCaja() {
    const amount = Number(movementForm.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Ingresá un monto válido");
      return;
    }
    if (!movementForm.description.trim()) {
      toast.error("Indicá el concepto del movimiento");
      return;
    }
    setSavingMovement(true);
    try {
      const { error } = await supabase.rpc("register_cash_box_manual_movement" as any, {
        p_direction: movementForm.direction,
        p_unit: movementForm.unit,
        p_amount: amount,
        p_description: movementForm.description.trim(),
        p_notes: movementForm.notes.trim() || null,
        p_occurred_at: new Date().toISOString(),
        p_currency: movementForm.currency,
      });
      if (error) throw error;
      toast.success(movementForm.direction === "egreso" ? "Retiro registrado" : "Ingreso registrado");
      setMovementForm({ direction: "egreso", unit: "general", amount: "", currency: "ARS", description: "", notes: "" });
      setShowMovementForm(false);
      await loadAll();
    } catch (e: any) {
      toast.error("No se pudo registrar el movimiento", { description: e.message });
    } finally {
      setSavingMovement(false);
    }
  }

  async function syncMP() {
    setSyncing(true);
    try {
      const { error } = await supabase.functions.invoke("sync-mp-account-movements", { body: { days: 2 } });
      if (error) throw error;
      toast.success("Sincronización con MP completada");
      loadAll();
    } catch (e: any) {
      toast.error("Error sincronizando", { description: e.message });
    } finally {
      setSyncing(false);
    }
  }

  const mpDiff = (conc?.mp_banco_total ?? 0) - (conc?.mp_app_total ?? 0);

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Wallet className="w-6 h-6" /> Cierre de caja (efectivo)
          </h1>
          <p className="text-sm text-muted-foreground">
            Arqueo del día seleccionado. Sólo cuenta efectivo realmente recibido y validado; no incluye pedidos pendientes de cobro.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="w-auto" />
          <Button variant="outline" size="icon" onClick={loadAll} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          {cerrado ? (
            <Badge variant="secondary" className="gap-1"><Lock className="w-3 h-3" /> Cerrado</Badge>
          ) : (
            <Badge variant="outline" className="gap-1"><Unlock className="w-3 h-3" /> Abierto</Badge>
          )}
        </div>
      </div>

      <Card className="border-primary/30">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Wallet className="w-4 h-4" /> Efectivo esperado en caja ahora
              </CardTitle>
              <div className="text-xs text-muted-foreground mt-1">
                Según el último arqueo físico y todos los ingresos/egresos en efectivo registrados.
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setCashExpanded((v) => !v)}>
                {cashExpanded ? <ChevronUp className="w-3 h-3 mr-1" /> : <ChevronDown className="w-3 h-3 mr-1" />}
                {cashExpanded ? "Ocultar detalle" : "Ver detalle"}
              </Button>
              <Button size="sm" onClick={() => setShowMovementForm((v) => !v)}>
                {showMovementForm ? "Cancelar" : "Registrar movimiento"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">Debería haber</div>
              <div className="font-mono text-2xl font-bold">{formatPrice(cashBox?.expected_amount ?? 0, "ARS")}</div>
              <div className="text-[11px] text-muted-foreground">ARS</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">Último arqueo físico</div>
              <div className="font-mono text-lg font-semibold">{formatPrice(cashBox?.baseline_amount ?? 0, "ARS")}</div>
              <div className="text-[11px] text-muted-foreground">
                {cashBox?.baseline_date ? format(new Date(cashBox.baseline_date + "T12:00:00"), "dd/MM/yyyy") : "Sin cierre previo"}
              </div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">Ingresos desde ese cierre</div>
              <div className="font-mono text-lg font-semibold text-green-600">+{formatPrice(cashBox?.ingresos ?? 0, "ARS")}</div>
              <div className="text-[11px] text-muted-foreground">{cashBox?.movements_count ?? 0} movimientos ARS</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">Egresos desde ese cierre</div>
              <div className="font-mono text-lg font-semibold text-red-600">−{formatPrice(cashBox?.egresos ?? 0, "ARS")}</div>
              <div className="text-[11px] text-muted-foreground">gastos, devoluciones y retiros</div>
            </div>
          </div>

          {(cashBox?.review_count ?? 0) > 0 && (
            <div className="rounded-lg border border-amber-500/50 bg-amber-500/5 p-3 text-sm flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
              <div>
                <div className="font-medium">Hay {cashBox?.review_count} movimiento(s) a revisar por {formatPrice(cashBox?.review_amount ?? 0, "ARS")}</div>
                <div className="text-xs text-muted-foreground">El detalle los marca para que confirmes si realmente correspondieron a efectivo físico.</div>
              </div>
            </div>
          )}

          {cashBox?.other_currencies && Object.keys(cashBox.other_currencies).length > 0 && (
            <div className="rounded-lg border p-3 text-sm">
              <div className="font-medium mb-2">Otras monedas — no se suman al total ARS</div>
              <div className="flex flex-wrap gap-3">
                {Object.entries(cashBox.other_currencies).map(([currency, fx]) => (
                  <div key={currency} className="text-xs">
                    <span className="font-semibold">{currency}</span>: ingresos {formatPrice(Number(fx.ingresos || 0), currency as any)} ·
                    egresos {formatPrice(Number(fx.egresos || 0), currency as any)} ·
                    neto {formatPrice(Number(fx.neto || 0), currency as any)}
                  </div>
                ))}
              </div>
              <div className="text-[11px] text-muted-foreground mt-1">El último arqueo histórico no separaba saldo inicial por moneda extranjera.</div>
            </div>
          )}

          {showMovementForm && (
            <div className="rounded-lg border p-3 space-y-3 bg-muted/20">
              <div className="font-medium text-sm">Registrar movimiento físico de caja</div>
              <div className="grid gap-3 md:grid-cols-4">
                <div>
                  <Label className="text-xs">Tipo</Label>
                  <select
                    className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                    value={movementForm.direction}
                    onChange={(e) => setMovementForm((p) => ({ ...p, direction: e.target.value }))}
                  >
                    <option value="egreso">Retiro / egreso</option>
                    <option value="ingreso">Ingreso manual</option>
                  </select>
                </div>
                <div>
                  <Label className="text-xs">Unidad</Label>
                  <select
                    className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                    value={movementForm.unit}
                    onChange={(e) => setMovementForm((p) => ({ ...p, unit: e.target.value }))}
                  >
                    <option value="general">General</option>
                    <option value="escuela">Escuela</option>
                    <option value="viajes">Viajes / Eventos</option>
                    <option value="tienda">Tienda</option>
                  </select>
                </div>
                <div>
                  <Label className="text-xs">Monto</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={movementForm.amount}
                    onChange={(e) => setMovementForm((p) => ({ ...p, amount: e.target.value }))}
                    placeholder="0"
                  />
                </div>
                <div>
                  <Label className="text-xs">Moneda</Label>
                  <select
                    className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                    value={movementForm.currency}
                    onChange={(e) => setMovementForm((p) => ({ ...p, currency: e.target.value }))}
                  >
                    <option value="ARS">ARS</option>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                  </select>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <Label className="text-xs">Concepto</Label>
                  <Input
                    value={movementForm.description}
                    onChange={(e) => setMovementForm((p) => ({ ...p, description: e.target.value }))}
                    placeholder="Ej.: retiro para pagar proveedor"
                  />
                </div>
                <div>
                  <Label className="text-xs">Nota opcional</Label>
                  <Input
                    value={movementForm.notes}
                    onChange={(e) => setMovementForm((p) => ({ ...p, notes: e.target.value }))}
                    placeholder="Quién retiró, destino, aclaración..."
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <Button onClick={registrarMovimientoCaja} disabled={savingMovement}>
                  {savingMovement && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                  Guardar movimiento
                </Button>
              </div>
            </div>
          )}

          {cashExpanded && (
            <div className="rounded-lg border overflow-hidden">
              <div className="px-3 py-2 bg-muted/30 text-xs font-medium">
                Composición del efectivo esperado
              </div>
              <div className="max-h-[420px] overflow-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-background border-b">
                    <tr>
                      <th className="text-left py-2 px-3">Fecha</th>
                      <th className="text-left px-3">Origen</th>
                      <th className="text-left px-3">Detalle</th>
                      <th className="text-left px-3">Unidad</th>
                      <th className="text-right px-3">Movimiento</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...cashMovements].reverse().map((m, idx) => (
                      <tr key={m.ref_id || `baseline-${idx}`} className={`border-b last:border-0 ${m.needs_review ? "bg-amber-500/5" : ""}`}>
                        <td className="py-2 px-3 whitespace-nowrap">{format(new Date(m.movement_date + "T12:00:00"), "dd/MM/yy")}</td>
                        <td className="px-3 capitalize">{m.origin.replace(/_/g, " ")}</td>
                        <td className="px-3">
                          <div>{m.person ? `${m.person} · ` : ""}{m.description}</div>
                          {m.note && <div className="text-[10px] text-muted-foreground">{m.note}</div>}
                        </td>
                        <td className="px-3 capitalize">{m.unit}</td>
                        <td className={`px-3 text-right font-mono whitespace-nowrap ${m.direction === "ingreso" ? "text-green-600" : m.direction === "egreso" ? "text-red-600" : ""}`}>
                          {m.direction === "ingreso" ? "+" : m.direction === "egreso" ? "−" : ""}
                          {formatPrice(Number(m.amount || 0), m.currency as any)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {loading && !totales ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            {unidades.map(({ key, label, icon: Icon, sistema, count, diff }) => (
              <Card key={key}>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Icon className="w-4 h-4" /> {label}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Efectivo esperado ({count})</span>
                    <span className="font-mono font-semibold">{formatPrice(sistema, "ARS")}</span>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Contado físico</Label>
                    <Input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      placeholder="0"
                      disabled={cerrado}
                      value={contado[key]}
                      onChange={(e) => setContado((p) => ({ ...p, [key]: e.target.value }))}
                      className="font-mono"
                    />
                  </div>
                  <div className="flex justify-between items-center text-sm border-t pt-2">
                    <span className="text-muted-foreground">Diferencia</span>
                    <span className={`font-mono font-semibold ${diff == null ? "text-muted-foreground" : diff === 0 ? "text-green-600" : diff > 0 ? "text-amber-600" : "text-red-600"}`}>
                      {diff == null ? "—" : `${diff > 0 ? "+" : ""}${formatPrice(diff, "ARS")}`}
                    </span>
                  </div>
                  <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => toggleDetalle(key)}>
                    {expanded[key] ? <ChevronUp className="w-3 h-3 mr-1" /> : <ChevronDown className="w-3 h-3 mr-1" />}
                    Ver detalle ({count})
                  </Button>
                  {expanded[key] && (
                    <div className="max-h-56 overflow-auto text-xs border rounded p-2 space-y-1 bg-muted/30">
                      {detalles[key].length === 0 ? (
                        <div className="text-muted-foreground text-center py-2">Sin movimientos</div>
                      ) : (
                        detalles[key].map((r) => (
                          <div key={r.ref_id} className="flex justify-between gap-2 border-b last:border-0 py-1">
                            <div className="flex-1 min-w-0">
                              <div className="truncate">{r.alumno_nombre}</div>
                              <div className="text-muted-foreground truncate">{r.descripcion} · {format(new Date(r.hora), "HH:mm")}</div>
                            </div>
                            <div className="font-mono">{formatPrice(r.monto, r.moneda as any)}</div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">Total del día</CardTitle></CardHeader>
            <CardContent className="grid gap-2 sm:grid-cols-3 text-sm">
              <div>
                <div className="text-muted-foreground">Efectivo esperado hoy</div>
                <div className="font-mono text-lg font-bold">{formatPrice(totalSistema, "ARS")}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Contado</div>
                <div className="font-mono text-lg font-bold">{formatPrice(totalContado, "ARS")}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Diferencia</div>
                <div className={`font-mono text-lg font-bold ${diferenciaTotal === 0 ? "text-green-600" : diferenciaTotal > 0 ? "text-amber-600" : "text-red-600"}`}>
                  {diferenciaTotal > 0 ? "+" : ""}{formatPrice(diferenciaTotal, "ARS")}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Landmark className="w-4 h-4" /> Conciliación bancaria (MP + Transferencias)
              </CardTitle>
              <Button variant="outline" size="sm" onClick={syncMP} disabled={syncing || cerrado}>
                <RefreshCw className={`w-3 h-3 mr-1 ${syncing ? "animate-spin" : ""}`} />
                Sincronizar MP
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">MP registrado en app</div>
                  <div className="font-mono text-lg font-semibold">{formatPrice(conc?.mp_app_total ?? 0, "ARS")}</div>
                  <div className="text-xs text-muted-foreground">{conc?.mp_app_count ?? 0} pagos</div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">MP acreditado (banco)</div>
                  <div className="font-mono text-lg font-semibold">{formatPrice(conc?.mp_banco_total ?? 0, "ARS")}</div>
                  <div className="text-xs text-muted-foreground">{conc?.mp_banco_count ?? 0} movimientos</div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">Diferencia</div>
                  <div className={`font-mono text-lg font-semibold ${Math.abs(mpDiff) < 1 ? "text-green-600" : "text-amber-600"}`}>
                    {mpDiff > 0 ? "+" : ""}{formatPrice(mpDiff, "ARS")}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {Math.abs(mpDiff) < 1 ? "Coincide" : "Revisar"}
                  </div>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">Egresos MP registrados en app</div>
                  <div className="font-mono text-lg font-semibold">{formatPrice(conc?.egresos_app_total ?? 0, "ARS")}</div>
                  <div className="text-xs text-muted-foreground">{conc?.egresos_app_count ?? 0} gastos pagados con MP</div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">Egresos MP vistos en banco</div>
                  <div className="font-mono text-lg font-semibold">{formatPrice(conc?.egresos_banco_total ?? 0, "ARS")}</div>
                  <div className="text-xs text-muted-foreground">{conc?.egresos_banco_count ?? 0} mov. (refunds/retiros)</div>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">Transferencias registradas</div>
                  <div className="font-mono text-lg font-semibold">{formatPrice(conc?.transfer_app_total ?? 0, "ARS")}</div>
                  <div className="text-xs text-muted-foreground">{conc?.transfer_app_count ?? 0} pagos · verificá el ingreso en las cuentas</div>
                </div>
                <div className={`rounded-lg border p-3 ${(conc?.huerfanos_count ?? 0) > 0 ? "border-amber-500 bg-amber-500/5" : ""}`}>
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    {(conc?.huerfanos_count ?? 0) > 0 && <AlertTriangle className="w-3 h-3 text-amber-600" />}
                    Movimientos huérfanos
                  </div>
                  <div className="font-mono text-lg font-semibold">
                    {conc?.huerfanos_count ?? 0} · {formatPrice(conc?.huerfanos_monto ?? 0, "ARS")}
                  </div>
                  {(conc?.huerfanos_count ?? 0) > 0 && (
                    <Link to="/admin/pagos" className="text-xs text-primary hover:underline inline-flex items-center gap-1 mt-1">
                      Asignar en Pagos → Cuentas MP <ExternalLink className="w-3 h-3" />
                    </Link>
                  )}
                </div>
              </div>

              <div className="rounded-lg border">
                <div className="px-3 py-2 border-b bg-muted/30 text-xs font-medium">
                  Desglose por cuenta MP (neto = ingresos − egresos)
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-xs text-muted-foreground border-b">
                      <tr>
                        <th className="text-left py-2 px-3">Cuenta</th>
                        <th className="text-right px-3">Ingresos app</th>
                        <th className="text-right px-3">Ingresos banco</th>
                        <th className="text-right px-3">Egresos app</th>
                        <th className="text-right px-3">Egresos banco</th>
                        <th className="text-right px-3">Diferencia neta</th>
                      </tr>
                    </thead>
                    <tbody>
                      {concCuentas.length === 0 ? (
                        <tr><td colSpan={6} className="text-center py-3 text-muted-foreground text-xs">Sin movimientos MP en el día</td></tr>
                      ) : concCuentas.map((r) => (
                        <tr key={r.cuenta_id ?? "sin"} className="border-b last:border-0">
                          <td className="py-2 px-3">
                            {r.cuenta_nombre}
                            {!r.cuenta_id && <span className="ml-1 text-xs text-amber-600">(huérfano)</span>}
                          </td>
                          <td className="text-right font-mono px-3">
                            {formatPrice(r.mp_app_total, "ARS")}
                            <div className="text-[10px] text-muted-foreground">{r.mp_app_count} pagos</div>
                          </td>
                          <td className="text-right font-mono px-3">
                            {formatPrice(r.mp_banco_total, "ARS")}
                            <div className="text-[10px] text-muted-foreground">{r.mp_banco_count} mov.</div>
                          </td>
                          <td className="text-right font-mono px-3 text-red-600">
                            −{formatPrice(r.egresos_app_total, "ARS")}
                            <div className="text-[10px] text-muted-foreground">{r.egresos_app_count} gastos</div>
                          </td>
                          <td className="text-right font-mono px-3 text-red-600">
                            −{formatPrice(r.egresos_banco_total, "ARS")}
                            <div className="text-[10px] text-muted-foreground">{r.egresos_banco_count} mov.</div>
                          </td>
                          <td className={`text-right font-mono px-3 ${Math.abs(r.diferencia) < 1 ? "text-green-600" : "text-amber-600"}`}>
                            {r.diferencia > 0 ? "+" : ""}{formatPrice(r.diferencia, "ARS")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Notas del cierre</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                placeholder="Aclaraciones sobre diferencias, vueltos, faltantes, sobrantes..."
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                disabled={cerrado}
                rows={3}
              />
              <div className="flex flex-wrap gap-2 justify-end">
                {cerrado ? (
                  <Button variant="outline" onClick={reabrir}><Unlock className="w-4 h-4 mr-1" /> Reabrir</Button>
                ) : (
                  <>
                    <Button variant="outline" onClick={() => guardar(false)} disabled={saving}>
                      {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
                      Guardar borrador
                    </Button>
                    <Button onClick={() => guardar(true)} disabled={saving}>
                      <Lock className="w-4 h-4 mr-1" /> Cerrar caja del día
                    </Button>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Historial (últimos 30 cierres)</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground border-b">
                    <tr>
                      <th className="text-left py-2">Fecha</th>
                      <th className="text-right">Escuela</th>
                      <th className="text-right">Viajes</th>
                      <th className="text-right">Tienda</th>
                      <th className="text-right">Total</th>
                      <th className="text-right">Diferencia</th>
                      <th className="text-center">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historial.length === 0 ? (
                      <tr><td colSpan={7} className="text-center py-4 text-muted-foreground">Sin cierres registrados</td></tr>
                    ) : historial.map((h) => (
                      <tr key={h.id} className="border-b hover:bg-muted/30 cursor-pointer" onClick={() => setFecha(h.fecha)}>
                        <td className="py-2">{format(new Date(h.fecha + "T12:00:00"), "dd MMM yyyy", { locale: es })}</td>
                        <td className="text-right font-mono">{formatPrice(h.efectivo_escuela_sistema, "ARS")}</td>
                        <td className="text-right font-mono">{formatPrice(h.efectivo_viajes_sistema, "ARS")}</td>
                        <td className="text-right font-mono">{formatPrice(h.efectivo_tienda_sistema, "ARS")}</td>
                        <td className="text-right font-mono font-semibold">
                          {formatPrice((h.efectivo_escuela_sistema || 0) + (h.efectivo_viajes_sistema || 0) + (h.efectivo_tienda_sistema || 0), "ARS")}
                        </td>
                        <td className={`text-right font-mono ${h.diferencia_total == null ? "text-muted-foreground" : h.diferencia_total === 0 ? "text-green-600" : "text-red-600"}`}>
                          {h.diferencia_total == null ? "—" : `${h.diferencia_total > 0 ? "+" : ""}${formatPrice(h.diferencia_total, "ARS")}`}
                        </td>
                        <td className="text-center">
                          {h.estado === "cerrado"
                            ? <Badge variant="secondary" className="gap-1"><Lock className="w-3 h-3" /> Cerrado</Badge>
                            : <Badge variant="outline">Abierto</Badge>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
