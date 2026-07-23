import { useEffect, useMemo, useState } from "react";
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
import { Truck, Plus, ChevronRight, ArrowLeft, Package, CheckCircle2, AlertTriangle, X } from "lucide-react";
import { toast } from "sonner";

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
}
interface CandidateItem {
  id: string;
  list_id: string;
  cliente_nombre: string;
  producto: string;
  variante: string | null;
  cantidad: number;
  list_titulo: string;
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
    if (error || !data) { toast.error(error?.message || "Error al crear"); return; }
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
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [addLoading, setAddLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const [cRes, iRes] = await Promise.all([
      supabase.from("vehiculo_cargas" as any).select("*").eq("id", id).single(),
      supabase.from("vehiculo_carga_items" as any).select("*").eq("carga_id", id).order("cliente_nombre").order("producto"),
    ]);
    setCarga(cRes.data as any);
    setItems((iRes.data as any[]) || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, [id]);

  const sede = sedes.find((s) => s.id === carga?.sede_id);

  const grouped = useMemo(() => {
    const g: Record<string, CargaItem[]> = {};
    items.forEach((it) => {
      (g[it.cliente_nombre] ||= []).push(it);
    });
    return g;
  }, [items]);

  const loadCandidates = async () => {
    setAddLoading(true);
    // Ítems de delivery_list_items abiertos + no preparados + no ya en otra carga activa
    const { data: rows } = await supabase
      .from("delivery_list_items")
      .select("id,list_id,cliente_nombre,producto,variante,cantidad,preparado,list:delivery_lists!inner(id,titulo,estado)")
      .eq("preparado", false)
      .order("cliente_nombre");
    const abiertos = ((rows as any[]) || []).filter((r) => r.list?.estado === "abierta");

    // filtrar los ya cargados activos
    const ids = abiertos.map((r: any) => r.id);
    let ocupados = new Set<string>();
    if (ids.length > 0) {
      const { data: taken } = await (supabase as any)
        .from("vehiculo_carga_items")
        .select("source_id")
        .eq("source_table", "delivery_list_items")
        .eq("estado", "cargado")
        .in("source_id", ids);
      ocupados = new Set(((taken as any[]) || []).map((t) => t.source_id));
    }

    const cands: CandidateItem[] = abiertos
      .filter((r: any) => !ocupados.has(r.id))
      .map((r: any) => ({
        id: r.id, list_id: r.list_id, cliente_nombre: r.cliente_nombre,
        producto: r.producto, variante: r.variante, cantidad: r.cantidad,
        list_titulo: r.list?.titulo || "",
      }));
    setCandidates(cands);
    setSelected(new Set());
    setAddLoading(false);
  };

  const openAdd = () => { setShowAdd(true); loadCandidates(); };

  const toggle = (id: string) => {
    const n = new Set(selected);
    n.has(id) ? n.delete(id) : n.add(id);
    setSelected(n);
  };

  const addSelected = async () => {
    if (selected.size === 0) return;
    setSaving(true);
    const toInsert = candidates
      .filter((c) => selected.has(c.id))
      .map((c) => ({
        carga_id: id,
        source_table: "delivery_list_items",
        source_id: c.id,
        cliente_nombre: c.cliente_nombre,
        producto: c.producto,
        variante: c.variante,
        cantidad: c.cantidad,
        estado: "cargado",
      }));
    const { error } = await (supabase as any).from("vehiculo_carga_items").insert(toInsert);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`${toInsert.length} ítem(s) agregados`);
    setShowAdd(false);
    load();
  };

  const removeItem = async (itemId: string) => {
    if (!confirm("¿Quitar este ítem de la carga?")) return;
    await (supabase as any).from("vehiculo_carga_items").delete().eq("id", itemId);
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
  const enCaja = items.filter((i) => i.estado === "cargado").length;
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
          <div className="flex gap-2">
            {carga.estado === "abierta" && (
              <>
                <Button variant="outline" size="sm" onClick={openAdd}><Plus className="w-4 h-4 mr-1" /> Agregar</Button>
                <Button variant="gold" size="sm" onClick={cerrarCarga}><CheckCircle2 className="w-4 h-4 mr-1" /> Cerrar carga</Button>
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
          <Metric label="Total" value={totalItems} />
          <Metric label="En caja" value={enCaja} tone="warning" />
          <Metric label="Entregados" value={entregados} tone="ok" />
          <Metric label="Faltantes" value={faltantes} tone="danger" />
        </div>
      </div>

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
                {its.map((it) => (
                  <div key={it.id} className="flex items-center gap-2 text-sm">
                    <div className="flex-1 min-w-0">
                      <span className="text-foreground">{it.producto || "—"}</span>
                      {it.variante && <span className="text-muted-foreground"> · {it.variante}</span>}
                      <span className="text-muted-foreground"> × {Number(it.cantidad)}</span>
                    </div>
                    {itemEstadoBadge(it.estado)}
                    {carga.estado === "abierta" && it.estado === "cargado" && (
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => removeItem(it.id)}>
                        <X className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Agregar ítems a la carga</DialogTitle>
            <p className="text-xs text-muted-foreground">Pedidos pendientes de listas de entrega abiertas.</p>
          </DialogHeader>
          {addLoading ? (
            <div className="py-8 text-center text-muted-foreground animate-pulse">Cargando...</div>
          ) : candidates.length === 0 ? (
            <div className="py-8 text-center">
              <AlertTriangle className="w-8 h-8 mx-auto text-muted-foreground/50 mb-2" />
              <p className="text-sm text-muted-foreground">No hay ítems disponibles.</p>
            </div>
          ) : (
            <div className="max-h-[50vh] overflow-y-auto space-y-1 border border-border rounded-lg p-2">
              {candidates.map((c) => (
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
