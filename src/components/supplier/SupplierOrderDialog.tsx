import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const sb: any = supabase;

interface Item {
  id?: string;
  product_id?: string | null;
  producto_nombre: string;
  variante: Record<string, string>;
  cantidad_pedida: number;
  cantidad_recibida?: number;
  precio_unitario?: number | null;
  notas?: string | null;
  _new?: boolean;
  _deleted?: boolean;
}

interface Props {
  open: boolean;
  order: any | null;
  onClose: () => void;
  onSaved: () => void;
}

const SupplierOrderDialog = ({ open, order, onClose, onSaved }: Props) => {
  const [proveedor, setProveedor] = useState("");
  const [contacto, setContacto] = useState("");
  const [fechaPedido, setFechaPedido] = useState<string>(new Date().toISOString().slice(0, 10));
  const [fechaEta, setFechaEta] = useState<string>("");
  const [moneda, setMoneda] = useState("ARS");
  const [notas, setNotas] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [productos, setProductos] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    sb.from("store_products").select("id, nombre, variants").eq("activo", true).then(({ data }: any) => {
      setProductos(data || []);
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (order) {
      setProveedor(order.proveedor_nombre || "");
      setContacto(order.proveedor_contacto || "");
      setFechaPedido(order.fecha_pedido || new Date().toISOString().slice(0, 10));
      setFechaEta(order.fecha_estimada_entrega || "");
      setMoneda(order.moneda || "ARS");
      setNotas(order.notas || "");
      sb.from("supplier_order_items").select("*").eq("supplier_order_id", order.id).then(({ data }: any) => {
        setItems((data || []).map((i: any) => ({ ...i, variante: i.variante || {} })));
      });
    } else {
      setProveedor(""); setContacto(""); setFechaPedido(new Date().toISOString().slice(0, 10));
      setFechaEta(""); setMoneda("ARS"); setNotas(""); setItems([]);
    }
  }, [open, order?.id]);

  const totalEstimado = useMemo(
    () => items.filter(i => !i._deleted).reduce((acc, i) => acc + (Number(i.precio_unitario) || 0) * (i.cantidad_pedida || 0), 0),
    [items]
  );

  const addItem = () => {
    setItems((prev) => [...prev, {
      producto_nombre: "",
      variante: {},
      cantidad_pedida: 1,
      cantidad_recibida: 0,
      _new: true,
    }]);
  };

  const updateItem = (idx: number, patch: Partial<Item>) => {
    setItems((prev) => prev.map((it, i) => i === idx ? { ...it, ...patch } : it));
  };

  const removeItem = (idx: number) => {
    setItems((prev) => prev.map((it, i) => i === idx ? { ...it, _deleted: true } : it).filter((it) => !(it._new && it._deleted)));
  };

  const selectProduct = (idx: number, productId: string) => {
    const p = productos.find((pp) => pp.id === productId);
    updateItem(idx, {
      product_id: productId,
      producto_nombre: p?.nombre || items[idx].producto_nombre,
      variante: {},
    });
  };

  const productVariantOptions = (productId: string | null | undefined) => {
    const p = productos.find((pp) => pp.id === productId);
    const variants = (p?.variants || {}) as Record<string, string[]>;
    return variants;
  };

  const save = async () => {
    if (!proveedor.trim()) return toast({ title: "Falta proveedor", variant: "destructive" });
    const validItems = items.filter((i) => !i._deleted);
    if (validItems.some((i) => !i.producto_nombre.trim() || i.cantidad_pedida <= 0)) {
      return toast({ title: "Ítems incompletos", description: "Cada ítem necesita nombre y cantidad > 0.", variant: "destructive" });
    }

    setSaving(true);
    try {
      const { data: userData } = await sb.auth.getUser();
      const header = {
        proveedor_nombre: proveedor.trim(),
        proveedor_contacto: contacto.trim() || null,
        fecha_pedido: fechaPedido,
        fecha_estimada_entrega: fechaEta || null,
        moneda,
        notas: notas.trim() || null,
        total_estimado: totalEstimado,
      };
      let orderId = order?.id;
      if (orderId) {
        const { error } = await sb.from("supplier_orders").update(header).eq("id", orderId);
        if (error) throw error;
      } else {
        const { data, error } = await sb.from("supplier_orders").insert({ ...header, created_by: userData?.user?.id || null }).select("id").single();
        if (error) throw error;
        orderId = data.id;
      }

      // Items: delete marked, upsert rest
      const toDelete = items.filter((i) => i._deleted && i.id).map((i) => i.id);
      if (toDelete.length) {
        await sb.from("supplier_order_items").delete().in("id", toDelete);
      }
      const toUpsert = items.filter((i) => !i._deleted).map((i) => ({
        id: i.id,
        supplier_order_id: orderId,
        product_id: i.product_id || null,
        producto_nombre: i.producto_nombre.trim(),
        variante: i.variante || {},
        cantidad_pedida: Number(i.cantidad_pedida) || 0,
        cantidad_recibida: Number(i.cantidad_recibida) || 0,
        precio_unitario: i.precio_unitario != null ? Number(i.precio_unitario) : null,
        notas: i.notas || null,
      }));
      const newItems = toUpsert.filter((i) => !i.id).map(({ id, ...rest }) => rest);
      const existingItems = toUpsert.filter((i) => !!i.id);
      if (newItems.length) {
        const { error } = await sb.from("supplier_order_items").insert(newItems);
        if (error) throw error;
      }
      for (const it of existingItems) {
        const { id, ...rest } = it;
        const { error } = await sb.from("supplier_order_items").update(rest).eq("id", id);
        if (error) throw error;
      }
      toast({ title: order ? "Pedido actualizado" : "Pedido creado" });
      onSaved();
    } catch (e: any) {
      toast({ title: "Error al guardar", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{order ? `Pedido ${order.numero}` : "Nuevo pedido a proveedor"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <Label>Proveedor *</Label>
              <Input value={proveedor} onChange={(e) => setProveedor(e.target.value)} placeholder="Nombre del proveedor" />
            </div>
            <div className="md:col-span-2">
              <Label>Contacto (opcional)</Label>
              <Input value={contacto} onChange={(e) => setContacto(e.target.value)} placeholder="Teléfono / mail / referente" />
            </div>
            <div>
              <Label>Fecha del pedido</Label>
              <Input type="date" value={fechaPedido} onChange={(e) => setFechaPedido(e.target.value)} />
            </div>
            <div>
              <Label>Entrega estimada</Label>
              <Input type="date" value={fechaEta} onChange={(e) => setFechaEta(e.target.value)} />
            </div>
            <div>
              <Label>Moneda</Label>
              <Select value={moneda} onValueChange={setMoneda}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ARS">ARS</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Total estimado</Label>
              <Input value={totalEstimado.toLocaleString("es-AR")} disabled />
            </div>
          </div>

          <div>
            <Label>Notas</Label>
            <Textarea rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Ítems del pedido</Label>
              <Button size="sm" variant="outline" onClick={addItem}><Plus className="w-3 h-3 mr-1" /> Agregar ítem</Button>
            </div>
            {items.filter((i) => !i._deleted).length === 0 && (
              <p className="text-xs text-muted-foreground">Todavía no hay ítems. Agregá al menos uno.</p>
            )}
            {items.map((it, idx) => {
              if (it._deleted) return null;
              const variantOpts = productVariantOptions(it.product_id);
              const variantKeys = Object.keys(variantOpts);
              return (
                <div key={idx} className="border border-border rounded-md p-3 space-y-2 bg-muted/20">
                  <div className="flex items-start gap-2">
                    <div className="flex-1 space-y-2">
                      <Select value={it.product_id || "__free__"} onValueChange={(v) => v === "__free__" ? updateItem(idx, { product_id: null, variante: {} }) : selectProduct(idx, v)}>
                        <SelectTrigger className="h-9"><SelectValue placeholder="Producto" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__free__">— Ítem libre —</SelectItem>
                          {productos.map((p) => <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Input
                        placeholder="Nombre / descripción del ítem"
                        value={it.producto_nombre}
                        onChange={(e) => updateItem(idx, { producto_nombre: e.target.value })}
                      />
                      {variantKeys.length > 0 && (
                        <div className="grid grid-cols-2 gap-2">
                          {variantKeys.map((k) => (
                            <Select
                              key={k}
                              value={it.variante[k] || ""}
                              onValueChange={(v) => updateItem(idx, { variante: { ...it.variante, [k]: v } })}
                            >
                              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder={k} /></SelectTrigger>
                              <SelectContent>
                                {(variantOpts[k] || []).map((opt) => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          ))}
                        </div>
                      )}
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <Label className="text-xs">Cantidad</Label>
                          <Input type="number" min={0} value={it.cantidad_pedida} onChange={(e) => updateItem(idx, { cantidad_pedida: Number(e.target.value) || 0 })} />
                        </div>
                        <div>
                          <Label className="text-xs">Recibido</Label>
                          <Input type="number" min={0} value={it.cantidad_recibida || 0} onChange={(e) => updateItem(idx, { cantidad_recibida: Number(e.target.value) || 0 })} />
                        </div>
                        <div>
                          <Label className="text-xs">Precio u.</Label>
                          <Input type="number" min={0} step="0.01" value={it.precio_unitario ?? ""} onChange={(e) => updateItem(idx, { precio_unitario: e.target.value === "" ? null : Number(e.target.value) })} />
                        </div>
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeItem(idx)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            {order ? "Guardar cambios" : "Crear pedido"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SupplierOrderDialog;
