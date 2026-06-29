import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, CheckCircle, AlertTriangle, Loader2, Package } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface Category { id: string; name: string; icon: string | null }
interface Product {
  id: string;
  name: string;
  stock: number;
  variants: any;
  variant_stock: Record<string, number> | null;
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

const StockCountStage = ({ saving, isLast, onConfirm, onCancel }: Props) => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loadingCats, setLoadingCats] = useState(true);
  const [selectedCat, setSelectedCat] = useState<Category | null>(null);
  const [loadingProds, setLoadingProds] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [observaciones, setObservaciones] = useState("");

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
    setLoadingProds(true);
    const { data } = await supabase
      .from("store_products")
      .select("id, name, stock, variants, variant_stock")
      .eq("category_id", cat.id)
      .neq("status", "archived")
      .order("name", { ascending: true });
    setRows(buildRows((data || []) as Product[]));
    setLoadingProds(false);
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

  const allFilled = rows.length > 0 && summary.sin === 0;

  const handleConfirm = () => {
    if (!selectedCat) return;
    if (rows.length === 0) {
      return toast({ title: "Sin productos", description: "Esta categoría no tiene productos para contar.", variant: "destructive" });
    }
    if (!allFilled) {
      const ok = confirm(`Quedan ${summary.sin} ítems sin contar. ¿Confirmar de todas formas?`);
      if (!ok) return;
    }
    // Construir nota detallada
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
    onConfirm({ nota: lineas.join("\n"), entidad_ref_texto: selectedCat.name });
  };

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
              {categories.map((c) => (
                <button
                  key={c.id}
                  onClick={() => pickCategory(c)}
                  className="flex items-center gap-3 p-3 rounded-lg border border-border hover:border-primary hover:bg-primary/5 text-left transition"
                >
                  <span className="text-2xl">{c.icon || "📦"}</span>
                  <span className="font-medium">{c.name}</span>
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

  return (
    <Card className="border-primary/40">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <span className="text-xl">{selectedCat.icon || "📦"}</span>
            {selectedCat.name}
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={() => { setSelectedCat(null); setRows([]); }}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Cambiar
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Ingresá la cantidad física contada por cada ítem. El sistema muestra lo esperado.
        </p>
        <div className="flex flex-wrap gap-2 text-[11px] mt-2">
          <Badge variant="outline" className="border-green-500/40 text-green-500">✓ Coincide</Badge>
          <Badge variant="outline" className="border-orange-500/40 text-orange-500">! Diferencia</Badge>
          <Badge variant="outline">— Sin ingresar</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {loadingProds ? (
          <Loader2 className="w-5 h-5 animate-spin mx-auto" />
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No hay productos activos en esta categoría.</p>
        ) : (
          <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
            {rows.map((r, idx) => {
              const c = r.contado === "" ? null : Number(r.contado);
              const state = c === null || Number.isNaN(c)
                ? "sin"
                : c === r.esperado ? "ok" : "dif";
              const borderCls =
                state === "dif" ? "border-orange-500/60" : "border-border";
              return (
                <div
                  key={`${r.productId}-${r.variantSig || "_"}-${idx}`}
                  className={`flex items-center gap-2 p-2 rounded-lg border ${borderCls} bg-card`}
                >
                  <Package className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{r.productName}</div>
                    {r.variantSig && (
                      <div className="text-[11px] text-muted-foreground truncate">
                        {r.variantSig.replace(/\|/g, " · ")}
                      </div>
                    )}
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
                      setRows((prev) => prev.map((x, i) => i === idx ? { ...x, contado: v } : x));
                    }}
                    className={`h-10 w-20 text-center font-semibold ${state === "dif" ? "text-orange-500 border-orange-500/60" : ""}`}
                  />
                  <div className="w-4 text-center">
                    {state === "ok" && <span className="text-green-500">✓</span>}
                    {state === "dif" && <span className="text-orange-500">!</span>}
                    {state === "sin" && <span className="text-muted-foreground">—</span>}
                  </div>
                </div>
              );
            })}
          </div>
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
