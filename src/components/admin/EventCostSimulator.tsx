import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Plus, Trash2, Copy, Archive, Save, Sparkles, Calculator } from "lucide-react";
import { formatPrice, MONEDAS } from "@/lib/currency";
import LodgingCostRow from "@/components/admin/LodgingCostRow";
import AddLodgingTypeDialog from "@/components/admin/AddLodgingTypeDialog";
import {
  calcularSimulacion, CATEGORIAS_COSTO, CATEGORIA_LABELS,
  type CostItem, type Modalidad, type Supuestos,
} from "@/lib/eventCostCalculator";


interface Props {
  eventId: string;
}

interface SimRow {
  id: string;
  event_id: string;
  version: number;
  nombre: string | null;
  notas: string | null;
  tc_usd: number; tc_eur: number;
  pct_imprevistos: number; pct_margen_objetivo: number;
  moneda_base: string;
  noches: number; jornadas: number; capacidad_total: number;
  cantidades_esperadas: Record<string, number>;
  escenarios_inscripcion: EscenarioInscripcion[] | null;
  escenario_activo_id: string | null;
  resultados: any;
  resultados_reales: any;
  estado: "borrador" | "activa" | "archivada";
  aplicada_a_packages_at: string | null;
}

export interface EscenarioInscripcion {
  id: string;
  nombre: string;
  inscriptos: number;
}


interface ItemRow extends CostItem { id: string; simulation_id: string; }
interface ActualRow {
  id: string; simulation_id: string;
  categoria: string; descripcion: string;
  monto_real: number; moneda: string;
  fuente: "manual" | "gasto"; gasto_id: string | null; notas: string | null;
}

