import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Package, RefreshCw, ScanLine, CheckCircle2, Tag, Truck } from "lucide-react";
import ScanCambioDialog from "@/components/deposito/ScanCambioDialog";
import CambioLabelDialog from "@/components/deposito/CambioLabelDialog";
import { formatVariante } from "@/lib/productQr";
import { esSustitucionFaltaStock } from "@/lib/faltaStock";

type Cambio = any;

const estadoTexto = (c: Cambio) => {
  if (c.estado === "aprobado" && !esSustitucionFaltaStock(c)) return "A recibir devolución";
  if (c.estado === "en_deposito" && !esSustitucionFaltaStock(c)) return "Preparar reemplazo";
  if (["aprobado", "en_deposito"].includes(c.estado) && esSustitucionFaltaStock(c)) return "Preparar reemplazo";
  if (c.estado === "listo_retiro") return "Listo para entregar";
  return c.estado || "Pendiente";
};

const CambiosPreparacionSection = () => {
  const [items, setItems] = useState<Cambio[]>([]);
  const [products, setProducts] = useState<Record<string, string>>({});
  const [orders, setOrders] = useState<Record<string, any>>({});
  const [sedeNames, setSedeNames] = useState<Record<string, string>>({});
  const [cambiosEnCamioneta, setCambiosEnCamioneta] = useState<Set<string>>(new Set());
  const [labelFor, setLabelFor] = useState<Cambio | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanFor, setScanFor] = useState<Cambio | null>(null);
  const [defineFor, setDefineFor] = useState<Cambio | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const { toast } = useToast();

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("store_cambios" as any)
      .select("*, producto:store_products!store_cambios_producto_id_fkey(name, image_url), alumnos(nombre, apellido)")
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

  const procesarConScan = async (cambio: Cambio, devuelto: any, recibido: any | null) => {
    const { error } = await supabase.rpc("deposito_recibir_cambio" as any, {
      p_cambio_id: cambio.id,
      p_metodo: devuelto.metodo,
      p_qr_devuelto_pid: devuelto.productId,
      p_qr_devuelto_variante: devuelto.variante,
      p_entregar_reemplazo: !!recibido,
      p_qr_recibido_pid: recibido?.productId || null,
      p_qr_recibido_variante: recibido?.variante || null,
    });
    if (error) throw error;
    toast({ title: recibido ? "Cambio listo para entregar" : "Devolución recibida" });
    await load();
  };

  const definirReemplazo = async (cambio: Cambio, recibido: any) => {
    const { error } = await supabase.rpc("deposito_definir_reemplazo" as any, {
      p_cambio_id: cambio.id,
      p_metodo: recibido.metodo,
      p_producto_id: recibido.productId,
      p_variante: recibido.variante,
      p_marcar_listo: true,
    });
    if (error) throw error;
    toast({ title: "Reemplazo listo para entregar" });
    await load();
  };

  const marcarListo = async (id: string) => {
    setBusy(id);
    const { error } = await supabase.rpc("transition_cambio_estado" as any, {
      p_id: id,
      p_nuevo_estado: "listo_retiro",
      p_nota: "Reemplazo preparado desde la bandeja unificada de Pedidos",
    });
    setBusy(null);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Reemplazo listo para entregar" });
    await load();
  };

  const ponerEnCamioneta = async (cambio: Cambio) => {
    const orderId = cambio.order_id || cambio.compra_id;
    const order = orderId ? orders[orderId] : null;
    const sedeId = order?.sede_retiro_id;
    if (!sedeId) {
      toast({
        title: "Falta sede de retiro",
        description: "Definí la sede del pedido antes de pasarlo a camioneta.",
        variant: "destructive",
      });
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
      notas: order?.order_number ? `Cambio · Pedido #${order.order_number}` : "Cambio",
    });
    setBusy(null);

    if (error) {
      toast({ title: "No se pudo pasar a camioneta", description: error.message, variant: "destructive" });
      return;
    }

    setCambiosEnCamioneta((prev) => new Set([...prev, cambio.id]));
    toast({
      title: "Cambio puesto en camioneta",
      description: sedeNames[sedeId] ? `Caja ${sedeNames[sedeId]}` : undefined,
    });
  };

  const marcarEntregado = async (id: string) => {
    setBusy(id);
    const { error } = await supabase.rpc("transition_cambio_estado" as any, {
      p_id: id,
      p_nuevo_estado: "entregado",
      p_nota: "Entregado desde la bandeja unificada de Pedidos",
    });
    if (!error) {
      await (supabase as any)
        .from("vehiculo_carga_items")
        .update({ estado: "entregado", entregado_at: new Date().toISOString() })
        .eq("source_table", "store_cambios")
        .eq("source_id", id)
        .eq("estado", "cargado");
    }
    setBusy(null);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Cambio entregado" });
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
                  </div>

                  <div className="shrink-0">
                    {c.estado === "aprobado" && !sust && (
                      <Button size="sm" onClick={() => setScanFor(c)}>
                        <ScanLine className="w-4 h-4 mr-1" /> Recibir devolución
                      </Button>
                    )}
                    {c.estado === "en_deposito" && !sust && (
                      <Button size="sm" onClick={() => setDefineFor(c)}>
                        <Package className="w-4 h-4 mr-1" /> Preparar reemplazo
                      </Button>
                    )}
                    {["aprobado", "en_deposito"].includes(c.estado) && sust && (
                      <Button size="sm" disabled={busy === c.id} onClick={() => marcarListo(c.id)}>
                        <Package className="w-4 h-4 mr-1" /> Listo para entregar
                      </Button>
                    )}
                    {c.estado === "listo_retiro" && (
                      <div className="flex gap-2 flex-wrap justify-end">
                        <Button size="sm" variant="outline" onClick={() => setLabelFor(c)}>
                          <Tag className="w-4 h-4 mr-1" /> Etiqueta cambio
                        </Button>
                        {cambiosEnCamioneta.has(c.id) ? (
                          <Badge variant="outline" className="h-9 px-3 border-green-500/40 text-green-400 flex items-center">
                            <Truck className="w-4 h-4 mr-1" /> En camioneta
                          </Badge>
                        ) : (
                          <Button
                            size="sm"
                            disabled={busy === `camioneta:${c.id}`}
                            onClick={() => ponerEnCamioneta(c)}
                          >
                            <Truck className="w-4 h-4 mr-1" /> Poner en camioneta
                          </Button>
                        )}
                        <Button size="sm" variant="outline" disabled={busy === c.id} onClick={() => marcarEntregado(c.id)}>
                          <CheckCircle2 className="w-4 h-4 mr-1" /> Marcar entregado
                        </Button>
                      </div>
                    )}
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
            : labelFor.producto?.name;
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
          open={!!scanFor}
          onOpenChange={(v) => !v && setScanFor(null)}
          title={`Recibir cambio · ${scanFor.producto?.name || ""}`}
          expectedReturnProductId={scanFor.producto_id}
          expectedReturnVariante={scanFor.variante_origen}
          expectedDeliverProductId={scanFor.producto_reemplazo_id || scanFor.producto_id}
          expectedDeliverVariante={scanFor.variante_destino}
          requireReemplazo={!!scanFor.variante_destino}
          onConfirm={({ devuelto, recibido }) => procesarConScan(scanFor, devuelto, recibido)}
        />
      )}

      {defineFor && (
        <ScanCambioDialog
          open={!!defineFor}
          onOpenChange={(v) => !v && setDefineFor(null)}
          title={`Preparar reemplazo · ${defineFor.producto?.name || ""}`}
          expectedReturnProductId={defineFor.producto_id}
          expectedReturnVariante={defineFor.variante_origen}
          requireReemplazo
          onConfirm={({ recibido }) => {
            if (!recibido) throw new Error("Falta reemplazo");
            return definirReemplazo(defineFor, recibido);
          }}
        />
      )}
    </>
  );
};

export default CambiosPreparacionSection;
