import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, CheckCircle, AlertTriangle, Loader2, Package, Search, ChevronRight, Tag, Camera } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import ProductLabelsDialog from "@/components/deposito/ProductLabelsDialog";
import CameraScanner from "@/components/deposito/CameraScanner";
import { decodeProductQr, formatVariante } from "@/lib/productQr";

interface Category { id: string; name: string; icon: string | null }
interface Product {
  id: string;
  name: string;
  stock: number;
  variants: any;
  variant_stock: Record<string, number> | null;
  sku_base: string | null;
  image_url: string | null;
  description: string | null;
  price: number | null;
  currency: string | null;
  status: string | null;
  proveedor: string | null;
  tag: string | null;
}

interface Row {
  productId: string;
  productName: string;
  variantSig: string | null; // null = sin variantes
  esperado: number;
  contado: string; // input text
}


interface Props {
  initialNota?: string | null;
  saving: boolean;
  isLast: boolean;
  onConfirm: (payload: { nota: string; entidad_ref_texto: string }) => void;
  onCancel: () => void;
}

const buildRows = (products: Product[]): Row[] => {
  const rows: Row[] = [];
  for (const p of products) {
    const specs = Array.isArray(p.variants) ? p.variants.filter((v: any) => v?.name && Array.isArray(v?.options)) : [];
    if (!specs.length) {
      rows.push({ productId: p.id, productName: p.name, variantSig: null, esperado: p.stock ?? 0, contado: "" });
      continue;
    }
    // cartesian
    let combos: string[][] = [[]];
    for (const s of specs) {
      const next: string[][] = [];
      for (const c of combos) for (const o of s.options) next.push([...c, `${s.name}:${o}`]);
      combos = next;
    }
    for (const c of combos) {
      const sig = c.join("|");
      rows.push({
        productId: p.id,
        productName: p.name,
        variantSig: sig,
        esperado: (p.variant_stock as any)?.[sig] ?? 0,
        contado: "",
      });
    }
  }
  return rows;
};

const ALL_CAT: Category = { id: "__all__", name: "Todos los productos", icon: "🗂️" };

