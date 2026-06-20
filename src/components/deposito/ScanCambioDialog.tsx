import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Camera, Keyboard, CheckCircle2, AlertTriangle, Loader2, ArrowRight, ArrowLeft } from "lucide-react";
import CameraScanner from "./CameraScanner";
import { decodeProductQr, formatVariante, variantesEquivalentes } from "@/lib/productQr";

export interface ScanSlotValue {
  productId: string;
  productName: string;
  variante: Record<string, string>;
  metodo: "qr" | "manual";
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title?: string;
  // Slot devuelto
  expectedReturnProductId?: string;
  expectedReturnVariante?: Record<string, any> | null;
  // Slot recibido (reemplazo)
  requireReemplazo?: boolean; // si true, fuerza completar también el slot "recibe"
  expectedDeliverProductId?: string;
  expectedDeliverVariante?: Record<string, any> | null;
  // Callbacks
  onConfirm: (data: { devuelto: ScanSlotValue; recibido: ScanSlotValue | null }) => Promise<void> | void;
}

type ProductLite = {
  id: string;
  name: string;
  variants: any[] | null;
  variant_stock: Record<string, number> | null;
  stock: number | null;
};

const buildVariantSig = (specs: { name: string }[], sel: Record<string, string>) =>
  specs.every((s) => sel[s.name]) ? specs.map((s) => `${s.name}:${sel[s.name]}`).join("|") : "";

