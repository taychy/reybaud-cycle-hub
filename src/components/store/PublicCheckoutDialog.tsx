import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { formatPrice } from "@/lib/currency";
import { sortVariantSpecs } from "@/lib/variantSort";
import { Loader2, CreditCard, Banknote } from "lucide-react";
import { urgencyText } from "@/lib/campaigns";

interface Product {
  id: string;
  name: string;
  price: number;
  currency?: string | null;
  variants?: any;
  variant_stock?: any;
  stock?: number | null;
}

interface EffectivePrice {
  precio_lista: number;
  precio_efectivo: number;
  descuento_pct: number;
  badge_texto: string | null;
  mostrar_urgencia: boolean;
  fecha_fin: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  product: Product | null;
  initialVariant?: Record<string, string>;
}

const ENTREGAS = [
  { value: "clase_kdt", label: "Retiro en clase — KDT" },
  { value: "clase_parque", label: "Retiro en clase — Parque Sarmiento" },
  { value: "moto", label: "Envío en moto (costo extra a cotizar)" },
];

const PublicCheckoutDialog = ({ open, onOpenChange, product, initialVariant = {} }: Props) => {
  const { toast } = useToast();
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [telefono, setTelefono] = useState("");
  const [entrega, setEntrega] = useState("clase_kdt");
  const [direccion, setDireccion] = useState("");
  const [obs, setObs] = useState("");
  const [optIn, setOptIn] = useState(true);
  const [cantidad, setCantidad] = useState(1);
  const [variante, setVariante] = useState<Record<string, string>>(initialVariant);
  const [loading, setLoading] = useState(false);
  const [metodoPago, setMetodoPago] = useState<"mp" | "efectivo">("mp");
  const [cashOrder, setCashOrder] = useState<{ number: number | null } | null>(null);

  const [effectivePrice, setEffectivePrice] = useState<EffectivePrice | null>(null);
  const [priceLoading, setPriceLoading] = useState(false);
  const [priceError, setPriceError] = useState(false);

  useEffect(() => {
    if (open) setVariante(initialVariant);
  }, [open, product?.id, JSON.stringify(initialVariant)]);

  const specs: { name: string; options: string[] }[] = useMemo(() => {
    if (!product?.variants || !Array.isArray(product.variants)) return [];
    return sortVariantSpecs(
      product.variants.filter((v: any) => v?.name && Array.isArray(v?.options) && v.options.length > 0),
    );
  }, [product]);

  const variantSig = specs.map((s) => `${s.name}:${variante[s.name] || ""}`).join("|");
  const stockDisp = useMemo(() => {
    if (!product) return null;
    if (specs.length && variantSig && product.variant_stock) {
      const s = (product.variant_stock as Record<string, number>)[variantSig];
      return typeof s === "number" ? s : 0;
    }
    return typeof product.stock === "number" ? product.stock : null;
  }, [product, specs.length, variantSig]);

  /** Stock disponible por opción de cada variante (según variant_stock del conteo). */
  const optionStock = useMemo(() => {
    const map: Record<string, Record<string, number>> = {};
    const vs = (product?.variant_stock || null) as Record<string, number> | null;
    if (!vs || typeof vs !== "object") return null;
    for (const s of specs) {
      map[s.name] = {};
      for (const o of s.options) map[s.name][o] = 0;
    }
    for (const [sig, qty] of Object.entries(vs)) {
      const n = Number(qty) || 0;
      if (n <= 0) continue;
      for (const part of sig.split("|")) {
        const idx = part.indexOf(":");
        if (idx < 0) continue;
        const name = part.slice(0, idx);
        const val = part.slice(idx + 1);
        if (map[name] && val in map[name]) map[name][val] += n;
      }
    }
    return map;
  }, [product, specs]);

  useEffect(() => {
    if (!product || !open) return;
    let cancelled = false;
    setPriceLoading(true);
    setPriceError(false);
    setEffectivePrice(null);
    // El precio depende de la forma de pago: se recalcula con el mismo criterio que usa el backend.
    (supabase.rpc as any)("resolver_precio_tienda_por_pago", {
      p_product_id: product.id,
      p_variante: variante,
      p_metodo_pago: metodoPago,
    }).then(({ data, error }: any) => {
      if (cancelled) return;
      if (error) { setPriceError(true); setEffectivePrice(null); }
      else setEffectivePrice((data?.[0] as EffectivePrice) || null);
      setPriceLoading(false);
    }).catch(() => {
      if (cancelled) return;
      setPriceError(true);
      setEffectivePrice(null);
      setPriceLoading(false);
    });
    return () => { cancelled = true; };
  }, [open, product?.id, JSON.stringify(variante), metodoPago]);

  if (!product) return null;

  const moneda = product.currency || "ARS";
  const listPrice = Number(effectivePrice?.precio_lista ?? product.price);
  const unitPrice = Number(effectivePrice?.precio_efectivo ?? product.price);
  const total = unitPrice * cantidad;

  const submit = async () => {
    // Validación local para no depender del error genérico de la función
    const faltaVariante = specs.find((s) => !variante[s.name]);
    const local =
      faltaVariante ? `Elegí ${faltaVariante.name.toLowerCase()}`
      : nombre.trim().length < 3 ? "Ingresá tu nombre y apellido"
      : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? "Ingresá un email válido"
      : telefono.replace(/\D/g, "").length < 8 ? "Ingresá un WhatsApp válido"
      : entrega === "moto" && direccion.trim().length < 8 ? "Ingresá la dirección de envío"
      : null;
    if (local) {
      toast({ title: "Faltan datos", description: local, variant: "destructive" });
      return;
    }

    setLoading(true);
    const { data, error } = await supabase.functions.invoke("create-public-store-order", {
      body: {
        product_id: product.id,
        cantidad,
        variante,
        nombre,
        email,
        telefono,
        entrega_metodo: entrega,
        envio_direccion: direccion,
        observaciones: obs,
        opt_in_marketing: optIn,
        metodo_pago: metodoPago,
      },
    });
    let err = (data as any)?.error as string | undefined;
    if (!err && error) {
      // La función devuelve el detalle en el body aunque el status sea 4xx/5xx
      try {
        const body = await (error as any)?.context?.json?.();
        err = body?.error;
      } catch { /* sin body legible */ }
      err = err || error.message;
    }
    if (err || (metodoPago === "mp" && !(data as any)?.init_point) || (metodoPago === "efectivo" && !(data as any)?.order_id)) {
      setLoading(false);
      toast({ title: "No pudimos completar la compra", description: err || "Intentá de nuevo.", variant: "destructive" });
      return;
    }
    if (metodoPago === "efectivo") {
      setLoading(false);
      setCashOrder({ number: (data as any).order_number ?? null });
      return;
    }
    window.location.href = (data as any).init_point;
  };

  if (cashOrder) {
    return (
      <Dialog open={open} onOpenChange={(v) => { if (!v) { setCashOrder(null); onOpenChange(false); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">¡Pedido reservado!</DialogTitle>
            <DialogDescription>Lo pagás en efectivo, no hace falta pagar ahora.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            {cashOrder.number != null && (
              <div className="rounded-lg border border-primary/30 bg-primary/10 p-4 text-center">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">N° de pedido</p>
                <p className="text-3xl font-heading font-bold text-primary">#{cashOrder.number}</p>
              </div>
            )}
            <p className="text-sm text-muted-foreground">
              {entrega === "moto"
                ? "Te contactamos por WhatsApp para coordinar la entrega. Pagás en efectivo al recibirlo y ahí queda confirmada la compra."
                : "Mostrá este número al retirar tu pedido. Pagás en efectivo en ese momento y ahí queda confirmada la compra."}
            </p>
            <Button className="w-full" onClick={() => { setCashOrder(null); onOpenChange(false); }}>Listo</Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>

      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading">Comprar {product.name}</DialogTitle>
          <DialogDescription>Completá tus datos y elegí cómo pagar.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          {specs.map((s) => {
            const opts = optionStock
              ? s.options.filter((o) => (optionStock[s.name]?.[o] ?? 0) > 0)
              : s.options;
            return (
              <div key={s.name} className="space-y-1">
                <Label className="text-xs">{s.name}</Label>
                <Select value={variante[s.name] || ""} onValueChange={(v) => setVariante((p) => ({ ...p, [s.name]: v }))}>
                  <SelectTrigger><SelectValue placeholder={`Elegí ${s.name.toLowerCase()}`} /></SelectTrigger>
                  <SelectContent>
                    {opts.map((o) => (
                      <SelectItem key={o} value={o}>
                        {o}{optionStock ? ` · ${optionStock[s.name][o]}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {opts.length === 0 && (
                  <p className="text-[11px] text-destructive">Sin stock disponible.</p>
                )}
              </div>
            );
          })}

          <div className="space-y-1">
            <Label className="text-xs">Cantidad</Label>
            <Input
              type="number"
              min={1}
              max={stockDisp ?? undefined}
              value={cantidad}
              onChange={(e) => {
                const n = Math.max(1, Number(e.target.value) || 1);
                setCantidad(stockDisp != null && stockDisp > 0 ? Math.min(n, stockDisp) : n);
              }}
            />
            {stockDisp != null && (
              <p className={`text-[11px] ${stockDisp <= 0 ? "text-destructive" : "text-muted-foreground"}`}>
                {stockDisp <= 0 ? "Sin stock en este talle" : `${stockDisp} disponibles`}
              </p>
            )}
          </div>


          <div className="space-y-1">
            <Label className="text-xs">Nombre y apellido</Label>
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Juan Pérez" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="juan@mail.com" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">WhatsApp</Label>
              <Input value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="351 555 5555" />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">¿Cómo querés recibirlo?</Label>
            <Select value={entrega} onValueChange={setEntrega}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ENTREGAS.map((e) => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {entrega === "moto" && (
            <div className="space-y-1">
              <Label className="text-xs">Dirección de envío</Label>
              <Input value={direccion} onChange={(e) => setDireccion(e.target.value)} placeholder="Calle 123, Barrio, Ciudad" />
              <p className="text-[11px] text-muted-foreground">El costo del envío se cotiza aparte y se coordina por WhatsApp.</p>
            </div>
          )}

          <div className="space-y-1">
            <Label className="text-xs">Observaciones (opcional)</Label>
            <Textarea rows={2} value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ej: prefiero retirarlo los martes" />
          </div>

          <label className="flex items-start gap-2 text-xs text-muted-foreground">
            <Checkbox checked={optIn} onCheckedChange={(v) => setOptIn(!!v)} className="mt-0.5" />
            Quiero recibir novedades y ofertas de la tienda.
          </label>

          <div className="rounded-lg border border-border bg-secondary/40 p-3 space-y-1">
            {unitPrice < listPrice && <div className="flex items-center justify-between text-xs text-muted-foreground"><span>Precio de lista</span><span className="line-through">{formatPrice(listPrice, moneda)}</span></div>}
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Total{effectivePrice?.descuento_pct ? ` · -${effectivePrice.descuento_pct}%` : ""}</span>
              <span className="text-lg font-heading font-bold text-primary">{formatPrice(total, moneda)}</span>
            </div>
            {unitPrice < listPrice && (
              <p className="text-[11px] text-muted-foreground">
                Precio con {metodoPago === "efectivo" ? "pago en efectivo" : "Mercado Pago"}.
              </p>
            )}
            {priceLoading && <p className="text-[11px] text-muted-foreground">Actualizando precio...</p>}
            {!priceLoading && priceError && <p className="text-[11px] text-destructive">No pudimos calcular el precio. Probá de nuevo.</p>}
            {effectivePrice?.badge_texto && <p className="text-[11px] text-primary">{effectivePrice.badge_texto}</p>}
            {effectivePrice?.mostrar_urgencia && urgencyText(effectivePrice.fecha_fin) && <p className="text-[11px] text-primary">{urgencyText(effectivePrice.fecha_fin)}</p>}
          </div>

          {moneda !== "ARS" && metodoPago === "mp" && (
            <p className="text-[11px] text-muted-foreground -mt-1">
              El pago se cobra en pesos argentinos, convertido al tipo de cambio vigente de la tienda.
            </p>
          )}

          <div className="space-y-1">
            <Label className="text-xs">Forma de pago</Label>
            <div className="grid grid-cols-2 gap-2">
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
                <Banknote className="w-3.5 h-3.5" /> Efectivo
              </button>
            </div>
            {metodoPago === "efectivo" && (
              <p className="text-[11px] text-muted-foreground">
                {entrega === "moto"
                  ? "Tu pedido queda reservado y lo pagás en efectivo al recibirlo. La compra se confirma cuando registramos el pago."
                  : "Tu pedido queda reservado y lo pagás en efectivo al retirarlo. La compra se confirma cuando registramos el pago."}
              </p>
            )}
          </div>

          <Button className="w-full" disabled={loading || priceLoading || priceError || (stockDisp != null && stockDisp <= 0)} onClick={submit}>
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : metodoPago === "efectivo" ? <Banknote className="w-4 h-4 mr-2" /> : <CreditCard className="w-4 h-4 mr-2" />}
            {metodoPago === "efectivo" ? "Reservar y pagar en efectivo" : "Pagar con Mercado Pago"}
          </Button>

        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PublicCheckoutDialog;
