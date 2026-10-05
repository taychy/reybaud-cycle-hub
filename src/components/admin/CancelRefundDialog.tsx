import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { formatPrice } from "@/lib/currency";
import { suggestRefund, REFUND_ESTADO_LABEL, type RefundSuggestion } from "@/lib/cancellationRefund";

/** Paso previo a cancelar: calcula y muestra la devolución sugerida según la política de la reserva. */
export default function CancelRefundDialog({
  reservationId, open, onCancel, onConfirm,
}: {
  reservationId: string | null;
  open: boolean;
  onCancel: () => void;
  onConfirm: (s: RefundSuggestion) => void;
}) {
  const [s, setS] = useState<RefundSuggestion | null>(null);
  const [moneda, setMoneda] = useState("ARS");

  useEffect(() => {
    if (!open || !reservationId) return;
    setS(null);
    (async () => {
      const { data: res } = await supabase.from("event_reservations" as any)
        .select("id, event_id, package_id, terminos_snapshot, currency_snapshot, moneda").eq("id", reservationId).maybeSingle();
      const r: any = res;
      if (!r) return;
      const [{ data: ev }, { data: pays }, { data: pkg }] = await Promise.all([
        supabase.from("events").select("date, metadata").eq("id", r.event_id).maybeSingle(),
        supabase.from("reservation_payments" as any).select("amount, equivalent_amount_event_currency, status").eq("reservation_id", reservationId),
        r.package_id ? supabase.from("event_packages" as any).select("sena").eq("id", r.package_id).maybeSingle() : Promise.resolve({ data: null }),
      ]);
      const bruto = ((pays as any[]) || []).filter((p) => p.status === "validado")
        .reduce((a, p) => a + Number(p.equivalent_amount_event_currency ?? p.amount ?? 0), 0);
      const md: any = (ev as any)?.metadata || {};
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
      setMoneda(r.currency_snapshot || r.moneda || "ARS");
      setS(suggestRefund({
        bruto, eventDate: (ev as any)?.date ?? null, cancelDate: today,
        snapshot: r.terminos_snapshot, eventMetadata: md,
        senaFallback: (pkg as any)?.sena ?? md.deposit_amount ?? null,
      }));
    })();
  }, [open, reservationId]);

  const f = (n: number) => formatPrice(n, moneda);

  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <AlertDialogContent className="max-h-[90vh] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle>Cancelar reserva · Devolución sugerida</AlertDialogTitle>
          <AlertDialogDescription>
            Al confirmar, la devolución queda como pendiente. No se mueve dinero ni se crea un gasto hasta registrar el reintegro real.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {!s ? (
          <p className="text-sm text-muted-foreground">Calculando…</p>
        ) : (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div><p className="font-semibold">{f(s.bruto)}</p><p className="text-[10px] text-muted-foreground">Pagos recibidos</p></div>
              <div><p className="font-semibold">{s.estado === "revision_manual" ? "—" : f(s.retenido)}</p><p className="text-[10px] text-muted-foreground">No reembolsable</p></div>
              <div><p className="font-semibold text-primary">{s.estado === "revision_manual" ? "A definir" : f(s.sugerido)}</p><p className="text-[10px] text-muted-foreground">Sugerido a devolver</p></div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline">{REFUND_ESTADO_LABEL[s.estado]}</Badge>
              <span className="text-xs text-muted-foreground">
                {s.fuente === "snapshot" ? "Política aceptada por el cliente" : s.fuente === "evento" ? "Política configurada del viaje" : ""}
              </span>
            </div>
            <p className="text-xs">{s.regla}</p>
            {s.estado === "revision_manual" && s.politicaTexto && (
              <div className="rounded-md border border-border bg-muted/30 p-2 text-xs whitespace-pre-wrap max-h-48 overflow-y-auto">
                {s.politicaTexto}
              </div>
            )}
            {s.estado === "revision_manual" && (
              <p className="text-[11px] text-muted-foreground">Después de cancelar, cargá el monto a devolver desde la ficha de la reserva.</p>
            )}
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Volver</AlertDialogCancel>
          <AlertDialogAction disabled={!s} onClick={() => s && onConfirm(s)}>Confirmar cancelación</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
