import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Lock, LockOpen, Store, ChevronRight } from "lucide-react";
import { formatPrice } from "@/lib/currency";

interface DeliveryList {
  id: string;
  titulo: string;
  caja_estado: string;
  moneda_costo: string | null;
  created_at: string;
}

interface Summary {
  list_id: string;
  items_total: number;
  items_entregados: number;
  total_cobrado: number;
  total_pendiente: number;
  saldo_a_proveedor: number;
  margen_bruto: number;
  cobros_sin_validar: number;
}

const AdminEntregasCaja = () => {
  const navigate = useNavigate();
  const [lists, setLists] = useState<DeliveryList[]>([]);
  const [summaries, setSummaries] = useState<Record<string, Summary>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"abiertas" | "cerradas" | "todas">("abiertas");

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("delivery_lists")
      .select("id, titulo, caja_estado, moneda_costo, created_at")
      .order("created_at", { ascending: false });
    const ls = (data as DeliveryList[]) || [];
    setLists(ls);
    const results = await Promise.all(
      ls.map((l) => supabase.rpc("delivery_list_summary_row", { p_list_id: l.id })),
    );
    const map: Record<string, Summary> = {};
    results.forEach((r, i) => {
      if (r.data && (r.data as any[])[0]) map[ls[i].id] = (r.data as any)[0] as Summary;
    });
    setSummaries(map);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const visibleLists = useMemo(
    () =>
      lists.filter((l) => {
        if (filter === "abiertas") return l.caja_estado === "abierta";
        if (filter === "cerradas") return l.caja_estado === "cerrada";
        return true;
      }),
    [lists, filter],
  );

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Store className="w-6 h-6 text-primary" />
          <div>
            <h1 className="font-heading text-2xl">Entregas / Caja</h1>
            <p className="text-xs text-muted-foreground">
              Contabilidad por lote de entrega. Cada lista es una caja independiente.
            </p>
          </div>
        </div>
        <div className="flex gap-1 rounded-lg bg-secondary p-1">
          {(["abiertas", "cerradas", "todas"] as const).map((k) => (
            <Button
              key={k}
              size="sm"
              variant={filter === k ? "default" : "ghost"}
              onClick={() => setFilter(k)}
              className="capitalize"
            >
              {k}
            </Button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground animate-pulse">Cargando...</p>
      ) : visibleLists.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            No hay listas en este filtro.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {visibleLists.map((l) => {
            const s = summaries[l.id];
            return (
              <Card
                key={l.id}
                className={`cursor-pointer hover:border-primary/50 transition-colors ${
                  l.caja_estado === "cerrada" ? "opacity-70" : ""
                }`}
                onClick={() => navigate(`/admin/entregas/${l.id}`)}
              >
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                    {l.titulo}
                    <Badge
                      variant={l.caja_estado === "abierta" ? "default" : "secondary"}
                      className="text-[10px]"
                    >
                      {l.caja_estado === "abierta" ? (
                        <><LockOpen className="w-3 h-3 mr-1" /> Abierta</>
                      ) : (
                        <><Lock className="w-3 h-3 mr-1" /> Cerrada</>
                      )}
                    </Badge>
                    {s?.cobros_sin_validar > 0 && (
                      <Badge variant="destructive" className="text-[10px]">
                        {s.cobros_sin_validar} sin validar
                      </Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0 space-y-2">
                  {s && (
                    <>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <div className="text-muted-foreground">Entregas</div>
                          <div className="font-medium">
                            {s.items_entregados}/{s.items_total}
                          </div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Cobrado</div>
                          <div className="font-medium text-primary">
                            {formatPrice(s.total_cobrado, "ARS")}
                          </div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Por cobrar (ARS)</div>
                          <div className="font-medium text-amber-500">
                            {formatPrice(s.total_pendiente, "ARS")}
                          </div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Saldo proveedor</div>
                          <div className="font-medium">
                            {formatPrice(s.saldo_a_proveedor, l.moneda_costo || "ARS")}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-xs pt-1">
                        <span className="text-muted-foreground">
                          Margen: {formatPrice(s.margen_bruto, "ARS")}
                        </span>
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AdminEntregasCaja;
