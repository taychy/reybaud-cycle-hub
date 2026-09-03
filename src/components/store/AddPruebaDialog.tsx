import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Search } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  orderId?: string | null;
  alumnoId?: string | null;
  onCreated?: () => void;
}

interface Producto {
  id: string;
  name: string;
  variants?: any;
  variant_stock?: any;
  stock?: number | null;
}

const AddPruebaDialog = ({ open, onOpenChange, orderId, alumnoId, onCreated }: Props) => {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [query, setQuery] = useState("");
  const [productoId, setProductoId] = useState("");
  const [variante, setVariante] = useState<Record<string, string>>({});
  const [comentario, setComentario] = useState("");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  /** Clave estable por intento: si el request se reintenta, el backend no descuenta stock dos veces. */
  const idemKey = useRef<string>("");

  useEffect(() => {
    if (!open) return;
    setQuery(""); setProductoId(""); setVariante({}); setComentario("");
    idemKey.current = crypto.randomUUID();
    supabase
      .from("store_products")
      .select("id, name, variants, variant_stock, stock")
      .eq("status", "active")
      .order("name")
      .then(({ data }) => setProductos((data as any[]) || []));
  }, [open]);

  const filtrados = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q ? productos.filter((p) => p.name.toLowerCase().includes(q)) : productos;
    return base.slice(0, 50);
  }, [productos, query]);

  const producto = productos.find((p) => p.id === productoId) || null;

  const specs: { name: string; options: string[] }[] = useMemo(() => {
    const v = producto?.variants;
    if (!Array.isArray(v)) return [];
    return v
      .filter((s: any) => s?.name && Array.isArray(s?.options) && s.options.length)
      .map((s: any) => ({ name: String(s.name), options: s.options.map((o: any) => String(o)) }));
  }, [producto]);

  const faltanVariantes = specs.some((s) => !variante[s.name]);

  const submit = async () => {
    if (!productoId) {
      toast({ title: "Elegí el producto", variant: "destructive" });
      return;
    }
    if (faltanVariantes) {
      toast({ title: "Completá talle/color", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await supabase.rpc("crear_prenda_prueba" as any, {
      p_producto_id: productoId,
      p_variante: variante,
      p_order_id: orderId || null,
      p_alumno_id: alumnoId || null,
      p_comentario: comentario || null,
      p_metodo: "manual",
      p_idempotency_key: idemKey.current,
    });
    setSaving(false);
    if (error) {
      toast({ title: "No se pudo registrar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Prenda enviada a prueba", description: "Salió del stock. No es una venta." });
    onOpenChange(false);
    onCreated?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Agregar prenda de prueba</DialogTitle>
          <DialogDescription className="text-xs">
            La prenda sale del stock pero no se cobra ni suma al total del pedido. Después podés recibir la devolución
            o convertirla en venta.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-xs">Producto</Label>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input className="pl-7" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar producto" />
            </div>
            <Select value={productoId} onValueChange={(v) => { setProductoId(v); setVariante({}); }}>
              <SelectTrigger className="mt-2"><SelectValue placeholder="Elegí producto" /></SelectTrigger>
              <SelectContent>
                {filtrados.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {specs.map((s) => (
            <div key={s.name}>
              <Label className="text-xs">{s.name}</Label>
              <Select
                value={variante[s.name] || ""}
                onValueChange={(v) => setVariante((prev) => ({ ...prev, [s.name]: v }))}
              >
                <SelectTrigger><SelectValue placeholder={`Elegí ${s.name.toLowerCase()}`} /></SelectTrigger>
                <SelectContent>
                  {s.options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          ))}

          <div>
            <Label className="text-xs">Nota (opcional)</Label>
            <Textarea rows={2} value={comentario} onChange={(e) => setComentario(e.target.value)} placeholder="Ej: le mando un talle más para probar." />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={saving || !productoId}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Enviar a prueba"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AddPruebaDialog;
