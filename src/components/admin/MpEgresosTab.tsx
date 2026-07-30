import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, AlertCircle, CheckCircle2, TrendingDown, PiggyBank, Link as LinkIcon } from "lucide-react";

type MpEgreso = {
  id: string;
  mp_payment_id: string;
  amount: number;
  currency: string;
  description: string | null;
  payment_type: string | null;
  fecha_movimiento: string;
  direccion: "egreso" | "reserva_tecnica" | "interno";
  gasto_id: string | null;
  cuentas_mp?: { nombre: string; slug: string };
};

const CATEGORIAS = [
  "MP - Egresos",
  "Sueldos",
  "Impuestos",
  "Servicios",
  "Vehículo",
  "Insumos",
  "Marketing",
  "Comisiones",
  "Personal",
  "Otros",
];

const UNIDADES = [
  { value: "compartido", label: "Compartido" },
  { value: "escuela", label: "Escuela" },
  { value: "tienda", label: "Tienda" },
  { value: "viajes", label: "Viajes" },
  { value: "personal", label: "Personal" },
];


export default function MpEgresosTab() {
  const { toast } = useToast();
  const [items, setItems] = useState<MpEgreso[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"egresos" | "internos" | "categorizados">("egresos");
  const [dialog, setDialog] = useState<MpEgreso | null>(null);
  const [form, setForm] = useState({
    categoria: "MP - Egresos",
    subcategoria: "",
    descripcion: "",
    proveedor: "",
    unidad_negocio: "compartido",
    notas: "",
  });
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<"nuevo" | "agenda">("nuevo");
  const [ejecuciones, setEjecuciones] = useState<any[]>([]);
  const [loadingEjecs, setLoadingEjecs] = useState(false);
  const [ejecId, setEjecId] = useState<string | null>(null);
  const [ejecSearch, setEjecSearch] = useState("");
  const [incluirPagados, setIncluirPagados] = useState(true);


  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("mp_account_movements")
      .select(`
        id, mp_payment_id, amount, currency, description, payment_type,
        fecha_movimiento, direccion, gasto_id,
        cuentas_mp:cuentas_mp!cuenta_mp_id ( nombre, slug )
      `)
      .in("direccion", ["egreso", "reserva_tecnica", "interno"])
      .order("fecha_movimiento", { ascending: false })
      .limit(300);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else setItems((data as any) ?? []);
    setLoading(false);
  }

  async function loadEjecuciones() {
    setLoadingEjecs(true);
    const { data, error } = await supabase
      .from("gastos_ejecuciones")
      .select(`
        id, mes, fecha_vencimiento, monto_previsto, monto_pagado, estado, moneda,
        gastos_recurrentes:gastos_recurrentes!recurrente_id ( concepto, categoria, proveedor, ambito )
      `)
      .in("estado", ["pendiente", "parcial", "vencido"])
      .order("fecha_vencimiento", { ascending: true })
      .limit(200);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else setEjecuciones((data as any) ?? []);
    setLoadingEjecs(false);
  }

  function openDialog(m: MpEgreso) {
    setDialog(m);
    setMode("nuevo");
    setEjecId(null);
    setForm({
      categoria: "MP - Egresos",
      subcategoria: "",
      descripcion: m.description && m.description !== "Varios" ? m.description : `Egreso MP ${m.mp_payment_id}`,
      proveedor: "",
      unidad_negocio: "compartido",
      notas: "",
    });
    if (ejecuciones.length === 0) loadEjecuciones();
  }

  async function handleSave() {
    if (!dialog) return;
    setSaving(true);

    if (mode === "agenda") {
      if (!ejecId) { setSaving(false); return; }
      const { error } = await supabase.rpc("mp_egreso_to_ejecucion", {
        _movement_id: dialog.id,
        _ejecucion_id: ejecId,
        _notas: form.notas || null,
      });
      setSaving(false);
      if (error) {
        toast({ title: "No se pudo vincular", description: error.message, variant: "destructive" });
        return;
      }
      toast({ title: "Pago vinculado", description: "La agenda de gastos se actualizó." });
      setDialog(null);
      loadEjecuciones();
      load();
      return;
    }

    const { data, error } = await supabase.rpc("mp_egreso_to_gasto", {
      _movement_id: dialog.id,
      _categoria: form.categoria,
      _subcategoria: form.subcategoria || null,
      _descripcion: form.descripcion,
      _proveedor: form.proveedor || null,
      _unidad_negocio: form.unidad_negocio,
      _notas: form.notas || null,
    });
    setSaving(false);
    if (error) {
      toast({ title: "No se pudo categorizar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Egreso categorizado", description: `Gasto creado: ${data}` });
    setDialog(null);
    load();

  }

  const egresos = items.filter(i => i.direccion === "egreso" && !i.gasto_id);
  const internos = items.filter(i => i.direccion === "interno" || i.direccion === "reserva_tecnica");
  const categorizados = items.filter(i => i.gasto_id);

  const filteredEjecuciones = ejecuciones.filter((e) => {
    if (!ejecSearch.trim()) return true;
    const rec: any = e.gastos_recurrentes;
    const term = ejecSearch.toLowerCase();
    return (
      String(rec?.concepto ?? "").toLowerCase().includes(term) ||
      String(rec?.categoria ?? "").toLowerCase().includes(term) ||
      String(rec?.proveedor ?? "").toLowerCase().includes(term) ||
      String(e.mes ?? "").toLowerCase().includes(term) ||
      String(e.estado ?? "").toLowerCase().includes(term)
    );
  });

  const totalEgresosPendientes = egresos.reduce((s, i) => s + Number(i.amount), 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="border-orange-500/30 bg-orange-500/5">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-orange-400 text-xs uppercase tracking-wider">
              <TrendingDown className="w-4 h-4" /> Egresos pendientes de categorizar
            </div>
            <div className="text-2xl font-bold mt-1">$ {totalEgresosPendientes.toLocaleString("es-AR")}</div>
            <div className="text-xs text-muted-foreground">{egresos.length} movimientos</div>
          </CardContent>
        </Card>
        <Card className="border-cyan-500/30 bg-cyan-500/5">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-cyan-400 text-xs uppercase tracking-wider">
              <PiggyBank className="w-4 h-4" /> Movimientos internos MP
            </div>
            <div className="text-2xl font-bold mt-1">{internos.length}</div>
            <div className="text-xs text-muted-foreground">transferencias entre bolsillos · no son gasto ni cobro</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-green-400 text-xs uppercase tracking-wider">
              <CheckCircle2 className="w-4 h-4" /> Ya categorizados
            </div>
            <div className="text-2xl font-bold mt-1">{categorizados.length}</div>
            <div className="text-xs text-muted-foreground">egresos MP convertidos en gastos</div>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-2 border-b border-border">
        {(["egresos","internos","categorizados"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-2 text-sm font-medium transition-colors ${
              tab === t ? "border-b-2 border-orange-500 text-orange-400" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "egresos" && `Pendientes (${egresos.length})`}
            {t === "internos" && `Internos MP (${internos.length})`}
            {t === "categorizados" && `Categorizados (${categorizados.length})`}
          </button>
        ))}
      </div>

      {tab === "internos" && (
        <div className="text-xs text-muted-foreground bg-cyan-500/5 border border-cyan-500/20 rounded p-3">
          Son <b>transferencias internas</b> de MP entre bolsillos (Disponible ↔ Reservas ↔ Inversiones). No son cobros ni gastos.
          El saldo de <b>"Reservas"</b> que ves en el panel de Mercado Pago (ej: $330.023) es <b>una foto del bolsillo Inversiones</b>,
          no se puede reconstruir sumando estos movimientos.
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>
      ) : (
        <div className="space-y-2">
          {(tab === "egresos" ? egresos : tab === "internos" ? internos : categorizados).map(m => (
            <Card key={m.id} className="hover:border-orange-500/40 transition-colors">
              <CardContent className="py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-sm">{m.mp_payment_id}</span>
                    <Badge variant="outline" className="text-[10px]">{m.cuentas_mp?.nombre ?? "MP"}</Badge>
                    <Badge variant="outline" className="text-[10px]">{m.payment_type ?? "-"}</Badge>
                    {m.direccion === "reserva_tecnica" && (
                      <Badge className="bg-cyan-500/20 text-cyan-400 border-cyan-500/30 text-[10px]">Reserva técnica</Badge>
                    )}
                    {m.gasto_id && (
                      <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-[10px]">Gasto creado</Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {new Date(m.fecha_movimiento).toLocaleString("es-AR")}
                    {m.description && m.description !== "Varios" && <span className="ml-2 italic text-cyan-400/80">{m.description}</span>}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-orange-400">- $ {Number(m.amount).toLocaleString("es-AR")}</div>
                  <div className="text-[10px] text-muted-foreground">{m.currency}</div>
                </div>
                {m.direccion === "egreso" && !m.gasto_id && (
                  <Button size="sm" onClick={() => openDialog(m)}>Categorizar</Button>
                )}
              </CardContent>
            </Card>
          ))}
          {tab === "egresos" && egresos.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-green-400" />
              No hay egresos pendientes de categorizar
            </div>
          )}
        </div>
      )}

      <Dialog open={!!dialog} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Categorizar egreso MP</DialogTitle>
          </DialogHeader>
          {dialog && (
            <div className="space-y-3">
              <div className="rounded-md bg-muted/50 p-3 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">MP ID:</span><span className="font-mono">{dialog.mp_payment_id}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Monto:</span><span className="font-bold text-orange-400">- $ {Number(dialog.amount).toLocaleString("es-AR")}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Fecha:</span><span>{new Date(dialog.fecha_movimiento).toLocaleString("es-AR")}</span></div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setMode("nuevo")}
                  className={`rounded-md border p-2 text-xs font-medium transition-colors ${mode === "nuevo" ? "border-orange-500 bg-orange-500/10 text-orange-400" : "border-border text-muted-foreground hover:text-foreground"}`}
                >
                  Gasto nuevo
                </button>
                <button
                  type="button"
                  onClick={() => setMode("agenda")}
                  className={`rounded-md border p-2 text-xs font-medium transition-colors ${mode === "agenda" ? "border-cyan-500 bg-cyan-500/10 text-cyan-400" : "border-border text-muted-foreground hover:text-foreground"}`}
                >
                  <span className="inline-flex items-center gap-1"><LinkIcon className="w-3 h-3" /> Vincular a la agenda</span>
                </button>
              </div>

              {mode === "agenda" ? (
                <div className="space-y-3">
                  <div className="text-xs text-muted-foreground">
                    Elegí el gasto planificado del catálogo/agenda al que corresponde este pago. Se registra el pago y la agenda se actualiza sola.
                  </div>
                  <Input
                    placeholder="Buscar por concepto, categoría, proveedor, mes…"
                    value={ejecSearch}
                    onChange={(e) => setEjecSearch(e.target.value)}
                    className="text-sm"
                  />
                  {loadingEjecs ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Cargando agenda…</div>
                  ) : filteredEjecuciones.length === 0 ? (
                    <div className="text-sm text-muted-foreground">{ejecSearch ? "No hay coincidencias." : "No hay gastos planificados pendientes."}</div>
                  ) : (
                    <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                      {filteredEjecuciones.map(e => {
                        const rec: any = e.gastos_recurrentes;
                        const pend = Number(e.monto_previsto || 0) - Number(e.monto_pagado || 0);
                        const match = Math.abs(pend - Number(dialog.amount)) < 1;
                        return (
                          <button
                            key={e.id}
                            type="button"
                            onClick={() => setEjecId(e.id)}
                            className={`w-full text-left rounded-md border p-2.5 transition-colors ${ejecId === e.id ? "border-cyan-500 bg-cyan-500/10" : "border-border hover:border-cyan-500/40"}`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-medium truncate">{rec?.concepto ?? "Gasto"}</span>
                              <span className="text-sm font-bold whitespace-nowrap">$ {pend.toLocaleString("es-AR")}</span>
                            </div>
                            <div className="text-[11px] text-muted-foreground flex items-center gap-2 flex-wrap mt-0.5">
                              <span>{e.mes}</span>
                              <Badge variant="outline" className="text-[10px]">{e.estado}</Badge>
                              {rec?.categoria && <span>{rec.categoria}</span>}
                              {rec?.proveedor && <span>· {rec.proveedor}</span>}
                              {match && <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-[10px]">Coincide el monto</Badge>}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <div>
                    <Label>Notas</Label>
                    <Textarea rows={2} value={form.notas} onChange={(e) => setForm(f => ({ ...f, notas: e.target.value }))} />
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <Label>Categoría</Label>
                    <Select value={form.categoria} onValueChange={(v) => setForm(f => ({ ...f, categoria: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{CATEGORIAS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Subcategoría (opcional)</Label>
                    <Input value={form.subcategoria} onChange={(e) => setForm(f => ({ ...f, subcategoria: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Descripción</Label>
                    <Input value={form.descripcion} onChange={(e) => setForm(f => ({ ...f, descripcion: e.target.value }))} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Proveedor</Label>
                      <Input value={form.proveedor} onChange={(e) => setForm(f => ({ ...f, proveedor: e.target.value }))} />
                    </div>
                    <div>
                      <Label>Unidad de negocio</Label>
                      <Select value={form.unidad_negocio} onValueChange={(v) => setForm(f => ({ ...f, unidad_negocio: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{UNIDADES.map(u => <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div>
                    <Label>Notas</Label>
                    <Textarea rows={2} value={form.notas} onChange={(e) => setForm(f => ({ ...f, notas: e.target.value }))} />
                  </div>
                </>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving || (mode === "agenda" && !ejecId)}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {mode === "agenda" ? "Vincular y registrar pago" : "Confirmar y crear gasto"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
