import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, Loader2, Truck } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const sb: any = supabase;

interface Props {
  saving: boolean;
  isLast: boolean;
  initialOrderId?: string | null;
  initialNota?: string | null;
  onConfirm: (payload: { nota: string | null; entidad_ref_id: string | null }) => Promise<void> | void;
  onCancel: () => void;
}

const formatVariante = (v: any) => {
  if (!v || typeof v !== "object") return "";
  const entries = Object.entries(v).filter(([, val]) => val);
  if (!entries.length) return "";
  return entries.map(([k, val]) => `${k}: ${val}`).join(" / ");
};

const SupplierOrderCheckStage = ({ saving, isLast, initialOrderId, initialNota, onConfirm, onCancel }: Props) => {
  const [orders, setOrders] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [items, setItems] = useState<any[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [nota, setNota] = useState(initialNota || "");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    sb.from("supplier_orders")
      .select("*")
      .in("estado", ["abierto", "recibido_parcial"])
      .order("created_at", { ascending: false })
      .then(({ data }: any) => {
        setOrders(data || []);
        if (initialOrderId && (data || []).some((o: any) => o.id === initialOrderId)) {
          setSelectedId(initialOrderId);
        }
      });
  }, [initialOrderId]);

  useEffect(() => {
    if (!selectedId) { setItems([]); setCounts({}); return; }
    setLoading(true);
    sb.from("supplier_order_items").select("*").eq("supplier_order_id", selectedId).then(({ data }: any) => {
      const list = data || [];
      setItems(list);
      const initial: Record<string, number> = {};
      list.forEach((it: any) => { initial[it.id] = it.cantidad_recibida || 0; });
      setCounts(initial);
      setLoading(false);
    });
  }, [selectedId]);

  const selectedOrder = orders.find((o) => o.id === selectedId);

  const resumen = useMemo(() => {
    let ok = 0, falta = 0, sobra = 0;
    const detalles: string[] = [];
    items.forEach((it) => {
      const recibido = counts[it.id] || 0;
      const pedido = it.cantidad_pedida || 0;
      const label = `${it.producto_nombre}${formatVariante(it.variante) ? ` (${formatVariante(it.variante)})` : ""}`;
      if (recibido === pedido) { ok++; }
      else if (recibido < pedido) { falta++; detalles.push(`Falta ${pedido - recibido} de "${label}" (recibido ${recibido}/${pedido})`); }
      else { sobra++; detalles.push(`Sobran ${recibido - pedido} de "${label}" (recibido ${recibido}/${pedido})`); }
    });
    return { ok, falta, sobra, detalles };
  }, [items, counts]);

  const handleConfirm = async () => {
    if (!selectedId) return toast({ title: "Elegí un pedido", variant: "destructive" });
    if (!items.length) return toast({ title: "El pedido no tiene ítems", variant: "destructive" });

    // Update cantidad_recibida for each item
    try {
      for (const it of items) {
        const newCount = counts[it.id] || 0;
        if (newCount !== (it.cantidad_recibida || 0)) {
          await sb.from("supplier_order_items").update({ cantidad_recibida: newCount }).eq("id", it.id);
        }
      }
      // Compute new estado
      const allOk = items.every((it) => (counts[it.id] || 0) >= (it.cantidad_pedida || 0));
      const someReceived = items.some((it) => (counts[it.id] || 0) > 0);
      const nuevoEstado = allOk ? "cerrado" : someReceived ? "recibido_parcial" : "abierto";
      await sb.from("supplier_orders").update({ estado: nuevoEstado }).eq("id", selectedId);

      // Build resumen text
      const lines = [
        `Pedido: ${selectedOrder?.numero} · ${selectedOrder?.proveedor_nombre}`,
        `OK: ${resumen.ok} · Faltantes: ${resumen.falta} · Sobrantes: ${resumen.sobra}`,
        ...resumen.detalles,
      ];
      if (nota.trim()) lines.push("", "Observaciones:", nota.trim());

      await onConfirm({ nota: lines.join("\n"), entidad_ref_id: selectedId });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  return (
    <Card className="border-primary/40">
      <CardHeader>
        <CardTitle className="text-base">Control contra pedido</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <label className="text-sm font-medium block mb-1">Pedido al proveedor</label>
          <Select value={selectedId} onValueChange={setSelectedId}>
            <SelectTrigger>
              <SelectValue placeholder="Elegí un pedido abierto…" />
            </SelectTrigger>
            <SelectContent>
              {orders.length === 0 && <div className="text-xs text-muted-foreground p-2">No hay pedidos abiertos.</div>}
              {orders.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.numero} · {o.proveedor_nombre} · {new Date(o.fecha_pedido + "T00:00:00").toLocaleDateString("es-AR")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectedOrder && (
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <Truck className="w-3.5 h-3.5" /> {selectedOrder.proveedor_nombre}
            {selectedOrder.fecha_estimada_entrega && ` · ETA ${new Date(selectedOrder.fecha_estimada_entrega + "T00:00:00").toLocaleDateString("es-AR")}`}
          </div>
        )}

        {loading ? (
          <div className="text-center py-6 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin inline mr-1" /> Cargando ítems…</div>
        ) : items.length > 0 ? (
          <div className="space-y-2">
            {items.map((it) => {
              const recibido = counts[it.id] || 0;
              const pedido = it.cantidad_pedida || 0;
              const status = recibido === pedido ? "ok" : recibido === 0 ? "pend" : recibido < pedido ? "falta" : "sobra";
              const badge = status === "ok" ? "✓" : status === "pend" ? "—" : "!";
              const badgeColor = status === "ok" ? "bg-green-500/20 text-green-400" : status === "pend" ? "bg-muted text-muted-foreground" : "bg-destructive/20 text-destructive";
              return (
                <div key={it.id} className="flex items-center gap-2 p-2 rounded-md border border-border bg-muted/20">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{it.producto_nombre}</div>
                    {formatVariante(it.variante) && <div className="text-xs text-muted-foreground">{formatVariante(it.variante)}</div>}
                  </div>
                  <div className="text-xs text-muted-foreground">de {pedido}</div>
                  <Input
                    type="number"
                    min={0}
                    className="w-20 h-9 text-right"
                    value={recibido}
                    onChange={(e) => setCounts((c) => ({ ...c, [it.id]: Number(e.target.value) || 0 }))}
                  />
                  <Badge className={`${badgeColor} w-7 justify-center`}>{badge}</Badge>
                </div>
              );
            })}
          </div>
        ) : selectedId ? (
          <p className="text-sm text-muted-foreground">Este pedido no tiene ítems cargados.</p>
        ) : null}

        {selectedId && items.length > 0 && (
          <div className="text-xs text-muted-foreground border-t border-border pt-2">
            <span className="text-green-400">{resumen.ok} OK</span> · <span className="text-destructive">{resumen.falta} faltantes</span> · {resumen.sobra} sobrantes
          </div>
        )}

        <div>
          <label className="text-sm font-medium block mb-1">Observaciones (opcional)</label>
          <Textarea rows={3} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Comentarios, daños, sustituciones…" />
        </div>

        <div className="flex gap-2">
          <Button onClick={handleConfirm} disabled={saving || !selectedId} className="flex-1">
            {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-1" />}
            {isLast ? "Finalizar proceso" : "Confirmar etapa"}
          </Button>
          <Button variant="ghost" onClick={onCancel}>Cancelar</Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default SupplierOrderCheckStage;
