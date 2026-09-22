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
import { findOrdersEnCamionetaSinCargar, type OrdenSinCargar } from "@/lib/camionetaSync";
import { avisoWaLink, buildAvisoCamionetaMessage, buildAvisoPedidoReferencia, formatAvisoFecha } from "@/lib/camionetaAviso";


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
  created_at?: string | null;
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
interface LineaChequeo {
  item_id: string;
  cliente_nombre: string;
  producto: string | null;
  variante: string | null;
  esperado: number;
  visto: number | null;
  registrado: boolean;
  registrado_por: string | null;
  registrado_at: string | null;
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
  return <Badge variant="outline">Cargado</Badge>;
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
  const [sinCargar, setSinCargar] = useState<OrdenSinCargar[]>([]);

  useEffect(() => {
    (async () => {
      const [sRes, cRes, pend] = await Promise.all([
        supabase.from("sedes").select("id,nombre").eq("activa", true).order("nombre"),
        supabase.from("vehiculo_cargas" as any).select("*").order("fecha_salida", { ascending: false }).order("created_at", { ascending: false }),
        findOrdersEnCamionetaSinCargar(),
      ]);
      setSedes((sRes.data as any[]) || []);
      setCargas((cRes.data as any[]) || []);
      setSinCargar(pend);
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
    // Una sola caja activa por sede: si ya existe, la reutilizamos
    const { data: existente } = await (supabase as any)
      .from("vehiculo_cargas")
      .select("id")
      .eq("sede_id", form.sede_id)
      .in("estado", ["abierta", "en_ruta"])
      .maybeSingle();
    if (existente?.id) {
      setCreating(false);
      setShowCreate(false);
      toast.info("Esa sede ya está activa en la camioneta. Te llevamos a esa sección.");
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
      toast.error(error?.message?.includes("una_activa_por_sede") ? "Esa sede ya está activa en la camioneta" : (error?.message || "Error al crear"));
      return;
    }
    toast.success("Sede agregada a la camioneta");
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
            <p className="text-xs text-muted-foreground">Una sola camioneta, organizada internamente por sede.</p>
          </div>
        </div>
        <Button variant="gold" size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4 mr-1" /> Agregar sede
        </Button>
      </div>

      {!loading && sinCargar.length > 0 && (
        <div className="rounded-lg border border-border bg-muted/30 p-3">
          <p className="text-sm font-medium text-foreground">
            En camioneta · sede sin identificar ({sinCargar.length})
          </p>
          <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
            {sinCargar.map((o) => (
              <li key={o.id}>Pedido #{o.order_number ?? "—"} · {o.customer_name || "Cliente"}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">
            Están físicamente en la camioneta; el sistema todavía no resolvió la sede de retiro.
          </p>
        </div>
      )}


      {loading ? (
        <div className="py-16 text-center text-muted-foreground animate-pulse">Cargando...</div>
      ) : (
        (() => {
          // Una sola camioneta con varias cajas (una por sede) que viajan juntas.
          // Todas las cargas activas se muestran juntas en "Camioneta ahora".
          const activas = cargas.filter((c) => c.estado === "en_ruta" || c.estado === "abierta");
          const historial = cargas.filter((c) => c.estado !== "en_ruta" && c.estado !== "abierta");
          const renderCarga = (c: Carga) => {
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
          };
          return (
            <>
              {activas.length > 0 ? (
                <div>
                  <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">Camioneta ahora</h2>
                  <div className="rounded-xl border border-primary/40 bg-primary/5 p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <Truck className="w-6 h-6 text-primary shrink-0" />
                      <div className="flex-1">
                        <div className="font-medium text-foreground">Camioneta actual</div>
                        <p className="text-xs text-muted-foreground">Una sola camioneta. La mercadería se organiza abajo por sede de retiro.</p>
                      </div>
                      <Badge variant="outline">{activas.length} sede{activas.length === 1 ? "" : "s"}</Badge>
                    </div>
                    <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
                      {activas.map((c) => {
                        const sede = sedes.find((s) => s.id === c.sede_id);
                        return (
                          <Link key={c.id} to={`/deposito/camioneta/${c.id}`} className="p-3 bg-background/40 hover:bg-muted/50 flex items-center gap-3 transition-colors">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-foreground truncate">{sede?.nombre || "Sede"}</span>
                                {estadoBadge(c.estado)}
                              </div>
                              <div className="text-xs text-muted-foreground mt-0.5">
                                {c.fecha_salida}{c.entregador_nombre ? ` · ${c.entregador_nombre}` : ""}
                              </div>
                            </div>
                            <ChevronRight className="w-4 h-4 text-primary shrink-0" />
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed p-6 text-center">
                  <Truck className="w-8 h-8 mx-auto text-muted-foreground/50 mb-2" />
                  <p className="text-sm text-muted-foreground mb-3">No hay ninguna camioneta en operación ahora.</p>
                  <Button variant="gold" size="sm" onClick={() => setShowCreate(true)}>
                    <Plus className="w-4 h-4 mr-1" /> Agregar sede
                  </Button>
                </div>
              )}

              {historial.length > 0 && (
                <div>
                  <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">Historial de cargas</h2>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {historial.map(renderCarga)}
                  </div>
                </div>
              )}
            </>
          );
        })()
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader><DialogTitle>Agregar sede a la camioneta</DialogTitle></DialogHeader>
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
  // --- Chequeo físico simple: lo que el sistema dice vs. lo que el empleado ve ---
  const [chequeo, setChequeo] = useState<Chequeo | null>(null);
  const [rondas, setRondas] = useState<Chequeo[]>([]);
  const [scannedIds, setScannedIds] = useState<Set<string>>(new Set());
  const [lineas, setLineas] = useState<LineaChequeo[]>([]);
  const [lineasLoading, setLineasLoading] = useState(false);
  const [vistoDraft, setVistoDraft] = useState<Record<string, string>>({});
  const [closingRonda, setClosingRonda] = useState(false);
  const [rondaNotas, setRondaNotas] = useState("");
  // Mercadería en camioneta cuya caja no quedó registrada (sin vehiculo_carga_items).
  const [sinCargar, setSinCargar] = useState<OrdenSinCargar[]>([]);


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

  /** Resuelve qué ítems de esta carga corresponden al código escaneado. */
  const resolveTargets = async (code: string): Promise<{ label: string; targets: CargaItem[]; dliIds: string[] } | null> => {
    // Durante una ronda activa, lo pendiente es lo que todavía no se escaneó en ESA ronda.
    const pendientes = chequeo
      ? items.filter((i) => i.estado !== "entregado" && !scannedIds.has(i.id))
      : items.filter((i) => i.estado !== "entregado" && !i.chequeado_at);

    // Las etiquetas de pedidos codifican una URL de cobro. Resolver primero la
    // intención de esa URL evita confundir alumno, pedido y preventa por el UUID.
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

    // 1) QR de lista de entrega (RBDLV1)
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

    // 2) UUID suelto o dentro de una URL (etiquetas Niimbot de pedido/preventa, QR de producto)
    const uuid = code.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0];
    if (uuid) {
      // a) coincide directo con el ítem de la carga
      let targets = pendientes.filter((i) => i.source_id.toLowerCase() === uuid.toLowerCase());
      // b) es el id de un pedido de tienda → sus ítems
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
      // c) es el id de una preventa
      if (targets.length === 0) {
        targets = pendientes.filter((i) => i.source_table === "store_preorders" && i.source_id.toLowerCase() === uuid.toLowerCase());
      }
      // d) es el id del ALUMNO (etiquetas Niimbot con QR /pagar-preventas-alumno/:alumnoId)
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
        // e) sin ítems vinculados: probamos por nombre del alumno
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


    // 3) Último recurso: texto que coincide con el nombre del cliente
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
      toast.info(`${label} ya estaba controlado o entregado`);
      return;
    }
    scanBusyRef.current = true;
    const targetIds = targets.map((t) => t.id);
    const now = new Date().toISOString();
    setItems((prev) => prev.map((i) => (targetIds.includes(i.id) ? { ...i, chequeado_at: now } : i)));
    const { data: userRes } = await supabase.auth.getUser();

    const { error } = await (supabase as any)
      .from("vehiculo_carga_items")
      .update({ chequeado_at: now, chequeado_by: userRes.user?.id ?? null })
      .in("id", targetIds);
    if (!error && chequeo) {
      // El escáner es un atajo: registra la línea con la cantidad esperada.
      await (supabase as any).from("vehiculo_chequeo_scans").upsert(
        targets.map((t) => ({
          chequeo_id: chequeo.id,
          item_id: t.id,
          cantidad_vista: Math.max(0, Number((t as any).cantidad) || 0),
          scanned_by: userRes.user?.id ?? null,
          scanned_at: now,
        })),
        { onConflict: "chequeo_id,item_id" },
      );
      setScannedIds((prev) => new Set([...prev, ...targetIds]));
      await loadLineas(chequeo.id);
    }
    scanBusyRef.current = false;
    if (error) {
      toast.error("No se pudo registrar el control");
      load();
      return;
    }
    setScanCount((n) => n + 1);
    toast.success(`✓ ${label} en camioneta`, { description: `${targets.length} ítem${targets.length !== 1 ? "s" : ""} controlado${targets.length !== 1 ? "s" : ""}` });

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
      const { data: scans } = await (supabase as any)
        .from("vehiculo_chequeo_scans")
        .select("item_id")
        .eq("chequeo_id", abierta.id);
      setScannedIds(new Set(((scans as any[]) || []).map((s) => s.item_id)));
    } else {
      setScannedIds(new Set());
      setLineas([]);
      setVistoDraft({});
    }
    return abierta;
  };

  /** Lista lo que el sistema dice que está cargado, con lo observado hasta ahora. */
  const loadLineas = async (chequeoId: string) => {
    setLineasLoading(true);
    const { data, error } = await (supabase as any).rpc("get_vehiculo_chequeo_lineas", { _chequeo_id: chequeoId });
    setLineasLoading(false);
    if (error) { toast.error(error.message); return; }
    const rows = ((data as any[]) || []) as LineaChequeo[];
    setLineas(rows);
    setVistoDraft((prev) => {
      const next = { ...prev };
      rows.forEach((l) => {
        if (l.registrado) next[l.item_id] = String(l.visto ?? 0);
        else if (next[l.item_id] === undefined) next[l.item_id] = "";
      });
      return next;
    });
  };

  /** Guarda por línea la cantidad observada, quién la registró y cuándo. */
  const registrarLineas = async (rows: { item_id: string; cantidad: number }[]): Promise<boolean> => {
    if (!chequeo || rows.length === 0) return false;
    const { data: userRes } = await supabase.auth.getUser();
    const now = new Date().toISOString();
    const { error } = await (supabase as any).from("vehiculo_chequeo_scans").upsert(
      rows.map((r) => ({
        chequeo_id: chequeo.id,
        item_id: r.item_id,
        cantidad_vista: Math.max(0, Math.floor(r.cantidad) || 0),
        scanned_by: userRes.user?.id ?? null,
        scanned_at: now,
      })),
      { onConflict: "chequeo_id,item_id" },
    );
    if (error) { toast.error("No se pudo guardar lo observado"); return false; }
    setScannedIds((prev) => new Set([...prev, ...rows.map((r) => r.item_id)]));
    await loadLineas(chequeo.id);
    return true;
  };

  const estaTodo = async () => {
    if (!chequeo) return;
    const ok = await registrarLineas(lineas.map((l) => ({ item_id: l.item_id, cantidad: Number(l.esperado) || 0 })));
    if (ok) toast.success("Registrado: veo todo lo esperado");
  };

  const iniciarRonda = async () => {
    const { data, error } = await (supabase as any).rpc("start_vehiculo_chequeo", { _carga_id: id, _responsable_nombre: null });
    if (error) { toast.error(error.message); return; }
    const row = (Array.isArray(data) ? data[0] : data) as Chequeo;
    setChequeo(row);
    await loadRondas();
    await loadLineas(row.id);
    setScanCount(0);
    toast.success(row.tipo === "inicial" ? `Control físico iniciado` : `Control ${row.ronda} iniciado`);
  };

  const cerrarRonda = async () => {
    if (!chequeo) return;
    if (!confirm("¿Cerrar el control? Solo se guarda lo observado: no cambia stock, pedidos ni entregas.")) return;
    setClosingRonda(true);
    const { error } = await (supabase as any).rpc("close_vehiculo_chequeo_observacional", {
      _chequeo_id: chequeo.id, _notas: rondaNotas || null,
    });
    setClosingRonda(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Control cerrado: quedó guardada la foto de lo observado");
    setRondaNotas("");
    setLineas([]);
    setVistoDraft({});
    await Promise.all([load(), loadRondas()]);
  };

  // Pedidos de tienda cancelados cuya mercadería sigue arriba de la camioneta.
  const [cancelledByItem, setCancelledByItem] = useState<Record<string, { orderId: string; orderNumber: number | null }>>({});
  const [retornoBusy, setRetornoBusy] = useState<string | null>(null);
  // Pedido de tienda / venta externa asociado a cada ítem (para el aviso de WhatsApp).
  const [orderByItem, setOrderByItem] = useState<Record<string, any>>({});
  const [externoByItem, setExternoByItem] = useState<Record<string, any>>({});
  const [resolverBusy, setResolverBusy] = useState<string | null>(null);
  const [avisoPendiente, setAvisoPendiente] = useState<{ orderId: string | null; label: string } | null>(null);
  const [showEntregadosHist, setShowEntregadosHist] = useState(false);

  const load = async () => {
    const [cRes, iRes] = await Promise.all([
      supabase.from("vehiculo_cargas" as any).select("*").eq("id", id).single(),
      supabase.from("vehiculo_carga_items" as any).select("*").eq("carga_id", id).order("cliente_nombre").order("producto"),
    ]);
    setCarga(cRes.data as any);
    const list = ((iRes.data as any[]) || []);
    setItems(list);

    // Resolver el pedido padre de los ítems de tienda para detectar cancelaciones.
    const soiIds = list
      .filter((i: any) => i.source_table === "store_order_items" && i.source_id)
      .map((i: any) => i.source_id);
    if (soiIds.length) {
      const { data: soi } = await supabase
        .from("store_order_items")
        .select("id, order_id, product_name, variant_selection, quantity")
        .in("id", soiIds);
      const orderIds = Array.from(new Set((soi || []).map((s: any) => s.order_id).filter(Boolean)));
      if (orderIds.length) {
        const [{ data: ords }, { data: allOrderItems }] = await Promise.all([
          supabase
            .from("store_orders")
            .select("id, order_number, status, stock_restored_at, total, currency, pagado_at, metodo_pago, customer_name, customer_phone, alumno_id, aviso_camioneta_enviado_at")
            .in("id", orderIds),
          supabase
            .from("store_order_items")
            .select("id, order_id, product_name, variant_selection, quantity")
            .in("order_id", orderIds),
        ]);
        const alumnoIds = Array.from(new Set(((ords as any[]) || []).map((o: any) => o.alumno_id).filter(Boolean)));
        const telByAlumno: Record<string, string> = {};
        if (alumnoIds.length) {
          const { data: als } = await supabase.from("alumnos").select("id, telefono").in("id", alumnoIds);
          ((als as any[]) || []).forEach((a: any) => { if (a.telefono) telByAlumno[a.id] = a.telefono; });
        }
        const byId = new Map<string, any>();
        ((ords as any[]) || []).forEach((o: any) => byId.set(o.id, {
          ...o,
          telefono: telByAlumno[o.alumno_id] || o.customer_phone || null,
          items: ((allOrderItems as any[]) || []).filter((item) => item.order_id === o.id),
        }));
        const cancelled = new Map<string, any>();
        ((ords as any[]) || []).forEach((o: any) => { if (o.status === "cancelado") cancelled.set(o.id, o); });
        const map: Record<string, { orderId: string; orderNumber: number | null }> = {};
        const ordMap: Record<string, any> = {};
        list.forEach((it: any) => {
          if (it.source_table !== "store_order_items") return;
          const rel = (soi || []).find((s: any) => s.id === it.source_id);
          const full = rel?.order_id ? byId.get(rel.order_id) : null;
          if (full) ordMap[it.id] = full;
          const ord = rel?.order_id ? cancelled.get(rel.order_id) : null;
          if (ord) map[it.id] = { orderId: ord.id, orderNumber: ord.order_number ?? null };
        });
        setCancelledByItem(map);
        setOrderByItem(ordMap);
      } else {
        setCancelledByItem({});
        setOrderByItem({});
      }
    } else {
      setCancelledByItem({});
      setOrderByItem({});
    }

    // Ventas externas: teléfono del cliente para el recordatorio de retiro.
    const extIds = list
      .filter((i: any) => i.source_table === "pedidos_externos" && i.source_id)
      .map((i: any) => i.source_id);
    if (extIds.length) {
      const { data: exts } = await supabase
        .from("pedidos_externos")
        .select("id, cliente_nombre, cliente_telefono, estado")
        .in("id", extIds);
      const byId = new Map<string, any>(((exts as any[]) || []).map((e: any) => [e.id, e]));
      const extMap: Record<string, any> = {};
      list.forEach((it: any) => {
        if (it.source_table !== "pedidos_externos") return;
        const e = byId.get(it.source_id);
        if (e) extMap[it.id] = e;
      });
      setExternoByItem(extMap);
    } else {
      setExternoByItem({});
    }
    setLoading(false);
  };

  /** El ítem pertenece a una compra cancelada y todavía está arriba de la camioneta. */
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

  /** Resuelve un ítem que el control no encontró: ya fue entregado o sigue en la camioneta. */
  const resolverItem = async (itemId: string, accion: "entregado" | "sigue_en_camioneta") => {
    setResolverBusy(itemId);
    const { error } = await (supabase as any).rpc("resolver_item_chequeo", { _item_id: itemId, _accion: accion });
    setResolverBusy(null);
    if (error) { toast.error(error.message); return; }
    toast.success(accion === "entregado" ? "Marcado como entregado." : "Vuelve a figurar en la camioneta.");
    await load();
  };

  /** Recordatorio de retiro por WhatsApp para mercadería que sigue en la camioneta. */
  const recordarRetiro = async (it: CargaItem, forzar = false) => {
    const ord = orderByItem[it.id];
    const ext = externoByItem[it.id];
    if (ord) {
      if (ord.aviso_camioneta_enviado_at && !forzar) {
        if (!confirm(`Ya se avisó el ${formatAvisoFecha(ord.aviso_camioneta_enviado_at)}. ¿Enviar de nuevo?`)) return;
      }
      const { data: saldos } = await (supabase.rpc as any)("get_store_orders_saldo", { _ids: [ord.id] });
      const saldo = Number((saldos || [])[0]?.saldo ?? ord.total ?? 0);
      const nombre = String(ord.customer_name || it.cliente_nombre || "").split(" ")[0];
      const referencia = buildAvisoPedidoReferencia(ord.order_number, ord.items || []);
      const link = avisoWaLink(ord.telefono || "", buildAvisoCamionetaMessage(nombre, ord, saldo, referencia));
      if (!link) { toast.error("El cliente no tiene teléfono cargado."); return; }
      window.open(link, "_blank");
      setAvisoPendiente({ orderId: ord.id, label: `Pedido #${ord.order_number ?? "—"}` });
      return;
    }
    const nombre = String(ext?.cliente_nombre || it.cliente_nombre || "").split(" ")[0] || "cliente";
    const itemsExternos = items.filter((item) => item.source_table === "pedidos_externos" && item.source_id === it.source_id);
    const referencia = buildAvisoPedidoReferencia(null, itemsExternos);
    const sujeto = referencia.toLowerCase().startsWith("tu ") ? referencia : `tu ${referencia}`;
    const link = avisoWaLink(ext?.cliente_telefono || "", `Hola, ${nombre}. ${sujeto.charAt(0).toUpperCase()}${sujeto.slice(1)} sigue en la camioneta para que puedas retirarlo. ¡Gracias!`);
    if (!link) { toast.error("El cliente no tiene teléfono cargado."); return; }
    window.open(link, "_blank");
  };

  /** Consulta al alumno cuando el pedido no aparece en la camioneta, sin cambiar estados. */
  const consultarRecepcion = (it: CargaItem) => {
    const ord = orderByItem[it.id];
    const ext = externoByItem[it.id];
    const nombre = String(ord?.customer_name || ext?.cliente_nombre || it.cliente_nombre || "").split(" ")[0] || "cliente";
    const telefono = ord?.telefono || ext?.cliente_telefono || "";
    const itemsRef = ord?.items || items.filter((item) => item.source_table === "pedidos_externos" && item.source_id === it.source_id);
    const referencia = buildAvisoPedidoReferencia(ord?.order_number ?? null, itemsRef);
    const sujeto = referencia.toLowerCase().startsWith("tu ") ? referencia : `tu ${referencia}`;
    const mensaje = `Hola, ${nombre}. Estamos haciendo un control de la camioneta y ${sujeto} ya no aparece entre los pedidos pendientes. ¿Pudiste retirarlo o recibirlo? Gracias.`;
    const link = avisoWaLink(telefono, mensaje);
    if (!link) { toast.error("El cliente no tiene teléfono cargado."); return; }
    window.open(link, "_blank");
    toast.info("Consulta abierta en WhatsApp. Cuando responda, marcá si fue entregado o si sigue en camioneta.");
  };

  /** El registro del aviso se guarda sólo cuando la persona confirma que lo envió. */
  const confirmarAvisoEnviado = async () => {
    const orderId = avisoPendiente?.orderId;
    setAvisoPendiente(null);
    if (!orderId) return;
    const { data: auth } = await supabase.auth.getUser();
    await supabase.from("store_orders").update({
      aviso_camioneta_enviado_at: new Date().toISOString(),
      aviso_camioneta_enviado_por: auth?.user?.id || null,
      aviso_camioneta_enviado_por_email: auth?.user?.email || null,
    } as any).eq("id", orderId);
    toast.success("Aviso registrado.");
    await load();
  };

  useEffect(() => { load(); loadRondas(); findOrdersEnCamionetaSinCargar().then(setSinCargar); }, [id]);

  useEffect(() => {
    if (chequeo && !scannerOpen) loadLineas(chequeo.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chequeo?.id, scannerOpen]);

  const sede = sedes.find((s) => s.id === carga?.sede_id);

  const resumenChequeo = useMemo(() => {
    let esperado = 0, visto = 0, faltantes = 0, sobrantes = 0, registradas = 0;
    lineas.forEach((l) => {
      const e = Number(l.esperado) || 0;
      esperado += e;
      if (l.registrado) {
        registradas += 1;
        const v = Number(l.visto) || 0;
        visto += v;
        faltantes += Math.max(0, e - v);
        sobrantes += Math.max(0, v - e);
      }
    });
    return { esperado, visto, faltantes, sobrantes, registradas, total: lineas.length };
  }, [lineas]);


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

    // 1) Ítems de listas de entrega abiertas, no preparados
    const { data: rows } = await supabase
      .from("delivery_list_items")
      .select("id,list_id,cliente_nombre,producto,variante,cantidad,preparado,list:delivery_lists!inner(id,titulo,estado)")
      .eq("preparado", false)
      .order("cliente_nombre");
    const abiertos = ((rows as any[]) || []).filter((r) => r.list?.estado === "abierta");

    // 2) Todos los pedidos de tienda abiertos (cualquier método de entrega)
    const { data: orders } = await supabase
      .from("store_orders")
      .select("id,order_number,customer_name,status,entrega_metodo,sede_retiro_id,items:store_order_items(id,product_name,variant_selection,quantity)")
      .not("status", "in", "(entregado,cancelado,reembolsado)")
      .order("created_at", { ascending: false });
    const pedidos = ((orders as any[]) || []);


    // Ítems ya cargados en alguna carga activa
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
    // Preseleccionamos los de esta sede y los que ya están marcados "en camioneta"
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

  const diasDesde = (iso?: string | null): number | null => {
    if (!iso) return null;
    const ms = Date.now() - new Date(iso).getTime();
    if (!Number.isFinite(ms)) return null;
    return Math.max(0, Math.floor(ms / 86_400_000));
  };
  const fechaMs = (iso?: string | null) => iso ? new Date(iso).getTime() : Number.MAX_SAFE_INTEGER;
  const entregaReciente = (it: CargaItem) => {
    const dias = diasDesde(it.entregado_at);
    return dias === null || dias <= 7;
  };

  // VISTO = sigue en camioneta · NO VISTO = revisar entrega · CANCELADO = debe volver.
  // Los pendientes se ordenan por antigüedad para que los olvidados aparezcan primero.
  const itemsEnCamioneta = items
    .filter((i) => i.estado === "cargado" && !cancelInfo(i) && !!i.chequeado_at)
    .sort((a, b) => fechaMs(a.created_at) - fechaMs(b.created_at));
  const itemsParaEntregar = items
    .filter((i) => i.estado === "cargado" && !cancelInfo(i) && !i.chequeado_at)
    .sort((a, b) => fechaMs(a.created_at) - fechaMs(b.created_at));
  const itemsAVolver = items.filter((i) => (i.estado === "cargado" && !!cancelInfo(i)) || i.estado === "retornado");
  const itemsNoEncontrados = items.filter((i) => i.estado === "faltante");
  const itemsEntregados = items.filter((i) => i.estado === "entregado");
  const itemsEntregadosRecientes = itemsEntregados.filter(entregaReciente);
  const itemsEntregadosAnteriores = itemsEntregados.filter((i) => !entregaReciente(i));
  const itemsEntregadosVisibles = showEntregadosHist ? itemsEntregados : itemsEntregadosRecientes;

  const porCliente = (list: CargaItem[]) => {
    const g: Record<string, CargaItem[]> = {};
    list.forEach((it) => {
      (g[it.cliente_nombre] ||= []).push(it);
    });
    return g;
  };

  const fuenteTexto = (it: CargaItem): string => {
    const ord = orderByItem[it.id];
    if (ord) return `Pedido #${ord.order_number ?? "—"}`;
    if (externoByItem[it.id]) return "Venta externa";
    return "Lista de entrega";
  };

  const itemRow = (it: CargaItem) => {
    const cancelado = cancelInfo(it);
    const sigueEnCamioneta = it.estado === "cargado" && !cancelado && !!it.chequeado_at;
    const ord = orderByItem[it.id];
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
          {it.estado === "cargado" && diasDesde(it.created_at) !== null && (
            <span className={`block text-[10px] ${(diasDesde(it.created_at) || 0) >= 30 ? "text-destructive font-medium" : (diasDesde(it.created_at) || 0) >= 14 ? "text-amber-500" : "text-muted-foreground"}`}>
              En camioneta hace {diasDesde(it.created_at)} día{diasDesde(it.created_at) === 1 ? "" : "s"}
            </span>
          )}
          {sigueEnCamioneta && ord?.aviso_camioneta_enviado_at && (
            <span className="block text-[10px] text-muted-foreground">Avisado {formatAvisoFecha(ord.aviso_camioneta_enviado_at)}</span>
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
            {itemEstadoBadge(it.estado)}
            {sigueEnCamioneta && (
              <Button variant="outline" size="sm" className="h-7 text-green-600" onClick={() => recordarRetiro(it)}>
                Recordar retiro
              </Button>
            )}
            {carga.estado === "abierta" && it.estado === "cargado" && (
              <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => removeItem(it.id)}>
                <X className="w-3 h-3" />
              </Button>
            )}
          </>
        )}
      </div>
    );
  };

  const revisarRow = (it: CargaItem) => (
    <div key={it.id} className="flex items-center gap-2 text-sm flex-wrap rounded-md border border-border p-2">
      <div className="flex-1 min-w-0">
        <span className="text-foreground">{it.producto || "—"}</span>
        {it.variante && <span className="text-muted-foreground"> · {it.variante}</span>}
        <span className="text-muted-foreground"> × {Number(it.cantidad)}</span>
        <span className="block text-[11px] text-muted-foreground">{fuenteTexto(it)}</span>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="h-7"
        onClick={() => consultarRecepcion(it)}
      >
        Consultar si lo recibió
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="h-7"
        disabled={resolverBusy === it.id}
        onClick={() => resolverItem(it.id, "entregado")}
      >
        Ya fue entregado
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="h-7"
        disabled={resolverBusy === it.id}
        onClick={() => resolverItem(it.id, "sigue_en_camioneta")}
      >
        Sigue en camioneta
      </Button>
    </div>
  );

  const revisarCards = (list: CargaItem[]) => (
    <div className="space-y-3">
      {Object.entries(porCliente(list)).map(([cliente, its]) => (
        <div key={cliente} className="glass-card rounded-lg p-3">
          <div className="font-medium text-sm text-foreground mb-2">{cliente}</div>
          <div className="space-y-1.5">{its.map(revisarRow)}</div>
        </div>
      ))}
    </div>
  );

  const clienteCards = (list: CargaItem[]) => (
    <div className="space-y-3">
      {Object.entries(porCliente(list)).map(([cliente, its]) => (
        <div key={cliente} className="glass-card rounded-lg p-3">
          <div className="font-medium text-sm text-foreground mb-2">{cliente}</div>
          <div className="space-y-1.5">{its.map(itemRow)}</div>
        </div>
      ))}
    </div>
  );

  const seccionHeader = (titulo: string, cantidad: number, tone?: "danger") => (
    <div className="flex items-center gap-2">
      <h3 className={`font-heading font-bold uppercase tracking-wider text-sm ${tone === "danger" ? "text-destructive" : "text-foreground"}`}>{titulo}</h3>
      <Badge variant="outline">{cantidad}</Badge>
    </div>
  );

  const grupoVacio = (texto: string) => (
    <div className="rounded-lg border border-border p-3 text-xs text-muted-foreground">{texto}</div>
  );


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
                  <Button variant="gold" size="sm" onClick={() => { setScanCount(0); setScannerOpen(true); }}>
                    <ScanLine className="w-4 h-4 mr-1" /> Seguir control
                  </Button>
                ) : (
                  <Button variant="gold" size="sm" onClick={iniciarRonda}>
                    <ScanLine className="w-4 h-4 mr-1" /> {rondas.length === 0 ? "Control físico" : "Nuevo control"}
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={cerrarCarga}><CheckCircle2 className="w-4 h-4 mr-1" /> Cerrar carga</Button>
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-4">
          <Metric label="Total" value={totalItems} />
          <Metric label="Cargados" value={enCaja} tone="warning" />
          {aRetornar > 0 && <Metric label="A retornar" value={aRetornar} tone="danger" />}

          <Metric label="Controlados" value={chequeados} />
          <Metric label="Entregados" value={entregados} tone="ok" />
          <Metric label="Revisar entrega" value={faltantes} tone="danger" />
        </div>
      </div>

      {items.length === 0 && sinCargar.length === 0 ? (
        <div className="py-16 text-center">
          <Package className="w-10 h-10 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground mb-4">Sin ítems cargados todavía.</p>
          {carga.estado === "abierta" && (
            <Button variant="gold" size="sm" onClick={openAdd}><Plus className="w-4 h-4 mr-1" /> Agregar ítems</Button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {/* 1 · EN CAMIONETA */}
          <section className="space-y-2">
            {seccionHeader("En camioneta", itemsEnCamioneta.length)}
            <p className="text-xs text-muted-foreground">Lo que está físicamente cargado en la camioneta ahora.</p>
            {itemsEnCamioneta.length === 0 ? (
              grupoVacio("Todavía no hay mercadería controlada en la camioneta.")
            ) : (
              clienteCards(itemsEnCamioneta)
            )}

            {chequeo && (
              <div className="glass-card rounded-lg p-4 border border-primary/30 space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <div className="font-heading font-bold uppercase tracking-wider text-sm">
                      Control físico {chequeo.ronda > 1 ? `· control ${chequeo.ronda}` : ""}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Mirá la camioneta y marcá qué está y qué no está. “No está” registra 0 unidades; al cerrar el control pasa a “Revisar entrega”,
                      donde podés marcar que fue entregado o consultar al alumno por WhatsApp. El control no modifica stock por sí solo.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={estaTodo} disabled={lineas.length === 0}>
                      <CheckCircle2 className="w-4 h-4 mr-1" /> Está todo
                    </Button>
                    <Button variant="gold" size="sm" onClick={() => { setScanCount(0); setScannerOpen(true); }}>
                      <ScanLine className="w-4 h-4 mr-1" /> Escanear
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  <Metric label="Esperado" value={resumenChequeo.esperado} />
                  <Metric label="Visto" value={resumenChequeo.visto} tone="ok" />
                  <Metric label="Faltantes" value={resumenChequeo.faltantes} tone="danger" />
                  <Metric label="Sobrantes" value={resumenChequeo.sobrantes} tone="warning" />
                  <Metric label={`Líneas registradas (de ${resumenChequeo.total})`} value={resumenChequeo.registradas} />
                </div>

                {lineasLoading ? (
                  <div className="py-6 text-center text-muted-foreground animate-pulse text-sm">Armando la lista...</div>
                ) : lineas.length === 0 ? (
                  <div className="py-6 text-center text-muted-foreground text-sm">No hay ítems cargados en la camioneta.</div>
                ) : (
                  <div className="space-y-1">
                    {lineas.map((l) => {
                      const esperado = Number(l.esperado) || 0;
                      const visto = Number(l.visto) || 0;
                      const dif = visto - esperado;
                      return (
                        <div key={l.item_id} className="rounded-lg border border-border p-2 flex flex-wrap items-center gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-medium truncate">{l.cliente_nombre}</div>
                            <div className="text-[11px] text-muted-foreground truncate">
                              {l.producto || "—"}{l.variante ? ` · ${l.variante}` : ""}
                            </div>
                          </div>
                          <div className="text-[11px] text-muted-foreground">Esperado <b className="text-foreground">{esperado}</b></div>
                          <div className="flex items-center gap-1">
                            <span className="text-[11px] text-muted-foreground">Veo</span>
                            <Input
                              type="number"
                              min={0}
                              className="h-8 w-20"
                              value={vistoDraft[l.item_id] ?? ""}
                              onChange={(e) => setVistoDraft((p) => ({ ...p, [l.item_id]: e.target.value }))}
                              onBlur={(e) => {
                                const raw = e.target.value;
                                if (raw === "") return;
                                const n = Math.max(0, Math.floor(Number(raw) || 0));
                                if (l.registrado && n === visto) return;
                                registrarLineas([{ item_id: l.item_id, cantidad: n }]);
                              }}
                            />
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 px-2 text-[11px]"
                              onClick={() => registrarLineas([{ item_id: l.item_id, cantidad: esperado }])}
                            >
                              Está
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 px-2 text-[11px]"
                              onClick={() => registrarLineas([{ item_id: l.item_id, cantidad: 0 }])}
                            >
                              No está
                            </Button>
                          </div>
                          <div className="text-[11px] w-24 text-right">
                            {!l.registrado ? (
                              <span className="text-muted-foreground">Sin registrar</span>
                            ) : dif === 0 ? (
                              <span className="text-green-500">Coincide</span>
                            ) : dif < 0 ? (
                              <span className="text-red-500">Falta {-dif}</span>
                            ) : (
                              <span className="text-amber-500">Sobran {dif}</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <Textarea
                  rows={2}
                  placeholder="Observaciones (por ejemplo, mercadería que está y no figura en el sistema)"
                  value={rondaNotas}
                  onChange={(e) => setRondaNotas(e.target.value)}
                />
                <div className="flex justify-end items-center gap-2">
                  {resumenChequeo.registradas < resumenChequeo.total && (
                    <span className="text-[11px] text-amber-500">
                      Faltan {resumenChequeo.total - resumenChequeo.registradas} línea(s) por registrar
                    </span>
                  )}
                  <Button variant="gold" size="sm" onClick={cerrarRonda}
                    disabled={closingRonda || lineas.length === 0 || resumenChequeo.registradas < resumenChequeo.total}>
                    <CheckCircle2 className="w-4 h-4 mr-1" /> {closingRonda ? "Cerrando..." : "Cerrar control"}
                  </Button>
                </div>
              </div>
            )}

            {rondas.filter((r) => r.estado === "cerrado").length > 0 && (
              <div className="glass-card rounded-lg p-3">
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">Historial de controles</div>
                <div className="space-y-1">
                  {rondas.filter((r) => r.estado === "cerrado").map((r) => (
                    <div key={r.id} className="text-xs flex flex-wrap items-center gap-2">
                      <Badge variant="outline">Control {r.ronda}</Badge>
                      <span className="text-muted-foreground">{r.closed_at ? new Date(r.closed_at).toLocaleString("es-AR") : ""}</span>
                      {r.resumen && (
                        <span className="text-muted-foreground">
                          · esperado {r.resumen.esperado ?? 0} · visto {r.resumen.visto ?? 0}
                          {r.resumen.faltantes ? ` · faltan ${r.resumen.faltantes}` : ""}
                          {r.resumen.sobrantes ? ` · sobran ${r.resumen.sobrantes}` : ""}
                        </span>
                      )}
                      {r.notas && <span className="text-muted-foreground/80 italic">"{r.notas}"</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* 2 · PARA ENTREGAR */}
          <section className="space-y-2">
            {seccionHeader("Para entregar", itemsParaEntregar.length)}
            <p className="text-xs text-muted-foreground">Cargado en el sistema que todavía no se controló ni se entregó.</p>
            {itemsParaEntregar.length === 0 ? (
              grupoVacio("Nada pendiente: todo lo cargado ya está controlado en la camioneta.")
            ) : (
              clienteCards(itemsParaEntregar)
            )}
          </section>

          {/* 2b · EN CAMIONETA · SIN CAJA ASIGNADA */}
          {sinCargar.length > 0 && (
            <section className="space-y-2">
              {seccionHeader("En camioneta · caja sin identificar", sinCargar.reduce((acc, o) => acc + o.items.length, 0))}
              <p className="text-xs text-muted-foreground">
                Mercadería que ya está físicamente en la camioneta, pero cuya caja no quedó registrada en el sistema. Las cajas viajan juntas en la misma camioneta.
              </p>
              <div className="space-y-3">
                {sinCargar.map((o) => (
                  <div key={o.id} className="glass-card rounded-lg p-3 border border-border">
                    <div className="font-medium text-sm text-foreground mb-2">
                      {o.customer_name || "Cliente"} <span className="text-muted-foreground font-normal">· Pedido #{o.order_number ?? "—"}</span>
                    </div>
                    <div className="space-y-1.5">
                      {o.items.map((it) => (
                        <div key={it.id} className="text-sm">
                          <span className="text-foreground">{it.product_name || "—"}</span>
                          {it.variante && <span className="text-muted-foreground"> · {it.variante}</span>}
                          <span className="text-muted-foreground"> × {Number(it.cantidad)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 3 · DEBE VOLVER A DEPÓSITO (sólo compras canceladas y retornos) */}
          <section className="space-y-2">
            {seccionHeader("Debe volver a depósito", itemsAVolver.length, "danger")}
            <p className="text-xs text-muted-foreground">Mercadería de compras canceladas que debe regresar al depósito, y retornos ya confirmados.</p>
            {itemsAVolver.length === 0 ? (
              grupoVacio("Nada pendiente de volver al depósito.")
            ) : (
              clienteCards(itemsAVolver)
            )}
          </section>

          {/* 3b · NO ENCONTRADO EN EL ÚLTIMO CONTROL */}
          <section className="space-y-2">
            {seccionHeader("No encontrado en el último control · revisar entrega", itemsNoEncontrados.length)}
            <p className="text-xs text-muted-foreground">
              El sistema esperaba esta mercadería pero no fue vista. Si no sabés si se entregó, consultá al alumno por WhatsApp antes de cambiar el estado.
            </p>
            {itemsNoEncontrados.length === 0 ? (
              grupoVacio("El último control encontró todo lo esperado.")
            ) : (
              revisarCards(itemsNoEncontrados)
            )}
          </section>

          {/* 4 · ENTREGADO */}
          <section className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              {seccionHeader(showEntregadosHist ? "Entregado · historial" : "Entregado · últimos 7 días", itemsEntregadosVisibles.length)}
              {itemsEntregadosAnteriores.length > 0 && (
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setShowEntregadosHist((v) => !v)}>
                  {showEntregadosHist ? "Ocultar anteriores" : `Ver historial (${itemsEntregadosAnteriores.length})`}
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Los entregados se muestran 7 días para no acumular. Los anteriores quedan disponibles en historial.
            </p>
            {itemsEntregadosVisibles.length === 0 ? (
              grupoVacio(itemsEntregados.length ? "No hay entregas de los últimos 7 días." : "Todavía no se entregó nada de esta carga.")
            ) : (
              clienteCards(itemsEntregadosVisibles)
            )}
          </section>
        </div>
      )}


      <Dialog open={!!avisoPendiente} onOpenChange={(v) => { if (!v) setAvisoPendiente(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-heading">¿Enviaste el aviso?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Se abrió WhatsApp para {avisoPendiente?.label}. El registro se guarda sólo si confirmás que lo enviaste.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAvisoPendiente(null)}>No lo envié</Button>
            <Button onClick={confirmarAvisoEnviado}>Ya lo envié</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


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
        hint={`${scanCount} entrega${scanCount !== 1 ? "s" : ""} marcada${scanCount !== 1 ? "s" : ""}`}
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
