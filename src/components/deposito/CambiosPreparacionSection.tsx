import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Package, RefreshCw, ScanLine, CheckCircle2, Tag, Truck, MessageCircle, Bell } from "lucide-react";
import CambioAvisoDialog from "@/components/deposito/CambioAvisoDialog";
import ScanCambioDialog from "@/components/deposito/ScanCambioDialog";
import CambioLabelDialog from "@/components/deposito/CambioLabelDialog";
import { formatVariante } from "@/lib/productQr";
import { esSustitucionFaltaStock } from "@/lib/faltaStock";

type Cambio = any;

const estadoTexto = (c: Cambio) => {
  const sust = esSustitucionFaltaStock(c);
  const devuelta = sust || Boolean(c.recibido_en);
  const preparado = Boolean(c.preparado_at) || ["enviado", "entregado"].includes(c.reemplazo_estado || "");
  if (c.reemplazo_entregado_at && !devuelta) return "Reemplazo entregado · falta devolución";
  if (c.reemplazo_entregado_at && devuelta) return "Cambio completado";
  if (c.reemplazo_canal_entrega === "moto" && c.reemplazo_despachado_at) return "Reemplazo enviado por moto" + (!devuelta ? " · falta devolución" : "");
  if (c.estado === "entregado") return "Entregado";
  if (preparado && !devuelta) return "Reemplazo separado · falta devolución";
  if (devuelta && !preparado) return "Devolución recibida · falta preparar";
  if (preparado && devuelta) return "Listo para entregar";
  return sust ? "Reemplazo pendiente" : "Pendiente de recepción y preparación";
};

