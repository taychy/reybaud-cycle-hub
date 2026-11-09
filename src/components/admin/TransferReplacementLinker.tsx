import { useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { formatPrice } from "@/lib/currency";

export interface TransferReplacementCandidate {
  id: string;
  fullName: string;
  packageId: string | null;
  packageName: string;
  amountTotal: number;
  amountPaid: number;
}

interface Props {
  transferId: string;
  originalPackageId: string | null;
  originalHolderName: string;
  candidates: TransferReplacementCandidate[];
  currency: string;
  onLinked: () => void;
}

/**
 * Admin-only explicit replacement selection.
 *
 * A package mismatch (e.g. original double -> replacement individual) is intentional:
 * do not auto-claim another reservation, change either package price or insert payments.
 * The corresponding RPC enforces identity, event, availability and audit checks.
 */
export default function TransferReplacementLinker({
  transferId,
  originalPackageId,
  originalHolderName,
  candidates,
  currency,
  onLinked,
}: Props) {
  const { toast } = useToast();
  const [replacementId, setReplacementId] = useState("");
  const [busy, setBusy] = useState(false);
  const candidate = candidates.find((c) => c.id === replacementId);
  const changedPackage = !!candidate && candidate.packageId !== originalPackageId;

  const link = async () => {
    if (!candidate || busy) return;
    const message =
      `Vincular el cupo de ${originalHolderName} a la reserva de ${candidate.fullName}?\n\n` +
      `Paquete del reemplazante: ${candidate.packageName}\n` +
      `Total: ${formatPrice(candidate.amountTotal, currency)}\n` +
      `Pagos a Reybaud: ${formatPrice(candidate.amountPaid, currency)}\n` +
      (changedPackage ? "\nIMPORTANTE: el reemplazante eligió otra categoría de alojamiento.\n" : "") +
      "\nNo se trasladan pagos, se acreditan transferencias privadas ni se modifica el precio. " +
      "Después deberás definir el acuerdo y verificar el comprobante.";
    if (!window.confirm(message)) return;

    setBusy(true);
    try {
      const { error } = await supabase.rpc("claim_reservation_transfer_explicit" as any, {
        p_transfer_id: transferId,
        p_new_reservation_id: candidate.id,
      });
      if (error) throw error;
      toast({
        title: "Cupo vinculado",
        description: "Revisá el acuerdo de pago. Los importes y cobros no cambiaron.",
      });
      setReplacementId("");
      onLinked();
    } catch (e: any) {
      toast({
        title: "No se pudo vincular la reserva",
        description: e?.message || "Revisá los datos e intentá nuevamente.",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2 rounded-md border border-dashed border-border p-3 text-xs">
      <p className="font-semibold">Asociar un reemplazante ya inscripto</p>
      <p className="text-muted-foreground">
        Seleccioná la reserva exacta del nuevo participante, incluso si cambió de
        habitación. Los importes y pagos permanecen en cada reserva.
      </p>
      <label className="block space-y-1">
        <span>Reserva reemplazante</span>
        <select
          className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
          value={replacementId}
          onChange={(e) => setReplacementId(e.target.value)}
          disabled={busy}
        >
          <option value="">Seleccionar reserva...</option>
          {candidates.map((c) => (
            <option key={c.id} value={c.id}>
              {c.fullName} — {c.packageName} — {formatPrice(c.amountTotal, currency)}
            </option>
          ))}
        </select>
      </label>
      {candidate && (
        <p className="text-muted-foreground">
          Cobrado a Reybaud: {formatPrice(candidate.amountPaid, currency)}.
          {changedPackage && " Atención: categoría de alojamiento diferente."}
        </p>
      )}
      <Button size="sm" variant="outline" disabled={!candidate || busy} onClick={link}>
        {busy ? "Vinculando..." : "Vincular reserva"}
      </Button>
      {candidates.length === 0 && (
        <p className="text-muted-foreground">
          No hay reservas activas sin transferencia para asociar en este evento.
        </p>
      )}
    </div>
  );
}
