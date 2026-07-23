import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Pencil, Trash2, CheckCircle2, XCircle, Truck, PackageCheck, ChevronDown, ChevronUp, AlertTriangle } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import SupplierOrderDialog from "@/components/supplier/SupplierOrderDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { compareVariantsBySize } from "@/lib/variantSort";

const sb: any = supabase;

const ESTADOS = [
  { value: "abierto", label: "Abierto" },
  { value: "recibido_parcial", label: "Recibido parcial" },
  { value: "cerrado", label: "Cerrado" },
  { value: "cancelado", label: "Cancelado" },
];

const estadoColor = (s: string) => {
  switch (s) {
    case "abierto": return "bg-primary/20 text-primary";
    case "recibido_parcial": return "bg-cyan/20 text-cyan";
    case "cerrado": return "bg-green-500/20 text-green-400";
    case "cancelado": return "bg-destructive/20 text-destructive";
    default: return "bg-muted text-muted-foreground";
  }
};

interface Props { title?: string }

const SupplierOrders = ({ title = "Pedidos a Proveedor" }: Props) => {
  const [rows, setRows] = useState<any[]>([]);
  const [itemsByOrder, setItemsByOrder] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterEstado, setFilterEstado] = useState("all");
  const [editing, setEditing] = useState<any | null>(null);
  const [creating, setCreating] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [finalizing, setFinalizing] = useState<string | null>(null);
  const [unlinkedDialog, setUnlinkedDialog] = useState<{ orderId: string; items: any[] } | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await sb
      .from("supplier_orders")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setLoading(false);
      return;
    }
    setRows(data || []);
    const ids = (data || []).map((r: any) => r.id);
    if (ids.length) {
      const { data: its } = await sb.from("supplier_order_items").select("*").in("supplier_order_id", ids);
      const map: Record<string, any[]> = {};
      (its || []).forEach((it: any) => {
        if (!map[it.supplier_order_id]) map[it.supplier_order_id] = [];
        map[it.supplier_order_id].push(it);
      });
      setItemsByOrder(map);
    } else {
      setItemsByOrder({});
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const updateEstado = async (id: string, estado: string) => {
    const { error } = await sb.from("supplier_orders").update({ estado }).eq("id", id);
    if (error) return toast({ title: "Error", description: error.message, variant: "destructive" });
    toast({ title: "Estado actualizado" });
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("¿Eliminar este pedido? Esta acción es permanente.")) return;
    const { error } = await sb.from("supplier_orders").delete().eq("id", id);
    if (error) return toast({ title: "Error", description: error.message, variant: "destructive" });
    toast({ title: "Pedido eliminado" });
    load();
  };

  const finalizarIngreso = async (orderId: string) => {
    setFinalizing(orderId);
    try {
      const { data, error } = await sb.rpc("finalize_supplier_order_entry", { _order_id: orderId });
      if (error) throw error;
      if (data?.ok === false && data?.unlinked?.length) {
        setUnlinkedDialog({ orderId, items: data.unlinked });
        return;
      }
      if (data?.already_closed) {
        toast({ title: "El pedido ya estaba cerrado" });
      } else {
        toast({ title: "Ingreso finalizado", description: `${data?.items_procesados || 0} ítems sumados al stock.` });
      }
      load();
    } catch (e: any) {
      toast({ title: "Error al finalizar", description: e.message, variant: "destructive" });
    } finally {
      setFinalizing(null);
    }
  };


  const filtered = useMemo(() => rows.filter((r) => {
    if (filterEstado !== "all" && r.estado !== filterEstado) return false;
    if (search) {
      const s = search.toLowerCase();
      if (
        !(r.numero || "").toLowerCase().includes(s) &&
        !(r.proveedor_nombre || "").toLowerCase().includes(s)
      ) return false;
    }
    return true;
  }), [rows, search, filterEstado]);

  const itemsResumen = (orderId: string) => {
    const its = itemsByOrder[orderId] || [];
    if (!its.length) return "Sin ítems";
    const total = its.reduce((a, i) => a + (i.cantidad_pedida || 0), 0);
    const recibido = its.reduce((a, i) => a + (i.cantidad_recibida || 0), 0);
    return `${its.length} ítem${its.length === 1 ? "" : "s"} · ${recibido}/${total} recibidos`;
  };

  if (loading) return <div className="text-muted-foreground animate-pulse p-6">Cargando pedidos…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-heading font-bold">{title}</h1>
        <Button onClick={() => setCreating(true)} className="gap-2">
          <Plus className="w-4 h-4" /> Nuevo pedido
        </Button>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar por número o proveedor…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={filterEstado} onValueChange={setFilterEstado}>
          <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            {ESTADOS.map((e) => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">No hay pedidos a proveedor.</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => (
            <div key={r.id} className="rounded-xl border border-border bg-card p-3 space-y-2">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-heading font-bold text-sm">{r.numero}</span>
                    <Badge className={estadoColor(r.estado)}>{r.estado.replace(/_/g, " ")}</Badge>
                  </div>
                  <div className="text-sm mt-0.5"><Truck className="inline w-3.5 h-3.5 mr-1 text-muted-foreground" /> {r.proveedor_nombre}</div>
                  <div className="text-xs text-muted-foreground">
                    Pedido: {new Date(r.fecha_pedido + "T00:00:00").toLocaleDateString("es-AR")}
                    {r.fecha_estimada_entrega && ` · ETA: ${new Date(r.fecha_estimada_entrega + "T00:00:00").toLocaleDateString("es-AR")}`}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">{itemsResumen(r.id)}</div>
                  {r.notas && <div className="text-xs text-muted-foreground mt-1 italic line-clamp-2">{r.notas}</div>}
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" className="h-8 gap-1" onClick={() => setExpanded((p) => ({ ...p, [r.id]: !p[r.id] }))}>
                    {expanded[r.id] ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    <span className="text-xs">Ítems</span>
                  </Button>
                  {r.estado !== "cerrado" && r.estado !== "cancelado" && (
                    <Button
                      variant="ghost" size="sm"
                      className="h-8 gap-1 text-primary"
                      onClick={() => finalizarIngreso(r.id)}
                      disabled={finalizing === r.id}
                      title="Cerrar y sumar recibido al stock"
                    >
                      <PackageCheck className="w-4 h-4" />
                      <span className="text-xs">{finalizing === r.id ? "..." : "Finalizar ingreso"}</span>
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditing(r)} title="Editar">
                    <Pencil className="w-4 h-4" />
                  </Button>
                  {r.estado !== "cancelado" && (
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => updateEstado(r.id, "cancelado")} title="Cancelar">
                      <XCircle className="w-4 h-4" />
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => remove(r.id)} title="Eliminar">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {expanded[r.id] && (
                <div className="border-t border-border pt-2 space-y-3">
                  {(itemsByOrder[r.id] || []).length === 0 ? (
                    <div className="text-xs text-muted-foreground">Sin ítems.</div>
                  ) : (() => {
                    const groups = new Map<string, any[]>();
                    for (const it of (itemsByOrder[r.id] || [])) {
                      const key = it.producto_nombre || "—";
                      if (!groups.has(key)) groups.set(key, []);
                      groups.get(key)!.push(it);
                    }
                    return Array.from(groups.entries()).map(([name, items]) => {
                      const sortedItems = items.sort(compareVariantsBySize);
                      const totRec = items.reduce((s, x) => s + (x.cantidad_recibida || 0), 0);
                      const totPed = items.reduce((s, x) => s + (x.cantidad_pedida || 0), 0);
                      const anyUnlinked = items.some((x) => !x.product_id);
                      const complete = totRec === totPed;
                      return (
                        <div key={name} className="rounded-md border border-border/60 bg-muted/20">
                          <div className="flex items-center justify-between gap-2 px-2 py-1.5 border-b border-border/40">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="text-xs font-semibold truncate">{name}</span>
                              {anyUnlinked && <Badge variant="outline" className="text-[10px] h-4 border-amber-500/50 text-amber-500">sin vincular</Badge>}
                              <Badge variant="secondary" className="text-[10px] h-4">{items.length} var.</Badge>
                            </div>
                            <div className={`text-xs whitespace-nowrap font-medium ${complete ? "text-green-400" : "text-muted-foreground"}`}>
                              {totRec}/{totPed}
                            </div>
                          </div>
                          <div className="divide-y divide-border/30">
                            {sortedItems.map((it: any) => {
                              const vEntries = Object.entries(it.variante || {}).filter(([, v]) => v);
                              const rec = it.cantidad_recibida || 0;
                              const ped = it.cantidad_pedida || 0;
                              const okLine = rec === ped;
                              return (
                                <div key={it.id} className="flex items-center justify-between gap-2 text-xs px-2 py-1">
                                  <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                                    {vEntries.length === 0 ? (
                                      <span className="text-muted-foreground">sin variante</span>
                                    ) : vEntries.map(([k, v]) => (
                                      <Badge key={k} variant="secondary" className="text-[10px] h-4">{k}: {String(v)}</Badge>
                                    ))}
                                  </div>
                                  <div className={`whitespace-nowrap ${okLine ? "text-muted-foreground" : "text-amber-500"}`}>
                                    {rec}/{ped}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              )}

            </div>
          ))}
        </div>
      )}

      <Dialog open={!!unlinkedDialog} onOpenChange={(o) => !o && setUnlinkedDialog(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              No se puede finalizar el ingreso
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Estas líneas no están vinculadas a un producto de tienda (o les falta la variante). Vinculalas antes de sumar al stock.
            </p>
            <div className="space-y-1 max-h-[300px] overflow-y-auto">
              {(unlinkedDialog?.items || []).map((it: any) => (
                <div key={it.item_id} className="text-sm border border-border rounded p-2 bg-muted/30">
                  <div className="font-medium">{it.nombre}</div>
                  <div className="text-xs text-muted-foreground">
                    {it.reason === "sin_producto" && "Sin producto de tienda"}
                    {it.reason === "sin_variante" && "Falta variante (talle/color)"}
                    {it.reason === "producto_no_existe" && "Producto vinculado ya no existe"}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUnlinkedDialog(null)}>Cerrar</Button>
            <Button onClick={() => {
              const order = rows.find((r) => r.id === unlinkedDialog?.orderId);
              setUnlinkedDialog(null);
              if (order) setEditing(order);
            }}>Editar pedido</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      <SupplierOrderDialog
        open={creating || !!editing}
        order={editing}
        onClose={() => { setCreating(false); setEditing(null); }}
        onSaved={() => { setCreating(false); setEditing(null); load(); }}
      />
    </div>
  );
};

export default SupplierOrders;
