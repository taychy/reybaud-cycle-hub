import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { formatPrice } from "@/lib/currency";
import {
  Clock, CheckCircle2, Package, XCircle, Plus, AlertTriangle, ShoppingBag, Loader2,
} from "lucide-react";

interface OrderRow {
  id: string;
  order_number: number;
  total: number;
  currency: string;
  status: string;
  created_at: string;
  alumno_id: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  order: OrderRow | null;
  onChanged: () => void;
}

const statusMeta = (s: string) => ({
  pendiente: { label: "Pendiente", color: "text-muted-foreground", icon: Clock },
  pendiente_pago: { label: "Esperando pago", color: "text-muted-foreground", icon: Clock },
  pagado: { label: "Pagado", color: "text-cyan", icon: CheckCircle2 },
  preparando: { label: "Preparando", color: "text-primary", icon: Package },
  enviado: { label: "Enviado", color: "text-primary", icon: Package },
  entregado: { label: "Entregado", color: "text-green-400", icon: CheckCircle2 },
  cancelado: { label: "Cancelado", color: "text-destructive", icon: XCircle },
}[s] || { label: s, color: "text-muted-foreground", icon: Clock });

const WINDOW_MS = 12 * 60 * 60 * 1000;

const formatRemaining = (ms: number) => {
  if (ms <= 0) return "expirado";
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
};

