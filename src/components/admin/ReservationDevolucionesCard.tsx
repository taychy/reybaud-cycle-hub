import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { formatPrice } from "@/lib/currency";
import { RotateCcw } from "lucide-react";

interface DevolucionRow {
  id: string;
  monto: number;
  moneda: string;
  fecha: string;
  metodo: string;
  motivo: string;
  referencia: string | null;
  gasto_id: string | null;
}

/**
 * Historial de devoluciones reales de una reserva.
 * La fuente del dinero sigue siendo public.gastos: acá sólo se proyecta.
 */
export default function ReservationDevolucionesCard({ reservationId }: { reservationId: string }) {
  const [rows, setRows] = useState<DevolucionRow[]>([]);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("devoluciones")
      .select("id, monto, moneda, fecha, metodo, motivo, referencia, gasto_id")
      .eq("reservation_id", reservationId)
      .order("fecha", { ascending: false });
    setRows((data || []) as DevolucionRow[]);
  }, [reservationId]);

  useEffect(() => { load(); }, [load]);

  if (rows.length === 0) return null;

  const moneda = rows[0]?.moneda || "ARS";
  const total = rows.reduce((s, r) => s + Number(r.monto || 0), 0);

  return (
    <div className="rounded-xl border border-border/50 bg-card/30 p-4 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <RotateCcw className="w-3.5 h-3.5" /> Devoluciones
        </span>
        <span className="text-sm font-bold">{formatPrice(total, moneda)}</span>
      </div>
      <div className="space-y-1.5">
        {rows.map((d) => (
          <div key={d.id} className="flex items-start justify-between gap-2 text-xs border-t border-border/40 pt-1.5">
            <div className="min-w-0">
              <div className="truncate">{d.motivo}</div>
              <div className="text-[11px] text-muted-foreground">
                {d.fecha} · {d.metodo}
                {d.referencia ? ` · ${d.referencia}` : ""}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {d.gasto_id && <Badge variant="outline" className="text-[10px]">Gasto</Badge>}
              <span className="font-semibold">- {formatPrice(Number(d.monto), d.moneda)}</span>
            </div>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-muted-foreground">
        Total reembolsado a este participante por esta reserva.
      </p>
    </div>
  );
}
