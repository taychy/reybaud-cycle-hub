import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Truck, Plus, ChevronRight, ArrowLeft, Package, CheckCircle2, AlertTriangle, X, ScanLine, Camera } from "lucide-react";
import { toast } from "sonner";
import CameraScanner from "@/components/deposito/CameraScanner";
import EtiquetaExternaCapture from "@/components/deposito/EtiquetaExternaCapture";

interface Sede { id: string; nombre: string; }
interface Carga {
  id: string;
  sede_id: string;
  fecha_salida: string;
  entregador_nombre: string | null;
  estado: string;
  notas: string | null;
  created_at: string;
}
interface CargaItem {
  id: string;
  carga_id: string;
  source_table: string;
  source_id: string;
  cliente_nombre: string;
  producto: string | null;
  variante: string | null;
  cantidad: number;
  estado: string;
  entregado_at: string | null;
  chequeado_at?: string | null;
}
interface CandidateItem {
  id: string;
  source_table: "delivery_list_items" | "store_order_items";
  source_id: string;
  order_id?: string;
  cliente_nombre: string;
  producto: string;
  variante: string | null;
  cantidad: number;
  list_titulo: string;
  grupo: "sede" | "sin_sede" | "otra_sede";
  enCamioneta?: boolean;
}

interface Chequeo {
  id: string;
  carga_id: string;
  ronda: number;
  tipo: "inicial" | "control";
  estado: "en_curso" | "cerrado";
  responsable_nombre: string | null;
  notas: string | null;
  resumen: Record<string, number> | null;
  started_at: string;
  closed_at: string | null;
}
interface DiffRow {
  item_id: string;
  cliente_nombre: string;
  producto: string | null;
  variante: string | null;
  cantidad: number;
  source_table: string;
  en_base: boolean;
  escaneado: boolean;
  informado_entregado: boolean;
  resultado: "presente" | "nuevo" | "entregado_ok" | "faltante_sin_aviso" | "entregado_pero_presente" | "fuera_de_ronda";
}

const estadoBadge = (estado: string) => {
  const map: Record<string, { label: string; variant: any }> = {
    abierta: { label: "Abierta", variant: "default" },
    en_ruta: { label: "En ruta", variant: "secondary" },
    cerrada: { label: "Cerrada", variant: "outline" },
  };
  const cfg = map[estado] || { label: estado, variant: "outline" };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
};

const itemEstadoBadge = (estado: string) => {
  if (estado === "entregado") return <Badge variant="default" className="bg-green-600 hover:bg-green-600">Entregado</Badge>;
  if (estado === "faltante") return <Badge variant="destructive">Faltante</Badge>;
  if (estado === "retornado") return <Badge variant="secondary">Retornado</Badge>;
  return <Badge variant="outline">En caja</Badge>;
};

