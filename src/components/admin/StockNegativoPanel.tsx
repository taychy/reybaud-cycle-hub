import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { toast } from "sonner";

interface Row {
  product_id: string;
  producto: string;
  variante: string | null;
  stock: number;
  movimiento_id: string | null;
  fecha: string | null;
  motivo: string | null;
  order_number: number | null;
  order_status: string | null;
  accion_sugerida: string;
}

const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString("es-AR") : "—");

/** Stock negativo: mercadería vendida que el depósito nunca tuvo. Sólo detecta. */
const StockNegativoPanel = () => {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from("vw_stock_negativo" as any).select("*").limit(500);
    if (error) toast.error(error.message);
    else setRows((data as any) || []);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-heading font-bold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-destructive" /> Inconsistencias de stock
          </h2>
          <p className="text-sm text-muted-foreground">
            Productos con stock negativo: se vendió más de lo que había. No se corrigen solos.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Actualizar
        </Button>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="px-4 py-3 text-left font-heading text-xs uppercase">Producto</th>
              <th className="px-4 py-3 text-left font-heading text-xs uppercase">Variante</th>
              <th className="px-4 py-3 text-center font-heading text-xs uppercase">Stock</th>
              <th className="px-4 py-3 text-left font-heading text-xs uppercase">Causa</th>
              <th className="px-4 py-3 text-left font-heading text-xs uppercase">Fecha</th>
              <th className="px-4 py-3 text-left font-heading text-xs uppercase">Acción sugerida</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r, i) => (
              <tr key={`${r.product_id}-${r.variante ?? ""}-${i}`} className="hover:bg-muted/30">
                <td className="px-4 py-2 font-medium text-foreground">{r.producto}</td>
                <td className="px-4 py-2 text-muted-foreground">{r.variante?.split("|").join(" · ") || "—"}</td>
                <td className="px-4 py-2 text-center font-bold text-destructive">{r.stock}</td>
                <td className="px-4 py-2 text-xs text-muted-foreground">
                  {r.order_number ? (
                    <Badge variant="outline" className="text-[10px] mr-1">Pedido #{r.order_number}</Badge>
                  ) : null}
                  {r.motivo || "Sin movimiento identificado"}
                </td>
                <td className="px-4 py-2 text-xs text-muted-foreground whitespace-nowrap">{fmt(r.fecha)}</td>
                <td className="px-4 py-2 text-xs">{r.accion_sugerida}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <div className="p-8 text-center text-muted-foreground">
            {loading ? "Cargando…" : "Sin stock negativo. Todo en orden."}
          </div>
        )}
      </div>
    </div>
  );
};

export default StockNegativoPanel;
