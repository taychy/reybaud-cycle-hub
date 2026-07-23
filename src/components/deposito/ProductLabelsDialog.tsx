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
import { printNiimbotLabels, type NiimbotSize, type NiimbotPreviewItem } from "@/lib/niimbotLabels";
import NiimbotLabelPreviewDialog from "@/components/deposito/NiimbotLabelPreviewDialog";

type FormatKind = "a4" | "niimbot";
const NIIMBOT_SIZES: { value: NiimbotSize; label: string }[] = [
  { value: "40x30", label: "40 × 30 mm (rollo standard)" },
  { value: "50x30", label: "50 × 30 mm" },
  { value: "50x40", label: "50 × 40 mm" },
];

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
  const [format, setFormat] = useState<FormatKind>("a4");
  const [layout, setLayout] = useState<LabelLayout>("8");
  const [niimbotSize, setNiimbotSize] = useState<NiimbotSize>("40x30");
  const [niimbotMode, setNiimbotMode] = useState<"label" | "scan-source">("label");
  const [mode, setMode] = useState<Mode>("all");
  const [variantSel, setVariantSel] = useState<Record<string, string>>({});
  const [copies, setCopies] = useState<string>("1");
  const [printing, setPrinting] = useState(false);
  const [previewLabels, setPreviewLabels] = useState<NiimbotPreviewItem[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);

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
      if (format === "niimbot") {
        // Para Niimbot: siempre 1 etiqueta por combinación (las copias ya vienen
        // expandidas en `items` cuando el modo es "single").
        const variantObj = (vk: string | null): Record<string, string> => {
          if (!vk) return {};
          const out: Record<string, string> = {};
          vk.split("|").forEach((p) => {
            const i = p.indexOf(":");
            if (i > 0) out[p.slice(0, i)] = p.slice(i + 1);
          });
          return out;
        };
        const res = await printNiimbotLabels(
          items.map((it) => ({
            product_id: it.product_id,
            product_name: it.product_name,
            sku_base: it.sku_base,
            variant_key: it.variant_key,
            variante: variantObj(it.variant_key),
          })),
          {
            size: niimbotSize,
            mode: niimbotMode,
            filenameHint: product.name,
            preview: true,
          },
        );
        if (res.previews && res.previews.length) {
          setPreviewLabels(res.previews);
          setPreviewOpen(true);
          // no cerramos el diálogo padre acá: primero que el usuario decida en la preview
        } else {
          toast({ title: "No se generaron etiquetas", variant: "destructive" });
        }
      } else {
        await printProductLabels(items, {
          layout,
          filename: `etiquetas-${product.name.toLowerCase().replace(/\s+/g, "-").slice(0, 30)}.pdf`,
        });
        toast({ title: `${items.length} etiqueta(s) generadas` });
        onOpenChange(false);
      }
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
          {/* Format */}
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              Impresora
            </Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setFormat("a4")}
                className={`rounded-lg border p-3 text-left text-sm transition-colors ${
                  format === "a4"
                    ? "border-primary bg-primary/10"
                    : "border-border hover:border-primary/50"
                }`}
              >
                <div className="font-medium">Común A4</div>
                <div className="text-xs text-muted-foreground">Grilla en PDF</div>
              </button>
              <button
                type="button"
                onClick={() => setFormat("niimbot")}
                className={`rounded-lg border p-3 text-left text-sm transition-colors ${
                  format === "niimbot"
                    ? "border-primary bg-primary/10"
                    : "border-border hover:border-primary/50"
                }`}
              >
                <div className="font-medium">Niimbot</div>
                <div className="text-xs text-muted-foreground">PNG por etiqueta (QR)</div>
              </button>
            </div>
          </div>

          {/* Layout */}
          {format === "a4" ? (
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
          ) : (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                  Modo Niimbot
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setNiimbotMode("label")}
                    className={`rounded-lg border p-3 text-left text-xs transition-colors ${
                      niimbotMode === "label"
                        ? "border-primary bg-primary/10"
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    <div className="font-medium text-sm">Etiqueta lista</div>
                    <div className="text-muted-foreground">PNG del tamaño del rollo para enviar a imprimir.</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setNiimbotMode("scan-source")}
                    className={`rounded-lg border p-3 text-left text-xs transition-colors ${
                      niimbotMode === "scan-source"
                        ? "border-primary bg-primary/10"
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    <div className="font-medium text-sm">Fuente escaneable</div>
                    <div className="text-muted-foreground">QR gigante para que la app Niimbot lo escanee y copie el código.</div>
                  </button>
                </div>
              </div>

              {niimbotMode === "label" && (
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                    Tamaño del rollo
                  </Label>
                  <Select value={niimbotSize} onValueChange={(v) => setNiimbotSize(v as NiimbotSize)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {NIIMBOT_SIZES.map((s) => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <p className="text-[11px] text-muted-foreground">
                {niimbotMode === "scan-source"
                  ? "Genera un PNG grande con QR + SKU. Abrí la app Niimbot → Escanear código de barras → apuntá a esta imagen y la app copiará el código a una etiqueta nueva."
                  : "Genera un PNG por etiqueta (o un .zip si son varias). Abrilo desde la app Niimbot para enviarlo a la impresora. El QR queda registrado como código escaneable para el control de ingreso."}
              </p>
            </div>
          )}

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
            {printing
              ? "Generando..."
              : format === "niimbot"
                ? `Ver ${totalCount} etiqueta${totalCount > 1 ? "s" : ""}`
                : `Imprimir ${totalCount}`}
          </Button>
        </DialogFooter>
      </DialogContent>

      <NiimbotLabelPreviewDialog
        open={previewOpen}
        onOpenChange={(o) => {
          setPreviewOpen(o);
          if (!o) onOpenChange(false);
        }}
        previews={previewLabels}
        title={`Etiquetas Niimbot · ${product.name}`}
        filenameHint={product.name}
      />
    </Dialog>
  );
};

export default ProductLabelsDialog;
