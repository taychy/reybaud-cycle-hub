import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { CreditCard, AlertCircle, Banknote } from "lucide-react";
import { formatPrice } from "@/lib/currency";

interface Product {
  id: string;
  name: string;
  price: number;
  currency?: string | null;
  image_url: string | null;
  variants?: any;
  variant_stock?: any;
  stock?: number | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  product: Product | null;
  alumnoId: string | null;
  customerName?: string;
  customerEmail?: string;
}

const BuyProductDialog = ({ open, onOpenChange, product, alumnoId, customerName, customerEmail }: Props) => {
  const { toast } = useToast();
  const [cantidad, setCantidad] = useState(1);
  const [variante, setVariante] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const moneda = product?.currency || "ARS";

  const variantSpecs: { name: string; options: string[] }[] = useMemo(() => {
    if (!product?.variants || !Array.isArray(product.variants)) return [];
    return product.variants.filter((v: any) => v?.name && Array.isArray(v?.options) && v.options.length > 0);
  }, [product]);

  const variantSig = useMemo(() => {
    if (!variantSpecs.length) return "";
    return variantSpecs.map((s) => `${s.name}:${variante[s.name] || ""}`).join("|");
  }, [variantSpecs, variante]);

  const stockDisp: number | null = useMemo(() => {
    if (!product) return null;
    if (variantSpecs.length && variantSig && product.variant_stock) {
      const s = (product.variant_stock as Record<string, number>)[variantSig];
      return typeof s === "number" ? s : 0;
    }
    return typeof product.stock === "number" ? product.stock : null;
  }, [product, variantSpecs, variantSig]);

  useEffect(() => {
    if (!open) return;
    setCantidad(1);
    setVariante({});
  }, [open]);

  if (!product) return null;

  const total = Number(product.price) * cantidad;
  const variantesElegidas = variantSpecs.every((s) => variante[s.name]);
  const stockOk = stockDisp == null || stockDisp >= cantidad;

  const handleBuy = async () => {
    if (!alumnoId) {
      toast({ title: "Iniciá sesión", description: "Necesitás estar logueado.", variant: "destructive" });
      return;
    }
    if (variantSpecs.length && !variantesElegidas) {
      toast({ title: "Falta elegir variante", variant: "destructive" });
      return;
    }
    if (!stockOk) {
      toast({ title: "Sin stock suficiente", description: `Quedan ${stockDisp} unidades.`, variant: "destructive" });
      return;
    }

    setLoading(true);
    const { data: order, error } = await supabase
      .from("store_orders")
      .insert({
        alumno_id: alumnoId,
        customer_name: customerName || "Alumno",
        customer_email: customerEmail || null,
        total,
        currency: moneda,
        status: "pendiente_pago",
      } as any)
      .select("id")
      .single();

    if (error || !order) {
      setLoading(false);
      toast({ title: "Error", description: error?.message || "No se pudo crear el pedido", variant: "destructive" });
      return;
    }

    const { error: itemErr } = await supabase.from("store_order_items").insert({
      order_id: order.id,
      product_id: product.id,
      product_name: product.name,
      quantity: cantidad,
      unit_price: product.price,
      variant_selection: variante,
    } as any);

    if (itemErr) {
      setLoading(false);
      toast({ title: "Error", description: itemErr.message, variant: "destructive" });
      return;
    }

    try {
      const { data: pref, error: prefErr } = await supabase.functions.invoke("create-store-order-mp-preference", {
        body: { order_id: order.id },
      });
      if (prefErr) throw prefErr;
      const url = (pref as any)?.init_point || (pref as any)?.sandbox_init_point;
      if (url) {
        window.location.href = url;
        return;
      }
      throw new Error("No se recibió URL de pago");
    } catch (e: any) {
      setLoading(false);
      toast({ title: "Pedido creado", description: `Falló iniciar MP: ${e.message || ""}`, variant: "destructive" });
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading">{product.name}</DialogTitle>
          <DialogDescription>Comprar dentro de la app</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {variantSpecs.length > 0 ? (
            variantSpecs.map((spec) => (
              <div key={spec.name}>
                <label className="text-xs font-heading uppercase text-muted-foreground">{spec.name}</label>
                <Select value={variante[spec.name] || ""} onValueChange={(v) => setVariante((p) => ({ ...p, [spec.name]: v }))}>
                  <SelectTrigger><SelectValue placeholder={`Elegí ${spec.name}`} /></SelectTrigger>
                  <SelectContent>
                    {spec.options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ))
          ) : (
            <p className="text-[11px] text-muted-foreground italic">Producto sin variantes.</p>
          )}

          <div>
            <label className="text-xs font-heading uppercase text-muted-foreground">Cantidad</label>
            <Input type="number" min={1} value={cantidad} onChange={(e) => setCantidad(Math.max(1, Number(e.target.value)))} />
            {stockDisp != null && (
              <p className="text-[11px] text-muted-foreground mt-1">Stock disponible: <b>{stockDisp}</b></p>
            )}
          </div>

          <div className="rounded-lg border border-border p-3 space-y-1 text-sm">
            <div className="flex justify-between text-muted-foreground"><span>Precio unitario</span><span>{formatPrice(product.price, moneda)}</span></div>
            <div className="flex justify-between font-heading text-primary"><span>Total</span><span>{formatPrice(total, moneda)}</span></div>
          </div>

          {!stockOk && (
            <div className="flex items-center gap-1 text-[11px] text-destructive">
              <AlertCircle className="w-3 h-3" />
              Stock insuficiente para esta variante.
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={handleBuy} disabled={loading || !stockOk}>
              <CreditCard className="w-4 h-4 mr-1" />
              {loading ? "Procesando..." : "Pagar con Mercado Pago"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default BuyProductDialog;
