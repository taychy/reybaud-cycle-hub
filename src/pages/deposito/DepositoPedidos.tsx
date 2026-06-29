import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Search, Eye, Truck, QrCode, Printer } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { printPreorderLabels, printSinglePreorderLabel, type PreorderLabelData } from "@/lib/preorderLabels";

const STATUSES = [
  "pendiente_pago",
  "pendiente_pago_efectivo",
  "pagado",
  "preparando",
  "enviado",
  "entregado",
  "cancelado",
];

const statusColor = (s: string) => {
  switch (s) {
    case "pagado": return "bg-green-500/20 text-green-400";
    case "preparando": return "bg-cyan/20 text-cyan";
    case "enviado": return "bg-primary/20 text-primary";
    case "entregado": return "bg-green-500/20 text-green-400";
    case "cancelado": return "bg-destructive/20 text-destructive";
    default: return "bg-muted text-muted-foreground";
  }
};

const labelStatus = (s: string) => (s || "").replace(/_/g, " ");

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
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any>(null);
  const [orderItems, setOrderItems] = useState<any[]>([]);
  const [trackingInput, setTrackingInput] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [printing, setPrinting] = useState(false);
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
        .select("id, nombre, apellido, email, telefono, dni")
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

  const updateStatus = async (id: string, status: string) => {
    const { error } = await supabase.from("store_orders").update({ status } as any).eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Estado actualizado" });
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
    if (selected?.id === id) setSelected((s: any) => ({ ...s, status }));
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
    const primero = its[0]?.product_name || "—";
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
    const pagado = r.status === "pagado" || r.status === "preparando" || r.status === "enviado" || r.status === "entregado";
    return {
      id: r.id,
      alumno_id: r.alumno_id || undefined,
      short_number: `#${r.order_number}`,
      producto_nombre: productoNombre,
      cantidad: its.reduce((s, i) => s + Number(i.quantity || 0), 0) || 1,
      variante: first?.variant || {},
      items: its.map((i: any) => ({
        nombre: i.product_name,
        variante: i.variant,
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

  const printOne = async (r: any) => {
    try {
      setPrinting(true);
      await printSinglePreorderLabel(toLabelData(r));
    } catch (e: any) {
      toast({ title: "Error al generar etiqueta", description: e.message, variant: "destructive" });
    } finally {
      setPrinting(false);
    }
  };

  const filtered = useMemo(() => rows.filter((r) => {
    if (restrictStatuses && !restrictStatuses.includes(r.status)) return false;
    if (filterStatus !== "all" && r.status !== filterStatus) return false;
    if (search) {
      const s = search.toLowerCase();
      const nom = nombreCliente(r).toLowerCase();
      const num = String(r.order_number || "");
      const prods = (itemsByOrder[r.id] || []).map((it) => (it.product_name || "").toLowerCase()).join(" ");
      if (!nom.includes(s) && !num.includes(s) && !prods.includes(s)) return false;
    }
    return true;
  }), [rows, itemsByOrder, alumnosMap, search, filterStatus, restrictStatuses]);

  const printBulk = async () => {
    const list = filtered.filter((r) => selectedIds.has(r.id)).map(toLabelData);
    if (!list.length) return;
    try {
      setPrinting(true);
      await printPreorderLabels(list);
    } catch (e: any) {
      toast({ title: "Error al generar etiquetas", description: e.message, variant: "destructive" });
    } finally {
      setPrinting(false);
    }
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
            {STATUSES.map((e) => <SelectItem key={e} value={e}>{labelStatus(e)}</SelectItem>)}
          </SelectContent>
        </Select>
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
                <div className="text-right shrink-0">
                  <div className="font-heading font-bold text-sm">${Number(r.total || 0).toLocaleString("es-AR")}</div>
                  <span className={`inline-block mt-1 text-[10px] font-heading font-bold uppercase px-2 py-0.5 rounded ${statusColor(r.status)}`}>
                    {labelStatus(r.status)}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Select value={r.status} onValueChange={(v) => updateStatus(r.id, v)}>
                  <SelectTrigger className="h-9 flex-1 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((e) => <SelectItem key={e} value={e}>{labelStatus(e)}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" className="h-9" onClick={() => openOrder(r)}>
                  <Eye className="w-4 h-4 mr-1" /> Ver
                </Button>
                <Button variant="outline" size="sm" className="h-9" onClick={() => printOne(r)} disabled={printing}>
                  <QrCode className="w-4 h-4" />
                </Button>
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
                  <td className="px-4 py-2 text-center">
                    <span className={`text-[10px] font-heading font-bold uppercase px-2 py-0.5 rounded ${statusColor(r.status)}`}>
                      {labelStatus(r.status)}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground hidden md:table-cell">{new Date(r.created_at).toLocaleDateString("es-AR")}</td>
                  <td className="px-4 py-2">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openOrder(r)} title="Ver"><Eye className="w-4 h-4" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 bg-cyan/10 hover:bg-cyan/20 text-cyan" onClick={() => printOne(r)} disabled={printing} title="Etiqueta con QR"><QrCode className="w-4 h-4" /></Button>
                      <Select value={r.status} onValueChange={(v) => updateStatus(r.id, v)}>
                        <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {STATUSES.map((e) => <SelectItem key={e} value={e}>{labelStatus(e)}</SelectItem>)}
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
              <div className="grid grid-cols-2 gap-3">
                <div><span className="text-muted-foreground">Cliente:</span> <div className="font-medium">{nombreCliente(selected)}</div></div>
                <div><span className="text-muted-foreground">Email:</span> <div className="font-medium break-all">{selected.customer_email || "—"}</div></div>
                <div><span className="text-muted-foreground">Teléfono:</span> <div className="font-medium">{selected.customer_phone || "—"}</div></div>
                <div><span className="text-muted-foreground">Total:</span> <div className="font-heading font-bold">${Number(selected.total || 0).toLocaleString("es-AR")}</div></div>
                <div><span className="text-muted-foreground">Estado:</span> <div className="font-medium">{labelStatus(selected.status)}</div></div>
                <div><span className="text-muted-foreground">Fecha:</span> <div className="font-medium">{new Date(selected.created_at).toLocaleDateString("es-AR")}</div></div>
              </div>

              <div>
                <h3 className="text-xs font-heading uppercase text-muted-foreground mb-1">Productos</h3>
                <div className="divide-y divide-border rounded-lg border border-border">
                  {orderItems.map((it) => (
                    <div key={it.id} className="px-3 py-2 flex justify-between">
                      <span>{it.product_name} × {it.quantity}</span>
                      <span className="font-heading font-bold">${(it.unit_price * it.quantity).toLocaleString("es-AR")}</span>
                    </div>
                  ))}
                  {orderItems.length === 0 && <div className="p-3 text-muted-foreground text-center text-sm">Sin productos</div>}
                </div>
              </div>

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
    </div>
  );
};

export default DepositoPedidos;
