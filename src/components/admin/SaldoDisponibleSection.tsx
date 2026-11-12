import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Wallet } from "lucide-react";
import { formatPrice } from "@/lib/currency";
import MultiDebtImputationDialog from "@/components/admin/MultiDebtImputationDialog";

const sb: any = supabase;

interface PagoDisponible {
  pago_origen_tipo: "mp_movement";
  pago_origen_id: string;
  mp_payment_id: string | null;
  fecha: string;
  concepto: string;
  moneda: string;
  monto_bruto: number;
  monto_imputado: number;
  disponible: number;
}

export function SaldoDisponibleSection({ alumnoId, onChanged }: { alumnoId: string; onChanged?: () => void }) {
  const [pagos, setPagos] = useState<PagoDisponible[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<PagoDisponible | null>(null);

  const fetchPagos = useCallback(async () => {
    setLoading(true);
    const { data, error } = await sb
      .from("vw_pagos_disponibles")
      .select("*")
      .eq("alumno_id", alumnoId)
      .gt("disponible", 0)
      .order("fecha", { ascending: false });
    setLoading(false);
    if (!error) setPagos((data || []) as PagoDisponible[]);
  }, [alumnoId]);

  useEffect(() => { void fetchPagos(); }, [fetchPagos]);

  if (loading || pagos.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Wallet className="h-4 w-4 text-emerald-400" />
        <h4 className="text-sm font-heading font-semibold uppercase tracking-wider">Saldo disponible</h4>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {pagos.map((p) => (
          <Card key={`${p.pago_origen_tipo}:${p.pago_origen_id}`} className="p-3 border-emerald-500/30 bg-emerald-500/5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-xs text-muted-foreground truncate">
                  {p.concepto}{p.mp_payment_id ? ` · op ${p.mp_payment_id}` : ""}
                </div>
                <div className="text-xl font-heading font-bold text-emerald-400">{formatPrice(Number(p.disponible), p.moneda)}</div>
                {Number(p.monto_imputado) > 0 && (
                  <Badge variant="outline" className="mt-1 text-[10px]">
                    de {formatPrice(Number(p.monto_bruto), p.moneda)} · aplicado {formatPrice(Number(p.monto_imputado), p.moneda)}
                  </Badge>
                )}
              </div>
              <Button size="sm" variant="outline" onClick={() => setSelected(p)}>Aplicar a deudas</Button>
            </div>
          </Card>
        ))}
      </div>

      <MultiDebtImputationDialog
        open={!!selected}
        onOpenChange={(open) => !open && setSelected(null)}
        alumnoId={alumnoId}
        payment={selected ? {
          sourceType: "mp_movement",
          sourceId: selected.pago_origen_id,
          label: `${selected.concepto} · disponible ${formatPrice(Number(selected.disponible), selected.moneda)}`,
          currency: selected.moneda,
          gross: Number(selected.monto_bruto),
          available: Number(selected.disponible),
        } : null}
        onChanged={async () => { await fetchPagos(); onChanged?.(); }}
      />
    </div>
  );
}

export default SaldoDisponibleSection;
