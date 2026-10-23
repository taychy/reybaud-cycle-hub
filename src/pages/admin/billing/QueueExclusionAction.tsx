import { useState } from "react";
import { Ban, RotateCcw, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function QueueExclusionAction({ ids, excluded, onDone, disabled = false }: {
  ids: string[]; excluded: boolean; onDone: () => void; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const label = excluded ? "Volver a incluir" : "Excluir de la cola de facturación";
  const save = async () => {
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc("admin_set_facturacion_exclusion", {
        p_ids: ids, p_excluir: !excluded,
      });
      if (error) throw error;
      toast({ title: excluded ? "Cobros incluidos nuevamente" : "Cobros excluidos de facturación",
        description: `${data ?? 0} cobro(s). El pago y sus saldos no cambiaron.` });
      setOpen(false);
      onDone();
    } catch (error) {
      toast({ title: "No se cambió la selección", variant: "destructive",
        description: error instanceof Error ? error.message : (error as { message?: string })?.message ?? "Volvé a consultar el estado de los cobros." });
    } finally { setSaving(false); }
  };
  return <>
    <Button variant="outline" size="sm" disabled={disabled || saving || ids.length === 0} onClick={() => setOpen(true)}>
      {excluded ? <RotateCcw className="w-4 h-4 mr-1" /> : <Ban className="w-4 h-4 mr-1" />}{label}
    </Button>
    <AlertDialog open={open} onOpenChange={(value) => { if (!saving) setOpen(value); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{label} · {ids.length} cobro(s)</AlertDialogTitle>
          <AlertDialogDescription>
            {excluded ? "Volverán a pendientes de facturación y podrán facturarse según los controles vigentes."
              : "No se incluirán en Facturar seleccionados ni en facturación automática, aunque se busquen o reprocesen cobros."}
            {" "}El pago permanece íntegro en caja, reserva y cuenta corriente. La acción registra usuario y fecha.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
          <AlertDialogAction disabled={saving} onClick={(event) => { event.preventDefault(); void save(); }}>
            {saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}{excluded ? "Volver a incluir" : "Excluir"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>;
}