const StockCountStage = ({ saving, isLast, onConfirm, onCancel }: Props) => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loadingCats, setLoadingCats] = useState(true);
  const [selectedCat, setSelectedCat] = useState<Category | null>(null);
  const [loadingProds, setLoadingProds] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [observaciones, setObservaciones] = useState("");
  const [labelProductId, setLabelProductId] = useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [countId, setCountId] = useState<string | null>(null);
  const [confirmedProducts, setConfirmedProducts] = useState<Record<string, number>>({});
  const [savingProduct, setSavingProduct] = useState(false);


  const sigMatchesVariante = (sig: string | null, variante: Record<string, string> | null) => {
    if (!variante || Object.keys(variante).length === 0) return false;
    if (!sig) return false;
    const parts = sig.split("|").map((p) => {
      const i = p.indexOf(":");
      return [p.slice(0, i).trim().toLowerCase(), p.slice(i + 1).trim().toLowerCase()] as const;
    });
    const entries = Object.entries(variante).map(
      ([k, v]) => [String(k).trim().toLowerCase(), String(v).trim().toLowerCase()] as const,
    );
    return entries.every(([k, v]) => parts.some(([pk, pv]) => pk === k && pv === v));
  };

  const bumpCount = (productId: string, variante: Record<string, string> | null) => {
    let hitLabel: string | null = null;
    let newValue = 0;
    setRows((prev) => {
      const idx = prev.findIndex((r) => {
        if (r.productId !== productId) return false;
        if (!variante || Object.keys(variante).length === 0) return r.variantSig === null;
        return sigMatchesVariante(r.variantSig, variante);
      });
      if (idx === -1) return prev;
      const cur = prev[idx].contado === "" || Number.isNaN(Number(prev[idx].contado)) ? 0 : Number(prev[idx].contado);
      newValue = cur + 1;
      hitLabel = prev[idx].variantSig ? prev[idx].variantSig!.replace(/\|/g, " · ") : prev[idx].productName;
      return prev.map((x, i) => (i === idx ? { ...x, contado: String(newValue) } : x));
    });
    return { hitLabel: () => hitLabel, value: () => newValue };
  };

  const handleScanned = async (raw: string) => {
    setScannerOpen(false);
    const code = (raw || "").trim();
    if (!code) return;
    const decoded = decodeProductQr(code);
    let prod = decoded ? products.find((p) => p.id === decoded.productId) : undefined;
    let variante: Record<string, string> | null = decoded?.variante || null;

    // Etiquetas Niimbot: el QR es el SKU registrado en product_barcodes (con variante)
    if (!prod || !variante) {
      const { data: bc } = await (supabase as any)
        .from("product_barcodes")
        .select("product_id, variante")
        .eq("codigo", code)
        .maybeSingle();
      if (bc) {
        const p = products.find((x) => x.id === bc.product_id);
        if (p) prod = p;
        if (!variante && bc.variante && typeof bc.variante === "object") variante = bc.variante;
      }
    }

    if (!prod) {
      const q = code.toLowerCase();
      prod = products.find(
        (p) =>
          p.id === q ||
          (p.sku_base || "").toLowerCase() === q ||
          p.name.toLowerCase() === q ||
          (!!p.sku_base && q.includes(p.sku_base.toLowerCase())) ||
          p.name.toLowerCase().includes(q),
      );
    }
    if (!prod) {
      setSearch(code);
      toast({ title: "Producto no encontrado", description: `Buscando “${code}”…`, variant: "destructive" });
      return;
    }
    setSelectedProductId(prod.id);

    const prodRows = rows.filter((r) => r.productId === prod!.id);

    const hasVariants = prodRows.some((r) => r.variantSig !== null);

    if (!hasVariants) {
      const res = bumpCount(prod.id, null);
      toast({ title: prod.name, description: `Sumado 1 → total ${res.value()}` });
      return;
    }

    // Fallback: deducir la variante desde el sufijo del SKU escaneado (ej. RYB-CALZA-M)
    if (!variante) {
      const tokens = code.toUpperCase().split(/[-_\s|/]+/).filter(Boolean);
      const match = prodRows.find((r) => {
        if (!r.variantSig) return false;
        const opts = r.variantSig.split("|").map((p) => p.slice(p.indexOf(":") + 1).trim().toUpperCase());
        return opts.every((o) => tokens.includes(o));
      });
      if (match && match.variantSig) {
        variante = Object.fromEntries(
          match.variantSig.split("|").map((p) => [p.slice(0, p.indexOf(":")), p.slice(p.indexOf(":") + 1)]),
        );
      }
    }


    if (variante) {
      const target = prodRows.find((r) => sigMatchesVariante(r.variantSig, variante));
      if (target) {
        const res = bumpCount(prod.id, variante);
        toast({ title: prod.name, description: `${formatVariante(variante)} · sumado 1 → total ${res.value()}` });
        return;
      }
      toast({
        title: prod.name,
        description: `La variante ${formatVariante(variante)} no existe en este producto. Cargala a mano.`,
        variant: "destructive",
      });
      return;
    }

    toast({
      title: prod.name,
      description: "La etiqueta no trae talle/variante. Elegí la variante y cargá el conteo.",
    });
  };


  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("store_categories")
        .select("id, name, icon")
        .eq("active", true)
        .order("sort_order", { ascending: true });
      setCategories((data || []) as Category[]);
      setLoadingCats(false);
    })();
  }, []);

  const pickCategory = async (cat: Category) => {
    setSelectedCat(cat);
    setSelectedProductId(null);
    setSearch("");
    setLoadingProds(true);
    let q = supabase
      .from("store_products")
      .select("id, name, stock, variants, variant_stock, sku_base, image_url, description, price, currency, status, proveedor, tag")
      .neq("status", "archived")
      .order("name", { ascending: true });
    if (cat.id !== ALL_CAT.id) q = q.eq("category_id", cat.id);
    const { data } = await q;
    const prods = (data || []) as Product[];
    setProducts(prods);
    let baseRows = buildRows(prods);

    // Abrir o retomar el conteo de esta categoría
    const { data: started, error: startErr } = await (supabase as any).rpc("start_stock_count", {
      p_categoria: cat.name,
    });
    if (startErr) {
      toast({ title: "No se pudo abrir el conteo", description: startErr.message, variant: "destructive" });
    } else {
      const cid = (started as any)?.count_id as string;
      setCountId(cid);
      if ((started as any)?.resumed) {
        const { data: prev } = await (supabase as any)
          .from("stock_count_items")
          .select("product_id, variante, contado")
          .eq("count_id", cid);
        const map = new Map<string, number>();
        const done: Record<string, number> = {};
        (prev || []).forEach((it: any) => {
          if (it.contado === null || it.contado === undefined) return;
          map.set(`${it.product_id}::${it.variante || ""}`, it.contado);
          done[it.product_id] = (done[it.product_id] || 0) + 1;
        });
        if (map.size) {
          baseRows = baseRows.map((r) => {
            const v = map.get(`${r.productId}::${r.variantSig || ""}`);
            return v === undefined ? r : { ...r, contado: String(v) };
          });
          setConfirmedProducts(done);
          toast({ title: "Conteo retomado", description: `Recuperamos ${map.size} ítem(s) ya contados.` });
        }
      } else {
        setConfirmedProducts({});
      }
    }

    setRows(baseRows);
    setLoadingProds(false);
  };

  const confirmProduct = async (productId: string) => {
    if (!countId) return toast({ title: "Conteo no iniciado", variant: "destructive" });
    const prodRows = rows.filter((r) => r.productId === productId);
    const pendientes = prodRows.filter((r) => r.contado === "" || Number.isNaN(Number(r.contado)));
    if (pendientes.length) {
      const ok = confirm(`Quedan ${pendientes.length} variante(s) sin contar en este producto. ¿Confirmar igual?`);
      if (!ok) return;
    }
    setSavingProduct(true);
    const items = prodRows.map((r) => ({
      product_id: r.productId,
      product_name: r.productName,
      variant_sig: r.variantSig,
      esperado: r.esperado,
      contado: r.contado === "" || Number.isNaN(Number(r.contado)) ? null : Number(r.contado),
    }));
    const { data, error } = await (supabase as any).rpc("apply_stock_count_product", {
      p_count_id: countId,
      p_items: items,
    });
    setSavingProduct(false);
    if (error) {
      return toast({ title: "No se pudo guardar", description: error.message, variant: "destructive" });
    }
    const ajustes = (data as any)?.ajustes ?? 0;
    // El stock del sistema ahora coincide con lo contado
    setRows((prev) =>
      prev.map((r) =>
        r.productId === productId && r.contado !== "" && !Number.isNaN(Number(r.contado))
          ? { ...r, esperado: Number(r.contado) }
          : r,
      ),
    );
    setConfirmedProducts((prev) => ({ ...prev, [productId]: items.filter((i) => i.contado !== null).length }));
    toast({
      title: "Stock actualizado",
      description: ajustes ? `${ajustes} ajuste(s) aplicados al stock.` : "Sin diferencias: el conteo quedó guardado.",
    });
    setSelectedProductId(null);
  };




  const summary = useMemo(() => {
    let coincide = 0, dif = 0, sin = 0, faltantes = 0, sobrantes = 0;
    for (const r of rows) {
      if (r.contado === "") { sin++; continue; }
      const c = Number(r.contado);
      if (Number.isNaN(c)) { sin++; continue; }
      if (c === r.esperado) coincide++;
      else {
        dif++;
        if (c < r.esperado) faltantes += r.esperado - c;
        else sobrantes += c - r.esperado;
      }
    }
    return { coincide, dif, sin, faltantes, sobrantes };
  }, [rows]);

  const perProduct = useMemo(() => {
    const map: Record<string, { total: number; contados: number; dif: number; esperado: number }> = {};
    rows.forEach((r) => {
      const e = map[r.productId] || (map[r.productId] = { total: 0, contados: 0, dif: 0, esperado: 0 });
      e.total++;
      e.esperado += r.esperado;
      if (r.contado !== "" && !Number.isNaN(Number(r.contado))) {
        e.contados++;
        if (Number(r.contado) !== r.esperado) e.dif++;
      }
    });
    return map;
  }, [rows]);

  const allFilled = rows.length > 0 && summary.sin === 0;

  const handleConfirm = async () => {
    if (!selectedCat) return;
    if (rows.length === 0) {
      return toast({ title: "Sin productos", description: "Esta categoría no tiene productos para contar.", variant: "destructive" });
    }
    if (!allFilled) {
      const ok = confirm(`Quedan ${summary.sin} ítems sin contar. ¿Confirmar de todas formas?`);
      if (!ok) return;
    }
    if (summary.dif > 0) {
      const ok = confirm(
        `Se van a ajustar ${summary.dif} ítems para que el stock del sistema quede igual al conteo (motivo: "ajuste por conteo"). ¿Continuar?`,
      );
      if (!ok) return;
    }

    // Reporte final
    const lineas: string[] = [];
    lineas.push(`Categoría: ${selectedCat.name}`);
    lineas.push(`Resumen: ${summary.coincide} coinciden · ${summary.dif} con diferencia · ${summary.sin} sin contar`);
    if (summary.faltantes) lineas.push(`Faltantes totales: ${summary.faltantes} u.`);
    if (summary.sobrantes) lineas.push(`Sobrantes totales: ${summary.sobrantes} u.`);
    lineas.push("");
    lineas.push("Detalle:");
    for (const r of rows) {
      if (r.contado === "") continue;
      const c = Number(r.contado);
      const dif = c - r.esperado;
      const tag = dif === 0 ? "OK" : dif > 0 ? `+${dif}` : `${dif}`;
      lineas.push(`• ${r.productName}${r.variantSig ? ` [${r.variantSig.replace(/\|/g, " · ")}]` : ""} — esp ${r.esperado} / cont ${c} (${tag})`);
    }
    if (observaciones.trim()) {
      lineas.push("");
      lineas.push("Observaciones: " + observaciones.trim());
    }
    const reporte = lineas.join("\n");

    // Registrar conteo completo + aplicar ajustes de stock
    const items = rows.map((r) => ({
      product_id: r.productId,
      product_name: r.productName,
      variant_sig: r.variantSig,
      esperado: r.esperado,
      contado: r.contado === "" || Number.isNaN(Number(r.contado)) ? null : Number(r.contado),
    }));

    const { data, error } = await supabase.rpc("apply_stock_count_adjustments", {
      p_items: items as any,
      p_categoria: selectedCat.name,
      p_observaciones: observaciones.trim() || null,
      p_reporte: reporte,
    });
    if (error) {
      return toast({ title: "No se pudo registrar el conteo", description: error.message, variant: "destructive" });
    }
    const ajustados = (data as any)?.ajustes ?? 0;
    toast({ title: "Conteo registrado", description: `${ajustados} ítems ajustados según el conteo.` });

    const notaFinal = `${reporte}\n\nAjustes aplicados al stock: ${ajustados} (motivo: ajuste por conteo)\nConteo registrado: ${(data as any)?.count_id ?? ""}`;
    onConfirm({ nota: notaFinal, entidad_ref_texto: selectedCat.name });
  };



  const renderRow = (r: Row, idx: number) => {
    const c = r.contado === "" ? null : Number(r.contado);
    const state = c === null || Number.isNaN(c) ? "sin" : c === r.esperado ? "ok" : "dif";
    const borderCls = state === "dif" ? "border-orange-500/60" : "border-border";
    return (
      <div
        key={`${r.productId}-${r.variantSig || "_"}-${idx}`}
        className={`flex items-center gap-2 p-2 rounded-lg border ${borderCls} bg-card`}
      >
        <Package className="w-4 h-4 text-muted-foreground shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium truncate">
            {r.variantSig ? r.variantSig.replace(/\|/g, " · ") : r.productName}
          </div>
          <div className="text-[11px] text-muted-foreground">esp. {r.esperado}</div>
        </div>
        <Input
          type="number"
          inputMode="numeric"
          min={0}
          value={r.contado}
          placeholder="—"
          onChange={(e) => {
            const v = e.target.value;
            setRows((prev) => prev.map((x, i) => (i === idx ? { ...x, contado: v } : x)));
          }}
          className={`h-10 w-20 text-center font-semibold [appearance:textfield] [&::-webkit-outer-spin-button]:hidden [&::-webkit-inner-spin-button]:hidden ${state === "dif" ? "text-orange-500 border-orange-500/60" : ""}`}
        />
        <div className="w-4 text-center">
          {state === "ok" && <span className="text-green-500">✓</span>}
          {state === "dif" && <span className="text-orange-500">!</span>}
          {state === "sin" && <span className="text-muted-foreground">—</span>}
        </div>
      </div>
    );
  };

  // ---------- Paso 1: categoría ----------
  if (!selectedCat) {
    return (
      <Card className="border-primary/40">
        <CardHeader>
          <CardTitle className="text-base">Elegí la categoría a chequear</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingCats ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {[ALL_CAT, ...categories].map((c) => (
                <button
                  key={c.id}
                  onClick={() => pickCategory(c)}
                  className={`flex items-center gap-3 p-3 rounded-lg border text-left transition hover:border-primary hover:bg-primary/5 ${
                    c.id === ALL_CAT.id ? "border-primary/50 sm:col-span-2" : "border-border"
                  }`}
                >
                  <span className="text-2xl">{c.icon || "📦"}</span>
                  <span className="font-medium">{c.name}</span>
                  {c.id === ALL_CAT.id && (
                    <span className="ml-auto text-[11px] text-muted-foreground">incluye ocultos y sin categoría</span>
                  )}
                </button>
              ))}
            </div>

          )}
          <div className="mt-4">
            <Button variant="ghost" size="sm" onClick={onCancel}>Cancelar proceso</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const selectedProduct = products.find((p) => p.id === selectedProductId) || null;
  const labelProduct = products.find((p) => p.id === labelProductId) || null;


  // ---------- Paso 3: detalle de producto ----------
  if (selectedProduct) {
    const prodRows = rows
      .map((r, idx) => ({ r, idx }))
      .filter(({ r }) => r.productId === selectedProduct.id);
    const st = perProduct[selectedProduct.id];
    return (
      <>
      <Card className="border-primary/40">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base truncate flex items-center gap-2">
              {selectedProduct.name}
              {selectedProduct.status && selectedProduct.status !== "active" && (
                <Badge variant="outline" className="text-[10px]">{selectedProduct.status === "hidden" ? "Oculto" : selectedProduct.status}</Badge>
              )}
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setSelectedProductId(null)}>
              <ArrowLeft className="w-4 h-4 mr-1" /> Productos
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-3 p-3 rounded-lg border border-border bg-muted/20">
            {selectedProduct.image_url ? (
              <img
                src={selectedProduct.image_url}
                alt={selectedProduct.name}
                loading="lazy"
                className="w-20 h-20 rounded-md object-cover border border-border shrink-0"
              />
            ) : (
              <div className="w-20 h-20 rounded-md border border-border flex items-center justify-center shrink-0">
                <Package className="w-6 h-6 text-muted-foreground" />
              </div>
            )}
            <div className="min-w-0 text-xs space-y-1">
              {selectedProduct.sku_base && <div><span className="text-muted-foreground">SKU:</span> {selectedProduct.sku_base}</div>}
              {selectedProduct.proveedor && <div><span className="text-muted-foreground">Proveedor:</span> {selectedProduct.proveedor}</div>}
              {selectedProduct.tag && <div><span className="text-muted-foreground">Tag:</span> {selectedProduct.tag}</div>}
              <div><span className="text-muted-foreground">Stock sistema:</span> {st?.esperado ?? selectedProduct.stock ?? 0} u.</div>
              {selectedProduct.description && (
                <p className="text-muted-foreground line-clamp-3">{selectedProduct.description}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => setLabelProductId(selectedProduct.id)}>
              <Tag className="w-4 h-4 mr-1" /> Etiquetas
            </Button>
            <Button variant="gold" onClick={() => setScannerOpen(true)}>
              <Camera className="w-4 h-4 mr-1" /> Escanear
            </Button>
          </div>

          <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-1">
            {prodRows.map(({ r, idx }) => renderRow(r, idx))}
          </div>

          <Button className="w-full" variant="secondary" onClick={() => setSelectedProductId(null)}>
            Listo, volver a productos
          </Button>
        </CardContent>
      </Card>
      <CameraScanner open={scannerOpen} onClose={() => setScannerOpen(false)} onDetected={handleScanned} />
      <ProductLabelsDialog
        open={!!labelProductId}
        product={labelProduct as any}
        onOpenChange={(o) => !o && setLabelProductId(null)}
      />

      </>
    );

  }

  // ---------- Paso 2: lista de productos ----------
  const filtered = products.filter((p) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [p.name, p.sku_base, p.proveedor, p.tag].some((v) => (v || "").toLowerCase().includes(q));
  });

  return (
    <Card className="border-primary/40">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <span className="text-xl">{selectedCat.icon || "📦"}</span>
            {selectedCat.name}
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={() => { setSelectedCat(null); setRows([]); setProducts([]); }}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Cambiar
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Elegí un producto para ver su detalle y cargar el conteo por talle/variante.
        </p>
        <div className="flex flex-wrap gap-2 text-[11px] mt-2">
          <Badge variant="outline" className="border-green-500/40 text-green-500">✓ Completo</Badge>
          <Badge variant="outline" className="border-orange-500/40 text-orange-500">! Diferencia</Badge>
          <Badge variant="outline">— Pendiente</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {loadingProds ? (
          <Loader2 className="w-5 h-5 animate-spin mx-auto" />
        ) : products.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No hay productos en esta categoría.</p>
        ) : (
          <>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar producto, SKU o proveedor…"
                  className="pl-9"
                />
              </div>
              <Button variant="outline" onClick={() => setScannerOpen(true)} title="Escanear etiqueta">
                <Camera className="w-4 h-4 mr-1" /> Escanear
              </Button>
            </div>
            <CameraScanner open={scannerOpen} onClose={() => setScannerOpen(false)} onDetected={handleScanned} />


            <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-1">
              {filtered.map((p) => {
                const st = perProduct[p.id] || { total: 0, contados: 0, dif: 0, esperado: 0 };
                const done = st.total > 0 && st.contados === st.total;
                return (
                  <button
                    key={p.id}
                    onClick={() => setSelectedProductId(p.id)}
                    className={`w-full flex items-center gap-3 p-2 rounded-lg border text-left transition hover:border-primary ${
                      st.dif > 0 ? "border-orange-500/60" : done ? "border-green-500/50" : "border-border"
                    } bg-card`}
                  >
                    {p.image_url ? (
                      <img src={p.image_url} alt={p.name} loading="lazy" className="w-12 h-12 rounded-md object-cover border border-border shrink-0" />
                    ) : (
                      <div className="w-12 h-12 rounded-md border border-border flex items-center justify-center shrink-0">
                        <Package className="w-4 h-4 text-muted-foreground" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{p.name}</div>
                      <div className="text-[11px] text-muted-foreground truncate">
                        {p.sku_base ? `${p.sku_base} · ` : ""}{st.total} ítem(s) · esp. {st.esperado} u.
                      </div>
                    </div>
                    <span className={`text-[11px] shrink-0 ${st.dif > 0 ? "text-orange-500" : done ? "text-green-500" : "text-muted-foreground"}`}>
                      {st.contados}/{st.total}
                    </span>
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  </button>
                );
              })}
              {filtered.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">Sin resultados para “{search}”.</p>
              )}
            </div>
          </>
        )}

        {rows.length > 0 && summary.dif > 0 && (
          <div className="flex items-start gap-2 p-3 rounded-lg border border-orange-500/40 bg-orange-500/10 text-sm">
            <AlertTriangle className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" />
            <div>
              <div className="font-medium">{summary.dif} ítem(s) con diferencia detectada</div>
              {summary.faltantes > 0 && <div className="text-xs">Faltantes: {summary.faltantes} u.</div>}
              {summary.sobrantes > 0 && <div className="text-xs">Sobrantes: {summary.sobrantes} u.</div>}
            </div>
          </div>
        )}

        {rows.length > 0 && (
          <div>
            <label className="text-sm font-medium block mb-1">
              Observaciones <span className="text-muted-foreground text-xs">(opcional)</span>
            </label>
            <Textarea
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              rows={3}
              placeholder="Anotá cualquier irregularidad. Ej: caja de calzado todavía cerrada, conteo pendiente..."
            />
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <Button onClick={handleConfirm} disabled={saving || rows.length === 0} className="flex-1">
            {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-1" />}
            {isLast ? "Finalizar proceso" : "Confirmar etapa"}
          </Button>
          <Button variant="ghost" onClick={onCancel}>Cancelar</Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default StockCountStage;
