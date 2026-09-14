import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatPrice } from "@/lib/currency";
import { Loader2, RotateCcw } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export interface CreditNoteInvoice {
  id: string;
  cliente_nombre: string;
  monto: number;
  moneda: string | null;
  numero_comprobante: string | null;
  tipo_comprobante: number | null;
  emisor_id: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  factura: CreditNoteInvoice | null;
  acreditado: number;
  onCompleted: () => void;
}

const TIPO_FACTURA: Record<number, string> = { 1: "Factura A", 6: "Factura B", 11: "Factura C" };
const TIPO_NC: Record<number, string> = { 1: "Nota de Crédito A", 6: "Nota de Crédito B", 11: "Nota de Crédito C" };

function parseAmount(value: string): number {
  const normalized = value.replace(/\./g, "").replace(",", ".").replace(/[^0-9.]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
}

export function CreditNoteModal({ open, onOpenChange, factura, acreditado, onCompleted }: Props) {
  const [mode, setMode] = useState<"total" | "parcial">("total");
  const [amount, setAmount] = useState("");
  const [motivo, setMotivo] = useState("");
  const [busy, setBusy] = useState(false);

  const remaining = useMemo(() => {
    if (!factura) return 0;
    return Math.max(0, Math.round((Number(factura.monto || 0) - Number(acreditado || 0)) * 100) / 100);
  }, [factura, acreditado]);

  useEffect(() => {
    if (!open) return;
    setMode("total");
    setAmount(remaining.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    setMotivo("");
  }, [open, remaining]);

  const selectedAmount = mode === "total" ? remaining : parseAmount(amount);
  const invalid = !factura || !factura.emisor_id || !factura.numero_comprobante || !factura.tipo_comprobante
    || remaining <= 0 || selectedAmount <= 0 || selectedAmount > remaining;

  const submit = async () => {
    if (!factura || invalid) return;
    const label = TIPO_NC[Number(factura.tipo_comprobante)] || "Nota de crédito";
    const ok = window.confirm(
      `Vas a emitir una ${label} REAL ante ARCA por ${formatPrice(selectedAmount, (factura.moneda || "ARS") as any)}.\n\n` +
      `Factura asociada: ${factura.numero_comprobante}\nCliente: ${factura.cliente_nombre}\n\n` +
      `Una vez autorizada por ARCA no se puede borrar. ¿Confirmás la emisión?`,
    );
    if (!ok) return;

    setBusy(true);
    try {
      const idempotencyKey = crypto.randomUUID();
      const { data, error } = await supabase.functions.invoke("emit-nota-credito-afip", {
        body: {
          factura_id: factura.id,
          monto: selectedAmount,
          motivo: motivo.trim() || null,
          idempotency_key: idempotencyKey,
        },
      });
      const payload = data as any;
      if (error || payload?.error) throw new Error(payload?.error || error?.message || "No se pudo emitir la nota de crédito");

      toast({
        title: `${label} emitida`,
        description: `${payload.numero_comprobante || "Comprobante autorizado"} · CAE ${payload.cae || "—"}`,
      });
      onOpenChange(false);
      onCompleted();
    } catch (e: any) {
      toast({ title: "No se pudo emitir la nota de crédito", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const originalLabel = factura?.tipo_comprobante ? (TIPO_FACTURA[Number(factura.tipo_comprobante)] || "Factura") : "Factura";
  const creditLabel = factura?.tipo_comprobante ? (TIPO_NC[Number(factura.tipo_comprobante)] || "Nota de crédito") : "Nota de crédito";

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><RotateCcw className="w-4 h-4" /> Emitir nota de crédito</DialogTitle>
          <DialogDescription>
            Este comprobante se enviará a ARCA y quedará asociado a la factura original.
          </DialogDescription>
        </DialogHeader>

        {factura && (
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-muted/20 p-3 text-sm space-y-1">
              <div className="flex justify-between gap-3"><span className="text-muted-foreground">Comprobante</span><span className="font-medium">{originalLabel} · {factura.numero_comprobante}</span></div>
              <div className="flex justify-between gap-3"><span className="text-muted-foreground">Cliente</span><span className="font-medium text-right">{factura.cliente_nombre}</span></div>
              <div className="flex justify-between gap-3"><span className="text-muted-foreground">Importe original</span><span className="font-medium">{formatPrice(factura.monto, (factura.moneda || "ARS") as any)}</span></div>
              <div className="flex justify-between gap-3"><span className="text-muted-foreground">Ya acreditado</span><span>{formatPrice(acreditado, (factura.moneda || "ARS") as any)}</span></div>
              <div className="flex justify-between gap-3 border-t border-border pt-1.5"><span className="font-medium">Disponible</span><span className="font-bold">{formatPrice(remaining, (factura.moneda || "ARS") as any)}</span></div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant={mode === "total" ? "default" : "outline"} onClick={() => setMode("total")} disabled={busy}>Total</Button>
              <Button type="button" variant={mode === "parcial" ? "default" : "outline"} onClick={() => setMode("parcial")} disabled={busy}>Parcial</Button>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium">Importe de {creditLabel}</label>
              <Input
                value={mode === "total" ? remaining.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={busy || mode === "total"}
                inputMode="decimal"
              />
              {mode === "parcial" && selectedAmount > remaining && (
                <p className="text-xs text-destructive">El importe no puede superar el saldo disponible.</p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium">Motivo / observación</label>
              <Textarea
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ej.: devolución parcial, corrección de importe..."
                disabled={busy}
                rows={3}
              />
              <p className="text-[11px] text-muted-foreground">El motivo queda registrado en Reybaud para auditoría interna.</p>
            </div>

            <div className="rounded-lg border border-orange-500/30 bg-orange-500/5 px-3 py-2 text-xs text-muted-foreground">
              Se emitirá un comprobante fiscal nuevo. La factura original no se borra ni se modifica; la nota de crédito corrige total o parcialmente su importe.
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancelar</Button>
          <Button onClick={submit} disabled={busy || invalid}>
            {busy && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            Emitir en ARCA
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
