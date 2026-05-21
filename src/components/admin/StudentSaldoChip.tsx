import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Wallet } from "lucide-react";
import { formatPrice } from "@/lib/currency";

interface SaldoRow {
  moneda: string;
  total_cargos: number;
  total_pagos: number;
  saldo: number;
}

interface Props {
  alumnoId: string;
  onClick?: () => void;
}

/**
 * Chip compacto que muestra el saldo del alumno por moneda.
 * Clickeable: típicamente scrollea a la sección de cuenta corriente.
 */
export function StudentSaldoChip({ alumnoId, onClick }: Props) {
  const [saldos, setSaldos] = useState<SaldoRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    supabase
      .rpc("get_saldo_alumno" as any, { p_alumno_id: alumnoId })
      .then(({ data }) => {
        if (!cancelled) {
          setSaldos((data || []) as SaldoRow[]);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [alumnoId]);

  if (loading) return null;

  // Solo mostrar monedas con saldo distinto de 0
  const conSaldo = saldos.filter((s) => Math.abs(Number(s.saldo) || 0) > 0.01);

  if (conSaldo.length === 0) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-emerald-400/80 hover:text-emerald-400 transition-colors"
        title="Cuenta corriente al día — clic para abrir"
      >
        <Wallet className="w-3 h-3" />
        Al día
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 flex-wrap"
      title="Clic para abrir cuenta corriente"
    >
      <Wallet className="w-3 h-3 text-muted-foreground" />
      {conSaldo.map((s) => {
        const saldo = Number(s.saldo) || 0;
        const isDeuda = saldo > 0;
        return (
          <Badge
            key={s.moneda}
            variant="outline"
            className={`text-[10px] font-mono whitespace-nowrap ${
              isDeuda
                ? "bg-destructive/15 text-destructive border-destructive/30 hover:bg-destructive/25"
                : "bg-emerald-500/15 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/25"
            }`}
          >
            {isDeuda ? "Debe" : "A favor"} {formatPrice(Math.abs(saldo), s.moneda)}
          </Badge>
        );
      })}
    </button>
  );
}
