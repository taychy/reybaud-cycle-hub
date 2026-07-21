import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Truck, ArrowRight, AlertCircle } from "lucide-react";
import { formatPrice } from "@/lib/currency";

interface Summary {
  list_id: string;
  titulo: string;
  caja_estado: string;
  items_total: number;
  items_entregados: number;
  items_pendientes: number;
  esperado_cobrar: number;
  total_cobrado: number;
  total_pendiente: number;
  costo_total_mercaderia: number;
  pagado_a_proveedor: number;
  saldo_a_proveedor: number;
  margen_bruto: number;
  cobros_sin_validar: number;
}

const DeliveryCashWidget = () => {
  const [rows, setRows] = useState<Summary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: lists } = await supabase
        .from("delivery_lists")
        .select("id")
        .eq("caja_estado", "abierta")
        .order("created_at", { ascending: false })
        .limit(20);
      const ids = (lists || []).map((l: any) => l.id);
      if (ids.length === 0) {
        setRows([]);
        setLoading(false);
        return;
      }
      const results = await Promise.all(
        ids.map((id) =>
          supabase.rpc("delivery_list_summary_row", { p_list_id: id }).then((r) => r.data?.[0]),
        ),
      );
      setRows(results.filter(Boolean) as Summary[]);
      setLoading(false);
    })();
  }, []);

  const totalCobrosSinValidar = rows.reduce((s, r) => s + (r.cobros_sin_validar || 0), 0);
  const totalPendienteCobro = rows.reduce((s, r) => s + Number(r.total_pendiente || 0), 0);
  const totalSaldoProveedor = rows.reduce((s, r) => s + Number(r.saldo_a_proveedor || 0), 0);
  const totalCobrado = rows.reduce((s, r) => s + Number(r.total_cobrado || 0), 0);
  const totalPendientesEntrega = rows.reduce((s, r) => s + (r.items_pendientes || 0), 0);

  if (loading) return null;
  if (rows.length === 0) return null;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Truck className="w-4 h-4 text-primary" />
          Tienda / Entregas
          {totalCobrosSinValidar > 0 && (
            <Badge variant="destructive" className="text-[10px]">
              {totalCobrosSinValidar} sin validar
            </Badge>
          )}
        </CardTitle>
        <Button size="sm" variant="ghost" asChild>
          <Link to="/admin/entregas">
            Ver <ArrowRight className="w-3 h-3 ml-1" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
          <div className="rounded-md bg-secondary/50 p-2">
            <div className="text-[10px] text-muted-foreground uppercase">Cajas abiertas</div>
            <div className="font-heading text-lg">{rows.length}</div>
          </div>
          <div className="rounded-md bg-secondary/50 p-2">
            <div className="text-[10px] text-muted-foreground uppercase">Pend. entregar</div>
            <div className="font-heading text-lg">{totalPendientesEntrega}</div>
          </div>
          <div className="rounded-md bg-secondary/50 p-2">
            <div className="text-[10px] text-muted-foreground uppercase">Cobrado</div>
            <div className="font-heading text-lg text-primary">{formatPrice(totalCobrado, "ARS")}</div>
          </div>
          <div className="rounded-md bg-secondary/50 p-2">
            <div className="text-[10px] text-muted-foreground uppercase">Por cobrar</div>
            <div className="font-heading text-lg text-amber-500">{formatPrice(totalPendienteCobro, "ARS")}</div>
          </div>
        </div>
        {totalSaldoProveedor > 0 && (
          <div className="text-xs flex items-center gap-1.5 text-amber-500 bg-amber-500/10 rounded-md p-2">
            <AlertCircle className="w-3.5 h-3.5" />
            Saldo a pagar a proveedor: <span className="font-medium">{formatPrice(totalSaldoProveedor, "ARS")}</span>
          </div>
        )}
        <div className="space-y-1.5">
          {rows.slice(0, 4).map((r) => (
            <Link
              key={r.list_id}
              to={`/admin/entregas-caja?list=${r.list_id}`}
              className="flex items-center justify-between text-xs rounded-md hover:bg-secondary/50 px-2 py-1.5"
            >
              <span className="truncate flex items-center gap-1.5">
                <span className="font-medium">{r.titulo}</span>
                {r.cobros_sin_validar > 0 && (
                  <Badge variant="destructive" className="text-[9px] h-4">
                    {r.cobros_sin_validar}
                  </Badge>
                )}
              </span>
              <span className="text-muted-foreground shrink-0">
                {r.items_entregados}/{r.items_total} · {formatPrice(r.total_cobrado, "ARS")}
              </span>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default DeliveryCashWidget;
