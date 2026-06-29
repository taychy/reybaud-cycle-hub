import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Pencil, Trash2, CheckCircle2, XCircle, Truck } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import SupplierOrderDialog from "@/components/supplier/SupplierOrderDialog";

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
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditing(r)} title="Editar">
                    <Pencil className="w-4 h-4" />
                  </Button>
                  {r.estado !== "cerrado" && (
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-green-500" onClick={() => updateEstado(r.id, "cerrado")} title="Cerrar">
                      <CheckCircle2 className="w-4 h-4" />
                    </Button>
                  )}
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
            </div>
          ))}
        </div>
      )}

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
