import { useEffect, useMemo, useRef, useState, useCallback } from "react";
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
import { planRoomSync, capacityReductionError } from "@/lib/lodgingCapacity";
import CostGroupSection from "@/components/admin/CostGroupSection";

import {
  calcularSimulacion, CATEGORIAS_COSTO, CATEGORIA_LABELS, GRUPO_LABELS, inferGrupoCosto,
  type CostItem, type GrupoCosto, type Modalidad, type Supuestos,
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
  rentabilidad_modo: string;
  honorario_por_participante: number;
  moneda_base: string;

  noches: number; jornadas: number; capacidad_total: number;
  cantidades_esperadas: Record<string, number>;
  escenarios_inscripcion: EscenarioInscripcion[] | null;
  escenario_activo_id: string | null;
  paquete_base_id: string | null;
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
    rentabilidad_modo: current.rentabilidad_modo || "margen",
    honorario_por_participante: Number(current.honorario_por_participante) || 0,
    paquete_base_id: current.paquete_base_id || null,
  } : null;


  const lodgingPackages = useMemo(
    () => packages.filter((p) => p.sin_alojamiento !== true),
    [packages],
  );
  const grupoDe = (it: ItemRow): GrupoCosto => inferGrupoCosto(it);
  const lodgingItems = useMemo(() => items.filter((i) => grupoDe(i) === "alojamiento"), [items]);
  const participanteItems = useMemo(() => items.filter((i) => grupoDe(i) === "participante"), [items]);
  const staffItems = useMemo(() => items.filter((i) => grupoDe(i) === "staff"), [items]);
  const generalItems = useMemo(() => items.filter((i) => grupoDe(i) === "general"), [items]);

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

  /** Sugerencia no destructiva: el alojamiento por persona más barato, sólo si es inequívoco. */
  const sugerenciaPaqueteBase = useMemo(() => {
    if (!calculo) return null;
    const cand = lodgingPackages
      .map((p) => ({ p, costo: calculo.costo_alojamiento_unitario_por_modalidad[p.id] || 0 }))
      .filter((x) => x.costo > 0)
      .sort((a, b) => a.costo - b.costo);
    if (cand.length === 0) return null;
    if (cand.length > 1 && cand[0].costo === cand[1].costo) return null;
    return cand[0].p;
  }, [calculo, lodgingPackages]);

  /** Snapshot único de `resultados`: toda edición persistida (item, alojamiento,
   *  escenario, supuestos, paquete base) refresca el cálculo guardado. */
  const snapshotRef = useRef<{ id: string; hash: string } | null>(null);
  const calculoHash = calculo ? JSON.stringify(calculo) : "";
  useEffect(() => {
    if (!currentId || !calculoHash) return;
    if (snapshotRef.current?.id === currentId && snapshotRef.current.hash === calculoHash) return;
    const t = setTimeout(async () => {
      snapshotRef.current = { id: currentId, hash: calculoHash };
      await supabase.from("event_cost_simulations")
        .update({ resultados: JSON.parse(calculoHash) })
        .eq("id", currentId);
    }, 900);
    return () => clearTimeout(t);
  }, [currentId, calculoHash]);


  /* ─── CRUD simulaciones ─── */
  const nuevaVersion = async (duplicarDe?: SimRow) => {
    const maxV = sims.reduce((a, s) => Math.max(a, s.version), 0);
    const base: any = duplicarDe ? {
      tc_usd: duplicarDe.tc_usd, tc_eur: duplicarDe.tc_eur,
      pct_imprevistos: duplicarDe.pct_imprevistos,
      pct_margen_objetivo: duplicarDe.pct_margen_objetivo,
      rentabilidad_modo: duplicarDe.rentabilidad_modo || "margen",
      honorario_por_participante: duplicarDe.honorario_por_participante || 0,
      moneda_base: duplicarDe.moneda_base,

      noches: duplicarDe.noches, jornadas: duplicarDe.jornadas,
      capacidad_total: duplicarDe.capacidad_total,
      cantidades_esperadas: duplicarDe.cantidades_esperadas,
      escenarios_inscripcion: duplicarDe.escenarios_inscripcion || [],
      escenario_activo_id: duplicarDe.escenario_activo_id,
      paquete_base_id: duplicarDe.paquete_base_id,

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
      rentabilidad_modo: current.rentabilidad_modo || "margen",
      honorario_por_participante: Number(current.honorario_por_participante) || 0,
      moneda_base: current.moneda_base,

      noches: current.noches, jornadas: current.jornadas,
      capacidad_total: current.capacidad_total,
      cantidades_esperadas: current.cantidades_esperadas,
      escenarios_inscripcion: (current.escenarios_inscripcion || []) as any,
      escenario_activo_id: current.escenario_activo_id,
      paquete_base_id: current.paquete_base_id,

      resultados: calculo as any,
    }).eq("id", current.id);
    toast({ title: "Guardado" });
  };

  const patchCurrent = (patch: Partial<SimRow>) => {
    if (!current) return;
    setSims((old) => old.map((s) => s.id === current.id ? { ...s, ...patch } : s));
  };

  /* ─── ítems ─── */
  const SUBCAT_DEFAULT: Record<Exclude<GrupoCosto, "alojamiento">, string> = {
    participante: "comida",
    staff: "staff",
    general: "otros",
  };

  const addItem = async (grupo: Exclude<GrupoCosto, "alojamiento"> = "general") => {
    if (!current) return;
    const { data } = await supabase.from("event_cost_items").insert({
      simulation_id: current.id,
      grupo_costo: grupo,
      categoria: SUBCAT_DEFAULT[grupo],
      descripcion: "",
      cantidad: 1,
      precio_unitario: 0,
      moneda: current.moneda_base,
      es_por_persona: grupo === "participante",
      aplica_a_modalidades: [],
      orden: items.length,
    } as any).select().single();
    if (data) setItems([...items, data as any]);
  };


  /** Crea la línea principal de costo de un alojamiento recién creado. */
  const addLodgingItemFor = async (opts: {
    packageId: string;
    habitaciones: number;
    personas: number;
    tipo: string | null;
    cost_basis: string;
    precio_unitario: number;
    moneda: string;
    descripcion: string;
    noches: number;
  }) => {
    if (!current) return;
    const { data } = await supabase.from("event_cost_items").insert({
      simulation_id: current.id,
      grupo_costo: "alojamiento",
      categoria: "alojamiento",
      descripcion: opts.descripcion || "",
      cantidad: 1,
      precio_unitario: Number(opts.precio_unitario) || 0,
      moneda: opts.moneda || current.moneda_base,
      es_por_persona: false,
      aplica_a_modalidades: [],
      orden: items.length,
      detalle: {
        package_id: opts.packageId,
        cost_basis: opts.cost_basis,
        habitaciones: opts.habitaciones,
        noches: Number(opts.noches) || 0,
        personas_por_habitacion: opts.personas,
        tipo_habitacion: opts.tipo,
      },
    } as any).select().single();
    if (data) setItems((old) => [...old, data as any]);
  };

  /** Reservas activas por paquete (guard de reducción de capacidad). */
  const [reservasActivas, setReservasActivas] = useState<Record<string, number>>({});
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("event_reservations")
        .select("package_id, reservation_status")
        .eq("event_id", eventId);
      const counts: Record<string, number> = {};
      (data || []).forEach((r: any) => {
        if (!r.package_id) return;
        if (r.reservation_status === "cancelada" || r.reservation_status === "rechazada") return;
        counts[r.package_id] = (counts[r.package_id] || 0) + 1;
      });
      setReservasActivas(counts);
    })();
  }, [eventId]);

  /** Renombra la modalidad/paquete sin tocar precio ni seña. */
  const renamePackage = async (packageId: string, nombre: string) => {
    const { error } = await supabase.from("event_packages").update({ nombre }).eq("id", packageId);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    setPackages((old) => old.map((p) => p.id === packageId ? { ...p, nombre } : p));
  };

  /** Sincroniza habitaciones/personas → event_rooms + cupo del paquete. */
  const syncLodgingStructure = async (packageId: string, habitaciones: number, personas: number) => {
    const pkg = packages.find((p) => p.id === packageId);
    const existing = rooms.filter((r) => r.package_id === packageId);
    const plan = planRoomSync({
      existing: existing as any,
      habitaciones,
      personas,
      tipo: (existing[0]?.tipo as string) || null,
      label: pkg?.nombre || "Habitación",
    });

    const guard = capacityReductionError(plan.capacidad, reservasActivas[packageId] || 0);
    if (guard) { toast({ title: "No se puede reducir la capacidad", description: guard, variant: "destructive" }); return; }

    if (plan.toDeleteIds.length > 0) {
      await supabase.from("event_rooms").delete().in("id", plan.toDeleteIds);
    }
    for (const u of plan.toUpdate) {
      await supabase.from("event_rooms").update({ capacidad: u.capacidad }).eq("id", u.id);
    }
    let inserted: any[] = [];
    if (plan.toInsert.length > 0) {
      const { data } = await supabase.from("event_rooms").insert(
        plan.toInsert.map((r) => ({ ...r, event_id: eventId, package_id: packageId })) as any,
      ).select("id, package_id, nombre, capacidad, tipo, sort_order");
      inserted = (data as any) || [];
    }
    await supabase.from("event_packages")
      .update({ cupo: plan.capacidad, personas_por_habitacion: personas })
      .eq("id", packageId);

    setRooms((old) => [
      ...old
        .filter((r) => !plan.toDeleteIds.includes(r.id))
        .map((r) => {
          const upd = plan.toUpdate.find((u) => u.id === r.id);
          return upd ? { ...r, capacidad: upd.capacidad } : r;
        }),
      ...inserted,
    ]);
    setPackages((old) => old.map((p) =>
      p.id === packageId ? { ...p, cupo: plan.capacidad, personas_por_habitacion: personas } : p));
  };


  const patchItem = async (id: string, patch: Partial<ItemRow>) => {
    setItems((old) => old.map((i) => i.id === id ? { ...i, ...patch } : i));
  };

  const persistItem = async (it: ItemRow) => {
    await supabase.from("event_cost_items").update({
      grupo_costo: inferGrupoCosto(it),
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
      grupo_costo: inferGrupoCosto(it),
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
  /** Sólo se puede aplicar precio si hay esperados y un precio sugerido válido. */
  const modalidadAplicable = (key: string) => {
    if (!calculo || !calculo.paquete_base_id) return false;
    return (calculo.precio_final_por_modalidad[key] || 0) > 0;
  };

  /** Precio que se aplicaría: paquete base = precio base; el resto = base + suplemento. */
  const precioAAplicar = (key: string) =>
    Math.round(calculo?.precio_final_por_modalidad[key] || 0);

  const abrirAplicar = () => {
    const initial: Record<string, boolean> = {};
    modalidades.forEach((m) => (initial[m.key] = modalidadAplicable(m.key)));
    setApplyMap(initial);
    setApplyDialog(true);
  };
  const aplicarPrecios = async () => {
    if (!calculo || !current) return;
    const targets = modalidades.filter((m) => applyMap[m.key] && modalidadAplicable(m.key));
    if (targets.length === 0) {
      toast({
        title: "No hay precios sugeridos válidos para aplicar",
        description: "Elegí el alojamiento base del precio para poder calcular precio base y suplementos.",
        variant: "destructive",
      });
      return;
    }
    const updates = targets.map((m) => {
      const precio = precioAAplicar(m.key);
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
              <CardContent className="grid grid-cols-2 md:grid-cols-6 gap-3">
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
                <div><Label className="text-xs">Modelo de rentabilidad</Label>
                  <Select value={current.rentabilidad_modo || "margen"}
                    onValueChange={(v) => { patchCurrent({ rentabilidad_modo: v }); setTimeout(guardarCambios, 0); }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="margen">Margen objetivo</SelectItem>
                      <SelectItem value="honorario_participante">Honorario por participante</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {current.rentabilidad_modo === "honorario_participante" ? (
                  <div><Label className="text-xs">Honorario por participante ({current.moneda_base})</Label>
                    <Input type="number" value={current.honorario_por_participante ?? 0}
                      onChange={(e) => patchCurrent({ honorario_por_participante: Number(e.target.value) })}
                      onBlur={guardarCambios} /></div>
                ) : (
                  <div><Label className="text-xs">% Margen objetivo</Label>
                    <Input type="number" value={current.pct_margen_objetivo}
                      onChange={(e) => patchCurrent({ pct_margen_objetivo: Number(e.target.value) })}
                      onBlur={guardarCambios} /></div>
                )}

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
                  <Label className="text-xs">Alojamiento base del precio</Label>
                  <p className="text-xs text-muted-foreground">
                    El precio del viaje se calcula sobre este alojamiento. Las demás modalidades se venden como precio base + suplemento.
                  </p>
                  <Select
                    value={current.paquete_base_id || "none"}
                    onValueChange={(v) => {
                      patchCurrent({ paquete_base_id: v === "none" ? null : v });
                      supabase.from("event_cost_simulations")
                        .update({ paquete_base_id: v === "none" ? null : v })
                        .eq("id", current.id).then(() => {});
                    }}>
                    <SelectTrigger className="w-full md:w-96">
                      <SelectValue placeholder="Elegí el alojamiento base" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sin definir</SelectItem>
                      {lodgingPackages.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {!current.paquete_base_id && sugerenciaPaqueteBase && (
                    <p className="text-xs text-muted-foreground">
                      Sugerencia: el alojamiento más económico es <b>{sugerenciaPaqueteBase.nombre}</b>.{" "}
                      <Button variant="link" className="h-auto p-0 text-xs"
                        onClick={() => {
                          patchCurrent({ paquete_base_id: sugerenciaPaqueteBase.id });
                          supabase.from("event_cost_simulations")
                            .update({ paquete_base_id: sugerenciaPaqueteBase.id })
                            .eq("id", current.id).then(() => {});
                        }}>
                        Usarlo como base
                      </Button>
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Distribución del escenario activo</Label>
                  <p className="text-xs text-muted-foreground">
                    Asignados {sumaDistribucion} de {escenarioActivo?.inscriptos ?? 0}. Sirve para ocupación y suplementos;
                    staff y generales siempre se prorratean sobre los inscriptos del escenario activo.
                  </p>
                  {escenarioActivo && sumaDistribucion !== escenarioActivo.inscriptos && (
                    <p className="text-xs text-amber-500">
                      El escenario activo tiene {escenarioActivo.inscriptos} participantes pero la distribución suma {sumaDistribucion}:
                      no se muestran ingreso, ganancia ni margen del escenario hasta que coincidan. Los precios base y suplementos sí son válidos.
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
                    Cada alojamiento es una ficha con su estructura física y su costo, para que cada modalidad tenga su costo y precio sugerido correcto.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setAddLodgingOpen(true)}>
                    <Plus className="w-4 h-4 mr-1" /> Agregar alojamiento
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {lodgingItems.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Todavía no hay alojamientos cargados. Agregá uno para presupuestarlo.
                  </p>
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
                    reservasActivas={reservasActivas}
                    onUpdate={(patch) => updateItem(it.id, patch as any)}
                    onDelete={() => delItem(it.id)}
                    onRenamePackage={renamePackage}
                    onSyncStructure={syncLodgingStructure}
                  />
                ))}

              </CardContent>
            </Card>

            {/* Costos por grupo de decisión */}
            <CostGroupSection
              grupo="participante"
              titulo={GRUPO_LABELS.participante}
              descripcion="Costos que se repiten por cada persona inscripta (comidas, remeras, seguros). Impactan directo en el costo unitario del paquete."
              items={participanteItems as any}
              modalidades={modalidades}
              monedaBase={current.moneda_base}
              headline={`${formatPrice(calculo?.costo_participante_directo_unitario || 0, current.moneda_base)} por participante`}
              subheadline={calculo ? `${formatPrice(calculo.costo_participante_total, current.moneda_base)} total · escenario ${calculo.escenario_inscriptos} pax` : "por participante"}

              onAdd={() => addItem("participante")}
              onPatch={patchItem as any}
              onCommit={commitItem}
              onUpdate={updateItem as any}
              onDuplicate={duplicarItem as any}
              onDelete={delItem}
            />

            <CostGroupSection
              grupo="staff"
              titulo={GRUPO_LABELS.staff}
              descripcion="Costos del equipo (pasajes, alojamiento de staff, honorarios). Son fijos y se prorratean entre todos los inscriptos del escenario activo."
              items={staffItems as any}
              modalidades={modalidades}
              monedaBase={current.moneda_base}
              headline={`${formatPrice(calculo?.costo_staff_total || 0, current.moneda_base)} total staff`}
              subheadline={calculo ? `${formatPrice(calculo.costo_staff_por_persona, current.moneda_base)} por participante · escenario ${calculo.escenario_inscriptos} pax` : "total"}

              onAdd={() => addItem("staff")}
              onPatch={patchItem as any}
              onCommit={commitItem}
              onUpdate={updateItem as any}
              onDuplicate={duplicarItem as any}
              onDelete={delItem}
            />

            <CostGroupSection
              grupo="general"
              titulo={GRUPO_LABELS.general}
              descripcion="Costos generales del evento (vehículos, logística, marketing). Se prorratean por igual entre todos los inscriptos del escenario activo."
              items={generalItems as any}
              modalidades={modalidades}
              monedaBase={current.moneda_base}
              headline={`${formatPrice(calculo?.costo_general_total || 0, current.moneda_base)} total generales`}
              subheadline={calculo ? `${formatPrice(calculo.costo_general_por_persona, current.moneda_base)} por participante · sin staff` : "total"}

              onAdd={() => addItem("general")}
              onPatch={patchItem as any}
              onCommit={commitItem}
              onUpdate={updateItem as any}
              onDuplicate={duplicarItem as any}
              onDelete={delItem}
            />


            {/* Escenarios de inscripción */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-sm">Escenarios de inscripción</CardTitle>
                  <p className="text-xs text-muted-foreground mt-1 max-w-xl">
                    El total de inscriptos del escenario activo es el denominador del prorrateo de los costos generales del viaje.
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => {
                  const next = [...escenarios, {
                    id: `esc_${Date.now()}`, nombre: "Personalizado",
                    inscriptos: escenarioActivo?.inscriptos || 0,
                  }];
                  persistEscenarios(next);
                }}>
                  <Plus className="w-4 h-4 mr-1" /> Agregar escenario
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  {escenarios.map((e, idx) => {
                    const activo = escenarioActivo?.id === e.id;
                    return (
                      <div key={e.id}
                        className={`border rounded-md p-3 space-y-2 ${activo ? "border-primary bg-primary/5" : ""}`}>
                        <div className="flex items-center gap-2">
                          <Input className="h-8 text-sm" value={e.nombre}
                            onChange={(ev) => {
                              const next = escenarios.map((x, i) => i === idx ? { ...x, nombre: ev.target.value } : x);
                              patchCurrent({ escenarios_inscripcion: next });
                            }}
                            onBlur={() => persistEscenarios(escenarios)} />
                          {escenarios.length > 1 && (
                            <Button variant="ghost" size="icon" className="h-8 w-7" title="Eliminar escenario"
                              onClick={() => {
                                const next = escenarios.filter((_, i) => i !== idx);
                                persistEscenarios(next, activo ? next[0]?.id ?? null : undefined);
                              }}>
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Label className="text-[10px] text-muted-foreground">Inscriptos</Label>
                          <Input type="number" className="h-8 w-24" value={e.inscriptos}
                            onChange={(ev) => {
                              const next = escenarios.map((x, i) => i === idx ? { ...x, inscriptos: Number(ev.target.value) } : x);
                              patchCurrent({ escenarios_inscripcion: next });
                            }}
                            onBlur={() => persistEscenarios(escenarios)} />
                        </div>
                        {activo ? (
                          <Badge className="text-[10px]">Activo · usado para precios</Badge>
                        ) : (
                          <Button size="sm" variant="outline" className="w-full h-7 text-xs"
                            onClick={() => persistEscenarios(escenarios, e.id)}>
                            Usar para precios
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
                {calculo && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
                    <div className="bg-muted/40 rounded p-3">
                      <div className="text-xs text-muted-foreground">Costos generales prorrateables</div>
                      <div className="font-semibold">{formatPrice(calculo.costos_generales_prorrateables, current.moneda_base)}</div>
                    </div>
                    <div className="bg-muted/40 rounded p-3">
                      <div className="text-xs text-muted-foreground">Escenario activo</div>
                      <div className="font-semibold">{escenarioActivo?.inscriptos ?? 0} inscriptos</div>
                    </div>
                    <div className="bg-muted/40 rounded p-3">
                      <div className="text-xs text-muted-foreground">Prorrateo general</div>
                      <div className="font-semibold">
                        {formatPrice(calculo.prorrateo_general_por_persona, current.moneda_base)} por participante
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>


            {/* Resultados */}
            {calculo && (
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-sm">Resultados</CardTitle>
                  <Button size="sm" variant="gold" onClick={abrirAplicar}
                    disabled={modalidades.length === 0 || !calculo.distribucion_valida || !calculo.paquete_base_id}>
                    Aplicar precios a paquetes
                  </Button>
                </CardHeader>
                <CardContent className="space-y-4">
                  {!calculo.distribucion_valida && (
                    <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive space-y-1">
                      <div className="font-semibold">
                        Distribución desalineada: el escenario activo tiene {calculo.escenario_inscriptos} participantes
                        y la distribución por paquetes suma {calculo.distribucion_total}
                        {" "}({calculo.distribucion_total > calculo.escenario_inscriptos
                          ? `sobran ${calculo.distribucion_total - calculo.escenario_inscriptos}`
                          : `faltan ${calculo.escenario_inscriptos - calculo.distribucion_total}`} plazas).
                      </div>
                      <div>
                        La proyección de ingreso, ganancia y margen no es válida y no se pueden aplicar precios a los paquetes
                        hasta alinear la distribución. Los costos y precios unitarios base sí siguen siendo una simulación válida.
                      </div>
                    </div>
                  )}

                  {/* Precio base del viaje */}
                  <div className="rounded-md border p-3 space-y-1 text-sm">
                    <div className="text-xs text-muted-foreground">Precio base del viaje</div>
                    <div className="font-semibold">
                      {calculo.paquete_base_id
                        ? `${modalidades.find((m) => m.key === calculo.paquete_base_id)?.label || "Paquete base"} (base)`
                        : "Elegí el alojamiento base del precio"}
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1 text-xs text-muted-foreground pt-1">
                      <div>Alojamiento base: {formatPrice(calculo.costo_alojamiento_base_unitario, current.moneda_base)}/pax</div>
                      <div>Participante: {formatPrice(calculo.costo_participante_directo_unitario, current.moneda_base)}/pax</div>
                      <div>Staff: {formatPrice(calculo.costo_staff_por_persona, current.moneda_base)}/pax</div>
                      <div>Generales: {formatPrice(calculo.costo_general_por_persona, current.moneda_base)}/pax</div>
                      <div>Imprevistos: {Number(current.pct_imprevistos) || 0}% (ya incluidos)</div>
                      <div>Escenario activo: {calculo.escenario_inscriptos} pax</div>
                    </div>
                    <div className="flex flex-wrap gap-6 pt-2">
                      <div>
                        <div className="text-xs text-muted-foreground">Costo base por participante</div>
                        <div className="font-semibold">{formatPrice(calculo.costo_base_unitario, current.moneda_base)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Precio base sugerido</div>
                        <div className="font-semibold">
                          {calculo.paquete_base_id ? formatPrice(calculo.precio_base_sugerido, current.moneda_base) : "—"}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Staff + generales prorrateados</div>
                        <div className="font-semibold">
                          {formatPrice(calculo.costo_staff_por_persona + calculo.costo_general_por_persona, current.moneda_base)}/pax
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Suplementos de alojamiento */}
                  <div className="space-y-2">
                    <div className="text-xs text-muted-foreground">Suplementos de alojamiento</div>
                    {modalidades.filter((m) => m.key !== calculo.paquete_base_id).map((m) => {
                      const dif = (calculo.costo_alojamiento_unitario_por_modalidad[m.key] || 0)
                        - calculo.costo_alojamiento_base_unitario;
                      const difSinImp = dif / (1 + (Number(current.pct_imprevistos) || 0) / 100);
                      const supl = calculo.suplemento_precio_por_modalidad[m.key] || 0;
                      const final = calculo.precio_final_por_modalidad[m.key] || 0;
                      const signo = (v: number) => (v >= 0 ? "+" : "−");
                      return (
                        <div key={m.key} className="border rounded-md p-3 text-sm space-y-1">
                          <div className="font-medium">
                            {m.label} <span className="text-xs text-muted-foreground">({m.esperados} pax)</span>
                            {dif < 0 && <span className="text-xs text-emerald-500"> · descuento sobre la base</span>}
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                            <div>Diferencia alojamiento: {signo(difSinImp)}{formatPrice(Math.abs(difSinImp), current.moneda_base)}</div>
                            <div>Con imprevistos: {signo(dif)}{formatPrice(Math.abs(dif), current.moneda_base)}</div>
                            <div>Suplemento sugerido: {signo(supl)}{formatPrice(Math.abs(supl), current.moneda_base)}</div>
                            <div className="text-foreground font-semibold">
                              Precio final: {calculo.paquete_base_id ? formatPrice(final, current.moneda_base) : "—"}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {modalidades.filter((m) => m.key !== calculo.paquete_base_id).length === 0 && (
                      <p className="text-xs text-muted-foreground">No hay otras modalidades de alojamiento.</p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                    <div className="bg-muted/40 rounded p-3">
                      <div className="text-xs text-muted-foreground">Ingreso del escenario</div>
                      <div className="font-semibold">
                        {calculo.escenario_ingreso_total != null
                          ? formatPrice(calculo.escenario_ingreso_total, current.moneda_base) : "—"}
                      </div>
                    </div>
                    <div className="bg-muted/40 rounded p-3">
                      <div className="text-xs text-muted-foreground">Ganancia del escenario</div>
                      <div className="font-semibold">
                        {calculo.escenario_ganancia_total != null
                          ? formatPrice(calculo.escenario_ganancia_total, current.moneda_base) : "—"}
                      </div>
                    </div>
                    <div className="bg-muted/40 rounded p-3">
                      <div className="text-xs text-muted-foreground">Margen del escenario</div>
                      <div className={`font-semibold ${(calculo.escenario_margen ?? 0) < 0 ? "text-destructive" : "text-emerald-500"}`}>
                        {calculo.escenario_margen != null ? `${(calculo.escenario_margen * 100).toFixed(1)}%` : "—"}
                      </div>
                    </div>
                  </div>

                  {/* Vista compacta por paquete */}
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">Resumen por paquete</div>
                    <div className="grid gap-2">
                      {modalidades.map((m) => {
                        const esBase = m.key === calculo.paquete_base_id;
                        const final = calculo.precio_final_por_modalidad[m.key] || 0;
                        const sinCalculo = !calculo.paquete_base_id || final <= 0;
                        return (
                          <div key={m.key} className="flex items-center gap-3 text-sm border rounded-md p-2">
                            <div className="flex-1 truncate">
                              {m.label} <span className="text-xs text-muted-foreground">({m.esperados} pax)</span>
                              {esBase && <span className="text-xs text-emerald-500"> · base</span>}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Alojamiento: {formatPrice(calculo.costo_alojamiento_unitario_por_modalidad[m.key] || 0, current.moneda_base)}
                            </div>
                            <div className="font-semibold">
                              Precio: {sinCalculo ? "—" : formatPrice(final, current.moneda_base)}
                            </div>
                          </div>
                        );
                      })}
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
              const aplicable = modalidadAplicable(m.key);
              const sug = precioAAplicar(m.key);
              const esBase = m.key === calculo.paquete_base_id;
              const supl = Math.round(calculo.suplemento_precio_por_modalidad[m.key] || 0);
              return (
                <label key={m.key}
                  className={`flex items-center gap-2 text-sm border rounded-md p-2 ${aplicable ? "" : "opacity-60"}`}>
                  <Checkbox checked={aplicable && !!applyMap[m.key]} disabled={!aplicable}
                    onCheckedChange={(v) => setApplyMap({ ...applyMap, [m.key]: !!v })} />
                  <div className="flex-1">
                    <div className="font-medium">{m.label}</div>
                    <div className="text-xs text-muted-foreground">
                      Actual: {formatPrice(Number(pkg?.precio ?? 0), pkg?.currency || current.moneda_base)} →{" "}
                      {aplicable
                        ? `${esBase ? "Precio base" : `Base + suplemento ${formatPrice(supl, current.moneda_base)}`}: ${formatPrice(sug, current.moneda_base)}`
                        : "Sin cálculo"}
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
          nochesDefault={Number(current.noches || 0)}
          onCreated={async (res) => {
            // Escenario de venta inicial: 100% de ocupación del nuevo alojamiento.
            if (current && res.cupo > 0) {
              const existing = (current.cantidades_esperadas || {}) as Record<string, number>;
              if (existing[res.packageId] === undefined || existing[res.packageId] === null) {
                await supabase.from("event_cost_simulations")
                  .update({ cantidades_esperadas: { ...existing, [res.packageId]: res.cupo } as any })
                  .eq("id", current.id);
              }
            }
            // Línea principal de costo, para que la ficha quede completa de una.
            await addLodgingItemFor({
              packageId: res.packageId,
              habitaciones: res.habitaciones,
              personas: res.personas,
              tipo: res.tipo,
              ...res.costo,
            });
            loadSims();
          }}
        />
      )}
    </div>

  );
}