export default function EventCostSimulator({ eventId }: Props) {
  const [loading, setLoading] = useState(true);
  const [sims, setSims] = useState<SimRow[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [actuals, setActuals] = useState<ActualRow[]>([]);
  const [modalidades, setModalidades] = useState<Modalidad[]>([]);
  const [packages, setPackages] = useState<any[]>([]);
  const [rooms, setRooms] = useState<any[]>([]);
  const [addLodgingOpen, setAddLodgingOpen] = useState(false);

  const [participantesReales, setParticipantesReales] = useState<Record<string, number>>({});
  const [applyDialog, setApplyDialog] = useState(false);
  const [applyMap, setApplyMap] = useState<Record<string, boolean>>({});

  const current = sims.find((s) => s.id === currentId) || null;

  const loadSims = useCallback(async () => {
    setLoading(true);
    const { data: pkgs } = await supabase
      .from("event_packages")
      .select("id, nombre, precio, currency, cupo, personas_por_habitacion, sin_alojamiento, activo, lodging_group_key, sort_order")
      .eq("event_id", eventId)
      .order("sort_order", { ascending: true });
    setPackages(pkgs || []);

    const { data: rms } = await supabase
      .from("event_rooms")
      .select("id, package_id, nombre, capacidad, tipo")
      .eq("event_id", eventId);
    setRooms((rms as any) || []);

    const { data: simsData } = await supabase
      .from("event_cost_simulations")
      .select("*")
      .eq("event_id", eventId)
      .order("version", { ascending: false });
    setSims((simsData as any) || []);
    if (simsData && simsData.length > 0 && !currentId) {
      setCurrentId((simsData[0] as any).id);
    }
    setLoading(false);
  }, [eventId, currentId]);


  useEffect(() => { loadSims(); }, [loadSims]);

  useEffect(() => {
    if (!currentId) return;
    (async () => {
      const [{ data: it }, { data: ac }] = await Promise.all([
        supabase.from("event_cost_items").select("*").eq("simulation_id", currentId).order("orden"),
        supabase.from("event_cost_actuals").select("*").eq("simulation_id", currentId).order("created_at"),
      ]);
      setItems((it as any) || []);
      setActuals((ac as any) || []);
    })();
  }, [currentId]);

  /** Backfill: sólo claves AUSENTES de la simulación actual arrancan en 100% de ocupación (cupo). */
  useEffect(() => {
    if (!current || packages.length === 0) return;
    const existing = (current.cantidades_esperadas || {}) as Record<string, number>;
    const missing: Record<string, number> = {};
    packages.forEach((p) => {
      if (existing[p.id] === undefined || existing[p.id] === null) {
        const cupo = Number(p.cupo) || 0;
        if (cupo > 0) missing[p.id] = cupo;
      }
    });
    if (Object.keys(missing).length === 0) return;
    const merged = { ...existing, ...missing };
    setSims((old) => old.map((s) => s.id === current.id ? { ...s, cantidades_esperadas: merged } : s));
    supabase.from("event_cost_simulations")
      .update({ cantidades_esperadas: merged as any })
      .eq("id", current.id)
      .then(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, packages]);

  // Derive modalities from packages + cantidades_esperadas
  useEffect(() => {
    if (!current) return;
    const mods: Modalidad[] = packages.map((p) => ({
      key: p.id,
      label: p.nombre || "Paquete",
      esperados: Number(current.cantidades_esperadas?.[p.id] ?? 0),
    }));
    setModalidades(mods);
    setParticipantesReales(current.resultados_reales?.participantes || {});
  }, [current, packages]);

  /* ─── Escenarios de inscripción ─── */
  const capacidadTotal = useMemo(() => {
    const cap = Number(current?.capacidad_total) || 0;
    if (cap > 0) return cap;
    return packages.reduce((a, p) => a + (Number(p.cupo) || 0), 0);
  }, [current?.capacidad_total, packages]);

  const sumaDistribucion = useMemo(
    () => Object.values(current?.cantidades_esperadas || {})
      .reduce((a: number, v: any) => a + (Number(v) || 0), 0),
    [current?.cantidades_esperadas],
  );

  const escenarios: EscenarioInscripcion[] = useMemo(() => {
    const stored = (current?.escenarios_inscripcion || []) as EscenarioInscripcion[];
    if (Array.isArray(stored) && stored.length > 0) {
      return stored.map((e) => ({
        id: String(e.id), nombre: String(e.nombre || ""), inscriptos: Number(e.inscriptos) || 0,
      }));
    }
    return [
      { id: "conservador", nombre: "Conservador", inscriptos: Math.round(capacidadTotal * 0.5) },
      { id: "esperado", nombre: "Esperado", inscriptos: sumaDistribucion > 0 ? sumaDistribucion : Math.round(capacidadTotal * 0.75) },
      { id: "completo", nombre: "Completo", inscriptos: capacidadTotal },
    ];
  }, [current?.escenarios_inscripcion, capacidadTotal, sumaDistribucion]);

  const escenarioActivo = useMemo(() => {
    return escenarios.find((e) => e.id === current?.escenario_activo_id)
      || escenarios.find((e) => e.id === "esperado")
      || escenarios[0]
      || null;
  }, [escenarios, current?.escenario_activo_id]);

  const persistEscenarios = async (next: EscenarioInscripcion[], activoId?: string | null) => {
    if (!current) return;
    const activo = activoId !== undefined ? activoId : (current.escenario_activo_id || escenarioActivo?.id || null);
    patchCurrent({ escenarios_inscripcion: next, escenario_activo_id: activo });
    await supabase.from("event_cost_simulations")
      .update({ escenarios_inscripcion: next as any, escenario_activo_id: activo })
      .eq("id", current.id);
  };

  const supuestos: Supuestos | null = current ? {
    tc_usd: Number(current.tc_usd),
    tc_eur: Number(current.tc_eur),
    pct_imprevistos: Number(current.pct_imprevistos),
    pct_margen_objetivo: Number(current.pct_margen_objetivo),
    moneda_base: current.moneda_base,
    participantes_prorrateo: Number(escenarioActivo?.inscriptos) || 0,
  } : null;


  const lodgingPackages = useMemo(
    () => packages.filter((p) => p.sin_alojamiento !== true),
    [packages],
  );
  const lodgingItems = useMemo(() => items.filter((i) => i.categoria === "alojamiento"), [items]);
  const genericItems = useMemo(() => items.filter((i) => i.categoria !== "alojamiento"), [items]);
  const nextSortOrder = useMemo(
    () => packages.reduce((a, p) => Math.max(a, Number(p.sort_order) || 0), 0) + 1,
    [packages],
  );


  const calculo = useMemo(() => {
    if (!supuestos) return null;
    return calcularSimulacion(items, modalidades, supuestos);
  }, [items, modalidades, supuestos]);

  const calculoReal = useMemo(() => {
    if (!supuestos) return null;
    // Build synthetic items from actuals (all treated as fixed)
    const fakeItems: CostItem[] = actuals.map((a) => ({
      categoria: a.categoria,
      descripcion: a.descripcion,
      cantidad: 1,
      precio_unitario: Number(a.monto_real || 0),
      moneda: a.moneda,
      es_por_persona: false,
      aplica_a_modalidades: [],
    }));
    const modsReales: Modalidad[] = modalidades.map((m) => ({
      ...m,
      esperados: Number(participantesReales[m.key] ?? m.esperados),
    }));
    return calcularSimulacion(fakeItems, modsReales, supuestos);
  }, [actuals, modalidades, participantesReales, supuestos]);

  /* ─── CRUD simulaciones ─── */
  const nuevaVersion = async (duplicarDe?: SimRow) => {
    const maxV = sims.reduce((a, s) => Math.max(a, s.version), 0);
    const base: any = duplicarDe ? {
      tc_usd: duplicarDe.tc_usd, tc_eur: duplicarDe.tc_eur,
      pct_imprevistos: duplicarDe.pct_imprevistos,
      pct_margen_objetivo: duplicarDe.pct_margen_objetivo,
      moneda_base: duplicarDe.moneda_base,
      noches: duplicarDe.noches, jornadas: duplicarDe.jornadas,
      capacidad_total: duplicarDe.capacidad_total,
      cantidades_esperadas: duplicarDe.cantidades_esperadas,
      escenarios_inscripcion: duplicarDe.escenarios_inscripcion || [],
      escenario_activo_id: duplicarDe.escenario_activo_id,

    } : {};
    const { data, error } = await supabase.from("event_cost_simulations").insert({
      event_id: eventId,
      version: maxV + 1,
      nombre: duplicarDe ? `Copia de v${duplicarDe.version}` : `v${maxV + 1}`,
      ...base,
    }).select().single();
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    if (duplicarDe) {
      const { data: srcItems } = await supabase.from("event_cost_items")
        .select("*").eq("simulation_id", duplicarDe.id);
      if (srcItems && srcItems.length > 0) {
        await supabase.from("event_cost_items").insert(
          srcItems.map(({ id, simulation_id, created_at, updated_at, ...rest }: any) =>
            ({ ...rest, simulation_id: data.id })),
        );
      }
    }
    toast({ title: "Nueva simulación creada" });
    setCurrentId(data.id);
    loadSims();
  };

  const archivar = async (s: SimRow) => {
    await supabase.from("event_cost_simulations")
      .update({ estado: s.estado === "archivada" ? "borrador" : "archivada" })
      .eq("id", s.id);
    loadSims();
  };

  const marcarActiva = async () => {
    if (!current) return;
    // desactivar otras
    await supabase.from("event_cost_simulations")
      .update({ estado: "borrador" }).eq("event_id", eventId).eq("estado", "activa");
    await supabase.from("event_cost_simulations")
      .update({ estado: "activa", resultados: calculo as any })
      .eq("id", current.id);
    toast({ title: "Marcada como activa" });
    loadSims();
  };

  const guardarCambios = async () => {
    if (!current) return;
    await supabase.from("event_cost_simulations").update({
      nombre: current.nombre,
      notas: current.notas,
      tc_usd: current.tc_usd, tc_eur: current.tc_eur,
      pct_imprevistos: current.pct_imprevistos,
      pct_margen_objetivo: current.pct_margen_objetivo,
      moneda_base: current.moneda_base,
      noches: current.noches, jornadas: current.jornadas,
      capacidad_total: current.capacidad_total,
      cantidades_esperadas: current.cantidades_esperadas,
      escenarios_inscripcion: (current.escenarios_inscripcion || []) as any,
      escenario_activo_id: current.escenario_activo_id,

      resultados: calculo as any,
    }).eq("id", current.id);
    toast({ title: "Guardado" });
  };

  const patchCurrent = (patch: Partial<SimRow>) => {
    if (!current) return;
    setSims((old) => old.map((s) => s.id === current.id ? { ...s, ...patch } : s));
  };

  /* ─── ítems ─── */
  const addItem = async () => {
    if (!current) return;
    const { data } = await supabase.from("event_cost_items").insert({
      simulation_id: current.id,
      categoria: "otros",
      descripcion: "",
      cantidad: 1,
      precio_unitario: 0,
      moneda: current.moneda_base,
      es_por_persona: false,
      aplica_a_modalidades: [],
      orden: items.length,
    }).select().single();
    if (data) setItems([...items, data as any]);
  };

  const addLodgingItem = async () => {
    if (!current) return;
    const { data } = await supabase.from("event_cost_items").insert({
      simulation_id: current.id,
      categoria: "alojamiento",
      descripcion: "",
      cantidad: 1,
      precio_unitario: 0,
      moneda: current.moneda_base,
      es_por_persona: false,
      aplica_a_modalidades: [],
      orden: items.length,
      detalle: {
        package_id: null,
        cost_basis: "habitacion_noche",
        habitaciones: 0,
        noches: Number(current.noches || 0),
        personas_por_habitacion: 1,
        tipo_habitacion: null,
      },
    } as any).select().single();
    if (data) setItems([...items, data as any]);
  };

  const patchItem = async (id: string, patch: Partial<ItemRow>) => {
    setItems((old) => old.map((i) => i.id === id ? { ...i, ...patch } : i));
  };

  const persistItem = async (it: ItemRow) => {
    await supabase.from("event_cost_items").update({
      categoria: it.categoria, descripcion: it.descripcion,
      cantidad: Number(it.cantidad), precio_unitario: Number(it.precio_unitario),
      moneda: it.moneda, es_por_persona: it.es_por_persona,
      aplica_a_modalidades: it.aplica_a_modalidades,
      detalle: (it.detalle || {}) as any,
    } as any).eq("id", it.id);
  };

  /** Actualiza estado y DB con los valores fusionados (evita leer estado stale). */
  const updateItem = async (id: string, patch: Partial<ItemRow>) => {
    const prev = items.find((i) => i.id === id);
    if (!prev) return;
    const merged = { ...prev, ...patch } as ItemRow;
    setItems((old) => old.map((i) => i.id === id ? merged : i));
    await persistItem(merged);
  };

  const commitItem = async (id: string) => {
    const it = items.find((i) => i.id === id);
    if (!it) return;
    await persistItem(it);
  };
  const delItem = async (id: string) => {
    await supabase.from("event_cost_items").delete().eq("id", id);
    setItems(items.filter((i) => i.id !== id));
  };

  /** Duplica una línea de costo genérica al final de la lista. */
  const duplicarItem = async (it: ItemRow) => {
    if (!current) return;
    const maxOrden = items.reduce((a, i) => Math.max(a, Number((i as any).orden) || 0), 0);
    const { data, error } = await supabase.from("event_cost_items").insert({
      simulation_id: current.id,
      categoria: it.categoria,
      descripcion: it.descripcion,
      cantidad: Number(it.cantidad),
      precio_unitario: Number(it.precio_unitario),
      moneda: it.moneda,
      es_por_persona: it.es_por_persona,
      aplica_a_modalidades: it.aplica_a_modalidades || [],
      detalle: ((it as any).detalle || {}) as any,
      orden: maxOrden + 1,
    } as any).select().single();
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    if (data) setItems([...items, data as any]);
    toast({ title: "Gasto duplicado" });
  };



  /* ─── actuals ─── */
  const addActual = async () => {
    if (!current) return;
    const { data } = await supabase.from("event_cost_actuals").insert({
      simulation_id: current.id,
      categoria: "otros",
      descripcion: "",
      monto_real: 0,
      moneda: current.moneda_base,
      fuente: "manual",
    }).select().single();
    if (data) setActuals([...actuals, data as any]);
  };
  const patchActual = (id: string, patch: Partial<ActualRow>) =>
    setActuals((old) => old.map((a) => a.id === id ? { ...a, ...patch } : a));
  const commitActual = async (id: string) => {
    const a = actuals.find((x) => x.id === id);
    if (!a) return;
    await supabase.from("event_cost_actuals").update({
      categoria: a.categoria, descripcion: a.descripcion,
      monto_real: Number(a.monto_real), moneda: a.moneda, notas: a.notas,
    }).eq("id", id);
  };
  const delActual = async (id: string) => {
    await supabase.from("event_cost_actuals").delete().eq("id", id);
    setActuals(actuals.filter((a) => a.id !== id));
  };

  const guardarParticipantesReales = async () => {
    if (!current) return;
    await supabase.from("event_cost_simulations").update({
      resultados_reales: { ...(current.resultados_reales || {}), participantes: participantesReales, calculo: calculoReal },
    }).eq("id", current.id);
    toast({ title: "Datos reales guardados" });
    loadSims();
  };

  /* ─── aplicar precios ─── */
  const abrirAplicar = () => {
    const initial: Record<string, boolean> = {};
    modalidades.forEach((m) => (initial[m.key] = true));
    setApplyMap(initial);
    setApplyDialog(true);
  };
  const aplicarPrecios = async () => {
    if (!calculo || !current) return;
    const updates = modalidades
      .filter((m) => applyMap[m.key])
      .map((m) => {
        const precio = Math.round(calculo.precio_sugerido_por_modalidad[m.key] || 0);
        return supabase.from("event_packages").update({ precio }).eq("id", m.key);
      });
    await Promise.all(updates);
    await supabase.from("event_cost_simulations")
      .update({ aplicada_a_packages_at: new Date().toISOString() })
      .eq("id", current.id);
    toast({ title: "Precios aplicados a los paquetes" });
    setApplyDialog(false);
    loadSims();
  };

  if (loading) return <div className="p-6 text-muted-foreground">Cargando…</div>;

  if (sims.length === 0) {
    return (
      <div className="text-center py-12 space-y-4">
        <Calculator className="w-10 h-10 mx-auto text-muted-foreground" />
        <p className="text-muted-foreground">Aún no hay simulaciones para este evento.</p>
        <Button variant="gold" onClick={() => nuevaVersion()}>
          <Plus className="w-4 h-4 mr-2" /> Crear primera simulación
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header: versión selector */}
      <Card>
        <CardContent className="pt-6 flex flex-wrap items-end gap-3">
          <div className="space-y-1 min-w-[200px]">
            <Label className="text-xs">Versión</Label>
            <Select value={currentId || ""} onValueChange={setCurrentId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {sims.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    v{s.version} · {s.nombre || "sin nombre"}
                    {s.estado === "activa" ? " ✓" : ""}
                    {s.estado === "archivada" ? " (arch.)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {current && (
            <div className="space-y-1 flex-1 min-w-[200px]">
              <Label className="text-xs">Nombre</Label>
              <Input value={current.nombre || ""}
                onChange={(e) => patchCurrent({ nombre: e.target.value })}
                onBlur={guardarCambios} />
            </div>
          )}
          <div className="flex gap-2 flex-wrap ml-auto">
            <Button variant="outline" size="sm" onClick={() => nuevaVersion()}>
              <Plus className="w-4 h-4 mr-1" /> Nueva versión
            </Button>
            {current && (
              <>
                <Button variant="outline" size="sm" onClick={() => nuevaVersion(current)}>
                  <Copy className="w-4 h-4 mr-1" /> Duplicar
                </Button>
                <Button variant="outline" size="sm" onClick={() => archivar(current)}>
                  <Archive className="w-4 h-4 mr-1" />
                  {current.estado === "archivada" ? "Desarchivar" : "Archivar"}
                </Button>
                {current.estado !== "activa" && (
                  <Button size="sm" onClick={marcarActiva}>
                    <Sparkles className="w-4 h-4 mr-1" /> Marcar como activa
                  </Button>
                )}
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {!current ? null : (
        <Tabs defaultValue="estimado" className="w-full">
          <TabsList>
            <TabsTrigger value="estimado">Estimado</TabsTrigger>
            <TabsTrigger value="real">Real vs Estimado</TabsTrigger>
          </TabsList>

          {/* ============ ESTIMADO ============ */}
          <TabsContent value="estimado" className="space-y-6 pt-4">
            {/* Supuestos */}
            <Card>
              <CardHeader><CardTitle className="text-sm">Supuestos financieros</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div><Label className="text-xs">TC USD → ARS</Label>
                  <Input type="number" value={current.tc_usd}
                    onChange={(e) => patchCurrent({ tc_usd: Number(e.target.value) })}
                    onBlur={guardarCambios} /></div>
                <div><Label className="text-xs">TC EUR → ARS</Label>
                  <Input type="number" value={current.tc_eur}
                    onChange={(e) => patchCurrent({ tc_eur: Number(e.target.value) })}
                    onBlur={guardarCambios} /></div>
                <div><Label className="text-xs">% Imprevistos</Label>
                  <Input type="number" value={current.pct_imprevistos}
                    onChange={(e) => patchCurrent({ pct_imprevistos: Number(e.target.value) })}
                    onBlur={guardarCambios} /></div>
                <div><Label className="text-xs">% Margen objetivo</Label>
                  <Input type="number" value={current.pct_margen_objetivo}
                    onChange={(e) => patchCurrent({ pct_margen_objetivo: Number(e.target.value) })}
                    onBlur={guardarCambios} /></div>
                <div><Label className="text-xs">Moneda base</Label>
                  <Select value={current.moneda_base}
                    onValueChange={(v) => { patchCurrent({ moneda_base: v }); setTimeout(guardarCambios, 0); }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MONEDAS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Datos del evento */}
            <Card>
              <CardHeader><CardTitle className="text-sm">Datos del evento y modalidades</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <div><Label className="text-xs">Noches</Label>
                    <Input type="number" value={current.noches}
                      onChange={(e) => patchCurrent({ noches: Number(e.target.value) })}
                      onBlur={guardarCambios} /></div>
                  <div><Label className="text-xs">Jornadas</Label>
                    <Input type="number" value={current.jornadas}
                      onChange={(e) => patchCurrent({ jornadas: Number(e.target.value) })}
                      onBlur={guardarCambios} /></div>
                  <div><Label className="text-xs">Capacidad total</Label>
                    <Input type="number" value={current.capacidad_total}
                      onChange={(e) => patchCurrent({ capacidad_total: Number(e.target.value) })}
                      onBlur={guardarCambios} /></div>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Distribución estimada por paquete (ocupación e ingresos)</Label>
                  <p className="text-xs text-muted-foreground">
                    Esta distribución sirve para proyectar ocupación e ingresos. El prorrateo general usa el total de inscriptos del escenario activo.
                  </p>
                  {escenarioActivo && sumaDistribucion !== escenarioActivo.inscriptos && (
                    <p className="text-xs text-amber-500">
                      La distribución por paquetes suma {sumaDistribucion} y el escenario activo tiene {escenarioActivo.inscriptos} inscriptos:
                      precio y proyección de ingresos usan supuestos distintos.
                    </p>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {packages.map((p) => (
                      <div key={p.id} className="flex items-center gap-2">
                        <span className="text-sm flex-1 truncate">
                          {p.nombre}
                          {Number(p.cupo) > 0 && (
                            <span className="text-muted-foreground"> · capacidad {Number(p.cupo)} plazas</span>
                          )}
                        </span>
                        <Label className="text-[10px] text-muted-foreground">Esperados</Label>
                        <Input type="number" className="w-24"
                          value={Number(current.cantidades_esperadas?.[p.id] ?? 0)}
                          onChange={(e) => patchCurrent({
                            cantidades_esperadas: {
                              ...(current.cantidades_esperadas || {}),
                              [p.id]: Number(e.target.value),
                            },
                          })}
                          onBlur={guardarCambios} />
                      </div>
                    ))}
                    {packages.length === 0 && (
                      <p className="text-xs text-muted-foreground">Cargá paquetes en la pestaña Reservas para poder proyectar.</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Alojamiento por paquete */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-sm">Alojamiento</CardTitle>
                  <p className="text-xs text-muted-foreground mt-1 max-w-xl">
                    El alojamiento se calcula por tipo de habitación/paquete para que cada modalidad tenga su costo y precio sugerido correcto.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setAddLodgingOpen(true)}>
                    <Plus className="w-4 h-4 mr-1" /> Agregar tipo de alojamiento
                  </Button>
                  <Button size="sm" variant="outline" onClick={addLodgingItem}
                    disabled={lodgingPackages.length === 0}>
                    <Plus className="w-4 h-4 mr-1" /> Agregar costo
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {lodgingPackages.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Este evento todavía no tiene paquetes con alojamiento. Creá un tipo de alojamiento para poder costearlo.
                  </p>
                )}
                {lodgingItems.length === 0 && lodgingPackages.length > 0 && (
                  <p className="text-xs text-muted-foreground">Sin costos de alojamiento cargados aún.</p>
                )}
                {lodgingItems.map((it) => (
                  <LodgingCostRow
                    key={it.id}
                    item={it as any}
                    packages={lodgingPackages as any}
                    rooms={rooms as any}
                    monedaBase={current.moneda_base}
                    nochesDefault={Number(current.noches || 0)}
                    esperados={(current.cantidades_esperadas || {}) as Record<string, number>}
                    onUpdate={(patch) => updateItem(it.id, patch as any)}
                    onDelete={() => delItem(it.id)}
                  />
                ))}
              </CardContent>
            </Card>

            {/* Costos */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-sm">Otros costos estimados</CardTitle>
                {genericItems.length === 0 && (
                  <Button size="sm" variant="outline" onClick={addItem}>
                    <Plus className="w-4 h-4 mr-1" /> Agregar
                  </Button>
                )}
              </CardHeader>
              <CardContent className="space-y-2">
                {genericItems.length === 0 && <p className="text-xs text-muted-foreground">Sin costos cargados aún.</p>}
                {genericItems.map((it) => (
                  <div key={it.id} className="grid grid-cols-12 gap-2 items-center border rounded-md p-2">
                    <Select value={it.categoria} onValueChange={(v) => {
                      if (v === "alojamiento") {
                        updateItem(it.id, {
                          categoria: v,
                          detalle: {
                            package_id: null,
                            cost_basis: "habitacion_noche",
                            habitaciones: 0,
                            noches: Number(current.noches || 0),
                            personas_por_habitacion: 1,
                            tipo_habitacion: null,
                          },
                        } as any);
                      } else {
                        updateItem(it.id, { categoria: v });
                      }
                    }}>
                      <SelectTrigger className="col-span-2 h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CATEGORIAS_COSTO.map((c) => <SelectItem key={c} value={c}>{CATEGORIA_LABELS[c]}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Input className="col-span-3 h-8" placeholder="Descripción"
                      value={it.descripcion}
                      onChange={(e) => patchItem(it.id, { descripcion: e.target.value })}
                      onBlur={() => commitItem(it.id)} />
                    <Input type="number" className="col-span-1 h-8" placeholder="Cant"
                      value={it.cantidad}
                      onChange={(e) => patchItem(it.id, { cantidad: Number(e.target.value) })}
                      onBlur={() => commitItem(it.id)} />
                    <Input type="number" className="col-span-2 h-8" placeholder="Precio"
                      value={it.precio_unitario}
                      onChange={(e) => patchItem(it.id, { precio_unitario: Number(e.target.value) })}
                      onBlur={() => commitItem(it.id)} />
                    <Select value={it.moneda} onValueChange={(v) => updateItem(it.id, { moneda: v })}>
                      <SelectTrigger className="col-span-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {MONEDAS.map((m) => <SelectItem key={m.value} value={m.value}>{m.value}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <label className="col-span-2 flex items-center gap-2 text-xs">
                      <Checkbox checked={it.es_por_persona}
                        onCheckedChange={(v) => updateItem(it.id, { es_por_persona: !!v })} />
                      Por persona
                    </label>
                    <div className="col-span-1 flex items-center justify-end gap-0.5">
                      <Button variant="ghost" size="icon" className="h-8 w-7"
                        title="Duplicar gasto" onClick={() => duplicarItem(it)}>
                        <Copy className="w-4 h-4 text-muted-foreground" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-7"
                        title="Eliminar" onClick={() => delItem(it.id)}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>

                    {modalidades.length > 0 && (
                      <div className="col-span-12 flex flex-wrap gap-1 pl-1">
                        <span className="text-[10px] text-muted-foreground mr-1">Aplica a:</span>
                        {modalidades.map((m) => {
                          const active = it.aplica_a_modalidades?.length === 0 || it.aplica_a_modalidades?.includes(m.key);
                          return (
                            <Badge key={m.key}
                              variant={active ? "default" : "outline"}
                              className="cursor-pointer text-[10px]"
                              onClick={() => {
                                const cur = it.aplica_a_modalidades || [];
                                let next: string[];
                                if (cur.length === 0) {
                                  // was "todas": deselect this one
                                  next = modalidades.filter((x) => x.key !== m.key).map((x) => x.key);
                                } else if (cur.includes(m.key)) {
                                  next = cur.filter((k) => k !== m.key);
                                } else {
                                  next = [...cur, m.key];
                                }
                                if (next.length === modalidades.length) next = [];
                                updateItem(it.id, { aplica_a_modalidades: next });
                              }}>{m.label}</Badge>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
                {genericItems.length > 0 && (
                  <Button variant="outline" className="w-full" onClick={addItem}>
                    <Plus className="w-4 h-4 mr-1" /> Agregar otro costo
                  </Button>
                )}
              </CardContent>
            </Card>


            {/* Resultados */}
            {calculo && (
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-sm">Resultados</CardTitle>
                  <Button size="sm" variant="gold" onClick={abrirAplicar}
                    disabled={modalidades.length === 0}>
                    Aplicar precios a paquetes
                  </Button>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <div className="bg-muted/40 rounded p-3">
                      <div className="text-xs text-muted-foreground">Costo total (con imprevistos)</div>
                      <div className="font-semibold">{formatPrice(calculo.total_con_imprevistos, current.moneda_base)}</div>
                    </div>
                    <div className="bg-muted/40 rounded p-3">
                      <div className="text-xs text-muted-foreground">Ingreso esperado</div>
                      <div className="font-semibold">{formatPrice(calculo.ingreso_esperado, current.moneda_base)}</div>
                    </div>
                    <div className="bg-muted/40 rounded p-3">
                      <div className="text-xs text-muted-foreground">Margen estimado</div>
                      <div className={`font-semibold ${calculo.margen_estimado < 0 ? "text-destructive" : "text-emerald-500"}`}>
                        {(calculo.margen_estimado * 100).toFixed(1)}%
                      </div>
                    </div>
                    <div className="bg-muted/40 rounded p-3">
                      <div className="text-xs text-muted-foreground">Punto de equilibrio</div>
                      <div className="font-semibold">{calculo.punto_equilibrio} personas</div>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">Costo y precio sugerido por modalidad</div>
                    <div className="grid gap-2">
                      {modalidades.map((m) => (
                        <div key={m.key} className="flex items-center gap-3 text-sm border rounded-md p-2">
                          <div className="flex-1 truncate">{m.label} <span className="text-xs text-muted-foreground">({m.esperados} pax)</span></div>
                          <div className="text-xs text-muted-foreground">
                            Costo unit: {formatPrice((calculo.costo_por_modalidad[m.key] || 0) / (m.esperados || 1), current.moneda_base)}
                          </div>
                          <div className="font-semibold">
                            Sug: {formatPrice(calculo.precio_sugerido_por_modalidad[m.key] || 0, current.moneda_base)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">Por categoría</div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                      {Object.entries(calculo.por_categoria).map(([k, v]) => (
                        <div key={k} className="flex justify-between border-b py-1">
                          <span className="capitalize">{CATEGORIA_LABELS[k] || k}</span>
                          <span>{formatPrice(v, current.moneda_base)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Notas */}
            <Card>
              <CardContent className="pt-6">
                <Label className="text-xs">Notas</Label>
                <Textarea value={current.notas || ""}
                  onChange={(e) => patchCurrent({ notas: e.target.value })}
                  onBlur={guardarCambios} rows={2} />
                <div className="pt-3 text-right">
                  <Button size="sm" variant="outline" onClick={guardarCambios}>
                    <Save className="w-4 h-4 mr-1" /> Guardar cambios
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ============ REAL ============ */}
          <TabsContent value="real" className="space-y-4 pt-4">
            <Card>
              <CardHeader><CardTitle className="text-sm">Participantes reales</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {modalidades.map((m) => (
                  <div key={m.key} className="flex items-center gap-2">
                    <span className="text-sm flex-1 truncate">{m.label}</span>
                    <Input type="number" className="w-24"
                      value={participantesReales[m.key] ?? m.esperados}
                      onChange={(e) => setParticipantesReales({ ...participantesReales, [m.key]: Number(e.target.value) })}
                      onBlur={guardarParticipantesReales} />
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-sm">Costos reales</CardTitle>
                <Button size="sm" variant="outline" onClick={addActual}>
                  <Plus className="w-4 h-4 mr-1" /> Agregar costo real
                </Button>
              </CardHeader>
              <CardContent className="space-y-2">
                {actuals.length === 0 && <p className="text-xs text-muted-foreground">Aún sin costos reales cargados.</p>}
                {actuals.map((a) => (
                  <div key={a.id} className="grid grid-cols-12 gap-2 items-center border rounded-md p-2">
                    <Select value={a.categoria} onValueChange={(v) => { patchActual(a.id, { categoria: v }); commitActual(a.id); }}>
                      <SelectTrigger className="col-span-2 h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CATEGORIAS_COSTO.map((c) => <SelectItem key={c} value={c}>{CATEGORIA_LABELS[c]}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Input className="col-span-5 h-8" placeholder="Descripción"
                      value={a.descripcion}
                      onChange={(e) => patchActual(a.id, { descripcion: e.target.value })}
                      onBlur={() => commitActual(a.id)} />
                    <Input type="number" className="col-span-2 h-8"
                      value={a.monto_real}
                      onChange={(e) => patchActual(a.id, { monto_real: Number(e.target.value) })}
                      onBlur={() => commitActual(a.id)} />
                    <Select value={a.moneda} onValueChange={(v) => { patchActual(a.id, { moneda: v }); commitActual(a.id); }}>
                      <SelectTrigger className="col-span-2 h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {MONEDAS.map((m) => <SelectItem key={m.value} value={m.value}>{m.value}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Button variant="ghost" size="icon" className="col-span-1 h-8 w-8"
                      onClick={() => delActual(a.id)}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Comparativa */}
            {calculo && calculoReal && (
              <Card>
                <CardHeader><CardTitle className="text-sm">Comparativa Estimado vs Real</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <div className="bg-muted/40 rounded p-3">
                      <div className="text-xs text-muted-foreground">Costo estimado</div>
                      <div className="font-semibold">{formatPrice(calculo.total_con_imprevistos, current.moneda_base)}</div>
                    </div>
                    <div className="bg-muted/40 rounded p-3">
                      <div className="text-xs text-muted-foreground">Costo real</div>
                      <div className="font-semibold">{formatPrice(calculoReal.total_con_imprevistos, current.moneda_base)}</div>
                    </div>
                    <div className="bg-muted/40 rounded p-3">
                      <div className="text-xs text-muted-foreground">Desvío</div>
                      {(() => {
                        const dif = calculoReal.total_con_imprevistos - calculo.total_con_imprevistos;
                        const pct = calculo.total_con_imprevistos > 0
                          ? (dif / calculo.total_con_imprevistos) * 100 : 0;
                        return (
                          <div className={`font-semibold ${Math.abs(pct) > 15 ? "text-destructive" : ""}`}>
                            {formatPrice(dif, current.moneda_base)} ({pct.toFixed(1)}%)
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">Por categoría</div>
                    <div className="grid gap-1 text-xs">
                      {Array.from(new Set([...Object.keys(calculo.por_categoria), ...Object.keys(calculoReal.por_categoria)])).map((k) => {
                        const est = calculo.por_categoria[k] || 0;
                        const real = calculoReal.por_categoria[k] || 0;
                        const dif = real - est;
                        const pct = est > 0 ? (dif / est) * 100 : 0;
                        return (
                          <div key={k} className={`grid grid-cols-4 gap-2 border-b py-1 ${Math.abs(pct) > 15 ? "bg-destructive/5" : ""}`}>
                            <span>{CATEGORIA_LABELS[k] || k}</span>
                            <span>Est: {formatPrice(est, current.moneda_base)}</span>
                            <span>Real: {formatPrice(real, current.moneda_base)}</span>
                            <span className={Math.abs(pct) > 15 ? "text-destructive font-medium" : ""}>
                              {dif >= 0 ? "+" : ""}{pct.toFixed(1)}%
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      )}

      {/* Aplicar precios */}
      <AlertDialog open={applyDialog} onOpenChange={setApplyDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Aplicar precios sugeridos a los paquetes</AlertDialogTitle>
            <AlertDialogDescription>
              Elegí a qué modalidades aplicar el precio calculado. Esto sobrescribe el precio actual del paquete.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 max-h-72 overflow-auto py-2">
            {calculo && modalidades.map((m) => {
              const pkg = packages.find((p) => p.id === m.key);
              const sug = Math.round(calculo.precio_sugerido_por_modalidad[m.key] || 0);
              return (
                <label key={m.key} className="flex items-center gap-2 text-sm border rounded-md p-2">
                  <Checkbox checked={!!applyMap[m.key]}
                    onCheckedChange={(v) => setApplyMap({ ...applyMap, [m.key]: !!v })} />
                  <div className="flex-1">
                    <div className="font-medium">{m.label}</div>
                    <div className="text-xs text-muted-foreground">
                      Actual: {formatPrice(Number(pkg?.precio ?? 0), pkg?.currency || current.moneda_base)} →{" "}
                      Sugerido: {formatPrice(sug, current.moneda_base)}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={aplicarPrecios}>Aplicar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {current && (
        <AddLodgingTypeDialog
          open={addLodgingOpen}
          onOpenChange={setAddLodgingOpen}
          eventId={eventId}
          monedaBase={current.moneda_base}
          nextSortOrder={nextSortOrder}
          onCreated={async (packageId, cupo) => {
            // Escenario de venta inicial: 100% de ocupación del nuevo tipo de alojamiento.
            if (current && cupo > 0) {
              const existing = (current.cantidades_esperadas || {}) as Record<string, number>;
              if (existing[packageId] === undefined || existing[packageId] === null) {
                await supabase.from("event_cost_simulations")
                  .update({ cantidades_esperadas: { ...existing, [packageId]: cupo } as any })
                  .eq("id", current.id);
              }
            }
            loadSims();
          }}
        />
      )}
    </div>

  );
}
