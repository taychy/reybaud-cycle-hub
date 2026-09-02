import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { CreditCard, AlertCircle, Banknote } from "lucide-react";
import { formatPrice } from "@/lib/currency";
import { sortVariantSpecs } from "@/lib/variantSort";
import { urgencyText } from "@/lib/campaigns";

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
  const [metodoPago, setMetodoPago] = useState<"mp" | "efectivo">("mp");

  const moneda = product?.currency || "ARS";

  const variantSpecs: { name: string; options: string[] }[] = useMemo(() => {
    if (!product?.variants || !Array.isArray(product.variants)) return [];
    return sortVariantSpecs(
      product.variants.filter((v: any) => v?.name && Array.isArray(v?.options) && v.options.length > 0)
    );
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

  const [successOrder, setSuccessOrder] = useState<{ number: number | null; metodo: "mp" | "efectivo" } | null>(null);
  const [effectivePrice, setEffectivePrice] = useState<any>(null);
  const [priceLoading, setPriceLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCantidad(1);
    setVariante({});
    setMetodoPago("mp");
    setSuccessOrder(null);
  }, [open]);

  useEffect(() => {
    if (!product || !open) return;
    let cancelled = false;
    setPriceLoading(true);
    setEffectivePrice(null);
    supabase.rpc("resolver_precio_tienda", {
      p_product_id: product.id,
      p_variante: variante,
    }).then(({ data }) => {
      if (!cancelled) setEffectivePrice(data?.[0] || null);
    }).finally(() => {
      if (!cancelled) setPriceLoading(false);
    });
    return () => { cancelled = true; };
  }, [open, product?.id, JSON.stringify(variante)]);

  if (!product) return null;

  const unitPrice = Number(effectivePrice?.precio_efectivo ?? product.price);
  const listPrice = Number(effectivePrice?.precio_lista ?? product.price);
  const total = unitPrice * cantidad;
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

    // Anti-duplicado: pedidos pendientes del mismo alumno+producto+variante en las últimas 24hs
    try {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const targetStatus = metodoPago === "efectivo" ? "pendiente_pago_efectivo" : "pendiente_pago";
      const { data: prev } = await supabase
        .from("store_orders")
        .select("id, order_number, store_order_items!inner(product_id, variant_selection)")
        .eq("alumno_id", alumnoId)
        .eq("status", targetStatus)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(20);
      const dup = (prev || []).find((o: any) =>
        o.store_order_items?.some((it: any) =>
          it.product_id === product.id &&
          JSON.stringify(it.variant_selection || {}) === JSON.stringify(variante || {})
        )
      );
      if (dup) {
        setLoading(false);
        const ok = window.confirm(
          `Ya tenés un pedido pendiente de este producto (#${(dup as any).order_number}). ¿Querés crear otro igual de todas formas?`
        );
        if (!ok) {
          onOpenChange(false);
          return;
        }
        setLoading(true);
      }
    } catch (e) {
      // si falla el chequeo, seguimos (no bloqueamos la venta)
      console.warn("[BuyProductDialog] dup-check failed", e);
    }

    const { data: orderRows, error } = await supabase.rpc("crear_pedido_tienda_alumno", {
      p_alumno_id: alumnoId,
      p_product_id: product.id,
      p_cantidad: cantidad,
      p_variante: variante,
      p_metodo: metodoPago,
      p_customer_name: customerName || "Alumno",
      p_customer_email: customerEmail || null,
    });
    const order = orderRows?.[0];

    if (error || !order) {
      setLoading(false);
      toast({ title: "No se pudo crear el pedido", description: error?.message || "El precio o stock cambiaron. Intentá de nuevo.", variant: "destructive" });
      return;
    }

    if (metodoPago === "efectivo") {
      setLoading(false);
      setSuccessOrder({ number: (order as any).order_number ?? null, metodo: "efectivo" });
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

  if (successOrder) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">¡Pedido reservado!</DialogTitle>
            <DialogDescription>Tu reserva quedó registrada correctamente.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {successOrder.number != null && (
              <div className="rounded-lg border border-primary/30 bg-primary/10 p-4 text-center">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">N° de pedido</p>
                <p className="text-3xl font-heading font-bold text-primary">#{successOrder.number}</p>
              </div>
            )}
            <p className="text-sm text-muted-foreground">
              {successOrder.metodo === "efectivo"
                ? "Vas a pagar en efectivo al retirar en sede. Mostrá este número al personal."
                : "Tu pedido quedó pendiente de pago."}
            </p>
            <Button className="w-full" onClick={() => onOpenChange(false)}>Listo</Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

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
            {unitPrice < listPrice && <div className="flex justify-between text-muted-foreground"><span>Precio de lista</span><span className="line-through">{formatPrice(listPrice, moneda)}</span></div>}
            <div className="flex justify-between text-muted-foreground"><span>Precio unitario</span><span>{formatPrice(unitPrice, moneda)}</span></div>
            {effectivePrice?.descuento_pct > 0 && <div className="text-[11px] text-primary">-{effectivePrice.descuento_pct}%{effectivePrice.badge_texto ? ` · ${effectivePrice.badge_texto}` : ""}</div>}
            {effectivePrice?.mostrar_urgencia && <div className="text-[11px] text-primary">{urgencyText(effectivePrice.fecha_fin)}</div>}
            {priceLoading && <div className="text-[11px] text-muted-foreground">Actualizando precio...</div>}
            <div className="flex justify-between font-heading text-primary"><span>Total</span><span>{formatPrice(total, moneda)}</span></div>
          </div>

          <div>
            <label className="text-xs font-heading uppercase text-muted-foreground">Forma de pago</label>
            <div className="grid grid-cols-2 gap-2 mt-1">
              <button
                type="button"
                onClick={() => setMetodoPago("mp")}
                className={`flex items-center gap-2 rounded-lg border p-2 text-xs ${metodoPago === "mp" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted/40"}`}
              >
                <CreditCard className="w-3.5 h-3.5" /> Mercado Pago
              </button>
              <button
                type="button"
                onClick={() => setMetodoPago("efectivo")}
                className={`flex items-center gap-2 rounded-lg border p-2 text-xs ${metodoPago === "efectivo" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted/40"}`}
              >
                <Banknote className="w-3.5 h-3.5" /> Efectivo al retirar
              </button>
            </div>
            {metodoPago === "efectivo" && (
              <p className="text-[11px] text-muted-foreground mt-1">
                Reservamos el producto. Lo pagás al retirarlo en sede.
              </p>
            )}
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
              {metodoPago === "efectivo" ? <Banknote className="w-4 h-4 mr-1" /> : <CreditCard className="w-4 h-4 mr-1" />}
              {loading ? "Procesando..." : metodoPago === "efectivo" ? "Reservar para pago en efectivo" : "Pagar con Mercado Pago"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default BuyProductDialog;
