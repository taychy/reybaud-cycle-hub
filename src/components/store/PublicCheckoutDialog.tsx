import { useMemo, useState } from "react";
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
import { Loader2, CreditCard } from "lucide-react";

interface Product {
  id: string;
  name: string;
  price: number;
  currency?: string | null;
  variants?: any;
  variant_stock?: any;
  stock?: number | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  product: Product | null;
}

const ENTREGAS = [
  { value: "clase_kdt", label: "Retiro en clase — KDT" },
  { value: "clase_parque", label: "Retiro en clase — Parque Sarmiento" },
  { value: "moto", label: "Envío en moto (costo extra a cotizar)" },
];

const PublicCheckoutDialog = ({ open, onOpenChange, product }: Props) => {
  const { toast } = useToast();
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [telefono, setTelefono] = useState("");
  const [entrega, setEntrega] = useState("clase_kdt");
  const [direccion, setDireccion] = useState("");
  const [obs, setObs] = useState("");
  const [optIn, setOptIn] = useState(true);
  const [cantidad, setCantidad] = useState(1);
  const [variante, setVariante] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

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


  if (!product) return null;

  const moneda = product.currency || "ARS";
  const total = Number(product.price) * cantidad;

  const submit = async () => {
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
      },
    });
    const err = (data as any)?.error || error?.message;
    if (err || !(data as any)?.init_point) {
      setLoading(false);
      toast({ title: "No pudimos completar la compra", description: err || "Intentá de nuevo.", variant: "destructive" });
      return;
    }
    window.location.href = (data as any).init_point;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading">Comprar {product.name}</DialogTitle>
          <DialogDescription>Completá tus datos y pagá con Mercado Pago.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          {specs.map((s) => (
            <div key={s.name} className="space-y-1">
              <Label className="text-xs">{s.name}</Label>
              <Select value={variante[s.name] || ""} onValueChange={(v) => setVariante((p) => ({ ...p, [s.name]: v }))}>
                <SelectTrigger><SelectValue placeholder={`Elegí ${s.name.toLowerCase()}`} /></SelectTrigger>
                <SelectContent>
                  {s.options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          ))}

          <div className="space-y-1">
            <Label className="text-xs">Cantidad</Label>
            <Input type="number" min={1} value={cantidad} onChange={(e) => setCantidad(Math.max(1, Number(e.target.value) || 1))} />
            {stockDisp != null && <p className="text-[11px] text-muted-foreground">{stockDisp} disponibles</p>}
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

          <div className="rounded-lg border border-border bg-secondary/40 p-3 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Total</span>
            <span className="text-lg font-heading font-bold">{formatPrice(total, moneda)}</span>
          </div>

          <Button className="w-full" disabled={loading} onClick={submit}>
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CreditCard className="w-4 h-4 mr-2" />}
            Pagar con Mercado Pago
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PublicCheckoutDialog;
