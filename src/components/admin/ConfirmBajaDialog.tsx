import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";

interface SnapshotShape {
  planes_activos?: Array<{ id: string; plan_nombre?: string; estado?: string; fecha_fin?: string | null; auto_renovacion?: boolean }>;
  saldo?: Array<{ moneda: string; saldo: number }>;
  tenia_auto_renovacion?: boolean;
  reservas_futuras?: Array<{ id: string; nombre?: string; fecha?: string }>;
  antiguedad_dias?: number | null;
  motivo?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  solicitud: {
    id: string;
    alumno_id: string;
    motivo: string;
    motivo_otro_detalle?: string | null;
    comentario?: string | null;
    snapshot: SnapshotShape | null;
    alumno_nombre?: string;
  };
  onConfirmed?: () => void;
}

export default function ConfirmBajaDialog({ open, onOpenChange, solicitud, onConfirmed }: Props) {
  const [notas, setNotas] = useState("");
  const [emailNotificar, setEmailNotificar] = useState(true);
  const [loading, setLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const snap = solicitud.snapshot || {};
  const planes = snap.planes_activos || [];
  const saldos = (snap.saldo || []).filter((s) => Number(s.saldo) !== 0);
  const reservas = snap.reservas_futuras || [];

  const handleConfirm = async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("process-baja-confirmacion", {
      body: {
        solicitud_id: solicitud.id,
        notas: notas || undefined,
        email_notificar: emailNotificar,
      },
    });
    setLoading(false);
    setConfirmOpen(false);
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error || error?.message || "No se pudo procesar la baja");
      return;
    }
    const mpFailed = (data as any)?.mp_failed ?? [];
    if (mpFailed.length > 0) {
      toast.warning(`Baja procesada. ${mpFailed.length} preapproval MP fallaron al cancelarse — revisar manualmente.`);
    } else {
      toast.success("Baja procesada correctamente.");
    }
    onOpenChange(false);
    onConfirmed?.();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              Confirmar baja {solicitud.alumno_nombre ? `de ${solicitud.alumno_nombre}` : ""}
            </DialogTitle>
            <DialogDescription>
              Motivo declarado: <b>{solicitud.motivo}</b>
              {solicitud.motivo_otro_detalle ? ` — ${solicitud.motivo_otro_detalle}` : ""}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-sm max-h-[55vh] overflow-y-auto pr-1">
            <div className="rounded-md border bg-muted/40 p-3 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Planes activos que se cancelarán</p>
              {planes.length === 0 ? (
                <p className="text-xs text-muted-foreground">Ninguno.</p>
              ) : (
                <ul className="space-y-1">
                  {planes.map((p) => (
                    <li key={p.id} className="text-xs">
                      • <b>{p.plan_nombre || p.id}</b> — {p.estado}{p.fecha_fin ? ` · vence ${p.fecha_fin}` : ""}{p.auto_renovacion ? " · auto-renov" : ""}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {saldos.length > 0 && (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
                <p className="font-semibold mb-1">⚠️ Saldo pendiente en cuenta corriente</p>
                {saldos.map((s) => (
                  <p key={s.moneda}>{s.moneda}: {s.saldo}</p>
                ))}
                <p className="mt-1 text-muted-foreground">La deuda queda registrada en cuenta corriente.</p>
              </div>
            )}

            {reservas.length > 0 && (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
                <p className="font-semibold mb-1">⚠️ Reservas futuras de eventos/viajes</p>
                <ul className="space-y-0.5">
                  {reservas.map((r) => (
                    <li key={r.id}>• {r.nombre || r.id}{r.fecha ? ` (${r.fecha})` : ""}</li>
                  ))}
                </ul>
                <p className="mt-1 text-muted-foreground">No se cancelan automáticamente. Revisarlas aparte.</p>
              </div>
            )}

            {solicitud.comentario && (
              <div className="rounded-md border bg-card p-3 text-xs">
                <p className="font-semibold mb-1">Comentario del alumno</p>
                <p className="text-muted-foreground whitespace-pre-wrap">{solicitud.comentario}</p>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Notas internas (opcional)</Label>
              <Textarea rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} />
            </div>

            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={emailNotificar} onCheckedChange={(v) => setEmailNotificar(!!v)} />
              <span>Enviar email de notificación al alumno</span>
            </label>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => setConfirmOpen(true)} disabled={loading}>
              Confirmar baja definitiva
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Confirmás la baja?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción cancela todas las suscripciones operativas del alumno y lo pasa a inactivo.
              El historial queda intacto pero deberá contratar un plan nuevo para volver.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm} disabled={loading} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {loading ? "Procesando..." : "Sí, dar de baja"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
