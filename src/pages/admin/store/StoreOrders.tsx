import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Search, Eye, Truck, DollarSign } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmFullPaymentDialog } from "@/components/store/ConfirmFullPaymentDialog";
import { getPaymentMethodLabel } from "@/lib/paymentMethods";

const STATUSES = [
  { value: "pendiente", label: "Pendiente", color: "bg-yellow-500/20 text-yellow-400" },
  { value: "pagado", label: "Pagado", color: "bg-green-500/20 text-green-400" },
  { value: "preparando", label: "Preparando", color: "bg-accent/20 text-accent" },
  { value: "enviado", label: "Enviado", color: "bg-primary/20 text-primary" },
  { value: "entregado", label: "Entregado", color: "bg-muted text-muted-foreground" },
];

const StoreOrders = () => {
  const [orders, setOrders] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [orderItems, setOrderItems] = useState<any[]>([]);
  const [trackingInput, setTrackingInput] = useState("");
  const [payOrder, setPayOrder] = useState<any | null>(null);
  const { toast } = useToast();

  const load = async () => {
    const { data } = await supabase.from("store_orders").select("*").order("created_at", { ascending: false });
    setOrders(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const viewOrder = async (order: any) => {
    setSelectedOrder(order);
    setTrackingInput(order.shipping_tracking || "");
    const { data } = await supabase.from("store_order_items").select("*").eq("order_id", order.id);
    setOrderItems(data || []);
  };

  const updateStatus = async (orderId: string, status: string) => {
    await supabase.from("store_orders").update({ status } as any).eq("id", orderId);
    toast({ title: "Estado actualizado" });
    if (selectedOrder?.id === orderId) setSelectedOrder((o: any) => ({ ...o, status }));
    load();
  };

  const saveTracking = async () => {
    if (!selectedOrder) return;
    await supabase.from("store_orders").update({ shipping_tracking: trackingInput } as any).eq("id", selectedOrder.id);
    toast({ title: "Tracking guardado" });
    load();
  };

  const registrarPagoOrden = async (order: any, value: { metodo_pago: string; referencia?: string | null }) => {
    const noteParts = [
      order.notes,
      `[${new Date().toLocaleString("es-AR")}] Pago registrado por admin · ${getPaymentMethodLabel(value.metodo_pago)}${value.referencia ? ` · Ref: ${value.referencia}` : ""}`,
    ].filter(Boolean);
    const { error } = await supabase.from("store_orders").update({
      status: "pagado",
      pagado_at: new Date().toISOString(),
      metodo_pago: value.metodo_pago,
      mp_external_reference: value.referencia || order.mp_external_reference,
      notes: noteParts.join("\n"),
    } as any).eq("id", order.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "✓ Pago registrado", description: getPaymentMethodLabel(value.metodo_pago) });
    if (selectedOrder?.id === order.id) {
      setSelectedOrder((o: any) => ({ ...o, status: "pagado", metodo_pago: value.metodo_pago }));
    }
    load();
  };


  const filtered = orders.filter((o) => {
    if (search && !o.customer_name.toLowerCase().includes(search.toLowerCase()) && !String(o.order_number).includes(search)) return false;
    if (filterStatus !== "all" && o.status !== filterStatus) return false;
    return true;
  });

  const getStatusStyle = (s: string) => STATUSES.find((st) => st.value === s) || { label: s, color: "bg-muted text-muted-foreground" };

  if (loading) return <div className="animate-pulse text-muted-foreground">Cargando pedidos...</div>;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-heading font-bold">Pedidos</h1>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar por cliente o #..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Estado" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="px-4 py-3 text-left font-heading text-xs uppercase">#</th>
              <th className="px-4 py-3 text-left font-heading text-xs uppercase">Cliente</th>
              <th className="px-4 py-3 text-right font-heading text-xs uppercase">Total</th>
              <th className="px-4 py-3 text-center font-heading text-xs uppercase">Estado</th>
              <th className="px-4 py-3 text-left font-heading text-xs uppercase hidden md:table-cell">Fecha</th>
              <th className="px-4 py-3 text-right font-heading text-xs uppercase">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((o) => {
              const st = getStatusStyle(o.status);
              return (
                <tr key={o.id} className="hover:bg-muted/30">
                  <td className="px-4 py-2 font-heading font-bold">{o.order_number}</td>
                  <td className="px-4 py-2 text-foreground">{o.customer_name}</td>
                  <td className="px-4 py-2 text-right font-heading font-bold">${o.total?.toLocaleString("es-AR")}</td>
                  <td className="px-4 py-2 text-center">
                    <span className={`text-[10px] font-heading font-bold uppercase px-2 py-0.5 rounded ${st.color}`}>{st.label}</span>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground hidden md:table-cell">{new Date(o.created_at).toLocaleDateString("es-AR")}</td>
                  <td className="px-4 py-2">
                    <div className="flex items-center justify-end gap-1">
                      {o.status !== "pagado" && o.status !== "entregado" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
                          title="Registrar pago"
                          onClick={() => setPayOrder(o)}
                        >
                          <DollarSign className="w-4 h-4" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => viewOrder(o)}><Eye className="w-4 h-4" /></Button>
                      <Select value={o.status} onValueChange={(v) => updateStatus(o.id, v)}>
                        <SelectTrigger className="h-8 w-[120px] text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
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

      {/* Order detail dialog */}
      <Dialog open={!!selectedOrder} onOpenChange={(v) => !v && setSelectedOrder(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Pedido #{selectedOrder?.order_number}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-muted-foreground">Cliente:</span> <span className="font-medium">{selectedOrder?.customer_name}</span></div>
              <div><span className="text-muted-foreground">Email:</span> <span className="font-medium">{selectedOrder?.customer_email || "—"}</span></div>
              <div><span className="text-muted-foreground">Total:</span> <span className="font-heading font-bold">${selectedOrder?.total?.toLocaleString("es-AR")}</span></div>
              <div><span className="text-muted-foreground">Estado:</span> <span className="font-medium">{getStatusStyle(selectedOrder?.status).label}</span></div>
            </div>

            <div className="space-y-2">
              <h3 className="text-xs font-heading uppercase text-muted-foreground">Productos</h3>
              <div className="divide-y divide-border rounded-lg border border-border">
                {orderItems.map((item) => (
                  <div key={item.id} className="flex justify-between px-3 py-2 text-sm">
                    <span>{item.product_name} × {item.quantity}</span>
                    <span className="font-heading font-bold">${(item.unit_price * item.quantity).toLocaleString("es-AR")}</span>
                  </div>
                ))}
                {orderItems.length === 0 && <div className="p-3 text-muted-foreground text-center text-sm">Sin productos</div>}
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="text-xs font-heading uppercase text-muted-foreground">Tracking de envío</h3>
              <div className="flex gap-2">
                <Input value={trackingInput} onChange={(e) => setTrackingInput(e.target.value)} placeholder="Código de seguimiento" />
                <Button size="sm" onClick={saveTracking}><Truck className="w-4 h-4 mr-1" /> Guardar</Button>
              </div>
            </div>

            {selectedOrder && selectedOrder.status !== "pagado" && selectedOrder.status !== "entregado" && (
              <Button className="w-full" onClick={() => setPayOrder(selectedOrder)}>
                <DollarSign className="w-4 h-4 mr-1" /> Registrar pago total (${selectedOrder.total?.toLocaleString("es-AR")})
              </Button>
            )}
            {selectedOrder?.metodo_pago && (
              <div className="text-xs text-muted-foreground text-center">
                Pagado por: <span className="text-foreground font-medium">{getPaymentMethodLabel(selectedOrder.metodo_pago)}</span>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {payOrder && (
        <ConfirmFullPaymentDialog
          open={!!payOrder}
          onOpenChange={(v) => !v && setPayOrder(null)}
          title="Registrar pago del pedido"
          description={`Pedido #${payOrder.order_number} · ${payOrder.customer_name}`}
          monto={Number(payOrder.total || 0)}
          moneda={payOrder.currency || "ARS"}
          defaultMethod={payOrder.metodo_pago || "efectivo"}
          onConfirm={(v) => registrarPagoOrden(payOrder, v)}
        />
      )}
    </div>
  );
};

export default StoreOrders;
