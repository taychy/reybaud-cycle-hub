import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Search, Eye, Truck } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

const STATUSES = [
  "pendiente",
  "pagado",
  "preparando",
  "enviado",
  "entregado",
];

const statusColor = (s: string) => {
  switch (s) {
    case "pagado": return "bg-green-500/20 text-green-400";
    case "preparando": return "bg-cyan/20 text-cyan";
    case "enviado": return "bg-primary/20 text-primary";
    case "entregado": return "bg-muted text-muted-foreground";
    case "pendiente": return "bg-yellow-500/20 text-yellow-400";
    default: return "bg-muted text-muted-foreground";
  }
};

const labelStatus = (s: string) => s.replace(/_/g, " ");

const DepositoPedidos = () => {
  const [rows, setRows] = useState<any[]>([]);
  const [itemsByOrder, setItemsByOrder] = useState<Record<string, any[]>>({});
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any>(null);
  const [orderItems, setOrderItems] = useState<any[]>([]);
  const [trackingInput, setTrackingInput] = useState("");
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
        .select("order_id, product_name, quantity, unit_price")
        .in("order_id", ids);
      const map: Record<string, any[]> = {};
      (its || []).forEach((it: any) => {
        if (!map[it.order_id]) map[it.order_id] = [];
        map[it.order_id].push(it);
      });
      setItemsByOrder(map);
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

  const filtered = useMemo(() => rows.filter((r) => {
    if (filterStatus !== "all" && r.status !== filterStatus) return false;
    if (search) {
      const s = search.toLowerCase();
      const nom = (r.customer_name || "").toLowerCase();
      const num = String(r.order_number || "");
      const prods = (itemsByOrder[r.id] || []).map((it) => (it.product_name || "").toLowerCase()).join(" ");
      if (!nom.includes(s) && !num.includes(s) && !prods.includes(s)) return false;
    }
    return true;
  }), [rows, itemsByOrder, search, filterStatus]);

  if (loading) return <div className="animate-pulse text-muted-foreground">Cargando pedidos...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-heading font-bold">Pedidos</h1>
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
        {filtered.map((r) => {
          const res = resumenProductos(r.id);
          return (
            <div key={r.id} className="rounded-xl border border-border bg-card p-3 space-y-2">
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="font-heading font-bold text-sm leading-tight">{res.texto}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{r.customer_name || "—"} · #{r.order_number}{res.cantidad ? ` · x${res.cantidad}` : ""}</div>
                  <div className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString("es-AR")}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-heading font-bold text-sm">${r.total?.toLocaleString("es-AR")}</div>
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
                  <td className="px-4 py-2">
                    <div className="font-medium leading-tight">{res.texto}</div>
                    <div className="text-xs text-muted-foreground">#{r.order_number}</div>
                  </td>
                  <td className="px-4 py-2 text-foreground">{r.customer_name || "—"}</td>
                  <td className="px-4 py-2 text-center">{res.cantidad || "—"}</td>
                  <td className="px-4 py-2 text-right font-heading font-bold">${r.total?.toLocaleString("es-AR")}</td>
                  <td className="px-4 py-2 text-center">
                    <span className={`text-[10px] font-heading font-bold uppercase px-2 py-0.5 rounded ${statusColor(r.status)}`}>
                      {labelStatus(r.status)}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground hidden md:table-cell">{new Date(r.created_at).toLocaleDateString("es-AR")}</td>
                  <td className="px-4 py-2">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openOrder(r)} title="Ver"><Eye className="w-4 h-4" /></Button>
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
              <div className="grid grid-cols-2 gap-3">
                <div><span className="text-muted-foreground">Cliente:</span> <div className="font-medium">{selected.customer_name || "—"}</div></div>
                <div><span className="text-muted-foreground">Email:</span> <div className="font-medium break-all">{selected.customer_email || "—"}</div></div>
                <div><span className="text-muted-foreground">Teléfono:</span> <div className="font-medium">{selected.customer_phone || "—"}</div></div>
                <div><span className="text-muted-foreground">Total:</span> <div className="font-heading font-bold">${selected.total?.toLocaleString("es-AR")}</div></div>
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
