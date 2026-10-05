import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { formatPrice } from "@/lib/currency";
import { REFUND_ESTADO_LABEL, type RefundEstado } from "@/lib/cancellationRefund";

interface Row {
  estado: RefundEstado; monto_bruto: number; monto_retenido: number; monto_sugerido: number;
  monto_devuelto: number; moneda: string; regla_aplicada: string | null; politica_texto: string | null; ajustado_manual: boolean;
}

/** Ficha de reserva cancelada: devolución sugerida, devuelto, pendiente y estado. */
export default function ReservationRefundObligationCard({ reservationId, fallbackDevuelto, moneda }: {
  reservationId: string; fallbackDevuelto: number; moneda: string;
}) {
  const [row, setRow] = useState<Row | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [monto, setMonto] = useState("");
  const [motivo, setMotivo] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from("reservation_refund_obligations" as any).select("*").eq("reservation_id", reservationId).maybeSingle();
    setRow((data as any) ?? null);
    setLoaded(true);
  }, [reservationId]);
  useEffect(() => { load(); }, [load]);

  if (!loaded) return null;
  const m = row?.moneda || moneda;
  const f = (n: number) => formatPrice(Number(n || 0), m);

  if (!row) {
    // Cancelación histórica sin obligación registrada: solo se derivan las devoluciones reales.
    return (
      <div className="rounded-xl border border-border/50 p-3 text-xs space-y-1">
        <p className="font-semibold text-muted-foreground uppercase tracking-wider">Devolución</p>
        <p>Devuelto: <span className="font-semibold">{f(fallbackDevuelto)}</span></p>
        <p className="text-muted-foreground">Cancelación anterior al cálculo de devolución sugerida.</p>
      </div>
    );
  }

  const pendiente = Math.max(0, Number(row.monto_sugerido) - Number(row.monto_devuelto));
  const guardar = async () => {
    const n = Number(monto.replace(/\./g, "").replace(",", "."));
    if (!Number.isFinite(n)) { toast({ title: "Monto inválido", variant: "destructive" }); return; }
    setBusy(true);
    const { error } = await supabase.rpc("ajustar_obligacion_devolucion" as any, { p_reservation_id: reservationId, p_monto: n, p_motivo: motivo });
    setBusy(false);
    if (error) { toast({ title: "No se pudo guardar", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Monto de devolución actualizado" });
    setEditing(false); setMonto(""); setMotivo("");
    load();
  };

  return (
    <div className="rounded-xl border border-border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Devolución por cancelación</h4>
        <Badge variant={row.estado === "completada" || row.estado === "no_corresponde" ? "outline" : "default"}>{REFUND_ESTADO_LABEL[row.estado]}</Badge>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div><p className="text-sm font-semibold">{row.estado === "revision_manual" ? "A definir" : f(row.monto_sugerido)}</p><p className="text-[10px] text-muted-foreground">Devolución sugerida</p></div>
        <div><p className="text-sm font-semibold">{f(row.monto_devuelto)}</p><p className="text-[10px] text-muted-foreground">Devuelto</p></div>
        <div><p className={`text-sm font-semibold ${pendiente > 0 ? "text-primary" : ""}`}>{f(pendiente)}</p><p className="text-[10px] text-muted-foreground">Pendiente de devolver</p></div>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Pagado {f(row.monto_bruto)} · No reembolsable {f(row.monto_retenido)}{row.ajustado_manual ? " · ajustado a mano" : ""}
      </p>
      {row.regla_aplicada && <p className="text-xs">{row.regla_aplicada}</p>}
      {row.estado === "revision_manual" && row.politica_texto && (
        <div className="rounded-md border border-border bg-muted/30 p-2 text-xs whitespace-pre-wrap max-h-40 overflow-y-auto">{row.politica_texto}</div>
      )}
      {row.estado !== "completada" && (editing ? (
        <div className="space-y-2">
          <Input inputMode="decimal" placeholder="Monto a devolver" value={monto} onChange={(e) => setMonto(e.target.value)} />
          <Input placeholder="Motivo del ajuste" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          <div className="flex gap-2">
            <Button size="sm" disabled={busy || !monto || !motivo.trim()} onClick={guardar}>Guardar</Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancelar</Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
          {row.estado === "revision_manual" ? "Cargar monto a devolver" : "Ajustar monto sugerido"}
        </Button>
      ))}
    </div>
  );
}