const DepositoCamioneta = () => {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [cargas, setCargas] = useState<Carga[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ sede_id: "", fecha_salida: new Date().toISOString().slice(0, 10), entregador: "", notas: "" });

  useEffect(() => {
    (async () => {
      const [sRes, cRes] = await Promise.all([
        supabase.from("sedes").select("id,nombre").eq("activa", true).order("nombre"),
        supabase.from("vehiculo_cargas" as any).select("*").order("fecha_salida", { ascending: false }).order("created_at", { ascending: false }),
      ]);
      setSedes((sRes.data as any[]) || []);
      setCargas((cRes.data as any[]) || []);
      setLoading(false);
    })();
  }, []);

  const refresh = async () => {
    const { data } = await supabase.from("vehiculo_cargas" as any).select("*").order("fecha_salida", { ascending: false }).order("created_at", { ascending: false });
    setCargas((data as any[]) || []);
  };

  const handleCreate = async () => {
    if (!form.sede_id) { toast.error("Elegí la sede destino"); return; }
    setCreating(true);
    const { data: existente } = await (supabase as any)
      .from("vehiculo_cargas")
      .select("id")
      .eq("sede_id", form.sede_id)
      .in("estado", ["abierta", "en_ruta"])
      .maybeSingle();
    if (existente?.id) {
      setCreating(false);
      setShowCreate(false);
      toast.info("Esa sede ya tiene una caja activa. Te llevamos a esa.");
      navigate(`/deposito/camioneta/${existente.id}`);
      return;
    }
    const { data: userRes } = await supabase.auth.getUser();
    const { data, error } = await (supabase as any)
      .from("vehiculo_cargas")
      .insert({
        sede_id: form.sede_id,
        fecha_salida: form.fecha_salida,
        entregador_nombre: form.entregador.trim() || null,
        notas: form.notas.trim() || null,
        created_by: userRes.user?.id ?? null,
      })
      .select()
      .single();
    setCreating(false);
    if (error || !data) {
      toast.error(error?.message?.includes("una_activa_por_sede") ? "Esa sede ya tiene una caja activa" : (error?.message || "Error al crear"));
      return;
    }
    toast.success("Carga creada");
    setShowCreate(false);
    setForm({ sede_id: "", fecha_salida: new Date().toISOString().slice(0, 10), entregador: "", notas: "" });
    navigate(`/deposito/camioneta/${data.id}`);
  };

  if (id) return <CargaDetail id={id} sedes={sedes} onBack={() => navigate("/deposito/camioneta")} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Truck className="w-5 h-5 text-primary" />
          <div>
            <h1 className="text-xl font-heading font-bold uppercase tracking-wider">Camioneta</h1>
            <p className="text-xs text-muted-foreground">Salidas de mercadería por sede.</p>
          </div>
        </div>
        <Button variant="gold" size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4 mr-1" /> Nueva carga
        </Button>
      </div>

      {loading ? (
        <div className="py-16 text-center text-muted-foreground animate-pulse">Cargando...</div>
      ) : cargas.length === 0 ? (
        <div className="py-16 text-center">
          <Truck className="w-10 h-10 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground mb-4">No hay cargas registradas.</p>
          <Button variant="gold" size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4 mr-1" /> Crear la primera
          </Button>
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {cargas.map((c) => {
            const sede = sedes.find((s) => s.id === c.sede_id);
            return (
              <Link key={c.id} to={`/deposito/camioneta/${c.id}`} className="glass-card rounded-lg p-4 hover:border-primary/50 border border-transparent flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-foreground truncate">{sede?.nombre || "Sede"}</span>
                    {estadoBadge(c.estado)}
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-3">
                    <span>{c.fecha_salida}</span>
                    {c.entregador_nombre && <span>· {c.entregador_nombre}</span>}
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </Link>
            );
          })}
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nueva carga de camioneta</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Sede destino</Label>
              <Select value={form.sede_id} onValueChange={(v) => setForm({ ...form, sede_id: v })}>
                <SelectTrigger><SelectValue placeholder="Elegí sede" /></SelectTrigger>
                <SelectContent>
                  {sedes.map((s) => <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Fecha de salida</Label>
              <Input type="date" value={form.fecha_salida} onChange={(e) => setForm({ ...form, fecha_salida: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Entregador (opcional)</Label>
              <Input value={form.entregador} onChange={(e) => setForm({ ...form, entregador: e.target.value })} placeholder="Nombre del entregador" />
            </div>
            <div className="space-y-2">
              <Label>Notas (opcional)</Label>
              <Textarea rows={2} value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancelar</Button>
            <Button variant="gold" onClick={handleCreate} disabled={creating}>{creating ? "Creando..." : "Crear"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const CargaDetail = ({ id, sedes, onBack }: { id: string; sedes: Sede[]; onBack: () => void }) => {
  const [carga, setCarga] = useState<Carga | null>(null);
  const [items, setItems] = useState<CargaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [candidates, setCandidates] = useState<CandidateItem[]>([]);
  const [addSearch, setAddSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [addLoading, setAddLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [etiquetaOpen, setEtiquetaOpen] = useState(false);
  const [scanCount, setScanCount] = useState(0);
  const scanBusyRef = useRef(false);
  const [chequeo, setChequeo] = useState<Chequeo | null>(null);
  const [rondas, setRondas] = useState<Chequeo[]>([]);
  const [scannedIds, setScannedIds] = useState<Set<string>>(new Set());
  const [seenQty, setSeenQty] = useState<Record<string, number>>({});
  const [draftSeenQty, setDraftSeenQty] = useState<Record<string, string>>({});
  const [savingSeenIds, setSavingSeenIds] = useState<Set<string>>(new Set());
  const [diff, setDiff] = useState<DiffRow[]>([]);
  const [diffLoading, setDiffLoading] = useState(false);
  const [closingRonda, setClosingRonda] = useState(false);
  const [rondaNotas, setRondaNotas] = useState("");

  const parseClientCode = (code: string): { listId: string; cliente: string } | null => {
    if (!code.startsWith("RBDLV1:")) return null;
    try {
      const b64 = code.slice(7).replace(/-/g, "+").replace(/_/g, "/");
      const raw = decodeURIComponent(escape(atob(b64)));
      const [listId, ...rest] = raw.split("|");
      if (!listId || rest.length === 0) return null;
      return { listId, cliente: rest.join("|") };
    } catch { return null; }
  };

  const norm = (s: string) =>
    (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

  const scannedPathId = (code: string, segment: string): string | null => {
    const match = code.match(new RegExp(`(?:^|/)${segment}/([0-9a-f-]{36})(?:[/?#]|$)`, "i"));
    return match?.[1] || null;
  };

  const seenForItem = (item: CargaItem): number | null => {
    if (Object.prototype.hasOwnProperty.call(seenQty, item.id)) return seenQty[item.id];
    // Compatibilidad con chequeos iniciados antes de guardar cantidad_vista:
    // un scan antiguo significaba que la línea completa había sido confirmada.
    if (scannedIds.has(item.id)) return Number(item.cantidad);
    return null;
  };

  const resolveTargets = async (code: string): Promise<{ label: string; targets: CargaItem[]; dliIds: string[] } | null> => {
    const pendientes = chequeo
      ? items.filter((i) => i.estado !== "entregado" && !scannedIds.has(i.id))
      : items.filter((i) => i.estado !== "entregado" && !i.chequeado_at);

    const scannedOrderId = scannedPathId(code, "pagar-preventa");
    const scannedAlumnoId = scannedPathId(code, "pagar-preventas-alumno");
    if (scannedOrderId) {
      const direct = pendientes.filter(
        (i) => i.source_table === "store_preorders" && i.source_id.toLowerCase() === scannedOrderId.toLowerCase(),
      );
      if (direct.length) return { label: direct[0].cliente_nombre, targets: direct, dliIds: [] };
    }
    if (scannedAlumnoId) {
      const [{ data: orders }, { data: preorders }] = await Promise.all([
        supabase.from("store_orders").select("id").eq("alumno_id", scannedAlumnoId),
        supabase.from("store_preorders").select("id").eq("alumno_id", scannedAlumnoId),
      ]);
      const orderIds = ((orders as any[]) || []).map((row) => row.id);
      const preorderIds = ((preorders as any[]) || []).map((row) => row.id.toLowerCase());
      let storeItemIds: string[] = [];
      if (orderIds.length) {
        const { data: storeItems } = await supabase.from("store_order_items").select("id").in("order_id", orderIds);
        storeItemIds = ((storeItems as any[]) || []).map((row) => row.id);
      }
      const targets = pendientes.filter(
        (i) =>
          (i.source_table === "store_order_items" && storeItemIds.includes(i.source_id)) ||
          (i.source_table === "store_preorders" && preorderIds.includes(i.source_id.toLowerCase())),
      );
      if (targets.length) return { label: targets[0].cliente_nombre, targets, dliIds: [] };
    }

    const parsed = parseClientCode(code);
    if (parsed) {
      const { data: dliRows } = await supabase
        .from("delivery_list_items")
        .select("id, cliente_nombre")
        .eq("list_id", parsed.listId);
      const dliIds = ((dliRows as any[]) || [])
        .filter((r) => norm(r.cliente_nombre) === norm(parsed.cliente))
        .map((r) => r.id);
      return {
        label: parsed.cliente,
        targets: pendientes.filter((i) => i.source_table === "delivery_list_items" && dliIds.includes(i.source_id)),
        dliIds,
      };
    }

    const uuid = code.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0];
    if (uuid) {
      let targets = pendientes.filter((i) => i.source_id.toLowerCase() === uuid.toLowerCase());
      if (targets.length === 0) {
        const { data: soi } = await supabase
          .from("store_order_items")
          .select("id")
          .eq("order_id", uuid);
        const soiIds = ((soi as any[]) || []).map((r) => r.id);
        if (soiIds.length) {
          targets = pendientes.filter((i) => i.source_table === "store_order_items" && soiIds.includes(i.source_id));
        }
      }
      if (targets.length === 0) {
        targets = pendientes.filter((i) => i.source_table === "store_preorders" && i.source_id.toLowerCase() === uuid.toLowerCase());
      }
      if (targets.length === 0) {
        const [{ data: ordersOfAlumno }, { data: preordersOfAlumno }] = await Promise.all([
          supabase.from("store_orders").select("id").eq("alumno_id", uuid),
          supabase.from("store_preorders").select("id").eq("alumno_id", uuid),
        ]);
        const orderIds = ((ordersOfAlumno as any[]) || []).map((r) => r.id);
        if (orderIds.length) {
          const { data: soi2 } = await supabase
            .from("store_order_items")
            .select("id")
            .in("order_id", orderIds);
          const soiIds2 = ((soi2 as any[]) || []).map((r) => r.id);
          targets = pendientes.filter(
            (i) => i.source_table === "store_order_items" && soiIds2.includes(i.source_id),
          );
        }
        const preIds = ((preordersOfAlumno as any[]) || []).map((r) => r.id.toLowerCase());
        if (preIds.length) {
          targets = [
            ...targets,
            ...pendientes.filter(
              (i) => i.source_table === "store_preorders" && preIds.includes(i.source_id.toLowerCase()),
            ),
          ];
        }
        if (targets.length === 0) {
          const { data: al } = await supabase
            .from("alumnos")
            .select("nombre,apellido")
            .eq("id", uuid)
            .maybeSingle();
          const full = norm(`${(al as any)?.nombre || ""} ${(al as any)?.apellido || ""}`);
          if (full.length >= 4) {
            targets = pendientes.filter((i) => {
              const n = norm(i.cliente_nombre);
              return n === full || n.includes(full) || full.includes(n);
            });
          }
        }
      }
      if (targets.length) {
        const dliIds = targets.filter((t) => t.source_table === "delivery_list_items").map((t) => t.source_id);
        return { label: targets[0].cliente_nombre, targets, dliIds };
      }
    }

    const t = norm(code);
    if (t.length >= 4) {
      const byName = pendientes.filter((i) => {
        const n = norm(i.cliente_nombre);
        return n === t || n.includes(t) || t.includes(n);
      });
      if (byName.length) {
        return {
          label: byName[0].cliente_nombre,
          targets: byName,
          dliIds: byName.filter((i) => i.source_table === "delivery_list_items").map((i) => i.source_id),
        };
      }
    }

    return null;
  };

  const handleScannedCode = async (code: string) => {
    if (scanBusyRef.current) return;
    const clean = code.trim();
    const res = await resolveTargets(clean);
    if (!res) {
      toast.error("No encontramos este código en la carga", { description: clean.slice(0, 60) });
      return;
    }
    const { label, targets } = res;
    if (targets.length === 0) {
      toast.info(`${label} ya estaba registrado o entregado`);
      return;
    }
    scanBusyRef.current = true;
    const targetIds = targets.map((t) => t.id);
    const now = new Date().toISOString();
    const scannedQuantities = Object.fromEntries(
      targets.map((t) => [t.id, Number(t.cantidad) > 1 ? 1 : Number(t.cantidad)]),
    ) as Record<string, number>;
    setItems((prev) => prev.map((i) => (targetIds.includes(i.id) ? { ...i, chequeado_at: now } : i)));
    const { data: userRes } = await supabase.auth.getUser();

    const { error } = await (supabase as any)
      .from("vehiculo_carga_items")
      .update({ chequeado_at: now, chequeado_by: userRes.user?.id ?? null })
      .in("id", targetIds);
    if (!error && chequeo) {
      const { error: scanError } = await (supabase as any).from("vehiculo_chequeo_scans").upsert(
        targets.map((target) => ({
          chequeo_id: chequeo.id,
          item_id: target.id,
          cantidad_vista: scannedQuantities[target.id],
          scanned_by: userRes.user?.id ?? null,
          scanned_at: now,
        })),
        { onConflict: "chequeo_id,item_id" },
      );
      if (scanError) {
        scanBusyRef.current = false;
        toast.error("No se pudo guardar lo visto");
        return;
      }
      setScannedIds((prev) => new Set([...prev, ...targetIds]));
      setSeenQty((prev) => ({ ...prev, ...scannedQuantities }));
      setDraftSeenQty((prev) => {
        const next = { ...prev };
        targets.forEach((target) => { next[target.id] = String(scannedQuantities[target.id]); });
        return next;
      });
    }
    scanBusyRef.current = false;
    if (error) {
      toast.error("No se pudo registrar el chequeo");
      load();
      return;
    }
    setScanCount((n) => n + 1);
    const requiereCantidad = targets.some((t) => Number(t.cantidad) > 1);
    toast.success(`✓ ${label} registrado`, {
      description: requiereCantidad
        ? "Hay líneas con más de una unidad. Revisá la columna “Veo” y ajustá la cantidad real."
        : `${targets.length} ítem${targets.length !== 1 ? "s" : ""} registrado${targets.length !== 1 ? "s" : ""}`,
    });
  };

  const loadRondas = async () => {
    const { data } = await (supabase as any)
      .from("vehiculo_chequeos")
      .select("*")
      .eq("carga_id", id)
      .order("ronda", { ascending: false });
    const list = ((data as any[]) || []) as Chequeo[];
    setRondas(list);
    const abierta = list.find((r) => r.estado === "en_curso") || null;
    setChequeo(abierta);
    if (abierta) {
      const { data: scans, error: scansError } = await (supabase as any)
        .from("vehiculo_chequeo_scans")
        .select("item_id,cantidad_vista")
        .eq("chequeo_id", abierta.id);
      if (scansError) {
        toast.error("No se pudo cargar el detalle del chequeo");
      }
      const scanRows = ((scans as any[]) || []);
      setScannedIds(new Set(scanRows.map((s) => s.item_id)));
      const qty: Record<string, number> = {};
      const drafts: Record<string, string> = {};
      scanRows.forEach((s) => {
        if (s.cantidad_vista !== null && s.cantidad_vista !== undefined) {
          qty[s.item_id] = Number(s.cantidad_vista);
          drafts[s.item_id] = String(s.cantidad_vista);
        }
      });
      setSeenQty(qty);
      setDraftSeenQty(drafts);
    } else {
      setScannedIds(new Set());
      setSeenQty({});
      setDraftSeenQty({});
      setDiff([]);
    }
    return abierta;
  };

  const saveSeenQuantity = async (item: CargaItem, raw: string | number) => {
    if (!chequeo) return;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) {
      toast.error("Ingresá una cantidad válida");
      return;
    }
    const qty = Math.floor(parsed);
    setSavingSeenIds((prev) => new Set(prev).add(item.id));
    const { data: userRes } = await supabase.auth.getUser();
    const now = new Date().toISOString();
    const { error } = await (supabase as any).from("vehiculo_chequeo_scans").upsert(
      {
        chequeo_id: chequeo.id,
        item_id: item.id,
        cantidad_vista: qty,
        scanned_by: userRes.user?.id ?? null,
        scanned_at: now,
      },
      { onConflict: "chequeo_id,item_id" },
    );
    if (!error) {
      await (supabase as any)
        .from("vehiculo_carga_items")
        .update({ chequeado_at: now, chequeado_by: userRes.user?.id ?? null })
        .eq("id", item.id);
    }
    setSavingSeenIds((prev) => {
      const next = new Set(prev);
      next.delete(item.id);
      return next;
    });
    if (error) {
      toast.error("No se pudo guardar esta cantidad");
      return;
    }
    setSeenQty((prev) => ({ ...prev, [item.id]: qty }));
    setDraftSeenQty((prev) => ({ ...prev, [item.id]: String(qty) }));
    setScannedIds((prev) => new Set(prev).add(item.id));
    setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, chequeado_at: now } : i));
  };

  const loadDiff = async (chequeoId: string) => {
    setDiffLoading(true);
    const { data, error } = await (supabase as any).rpc("get_vehiculo_chequeo_diff", { _chequeo_id: chequeoId });
    setDiffLoading(false);
    if (error) { return; }
    setDiff(((data as any[]) || []) as DiffRow[]);
  };

  const iniciarRonda = async () => {
    const { data, error } = await (supabase as any).rpc("start_vehiculo_chequeo", { _carga_id: id, _responsable_nombre: null });
    if (error) { toast.error(error.message); return; }
    const row = (Array.isArray(data) ? data[0] : data) as Chequeo;
    setChequeo(row);
    await loadRondas();
    setScanCount(0);
    setScannerOpen(false);
    toast.success(row.tipo === "inicial" ? "Chequeo iniciado" : `Ronda ${row.ronda} iniciada`, {
      description: "Registrá la cantidad que ves físicamente en la camioneta.",
    });
  };

  const cerrarRonda = async () => {
    if (!chequeo) return;
    const expectedItems = items.filter((i) => i.estado === "cargado");
    const pendientes = expectedItems.filter((i) => seenForItem(i) === null);
    if (pendientes.length > 0) {
      toast.error(`Faltan registrar ${pendientes.length} línea${pendientes.length !== 1 ? "s" : ""}`, {
        description: "Completá “Veo” o usá “Está todo” en cada línea antes de cerrar.",
      });
      return;
    }
    if (!confirm("¿Cerrar el chequeo? Se guardará la foto de lo observado. No modifica entregas ni stock.")) return;
    setClosingRonda(true);
    const { error } = await (supabase as any).rpc("close_vehiculo_chequeo_observacional", { _chequeo_id: chequeo.id, _notas: rondaNotas || null });
    setClosingRonda(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Chequeo cerrado", { description: "Las diferencias quedaron registradas sin modificar entregas ni stock." });
    setRondaNotas("");
    setDiff([]);
    await Promise.all([load(), loadRondas()]);
  };

  const [cancelledByItem, setCancelledByItem] = useState<Record<string, { orderId: string; orderNumber: number | null }>>({});
  const [retornoBusy, setRetornoBusy] = useState<string | null>(null);

  const load = async () => {
    const [cRes, iRes] = await Promise.all([
      supabase.from("vehiculo_cargas" as any).select("*").eq("id", id).single(),
      supabase.from("vehiculo_carga_items" as any).select("*").eq("carga_id", id).order("cliente_nombre").order("producto"),
    ]);
    setCarga(cRes.data as any);
    const list = ((iRes.data as any[]) || []);
    setItems(list);

    const soiIds = list
      .filter((i: any) => i.source_table === "store_order_items" && i.source_id)
      .map((i: any) => i.source_id);
    if (soiIds.length) {
      const { data: soi } = await supabase
        .from("store_order_items")
        .select("id, order_id")
        .in("id", soiIds);
      const orderIds = Array.from(new Set((soi || []).map((s: any) => s.order_id).filter(Boolean)));
      if (orderIds.length) {
        const { data: ords } = await supabase
          .from("store_orders")
          .select("id, order_number, status, stock_restored_at")
          .in("id", orderIds);
        const cancelled = new Map<string, any>();
        (ords || []).forEach((o: any) => { if (o.status === "cancelado") cancelled.set(o.id, o); });
        const map: Record<string, { orderId: string; orderNumber: number | null }> = {};
        list.forEach((it: any) => {
          if (it.source_table !== "store_order_items") return;
          const rel = (soi || []).find((s: any) => s.id === it.source_id);
          const ord = rel?.order_id ? cancelled.get(rel.order_id) : null;
          if (ord) map[it.id] = { orderId: ord.id, orderNumber: ord.order_number ?? null };
        });
        setCancelledByItem(map);
      } else {
        setCancelledByItem({});
      }
    } else {
      setCancelledByItem({});
    }
    setLoading(false);
  };

  const cancelInfo = (it: any) =>
    it.estado === "cargado" ? cancelledByItem[it.id] : undefined;

  const confirmarRetorno = async (orderId: string) => {
    setRetornoBusy(orderId);
    const { error } = await (supabase as any).rpc("confirm_cancelled_store_order_return", { _order_id: orderId });
    setRetornoBusy(null);
    if (error) { toast.error(error.message); return; }
    toast.success("Retorno confirmado: la mercadería volvió al depósito y el stock quedó repuesto.");
    await load();
  };

  useEffect(() => { load(); loadRondas(); }, [id]);

  useEffect(() => {
    if (chequeo && !scannerOpen) loadDiff(chequeo.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chequeo?.id, scannerOpen, scannedIds.size]);

  const sede = sedes.find((s) => s.id === carga?.sede_id);

  const diffCounts = useMemo(() => {
    const c: Record<string, number> = { presente: 0, nuevo: 0, entregado_ok: 0, faltante_sin_aviso: 0, entregado_pero_presente: 0, fuera_de_ronda: 0 };
    diff.forEach((d) => { c[d.resultado] = (c[d.resultado] || 0) + 1; });
    return c as Record<DiffRow["resultado"], number>;
  }, [diff]);

  const chequeoItems = useMemo(() => items.filter((i) => i.estado === "cargado"), [items]);
  const auditSummary = useMemo(() => {
    let esperado = 0;
    let visto = 0;
    let registradas = 0;
    let faltan = 0;
    let sobran = 0;
    chequeoItems.forEach((item) => {
      const expected = Number(item.cantidad) || 0;
      esperado += expected;
      const seen = Object.prototype.hasOwnProperty.call(seenQty, item.id)
        ? seenQty[item.id]
        : scannedIds.has(item.id)
          ? expected
          : null;
      if (seen !== null) {
        registradas += 1;
        visto += seen;
        faltan += Math.max(expected - seen, 0);
        sobran += Math.max(seen - expected, 0);
      }
    });
    return { esperado, visto, registradas, faltan, sobran };
  }, [chequeoItems, seenQty, scannedIds]);

  const grouped = useMemo(() => {
    const g: Record<string, CargaItem[]> = {};
    items.forEach((it) => {
      (g[it.cliente_nombre] ||= []).push(it);
    });
    return g;
  }, [items]);

  const variantText = (v: any): string => {
    if (!v) return "";
    if (typeof v === "string") return v;
    try {
      return Object.entries(v)
        .filter(([, val]) => val !== null && val !== "" && val !== undefined)
        .map(([k, val]) => `${k}: ${val}`)
        .join(" · ");
    } catch { return ""; }
  };

  const loadCandidates = async () => {
    setAddLoading(true);
    const cands: CandidateItem[] = [];

    const { data: rows } = await supabase
      .from("delivery_list_items")
      .select("id,list_id,cliente_nombre,producto,variante,cantidad,preparado,list:delivery_lists!inner(id,titulo,estado)")
      .eq("preparado", false)
      .order("cliente_nombre");
    const abiertos = ((rows as any[]) || []).filter((r) => r.list?.estado === "abierta");

    const { data: orders } = await supabase
      .from("store_orders")
      .select("id,order_number,customer_name,status,entrega_metodo,sede_retiro_id,items:store_order_items(id,product_name,variant_selection,quantity)")
      .not("status", "in", "(entregado,cancelado,reembolsado)")
      .order("created_at", { ascending: false });
    const pedidos = ((orders as any[]) || []);

    const dliIds = abiertos.map((r: any) => r.id);
    const soiIds = pedidos.flatMap((o: any) => (o.items || []).map((i: any) => i.id));
    const { data: taken } = await (supabase as any)
      .from("vehiculo_carga_items")
      .select("source_table,source_id")
      .eq("estado", "cargado")
      .in("source_id", [...dliIds, ...soiIds].length ? [...dliIds, ...soiIds] : ["00000000-0000-0000-0000-000000000000"]);
    const ocupados = new Set(((taken as any[]) || []).map((t) => `${t.source_table}:${t.source_id}`));

    abiertos
      .filter((r: any) => !ocupados.has(`delivery_list_items:${r.id}`))
      .forEach((r: any) => {
        cands.push({
          id: `delivery_list_items:${r.id}`,
          source_table: "delivery_list_items",
          source_id: r.id,
          cliente_nombre: r.cliente_nombre,
          producto: r.producto,
          variante: r.variante,
          cantidad: r.cantidad,
          list_titulo: r.list?.titulo || "Lista de entrega",
          grupo: "sin_sede",
        });
      });

    pedidos.forEach((o: any) => {
      const mismaSede = !!o.sede_retiro_id && o.sede_retiro_id === carga?.sede_id;
      const enCamioneta = o.status === "en_camioneta";
      const grupo: CandidateItem["grupo"] =
        mismaSede || (enCamioneta && !o.sede_retiro_id)
          ? "sede"
          : o.sede_retiro_id
            ? "otra_sede"
            : "sin_sede";
      (o.items || [])
        .filter((i: any) => !ocupados.has(`store_order_items:${i.id}`))
        .forEach((i: any) => {
          cands.push({
            id: `store_order_items:${i.id}`,
            source_table: "store_order_items",
            source_id: i.id,
            order_id: o.id,
            cliente_nombre: o.customer_name || "Cliente",
            producto: i.product_name,
            variante: variantText(i.variant_selection) || null,
            cantidad: i.quantity,
            list_titulo: `Pedido #${o.order_number ?? "—"} · ${String(o.status || "").replace(/_/g, " ")}`,
            grupo,
            enCamioneta,
          });
        });
    });

    setCandidates(cands);
    setSelected(new Set(cands.filter((c) => c.grupo === "sede" || c.enCamioneta).map((c) => c.id)));
    setAddLoading(false);
  };

  const filteredCandidates = useMemo(() => {
    const q = norm(addSearch);
    if (!q) return candidates;
    return candidates.filter((c) =>
      [c.cliente_nombre, c.producto, c.variante, c.list_titulo]
        .filter(Boolean)
        .some((v) => norm(String(v)).includes(q)),
    );
  }, [candidates, addSearch]);

  const openAdd = () => { setShowAdd(true); setAddSearch(""); loadCandidates(); };

  const toggle = (id: string) => {
    const n = new Set(selected);
    n.has(id) ? n.delete(id) : n.add(id);
    setSelected(n);
  };

  const addSelected = async () => {
    if (selected.size === 0) return;
    setSaving(true);
    const picked = candidates.filter((c) => selected.has(c.id));
    const toInsert = picked.map((c) => ({
      carga_id: id,
      source_table: c.source_table,
      source_id: c.source_id,
      cliente_nombre: c.cliente_nombre,
      producto: c.producto,
      variante: c.variante,
      cantidad: c.cantidad,
      estado: "cargado",
    }));
    const { error } = await (supabase as any).from("vehiculo_carga_items").insert(toInsert);
    if (!error) {
      const orderIds = Array.from(new Set(picked.map((c) => c.order_id).filter(Boolean))) as string[];
      if (orderIds.length > 0) {
        await supabase.from("store_orders").update({ status: "en_camioneta" }).in("id", orderIds);
      }
    }
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`${toInsert.length} ítem(s) agregados`);
    setShowAdd(false);
    load();
  };

  const removeItem = async (itemId: string) => {
    if (!confirm("¿Quitar este ítem de la carga?")) return;
    const item = items.find((i) => i.id === itemId);
    await (supabase as any).from("vehiculo_carga_items").delete().eq("id", itemId);
    if (item?.source_table === "pedidos_externos") {
      await (supabase as any)
        .from("pedidos_externos")
        .update({ estado: "en_deposito", ubicacion: "Depósito" })
        .eq("id", item.source_id);
    }
    if (item?.source_table === "store_order_items") {
      const { data: soi } = await supabase
        .from("store_order_items")
        .select("order_id")
        .eq("id", item.source_id)
        .maybeSingle();
      if (soi?.order_id) {
        await supabase
          .from("store_orders")
          .update({ status: "preparando" })
          .eq("id", soi.order_id)
          .eq("status", "en_camioneta");
      }
    }
    load();
  };

  const cerrarCarga = async () => {
    if (!confirm("¿Cerrar la carga? Pasa a estado 'En ruta'.")) return;
    const { error } = await (supabase as any).rpc("cerrar_vehiculo_carga", { _carga_id: id });
    if (error) { toast.error(error.message); return; }
    toast.success("Carga cerrada. En ruta.");
    load();
  };

  if (loading) return <div className="py-16 text-center text-muted-foreground animate-pulse">Cargando...</div>;
  if (!carga) return <div className="py-16 text-center text-muted-foreground">No encontrada.</div>;

  const totalItems = items.length;
  const entregados = items.filter((i) => i.estado === "entregado").length;
  const aRetornar = items.filter((i) => !!cancelInfo(i)).length;
  const enCaja = items.filter((i) => i.estado === "cargado" && !cancelInfo(i)).length;
  const chequeados = items.filter((i) => !!i.chequeado_at && i.estado !== "entregado").length;
  const faltantes = items.filter((i) => i.estado === "faltante").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="w-4 h-4 mr-1" /> Volver</Button>
      </div>

      <div className="glass-card rounded-lg p-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Truck className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-heading font-bold uppercase tracking-wider">{sede?.nombre || "Sede"}</h2>
              {estadoBadge(carga.estado)}
            </div>
            <p className="text-xs text-muted-foreground">
              Salida: {carga.fecha_salida}
              {carga.entregador_nombre && <> · Entregador: {carga.entregador_nombre}</>}
            </p>
            {carga.notas && <p className="text-xs text-muted-foreground mt-1">{carga.notas}</p>}
          </div>
          <div className="flex gap-2 flex-wrap">
            {carga.estado === "abierta" && (
              <>
                <Button variant="outline" size="sm" onClick={openAdd}><Plus className="w-4 h-4 mr-1" /> Agregar</Button>
                <Button variant="outline" size="sm" onClick={() => setEtiquetaOpen(true)}>
                  <Camera className="w-4 h-4 mr-1" /> Foto etiqueta (venta externa)
                </Button>
                {chequeo ? (
                  <Button variant="gold" size="sm" onClick={() => document.getElementById("chequeo-fisico")?.scrollIntoView({ behavior: "smooth" })}>
                    <CheckCircle2 className="w-4 h-4 mr-1" /> Seguir chequeo
                  </Button>
                ) : (
                  <Button variant="gold" size="sm" onClick={iniciarRonda}>
                    <CheckCircle2 className="w-4 h-4 mr-1" /> {rondas.length === 0 ? "Iniciar chequeo" : "Nuevo chequeo"}
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={cerrarCarga}><CheckCircle2 className="w-4 h-4 mr-1" /> Cerrar carga</Button>
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-4">
          <Metric label="Total" value={totalItems} />
          <Metric label="En caja" value={enCaja} tone="warning" />
          {aRetornar > 0 && <Metric label="A retornar" value={aRetornar} tone="danger" />}
          <Metric label="Chequeados" value={chequeados} />
          <Metric label="Entregados" value={entregados} tone="ok" />
          <Metric label="Faltantes" value={faltantes} tone="danger" />
        </div>
      </div>

      {chequeo && (
        <div id="chequeo-fisico" className="glass-card rounded-lg p-4 border border-primary/30 space-y-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="font-heading font-bold uppercase tracking-wider text-sm">
                Chequeo físico · Ronda {chequeo.ronda}
              </div>
              <p className="text-xs text-muted-foreground max-w-2xl">
                Registrá lo que ves ahora en la camioneta. “Esperado” es lo que figura en el sistema y “Veo” es la cantidad física. Este chequeo solo registra diferencias: no entrega pedidos ni modifica stock.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => { setScanCount(0); setScannerOpen(true); }}>
              <ScanLine className="w-4 h-4 mr-1" /> Usar escáner
            </Button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            <Metric label="Registradas" value={auditSummary.registradas} />
            <Metric label="Esperado" value={auditSummary.esperado} />
            <Metric label="Visto" value={auditSummary.visto} />
            <Metric label="Faltan" value={auditSummary.faltan} tone={auditSummary.faltan > 0 ? "danger" : undefined} />
            <Metric label="Sobran" value={auditSummary.sobran} tone={auditSummary.sobran > 0 ? "warning" : undefined} />
          </div>
          <p className="text-[11px] text-muted-foreground">
            Líneas registradas: {auditSummary.registradas} de {chequeoItems.length}.
          </p>

          <div className="space-y-2">
            {chequeoItems.length === 0 ? (
              <div className="rounded-lg border border-border p-4 text-sm text-muted-foreground text-center">
                No hay mercadería marcada como “en caja” para controlar.
              </div>
            ) : chequeoItems.map((item) => {
              const expected = Number(item.cantidad) || 0;
              const savedSeen = seenForItem(item);
              const draft = draftSeenQty[item.id] ?? (savedSeen === null ? "" : String(savedSeen));
              const delta = savedSeen === null ? null : savedSeen - expected;
              const savingRow = savingSeenIds.has(item.id);
              return (
                <div key={item.id} className="rounded-lg border border-border p-3 flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground truncate">{item.cliente_nombre}</div>
                    <div className="text-xs text-muted-foreground">
                      {item.producto || "—"}{item.variante ? ` · ${item.variante}` : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                    <div className="text-center min-w-[72px]">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Esperado</div>
                      <div className="text-lg font-bold">{expected}</div>
                    </div>
                    <div className="w-20">
                      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Veo</Label>
                      <Input
                        className="h-9 text-center"
                        type="number"
                        min={0}
                        step={1}
                        inputMode="numeric"
                        value={draft}
                        onChange={(e) => setDraftSeenQty((prev) => ({ ...prev, [item.id]: e.target.value }))}
                        onBlur={(e) => { if (e.target.value !== "") saveSeenQuantity(item, e.target.value); }}
                        disabled={savingRow}
                        placeholder="—"
                      />
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9"
                      disabled={savingRow}
                      onClick={() => saveSeenQuantity(item, expected)}
                    >
                      Está todo
                    </Button>
                    <div className="min-w-[90px] sm:text-right">
                      {savedSeen === null ? (
                        <Badge variant="outline">Pendiente</Badge>
                      ) : delta === 0 ? (
                        <Badge variant="default" className="bg-green-600 hover:bg-green-600">Coincide</Badge>
                      ) : delta! < 0 ? (
                        <Badge variant="destructive">Falta {Math.abs(delta!)}</Badge>
                      ) : (
                        <Badge variant="outline" className="border-amber-500 text-amber-500">Sobran {delta}</Badge>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="space-y-1">
            <Label>Observaciones</Label>
            <Textarea
              rows={2}
              placeholder="Opcional. Si encontrás algo que no figura en la lista, anotá acá producto, talle y cantidad."
              value={rondaNotas}
              onChange={(e) => setRondaNotas(e.target.value)}
            />
          </div>
          <div className="flex justify-end">
            <Button variant="gold" size="sm" onClick={cerrarRonda} disabled={closingRonda || savingSeenIds.size > 0}>
              <CheckCircle2 className="w-4 h-4 mr-1" /> {closingRonda ? "Cerrando..." : "Cerrar chequeo"}
            </Button>
          </div>
        </div>
      )}

      {rondas.filter((r) => r.estado === "cerrado").length > 0 && (
        <div className="glass-card rounded-lg p-3">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">Historial de chequeos</div>
          <div className="space-y-1">
            {rondas.filter((r) => r.estado === "cerrado").map((r) => (
              <div key={r.id} className="text-xs flex flex-wrap items-center gap-2">
                <Badge variant="outline">Ronda {r.ronda}</Badge>
                <span className="text-muted-foreground">{r.tipo === "inicial" ? "Registro inicial" : "Control"}</span>
                <span className="text-muted-foreground">{r.closed_at ? new Date(r.closed_at).toLocaleString("es-AR") : ""}</span>
                {r.resumen && (
                  typeof r.resumen.esperado === "number" ? (
                    <span className="text-muted-foreground">
                      · esperado {r.resumen.esperado} · visto {r.resumen.visto || 0}
                      {r.resumen.faltan_unidades ? ` · faltan ${r.resumen.faltan_unidades}` : ""}
                      {r.resumen.sobran_unidades ? ` · sobran ${r.resumen.sobran_unidades}` : ""}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">
                      · {r.resumen.entregado_ok || 0} entregados · {r.resumen.faltante_sin_aviso || 0} faltantes
                      {r.resumen.entregado_pero_presente ? ` · ${r.resumen.entregado_pero_presente} inconsistentes` : ""}
                    </span>
                  )
                )}
                {r.notas && <span className="text-muted-foreground/80 italic">"{r.notas}"</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <div className="py-16 text-center">
          <Package className="w-10 h-10 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground mb-4">Sin ítems cargados todavía.</p>
          {carga.estado === "abierta" && (
            <Button variant="gold" size="sm" onClick={openAdd}><Plus className="w-4 h-4 mr-1" /> Agregar ítems</Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {Object.entries(grouped).map(([cliente, its]) => (
            <div key={cliente} className="glass-card rounded-lg p-3">
              <div className="font-medium text-sm text-foreground mb-2">{cliente}</div>
              <div className="space-y-1.5">
                {its.map((it) => {
                  const cancelado = cancelInfo(it);
                  return (
                  <div key={it.id} className={`flex items-center gap-2 text-sm flex-wrap ${cancelado ? "rounded-md border border-destructive/40 bg-destructive/10 p-2" : ""}`}>
                    <div className="flex-1 min-w-0">
                      <span className="text-foreground">{it.producto || "—"}</span>
                      {it.variante && <span className="text-muted-foreground"> · {it.variante}</span>}
                      <span className="text-muted-foreground"> × {Number(it.cantidad)}</span>
                      {cancelado && (
                        <span className="block text-[11px] text-destructive">
                          Compra #{cancelado.orderNumber ?? "—"} cancelada · no entregar, devolver al depósito
                        </span>
                      )}
                    </div>
                    {cancelado ? (
                      <>
                        <Badge variant="outline" className="border-destructive/60 text-destructive">CANCELADO · RETORNAR</Badge>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-destructive"
                          disabled={retornoBusy === cancelado.orderId}
                          onClick={() => confirmarRetorno(cancelado.orderId)}
                        >
                          Confirmar retorno
                        </Button>
                      </>
                    ) : (
                      <>
                        {it.estado !== "entregado" && it.chequeado_at && (
                          <Badge variant="outline" className="border-cyan-500/40 text-cyan-400">En camioneta</Badge>
                        )}
                        {itemEstadoBadge(it.estado)}
                        {carga.estado === "abierta" && it.estado === "cargado" && (
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => removeItem(it.id)}>
                            <X className="w-3 h-3" />
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <EtiquetaExternaCapture
        open={etiquetaOpen}
        onOpenChange={setEtiquetaOpen}
        cargaId={id}
        sedeId={carga.sede_id}
        onSaved={load}
      />

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Agregar ítems a la carga</DialogTitle>
            <p className="text-xs text-muted-foreground">
              Todos los pedidos de tienda abiertos y las listas de entrega abiertas. Los de {sede?.nombre || "esta sede"} y los marcados "en camioneta" vienen preseleccionados.
            </p>
          </DialogHeader>
          <Input
            placeholder="Buscar por cliente, producto, variante o #pedido..."
            value={addSearch}
            onChange={(e) => setAddSearch(e.target.value)}
          />
          {addLoading ? (
            <div className="py-8 text-center text-muted-foreground animate-pulse">Cargando...</div>
          ) : filteredCandidates.length === 0 ? (
            <div className="py-8 text-center">
              <AlertTriangle className="w-8 h-8 mx-auto text-muted-foreground/50 mb-2" />
              <p className="text-sm text-muted-foreground">No hay ítems disponibles.</p>
            </div>
          ) : (
            <div className="max-h-[50vh] overflow-y-auto space-y-3 border border-border rounded-lg p-2">
              {([
                { key: "sede", label: `Para ${sede?.nombre || "esta sede"}` },
                { key: "sin_sede", label: "Sin sede asignada" },
                { key: "otra_sede", label: "Otras sedes" },
              ] as const).map(({ key, label }) => {
                const group = filteredCandidates.filter((c) => c.grupo === key);
                if (group.length === 0) return null;

                return (
                  <div key={key} className="space-y-1">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground px-1">
                      {label} · {group.length}
                    </div>
                    {group.map((c) => (
                      <label key={c.id} className="flex items-start gap-2 p-2 rounded hover:bg-muted cursor-pointer">
                        <Checkbox checked={selected.has(c.id)} onCheckedChange={() => toggle(c.id)} className="mt-0.5" />
                        <div className="flex-1 min-w-0 text-sm">
                          <div className="font-medium text-foreground">{c.cliente_nombre}</div>
                          <div className="text-muted-foreground text-xs">
                            {c.producto}{c.variante ? ` · ${c.variante}` : ""} × {Number(c.cantidad)}
                          </div>
                          <div className="text-[10px] text-muted-foreground/70">{c.list_titulo}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
          <DialogFooter>
            <div className="flex items-center gap-2 mr-auto text-xs text-muted-foreground">
              {selected.size} seleccionado(s)
            </div>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancelar</Button>
            <Button variant="gold" onClick={addSelected} disabled={saving || selected.size === 0}>
              {saving ? "Agregando..." : "Agregar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CameraScanner
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onDetected={handleScannedCode}
        continuous
        hint={`${scanCount} lectura${scanCount !== 1 ? "s" : ""} registrada${scanCount !== 1 ? "s" : ""}`}
      />
    </div>
  );
};

const Metric = ({ label, value, tone }: { label: string; value: number; tone?: "ok" | "warning" | "danger" }) => {
  const color = tone === "ok" ? "text-green-500" : tone === "warning" ? "text-amber-500" : tone === "danger" ? "text-red-500" : "text-foreground";
  return (
    <div className="glass-card rounded p-2 text-center">
      <div className={`text-xl font-bold ${color}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
};

export default DepositoCamioneta;