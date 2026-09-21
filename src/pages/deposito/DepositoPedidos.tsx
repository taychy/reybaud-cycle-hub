import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Search, Eye, Truck, QrCode, Printer, Banknote, Ban, PackageCheck, AlertTriangle, MessageCircle } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { type PreorderLabelData } from "@/lib/preorderLabels";
import OrderLabelPrintDialog from "@/components/deposito/OrderLabelPrintDialog";
import PruebasSection from "@/components/store/PruebasSection";
import {
  CASH_BLOCK_MESSAGE,
  buildCashPaymentPatch,
  canConfirmCashPayment,
  cashConfirmBlockReason,
} from "@/lib/storeCashPayment";
import {
  distributeOrderTotal,
  getPaymentState,
  isLegacyInitialStatus,
  needsPhysicalReturn,
  operationalBadgeClass,
  operationalLabel,
  operationalOptions,
  paymentBadgeClass,
  PAYMENT_LABEL,
  NUEVO_LABEL,
} from "@/lib/storeOrderStatus";
import { formatPrice } from "@/lib/currency";
import { ensureOrderInCamioneta, markOrderItemsEntregados, listCargasActivas, type CargaActiva } from "@/lib/camionetaSync";
import ElegirCajaDialog from "@/components/deposito/ElegirCajaDialog";
import {
  buildAvisoCamionetaMessage,
  avisoWaLink,
  formatAvisoFecha,
} from "@/lib/camionetaAviso";


/** Filtros de la lista: expresan logística, no pago. */
const FILTER_OPTIONS = [
  { value: "nuevos", label: NUEVO_LABEL },
  { value: "preparando", label: "Preparando" },
  { value: "en_camioneta", label: "En camioneta" },
  { value: "enviado", label: "Enviado" },
  { value: "entregado", label: "Entregado" },
  { value: "cancelado", label: "Cancelado" },
];

const CLOSED_STATUSES = ["entregado", "cancelado"];

const variantText = (v: any): string => {
  if (!v) return "";
  if (typeof v === "string") return v;
  try {
    return Object.entries(v)
      .filter(([, val]) => val !== null && val !== "" && val !== undefined)
      .map(([k, val]) => `${k}: ${val}`)
      .join(" · ");
  } catch {
    return "";
  }
};

interface Props {
  restrictStatuses?: string[];
  title?: string;
}