const OrderDetailDialog = ({ open, onOpenChange, order, onChanged }: Props) => {
  const { toast } = useToast();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState<number>(Date.now());

  // Add-product state
  const [pickerOpen, setPickerOpen] = useState(false);
  const [products, setProducts] = useState<any[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [variante, setVariante] = useState<Record<string, string>>({});
  const [cantidad, setCantidad] = useState(1);

  useEffect(() => {
    if (!open || !order) return;
    setLoading(true);
    setNow(Date.now());
    (async () => {
      const { data } = await supabase
        .from("store_order_items")
        .select("id, product_id, product_name, quantity, unit_price, variant_selection")
        .eq("order_id", order.id)
        .order("created_at", { ascending: true });
      setItems((data as any[]) || []);
      setLoading(false);
    })();
  }, [open, order?.id]);

  // tick for countdown
  useEffect(() => {
    if (!open) return;
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, [open]);

  const editable = useMemo(() => {
    if (!order) return false;
    const ageMs = now - new Date(order.created_at).getTime();
    return ["pendiente", "pendiente_pago"].includes(order.status) && ageMs < WINDOW_MS;
  }, [order, now]);

  const remainingMs = useMemo(() => {
    if (!order) return 0;
    return WINDOW_MS - (now - new Date(order.created_at).getTime());
  }, [order, now]);

  const loadProducts = async () => {
    setProductsLoading(true);
    const { data } = await supabase
      .from("store_products")
      .select("id, name, price, currency, stock, variants, variant_stock, status, is_preorder")
      .eq("status", "active")
      .eq("is_preorder", false)
      .order("name");
    setProducts((data as any[]) || []);
    setProductsLoading(false);
  };

  const openPicker = async () => {
    setSelectedProductId("");
    setVariante({});
    setCantidad(1);
    setPickerOpen(true);
    if (products.length === 0) await loadProducts();
  };

  const selectedProduct = products.find((p) => p.id === selectedProductId);
  const variantSpecs: { name: string; options: string[] }[] = useMemo(() => {
    if (!selectedProduct?.variants || !Array.isArray(selectedProduct.variants)) return [];
    return selectedProduct.variants.filter((v: any) => v?.name && Array.isArray(v?.options) && v.options.length > 0);
  }, [selectedProduct]);
  const variantSig = useMemo(() => {
    if (!variantSpecs.length) return "";
    return variantSpecs.map((s) => `${s.name}:${variante[s.name] || ""}`).join("|");
  }, [variantSpecs, variante]);
  const stockDisp: number | null = useMemo(() => {
    if (!selectedProduct) return null;
    if (variantSpecs.length && variantSig && selectedProduct.variant_stock) {
      const s = (selectedProduct.variant_stock as Record<string, number>)[variantSig];
      return typeof s === "number" ? s : 0;
    }
    return typeof selectedProduct.stock === "number" ? selectedProduct.stock : null;
  }, [selectedProduct, variantSpecs, variantSig]);

  const variantesElegidas = variantSpecs.every((s) => variante[s.name]);
  const stockOk = stockDisp == null || stockDisp >= cantidad;

  const handleCancel = async () => {
    if (!order) return;
    if (!confirm("¿Cancelar este pedido? Esta acción no se puede deshacer.")) return;
    setBusy(true);
    const { error } = await supabase
      .from("store_orders")
      .update({ status: "cancelado" } as any)
      .eq("id", order.id);
    setBusy(false);
    if (error) {
      toast({ title: "No se pudo cancelar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Pedido cancelado" });
    onChanged();
    onOpenChange(false);
  };

  const handleAdd = async () => {
    if (!order || !selectedProduct) return;
    if (selectedProduct.currency && order.currency && selectedProduct.currency !== order.currency) {
      toast({ title: "Moneda distinta", description: `Este producto está en ${selectedProduct.currency}, pero el pedido está en ${order.currency}.`, variant: "destructive" });
      return;
    }
    if (variantSpecs.length && !variantesElegidas) {
      toast({ title: "Falta elegir variante", variant: "destructive" });
      return;
    }
    if (!stockOk) {
      toast({ title: "Sin stock suficiente", description: `Quedan ${stockDisp}.`, variant: "destructive" });
      return;
    }
    setBusy(true);
    const subtotal = Number(selectedProduct.price) * cantidad;
    const { error: itemErr } = await supabase.from("store_order_items").insert({
      order_id: order.id,
      product_id: selectedProduct.id,
      product_name: selectedProduct.name,
      quantity: cantidad,
      unit_price: selectedProduct.price,
      variant_selection: variante,
    } as any);
    if (itemErr) {
      setBusy(false);
      toast({ title: "Error", description: itemErr.message, variant: "destructive" });
      return;
    }
    const newTotal = Number(order.total) + subtotal;
    const { error: updErr } = await supabase
      .from("store_orders")
      .update({ total: newTotal } as any)
      .eq("id", order.id);
    setBusy(false);
    if (updErr) {
      toast({ title: "Producto agregado", description: `No se pudo actualizar el total: ${updErr.message}`, variant: "destructive" });
    } else {
      toast({ title: "Producto agregado al pedido" });
    }
    setPickerOpen(false);
    onChanged();
    // reload items
    const { data } = await supabase
      .from("store_order_items")
      .select("id, product_id, product_name, quantity, unit_price, variant_selection")
      .eq("order_id", order.id)
      .order("created_at", { ascending: true });
    setItems((data as any[]) || []);
  };

  if (!order) return null;
  const meta = statusMeta(order.status);
  const Icon = meta.icon;
  const newTotalDisplay = items.reduce((s, it) => s + Number(it.unit_price) * Number(it.quantity), 0);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading flex items-center justify-between gap-2">
              <span>Pedido #{order.order_number}</span>
              <span className={`inline-flex items-center gap-1 text-[11px] font-heading font-bold uppercase ${meta.color}`}>
                <Icon className="w-3.5 h-3.5" /> {meta.label}
              </span>
            </DialogTitle>
            <DialogDescription>
              {new Date(order.created_at).toLocaleString("es-AR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
            </DialogDescription>
          </DialogHeader>

          {/* Editable window banner */}
          {["pendiente", "pendiente_pago"].includes(order.status) && (
            <div className={`rounded-lg border p-3 text-[12px] flex items-start gap-2 ${editable ? "border-primary/30 bg-primary/5" : "border-border bg-muted/30"}`}>
              <Clock className={`w-4 h-4 mt-0.5 shrink-0 ${editable ? "text-primary" : "text-muted-foreground"}`} />
              <div className="leading-snug">
                {editable ? (
                  <>
                    Podés <b>cancelar</b> o <b>agregar productos</b> durante las primeras 12 horas.
                    <br />
                    <span className="text-muted-foreground">Tiempo restante: <b className="text-primary">{formatRemaining(remainingMs)}</b></span>
                  </>
                ) : (
                  <span className="text-muted-foreground">
                    Pasaron más de 12 horas desde la creación. Para modificar este pedido, contactá al equipo.
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Items */}
          <div className="space-y-2">
            <p className="text-[11px] font-heading uppercase tracking-wider text-muted-foreground">Productos</p>
            {loading ? (
              <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
            ) : items.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin items.</p>
            ) : (
              <ul className="space-y-2">
                {items.map((it) => {
                  const variant = it.variant_selection || {};
                  const variantStr = Object.entries(variant).map(([k, v]) => `${k}: ${v}`).join(" · ");
                  return (
                    <li key={it.id} className="rounded-lg border border-border bg-card p-2 flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{it.product_name}</p>
                        {variantStr && <p className="text-[11px] text-muted-foreground truncate">{variantStr}</p>}
                        <p className="text-[11px] text-muted-foreground">x{it.quantity} · {formatPrice(Number(it.unit_price), order.currency)}</p>
                      </div>
                      <b className="text-sm whitespace-nowrap">{formatPrice(Number(it.unit_price) * Number(it.quantity), order.currency)}</b>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="rounded-lg border border-border p-3 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Total</span>
            <b className="font-heading text-primary">{formatPrice(Math.max(Number(order.total), newTotalDisplay), order.currency)}</b>
          </div>

          {editable && (
            <div className="grid grid-cols-2 gap-2 pt-1">
              <Button variant="outline" onClick={openPicker} disabled={busy}>
                <Plus className="w-4 h-4 mr-1" /> Agregar
              </Button>
              <Button variant="destructive" onClick={handleCancel} disabled={busy}>
                <XCircle className="w-4 h-4 mr-1" /> Cancelar
              </Button>
            </div>
          )}

          {!editable && order.status === "cancelado" && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-[12px] flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-destructive" />
              <span>Este pedido fue cancelado.</span>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Add product picker */}
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading">Agregar producto al pedido</DialogTitle>
            <DialogDescription>Se sumará al total. El pago final incluirá los nuevos productos.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="text-xs font-heading uppercase text-muted-foreground">Producto</label>
              {productsLoading ? (
                <div className="flex justify-center py-3"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
              ) : (
                <Select value={selectedProductId} onValueChange={(v) => { setSelectedProductId(v); setVariante({}); setCantidad(1); }}>
                  <SelectTrigger><SelectValue placeholder="Elegí un producto" /></SelectTrigger>
                  <SelectContent>
                    {products.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} · {formatPrice(Number(p.price), p.currency || "ARS")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {selectedProduct && variantSpecs.map((spec) => (
              <div key={spec.name}>
                <label className="text-xs font-heading uppercase text-muted-foreground">{spec.name}</label>
                <Select value={variante[spec.name] || ""} onValueChange={(v) => setVariante((p) => ({ ...p, [spec.name]: v }))}>
                  <SelectTrigger><SelectValue placeholder={`Elegí ${spec.name}`} /></SelectTrigger>
                  <SelectContent>
                    {spec.options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ))}

            {selectedProduct && (
              <div>
                <label className="text-xs font-heading uppercase text-muted-foreground">Cantidad</label>
                <Input type="number" min={1} value={cantidad} onChange={(e) => setCantidad(Math.max(1, Number(e.target.value)))} />
                {stockDisp != null && (
                  <p className="text-[11px] text-muted-foreground mt-1">Stock disponible: <b>{stockDisp}</b></p>
                )}
              </div>
            )}

            {selectedProduct && (
              <div className="rounded-lg border border-border p-3 text-sm flex justify-between">
                <span className="text-muted-foreground">Subtotal a agregar</span>
                <b>{formatPrice(Number(selectedProduct.price) * cantidad, selectedProduct.currency || order.currency)}</b>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setPickerOpen(false)}>Volver</Button>
              <Button onClick={handleAdd} disabled={busy || !selectedProduct || !stockOk}>
                <ShoppingBag className="w-4 h-4 mr-1" />
                {busy ? "Agregando..." : "Agregar al pedido"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default OrderDetailDialog;
