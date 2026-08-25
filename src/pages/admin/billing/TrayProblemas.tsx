import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, RefreshCw, Loader2, AlertTriangle } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { formatPrice } from "@/lib/currency";
import { InvoiceModal } from "./InvoiceModal";
import { describeFacturaProblem } from "@/lib/billingInvoiceLink";

const PAGE_SIZE = 50;
const COLS =
  "id, cliente_nombre, cliente_cuit, condicion_fiscal, concepto, monto, moneda, estado, cae, emisor_id, alumno_id, segmento, created_at, facturacion_cola_id";

interface Row {
  id: string;
  cliente_nombre: string;
  cliente_cuit: string | null;
  condicion_fiscal: string;
  concepto: string;
  monto: number;
  moneda: string | null;
  estado: string;
  cae: string | null;
  emisor_id: string | null;
  alumno_id: string | null;
  segmento: string | null;
  created_at: string;
}

const SEGMENTO_LABEL: Record<string, string> = { escuela: "Escuela", viajes: "Viajes", tienda: "Tienda" };

export function TrayProblemas({ emisores, onChanged }: { emisores: any[]; onChanged?: () => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [origen, setOrigen] = useState<"todos" | "escuela" | "viajes" | "tienda">("todos");
  const [target, setTarget] = useState<Row | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  const fetchPage = useCallback(
    async (from: number) => {
      let q = supabase
        .from("facturas")
        .select(COLS)
        .or("estado.eq.error,and(estado.eq.emitida,cae.is.null)")
        .order("created_at", { ascending: false })
        .range(from, from + PAGE_SIZE - 1);
      if (origen !== "todos") q = q.eq("segmento", origen);
      if (debounced) q = q.ilike("cliente_nombre", `%${debounced}%`);
      const { data, error } = await q;
      if (error) throw error;
      return ((data as any[]) || []).map((r) => ({ ...r, monto: Number(r.monto || 0) })) as Row[];
    },
    [origen, debounced],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const page = await fetchPage(0);
      setRows(page);
      setHasMore(page.length === PAGE_SIZE);
    } catch (e: any) {
      toast({ title: "Error al cargar", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [fetchPage]);

  useEffect(() => { load(); }, [load]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const page = await fetchPage(rows.length);
      setRows((prev) => [...prev, ...page]);
      setHasMore(page.length === PAGE_SIZE);
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar cliente..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={origen} onValueChange={(v: any) => setOrigen(v)}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="escuela">Escuela</SelectItem>
            <SelectItem value="viajes">Viajes</SelectItem>
            <SelectItem value="tienda">Tienda</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Actualizar
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground text-center py-8">Cargando...</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">No hay facturas con problemas. 🎉</p>
      ) : (
        <div className="space-y-2">
          {rows.map((f) => (
            <div key={f.id} className="rounded-xl border border-border bg-card p-4 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-foreground">{f.cliente_nombre}</p>
                  {f.segmento && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded border border-border text-muted-foreground">
                      {SEGMENTO_LABEL[f.segmento] || f.segmento}
                    </span>
                  )}
                  <Badge variant="destructive" className="text-[10px] gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    {describeFacturaProblem(f) || "Requiere revisión"}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground truncate">{f.concepto}</p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <p className="text-sm font-bold tabular-nums">{formatPrice(f.monto, (f.moneda || "ARS") as any)}</p>
                <Button size="sm" onClick={() => setTarget(f)}>Resolver</Button>
              </div>
            </div>
          ))}

          {hasMore && (
            <div className="pt-2 text-center">
              <Button variant="outline" size="sm" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null} Cargar más
              </Button>
            </div>
          )}
        </div>
      )}

      <InvoiceModal
        factura={target as any}
        emisores={emisores as any}
        open={!!target}
        onOpenChange={(o) => { if (!o) setTarget(null); }}
        onEmitted={() => { setTarget(null); load(); onChanged?.(); }}
      />
    </div>
  );
}
