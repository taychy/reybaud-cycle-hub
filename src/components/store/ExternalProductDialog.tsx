import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Download, PackageSearch } from "lucide-react";
import { formatPrice } from "@/lib/currency";

interface ScrapedVariant {
  sku: string | null;
  options: string[];
  stock: number;
  available: boolean;
  price: number | null;
}

interface Scraped {
  source_url: string;
  name: string;
  description: string | null;
  image_url: string | null;
  brand: string | null;
  sku: string | null;
  precio_oficial: number;
  currency: string;
  variants: { name: string; values: string[] }[];
  supplier_variants: ScrapedVariant[];
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  categories: { id: string; name: string }[];
  onSaved: () => void;
}

const variantKey = (opts: string[], names: { name: string }[]) =>
  opts.map((v, i) => `${names[i]?.name || `Opción ${i + 1}`}:${v}`).join("|");

const ExternalProductDialog = ({ open, onOpenChange, categories, onSaved }: Props) => {
  const { toast } = useToast();
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<Scraped | null>(null);
  const [descuento, setDescuento] = useState(15);
  const [categoryId, setCategoryId] = useState<string>("");
  const [dias, setDias] = useState(7);
  const [promo, setPromo] = useState(true);
  const [proveedor, setProveedor] = useState("Santini");

  const reset = () => {
    setUrl(""); setData(null); setDescuento(15); setCategoryId(""); setDias(7); setPromo(true); setProveedor("Santini");
  };

  const precioFinal = data ? Math.round((data.precio_oficial * (100 - descuento)) / 100) : 0;

  const fetchData = async () => {
    if (!url.trim()) return;
    setLoading(true);
    const { data: res, error } = await supabase.functions.invoke("scrape-external-product", {
      body: { url: url.trim() },
    });
    setLoading(false);
    if (error || (res as any)?.error) {
      toast({
        title: "No pudimos leer el producto",
        description: (res as any)?.error || error?.message || "Revisá el link e intentá de nuevo.",
        variant: "destructive",
      });
      return;
    }
    const d = res as Scraped;
    setData(d);
    if (d.brand) setProveedor(d.brand);
  };

  const save = async () => {
    if (!data) return;
    setSaving(true);
    const variant_stock: Record<string, number> = {};
    data.supplier_variants.forEach((v) => {
      if (!v.options.length) return;
      variant_stock[variantKey(v.options, data.variants)] = v.available ? v.stock : 0;
    });
    const totalStock = Object.values(variant_stock).reduce((a, b) => a + b, 0);

    const payload: any = {
      name: data.name,
      description: data.description,
      image_url: data.image_url,
      category_id: categoryId || null,
      price: precioFinal,
      old_price: data.precio_oficial,
      discount: descuento,
      currency: data.currency || "ARS",
      stock: Object.keys(variant_stock).length ? totalStock : 0,
      min_stock: 0,
      status: "active",
      tag: "OFERTA",
      variants: data.variants,
      variant_stock,
      sku_base: data.sku,
      es_externo: true,
      proveedor: proveedor || null,
      source_url: data.source_url,
      precio_oficial: data.precio_oficial,
      descuento_pct: descuento,
      entrega_estimada_dias: dias,
      promo_activa: promo,
      checkout_mode: "in_app",
      delivery_methods: ["retiro_sede"],
    };

    // Vincular (o crear) el proveedor para poder avisarle las ventas por email
    let supplierId: string | null = null;
    if (proveedor.trim()) {
      const { data: found } = await supabase
        .from("store_suppliers")
        .select("id")
        .ilike("nombre", proveedor.trim())
        .maybeSingle();
      if (found) supplierId = (found as any).id;
      else {
        const { data: created } = await supabase
          .from("store_suppliers")
          .insert({ nombre: proveedor.trim() })
          .select("id")
          .maybeSingle();
        supplierId = (created as any)?.id || null;
      }
    }

    const { error } = await supabase.from("store_products").insert({ ...payload, supplier_id: supplierId });
    setSaving(false);
    if (error) {
      toast({ title: "Error al guardar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Producto externo creado", description: `${data.name} — ${formatPrice(precioFinal, data.currency)}` });
    reset();
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackageSearch className="w-5 h-5 text-primary" /> Producto externo (a pedido)
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
            Sin stock propio: se vende con pago total por adelantado y se retira en el depósito del proveedor para entregar.
          </div>

          <div className="space-y-1.5">
            <Label>Link del producto en la tienda oficial</Label>
            <div className="flex gap-2">
              <Input
                placeholder="https://santinicycling.com.ar/productos/..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") fetchData(); }}
              />
              <Button onClick={fetchData} disabled={loading || !url.trim()}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                <span className="ml-1 hidden sm:inline">Traer datos</span>
              </Button>
            </div>
          </div>

          {data && (
            <>
              <div className="flex gap-3 rounded-xl border border-border bg-card p-3">
                <div className="w-24 h-24 rounded bg-secondary overflow-hidden shrink-0">
                  {data.image_url && <img src={data.image_url} alt={data.name} className="w-full h-full object-cover" />}
                </div>
                <div className="min-w-0 space-y-1">
                  <p className="font-heading font-bold text-foreground">{data.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {data.brand || "—"} {data.sku ? `· SKU ${data.sku}` : ""}
                  </p>
                  <p className="text-sm">
                    <span className="text-muted-foreground line-through mr-2">{formatPrice(data.precio_oficial, data.currency)}</span>
                    <span className="font-heading font-bold text-primary text-lg">{formatPrice(precioFinal, data.currency)}</span>
                  </p>
                  {data.description && <p className="text-xs text-muted-foreground line-clamp-2">{data.description}</p>}
                </div>
              </div>

              {data.supplier_variants.length > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase text-muted-foreground">Disponible en el proveedor</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {data.supplier_variants.map((v, i) => (
                      <span
                        key={i}
                        className={`text-[11px] px-2 py-1 rounded border ${v.available && v.stock > 0 ? "border-border bg-secondary" : "border-border bg-muted text-muted-foreground line-through"}`}
                      >
                        {v.options.join(" · ")}{v.stock > 0 ? ` · ${v.stock}` : ""}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Descuento sobre precio oficial (%)</Label>
                  <Input type="number" min={0} max={90} value={descuento} onChange={(e) => setDescuento(Number(e.target.value) || 0)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Proveedor</Label>
                  <Input value={proveedor} onChange={(e) => setProveedor(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Categoría</Label>
                  <Select value={categoryId} onValueChange={setCategoryId}>
                    <SelectTrigger><SelectValue placeholder="Sin categoría" /></SelectTrigger>
                    <SelectContent>
                      {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Entrega estimada (días)</Label>
                  <Input type="number" min={1} value={dias} onChange={(e) => setDias(Number(e.target.value) || 1)} />
                </div>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <div>
                  <p className="text-sm font-medium">Mostrar en promociones de email</p>
                  <p className="text-xs text-muted-foreground">Queda disponible para adherir al pie de los mails masivos.</p>
                </div>
                <Switch checked={promo} onCheckedChange={setPromo} />
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
                <Button onClick={save} disabled={saving}>
                  {saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Crear producto
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ExternalProductDialog;