const ScanSlot = ({
  label,
  value,
  onChange,
  expectedProductId,
  expectedVariante,
  checkStock,
}: {
  label: string;
  value: ScanSlotValue | null;
  onChange: (v: ScanSlotValue | null) => void;
  expectedProductId?: string;
  expectedVariante?: Record<string, any> | null;
  checkStock?: boolean;
}) => {
  const [scannerOpen, setScannerOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [products, setProducts] = useState<ProductLite[]>([]);
  const [productId, setProductId] = useState("");
  const [variante, setVariante] = useState<Record<string, string>>({});
  const [loadingProds, setLoadingProds] = useState(false);
  const [productLoaded, setProductLoaded] = useState<ProductLite | null>(null);
  const { toast } = useToast();

  const loadProducts = async () => {
    if (products.length) return;
    setLoadingProds(true);
    const { data } = await supabase
      .from("store_products")
      .select("id, name, variants, variant_stock, stock")
      .eq("status", "active")
      .order("name");
    setProducts((data as any[]) || []);
    setLoadingProds(false);
  };

  const fetchProduct = async (id: string): Promise<ProductLite | null> => {
    const { data } = await supabase
      .from("store_products")
      .select("id, name, variants, variant_stock, stock")
      .eq("id", id)
      .maybeSingle();
    return (data as any) || null;
  };

  const handleQrText = async (raw: string) => {
    setScannerOpen(false);
    const dec = decodeProductQr(raw);
    if (!dec) {
      toast({ title: "QR no reconocido", description: "Usá la carga manual.", variant: "destructive" });
      return;
    }
    const prod = await fetchProduct(dec.productId);
    if (!prod) {
      toast({ title: "Producto no encontrado", variant: "destructive" });
      return;
    }
    setProductLoaded(prod);
    if (dec.variante) {
      onChange({ productId: prod.id, productName: prod.name, variante: dec.variante, metodo: "qr" });
    } else {
      // QR sin variante → pedir manualmente la variante
      setProductId(prod.id);
      setVariante({});
      setManualOpen(true);
    }
  };

  const variantSpecs: { name: string; options: string[] }[] = (() => {
    const src = productLoaded?.variants || products.find((p) => p.id === productId)?.variants || [];
    if (!Array.isArray(src)) return [];
    return src.filter((v: any) => v?.name && Array.isArray(v?.options) && v.options.length > 0);
  })();

  const handleManualConfirm = () => {
    const p = productLoaded || products.find((x) => x.id === productId);
    if (!p) { toast({ title: "Elegí un producto", variant: "destructive" }); return; }
    if (variantSpecs.length && !variantSpecs.every((s) => variante[s.name])) {
      toast({ title: "Completá todas las variantes", variant: "destructive" });
      return;
    }
    onChange({ productId: p.id, productName: p.name, variante, metodo: productLoaded ? "qr" : "manual" });
    setManualOpen(false);
    setProductLoaded(null);
  };

  // Validaciones
  const productMatchWarn = expectedProductId && value && value.productId !== expectedProductId;
  const varianteMatchWarn = expectedVariante && value && !variantesEquivalentes(value.variante, expectedVariante);

  // Chequeo de stock para slot "recibe"
  const stockDisp = (() => {
    if (!checkStock || !value || !productLoaded) return null;
    if (productLoaded.variants && productLoaded.variants.length) {
      const specs = (productLoaded.variants as any[]).filter((v) => v?.name && Array.isArray(v?.options));
      const sig = buildVariantSig(specs, value.variante);
      return (productLoaded.variant_stock || {})[sig] ?? 0;
    }
    return productLoaded.stock ?? null;
  })();

  return (
    <div className="rounded-xl border border-border bg-card p-3 space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-heading uppercase tracking-wider text-muted-foreground">{label}</Label>
        {value && (
          <button className="text-[10px] text-destructive hover:underline" onClick={() => { onChange(null); setProductLoaded(null); }}>
            quitar
          </button>
        )}
      </div>

      {value ? (
        <div>
          <p className="text-sm font-semibold">{value.productName}</p>
          <p className="text-[11px] text-muted-foreground">{formatVariante(value.variante)}</p>
          <p className="text-[10px] mt-1 text-muted-foreground">
            <CheckCircle2 className="w-3 h-3 inline mr-0.5 text-green-400" />
            {value.metodo === "qr" ? "Escaneado por QR" : "Cargado manualmente"}
          </p>
          {productMatchWarn && (
            <p className="text-[11px] text-amber-400 mt-1 flex items-start gap-1">
              <AlertTriangle className="w-3 h-3 mt-0.5" />
              El producto escaneado no coincide con el esperado.
            </p>
          )}
          {!productMatchWarn && varianteMatchWarn && (
            <p className="text-[11px] text-amber-400 mt-1 flex items-start gap-1">
              <AlertTriangle className="w-3 h-3 mt-0.5" />
              La variante difiere de la esperada ({formatVariante(expectedVariante)}).
            </p>
          )}
          {checkStock && stockDisp !== null && stockDisp <= 0 && (
            <p className="text-[11px] text-destructive mt-1 flex items-start gap-1">
              <AlertTriangle className="w-3 h-3 mt-0.5" />
              Sin stock disponible para esta variante.
            </p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Button size="sm" onClick={() => setScannerOpen(true)}>
            <Camera className="w-3.5 h-3.5 mr-1" /> Escanear
          </Button>
          <Button size="sm" variant="outline" onClick={() => { setManualOpen(true); loadProducts(); }}>
            <Keyboard className="w-3.5 h-3.5 mr-1" /> Manual
          </Button>
        </div>
      )}

      <CameraScanner open={scannerOpen} onClose={() => setScannerOpen(false)} onDetected={handleQrText} />

      <Dialog open={manualOpen} onOpenChange={setManualOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Carga manual</DialogTitle>
            <DialogDescription>Elegí producto y variante.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {productLoaded ? (
              <div className="rounded border border-border p-2 text-xs">
                <p className="font-semibold">{productLoaded.name}</p>
                <p className="text-muted-foreground">Detectado por QR — completá variante.</p>
              </div>
            ) : (
              <div>
                <Label className="text-xs">Producto</Label>
                {loadingProds ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Select value={productId} onValueChange={(v) => { setProductId(v); setVariante({}); }}>
                    <SelectTrigger><SelectValue placeholder="Elegí producto" /></SelectTrigger>
                    <SelectContent>
                      {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            {variantSpecs.map((spec) => (
              <div key={spec.name}>
                <Label className="text-xs">{spec.name}</Label>
                <Select value={variante[spec.name] || ""} onValueChange={(v) => setVariante((p) => ({ ...p, [spec.name]: v }))}>
                  <SelectTrigger><SelectValue placeholder={`Elegí ${spec.name}`} /></SelectTrigger>
                  <SelectContent>
                    {spec.options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ))}

            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setManualOpen(false)}>Cancelar</Button>
              <Button size="sm" onClick={handleManualConfirm}>Confirmar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const ScanCambioDialog = ({
  open, onOpenChange, title = "Procesar cambio",
  expectedReturnProductId, expectedReturnVariante,
  requireReemplazo, expectedDeliverProductId, expectedDeliverVariante,
  onConfirm,
}: Props) => {
  const [devuelto, setDevuelto] = useState<ScanSlotValue | null>(null);
  const [recibido, setRecibido] = useState<ScanSlotValue | null>(null);
  const [enviarReemplazo, setEnviarReemplazo] = useState<boolean>(!!requireReemplazo);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      setDevuelto(null);
      setRecibido(null);
      setEnviarReemplazo(!!requireReemplazo);
    }
  }, [open, requireReemplazo]);

  const handleConfirm = async () => {
    if (!devuelto) { toast({ title: "Falta escanear la prenda devuelta", variant: "destructive" }); return; }
    if (enviarReemplazo && !recibido) { toast({ title: "Falta escanear el reemplazo", variant: "destructive" }); return; }
    setSaving(true);
    try {
      await onConfirm({ devuelto, recibido: enviarReemplazo ? recibido : null });
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Error", description: e?.message || "No se pudo procesar", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading uppercase tracking-wider">{title}</DialogTitle>
          <DialogDescription>Escaneá los QR (o cargá manualmente).</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <ScanSlot
            label={<><ArrowLeft className="w-3 h-3 inline mr-1" />Prenda que devuelve el alumno</> as any}
            value={devuelto}
            onChange={setDevuelto}
            expectedProductId={expectedReturnProductId}
            expectedVariante={expectedReturnVariante}
          />

          {!requireReemplazo && (
            <label className="flex items-center justify-between text-xs px-1">
              <span>¿Enviás el reemplazo ahora?</span>
              <Switch checked={enviarReemplazo} onCheckedChange={setEnviarReemplazo} />
            </label>
          )}

          {enviarReemplazo && (
            <ScanSlot
              label={<><ArrowRight className="w-3 h-3 inline mr-1" />Prenda que se envía como reemplazo</> as any}
              value={recibido}
              onChange={setRecibido}
              expectedProductId={expectedDeliverProductId}
              expectedVariante={expectedDeliverVariante}
              checkStock
            />
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleConfirm} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirmar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ScanCambioDialog;
