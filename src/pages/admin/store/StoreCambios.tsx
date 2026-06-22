import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, XCircle, Package, Truck, Plus, Loader2, AlertTriangle } from "lucide-react";
import AdminCreateCambioDialog from "@/components/admin/AdminCreateCambioDialog";

type Cambio = any;

const estadoColor: Record<string, string> = {
  solicitado: "bg-muted text-muted-foreground",
  aprobado: "bg-cyan/20 text-cyan",
  en_deposito: "bg-primary/20 text-primary",
  listo_retiro: "bg-green-500/20 text-green-400",
  entregado: "bg-green-500/30 text-green-300",
  rechazado: "bg-destructive/20 text-destructive",
  cancelado: "bg-muted/40 text-muted-foreground",
  devolucion_solicitada: "bg-amber-500/20 text-amber-300",
};

const AdminCambios = () => {
  const [items, setItems] = useState<Cambio[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"nuevos" | "seguimiento" | "cerrados">("nuevos");
  const [selected, setSelected] = useState<Cambio | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const { toast } = useToast();

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("store_cambios" as any)
      .select("*, producto:store_products!store_cambios_producto_id_fkey(name, image_url), alumnos(nombre, apellido, email)")
      .order("created_at", { ascending: false });
    setItems((data as any[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const [origenFiltro, setOrigenFiltro] = useState<"all" | "app" | "presencial">("all");

  const buckets = (() => {
    const filtered = origenFiltro === "all"
      ? items
      : items.filter((c) => (c.origen_solicitud || "app") === origenFiltro);
    return {
      // Nuevos: requieren decisión de admin (sin stock, o devolución solicitada)
      nuevos: filtered.filter((c) => ["solicitado", "devolucion_solicitada"].includes(c.estado)),
      // En seguimiento: cambios en curso operativo
      seguimiento: filtered.filter((c) => ["aprobado", "en_deposito", "listo_retiro"].includes(c.estado)),
      cerrados: filtered.filter((c) => ["entregado", "rechazado", "cancelado"].includes(c.estado)),
    };
  })();

  const totalAbiertos = buckets.nuevos.length + buckets.seguimiento.length;
  const daysSince = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);

  const transition = async (id: string, nuevo: string, nota?: string) => {
    const { error } = await supabase.rpc("transition_cambio_estado" as any, {
      p_id: id, p_nuevo_estado: nuevo, p_nota: nota || null,
    });
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Estado actualizado" });
    load();
    if (selected?.id === id) setSelected({ ...selected, estado: nuevo });
  };

  const renderList = (list: Cambio[]) => {
    if (loading) return <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin" /></div>;
    if (list.length === 0) return <p className="text-center text-sm text-muted-foreground py-8">Sin solicitudes</p>;
    return (
      <div className="space-y-2">
        {list.map((c) => (
          <button
            key={c.id}
            className="w-full text-left rounded-xl border border-border bg-card p-3 hover:bg-card/80 transition-colors"
            onClick={() => setSelected(c)}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold truncate">
                  {c.alumnos?.nombre} {c.alumnos?.apellido} · <span className="text-muted-foreground">{c.producto?.name}</span>
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {new Date(c.created_at).toLocaleDateString("es-AR")} · motivo: {c.motivo}
                  {c.iniciado_por === "admin" && <span className="text-amber-400 ml-1">· admin</span>}
                  {c.origen_solicitud === "presencial" && <span className="text-cyan ml-1">· presencial</span>}
                  {c.reemplazo_estado && c.reemplazo_estado !== "sin_definir" && (
                    <span className="ml-1">· reemplazo: {c.reemplazo_estado}</span>
                  )}
                </p>
              </div>
              <Badge className={`text-[10px] uppercase ${estadoColor[c.estado]}`}>{c.estado}</Badge>
            </div>
          </button>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold uppercase tracking-wider">Cambios de indumentaria</h1>
          <p className="text-sm text-muted-foreground">Gestioná solicitudes de cambio y devoluciones.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="w-4 h-4 mr-2" /> Crear en nombre del alumno
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Origen:</span>
        {(["all", "app", "presencial"] as const).map((o) => (
          <button
            key={o}
            onClick={() => setOrigenFiltro(o)}
            className={`text-[11px] px-2 py-1 rounded-md border ${origenFiltro === o ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted/40"}`}
          >
            {o === "all" ? "Todos" : o === "app" ? "App alumno" : "Presencial"}
          </button>
        ))}
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList className="grid grid-cols-3 w-full max-w-md">
          <TabsTrigger value="pendientes">Pendientes <span className="ml-1 text-[10px] opacity-70">({buckets.pendientes.length})</span></TabsTrigger>
          <TabsTrigger value="en_curso">En curso <span className="ml-1 text-[10px] opacity-70">({buckets.en_curso.length})</span></TabsTrigger>
          <TabsTrigger value="cerrados">Cerrados <span className="ml-1 text-[10px] opacity-70">({buckets.cerrados.length})</span></TabsTrigger>
        </TabsList>
        <TabsContent value="pendientes" className="mt-3">{renderList(buckets.pendientes)}</TabsContent>
        <TabsContent value="en_curso" className="mt-3">{renderList(buckets.en_curso)}</TabsContent>
        <TabsContent value="cerrados" className="mt-3">{renderList(buckets.cerrados)}</TabsContent>
      </Tabs>

      <Sheet open={!!selected} onOpenChange={(v) => !v && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle>Cambio #{selected.id.slice(0, 8)}</SheetTitle>
              </SheetHeader>
              <div className="space-y-4 mt-4 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Alumno</p>
                  <p className="font-semibold">{selected.alumnos?.nombre} {selected.alumnos?.apellido}</p>
                  <p className="text-xs text-muted-foreground">{selected.alumnos?.email}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Producto</p>
                  <p className="font-semibold">{selected.producto?.name}</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Variante original</p>
                    <p>{Object.entries(selected.variante_origen || {}).map(([k, v]) => `${k}: ${v}`).join(" · ") || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Variante destino</p>
                    <p>{selected.variante_destino ? Object.entries(selected.variante_destino).map(([k, v]) => `${k}: ${v}`).join(" · ") : <span className="text-amber-400">Sin stock / devolución</span>}</p>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Motivo</p>
                  <p>{selected.motivo}{selected.comentario && <> — "{selected.comentario}"</>}</p>
                </div>
                {selected.iniciado_por === "admin" && (
                  <div className="rounded border border-amber-400/30 bg-amber-500/5 p-2 text-xs">
                    <AlertTriangle className="w-3 h-3 inline mr-1 text-amber-400" />
                    Iniciado por admin. Motivo: {selected.motivo_admin}
                  </div>
                )}
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Historial</p>
                  <ul className="space-y-1 text-[11px]">
                    {(selected.historial || []).map((h: any, i: number) => (
                      <li key={i} className="text-muted-foreground">
                        <b>{h.estado}</b> · {new Date(h.at).toLocaleString("es-AR")}{h.nota && <> · {h.nota}</>}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="space-y-2 pt-3 border-t border-border">
                  <p className="text-xs text-muted-foreground">Acciones</p>
                  {selected.estado === "solicitado" && (
                    <div className="grid grid-cols-2 gap-2">
                      <Button size="sm" onClick={() => transition(selected.id, "aprobado")}>
                        <CheckCircle2 className="w-4 h-4 mr-1" /> Aprobar
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => transition(selected.id, "rechazado", "Rechazado por admin")}>
                        <XCircle className="w-4 h-4 mr-1" /> Rechazar
                      </Button>
                    </div>
                  )}
                  {selected.estado === "aprobado" && (
                    <Button size="sm" className="w-full" onClick={() => transition(selected.id, "en_deposito")}>
                      <Package className="w-4 h-4 mr-1" /> Enviar a depósito
                    </Button>
                  )}
                  {(selected.estado === "en_deposito" || selected.estado === "listo_retiro") && (
                    <Button size="sm" className="w-full" onClick={() => transition(selected.id, "entregado", "Entregado en sede")}>
                      <Truck className="w-4 h-4 mr-1" /> Marcar entregado
                    </Button>
                  )}
                  {selected.estado === "devolucion_solicitada" && (
                    <div className="grid grid-cols-2 gap-2">
                      <Button size="sm" onClick={() => transition(selected.id, "entregado", "Devolución resuelta con saldo a favor")}>
                        Resolver devolución
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => transition(selected.id, "rechazado")}>
                        Rechazar
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <AdminCreateCambioDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={load} />
    </div>
  );
};

export default AdminCambios;
