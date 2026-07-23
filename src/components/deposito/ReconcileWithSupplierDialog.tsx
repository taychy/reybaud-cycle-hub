import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, PackageX, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  listId: string;
  listTitle: string;
  onApplied: () => void;
}

interface SupplierOrder {
  id: string;
  numero: string;
  proveedor_nombre: string;
  estado: string;
  fecha_pedido: string | null;
}

interface ShortageRow {
  producto: string;
  variante: string | null;
  pedido: number;
  recibido: number;
  faltante: number;
  en_lista: number;
  a_quitar: number;
}

export default function ReconcileWithSupplierDialog({ open, onOpenChange, listId, listTitle, onApplied }: Props) {
  const [orders, setOrders] = useState<SupplierOrder[]>([]);
  const [orderId, setOrderId] = useState<string>("");
  const [rows, setRows] = useState<ShortageRow[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (!open) return;
    setOrderId("");
    setRows([]);
    (async () => {
      setLoadingOrders(true);
      const { data, error } = await supabase
        .from("supplier_orders")
        .select("id, numero, proveedor_nombre, estado, fecha_pedido")
        .in("estado", ["recibido_parcial", "recibido", "en_transito", "pedido"])
        .order("fecha_pedido", { ascending: false })
        .limit(30);
      setLoadingOrders(false);
      if (error) { toast.error(error.message); return; }
      setOrders((data as any) || []);
    })();
  }, [open]);

  const loadPreview = async (id: string) => {
    setOrderId(id);
    setRows([]);
    if (!id) return;
    setLoadingPreview(true);
    const { data, error } = await supabase.rpc("preview_supplier_shortage_vs_delivery" as any, {
      _order_id: id,
      _list_id: listId,
    });
    setLoadingPreview(false);
    if (error) { toast.error(error.message); return; }
    setRows((data as any) || []);
  };

  const totalAQuitar = rows.reduce((a, r) => a + Number(r.a_quitar || 0), 0);
  const totalHuerfano = rows.reduce((a, r) => a + Math.max(Number(r.faltante || 0) - Number(r.en_lista || 0), 0), 0);

  const apply = async () => {
    if (!orderId) return;
    if (!confirm(`Se quitarán ${totalAQuitar} unidad(es) de la lista "${listTitle}" y se regenerarán las etiquetas al reimprimirlas. ¿Continuar?`)) return;
    setApplying(true);
    const { data, error } = await supabase.rpc("apply_supplier_shortage_to_delivery" as any, {
      _order_id: orderId,
      _list_id: listId,
    });
    setApplying(false);
    if (error) { toast.error(error.message); return; }
    const removidos = ((data as any) || []).reduce((a: number, r: any) => a + Number(r.removido || 0), 0);
    toast.success(`Se quitaron ${removidos} unidades de la lista`);
    onApplied();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackageX className="w-4 h-4" /> Cruzar con control de mercadería
          </DialogTitle>
          <DialogDescription>
            Elegí el pedido a proveedor que corresponde a esta entrega. Vamos a comparar lo pedido con lo recibido y quitar de la lista los ítems que no llegaron.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Pedido a proveedor</label>
            {loadingOrders ? (
              <div className="text-xs text-muted-foreground py-2"><Loader2 className="w-3 h-3 animate-spin inline mr-1" /> Cargando pedidos…</div>
            ) : (
              <Select value={orderId} onValueChange={loadPreview}>
                <SelectTrigger><SelectValue placeholder="Elegí un pedido" /></SelectTrigger>
                <SelectContent>
                  {orders.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.numero} — {o.proveedor_nombre} <span className="text-muted-foreground ml-2">({o.estado})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {orderId && (
            <div className="border border-border rounded-lg overflow-hidden">
              {loadingPreview ? (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin inline mr-1" /> Calculando faltantes…
                </div>
              ) : rows.length === 0 ? (
                <div className="py-6 text-center text-sm text-emerald-500">
                  ✓ No hay faltantes: todo lo pedido llegó completo.
                </div>
              ) : (
                <table className="w-full text-xs">
                  <thead className="bg-secondary/60">
                    <tr>
                      <th className="text-left px-2 py-1.5">Producto</th>
                      <th className="text-left px-2 py-1.5">Talle</th>
                      <th className="text-right px-2 py-1.5">Ped/Rec</th>
                      <th className="text-right px-2 py-1.5">Falta</th>
                      <th className="text-right px-2 py-1.5">En lista</th>
                      <th className="text-right px-2 py-1.5 text-destructive">A quitar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => {
                      const huerfano = Number(r.faltante) > Number(r.en_lista);
                      return (
                        <tr key={i} className="border-t border-border">
                          <td className="px-2 py-1.5">{r.producto}</td>
                          <td className="px-2 py-1.5 text-muted-foreground">{r.variante || "—"}</td>
                          <td className="px-2 py-1.5 text-right">{r.pedido}/{r.recibido}</td>
                          <td className="px-2 py-1.5 text-right font-medium">{r.faltante}</td>
                          <td className="px-2 py-1.5 text-right">{Number(r.en_lista).toFixed(0)}</td>
                          <td className="px-2 py-1.5 text-right">
                            <span className="font-semibold text-destructive">{Number(r.a_quitar).toFixed(0)}</span>
                            {huerfano && (
                              <span title="Faltan más unidades de las que hay en esta lista">
                                <AlertTriangle className="w-3 h-3 text-amber-500 inline ml-1" />
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {rows.length > 0 && (
            <div className="text-[11px] text-muted-foreground space-y-1">
              <div>Se quitarán primero los ítems más antiguos (por orden de carga) y se ignoran los que ya están marcados como entregados.</div>
              {totalHuerfano > 0 && (
                <div className="text-amber-500 flex items-start gap-1">
                  <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                  <span>{totalHuerfano} unidad(es) faltantes no tienen contraparte en esta lista — revisá manualmente.</span>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-border">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cerrar</Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={!orderId || applying || rows.length === 0 || totalAQuitar === 0}
            onClick={apply}
          >
            {applying ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <PackageX className="w-3 h-3 mr-1" />}
            Quitar {totalAQuitar > 0 ? `${totalAQuitar} u.` : "faltantes"} de la lista
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
