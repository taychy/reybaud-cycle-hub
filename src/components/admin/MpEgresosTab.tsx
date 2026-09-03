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
import { Loader2, AlertCircle, CheckCircle2, TrendingDown, PiggyBank, Link as LinkIcon, Sparkles, Wand2 } from "lucide-react";
import { getMpMovementDetail, suggestGastoDescripcion } from "@/lib/mpMovementDetails";
import { collectorIdDeMovimiento, matchCoachPorContraparte, type ContraparteCoach } from "@/lib/gastoReglas";

type AiSugerencia = {
  movement_id: string;
  tipo: "agenda" | "nuevo";
  ejecucion_id?: string | null;
  categoria?: string;
  subcategoria?: string;
  descripcion?: string;
  proveedor?: string;
  unidad_negocio?: string;
  confianza?: number;
  motivo?: string;
};

type AiRenombre = {
  tipo: string;
  actual: string;
  sugerido: string;
  patron_mp?: string;
  impacto?: number;
  motivo?: string;
};


type MpEgreso = {
  id: string;
  mp_payment_id: string;
  amount: number;
  currency: string;
  description: string | null;
  payment_type: string | null;
  payment_method: string | null;
  payer_name: string | null;
  payer_email: string | null;
  external_reference: string | null;
  raw: any;
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
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSug, setAiSug] = useState<Record<string, AiSugerencia>>({});
  const [aiRenombres, setAiRenombres] = useState<AiRenombre[]>([]);
  const [coaches, setCoaches] = useState<{ id: string; nombre: string }[]>([]);
  const [contrapartes, setContrapartes] = useState<ContraparteCoach[]>([]);
  const [coachId, setCoachId] = useState<string>("");



  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("mp_account_movements")
      .select(`
        id, mp_payment_id, amount, currency, description, payment_type,
        payment_method, payer_name, payer_email, external_reference, raw,
        fecha_movimiento, direccion, gasto_id,
        cuentas_mp:cuentas_mp!cuenta_mp_id ( nombre, slug )
      `)
      .in("direccion", ["egreso", "reserva_tecnica", "interno"])
      .order("fecha_movimiento", { ascending: false })
      .limit(300);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else setItems((data as any) ?? []);

    const [co, cp] = await Promise.all([
      supabase.from("coaches").select("id, nombre").eq("estado", "activo").order("nombre"),
      supabase.from("coach_mp_contrapartes" as any).select("coach_id, mp_collector_id, nombre_contraparte"),
    ]);
    setCoaches(((co.data as any[]) ?? []) as { id: string; nombre: string }[]);
    setContrapartes(((cp.data as any[]) ?? []) as ContraparteCoach[]);

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
      .in("estado", ["pendiente", "parcial", "vencido", "pagado"])
      .order("fecha_vencimiento", { ascending: true })
      .limit(400);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else setEjecuciones((data as any) ?? []);
    setLoadingEjecs(false);
  }


  async function runAI() {
    setAiLoading(true);
    try {
      let ejecs = ejecuciones;
      if (ejecs.length === 0) {
        const { data } = await supabase
          .from("gastos_ejecuciones")
          .select(`
            id, mes, fecha_vencimiento, monto_previsto, monto_pagado, estado, moneda,
            gastos_recurrentes:gastos_recurrentes!recurrente_id ( concepto, categoria, proveedor, ambito )
          `)
          .in("estado", ["pendiente", "parcial", "vencido", "pagado"])
          .order("fecha_vencimiento", { ascending: true })
          .limit(400);
        ejecs = (data as any) ?? [];
        setEjecuciones(ejecs);
      }

      const movimientos = egresos.slice(0, 40).map((m) => {
        const d = getMpMovementDetail(m);
        return {
          id: m.id,
          monto: Number(m.amount),
          moneda: m.currency,
          fecha: m.fecha_movimiento,
          concepto: d.concepto ?? m.description,
          contraparte: d.contraparte,
          operacion: d.operacion,
          medio: d.medio,
          referencia: d.referencia,
        };
      });

      const catalogo = ejecs.slice(0, 150).map((e: any) => ({
        ejecucion_id: e.id,
        concepto: e.gastos_recurrentes?.concepto,
        categoria: e.gastos_recurrentes?.categoria,
        proveedor: e.gastos_recurrentes?.proveedor,
        ambito: e.gastos_recurrentes?.ambito,
        mes: e.mes,
        estado: e.estado,
        previsto: Number(e.monto_previsto || 0),
        pagado: Number(e.monto_pagado || 0),
        saldo: Number(e.monto_previsto || 0) - Number(e.monto_pagado || 0),
      }));

      // Historial: cómo se categorizaron antes movimientos MP parecidos
      const { data: histRows } = await supabase
        .from("mp_account_movements")
        .select("description, raw, gastos:gasto_id ( categoria, subcategoria, descripcion, proveedor, unidad_negocio )")
        .not("gasto_id", "is", null)
        .order("categorizado_at", { ascending: false, nullsFirst: false })
        .limit(150);

      const historial = ((histRows as any[]) ?? [])
        .filter((h) => h.gastos)
        .map((h) => {
          const d = getMpMovementDetail(h as any);
          return {
            texto_mp: d.concepto ?? h.description,
            contraparte_mp: d.contraparte,
            categoria: h.gastos.categoria,
            subcategoria: h.gastos.subcategoria,
            descripcion: h.gastos.descripcion,
            proveedor: h.gastos.proveedor,
            unidad_negocio: h.gastos.unidad_negocio,
          };
        });

      const { data, error } = await supabase.functions.invoke("sugerir-categorias-gastos", {
        body: { movimientos, catalogo, historial, categorias: CATEGORIAS, unidades: UNIDADES.map(u => u.value) },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);

      const map: Record<string, AiSugerencia> = {};
      for (const s of ((data as any)?.sugerencias ?? []) as AiSugerencia[]) {
        if (s?.movement_id) map[s.movement_id] = s;
      }
      setAiSug(map);
      setAiRenombres(((data as any)?.renombres ?? []) as AiRenombre[]);
      toast({
        title: "Sugerencias listas",
        description: `${Object.keys(map).length} movimientos analizados · ${((data as any)?.renombres ?? []).length} propuestas de renombre`,
      });
    } catch (e: any) {
      toast({ title: "No se pudo analizar", description: e.message ?? String(e), variant: "destructive" });
    } finally {
      setAiLoading(false);
    }
  }

  function openDialog(m: MpEgreso) {
    const s = aiSug[m.id];
    const cm = matchCoachPorContraparte(collectorIdDeMovimiento(m.raw), contrapartes);
    setCoachId(cm.estado === "inequivoco" ? cm.coach_id : "");
    setDialog(m);
    setMode(s?.tipo === "agenda" && s.ejecucion_id ? "agenda" : "nuevo");
    setEjecId(s?.tipo === "agenda" ? (s.ejecucion_id ?? null) : null);
    setForm({
      categoria: s?.categoria && CATEGORIAS.includes(s.categoria) ? s.categoria : "MP - Egresos",
      subcategoria: s?.subcategoria ?? "",
      descripcion: s?.descripcion || suggestGastoDescripcion(m),
      proveedor: s?.proveedor || (getMpMovementDetail(m).contraparte ?? ""),
      unidad_negocio: s?.unidad_negocio && UNIDADES.some(u => u.value === s.unidad_negocio) ? s.unidad_negocio : "compartido",
      notas: s?.motivo ? `Sugerido por IA: ${s.motivo}` : "",
    });
    if (ejecuciones.length === 0) loadEjecuciones();
  }


  async function handleSave() {
    if (!dialog) return;
    setSaving(true);

    if (mode === "agenda") {
      if (!ejecId) { setSaving(false); return; }
      const sel = ejecuciones.find(e => e.id === ejecId);
      const pendSel = sel ? Number(sel.monto_previsto || 0) - Number(sel.monto_pagado || 0) : 0;
      const esExcedente = pendSel <= 0 || Number(dialog.amount) > pendSel + 1;
      const { error } = await supabase.rpc("mp_egreso_to_ejecucion", {
        _movement_id: dialog.id,
        _ejecucion_id: ejecId,
        _notas: form.notas || null,
        _es_excedente: esExcedente,
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
    if (coachId) {
      const collector = collectorIdDeMovimiento(dialog.raw);
      if (collector && !contrapartes.some((c) => c.mp_collector_id === collector)) {
        await supabase.from("coach_mp_contrapartes" as any).insert({
          coach_id: coachId,
          mp_collector_id: collector,
          nombre_contraparte: form.proveedor || null,
        } as any);
      }
      const { error: linkErr } = await supabase.rpc("vincular_egreso_mp_coach" as any, {
        _movement_id: dialog.id,
        _coach_id: coachId,
        _confirmar: true,
      });
      if (linkErr) toast({ title: "Gasto creado, pero no se pudo vincular el profesor", description: linkErr.message, variant: "destructive" });
    }

    toast({ title: "Egreso categorizado", description: `Gasto creado: ${data}` });
    setDialog(null);
    load();

  }

  const egresos = items.filter(i => i.direccion === "egreso" && !i.gasto_id);
  const internos = items.filter(i => i.direccion === "interno" || i.direccion === "reserva_tecnica");
  const categorizados = items.filter(i => i.gasto_id);

  const filteredEjecuciones = ejecuciones.filter((e) => {
    if (!incluirPagados && e.estado === "pagado") return false;
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

      {tab === "egresos" && (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="text-xs text-muted-foreground">
            La IA analiza los pendientes, propone categoría o vínculo con la agenda y sugiere renombres para que el próximo match sea automático.
          </div>
          <Button size="sm" variant="outline" onClick={runAI} disabled={aiLoading || egresos.length === 0}>
            {aiLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
            Sugerir con IA
          </Button>
        </div>
      )}

      {tab === "egresos" && aiRenombres.length > 0 && (
        <Card className="border-purple-500/30 bg-purple-500/5">
          <CardContent className="pt-4 space-y-2">
            <div className="flex items-center gap-2 text-purple-300 text-xs uppercase tracking-wider">
              <Wand2 className="w-4 h-4" /> Renombres sugeridos para automatizar por regla
            </div>
            {aiRenombres.map((r, i) => (
              <div key={i} className="rounded-md border border-purple-500/20 p-2.5 text-sm">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="text-[10px]">{r.tipo}</Badge>
                  <span className="line-through text-muted-foreground">{r.actual}</span>
                  <span className="text-purple-300">→</span>
                  <span className="font-semibold text-purple-200">{r.sugerido}</span>
                  {typeof r.impacto === "number" && r.impacto > 0 && (
                    <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/30 text-[10px]">
                      automatiza {r.impacto}
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {r.patron_mp && <>MP envía: <span className="font-mono">{r.patron_mp}</span> · </>}
                  {r.motivo}
                </div>
              </div>
            ))}
            <div className="text-[11px] text-muted-foreground">
              Aplicá el renombre en el catálogo de gastos recurrentes: al coincidir el texto exacto con lo que envía MP, el sistema los vincula sin usar IA.
            </div>
          </CardContent>
        </Card>
      )}



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
          {(tab === "egresos" ? egresos : tab === "internos" ? internos : categorizados).map(m => {
            const det = getMpMovementDetail(m);
            const sug = aiSug[m.id];
            const sugEjec = sug?.ejecucion_id ? ejecuciones.find(e => e.id === sug.ejecucion_id) : null;
            return (
            <Card key={m.id} className="hover:border-orange-500/40 transition-colors">
              <CardContent className="py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold truncate">
                      {det.concepto ?? det.contraparte ?? det.operacion ?? "Movimiento MP"}
                    </span>
                    <Badge variant="outline" className="text-[10px]">{m.cuentas_mp?.nombre ?? "MP"}</Badge>
                    {det.medio && <Badge variant="outline" className="text-[10px]">{det.medio}</Badge>}
                    {m.direccion === "reserva_tecnica" && (
                      <Badge className="bg-cyan-500/20 text-cyan-400 border-cyan-500/30 text-[10px]">Reserva técnica</Badge>
                    )}
                    {m.gasto_id && (
                      <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-[10px]">Gasto creado</Badge>
                    )}
                    {m.direccion === "egreso" &&
                      matchCoachPorContraparte(collectorIdDeMovimiento(m.raw), contrapartes).estado !== "sin_match" && (
                      <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/30 text-[10px]">Posible pago a profesor</Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 flex flex-wrap items-center gap-x-2">
                    <span>{new Date(m.fecha_movimiento).toLocaleString("es-AR")}</span>
                    {det.operacion && <span className="text-cyan-400/80">· {det.operacion}</span>}
                    {det.contraparte && det.contraparte !== det.concepto && <span>· {det.contraparte}</span>}
                    {det.referencia && <span className="font-mono">· ref {det.referencia}</span>}
                    <span className="font-mono opacity-60">· {m.mp_payment_id}</span>
                  </div>
                  {sug && (
                    <div className="mt-1.5 flex items-center gap-2 flex-wrap text-xs">
                      <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/30 text-[10px]">
                        <Sparkles className="w-3 h-3 mr-1" /> IA
                      </Badge>
                      <span className="text-purple-200">
                        {sug.tipo === "agenda"
                          ? `Agenda: ${sugEjec?.gastos_recurrentes?.concepto ?? "gasto planificado"}${sugEjec?.mes ? ` (${sugEjec.mes})` : ""}`
                          : `${sug.categoria ?? "Gasto nuevo"}${sug.descripcion ? ` · ${sug.descripcion}` : ""}`}
                      </span>
                      {typeof sug.confianza === "number" && (
                        <span className="text-muted-foreground">{Math.round(sug.confianza * 100)}%</span>
                      )}
                    </div>
                  )}
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
            );
          })}
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
                {(() => {
                  const d = getMpMovementDetail(dialog);
                  return (
                    <>
                      {d.concepto && <div className="flex justify-between gap-3"><span className="text-muted-foreground">Concepto:</span><span className="text-right">{d.concepto}</span></div>}
                      {d.contraparte && <div className="flex justify-between gap-3"><span className="text-muted-foreground">Contraparte:</span><span className="text-right">{d.contraparte}</span></div>}
                      {d.operacion && <div className="flex justify-between gap-3"><span className="text-muted-foreground">Operación:</span><span className="text-right">{d.operacion}</span></div>}
                      {d.medio && <div className="flex justify-between gap-3"><span className="text-muted-foreground">Medio:</span><span className="text-right">{d.medio}</span></div>}
                      {d.referencia && <div className="flex justify-between gap-3"><span className="text-muted-foreground">Referencia:</span><span className="text-right font-mono text-xs">{d.referencia}</span></div>}
                    </>
                  );
                })()}
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
                  <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={incluirPagados}
                      onChange={(e) => setIncluirPagados(e.target.checked)}
                      className="accent-cyan-500"
                    />
                    Incluir gastos ya pagados (el pago se registra como excedente)
                  </label>
                  {loadingEjecs ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Cargando agenda…</div>
                  ) : filteredEjecuciones.length === 0 ? (
                    <div className="text-sm text-muted-foreground">{ejecSearch ? "No hay coincidencias." : "No hay gastos planificados."}</div>
                  ) : (
                    <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                      {filteredEjecuciones.map(e => {
                        const previsto = Number(e.monto_previsto || 0);
                        const pagado = Number(e.monto_pagado || 0);
                        const pend = previsto - pagado;
                        const match = Math.abs(pend - Number(dialog.amount)) < 1;
                        const excede = pend <= 0 || Number(dialog.amount) > pend + 1;
                        const nuevoExcedente = pagado + Number(dialog.amount) - previsto;
                        return (
                          <button
                            key={e.id}
                            type="button"
                            onClick={() => setEjecId(e.id)}
                            className={`w-full text-left rounded-md border p-2.5 transition-colors ${ejecId === e.id ? "border-cyan-500 bg-cyan-500/10" : "border-border hover:border-cyan-500/40"}`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-medium truncate">{e.gastos_recurrentes?.concepto ?? "Gasto"}</span>
                              <span className={`text-sm font-bold whitespace-nowrap ${pend <= 0 ? "text-muted-foreground" : ""}`}>
                                {pend > 0 ? `$ ${pend.toLocaleString("es-AR")}` : "Sin saldo"}
                              </span>
                            </div>
                            <div className="text-[11px] text-muted-foreground flex items-center gap-2 flex-wrap mt-0.5">
                              <span>{e.mes}</span>
                              <Badge variant="outline" className="text-[10px]">{e.estado}</Badge>
                              {e.gastos_recurrentes?.categoria && <span>{e.gastos_recurrentes.categoria}</span>}
                              {e.gastos_recurrentes?.proveedor && <span>· {e.gastos_recurrentes.proveedor}</span>}
                              <span>· previsto $ {previsto.toLocaleString("es-AR")} · pagado $ {pagado.toLocaleString("es-AR")}</span>
                              {match && <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-[10px]">Coincide el monto</Badge>}
                              {excede && (
                                <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-[10px]">
                                  Excedente $ {Math.max(nuevoExcedente, 0).toLocaleString("es-AR")}
                                </Badge>
                              )}
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
                    <Label>Profesor (opcional)</Label>
                    <Select value={coachId || "ninguno"} onValueChange={(v) => setCoachId(v === "ninguno" ? "" : v)}>
                      <SelectTrigger><SelectValue placeholder="No es un pago a profesor" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ninguno">No es un pago a profesor</SelectItem>
                        {coaches.map(c => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Si lo marcás, el gasto queda como <b>Profesores / Liquidaciones</b> y la cuenta de Mercado Pago
                      se recuerda para reconocer los próximos pagos a esa persona.
                    </p>
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
