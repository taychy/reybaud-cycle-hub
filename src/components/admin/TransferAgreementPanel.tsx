import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { formatPrice } from "@/lib/currency";
import { useToast } from "@/hooks/use-toast";
import { validateTransferAgreement, transferModeLabel, type TransferMode } from "@/lib/transferAgreement";

interface Props {
  transfer: any;
  currency: string;
  onChanged: () => void;
}

export default function TransferAgreementPanel({ transfer: t, currency, onChanged }: Props) {
  const { toast } = useToast();
  const [mode, setMode] = useState<TransferMode>("direct_to_original");
  const [direct, setDirect] = useState("");
  const [rey, setRey] = useState("");
  const [refund, setRefund] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const fmt = (n: number) => formatPrice(n, currency);
  const defined = !!t.agreement_defined_at;

  const input = { mode, direct: Number(direct || 0), toReybaud: Number(rey || 0), refund: Number(refund || 0), originalPaid: Number(t.original_paid_amount || 0) };
  const errors = validateTransferAgreement(input);

  const run = async (fn: string, args: any, ok: string) => {
    setBusy(true);
    const { error } = await supabase.rpc(fn as any, args);
    setBusy(false);
    if (error) { toast({ title: "No se pudo guardar", description: error.message, variant: "destructive" }); return; }
    toast({ title: ok });
    onChanged();
  };

  const statusLabel: Record<string, string> = {
    reserved: "Esperando seña del nuevo comprador",
    deposit_paid: "Acuerdo de pago pendiente",
    payment_agreement_pending: "Acuerdo de pago pendiente",
    payment_agreement_defined: "Acuerdo definido",
    completed: "Transferencia completada",
  };

  return (
    <div className="space-y-3 rounded-md border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">Acuerdo de pago de transferencia</p>
        <Badge variant="outline">{statusLabel[t.status] || t.status}</Badge>
      </div>
      <div className="text-xs space-y-1 text-muted-foreground">
        <p>Pago histórico del titular original (solo lectura): <span className="text-foreground">{fmt(Number(t.original_paid_amount || 0))}</span></p>
        <p>Seña cobrada al reemplazante: <span className="text-foreground">{fmt(Number(t.deposit_amount || 0))}</span></p>
        <p>Cliente contactado: {t.admin_contacted_at ? new Date(t.admin_contacted_at).toLocaleString("es-AR") : "No"}</p>
      </div>

      {defined ? (
        <div className="text-sm space-y-1">
          <p>Modalidad: <strong>{transferModeLabel(t.payment_mode)}</strong></p>
          <p>Directo entre participantes: {fmt(Number(t.direct_payment_amount || 0))} <span className="text-muted-foreground">(caja Reybaud $0)</span></p>
          <p>Ingreso adicional a Reybaud: {fmt(Number(t.amount_to_reybaud || 0))}</p>
          <p>Devolución pendiente de Reybaud: {fmt(Number(t.reybaud_refund_amount || 0))}</p>
          {t.notes && <p className="text-muted-foreground">Notas: {t.notes}</p>}
          {t.status !== "completed" && (
            <Button size="sm" disabled={busy} onClick={() => run("complete_reservation_transfer", { p_transfer_id: t.id }, "Transferencia completada")}>
              Cerrar transferencia
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {!t.admin_contacted_at && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => run("mark_reservation_transfer_contacted", { p_transfer_id: t.id }, "Marcado como contactado")}>
              Marcar cliente contactado
            </Button>
          )}
          <select className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm" value={mode} onChange={(e) => setMode(e.target.value as TransferMode)}>
            <option value="direct_to_original">Pago directo al titular anterior</option>
            <option value="reybaud">Pago a Reybaud</option>
            <option value="mixed">Mixto</option>
          </select>
          {mode !== "reybaud" && (
            <label className="block text-xs">Monto que el nuevo comprador paga directamente al titular anterior
              <Input type="number" min={0} value={direct} onChange={(e) => setDirect(e.target.value)} />
            </label>
          )}
          <label className="block text-xs">Monto que paga a Reybaud
            <Input type="number" min={0} value={rey} onChange={(e) => setRey(e.target.value)} />
          </label>
          {mode !== "direct_to_original" && (
            <label className="block text-xs">Monto que Reybaud debe devolver al titular anterior
              <Input type="number" min={0} value={refund} onChange={(e) => setRefund(e.target.value)} />
            </label>
          )}
          <Textarea placeholder="Notas" value={notes} onChange={(e) => setNotes(e.target.value)} />
          <div className="rounded bg-muted/30 p-2 text-xs space-y-0.5">
            <p>Directo entre participantes: {fmt(mode === "reybaud" ? 0 : input.direct)} (caja Reybaud $0)</p>
            <p>Ingreso adicional a Reybaud: {fmt(input.toReybaud)}</p>
            <p>Devolución pendiente de Reybaud: {fmt(mode === "direct_to_original" ? 0 : input.refund)}</p>
          </div>
          {errors.length > 0 && <ul className="text-xs text-destructive list-disc pl-4">{errors.map((e) => <li key={e}>{e}</li>)}</ul>}
          <Button size="sm" disabled={busy || errors.length > 0 || !t.replacement_reservation_id}
            onClick={() => run("define_reservation_transfer_payment_agreement", {
              p_transfer_id: t.id, p_payment_mode: mode,
              p_direct_payment_amount: mode === "reybaud" ? 0 : input.direct,
              p_amount_to_reybaud: input.toReybaud,
              p_reybaud_refund_amount: mode === "direct_to_original" ? 0 : input.refund,
              p_notes: notes || null, p_admin_contacted: false,
            }, "Acuerdo guardado")}>
            Guardar acuerdo
          </Button>
        </div>
      )}
    </div>
  );
}
