import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Camera, CheckCircle, Loader2, Package, TrendingDown, X } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface Props {
  instanceId: string;
  currentStageId: string;
  currentOrden: number;
  initialNota?: string | null;
  initialFotoUrl?: string | null;
  saving: boolean;
  isLast: boolean;
  onConfirm: (payload: { nota: string; foto_url: string | null }) => void;
  onCancel: () => void;
}

interface DiffRow {
  producto: string;
  variante: string | null;
  esperado: number;
  contado: number;
  diff: number; // contado - esperado
}

interface LowStockRow {
  id: string;
  name: string;
  stock: number;
  min_stock: number;
  faltan: number;
}

// Parsea la nota de la etapa "Conteo físico por categoría":
//  "• ProductName [variant a · variant b] — esp 5 / cont 3 (-2)"
const parseDiffsFromNota = (nota: string | null | undefined): { categoria: string | null; diffs: DiffRow[] } => {
  if (!nota) return { categoria: null, diffs: [] };
  const lines = nota.split("\n");
  let categoria: string | null = null;
  const diffs: DiffRow[] = [];
  for (const raw of lines) {
    const l = raw.trim();
    const mCat = l.match(/^Categor[ií]a:\s*(.+)$/i);
    if (mCat) { categoria = mCat[1].trim(); continue; }
    const m = l.match(/^•\s*(.+?)(?:\s*\[(.+?)\])?\s*—\s*esp\s*(\d+)\s*\/\s*cont\s*(\d+)\s*\(([^)]+)\)/i);
    if (!m) continue;
    const esperado = Number(m[3]);
    const contado = Number(m[4]);
    const diff = contado - esperado;
    if (diff === 0) continue;
    diffs.push({
      producto: m[1].trim(),
      variante: m[2] ? m[2].trim() : null,
      esperado,
      contado,
      diff,
    });
  }
  return { categoria, diffs };
};

