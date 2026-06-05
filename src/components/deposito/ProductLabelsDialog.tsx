import { useEffect, useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tag, Printer } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { buildCombos } from "@/components/store/VariantStockEditor";
import {
  buildSku,
  printProductLabels,
  type LabelLayout,
  type ProductLabelItem,
} from "@/lib/productLabels";

interface VariantSpec { name: string; options: string[] }

interface Product {
  id: string;
  name: string;
  price: number;
  currency?: string | null;
  sku_base?: string | null;
  variants: VariantSpec[] | null;
  variant_stock: Record<string, number> | null;
}

interface Props {
  open: boolean;
  product: Product | null;
  onOpenChange: (open: boolean) => void;
}

type Mode = "all" | "single";

const ProductLabelsDialog = ({ open, product, onOpenChange }: Props) => {
  const [layout, setLayout] = useState<LabelLayout>("8");
  const [mode, setMode] = useState<Mode>("all");
  const [variantSel, setVariantSel] = useState<Record<string, string>>({});
  const [copies, setCopies] = useState<string>("1");
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    if (open) {
      setMode("all");
      setVariantSel({});
      setCopies("1");
    }
  }, [open, product?.id]);

  const specs: VariantSpec[] = useMemo(() => {
    if (!Array.isArray(product?.variants)) return [];
    return (product!.variants as VariantSpec[]).filter(
      (v) => v?.name && Array.isArray(v?.options) && v.options.length > 0,
    );
  }, [product]);

  const hasVariants = specs.length > 0;
  const combos = useMemo(() => (hasVariants ? buildCombos(specs) : []), [hasVariants, specs]);

  const singleKey = hasVariants
    ? specs.every((s) => variantSel[s.name])
      ? specs.map((s) => `${s.name}:${variantSel[s.name]}`).join("|")
      : ""
    : "";

  if (!product) return null;

  const previewSkuAll = !hasVariants ? buildSku(product.sku_base || null, null) : null;
  const previewSkuSingle = singleKey ? buildSku(product.sku_base || null, singleKey) : null;

  const buildItems = (): ProductLabelItem[] => {
    const base: Omit<ProductLabelItem, "variant_key"> = {
      product_id: product.id,
      product_name: product.name,
      sku_base: product.sku_base || null,
      price: Number(product.price) || 0,
      currency: product.currency || "ARS",
    };
    if (mode === "all") {
      if (!hasVariants) return [{ ...base, variant_key: null }];
      return combos.map((vk) => ({ ...base, variant_key: vk }));
    }
    // single
    const n = Math.max(1, parseInt(copies || "1", 10) || 1);
    const key = hasVariants ? singleKey : null;
    return Array.from({ length: n }, () => ({ ...base, variant_key: key }));
  };

  const handlePrint = async () => {
    if (mode === "single" && hasVariants && !singleKey) {
      toast({ title: "Elegí la variante", variant: "destructive" });
      return;
    }
    const items = buildItems();
    if (!items.length) {
      toast({ title: "No hay etiquetas para imprimir", variant: "destructive" });
      return;
    }
    setPrinting(true);
    try {
      await printProductLabels(items, {
        layout,
        filename: `etiquetas-${product.name.toLowerCase().replace(/\s+/g, "-").slice(0, 30)}.pdf`,
      });
      toast({ title: `${items.length} etiqueta(s) generadas` });
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setPrinting(false);
    }
  };

  const totalCount =
    mode === "all"
      ? (hasVariants ? combos.length : 1)
      : Math.max(1, parseInt(copies || "1", 10) || 1);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tag className="w-4 h-4" /> Etiquetas de producto
          </DialogTitle>
          <DialogDescription>
            {product.name}
            {product.sku_base && (
              <span className="ml-2 font-mono text-xs">· SKU base {product.sku_base}</span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Layout */}
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              Formato A4
            </Label>
            <Select value={layout} onValueChange={(v) => setLayout(v as LabelLayout)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="4">4 por hoja — Grandes (95×140mm)</SelectItem>
                <SelectItem value="8">8 por hoja — Medianas (95×67mm)</SelectItem>
                <SelectItem value="21">21 por hoja — Chicas Avery L7160 (63×40mm)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Mode */}
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              ¿Qué imprimir?
            </Label>
            <RadioGroup value={mode} onValueChange={(v) => setMode(v as Mode)}>
              <div className="flex items-start gap-2 rounded-lg border border-border p-3">
                <RadioGroupItem value="all" id="lbl-all" className="mt-0.5" />
                <Label htmlFor="lbl-all" className="cursor-pointer flex-1">
                  <div className="font-medium">
                    {hasVariants
                      ? `Todas las combinaciones (${combos.length})`
                      : "1 etiqueta del producto"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {hasVariants
                      ? "Una etiqueta por cada variante distinta."
                      : "Producto sin variantes."}
                  </div>
                </Label>
              </div>
              <div className="flex items-start gap-2 rounded-lg border border-border p-3">
                <RadioGroupItem value="single" id="lbl-single" className="mt-0.5" />
                <Label htmlFor="lbl-single" className="cursor-pointer flex-1">
                  <div className="font-medium">
                    {hasVariants ? "Variante específica + copias" : "N copias del producto"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Ej: 20 etiquetas talle M negro.
                  </div>
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Variant selector */}
          {mode === "single" && hasVariants && (
            <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Variante
              </Label>
              <div className={`grid gap-2 ${specs.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
                {specs.map((spec) => (
                  <div key={spec.name}>
                    <label className="text-xs">{spec.name}</label>
                    <Select
                      value={variantSel[spec.name] || ""}
                      onValueChange={(val) =>
                        setVariantSel((prev) => ({ ...prev, [spec.name]: val }))
                      }
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder={`Elegí ${spec.name.toLowerCase()}`} />
                      </SelectTrigger>
                      <SelectContent>
                        {spec.options.map((opt) => (
                          <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>
          )}

          {mode === "single" && (
            <div className="space-y-1">
              <Label htmlFor="lbl-copies" className="text-xs uppercase tracking-wider text-muted-foreground">
                Cantidad de copias
              </Label>
              <Input
                id="lbl-copies"
                type="number"
                min={1}
                max={500}
                value={copies}
                onChange={(e) => setCopies(e.target.value)}
              />
            </div>
          )}

          {/* SKU preview */}
          <div className="rounded-lg border border-border p-3 bg-muted/20 text-sm">
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
              Vista previa SKU
            </div>
            {mode === "all" ? (
              <div className="flex flex-wrap gap-1">
                {(hasVariants ? combos : [null]).slice(0, 8).map((vk, i) => (
                  <Badge key={i} variant="outline" className="font-mono">
                    {buildSku(product.sku_base || null, vk)}
                  </Badge>
                ))}
                {hasVariants && combos.length > 8 && (
                  <span className="text-xs text-muted-foreground self-center">
                    +{combos.length - 8} más…
                  </span>
                )}
              </div>
            ) : (
              <Badge variant="outline" className="font-mono">
                {previewSkuSingle || previewSkuAll || `RYB-${product.sku_base || "0000"}-…`}
              </Badge>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={printing}>
            Cancelar
          </Button>
          <Button onClick={handlePrint} disabled={printing}>
            <Printer className="w-4 h-4 mr-1" />
            {printing ? "Generando..." : `Imprimir ${totalCount}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ProductLabelsDialog;
