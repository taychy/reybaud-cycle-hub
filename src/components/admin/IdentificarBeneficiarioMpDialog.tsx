import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

interface Movement { id: string; mpPaymentId: string; amount: number }
interface Props {
  movement: Movement | null;
  currentName: string;
  currentEvidence: string;
  onClose: () => void;
  onDone: () => void;
}

export default function IdentificarBeneficiarioMpDialog({
  movement, currentName, currentEvidence, onClose, onDone,
}: Props) {
  const [recipientName, setRecipientName] = useState("");
  const [evidenceNote, setEvidenceNote] = useState("");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (movement) {
      setRecipientName(currentName);
      setEvidenceNote(currentEvidence);
    }
  }, [movement?.id, currentName, currentEvidence]);

  const confirm = async () => {
    if (!movement || !recipientName.trim() || evidenceNote.trim().length < 8 || saving) return;
    setSaving(true);
    const { error } = await supabase.rpc("identify_mp_egress_beneficiary" as any, {
      p_movement_id: movement.id,
      p_recipient_name: recipientName.trim(),
      p_evidence_note: evidenceNote.trim(),
    });
    setSaving(false);
    if (error) {
      toast({ title: "No se pudo identificar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Beneficiario identificado", description: "Quedó guardado con respaldo y auditoría. El movimiento sigue pendiente de clasificar." });
    onDone();
  };

  return (
    <Dialog open={!!movement} onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Identificar beneficiario del egreso</DialogTitle>
          <DialogDescription>
            Mercado Pago no informa el nombre en este movimiento. Completalo únicamente después de revisar el comprobante.
          </DialogDescription>
        </DialogHeader>
        {movement && (
          <div className="space-y-4">
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <div>Operación MP: <span className="font-mono">{movement.mpPaymentId}</span></div>
              <div>Salida registrada: <strong>${movement.amount.toLocaleString("es-AR")}</strong> ARS</div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mp-recipient">Nombre del beneficiario que figura en el comprobante</Label>
              <Input id="mp-recipient" value={recipientName} onChange={(e) => setRecipientName(e.target.value)} maxLength={160} placeholder="Nombre y apellido / razón social" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mp-recipient-evidence">Respaldo de la identificación</Label>
              <Textarea id="mp-recipient-evidence" rows={3} value={evidenceNote}
                onChange={(e) => setEvidenceNote(e.target.value)} maxLength={1000}
                placeholder="Ej.: detalle de operación MP, nombre del receptor, referencia y fecha del comprobante" />
              <p className="text-xs text-muted-foreground">
                El nombre se mostrará como «identificado por administración», no como dato informado automáticamente por MP.
              </p>
            </div>
            <div className="rounded-md border p-2 text-xs text-muted-foreground">
              Esta identificación no registra una devolución ni crea un gasto. Si efectivamente es un reintegro, usá luego «Devolución a alumno» para vincularlo con la reserva y evitar duplicaciones.
            </div>
          </div>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button type="button" onClick={confirm} disabled={saving || !recipientName.trim() || evidenceNote.trim().length < 8}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Guardar identificación
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