const DepositoPedidos = ({ restrictStatuses, title = "Pedidos" }: Props = {}) => {
  const [rows, setRows] = useState<any[]>([]);
  const [itemsByOrder, setItemsByOrder] = useState<Record<string, any[]>>({});
  const [alumnosMap, setAlumnosMap] = useState<Record<string, any>>({});
  const [sedesMap, setSedesMap] = useState<Record<string, any>>({});
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [showFinalizados, setShowFinalizados] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any>(null);
  const [orderItems, setOrderItems] = useState<any[]>([]);
  const [trackingInput, setTrackingInput] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [printing, setPrinting] = useState(false);
  const [cobrando, setCobrando] = useState<string | null>(null);
  const [labelTargets, setLabelTargets] = useState<PreorderLabelData[]>([]);
  const [cancelTarget, setCancelTarget] = useState<any>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelBusy, setCancelBusy] = useState(false);
  const [returnBusy, setReturnBusy] = useState<string | null>(null);
  const [cajaPicker, setCajaPicker] = useState<{ orderId: string; cargas: CargaActiva[] } | null>(null);
  const [avisoConfirm, setAvisoConfirm] = useState<{ orders: any[]; yaAvisados: number } | null>(null);
  const { toast } = useToast();

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("store_orders")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      toast({ title: "Error cargando pedidos", description: error.message, variant: "destructive" });
      setLoading(false);
      return;
    }
    const list = data || [];
    setRows(list);
    const ids = list.map((r: any) => r.id);
    if (ids.length) {
      const { data: its } = await supabase
        .from("store_order_items")
        .select("*")
        .in("order_id", ids);
      const map: Record<string, any[]> = {};
      (its || []).forEach((it: any) => {
        if (!map[it.order_id]) map[it.order_id] = [];
        map[it.order_id].push(it);
      });
      setItemsByOrder(map);
    }
    const alIds = Array.from(new Set(list.map((r: any) => r.alumno_id).filter(Boolean)));
    if (alIds.length) {
      const { data: als } = await supabase
        .from("alumnos")
        .select("id, nombre, apellido, email, telefono, documento")
        .in("id", alIds);
      const m: Record<string, any> = {};
      (als || []).forEach((a: any) => { m[a.id] = a; });
      setAlumnosMap(m);
    }
    const sedeIds = Array.from(new Set(list.map((r: any) => r.sede_retiro_id).filter(Boolean)));
    if (sedeIds.length) {
      const { data: sds } = await supabase.from("sedes").select("id, nombre").in("id", sedeIds);
      const sm: Record<string, any> = {};
      (sds || []).forEach((s: any) => { sm[s.id] = s; });
      setSedesMap(sm);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openOrder = async (order: any) => {
    setSelected(order);
    setTrackingInput(order.shipping_tracking || "");
    const { data } = await supabase.from("store_order_items").select("*").eq("order_id", order.id);
    setOrderItems(data || []);
  };

  const updateStatus = async (id: string, status: string, cargaId?: string) => {
    // Marcar "en camioneta" = ya se cargó físicamente: registramos en qué caja.
    if (status === "en_camioneta") {
      const res = await ensureOrderInCamioneta(id, cargaId);
      if (!res.ok) {
        if (res.reason === "NEEDS_BOX") {
          const activas = await listCargasActivas();
          setCajaPicker({ orderId: id, cargas: activas });
          return;
        }
        toast({ title: "No se puede marcar en camioneta", description: res.reason, variant: "destructive" });
        return;
      }
    }
    const { error } = await supabase.from("store_orders").update({ status } as any).eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    if (status === "entregado") await markOrderItemsEntregados(id);
    toast({ title: "Estado actualizado" });
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
    if (selected?.id === id) setSelected((s: any) => ({ ...s, status }));
  };

  // ─── Aviso por WhatsApp: "tu pedido ya está en la camioneta" ───
  const telefonoDe = (r: any): string =>
    (r.alumno_id ? alumnosMap[r.alumno_id]?.telefono : null) || r.customer_phone || "";

  const primerNombre = (r: any): string => {
    const a = r.alumno_id ? alumnosMap[r.alumno_id] : null;
    if (a?.nombre) return String(a.nombre).split(" ")[0];
    return String(nombreCliente(r) || "").split(" ")[0] || "";
  };

  const registrarAviso = async (ids: string[]) => {
    if (!ids.length) return;
    const { data: auth } = await supabase.auth.getUser();
    const patch = {
      aviso_camioneta_enviado_at: new Date().toISOString(),
      aviso_camioneta_enviado_por: auth?.user?.id || null,
      aviso_camioneta_enviado_por_email: auth?.user?.email || null,
    };
    await supabase.from("store_orders").update(patch as any).in("id", ids);
    setRows((prev) => prev.map((r) => (ids.includes(r.id) ? { ...r, ...patch } : r)));
    if (selected && ids.includes(selected.id)) setSelected((s: any) => ({ ...s, ...patch }));
  };

  /** Abre el WhatsApp de cada pedido y registra el aviso. No cambia el estado del pedido. */
  const ejecutarAvisos = async (orders: any[]) => {
    const enviados: string[] = [];
    let omitidos = 0;
    for (const r of orders) {
      if (r.status !== "en_camioneta") { omitidos++; continue; }
      const link = avisoWaLink(telefonoDe(r), buildAvisoCamionetaMessage(primerNombre(r), r));
      if (!link) { omitidos++; continue; }
      window.open(link, "_blank");
      enviados.push(r.id);
    }
    if (enviados.length) await registrarAviso(enviados);
    toast({
      title: `Avisos abiertos: ${enviados.length}`,
      description: omitidos ? `${omitidos} omitido(s) por falta de teléfono o cambio de estado.` : undefined,
      variant: enviados.length ? "default" : "destructive",
    });
  };

  const avisarCamioneta = (orders: any[]) => {
    const validos = orders.filter((r) => r.status === "en_camioneta");
    if (!validos.length) {
      toast({ title: "Sin pedidos en camioneta", variant: "destructive" });
      return;
    }
    const yaAvisados = validos.filter((r) => r.aviso_camioneta_enviado_at).length;
    if (yaAvisados > 0) {
      setAvisoConfirm({ orders: validos, yaAvisados });
      return;
    }
    ejecutarAvisos(validos);
  };



  const confirmarEfectivo = async (order: any) => {
    const motivo = cashConfirmBlockReason(order);
    if (motivo) {
      toast({ title: "No se puede cobrar", description: CASH_BLOCK_MESSAGE[motivo], variant: "destructive" });
      return;
    }
    const patch = buildCashPaymentPatch(order, { actor: "Depósito" });
    if (!patch) return;
    setCobrando(order.id);
    // Condición de carrera: sólo cobra si sigue siendo efectivo sin cobrar y no está anulado.
    const { data, error } = await supabase
      .from("store_orders")
      .update(patch as any)
      .eq("id", order.id)
      .eq("metodo_pago", "efectivo")
      .is("pagado_at", null)
      .neq("status", "cancelado")
      .select("id");
    setCobrando(null);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    if (!data || data.length === 0) {
      toast({ title: "Sin cambios", description: "El cobro ya había sido registrado.", variant: "destructive" });
      await load();
      return;
    }
    toast({ title: "Pago en efectivo registrado" });
    setRows((prev) => prev.map((r) => (r.id === order.id ? { ...r, ...patch } : r)));
    if (selected?.id === order.id) setSelected((s: any) => ({ ...s, ...patch }));
  };

  const cancelarPedido = async () => {
    if (!cancelTarget) return;
    if (!cancelReason.trim()) {
      toast({ title: "Falta el motivo", description: "Escribí por qué se cancela la compra.", variant: "destructive" });
      return;
    }
    setCancelBusy(true);
    const { data, error } = await (supabase.rpc as any)("cancel_store_order", {
      _order_id: cancelTarget.id,
      _reason: cancelReason.trim(),
    });
    setCancelBusy(false);
    if (error) {
      toast({ title: "No se pudo cancelar", description: error.message, variant: "destructive" });
      return;
    }
    const res: any = Array.isArray(data) ? data[0] : data;
    const retornoPendiente = !!res?.retorno_pendiente;
    toast({
      title: "Compra cancelada",
      description: retornoPendiente
        ? "La mercadería sigue fuera del depósito: el stock NO se repone hasta confirmar el retorno físico."
        : "Stock repuesto y movimiento registrado.",
    });
    if (cancelTarget.pagado_at) {
      toast({
        title: "Queda saldo a favor del cliente",
        description: "Cancelar no devuelve el dinero: el reintegro se gestiona desde Administración.",
      });
    }
    setCancelTarget(null);
    setCancelReason("");
    setSelected(null);
    await load();
  };

  const confirmarRetorno = async (order: any) => {
    setReturnBusy(order.id);
    const { error } = await (supabase.rpc as any)("confirm_cancelled_store_order_return", {
      _order_id: order.id,
    });
    setReturnBusy(null);
    if (error) {
      toast({ title: "No se pudo confirmar el retorno", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Retorno confirmado", description: "La mercadería volvió al depósito y el stock quedó repuesto." });
    setSelected(null);
    await load();
  };

  const saveTracking = async () => {
    if (!selected) return;
    const { error } = await supabase
      .from("store_orders")
      .update({ shipping_tracking: trackingInput } as any)
      .eq("id", selected.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Tracking guardado" });
    load();
  };

  const resumenProductos = (orderId: string) => {
    const its = itemsByOrder[orderId] || [];
    if (!its.length) return { texto: "—", cantidad: 0 };
    const cantidad = its.reduce((acc, it) => acc + (Number(it.quantity) || 0), 0);
    const v0 = variantText(its[0]?.variant_selection);
    const primero = `${its[0]?.product_name || "—"}${v0 ? ` (${v0})` : ""}`;
    const texto = its.length > 1 ? `${primero} +${its.length - 1} más` : primero;
    return { texto, cantidad };
  };

  const nombreCliente = (r: any) => {
    if (r.customer_name) return r.customer_name;
    const a = r.alumno_id ? alumnosMap[r.alumno_id] : null;
    if (a) return `${a.nombre || ""} ${a.apellido || ""}`.trim() || a.email || "—";
    return "—";
  };

  const toLabelData = (r: any): PreorderLabelData => {
    const al = r.alumno_id ? alumnosMap[r.alumno_id] : null;
    const sede = r.sede_retiro_id ? sedesMap[r.sede_retiro_id] : null;
    const its = itemsByOrder[r.id] || [];
    const first = its[0];
    const productoNombre = its.length > 1
      ? `${its.length} productos`
      : (first?.product_name || "Pedido");
    const total = Number(r.total || 0);
    // El pago sale de pagado_at, nunca del estado operativo.
    const pagado = !!r.pagado_at;
    return {
      id: r.id,
      alumno_id: r.alumno_id || undefined,
      short_number: `${r.order_number}`,
      producto_nombre: productoNombre,
      cantidad: its.reduce((s, i) => s + Number(i.quantity || 0), 0) || 1,
      variante: first?.variant_selection || {},
      items: its.map((i: any) => ({
        nombre: i.product_name,
        producto_nombre: i.product_name,
        variante: i.variant_selection,
        cantidad: Number(i.quantity || 1) || 1,
        precio: i.unit_price,
      })),
      precio_total: total,
      sena_monto: pagado ? total : 0,
      saldo_pendiente: pagado ? 0 : total,
      moneda: r.currency || "ARS",
      estado_pago_sena: pagado ? "confirmada" : "pendiente",
      entrega_metodo: r.entrega_metodo,
      sede_nombre: sede?.nombre || null,
      envio_direccion: r.envio_direccion,
      envio_contacto: r.envio_contacto,
      envio_notas: r.envio_notas,
      alumno_nombre: nombreCliente(r),
      alumno_email: r.customer_email || al?.email,
      alumno_telefono: r.customer_phone || al?.telefono,
      created_at: r.created_at,
    };
  };

  const printOne = (r: any) => setLabelTargets([toLabelData(r)]);

  const filtered = useMemo(() => rows.filter((r) => {
    if (restrictStatuses && !restrictStatuses.includes(r.status)) return false;
    if (filterStatus === "nuevos" && !isLegacyInitialStatus(r.status)) return false;
    if (filterStatus !== "all" && filterStatus !== "nuevos" && r.status !== filterStatus) return false;
    if (filterStatus === "all" && !restrictStatuses && !showFinalizados && CLOSED_STATUSES.includes(r.status)) return false;
    if (search) {
      const s = search.toLowerCase();
      const nom = nombreCliente(r).toLowerCase();
      const num = String(r.order_number || "");
      const prods = (itemsByOrder[r.id] || []).map((it) => (it.product_name || "").toLowerCase()).join(" ");
      if (!nom.includes(s) && !num.includes(s) && !prods.includes(s)) return false;
    }
    return true;
  }), [rows, itemsByOrder, alumnosMap, search, filterStatus, restrictStatuses, showFinalizados]);

  const printBulk = () => {
    const list = filtered.filter((r) => selectedIds.has(r.id)).map(toLabelData);
    if (list.length) setLabelTargets(list);
  };

  const toggleId = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const allFilteredSelected = filtered.length > 0 && filtered.every((r) => selectedIds.has(r.id));
  const toggleAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) filtered.forEach((r) => next.delete(r.id));
      else filtered.forEach((r) => next.add(r.id));
      return next;
    });
  };

  const selectedCount = useMemo(
    () => filtered.filter((r) => selectedIds.has(r.id)).length,
    [filtered, selectedIds],
  );

  const PagoBadge = ({ o }: { o: any }) => {
    const st = getPaymentState(o);
    return (
      <span className={`inline-block text-[10px] font-heading font-bold uppercase px-2 py-0.5 rounded ${paymentBadgeClass(st)}`}>
        {PAYMENT_LABEL[st]}
      </span>
    );
  };

  const EstadoBadge = ({ o }: { o: any }) => (
    <span className={`inline-block text-[10px] font-heading font-bold uppercase px-2 py-0.5 rounded ${operationalBadgeClass(o.status)}`}>
      {operationalLabel(o.status)}
    </span>
  );

  const puedeCancelar = (r: any) => r.status !== "cancelado" && r.status !== "entregado";

  // Importes visuales en la moneda del pedido (los precios base pueden ser legacy en otra moneda).
  const lineAmounts = useMemo(
    () => distributeOrderTotal(orderItems, Number(selected?.total || 0)),
    [orderItems, selected?.total],
  );

  if (loading) return <div className="animate-pulse text-muted-foreground">Cargando pedidos...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-heading font-bold">{title}</h1>
        {selectedCount > 0 && (
          <Button onClick={printBulk} disabled={printing} className="gap-2">
            <Printer className="w-4 h-4" /> Imprimir etiquetas ({selectedCount})
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar por cliente, producto o #..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[200px]"><SelectValue placeholder="Estado" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {FILTER_OPTIONS.map((e) => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}
          </SelectContent>
        </Select>
        {!restrictStatuses && filterStatus === "all" && (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Checkbox checked={showFinalizados} onCheckedChange={(v) => setShowFinalizados(!!v)} />
            Ver entregados y cancelados
          </label>
        )}
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {filtered.length > 0 && (
          <label className="flex items-center gap-2 text-xs text-muted-foreground px-1">
            <Checkbox checked={allFilteredSelected} onCheckedChange={toggleAll} />
            Seleccionar todos ({filtered.length})
          </label>
        )}
        {filtered.map((r) => {
          const res = resumenProductos(r.id);
          return (
            <div key={r.id} className="rounded-xl border border-border bg-card p-3 space-y-2">
              <div className="flex items-start gap-2">
                <Checkbox className="mt-1" checked={selectedIds.has(r.id)} onCheckedChange={() => toggleId(r.id)} />
                <div className="flex-1 min-w-0">
                  <div className="font-heading font-bold text-sm leading-tight">{res.texto}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{nombreCliente(r)} · #{r.order_number}{res.cantidad ? ` · x${res.cantidad}` : ""}</div>
                  <div className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString("es-AR")}</div>
                </div>
                <div className="text-right shrink-0 space-y-1">
                  <div className="font-heading font-bold text-sm">${Number(r.total || 0).toLocaleString("es-AR")}</div>
                  <div><PagoBadge o={r} /></div>
                  <div><EstadoBadge o={r} /></div>
                </div>
              </div>
              {needsPhysicalReturn(r) && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-2 space-y-2">
                  <p className="text-[11px] text-destructive flex items-start gap-1">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    Compra cancelada con mercadería fuera del depósito. El stock no vuelve hasta confirmar el retorno físico.
                  </p>
                  <Button size="sm" variant="outline" className="w-full h-9" disabled={returnBusy === r.id} onClick={() => confirmarRetorno(r)}>
                    <PackageCheck className="w-4 h-4 mr-1" /> Confirmar retorno al depósito
                  </Button>
                </div>
              )}
              {canConfirmCashPayment(r) && (
                <Button size="sm" className="w-full h-9" disabled={cobrando === r.id} onClick={() => confirmarEfectivo(r)}>
                  <Banknote className="w-4 h-4 mr-1" /> Cobré el efectivo
                </Button>
              )}
              <div className="flex items-center gap-2">
                <Select value={r.status} onValueChange={(v) => updateStatus(r.id, v)}>
                  <SelectTrigger className="h-9 flex-1 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {operationalOptions(r.status).map((e) => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" className="h-9" onClick={() => openOrder(r)}>
                  <Eye className="w-4 h-4 mr-1" /> Ver
                </Button>
                <Button variant="outline" size="sm" className="h-9" onClick={() => printOne(r)} disabled={printing}>
                  <QrCode className="w-4 h-4" />
                </Button>
                {puedeCancelar(r) && (
                  <Button variant="outline" size="sm" className="h-9 text-destructive" onClick={() => { setCancelTarget(r); setCancelReason(""); }}>
                    <Ban className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground text-sm">No hay pedidos</div>
        )}
      </div>

      <div className="hidden md:block rounded-xl border border-border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="px-3 py-3 w-8">
                <Checkbox checked={allFilteredSelected} onCheckedChange={toggleAll} />
              </th>
              <th className="px-4 py-3 text-left font-heading text-xs uppercase">Productos</th>
              <th className="px-4 py-3 text-left font-heading text-xs uppercase">Cliente</th>
              <th className="px-4 py-3 text-center font-heading text-xs uppercase">Cant.</th>
              <th className="px-4 py-3 text-right font-heading text-xs uppercase">Total</th>
              <th className="px-4 py-3 text-center font-heading text-xs uppercase">Pago</th>
              <th className="px-4 py-3 text-center font-heading text-xs uppercase">Estado</th>
              <th className="px-4 py-3 text-left font-heading text-xs uppercase hidden md:table-cell">Fecha</th>
              <th className="px-4 py-3 text-right font-heading text-xs uppercase">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((r) => {
              const res = resumenProductos(r.id);
              return (
                <tr key={r.id} className="hover:bg-muted/30">
                  <td className="px-3 py-2">
                    <Checkbox checked={selectedIds.has(r.id)} onCheckedChange={() => toggleId(r.id)} />
                  </td>
                  <td className="px-4 py-2">
                    <div className="font-medium leading-tight">{res.texto}</div>
                    <div className="text-xs text-muted-foreground">#{r.order_number}</div>
                  </td>
                  <td className="px-4 py-2 text-foreground">{nombreCliente(r)}</td>
                  <td className="px-4 py-2 text-center">{res.cantidad || "—"}</td>
                  <td className="px-4 py-2 text-right font-heading font-bold">${Number(r.total || 0).toLocaleString("es-AR")}</td>
                  <td className="px-4 py-2 text-center"><PagoBadge o={r} /></td>
                  <td className="px-4 py-2 text-center">
                    <EstadoBadge o={r} />
                    {needsPhysicalReturn(r) && (
                      <div className="text-[10px] text-destructive mt-1">Retorno pendiente</div>
                    )}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground hidden md:table-cell">{new Date(r.created_at).toLocaleDateString("es-AR")}</td>
                  <td className="px-4 py-2">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openOrder(r)} title="Ver"><Eye className="w-4 h-4" /></Button>
                      {canConfirmCashPayment(r) && (
                        <Button variant="ghost" size="icon" className="h-8 w-8 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400" disabled={cobrando === r.id} onClick={() => confirmarEfectivo(r)} title="Cobré el efectivo"><Banknote className="w-4 h-4" /></Button>
                      )}
                      {needsPhysicalReturn(r) && (
                        <Button variant="ghost" size="icon" className="h-8 w-8 bg-destructive/10 hover:bg-destructive/20 text-destructive" disabled={returnBusy === r.id} onClick={() => confirmarRetorno(r)} title="Confirmar retorno al depósito"><PackageCheck className="w-4 h-4" /></Button>
                      )}
                      {puedeCancelar(r) && (
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => { setCancelTarget(r); setCancelReason(""); }} title="Cancelar compra"><Ban className="w-4 h-4" /></Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-8 w-8 bg-cyan/10 hover:bg-cyan/20 text-cyan" onClick={() => printOne(r)} disabled={printing} title="Etiqueta con QR"><QrCode className="w-4 h-4" /></Button>
                      <Select value={r.status} onValueChange={(v) => updateStatus(r.id, v)}>
                        <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {operationalOptions(r.status).map((e) => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && <div className="p-8 text-center text-muted-foreground">No hay pedidos</div>}
      </div>

      <Sheet open={!!selected} onOpenChange={(v) => !v && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Pedido #{selected?.order_number}</SheetTitle>
          </SheetHeader>
          {selected && (
            <div className="space-y-4 mt-4 text-sm">
              <Button onClick={() => printOne(selected)} disabled={printing} className="w-full gap-2">
                <QrCode className="w-4 h-4" /> Imprimir etiqueta
              </Button>

              {needsPhysicalReturn(selected) && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 space-y-2">
                  <p className="text-xs text-destructive">
                    Compra cancelada, pero el stock NO se repone hasta que la mercadería vuelva físicamente al depósito.
                  </p>
                  <Button variant="outline" className="w-full gap-2" disabled={returnBusy === selected.id} onClick={() => confirmarRetorno(selected)}>
                    <PackageCheck className="w-4 h-4" /> Confirmar retorno al depósito
                  </Button>
                </div>
              )}

              {selected.status === "cancelado" && selected.pagado_at && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
                  Pago registrado · el reembolso se gestiona aparte: cancelar no devuelve el dinero automáticamente.
                </div>
              )}

              {canConfirmCashPayment(selected) && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 space-y-2">
                  <p className="text-xs text-amber-200">Este pedido se paga en efectivo y todavía no está cobrado.</p>
                  <Button className="w-full gap-2" disabled={cobrando === selected.id} onClick={() => confirmarEfectivo(selected)}>
                    <Banknote className="w-4 h-4" /> Cobré el efectivo
                  </Button>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div><span className="text-muted-foreground">Cliente:</span> <div className="font-medium">{nombreCliente(selected)}</div></div>
                <div><span className="text-muted-foreground">Email:</span> <div className="font-medium break-all">{selected.customer_email || "—"}</div></div>
                <div><span className="text-muted-foreground">Teléfono:</span> <div className="font-medium">{selected.customer_phone || "—"}</div></div>
                <div><span className="text-muted-foreground">Total:</span> <div className="font-heading font-bold">{formatPrice(Number(selected.total || 0), selected.currency || "ARS")}</div></div>
                <div><span className="text-muted-foreground">Pago:</span> <div className="mt-0.5"><PagoBadge o={selected} /></div></div>
                <div><span className="text-muted-foreground">Estado:</span> <div className="mt-0.5"><EstadoBadge o={selected} /></div></div>
                <div><span className="text-muted-foreground">Fecha:</span> <div className="font-medium">{new Date(selected.created_at).toLocaleDateString("es-AR")}</div></div>
              </div>

              <div>
                <h3 className="text-xs font-heading uppercase text-muted-foreground mb-1">Productos</h3>
                <div className="divide-y divide-border rounded-lg border border-border">
                  {orderItems.map((it, idx) => (
                    <div key={it.id} className="px-3 py-2 flex justify-between">
                      <span>
                        {it.product_name} × {it.quantity}
                        {variantText(it.variant_selection) && (
                          <span className="block text-xs text-muted-foreground">{variantText(it.variant_selection)}</span>
                        )}
                      </span>
                      <span className="font-heading font-bold">
                        {formatPrice(lineAmounts[idx] ?? 0, selected.currency || "ARS")}
                      </span>
                    </div>
                  ))}
                  {orderItems.length === 0 && <div className="p-3 text-muted-foreground text-center text-sm">Sin productos</div>}
                </div>
              </div>

              <PruebasSection
                orderId={selected.id}
                alumnoId={selected.alumno_id}
                currency={selected.currency || "ARS"}
              />

              {puedeCancelar(selected) && (
                <Button
                  variant="outline"
                  className="w-full gap-2 text-destructive"
                  onClick={() => { setCancelTarget(selected); setCancelReason(""); }}
                >
                  <Ban className="w-4 h-4" /> Cancelar compra
                </Button>
              )}

              <div>
                <h3 className="text-xs font-heading uppercase text-muted-foreground mb-1">Tracking de envío</h3>
                <div className="flex gap-2">
                  <Input value={trackingInput} onChange={(e) => setTrackingInput(e.target.value)} placeholder="Código de seguimiento" />
                  <Button size="sm" onClick={saveTracking}><Truck className="w-4 h-4 mr-1" /> Guardar</Button>
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <ElegirCajaDialog
        open={!!cajaPicker}
        cargas={cajaPicker?.cargas || []}
        onClose={() => setCajaPicker(null)}
        onSelect={(cargaId) => {
          const orderId = cajaPicker?.orderId;
          setCajaPicker(null);
          if (orderId) updateStatus(orderId, "en_camioneta", cargaId);
        }}
      />

      <Dialog open={!!cancelTarget} onOpenChange={(v) => { if (!v) { setCancelTarget(null); setCancelReason(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">Cancelar compra #{cancelTarget?.order_number}</DialogTitle>
            <DialogDescription>
              El motivo queda registrado. Si la mercadería ya salió del depósito, el stock se repone recién cuando vuelve.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {cancelTarget?.pagado_at && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
                Este pedido figura pagado. Cancelar no devuelve el dinero: el reembolso se gestiona aparte.
              </div>
            )}
            <div>
              <label className="text-xs font-heading uppercase text-muted-foreground">Motivo (obligatorio)</label>
              <Input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Ej: el cliente se arrepintió" />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setCancelTarget(null); setCancelReason(""); }}>Volver</Button>
              <Button variant="destructive" disabled={cancelBusy || !cancelReason.trim()} onClick={cancelarPedido}>
                {cancelBusy ? "Cancelando..." : "Cancelar compra"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <OrderLabelPrintDialog
        open={labelTargets.length > 0}
        onOpenChange={(o) => !o && setLabelTargets([])}
        labels={labelTargets}
        title={labelTargets.length === 1 ? "Etiqueta del pedido" : `Etiquetas (${labelTargets.length})`}
      />
    </div>
  );
};

export default DepositoPedidos;
