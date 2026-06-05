import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Package, Search, Plus, Minus, RefreshCw, Upload, Camera, Tag } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import StockImportDialog from "@/components/deposito/StockImportDialog";
import CameraScanner from "@/components/deposito/CameraScanner";
import ProductLabelsDialog from "@/components/deposito/ProductLabelsDialog";

interface VariantSpec {
  name: string;
  options: string[];
}

interface Product {
  id: string;
  name: string;
  price: number;
  currency: string | null;
  sku_base: string | null;
  stock: number;
  min_stock: number;
  status: string;
  category_id: string | null;
  image_url: string | null;
  variants: VariantSpec[] | null;
  variant_stock: Record<string, number> | null;
}

// Construye la clave del variant_stock en el mismo formato que usa el
// resto de la app: "VariantName:Value|VariantName:Value" en el ORDEN
// que define `product.variants`. Si falta alguna selección devuelve "".
const buildVariantKey = (
  specs: VariantSpec[],
  selection: Record<string, string>,
): string => {
  if (!specs.length) return "";
  for (const s of specs) {
    if (!selection[s.name]) return "";
  }
  return specs.map((s) => `${s.name}:${selection[s.name]}`).join("|");
};

const DepositoStock = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [movDialog, setMovDialog] = useState<Product | null>(null);
  const [movTipo, setMovTipo] = useState<"ingreso" | "egreso">("ingreso");
  const [movCantidad, setMovCantidad] = useState("");
  const [movMotivo, setMovMotivo] = useState("");
  const [movVariant, setMovVariant] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Barcode scanner state
  const [scannerActive, setScannerActive] = useState(false);
  const [barcodeInput, setBarcodeInput] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [labelsProduct, setLabelsProduct] = useState<Product | null>(null);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("store_products")
      .select("id, name, price, currency, sku_base, stock, min_stock, status, category_id, image_url, variants, variant_stock")
      .eq("status", "active")
      .order("name");
    if (!error) setProducts((data as any) || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  // Reset selección de variante al abrir/cambiar producto.
  useEffect(() => {
    if (movDialog) setMovVariant({});
  }, [movDialog?.id]);

  const dialogSpecs: VariantSpec[] = Array.isArray(movDialog?.variants)
    ? (movDialog!.variants as VariantSpec[]).filter(
        (v) => v?.name && Array.isArray(v?.options) && v.options.length > 0,
      )
    : [];
  const dialogHasVariants = dialogSpecs.length > 0;
  const dialogVariantKey = buildVariantKey(dialogSpecs, movVariant);
  const dialogVariantStock: number | null = dialogHasVariants
    ? (dialogVariantKey ? (movDialog?.variant_stock?.[dialogVariantKey] ?? 0) : null)
    : (movDialog?.stock ?? 0);

  const filtered = products.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleMovimiento = async () => {
    if (!movDialog || !movCantidad || parseInt(movCantidad) <= 0) {
      toast({ title: "Ingresá una cantidad válida", variant: "destructive" });
      return;
    }
    if (dialogHasVariants && !dialogVariantKey) {
      toast({
        title: "Elegí la variante",
        description: dialogSpecs.map((s) => s.name).join(", "),
        variant: "destructive",
      });
      return;
    }

    const cantidad = parseInt(movCantidad);

    // Trabajamos sobre el stock de la VARIANTE si existe; si no, sobre el total.
    const stockAnterior = dialogHasVariants
      ? (movDialog.variant_stock?.[dialogVariantKey] ?? 0)
      : movDialog.stock;
    const stockNuevo = movTipo === "ingreso"
      ? stockAnterior + cantidad
      : stockAnterior - cantidad;

    if (stockNuevo < 0) {
      toast({
        title: "Stock insuficiente",
        description: `Sólo hay ${stockAnterior} unidades${dialogHasVariants ? ` de ${dialogVariantKey.replace(/\|/g, " · ")}` : ""}.`,
        variant: "destructive",
      });
      return;
    }

    // Si el producto tiene variantes, recalculamos el stock TOTAL como
    // suma de todas las variantes (incluyendo la actualizada). Si no
    // tiene variantes, el total es directamente stockNuevo.
    let nextVariantStock: Record<string, number> | null = null;
    let nextTotalStock = stockNuevo;
    if (dialogHasVariants) {
      nextVariantStock = { ...(movDialog.variant_stock || {}), [dialogVariantKey]: stockNuevo };
      nextTotalStock = Object.values(nextVariantStock).reduce(
        (acc, n) => acc + (Number(n) || 0),
        0,
      );
    }

    setSaving(true);
    try {
      const updatePayload: Record<string, unknown> = { stock: nextTotalStock };
      if (nextVariantStock) updatePayload.variant_stock = nextVariantStock;

      const { error: updateError } = await supabase
        .from("store_products")
        .update(updatePayload as any)
        .eq("id", movDialog.id);
      if (updateError) throw updateError;

      const { data: { session } } = await supabase.auth.getSession();

      const { error: movError } = await supabase
        .from("stock_movements" as any)
        .insert({
          product_id: movDialog.id,
          tipo: movTipo,
          cantidad,
          stock_anterior: stockAnterior,
          stock_nuevo: stockNuevo,
          motivo: movMotivo || null,
          variante: dialogHasVariants ? dialogVariantKey : null,
          registrado_por: session?.user?.id || null,
        } as any);
      if (movError) throw movError;

      toast({
        title: movTipo === "ingreso" ? "Ingreso registrado" : "Egreso registrado",
        description: dialogHasVariants
          ? `${movDialog.name} (${dialogVariantKey.replace(/\|/g, " · ")}): ${stockAnterior} → ${stockNuevo}`
          : `${movDialog.name}: ${stockAnterior} → ${stockNuevo}`,
      });

      setMovDialog(null);
      setMovCantidad("");
      setMovMotivo("");
      setMovVariant({});
      fetchProducts();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleBarcodeSearch = () => {
    if (!barcodeInput.trim()) return;
    setSearch(barcodeInput.trim());
    setBarcodeInput("");
    setScannerActive(false);
  };

  const handleCameraDetected = useCallback((code: string) => {
    setCameraOpen(false);
    const trimmed = code.trim();
    // Buscar coincidencia exacta por id; si no, por nombre
    const match = products.find(
      (p) => p.id === trimmed || p.name.toLowerCase() === trimmed.toLowerCase(),
    );
    if (match) {
      toast({ title: "Producto encontrado", description: match.name });
      setMovDialog(match);
      setMovTipo("ingreso");
    } else {
      setSearch(trimmed);
      toast({
        title: "Código escaneado",
        description: `Buscando "${trimmed}"...`,
      });
    }
  }, [products]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-heading font-bold uppercase tracking-wider">Gestión de Stock</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowImport(true)}>
            <Upload className="w-4 h-4 mr-1" /> Importar
          </Button>
          <Button variant="outline" size="sm" onClick={fetchProducts}>
            <RefreshCw className="w-4 h-4 mr-1" /> Actualizar
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border-border">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total productos</p>
            <p className="text-xl font-bold font-heading">{products.length}</p>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Stock bajo</p>
            <p className="text-xl font-bold font-heading text-destructive">
              {products.filter((p) => p.stock <= p.min_stock).length}
            </p>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Sin stock</p>
            <p className="text-xl font-bold font-heading text-destructive">
              {products.filter((p) => p.stock === 0).length}
            </p>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Stock total</p>
            <p className="text-xl font-bold font-heading">
              {products.reduce((sum, p) => sum + p.stock, 0)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Search + Scanner */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar producto..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button variant="gold" onClick={() => setCameraOpen(true)}>
          <Camera className="w-4 h-4 mr-1" /> Cámara
        </Button>
        <Button
          variant={scannerActive ? "default" : "outline"}
          onClick={() => setScannerActive(!scannerActive)}
        >
          <Package className="w-4 h-4 mr-1" /> Lector
        </Button>
      </div>

      {scannerActive && (
        <Card className="border-primary/50">
          <CardContent className="p-4 flex gap-2">
            <Input
              placeholder="Escaneá con pistola USB o ingresá código..."
              value={barcodeInput}
              onChange={(e) => setBarcodeInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleBarcodeSearch()}
              autoFocus
              className="flex-1"
            />
            <Button onClick={handleBarcodeSearch}>Buscar</Button>
          </CardContent>
        </Card>
      )}

      <CameraScanner
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onDetected={handleCameraDetected}
      />

      {/* Products Table */}
      <Card className="border-border">
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">Cargando productos...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead className="text-center">Stock actual</TableHead>
                  <TableHead className="text-center">Mínimo</TableHead>
                  <TableHead className="text-center">Estado</TableHead>
                  <TableHead className="text-center">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">
                      <div className="flex flex-col">
                        <span>{p.name}</span>
                        {p.sku_base && (
                          <span className="text-[10px] font-mono text-muted-foreground">
                            RYB-{p.sku_base}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className={p.stock <= p.min_stock ? "text-destructive font-bold" : ""}>
                        {p.stock}
                      </span>
                    </TableCell>
                    <TableCell className="text-center text-muted-foreground">{p.min_stock}</TableCell>
                    <TableCell className="text-center">
                      {p.stock === 0 ? (
                        <Badge variant="destructive">Sin stock</Badge>
                      ) : p.stock <= p.min_stock ? (
                        <Badge variant="outline" className="border-yellow-500 text-yellow-500">Bajo</Badge>
                      ) : (
                        <Badge variant="secondary">OK</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex gap-1 justify-center flex-wrap">
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-green-500 border-green-500/50 hover:bg-green-500/10"
                          onClick={() => { setMovDialog(p); setMovTipo("ingreso"); }}
                        >
                          <Plus className="w-3 h-3 mr-1" /> Ingreso
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-destructive border-destructive/50 hover:bg-destructive/10"
                          onClick={() => { setMovDialog(p); setMovTipo("egreso"); }}
                        >
                          <Minus className="w-3 h-3 mr-1" /> Egreso
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setLabelsProduct(p)}
                        >
                          <Tag className="w-3 h-3 mr-1" /> Etiquetas
                        </Button>
                      </div>
                    </TableCell>

                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      No se encontraron productos
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Movement Dialog */}
      <Dialog open={!!movDialog} onOpenChange={(open) => { if (!open) setMovDialog(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {movTipo === "ingreso" ? "Registrar ingreso" : "Registrar egreso"}
            </DialogTitle>
            <DialogDescription>
              {movDialog?.name}
              {!dialogHasVariants && ` — Stock actual: ${movDialog?.stock ?? 0}`}
              {dialogHasVariants && ` — Stock total: ${movDialog?.stock ?? 0}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Button
                variant={movTipo === "ingreso" ? "default" : "outline"}
                size="sm"
                onClick={() => setMovTipo("ingreso")}
                className="flex-1"
              >
                <Plus className="w-3 h-3 mr-1" /> Ingreso
              </Button>
              <Button
                variant={movTipo === "egreso" ? "destructive" : "outline"}
                size="sm"
                onClick={() => setMovTipo("egreso")}
                className="flex-1"
              >
                <Minus className="w-3 h-3 mr-1" /> Egreso
              </Button>
            </div>

            {/* Selector de variantes (talle / color / modelo / etc.) */}
            {dialogHasVariants && (
              <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Variante a mover
                </p>
                <div className={`grid gap-2 ${dialogSpecs.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
                  {dialogSpecs.map((spec) => (
                    <div key={spec.name}>
                      <label className="text-xs font-medium">{spec.name}</label>
                      <Select
                        value={movVariant[spec.name] || ""}
                        onValueChange={(val) =>
                          setMovVariant((prev) => ({ ...prev, [spec.name]: val }))
                        }
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder={`Elegí ${spec.name.toLowerCase()}`} />
                        </SelectTrigger>
                        <SelectContent>
                          {spec.options.map((opt) => {
                            // Mostramos el stock disponible junto a cada opción
                            // SOLO cuando se trata del último selector (más
                            // específico) o cuando hay un único selector.
                            const previewKey = buildVariantKey(dialogSpecs, {
                              ...movVariant,
                              [spec.name]: opt,
                            });
                            const previewStock = previewKey
                              ? (movDialog?.variant_stock?.[previewKey] ?? 0)
                              : null;
                            return (
                              <SelectItem key={opt} value={opt}>
                                {opt}
                                {previewStock !== null && (
                                  <span className="text-muted-foreground ml-2 text-xs">
                                    · stock {previewStock}
                                  </span>
                                )}
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
                {dialogVariantKey && (
                  <p className="text-xs text-muted-foreground">
                    Stock actual de esta variante: <b>{dialogVariantStock}</b>
                  </p>
                )}
              </div>
            )}

            <div>
              <label className="text-sm font-medium">Cantidad</label>
              <Input
                type="number"
                min="1"
                value={movCantidad}
                onChange={(e) => setMovCantidad(e.target.value)}
                placeholder="Ej: 10"
              />
              {movDialog && movCantidad && parseInt(movCantidad) > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  {dialogHasVariants && !dialogVariantKey
                    ? "Elegí primero la variante."
                    : `Stock ${dialogHasVariants ? "de la variante" : "resultante"}: ${
                        (dialogVariantStock ?? 0) +
                        (movTipo === "ingreso" ? parseInt(movCantidad) : -parseInt(movCantidad))
                      }`}
                </p>
              )}
            </div>
            <div>
              <label className="text-sm font-medium">Motivo (opcional)</label>
              <Textarea
                value={movMotivo}
                onChange={(e) => setMovMotivo(e.target.value)}
                placeholder="Ej: Reposición mensual, Venta en local..."
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMovDialog(null)}>Cancelar</Button>
            <Button onClick={handleMovimiento} disabled={saving}>
              {saving ? "Guardando..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <StockImportDialog
        open={showImport}
        onOpenChange={setShowImport}
        onImportComplete={fetchProducts}
      />
    </div>
  );
};

export default DepositoStock;
