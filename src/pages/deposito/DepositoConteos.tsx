import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, ClipboardList, ChevronLeft, User, Package } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface CountRow {
  id: string;
  categoria: string | null;
  confirmado_por_nombre: string | null;
  total_items: number;
  items_coinciden: number;
  items_diferencia: number;
  items_sin_contar: number;
  unidades_faltantes: number;
  unidades_sobrantes: number;
  movimientos_generados: number;
  observaciones: string | null;
  reporte: string | null;
  created_at: string;
}

interface ItemRow {
  id: string;
  product_name: string | null;
  variante: string | null;
  esperado: number | null;
  contado: number | null;
  diferencia: number | null;
  movement_id: string | null;
}

const fmtFecha = (iso: string) =>
  new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

const DepositoConteos = () => {
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState<CountRow[]>([]);
  const [selected, setSelected] = useState<CountRow | null>(null);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("stock_counts")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
      setCounts((data as any) || []);
      setLoading(false);
    })();
  }, []);

  const openCount = async (c: CountRow) => {
    setSelected(c);
    setLoadingItems(true);
    const { data, error } = await supabase
      .from("stock_count_items")
      .select("id, product_name, variante, esperado, contado, diferencia, movement_id")
      .eq("count_id", c.id)
      .order("product_name", { ascending: true });
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    setItems((data as any) || []);
    setLoadingItems(false);
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Cargando conteos…
      </div>
    );
  }

  if (selected) {
    const conDif = items.filter((i) => (i.diferencia ?? 0) !== 0 && i.contado !== null);
    return (
      <div className="p-3 md:p-6 space-y-4">
        <Button variant="ghost" size="sm" onClick={() => setSelected(null)} className="gap-1">
          <ChevronLeft className="w-4 h-4" /> Volver
        </Button>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-primary" />
              {selected.categoria || "Conteo de stock"}
            </CardTitle>
            <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-2">
              <span>{fmtFecha(selected.created_at)}</span>
              <span className="flex items-center gap-1">
                <User className="w-3 h-3" /> {selected.confirmado_por_nombre || "—"}
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="outline">{selected.total_items} ítems</Badge>
              <Badge variant="outline" className="text-green-500 border-green-500/40">{selected.items_coinciden} coinciden</Badge>
              <Badge variant="outline" className="text-orange-500 border-orange-500/40">{selected.items_diferencia} con diferencia</Badge>
              <Badge variant="outline">{selected.items_sin_contar} sin contar</Badge>
              <Badge variant="outline" className="text-red-500 border-red-500/40">-{selected.unidades_faltantes} u.</Badge>
              <Badge variant="outline" className="text-green-500 border-green-500/40">+{selected.unidades_sobrantes} u.</Badge>
              <Badge>{selected.movimientos_generados} movimientos</Badge>
            </div>
            {selected.observaciones && (
              <p className="text-sm text-muted-foreground">Observaciones: {selected.observaciones}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Diferencias por variante ({conDif.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {loadingItems ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Loader2 className="w-4 h-4 animate-spin" /> Cargando…
              </div>
            ) : conDif.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin diferencias registradas.</p>
            ) : (
              conDif.map((i) => (
                <div key={i.id} className="flex items-center gap-2 p-2 rounded-lg border border-border bg-card">
                  <Package className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{i.product_name}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {i.variante ? i.variante.replace(/\|/g, " · ") + " · " : ""}esp. {i.esperado} / cont. {i.contado}
                      {i.movement_id ? " · transacción generada" : ""}
                    </div>
                  </div>
                  <span className={`text-sm font-semibold ${(i.diferencia ?? 0) > 0 ? "text-green-500" : "text-red-500"}`}>
                    {(i.diferencia ?? 0) > 0 ? `+${i.diferencia}` : i.diferencia}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {selected.reporte && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Reporte final</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="text-xs whitespace-pre-wrap text-muted-foreground">{selected.reporte}</pre>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  return (
    <div className="p-3 md:p-6 space-y-3">
      <h1 className="font-heading font-bold uppercase tracking-wider text-lg flex items-center gap-2">
        <ClipboardList className="w-5 h-5 text-primary" /> Conteos de stock
      </h1>
      {counts.length === 0 ? (
        <p className="text-sm text-muted-foreground">Todavía no hay conteos registrados.</p>
      ) : (
        counts.map((c) => (
          <button
            key={c.id}
            onClick={() => openCount(c)}
            className="w-full text-left p-3 rounded-lg border border-border bg-card hover:bg-accent/40 transition-colors"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-sm truncate">{c.categoria || "Conteo"}</span>
              <span className="text-[11px] text-muted-foreground shrink-0">{fmtFecha(c.created_at)}</span>
            </div>
            <div className="text-[11px] text-muted-foreground mt-1">
              Por {c.confirmado_por_nombre || "—"} · {c.items_diferencia} diferencias · {c.movimientos_generados} movimientos
            </div>
          </button>
        ))
      )}
    </div>
  );
};

export default DepositoConteos;
