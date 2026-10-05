import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  colaId: string;
  clienteNombre: string;
  emisorActualId: string | null;
  emisores: { id: string; nombre_fiscal: string; cuit: string }[];
  onDone: () => void;
}

/** Corrección manual del emisor fiscal de un cobro, con motivo (queda en auditoría). */
export function ColaEmisorOverrideDialog({ open, onOpenChange, colaId, clienteNombre, emisorActualId, emisores, onDone }: Props) {
  const [emisorId, setEmisorId] = useState<string>(emisorActualId || "");
  const [motivo, setMotivo] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.rpc("set_cola_emisor_override" as any, {
      p_cola_id: colaId, p_emisor_id: emisorId, p_motivo: motivo,
    });
    setSaving(false);
    if (error) {
      toast({ title: "No se pudo cambiar el emisor", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Emisor actualizado", description: "El cambio quedó registrado en la auditoría." });
    onOpenChange(false);
    onDone();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading">Cambiar emisor fiscal</DialogTitle>
          <DialogDescription>Cobro de {clienteNombre}. Elegí quién factura y por qué.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Emisor</Label>
            <Select value={emisorId} onValueChange={setEmisorId}>
              <SelectTrigger><SelectValue placeholder="Elegir emisor..." /></SelectTrigger>
              <SelectContent>
                {emisores.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.nombre_fiscal} — {e.cuit}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Motivo *</Label>
            <Textarea rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej.: el pago entró por transferencia a la cuenta de Josilene" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={save} disabled={saving || !emisorId || !motivo.trim()}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
