import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ScanLine, Search } from "lucide-react";
import ScanCambioDialog, { ScanSlotValue } from "@/components/deposito/ScanCambioDialog";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: () => void;
}

const MOTIVOS = [
  { v: "talle", l: "Cambio de talle" },
  { v: "color", l: "Cambio de color" },
  { v: "defecto", l: "Producto con defecto" },
  { v: "otro", l: "Otro motivo" },
];

const RegistrarCambioPresencialDialog = ({ open, onOpenChange, onCreated }: Props) => {
  const [orderQuery, setOrderQuery] = useState("");
  const [orders, setOrders] = useState<any[]>([]);
  const [order, setOrder] = useState<any | null>(null);
  const [motivo, setMotivo] = useState("talle");
  const [comentario, setComentario] = useState("");
  const [scanOpen, setScanOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      setOrderQuery(""); setOrders([]); setOrder(null);
      setMotivo("talle"); setComentario("");
    }
  }, [open]);

  useEffect(() => {
    if (orderQuery.length < 2) { setOrders([]); return; }
    const t = setTimeout(async () => {
      const q = orderQuery.trim();
      const isNum = /^\d+$/.test(q);
      let req = supabase
        .from("store_orders")
        .select("id, order_number, alumno_id, customer_name, customer_email, status, created_at, alumnos!inner(id, nombre, apellido, email, dni)")
        .order("created_at", { ascending: false })
        .limit(8);
      if (isNum) req = req.eq("order_number", Number(q));
      else req = req.or(`customer_name.ilike.%${q}%,customer_email.ilike.%${q}%`);
      const { data } = await req;
      setOrders((data as any[]) || []);
    }, 300);
    return () => clearTimeout(t);
  }, [orderQuery]);

  const handleConfirm = async ({ devuelto, recibido }: { devuelto: ScanSlotValue; recibido: ScanSlotValue | null }) => {
    setSaving(true);
    const { error } = await supabase.rpc("deposito_registrar_cambio_presencial" as any, {
      p_order_id: order?.id || null,
      p_alumno_id: order?.alumno_id || null,
      p_metodo: devuelto.metodo,
      p_qr_devuelto_pid: devuelto.productId,
      p_qr_devuelto_variante: devuelto.variante,
      p_motivo: motivo,
      p_comentario: comentario || null,
      p_entregar_reemplazo: !!recibido,
      p_qr_recibido_pid: recibido?.productId || null,
      p_qr_recibido_variante: recibido?.variante || null,
    });
    setSaving(false);
    if (error) throw error;
    toast({ title: "Cambio presencial registrado" });
    setScanOpen(false);
    onOpenChange(false);
    onCreated?.();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading uppercase tracking-wider">Recibir cambio presencial</DialogTitle>
            <DialogDescription>
              El alumno trajo una prenda sin reclamo previo. Buscá su venta y escaneá los QR.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <Label className="text-xs">Buscar pedido (opcional)</Label>
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2 top-2.5 text-muted-foreground" />
                <Input
                  className="pl-7"
                  placeholder="N° de pedido, nombre o email"
                  value={orderQuery}
                  onChange={(e) => setOrderQuery(e.target.value)}
                />
              </div>
              {orders.length > 0 && !order && (
                <div className="mt-1 border border-border rounded-md max-h-40 overflow-auto">
                  {orders.map((o) => (
                    <button
                      key={o.id}
                      className="w-full text-left px-2 py-1.5 text-xs hover:bg-muted border-b border-border/40 last:border-0"
                      onClick={() => { setOrder(o); setOrders([]); setOrderQuery(""); }}
                    >
                      <p className="font-semibold">Pedido #{o.order_number} · {o.alumnos?.nombre} {o.alumnos?.apellido}</p>
                      <p className="text-muted-foreground">{new Date(o.created_at).toLocaleDateString("es-AR")} · {o.status}</p>
                    </button>
                  ))}
                </div>
              )}
              {order && (
                <div className="mt-2 rounded border border-border p-2 text-xs flex items-center justify-between">
                  <div>
                    <p className="font-semibold">Pedido #{order.order_number}</p>
                    <p className="text-muted-foreground">{order.alumnos?.nombre} {order.alumnos?.apellido}</p>
                  </div>
                  <button className="text-destructive text-[10px]" onClick={() => setOrder(null)}>quitar</button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Motivo</Label>
                <Select value={motivo} onValueChange={setMotivo}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MOTIVOS.map((m) => <SelectItem key={m.v} value={m.v}>{m.l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="text-xs">Comentario</Label>
              <Textarea value={comentario} onChange={(e) => setComentario(e.target.value)} rows={2} />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
              <Button onClick={() => setScanOpen(true)} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><ScanLine className="w-4 h-4 mr-1" /> Escanear y registrar</>}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ScanCambioDialog
        open={scanOpen}
        onOpenChange={setScanOpen}
        title="Escanear prenda recibida"
        onConfirm={handleConfirm}
      />
    </>
  );
};

export default RegistrarCambioPresencialDialog;
