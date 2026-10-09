import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { CheckCheck, Copy, MessageCircle, PackageSearch, ScanLine, Truck } from "lucide-react";
import CameraScanner from "@/components/deposito/CameraScanner";
import { avisoWaLink } from "@/lib/camionetaAviso";

type Carga = { id: string; sede_id: string; estado: string };
type Sede = { id: string; nombre: string };
type Item = {
  id: string; carga_id: string; source_table: string; source_id: string;
  cliente_nombre: string; producto: string | null; variante: string | null;
  cantidad: number; estado: string; chequeado_at?: string | null;
};
type Orden = {
  id: string; order_number?: number; status: string; customer_name?: string;
  customer_phone?: string | null; alumno_id?: string | null; telefono?: string | null;
};
type Consulta = {
  id: string; item_id: string; respuesta: string; gusto: string | null;
  comentario: string | null; consultado_at: string;
};
const key = (v: string | null | undefined) =>
  (v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const uuidEn = (v: string) =>
  v.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0]?.toLowerCase() || null;
const extractPathUuid = (code: string, path: string) =>
  code.match(new RegExp("(?:^|/)" + path + "/([0-9a-f-]{36})(?:[/?#]|$)", "i"))?.[1]?.toLowerCase() || null;

export default function ControlCamionetaUnificado({
  open, onOpenChange, cargas, sedes, onCompleted,
}: {
  open: boolean; onOpenChange: (v: boolean) => void;
  cargas: Carga[]; sedes: Sede[]; onCompleted?: () => void;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [ordenes, setOrdenes] = useState<Record<string, Orden>>({});
  const [orderForItem, setOrderForItem] = useState<Record<string, string>>({});
  const [telExterno, setTelExterno] = useState<Record<string, string>>({});
  const [rondas, setRondas] = useState<Record<string, string>>({});
  const [vistos, setVistos] = useState<Record<string, number>>({});
  const [ultimosVistos, setUltimosVistos] = useState<Record<string, number>>({});
  const [consultas, setConsultas] = useState<Record<string, Consulta>>({});
  const [scannerOpen, setScannerOpen] = useState(false);
  const [buscando, setBuscando] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [candidatos, setCandidatos] = useState<Item[]>([]);
  const [codigoPendiente, setCodigoPendiente] = useState("");
  const [cantidadManual, setCantidadManual] = useState<Record<string, string>>({});
  const [consultaItem, setConsultaItem] = useState<Item | null>(null);
  const [mensaje, setMensaje] = useState("");
  const [abiertoWa, setAbiertoWa] = useState(false);
  const [respuesta, setRespuesta] = useState("pendiente");
  const [gusto, setGusto] = useState("sin_opinion");
  const [comentario, setComentario] = useState("");
  const scanningRef = useRef(false);

  const cargasIds = useMemo(() => cargas.map((c) => c.id), [cargas]);

  const recargar = async () => {
    if (!cargasIds.length) return;
    setLoading(true);
    const [itRes, rondasRes] = await Promise.all([
      (supabase as any).from("vehiculo_carga_items").select("*").in("carga_id", cargasIds).order("cliente_nombre"),
      (supabase as any).from("vehiculo_chequeos").select("id,carga_id").in("carga_id", cargasIds).eq("estado", "en_curso"),
    ]);
    if (itRes.error || rondasRes.error) {
      toast.error(itRes.error?.message || rondasRes.error?.message || "No se pudo cargar el control");
      setLoading(false); return;
    }
    const list: Item[] = itRes.data || [];
    setItems(list);
    const mapRondas: Record<string,string> = {};
    (rondasRes.data || []).forEach((r: any) => { mapRondas[r.carga_id] = r.id; });
    setRondas(mapRondas);
    const rIds = Object.values(mapRondas);
    if (rIds.length) {
      const { data: scans } = await (supabase as any).from("vehiculo_chequeo_scans")
        .select("item_id,cantidad_vista").in("chequeo_id", rIds);
      const m: Record<string,number> = {};
      (scans || []).forEach((s: any) => { m[s.item_id] = Number(s.cantidad_vista) || 0; });
      setVistos(m);
    } else setVistos({});

    // Al reabrir un control ya cerrado, conservar lo observado en la última ronda de cada subcarga.
    const { data: cerradas } = await (supabase as any).from("vehiculo_chequeos")
      .select("id,carga_id,closed_at").in("carga_id",cargasIds).eq("estado","cerrado")
      .order("closed_at",{ascending:false});
    const porCarga: Record<string,string> = {};
    (cerradas || []).forEach((r: any) => { if (!porCarga[r.carga_id]) porCarga[r.carga_id] = r.id; });
    const idsUltima = Object.values(porCarga);
    if (idsUltima.length) {
      const { data: ultimosScans } = await (supabase as any).from("vehiculo_chequeo_scans")
        .select("item_id,cantidad_vista").in("chequeo_id",idsUltima);
      const observed: Record<string,number> = {};
      (ultimosScans || []).forEach((r: any) => { observed[r.item_id] = Number(r.cantidad_vista) || 0; });
      setUltimosVistos(observed);
    } else setUltimosVistos({});

    const storeIds = list.filter((it) => it.source_table === "store_order_items").map((it) => it.source_id);
    const oi = storeIds.length ? await supabase.from("store_order_items").select("id,order_id").in("id",storeIds) : {data: []};
    const orderToItem: Record<string,string> = {};
    (oi.data || []).forEach((x: any) => {
      list.filter((it) => it.source_id === x.id && it.source_table === "store_order_items")
        .forEach((it) => { orderToItem[it.id] = x.order_id; });
    });
    setOrderForItem(orderToItem);
    const orderIds = Array.from(new Set(Object.values(orderToItem)));
    if (orderIds.length) {
      const { data: ords } = await supabase.from("store_orders")
        .select("id,order_number,status,customer_name,customer_phone,alumno_id").in("id",orderIds);
      const alumnoIds = Array.from(new Set((ords || []).map((o: any) => o.alumno_id).filter(Boolean)));
      const als = alumnoIds.length ? await supabase.from("alumnos").select("id,telefono").in("id",alumnoIds) : { data: [] };
      const telMap = new Map((als.data || []).map((a: any) => [a.id,a.telefono]));
      const oMap: Record<string,Orden> = {};
      (ords || []).forEach((o: any) => { oMap[o.id] = {...o,telefono:telMap.get(o.alumno_id) || o.customer_phone}; });
      setOrdenes(oMap);
    } else setOrdenes({});

    const extIds = list.filter((it) => it.source_table === "pedidos_externos").map((it) => it.source_id);
    const ext = extIds.length ? await (supabase as any).from("pedidos_externos")
      .select("id,cliente_telefono").in("id",extIds) : { data: [] };
    const eMap: Record<string,string> = {};
    (ext.data || []).forEach((e: any) => { eMap[e.id] = e.cliente_telefono || ""; });
    setTelExterno(eMap);

    const itemIds = list.map((it) => it.id);
    if (itemIds.length) {
      const { data: con } = await (supabase as any).from("vehiculo_entrega_consultas")
        .select("id,item_id,respuesta,gusto,comentario,consultado_at")
        .in("item_id", itemIds).order("consultado_at",{ascending:false});
      const cc: Record<string,Consulta> = {};
      (con || []).forEach((c: Consulta) => { if (!cc[c.item_id]) cc[c.item_id] = c; });
      setConsultas(cc);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (open) {
      setScannerOpen(false); setCandidatos([]); setBuscando("");
      void recargar();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const entregadoAdministracion = (it: Item) =>
    it.estado === "entregado" || ordenes[orderForItem[it.id]]?.status === "entregado";
  const esperado = items.filter((it) => it.estado === "cargado"
    && !entregadoAdministracion(it)
    && ordenes[orderForItem[it.id]]?.status !== "cancelado");
  const isRunning = cargasIds.length > 0 && cargasIds.every((id) => !!rondas[id]);
  const vistosDeRonda = isRunning ? vistos : ultimosVistos;
  const estan = esperado.filter((it) => (vistosDeRonda[it.id] || 0) > 0);
  const sinEscanear = isRunning ? esperado.filter((it) => !(vistos[it.id] > 0)) : [];
  const faltantes = items.filter((it) => it.estado === "faltante" && !entregadoAdministracion(it));
  const yaEntregados = items.filter(entregadoAdministracion);

  const iniciar = async () => {
    setBusy(true);
    for (const c of cargas) {
      if (rondas[c.id]) continue;
      const { error } = await (supabase as any).rpc("start_vehiculo_chequeo", {
        _carga_id:c.id, _responsable_nombre:null,
      });
      if (error) { toast.error("No se pudo iniciar el control: " + error.message); setBusy(false); await recargar(); return; }
    }
    await recargar();
    setBusy(false);
    toast.success("Control de toda la camioneta iniciado");
  };

  const marcarVisto = async (it: Item, cant?: number) => {
    const rId = rondas[it.carga_id];
    if (!rId) { toast.error("Iniciá el control antes de escanear"); return; }
    const cantidad = Math.min(Math.max(0,cant ?? 1),Number(it.cantidad) || 1);
    const { data: auth } = await supabase.auth.getUser();
    const now = new Date().toISOString();
    const { error } = await (supabase as any).from("vehiculo_chequeo_scans").upsert({
      chequeo_id:rId,item_id:it.id,cantidad_vista:cantidad,
      scanned_at:now,scanned_by:auth.user?.id ?? null,
    },{onConflict:"chequeo_id,item_id"});
    if (error) { toast.error("No se pudo registrar el escaneo: " + error.message); return; }
    await (supabase as any).from("vehiculo_carga_items")
      .update({chequeado_at:now,chequeado_by:auth.user?.id ?? null}).eq("id",it.id);
    setVistos((prev) => ({...prev,[it.id]:cantidad}));
    toast.success(it.cliente_nombre + " · " + (it.producto || "Pedido") + " localizado");
  };

  const decodificar = async (raw: string): Promise<Item[]> => {
    const code = raw.trim();
    const uuid = uuidEn(code);
    let matched: Item[] = [];
    const ordered = esperado.filter((it) => !(vistos[it.id] > 0));
    // QR inequívoco de paquete / ítem: identifica exactamente esta unidad de carga.
    if (uuid) matched = ordered.filter((it) => it.id.toLowerCase() === uuid);
    if (matched.length) return matched;
    // Etiqueta de pedido y QR de pago: resuelve el pedido padre, nunca lo confunde con el alumno.
    const parentId = extractPathUuid(code,"pagar-preventa") || uuid;
    if (parentId) {
      matched = ordered.filter((it) =>
        it.source_id.toLowerCase() === parentId ||
        orderForItem[it.id]?.toLowerCase() === parentId);
      if (matched.length) return matched;
    }
    const alumnoId = extractPathUuid(code,"pagar-preventas-alumno");
    if (alumnoId) {
      const ordersAlumno = Object.values(ordenes).filter((o) => o.alumno_id === alumnoId).map((o) => o.id);
      matched = ordered.filter((it) => ordersAlumno.includes(orderForItem[it.id]));
      if (matched.length) return matched;
    }
    // QR de listas de entrega: referencia al destinatario y a la lista, no al producto aislado.
    if (code.startsWith("RBDLV1:")) {
      try {
        const rawPayload = decodeURIComponent(escape(atob(code.slice(7).replace(/-/g,"+").replace(/_/g,"/"))));
        const [listId,...parts] = rawPayload.split("|");
        const alumno = parts.join("|");
        const { data: dli } = await supabase.from("delivery_list_items").select("id,cliente_nombre").eq("list_id",listId);
        const ids = (dli || []).filter((x: any) => key(x.cliente_nombre) === key(alumno)).map((x: any) => x.id);
        matched = ordered.filter((it) => it.source_table === "delivery_list_items" && ids.includes(it.source_id));
        if (matched.length) return matched;
      } catch { /* Otro formato: consultar manualmente */ }
    }
    // QR genérico RYB de producto: puede repetirse en MUCHOS pedidos.
    // Nunca marcar varios clientes por el escaneo de un solo código.
    const sku = code.match(/RYB-[A-Z0-9_-]+/i)?.[0]?.toUpperCase();
    if (sku) {
      const { data: row } = await (supabase as any).from("product_barcodes")
        .select("store_product_id,variante").eq("codigo",sku).maybeSingle();
      if (row?.store_product_id) {
        const { data: product } = await supabase.from("store_products").select("name")
          .eq("id",row.store_product_id).maybeSingle();
        const varianteTxt = row.variante && typeof row.variante === "object" ?
          Object.entries(row.variante).map(([k,v]) => k + ": " + v).join(" · ") : "";
        matched = ordered.filter((it) => key(it.producto) === key(product?.name)
          && (!varianteTxt || key(it.variante) === key(varianteTxt)));
        return matched;
      }
    }
    return [];
  };

  const onScan = async (code: string) => {
    if (scanningRef.current || candidatos.length > 0) return;
    scanningRef.current = true;
    try {
      const found = await decodificar(code);
      if (!found.length) {
        toast.error("Etiqueta no asociada a los pedidos pendientes", {
          description:"No se marcó ningún pedido. Buscalo por nombre o verificá la etiqueta.",
        });
      } else if (found.length === 1 && Number(found[0].cantidad) === 1) {
        await marcarVisto(found[0],1);
      } else {
        setCodigoPendiente(code);
        setCandidatos(found);
        setScannerOpen(false);
        toast.info("Confirmá qué pedido y cuántas unidades estás viendo.");
      }
    } finally { scanningRef.current = false; }
  };

  const registrarCandidato = async (it: Item) => {
    await marcarVisto(it,Number(cantidadManual[it.id] || 1));
    setCandidatos((prev) => prev.filter((x) => x.id !== it.id));
  };

  const cerrar = async () => {
    const n = sinEscanear.length;
    const ok = window.confirm("¿Cerrar el control completo? " + n +
      " pedido(s) no fueron encontrados durante el escaneo. Quedarán PENDIENTES DE REVISIÓN, nunca entregados automáticamente.");
    if (!ok) return;
    setBusy(true);
    const { error } = await (supabase as any).rpc("finalizar_control_camioneta_total", {
      p_chequeo_ids:Object.values(rondas),
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setScannerOpen(false);
    toast.success("Control guardado. Revisá los pedidos no encontrados.");
    await recargar();
    onCompleted?.();
  };

  const consultar = (it: Item) => {
    const orden = ordenes[orderForItem[it.id]];
    const ref = orden?.order_number ? "pedido #" + orden.order_number : "pedido";
    const nombre = (it.cliente_nombre || "").split(" ")[0] || "¿cómo estás?";
    const texto = "Hola " + nombre + ", ¿cómo estás? Estamos revisando las entregas de Reybaud.\n\n" +
      "Queríamos confirmar si recibiste tu " + ref + " (" + (it.producto || "indumentaria") +
      (it.variante ? " · " + it.variante : "") + ").\n\n" +
      "¿Lo recibiste? ¿Qué te pareció la prenda, te gustó y te quedó bien?\n\n" +
      "Nos ayuda mucho tu respuesta. ¡Gracias!";
    setConsultaItem(it); setMensaje(texto); setAbiertoWa(false);
    setRespuesta(consultas[it.id]?.respuesta || "pendiente");
    setGusto(consultas[it.id]?.gusto || "sin_opinion");
    setComentario(consultas[it.id]?.comentario || "");
  };
  const telefonoDe = (it: Item) =>
    ordenes[orderForItem[it.id]]?.telefono || telExterno[it.source_id] || "";

  const copiarConsulta = async () => {
    try { await navigator.clipboard.writeText(mensaje); setAbiertoWa(true); toast.success("Texto copiado"); }
    catch { toast.error("No se pudo copiar"); }
  };
  const abrirWA = () => {
    if (!consultaItem) return;
    const url = avisoWaLink(telefonoDe(consultaItem),mensaje);
    if (!url) { toast.error("Falta un teléfono válido. Podés copiar el mensaje."); return; }
    window.open(url,"_blank","noopener,noreferrer");
    setAbiertoWa(true);
    toast.info("WhatsApp abierto: el mensaje no se envió automáticamente.");
  };
  const registrarConsulta = async () => {
    if (!consultaItem || !abiertoWa) return;
    const { error } = await (supabase as any).rpc("registrar_consulta_entrega_camioneta",{
      p_item_id:consultaItem.id,p_mensaje:mensaje,p_canal:avisoWaLink(telefonoDe(consultaItem),mensaje) ? "whatsapp" : "otro",
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Consulta enviada: confirmación registrada");
    await recargar();
    setConsultaItem(null);
  };
  const registrarRespuesta = async () => {
    if (!consultaItem || !consultas[consultaItem.id]) return;
    const { error } = await (supabase as any).rpc("registrar_respuesta_entrega_camioneta",{
      p_consulta_id:consultas[consultaItem.id].id, p_respuesta:respuesta,
      p_gusto:respuesta === "recibido" ? gusto : null,p_comentario:comentario || null,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Respuesta y opinión registradas. No se cambió la entrega.");
    await recargar(); setConsultaItem(null);
  };

  const textoBusqueda = key(buscando);
  const filtro = (its: Item[]) => its.filter((it) => !textoBusqueda ||
    [it.cliente_nombre,it.producto,it.variante,ordenes[orderForItem[it.id]]?.order_number]
      .some((v) => key(String(v || "")).includes(textoBusqueda)));

  const tarjeta = (it: Item, pendiente: boolean) => {
    const o = ordenes[orderForItem[it.id]];
    const consulta = consultas[it.id];
    const faltaConfirmada = it.estado === "faltante";
    const sede = sedes.find((s) => s.id === cargas.find((c) => c.id === it.carga_id)?.sede_id)?.nombre || "Sin sede";
    return (
      <div key={it.id} className="rounded-lg border border-border p-3 space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{it.cliente_nombre}</p>
            <p className="text-xs text-muted-foreground">{it.producto || "Producto"}{it.variante ? " · " + it.variante : ""} · ×{Number(it.cantidad)}</p>
            <p className="text-[11px] text-muted-foreground">{o?.order_number ? "Pedido #" + o.order_number + " · " : ""}{sede}</p>
          </div>
          {pendiente ? <Badge variant={faltaConfirmada ? "destructive" : "outline"}>{faltaConfirmada ? "No encontrado" : "Por controlar"}</Badge> :
            <Badge variant="outline" className="border-green-500/40 text-green-400">Escaneado</Badge>}
        </div>
        {pendiente ? (
          faltaConfirmada ? (
            <div className="space-y-2">
              <p className="text-xs font-medium">¿Ese pedido fue entregado?</p>
              {consulta && <p className="text-[11px] text-muted-foreground">Consulta {new Date(consulta.consultado_at).toLocaleDateString("es-AR")} · respuesta: {consulta.respuesta.replace(/_/g," ")}{consulta.gusto ? " · le gustó: " + consulta.gusto : ""}</p>}
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => consultar(it)}>
                  <MessageCircle className="w-4 h-4 mr-1" /> Consultar y preguntar opinión
                </Button>
                <Button size="sm" variant="outline" onClick={async () => {
                  if (!window.confirm("¿Tenés confirmación de que el pedido fue entregado? Se actualizará su estado real.")) return;
                  const { error } = await (supabase as any).rpc("resolver_item_chequeo",{
                    _item_id:it.id,_accion:"entregado",
                  });
                  if (error) toast.error(error.message);
                  else { toast.success("Entrega confirmada por el operador"); void recargar(); onCompleted?.(); }
                }}>Sí, confirmar entrega</Button>
                <Button size="sm" variant="outline" onClick={async () => {
                  const { error } = await (supabase as any).rpc("resolver_item_chequeo",{
                    _item_id:it.id,_accion:"sigue_en_camioneta",
                  });
                  if (error) toast.error(error.message);
                  else { toast.success("Volvió a la lista de la camioneta"); void recargar(); }
                }}>Lo encontré · sigue en camioneta</Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs text-muted-foreground flex-1">Todavía no se escaneó en esta ronda. No implica que se haya entregado.</p>
              {isRunning && <Button size="sm" variant="outline" onClick={() => {
                if (!window.confirm("¿Verificaste físicamente este pedido en la camioneta?")) return;
                if (Number(it.cantidad) > 1) {
                  setCandidatos([it]); setCantidadManual((p) => ({ ...p, [it.id]: "1" })); return;
                }
                void marcarVisto(it,1);
              }}>Lo veo · registrar manualmente</Button>}
            </div>
          )
        ) : <p className="text-xs text-green-500">Detectado en esta ronda · sigue en la camioneta</p>}
      </div>
    );
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => { if (!v) setScannerOpen(false); onOpenChange(v); }}>
        <DialogContent className="w-[96vw] max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading uppercase flex items-center gap-2"><Truck className="w-5 h-5" /> Control completo de camioneta</DialogTitle>
            <DialogDescription>Una caja física para todas las sedes. Escaneá cada etiqueta y verificá el pedido antes de confirmarlo. No se registran entregas automáticamente.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-2 text-xs">
            {cargas.map((c) => <Badge key={c.id} variant="outline">{sedes.find((s) => s.id === c.sede_id)?.nombre || "Sede"}</Badge>)}
          </div>
          {loading ? <p className="text-sm text-muted-foreground">Cargando pedidos y controles...</p> : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <Mini label="Esperados" numero={esperado.length} />
                <Mini label="En camioneta" numero={estan.length} />
                <Mini label="Sin escanear" numero={sinEscanear.length} />
                <Mini label="Ya entregados (sistema)" numero={yaEntregados.length} />
              </div>
              {!isRunning ? (
                <Button onClick={iniciar} disabled={busy || !cargas.length}>
                  <ScanLine className="w-4 h-4 mr-2" /> Iniciar control de toda la camioneta
                </Button>
              ) : <div className="flex flex-wrap items-center gap-2">
                <Button onClick={() => setScannerOpen(true)} disabled={busy}>
                  <ScanLine className="w-4 h-4 mr-2" /> Escanear etiquetas
                </Button>
                <Button variant="outline" onClick={cerrar} disabled={busy}>
                  <CheckCheck className="w-4 h-4 mr-2" /> Terminar y revisar faltantes
                </Button>
              </div>}
              <Input placeholder="Buscar cliente, prenda o número de pedido" value={buscando} onChange={(e) => setBuscando(e.target.value)} />
              {candidatos.length > 0 && <div className="rounded-lg border border-amber-500/50 p-3 space-y-3">
                <p className="text-sm font-semibold">La etiqueta corresponde a varios posibles ítems, o tiene más de una unidad.</p>
                <p className="text-xs text-muted-foreground">Elegí solo lo que viste físicamente. No marcamos todos los pedidos con el mismo SKU.</p>
                {candidatos.map((it) => <div key={it.id} className="flex flex-wrap items-center gap-2 border-b border-border pb-2">
                  <div className="flex-1 text-xs">{it.cliente_nombre} · {it.producto} {it.variante}</div>
                  <Input type="number" min={1} max={Math.max(1,Number(it.cantidad))} className="w-16 h-8" value={cantidadManual[it.id] || "1"}
                    onChange={(e) => setCantidadManual((p) => ({...p,[it.id]:e.target.value}))} />
                  <Button size="sm" onClick={() => registrarCandidato(it)}>Registrar visto</Button>
                </div>)}
                <Button variant="ghost" size="sm" onClick={() => setCandidatos([])}>Cerrar coincidencias</Button>
              </div>}
              <div className="space-y-2">
                <h3 className="font-heading font-semibold uppercase text-sm">En camioneta · encontrados ({estan.length})</h3>
                {filtro(estan).length ? filtro(estan).map((it) => tarjeta(it,false))
                  : <p className="text-xs text-muted-foreground">Todavía no hay pedidos escaneados en este control.</p>}
              </div>
              <div className="space-y-2">
                <h3 className="font-heading font-semibold uppercase text-sm">{isRunning ? "Pendientes de escaneo" : "No encontrados · revisar entrega"} ({sinEscanear.length + faltantes.length})</h3>
                <p className="text-xs text-muted-foreground">Mientras controlás, lo no visto es solo pendiente de escaneo. Al finalizar, lo faltante queda para investigar; nunca se marca entregado automáticamente.</p>
                {filtro([...sinEscanear,...faltantes]).map((it) => tarjeta(it,true))}
                {sinEscanear.length === 0 && faltantes.length === 0 && <p className="text-xs text-muted-foreground">No hay pedidos por investigar.</p>}
              </div>
              {yaEntregados.length > 0 && <p className="text-xs text-muted-foreground">{yaEntregados.length} ítems ya figuran entregados en Administración; no se vuelven a considerar pendientes.</p>}
            </div>
          )}
        </DialogContent>
      </Dialog>
      <CameraScanner open={scannerOpen} onClose={() => setScannerOpen(false)}
        onDetected={(code) => { void onScan(code); }} continuous
        hint="Control de toda la camioneta · escaneá cada bolsa o etiqueta" />
      <Dialog open={!!consultaItem} onOpenChange={(v) => !v && setConsultaItem(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Consultar recepción y opinión</DialogTitle>
            <DialogDescription>El mensaje se puede editar. Abrir WhatsApp no lo envía: confirmá solamente después de enviarlo.</DialogDescription>
          </DialogHeader>
          <Textarea rows={7} value={mensaje} onChange={(e) => setMensaje(e.target.value)} />
          {!avisoWaLink(consultaItem ? telefonoDe(consultaItem) : "",mensaje) &&
            <p className="text-xs text-amber-500">Sin teléfono válido: copiá el texto y elegí el contacto manualmente.</p>}
          <div className="flex flex-wrap gap-2">
            <Button onClick={abrirWA} size="sm" disabled={!avisoWaLink(consultaItem ? telefonoDe(consultaItem) : "",mensaje)}>
              <MessageCircle className="w-4 h-4 mr-1" /> Abrir WhatsApp
            </Button>
            <Button variant="outline" size="sm" onClick={copiarConsulta}><Copy className="w-4 h-4 mr-1" /> Copiar</Button>
          </div>
          {abiertoWa && <Button onClick={registrarConsulta}>Ya envié la consulta · registrar</Button>}
          {consultaItem && consultas[consultaItem.id] && <div className="space-y-2 border-t pt-3">
            <p className="font-medium text-sm">Registrar la respuesta del alumno</p>
            <Label>¿Recibió el pedido?</Label>
            <Select value={respuesta} onValueChange={setRespuesta}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
              <SelectItem value="pendiente">Esperando respuesta</SelectItem>
              <SelectItem value="recibido">Sí, lo recibió</SelectItem>
              <SelectItem value="no_recibido">No lo recibió</SelectItem>
              <SelectItem value="sin_confirmar">No pudo confirmarlo</SelectItem>
            </SelectContent></Select>
            {respuesta === "recibido" && <>
              <Label>¿Le gustó?</Label>
              <Select value={gusto} onValueChange={setGusto}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
                <SelectItem value="si">Sí</SelectItem><SelectItem value="no">No</SelectItem>
                <SelectItem value="sin_opinion">No respondió</SelectItem>
              </SelectContent></Select>
            </>}
            <Textarea rows={2} placeholder="Comentario del alumno (opcional)" value={comentario} onChange={(e) => setComentario(e.target.value)} />
            <Button onClick={registrarRespuesta}>Guardar respuesta</Button>
            <p className="text-xs text-muted-foreground">Registrar una respuesta no marca el pedido como entregado. Esa decisión se confirma por separado.</p>
          </div>}
          <DialogFooter><Button variant="ghost" onClick={() => setConsultaItem(null)}>Cerrar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

const Mini = ({label,numero}: {label:string;numero:number}) => (
  <div className="rounded-lg bg-muted/40 p-3">
    <p className="text-xl font-heading font-bold">{numero}</p>
    <p className="text-[11px] text-muted-foreground">{label}</p>
  </div>
);
