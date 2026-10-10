import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, XCircle, Package, Truck, Plus, Loader2, AlertTriangle } from "lucide-react";
import AdminCreateCambioDialog from "@/components/admin/AdminCreateCambioDialog";
import AddPruebaDialog from "@/components/store/AddPruebaDialog";
import { estadoCambioClass, estadoCambioLabel } from "@/lib/cambios";
import { esSustitucionFaltaStock, RESOLUCION_LABEL, type ResolucionEconomica } from "@/lib/faltaStock";

import {
  esPrueba, esPruebaActiva, resultadoClass, resultadoLabel, tipoRegistro,
} from "@/lib/pruebas";

type Cambio = any;


const AdminCambios = () => {
  const [items, setItems] = useState<Cambio[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"nuevos" | "seguimiento" | "pruebas" | "cerrados">("nuevos");
  const [selected, setSelected] = useState<Cambio | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [pruebaOpen, setPruebaOpen] = useState(false);
  const [pruebaBusy,setPruebaBusy]=useState(false);
  const { toast } = useToast();

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("store_cambios" as any)
      .select("*, producto:store_products!store_cambios_producto_id_fkey(name, image_url), reemplazo:store_products!store_cambios_producto_reemplazo_id_fkey(name), venta:store_orders!store_cambios_order_id_fkey(order_number), alumnos(nombre, apellido, email)")
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
    // Las pruebas no son cambios: viven en su propia pestaña para no ensuciar el operativo.
    const cambios = filtered.filter((c) => tipoRegistro(c) !== "prueba");
    return {
      // Nuevos: requieren decisión de admin (sin stock, o devolución solicitada)
      nuevos: cambios.filter((c) => ["solicitado", "devolucion_solicitada"].includes(c.estado)),
      // En seguimiento: cambios en curso operativo
      seguimiento: cambios.filter((c) => ["aprobado", "en_deposito", "listo_retiro"].includes(c.estado)),
      cerrados: cambios.filter((c) => ["entregado", "rechazado", "cancelado"].includes(c.estado)),
      pruebas: filtered.filter(esPrueba),
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

  const devolverPrueba = async (id:string) => {
    setPruebaBusy(true);
    const {error}=await supabase.rpc("prueba_devolver" as any,{p_cambio_id:id,p_nota:null});
    setPruebaBusy(false);
    if(error){toast({title:"No se pudo recibir la prueba",description:error.message,variant:"destructive"});return;}
    toast({title:"Prenda de prueba recibida",description:"Ingresó nuevamente al stock."});
    setSelected(null);
    load();
  };

  const renderList = (list: Cambio[]) => {
    if (loading) return <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin" /></div>;
    if (list.length === 0) return <p className="text-center text-sm text-muted-foreground py-8">Sin solicitudes</p>;
    return (
      <div className="space-y-2">
        {list.map((c) => {
          const dias = daysSince(c.created_at);
          const enSeguimiento = ["aprobado", "en_deposito", "listo_retiro"].includes(c.estado);
          const atrasado = enSeguimiento && dias > 7;
          return (
            <button
              key={c.id}
              className={`w-full text-left rounded-xl border bg-card p-3 hover:bg-card/80 transition-colors ${atrasado ? "border-destructive/60" : "border-border"}`}
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
                    {c.venta?.order_number && <span className="ml-1">· venta #{c.venta.order_number}</span>}
                    {c.tipo==="prueba" && <span className="ml-1">{c.order_id?"· con venta":"· directo al alumno"}</span>}
                    {c.reemplazo_estado && c.reemplazo_estado !== "sin_definir" && (
                      <span className="ml-1">· reemplazo: {c.reemplazo_estado}</span>
                    )}
                    {enSeguimiento && (
                      <span className={`ml-1 ${atrasado ? "text-destructive font-semibold" : dias > 4 ? "text-amber-400" : ""}`}>
                        · {dias}d abierto{atrasado ? " ⚠️" : ""}
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Badge className={`text-[10px] uppercase ${estadoCambioClass(c.estado)}`}>{estadoCambioLabel(c.estado)}</Badge>
                  {esSustitucionFaltaStock(c) && (
                    <Badge variant="outline" className="text-[9px] border-amber-500/40 text-amber-400">
                      Falta de stock · {RESOLUCION_LABEL[c.resolucion_economica as ResolucionEconomica] || "sin ajuste"}
                    </Badge>
                  )}
                  {esPrueba(c) && (
                    <Badge className={`text-[10px] uppercase ${resultadoClass(c)}`}>{resultadoLabel(c)}</Badge>
                  )}
                </div>


              </div>
            </button>
          );
        })}
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
          <Plus className="w-4 h-4 mr-2" /> Crear cambio desde venta
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
        <TabsList className="grid grid-cols-4 w-full max-w-2xl">
          <TabsTrigger value="nuevos">
            🔴 Nuevos <span className="ml-1 text-[10px] opacity-70">({buckets.nuevos.length})</span>
          </TabsTrigger>
          <TabsTrigger value="seguimiento">
            👀 En seguimiento <span className="ml-1 text-[10px] opacity-70">({buckets.seguimiento.length})</span>
          </TabsTrigger>
          <TabsTrigger value="pruebas">
            🧪 Pruebas <span className="ml-1 text-[10px] opacity-70">({buckets.pruebas.filter(esPruebaActiva).length})</span>
          </TabsTrigger>
          <TabsTrigger value="cerrados">
            ✅ Cerrados <span className="ml-1 text-[10px] opacity-70">({buckets.cerrados.length})</span>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="nuevos" className="mt-3">{renderList(buckets.nuevos)}</TabsContent>
        <TabsContent value="seguimiento" className="mt-3">{renderList(buckets.seguimiento)}</TabsContent>
        <TabsContent value="pruebas" className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-3 justify-between items-center">
            <p className="text-[11px] text-muted-foreground max-w-lg">
              Las prendas pueden enviarse a prueba junto con una venta o directamente a un alumno.
              La prueba no es una venta y su stock se controla por separado.
            </p>
            <Button size="sm" onClick={() => setPruebaOpen(true)}>
              <Plus className="w-4 h-4 mr-1" /> Enviar prenda a prueba
            </Button>
          </div>
          {renderList(buckets.pruebas)}
        </TabsContent>
        <TabsContent value="cerrados" className="mt-3">{renderList(buckets.cerrados)}</TabsContent>
      </Tabs>

      {totalAbiertos > 0 && (
        <p className="text-[11px] text-muted-foreground">
          {totalAbiertos} cambio{totalAbiertos === 1 ? "" : "s"} abierto{totalAbiertos === 1 ? "" : "s"} esperando cierre.
        </p>
      )}

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
                  {esPrueba(selected)&&<p className="text-xs text-muted-foreground mt-1">
                    {selected.order_id?"Prueba vinculada a una venta":"Prueba vinculada directamente al alumno"}
                  </p>}
                </div>
                {!esPrueba(selected) && (selected.venta?.order_number||selected.preorder_id) && (
                  <div className="rounded-lg border border-border p-3 space-y-1 text-xs">
                    <p className="uppercase text-muted-foreground text-[11px]">Venta que originó el cambio</p>
                    <p className="font-semibold">
                      {selected.venta?.order_number?"Pedido #"+selected.venta.order_number:"Preventa asociada"}
                    </p>
                    <p>Compró: {selected.producto?.name}</p>
                    <p>Recibirá: {selected.reemplazo?.name||selected.producto?.name}</p>
                    {Number(selected.diferencia_precio)>0 &&
                      <p className="text-amber-400">Diferencia de precio pendiente de revisión: {selected.moneda||"ARS"} {Number(selected.diferencia_precio).toLocaleString("es-AR")}. No se cobra automáticamente.</p>}
                  </div>
                )}
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
                {["aprobado", "en_deposito", "listo_retiro"].includes(selected.estado) && !esPrueba(selected) && (
                  <div className="rounded-lg border border-border p-3 space-y-1 text-xs">
                    <b>Seguimiento operativo</b>
                    <div className={selected.recibido_en || esSustitucionFaltaStock(selected) ? "text-green-400" : "text-amber-400"}>
                      Devolución: {esSustitucionFaltaStock(selected) ? "No corresponde" : selected.recibido_en ? "Recibida" : "Pendiente"}
                    </div>
                    <div className={selected.preparado_at || ["enviado","entregado"].includes(selected.reemplazo_estado) ? "text-green-400" : "text-amber-400"}>
                      Reemplazo: {selected.preparado_at || ["enviado","entregado"].includes(selected.reemplazo_estado) ? "Preparado" : "Pendiente"}
                    </div>
                    {!selected.recibido_en && selected.stock_devuelto_at && !esSustitucionFaltaStock(selected) && (
                      <div className="text-destructive">Advertencia: el sistema muestra ingreso de stock sin recepción física registrada. Conciliar.</div>
                    )}
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
                  {esPruebaActiva(selected) && (
                    <div className="rounded-lg border border-border p-3 space-y-2">
                      <p className="text-xs">
                        La prenda sigue con el alumno. Si vuelve al depósito, registrá su recepción.
                      </p>
                      <Button size="sm" variant="outline" disabled={pruebaBusy}
                        onClick={() => {
                          if(window.confirm("¿Recibiste físicamente la prenda de prueba? Reingresará al stock.")) {
                            void devolverPrueba(selected.id);
                          }
                        }}>Recibir devolución de prueba</Button>
                      {!selected.order_id&&<p className="text-[11px] text-muted-foreground">
                        Si el alumno decide quedársela, deberá generarse una venta y vincularla antes de convertir la prueba.
                      </p>}
                    </div>
                  )}
                  {!esPrueba(selected) && selected.estado === "solicitado" && (
                    <div className="grid grid-cols-2 gap-2">
                      <Button size="sm" onClick={() => transition(selected.id, "aprobado")}>
                        <CheckCircle2 className="w-4 h-4 mr-1" /> Aprobar
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => transition(selected.id, "rechazado", "Rechazado por admin")}>
                        <XCircle className="w-4 h-4 mr-1" /> Rechazar
                      </Button>
                    </div>
                  )}
                  {!esPrueba(selected) && selected.estado === "aprobado" && (
                    <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs">
                      Cambio aprobado. Ya está pendiente de recepción y/o preparación en <b>Ventas → Pedidos</b>.
                      Aprobar no confirma el ingreso físico de ninguna prenda.
                    </div>
                  )}
                  {!esPrueba(selected) && selected.estado === "listo_retiro"
                    && (esSustitucionFaltaStock(selected) || !!selected.recibido_en)
                    && (selected.reemplazo_estado === "enviado" || selected.reemplazo_estado === "entregado" || !!selected.preparado_at)
                    && (
                      <Button size="sm" className="w-full" onClick={() => transition(selected.id, "entregado", "Entrega física confirmada en sede")}>
                        <Truck className="w-4 h-4 mr-1" /> Confirmar entrega física
                      </Button>
                  )}
                  {!esPrueba(selected) && selected.estado === "devolucion_solicitada" && (
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
      <AddPruebaDialog open={pruebaOpen} onOpenChange={setPruebaOpen} onCreated={load} />
    </div>
  );
};

export default AdminCambios;
