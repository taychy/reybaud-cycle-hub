import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, FileText } from "lucide-react";
import { formatPrice } from "@/lib/currency";
import DayNavigatorBar from "@/components/admin/DayNavigatorBar";
import { useDayCursor } from "@/hooks/useDayCursor";
import { BillingInvoiceLauncher, InvoiceSource } from "@/components/admin/BillingInvoiceLauncher";

type ColaRow = {
  id: string;
  alumno_id: string | null;
  cliente_nombre: string | null;
  cliente_cuit: string | null;
  concepto: string;
  monto: number;
  moneda: string;
  metodo_pago: string | null;
  origen_registro: string | null;
  referencia_tipo: string;
  referencia_id: string;
  segmento: string | null;
  pagado_at: string;
};

const SEGMENTO_TO_INVOICE: Record<string, InvoiceSource["segmento"]> = {
  escuela: "escuela",
  eventos: "viajes",
  tienda: "tienda",
};

const FacturasPorDiaPage = () => {
  const day = useDayCursor({ maxDaysBack: 60 });
  const [rows, setRows] = useState<ColaRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("facturacion_cola" as any)
      .select("id, alumno_id, cliente_nombre, cliente_cuit, concepto, monto, moneda, metodo_pago, origen_registro, referencia_tipo, referencia_id, segmento, pagado_at")
      .eq("estado", "pendiente")
      .gte("pagado_at", `${day.selected}T00:00:00`)
      .lte("pagado_at", `${day.selected}T23:59:59.999`)
      .order("pagado_at", { ascending: true });
    if (!error && data) setRows(data as unknown as ColaRow[]);
    setLoading(false);
  }, [day.selected]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link to="/admin/resumen">
          <Button variant="ghost" size="icon" className="h-8 w-8"><ArrowLeft className="w-4 h-4" /></Button>
        </Link>
        <div>
          <h1 className="text-2xl font-heading font-bold uppercase tracking-wider">Facturas por realizar</h1>
          <p className="text-sm text-muted-foreground">Cobros confirmados sin factura, día por día</p>
        </div>
      </div>

      <Card>
        <CardContent className="p-4 space-y-4">
          <DayNavigatorBar
            label={day.label}
            selected={day.selected}
            minISO={day.minISO}
            todayISO={day.todayISO}
            canGoPrev={day.canGoPrev}
            canGoNext={day.canGoNext}
            isToday={day.isToday}
            onPrev={day.goPrev}
            onNext={day.goNext}
            onToday={day.goToday}
            onPick={day.goTo}
            rightContent={
              <Badge variant="outline" className="border-yellow-500/40 text-yellow-600">
                {rows.length} pendiente{rows.length === 1 ? "" : "s"} este día
              </Badge>
            }
          />

          {loading ? (
            <div className="py-12 text-center text-muted-foreground animate-pulse">Cargando...</div>
          ) : rows.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">Sin facturas pendientes para este día. 🎉</div>
          ) : (
            <div className="space-y-2">
              {rows.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-3 border rounded-lg px-4 py-3 border-yellow-500/30 bg-yellow-500/5">
                  <div className="flex items-center gap-3 min-w-0">
                    <FileText className="w-4 h-4 shrink-0 text-yellow-600" />
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{r.cliente_nombre || "—"}</div>
                      <p className="text-xs text-muted-foreground truncate">{r.concepto} · {formatPrice(r.monto, r.moneda)}</p>
                    </div>
                  </div>
                  <BillingInvoiceLauncher
                    variant="default"
                    source={{
                      alumno_id: r.alumno_id || "",
                      cliente_nombre: r.cliente_nombre || "—",
                      cliente_cuit: r.cliente_cuit,
                      concepto: r.concepto,
                      monto: r.monto,
                      moneda: r.moneda,
                      referencia_tipo: (r.referencia_tipo as InvoiceSource["referencia_tipo"]) || "suscripcion",
                      referencia_id: r.referencia_id,
                      segmento: SEGMENTO_TO_INVOICE[r.segmento || "escuela"] || "escuela",
                      metodo_pago: r.metodo_pago,
                      origen_registro: r.origen_registro,
                    }}
                    onEmitted={load}
                  />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default FacturasPorDiaPage;