const CambiosPreparacionSection = () => {
  const [items, setItems] = useState<Cambio[]>([]);
  const [products, setProducts] = useState<Record<string, string>>({});
  const [orders, setOrders] = useState<Record<string, any>>({});
  const [sedeNames, setSedeNames] = useState<Record<string, string>>({});
  const [sedesCamioneta, setSedesCamioneta] = useState<{id: string; nombre: string}[]>([]);
  const [destinos, setDestinos] = useState<Record<string,string>>({});
  const [cambiosEnCamioneta, setCambiosEnCamioneta] = useState<Set<string>>(new Set());
  const [labelFor, setLabelFor] = useState<Cambio | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanFor, setScanFor] = useState<Cambio | null>(null);
  const [defineFor, setDefineFor] = useState<Cambio | null>(null);
  const [avisoFor, setAvisoFor] = useState<{cambio: Cambio; tipo: "estado" | "recordatorio_devolucion"} | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const { toast } = useToast();

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("store_cambios" as any)
      .select("*, producto:store_products!store_cambios_producto_id_fkey(name, image_url), alumnos(nombre, apellido, telefono)")
      .in("estado", ["aprobado", "en_deposito", "listo_retiro"])
      .order("created_at", { ascending: true });

    if (error) {
      setLoading(false);
      toast({ title: "No se pudieron cargar los cambios", description: error.message, variant: "destructive" });
      return;
    }

    const list = (data as any[]) || [];
    setItems(list);

    const replacementIds = Array.from(new Set(list.map((c) => c.producto_reemplazo_id).filter(Boolean)));
    if (replacementIds.length) {
      const { data: prodRows } = await supabase.from("store_products").select("id, name").in("id", replacementIds);
      const map: Record<string, string> = {};
      (prodRows || []).forEach((p: any) => { map[p.id] = p.name; });
      setProducts(map);
    } else {
      setProducts({});
    }

    const orderIds = Array.from(new Set(list.map((c) => c.order_id || c.compra_id).filter(Boolean)));
    if (orderIds.length) {
      const { data: orderRows } = await supabase.from("store_orders").select("id, order_number, sede_retiro_id").in("id", orderIds);
      const map: Record<string, any> = {};
      (orderRows || []).forEach((o: any) => { map[o.id] = o; });
      setOrders(map);

      const sedeIds = Array.from(new Set(((orderRows as any[]) || []).map((o: any) => o.sede_retiro_id).filter(Boolean)));
      if (sedeIds.length) {
        const { data: sedeRows } = await supabase.from("sedes").select("id,nombre").in("id", sedeIds);
        const sedeMap: Record<string, string> = {};
        (sedeRows || []).forEach((s: any) => { sedeMap[s.id] = s.nombre; });
        setSedeNames(sedeMap);
      } else {
        setSedeNames({});
      }
    } else {
      setOrders({});
      setSedeNames({});
    }

    const { data: cajasActivas } = await (supabase as any).from("vehiculo_cargas")
      .select("sede_id").in("estado", ["abierta","en_ruta"]);
    const cajasIds = Array.from(new Set(((cajasActivas || []) as any[]).map(x => x.sede_id).filter(Boolean))) as string[];
    if (cajasIds.length) {
      const { data: destinosActivos } = await supabase.from("sedes").select("id,nombre").in("id", cajasIds);
      setSedesCamioneta((destinosActivos as any[]) || []);
    } else setSedesCamioneta([]);

    const cambioIds = list.map((c) => c.id);
    if (cambioIds.length) {
      const { data: cargados } = await (supabase as any)
        .from("vehiculo_carga_items")
        .select("source_id")
        .eq("source_table", "store_cambios")
        .eq("estado", "cargado")
        .in("source_id", cambioIds);
      setCambiosEnCamioneta(new Set(((cargados as any[]) || []).map((r: any) => r.source_id)));
    } else {
      setCambiosEnCamioneta(new Set());
    }

    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const pendientes = useMemo(
    () => items.filter((c) => ["aprobado", "en_deposito", "listo_retiro"].includes(c.estado)),
    [items],
  );

  const recibirDevolucion = async (cambio: Cambio, devuelto: any) => {
    if (!devuelto) throw new Error("Falta identificar la prenda devuelta");
    const { error } = await supabase.rpc("deposito_recibir_devolucion" as any, {
      p_cambio_id: cambio.id,
      p_metodo: devuelto.metodo,
      p_producto_id: devuelto.productId,
      p_variante: devuelto.variante,
    });
    if (error) throw error;
    toast({ title: "Devolución recibida. Stock registrado según corresponda." });
    await load();
  };

  const prepararReemplazo = async (cambio: Cambio, recibido: any) => {
    if (!recibido) throw new Error("Falta identificar la prenda de reemplazo");
    const { error } = await supabase.rpc("deposito_preparar_reemplazo" as any, {
      p_cambio_id: cambio.id,
      p_metodo: recibido.metodo,
      p_producto_id: recibido.productId,
      p_variante: recibido.variante,
    });
    if (error) throw error;
    toast({ title: "Reemplazo preparado", description: "Imprimí la etiqueta QR para identificar la bolsa antes de cargarla." });
    await load();
    // Se abre la etiqueta del cambio/pedido inmediatamente después de identificar el producto.
    // No depende de la devolución física de la prenda anterior.
    setLabelFor({ ...cambio, producto_reemplazo_id: null,
      producto: { ...cambio.producto, name: recibido.productName },
      variante_destino: recibido.variante,
      _nombre_etiqueta: recibido.productName });
  };

  const ponerEnCamioneta = async (cambio: Cambio) => {
    const orderId = cambio.order_id || cambio.compra_id;
    const order = orderId ? orders[orderId] : null;
    const sedeId = destinos[cambio.id] || order?.sede_retiro_id;
    if (!sedeId) {
      toast({
        title: "Elegí el destino de camioneta",
        description: "Definí la sede del pedido antes de pasarlo a camioneta.",
        variant: "destructive",
      });
      return;
    }

    if (cambio.reemplazo_canal_entrega === "moto" && cambio.reemplazo_despachado_at) {
      toast({title:"Este reemplazo ya fue enviado por moto",variant:"destructive"});
      return;
    }
    if (cambio.reemplazo_entregado_at) {
      toast({title:"El reemplazo ya se entregó",variant:"destructive"});
      return;
    }
    if (!cambio.preparado_at && !["enviado","entregado"].includes(cambio.reemplazo_estado || "")) {
      toast({ title: "Primero prepará el reemplazo", variant: "destructive" });
      return;
    }
    setBusy(`camioneta:${cambio.id}`);
    const { data: carga, error: cargaError } = await (supabase as any)
      .from("vehiculo_cargas")
      .select("id,estado")
      .eq("sede_id", sedeId)
      .in("estado", ["abierta", "en_ruta"])
      .limit(1)
      .maybeSingle();

    if (cargaError || !carga?.id) {
      setBusy(null);
      toast({
        title: "No hay caja activa para esa sede",
        description: `Abrí la sede ${sedeNames[sedeId] || ""} en Camioneta y volvé a intentar.`,
        variant: "destructive",
      });
      return;
    }

    const { data: existing } = await (supabase as any)
      .from("vehiculo_carga_items")
      .select("id")
      .eq("source_table", "store_cambios")
      .eq("source_id", cambio.id)
      .eq("estado", "cargado")
      .maybeSingle();

    if (existing?.id) {
      setBusy(null);
      setCambiosEnCamioneta((prev) => new Set([...prev, cambio.id]));
      toast({ title: "Este cambio ya está en camioneta" });
      return;
    }

    const nombre = [cambio.alumnos?.nombre, cambio.alumnos?.apellido].filter(Boolean).join(" ") || "Alumno";
    const replacementName = cambio.producto_reemplazo_id
      ? products[cambio.producto_reemplazo_id]
      : cambio.producto?.name;

    const { error } = await (supabase as any).from("vehiculo_carga_items").insert({
      carga_id: carga.id,
      source_table: "store_cambios",
      source_id: cambio.id,
      alumno_id: cambio.alumno_id || null,
      cliente_nombre: nombre,
      producto: replacementName || "Reemplazo de cambio",
      variante: formatVariante(cambio.variante_destino) || null,
      cantidad: 1,
      estado: "cargado",
      notas: (order?.order_number ? `Cambio · Pedido #${order.order_number}` : "Cambio") + (!cambio.recibido_en && !esSustitucionFaltaStock(cambio) ? " · DEVOLUCIÓN PENDIENTE" : ""),
    });
    setBusy(null);

    if (error) {
      toast({ title: "No se pudo pasar a camioneta", description: error.message, variant: "destructive" });
      return;
    }

    setCambiosEnCamioneta((prev) => new Set([...prev, cambio.id]));
    toast({
      title: "Reemplazo cargado en camioneta · devolución pendiente si corresponde",
      description: sedeNames[sedeId] ? `Caja ${sedeNames[sedeId]}` : undefined,
    });
  };

  /** Moto: despacho registrado sin afirmar que el alumno lo recibió. */
  const enviarPorMoto = async (cambio: Cambio) => {
    if (!window.confirm("¿Confirmás que entregaste el reemplazo al servicio de moto? Esto NO lo marca recibido por el alumno.")) return;
    setBusy("moto:"+cambio.id);
    const { error } = await supabase.rpc("registrar_envio_moto_reemplazo" as any, {
      p_cambio_id: cambio.id,
      p_nota: "Despacho de reemplazo por moto registrado en depósito",
    });
    setBusy(null);
    if(error) {
      toast({title:"No se pudo registrar el envío por moto",description:error.message,variant:"destructive"});
      return;
    }
    toast({title:"Reemplazo enviado por moto",description:"Aguardando confirmación de entrega. La devolución sigue pendiente si todavía no la recibimos."});
    await load();
  };

  /** Una entrega física no es el cierre del cambio hasta recibir la prenda original. */
  const confirmarEntrega = async (cambio: Cambio, canal: "mano"|"moto"|"camioneta") => {
    const detalle=canal==="moto"?"por moto":canal==="camioneta"?"desde la camioneta":"en mano";
    if(!window.confirm(`¿Confirmás que el alumno recibió físicamente el reemplazo ${detalle}? Si todavía no devolvió la prenda original, el cambio seguirá abierto.`)) return;
    setBusy("entregar:"+cambio.id);
    const { data, error } = await supabase.rpc("confirmar_entrega_reemplazo" as any, {
      p_cambio_id: cambio.id,
      p_canal: canal,
      p_nota: "Entrega del reemplazo confirmada por depósito",
    });
    setBusy(null);
    if(error) {
      toast({title:"No se pudo confirmar la entrega",description:error.message,variant:"destructive"});
      return;
    }
    const pendiente = (data as any)?.devolucion_pendiente;
    toast({title:"Reemplazo entregado",description:pendiente
      ?"La devolución del alumno sigue PENDIENTE. El cambio continúa abierto."
      :"Ambas partes están resueltas. Cambio cerrado."});
    await load();
  };

  if (loading) {
    return (
      <section className="rounded-xl border border-border bg-card p-4">
        <p className="text-sm text-muted-foreground">Cargando cambios y sustituciones para preparar...</p>
      </section>
    );
  }

  if (!pendientes.length) return null;

  return (
    <>
      <section className="rounded-xl border border-primary/30 bg-primary/5 overflow-hidden">
        <div className="p-4 border-b border-border flex items-start justify-between gap-3">
          <div>
            <h2 className="font-heading font-bold uppercase tracking-wider">Cambios y sustituciones para preparar</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Se preparan acá junto con los pedidos de tienda. “Cambios” queda como seguimiento e historial.
            </p>
          </div>
          <Badge variant="outline">{pendientes.length} pendiente{pendientes.length === 1 ? "" : "s"}</Badge>
        </div>

        <div className="divide-y divide-border">
          {pendientes.map((c) => {
            const sust = esSustitucionFaltaStock(c);
            const devuelta = sust || Boolean(c.recibido_en);
            const preparado = Boolean(c.preparado_at) || ["enviado","entregado"].includes(c.reemplazo_estado || "");
            const listo = devuelta && preparado;
            const reemplazoEntregado = !!c.reemplazo_entregado_at;
            const enviadoMoto = c.reemplazo_canal_entrega === "moto" && !!c.reemplazo_despachado_at;
            const enCamioneta = cambiosEnCamioneta.has(c.id);
            const canalEntrega: "camioneta"|"moto"|"mano" = enCamioneta ? "camioneta" : enviadoMoto ? "moto" : "mano";
            const orderId = c.order_id || c.compra_id;
            const order = orderId ? orders[orderId] : null;
            const replacementName = c.producto_reemplazo_id ? products[c.producto_reemplazo_id] : null;
            const nombre = [c.alumnos?.nombre, c.alumnos?.apellido].filter(Boolean).join(" ") || "Alumno";

            return (
              <div key={c.id} className="p-4 bg-background/40">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className={sust ? "bg-amber-500/15 text-amber-400 border border-amber-500/30" : "bg-cyan/15 text-cyan border border-cyan/30"}>
                        {sust ? "SUSTITUCIÓN" : "CAMBIO"}
                      </Badge>
                      {order?.order_number && <span className="text-xs text-muted-foreground">Pedido #{order.order_number}</span>}
                    </div>
                    <p className="font-semibold mt-2">{nombre}</p>
                    <p className="text-sm">
                      {sust ? "Original no entregado: " : "Original: "}
                      <span className="font-medium">{c.producto?.name || "Producto"}</span>
                      {c.variante_origen && <span className="text-muted-foreground"> · {formatVariante(c.variante_origen)}</span>}
                    </p>
                    <p className="text-sm">
                      Preparar: <span className="font-medium">{replacementName || c.producto?.name || "Reemplazo"}</span>
                      {c.variante_destino && <span className="text-muted-foreground"> · {formatVariante(c.variante_destino)}</span>}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Estado: {estadoTexto(c)}
                      {sust && " · no requiere devolución física"}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                      <Badge variant="outline" className={devuelta ? "border-green-500/40 text-green-400" : "border-amber-500/40 text-amber-400"}>
                        {sust ? "Sin devolución" : devuelta ? "Devolución recibida" : "Devolución pendiente"}
                      </Badge>
                      <Badge variant="outline" className={preparado ? "border-green-500/40 text-green-400" : "border-amber-500/40 text-amber-400"}>
                        {reemplazoEntregado ? "Reemplazo entregado" : enviadoMoto ? "Enviado por moto" : enCamioneta ? "En camioneta" : preparado ? "Reemplazo preparado" : "Reemplazo pendiente"}
                      </Badge>
                      {!devuelta && c.stock_devuelto_at && <Badge variant="destructive">Revisar stock: ingreso sin recepción</Badge>}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 items-center sm:justify-end sm:max-w-[340px]">
                    {!sust && !devuelta && (
                      <Button size="sm" onClick={() => setScanFor(c)}>
                        <ScanLine className="w-4 h-4 mr-1" /> Recibir devolución
                      </Button>
                    )}
                    {!preparado && (
                      <Button size="sm" onClick={() => setDefineFor(c)}>
                        <Package className="w-4 h-4 mr-1" /> Preparar reemplazo
                      </Button>
                    )}
                    {!preparado && !!c.variante_destino && Object.keys(c.variante_destino).length > 0 && (
                      <Button size="sm" variant="outline" onClick={() => setLabelFor(c)}>
                        <Tag className="w-4 h-4 mr-1" /> Generar etiqueta QR
                      </Button>
                    )}
                    {preparado && <>
                      <Button size="sm" variant="outline" onClick={() => setLabelFor(c)}>
                        <Tag className="w-4 h-4 mr-1" /> Imprimir etiqueta QR
                      </Button>
                      {!reemplazoEntregado && !enviadoMoto && !enCamioneta && (
                        <Select value={destinos[c.id] || order?.sede_retiro_id || ""} onValueChange={(v) => setDestinos((prev) => ({ ...prev, [c.id]: v }))}>
                          <SelectTrigger className="w-full sm:w-[175px] h-8"><SelectValue placeholder="Destino camioneta" /></SelectTrigger>
                          <SelectContent>{sedesCamioneta.map((s) => <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>)}</SelectContent>
                        </Select>
                      )}
                      {enCamioneta ? <Badge variant="outline" className="text-green-400"><Truck className="w-3 h-3 mr-1" /> En camioneta</Badge>
                        : !enviadoMoto && !reemplazoEntregado &&
                          <Button size="sm" variant="outline" disabled={busy==="camioneta:"+c.id} onClick={()=>ponerEnCamioneta(c)}>
                            <Truck className="w-4 h-4 mr-1"/> Poner en camioneta
                          </Button>}
                      {!enCamioneta && !enviadoMoto && !reemplazoEntregado &&
                        <Button size="sm" variant="outline" disabled={busy==="moto:"+c.id} onClick={()=>enviarPorMoto(c)}>
                          <Truck className="w-4 h-4 mr-1" /> Enviar por moto
                        </Button>}
                      {!reemplazoEntregado && (
                        <Button size="sm" variant="outline" disabled={busy==="entregar:"+c.id}
                          onClick={()=>confirmarEntrega(c,canalEntrega)}>
                          <CheckCircle2 className="w-4 h-4 mr-1"/> Confirmar entregado {canalEntrega==="mano"?"en mano":canalEntrega==="moto"?"por moto":""}
                        </Button>
                      )}
                      {reemplazoEntregado && <Badge className="bg-green-600/20 text-green-400">Reemplazo recibido por alumno</Badge>}
                      {!devuelta && <Badge variant="outline" className="text-amber-400 border-amber-500/40">Devolución pendiente · cambio abierto</Badge>}
                    </>}
                    <Button size="sm" variant="outline"
                      onClick={() => setAvisoFor({ cambio:c, tipo:"estado" })}>
                      <MessageCircle className="w-4 h-4 mr-1" /> Avisar estado
                    </Button>
                    {!sust && !devuelta &&
                      <Button size="sm" variant="outline"
                        onClick={() => setAvisoFor({ cambio:c, tipo:"recordatorio_devolucion" })}>
                        <Bell className="w-4 h-4 mr-1" /> Recordar devolución
                      </Button>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="px-4 py-2 border-t border-border text-[11px] text-muted-foreground flex items-center gap-1">
          <RefreshCw className="w-3 h-3" />
          Esta bandeja se actualiza al completar cada paso.
        </div>
      </section>

      <CambioLabelDialog
        open={!!labelFor}
        onOpenChange={(v) => !v && setLabelFor(null)}
        data={labelFor ? (() => {
          const orderId = labelFor.order_id || labelFor.compra_id;
          const order = orderId ? orders[orderId] : null;
          const replacementName = labelFor.producto_reemplazo_id
            ? products[labelFor.producto_reemplazo_id]
            : labelFor._nombre_etiqueta || labelFor.producto?.name;
          return {
            id: labelFor.id,
            alumno_nombre: [labelFor.alumnos?.nombre, labelFor.alumnos?.apellido].filter(Boolean).join(" ") || "Alumno",
            producto: replacementName || "Reemplazo",
            variante: formatVariante(labelFor.variante_destino) || null,
            sede: order?.sede_retiro_id ? sedeNames[order.sede_retiro_id] || null : null,
            order_number: order?.order_number || null,
          };
        })() : null}
      />

      {scanFor && (
        <ScanCambioDialog
          mode="return"
          open={!!scanFor}
          onOpenChange={(v) => !v && setScanFor(null)}
          title={`Recibir cambio · ${scanFor.producto?.name || ""}`}
          expectedReturnProductId={scanFor.producto_id}
          expectedReturnVariante={scanFor.variante_origen}
          expectedDeliverProductId={scanFor.producto_reemplazo_id || scanFor.producto_id}
          expectedDeliverVariante={scanFor.variante_destino}
          onConfirm={({ devuelto }) => recibirDevolucion(scanFor, devuelto)}
        />
      )}

      {defineFor && (
        <ScanCambioDialog
          mode="replacement"
          cambioId={defineFor.id}
          onPrintLabel={() => { setLabelFor(defineFor); setDefineFor(null); }}
          open={!!defineFor}
          onOpenChange={(v) => !v && setDefineFor(null)}
          title={`Preparar reemplazo · ${defineFor.producto?.name || ""}`}
          expectedReturnProductId={defineFor.producto_id}
          expectedReturnVariante={defineFor.variante_origen}
          expectedDeliverProductId={defineFor.producto_reemplazo_id || defineFor.producto_id}
          expectedDeliverVariante={defineFor.variante_destino}
          requireReemplazo
          onConfirm={({ recibido }) => {
            if (!recibido) throw new Error("Falta reemplazo");
            return prepararReemplazo(defineFor, recibido);
          }}
        />
      )}
      {avisoFor && <CambioAvisoDialog
        open={!!avisoFor}
        onOpenChange={(v) => { if (!v) setAvisoFor(null); }}
        cambio={avisoFor.cambio}
        tipo={avisoFor.tipo}
        onRegistered={load}
      />}
    </>
  );
};

export default CambiosPreparacionSection;