const StockComparisonStage = ({
  instanceId,
  currentStageId,
  currentOrden,
  initialNota,
  initialFotoUrl,
  saving,
  isLast,
  onConfirm,
  onCancel,
}: Props) => {
  const [loading, setLoading] = useState(true);
  const [categoria, setCategoria] = useState<string | null>(null);
  const [diffs, setDiffs] = useState<DiffRow[]>([]);
  const [lowStock, setLowStock] = useState<LowStockRow[]>([]);
  const [comentario, setComentario] = useState("");
  const [fotos, setFotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  // Carga el resumen comparativo
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        // 1) Etapa previa "Conteo físico" para parsear diferencias
        const { data: prev } = await supabase
          .from("process_instance_stages")
          .select("nota")
          .eq("instance_id", instanceId)
          .eq("orden", currentOrden - 1)
          .maybeSingle();
        const parsed = parseDiffsFromNota(prev?.nota);
        setCategoria(parsed.categoria);
        setDiffs(parsed.diffs);

        // 2) Productos con bajo stock (todos los activos)
        const { data: prods } = await supabase
          .from("store_products")
          .select("id, name, stock, min_stock, category_id, store_categories(name)")
          .neq("status", "archived")
          .order("name", { ascending: true });
        const low: LowStockRow[] = (prods || [])
          .filter((p: any) => (p.stock ?? 0) < (p.min_stock ?? 0))
          .map((p: any) => ({
            id: p.id,
            name: `${p.name}${p.store_categories?.name ? ` · ${p.store_categories.name}` : ""}`,
            stock: p.stock ?? 0,
            min_stock: p.min_stock ?? 0,
            faltan: (p.min_stock ?? 0) - (p.stock ?? 0),
          }));
        setLowStock(low);

        // Pre-cargar foto / comentario si la etapa fue editada
        if (initialNota) {
          const m = initialNota.match(/Comentario del gestor:\s*([\s\S]+?)(?:\n\nFotos:|$)/);
          if (m) setComentario(m[1].trim());
        }
        if (initialFotoUrl) {
          try {
            const parsed = JSON.parse(initialFotoUrl);
            if (Array.isArray(parsed)) setFotos(parsed);
            else setFotos([initialFotoUrl]);
          } catch {
            setFotos([initialFotoUrl]);
          }
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [instanceId, currentOrden]);

  const summary = useMemo(() => {
    const faltantes = diffs.filter((d) => d.diff < 0);
    const sobrantes = diffs.filter((d) => d.diff > 0);
    const totFalt = faltantes.reduce((a, d) => a + Math.abs(d.diff), 0);
    const totSobr = sobrantes.reduce((a, d) => a + d.diff, 0);
    const totBajo = lowStock.reduce((a, r) => a + r.faltan, 0);
    return { faltantes, sobrantes, totFalt, totSobr, totBajo };
  }, [diffs, lowStock]);

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Sin sesión");
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${user.id}/${instanceId}/${currentStageId}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("process-photos").upload(path, file, { upsert: true });
      if (error) throw error;
      setFotos((prev) => [...prev, path]);
      toast({ title: "Foto adjuntada" });
    } catch (e: any) {
      toast({ title: "Error al subir", description: e.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleConfirm = () => {
    const lineas: string[] = [];
    if (categoria) lineas.push(`Categoría auditada: ${categoria}`);
    lineas.push("");
    lineas.push("=== RESUMEN COMPARATIVO ===");
    lineas.push(`• Ítems con diferencia: ${diffs.length} (${summary.totFalt} u. faltantes / ${summary.totSobr} u. sobrantes)`);
    lineas.push(`• Productos con bajo stock: ${lowStock.length} (faltan ${summary.totBajo} u. para llegar al mínimo/óptimo)`);

    if (summary.faltantes.length) {
      lineas.push("");
      lineas.push("FALTANTES (conteo < sistema):");
      for (const d of summary.faltantes) {
        lineas.push(`  - ${d.producto}${d.variante ? ` [${d.variante}]` : ""}: esperado ${d.esperado} / contado ${d.contado} → faltan ${Math.abs(d.diff)} u.`);
      }
    }
    if (summary.sobrantes.length) {
      lineas.push("");
      lineas.push("SOBRANTES (conteo > sistema):");
      for (const d of summary.sobrantes) {
        lineas.push(`  - ${d.producto}${d.variante ? ` [${d.variante}]` : ""}: esperado ${d.esperado} / contado ${d.contado} → sobran ${d.diff} u.`);
      }
    }
    if (lowStock.length) {
      lineas.push("");
      lineas.push("BAJO STOCK (stock actual < mínimo/óptimo):");
      for (const r of lowStock) {
        lineas.push(`  - ${r.name}: stock ${r.stock} / mínimo ${r.min_stock} → reponer ${r.faltan} u.`);
      }
    }
    if (comentario.trim()) {
      lineas.push("");
      lineas.push("Comentario del gestor:");
      lineas.push(comentario.trim());
    }
    if (fotos.length) {
      lineas.push("");
      lineas.push(`Fotos: ${fotos.length} adjunto(s)`);
    }

    onConfirm({
      nota: lineas.join("\n"),
      foto_url: fotos.length ? JSON.stringify(fotos) : null,
    });
  };

  if (loading) {
    return (
      <Card className="border-primary/40">
        <CardContent className="py-8 flex justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/40">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Comparación con sistema</CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          Resumen automático de diferencias detectadas y productos con bajo stock. Agregá comentarios y fotos si lo necesitás.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* KPIs */}
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg border border-orange-500/40 bg-orange-500/10 p-3 text-center">
            <div className="text-[11px] text-muted-foreground">Faltantes</div>
            <div className="text-xl font-bold text-orange-500">{summary.totFalt}</div>
            <div className="text-[10px] text-muted-foreground">{summary.faltantes.length} ítems</div>
          </div>
          <div className="rounded-lg border border-blue-500/40 bg-blue-500/10 p-3 text-center">
            <div className="text-[11px] text-muted-foreground">Sobrantes</div>
            <div className="text-xl font-bold text-blue-500">{summary.totSobr}</div>
            <div className="text-[10px] text-muted-foreground">{summary.sobrantes.length} ítems</div>
          </div>
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-center">
            <div className="text-[11px] text-muted-foreground">Bajo stock</div>
            <div className="text-xl font-bold text-red-500">{summary.totBajo}</div>
            <div className="text-[10px] text-muted-foreground">{lowStock.length} productos</div>
          </div>
        </div>

        {/* Diferencias del conteo */}
        {diffs.length > 0 ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <AlertTriangle className="w-4 h-4 text-orange-500" />
              Diferencias detectadas{categoria ? ` en ${categoria}` : ""}
            </div>
            <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
              {diffs.map((d, i) => (
                <div key={i} className="flex items-center justify-between gap-2 p-2 rounded border border-border text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{d.producto}</div>
                    {d.variante && <div className="text-[11px] text-muted-foreground truncate">{d.variante}</div>}
                  </div>
                  <div className="text-xs text-muted-foreground shrink-0">
                    esp {d.esperado} / cont {d.contado}
                  </div>
                  <Badge variant="outline" className={d.diff < 0 ? "border-orange-500/60 text-orange-500" : "border-blue-500/60 text-blue-500"}>
                    {d.diff > 0 ? `+${d.diff}` : d.diff}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 p-3 rounded border border-green-500/40 bg-green-500/10 text-sm text-green-500">
            <CheckCircle className="w-4 h-4" /> Sin diferencias entre el conteo físico y el sistema.
          </div>
        )}

        {/* Bajo stock */}
        {lowStock.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <TrendingDown className="w-4 h-4 text-red-500" />
              Productos con bajo stock ({lowStock.length})
            </div>
            <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
              {lowStock.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-2 p-2 rounded border border-border text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Package className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <span className="truncate">{r.name}</span>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground shrink-0">
                    {r.stock} / mín {r.min_stock}
                  </div>
                  <Badge variant="outline" className="border-red-500/60 text-red-500">
                    +{r.faltan} u.
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Comentario */}
        <div>
          <label className="text-sm font-medium block mb-1">
            Comentario del gestor <span className="text-muted-foreground text-xs">(opcional)</span>
          </label>
          <Textarea
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            rows={3}
            placeholder="Ej: hay 2 cajas dañadas por humedad en el sector B; falta confirmar si hubo devoluciones pendientes…"
          />
        </div>

        {/* Fotos múltiples */}
        <div>
          <label className="text-sm font-medium block mb-2">
            Fotos de faltantes / productos dañados <span className="text-muted-foreground text-xs">(opcional)</span>
          </label>
          {fotos.length > 0 && (
            <div className="grid grid-cols-3 gap-2 mb-2">
              {fotos.map((p, i) => (
                <div key={i} className="relative rounded border border-border bg-card p-2 text-[10px] flex items-center justify-between gap-1">
                  <span className="truncate">📷 #{i + 1}</span>
                  <button
                    type="button"
                    onClick={() => setFotos((prev) => prev.filter((_, idx) => idx !== i))}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label="Quitar foto"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <label className="flex items-center justify-center gap-2 border-2 border-dashed border-border rounded-md p-4 cursor-pointer hover:border-primary">
            {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Camera className="w-5 h-5" />}
            <span className="text-sm">{fotos.length ? "Agregar otra foto" : "Sacar / subir foto"}</span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
            />
          </label>
        </div>

        <div className="flex gap-2 pt-1">
          <Button onClick={handleConfirm} disabled={saving} className="flex-1">
            {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-1" />}
            {isLast ? "Finalizar proceso" : "Confirmar etapa"}
          </Button>
          <Button variant="ghost" onClick={onCancel}>Cancelar</Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default StockComparisonStage;
