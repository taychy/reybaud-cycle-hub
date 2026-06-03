import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  alumnoId: string;
  onSubmitted?: () => void;
}

const MOTIVOS: { value: string; label: string }[] = [
  { value: "economico", label: "Motivo económico" },
  { value: "horarios", label: "Horarios no me funcionan" },
  { value: "lesion_salud", label: "Lesión o salud" },
  { value: "viaje_vacaciones", label: "Viaje / vacaciones largas" },
  { value: "cambio_actividad", label: "Cambio de actividad" },
  { value: "disconforme_servicio", label: "Disconforme con el servicio" },
  { value: "otro", label: "Otro" },
];

export default function RequestBajaDialog({ open, onOpenChange, alumnoId, onSubmitted }: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [motivo, setMotivo] = useState("");
  const [comentario, setComentario] = useState("");
  const [confirma, setConfirma] = useState(false);
  const [loading, setLoading] = useState(false);

  const reset = () => { setStep(1); setMotivo(""); setComentario(""); setConfirma(false); };

  const handleClose = (v: boolean) => { if (!v) reset(); onOpenChange(v); };

  const requiereComentario = motivo === "disconforme_servicio" || motivo === "otro";
  const canSubmit = !!motivo && confirma && (!requiereComentario || comentario.trim().length > 3);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setLoading(true);
    const { error } = await supabase.rpc("request_baja_alumno", {
      p_alumno_id: alumnoId,
      p_motivo: motivo,
      p_comentario: comentario || undefined,
      p_motivo_otro_detalle: motivo === "otro" ? comentario : undefined,
      p_origen: "alumno",
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Solicitud enviada. Te contactaremos a la brevedad.");
    reset();
    onOpenChange(false);
    onSubmitted?.();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        {step === 1 ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
                Solicitar baja de la escuela
              </DialogTitle>
              <DialogDescription>Antes de continuar, revisá qué implica este proceso.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              <ul className="list-disc list-inside space-y-1.5 text-muted-foreground">
                <li>Se cancelarán tus planes activos.</li>
                <li>Se apagará la renovación automática y cobros recurrentes.</li>
                <li>Perdés acceso a entrenamientos y comunidad.</li>
                <li>Tu historial (pagos, reservas, facturas) se conserva.</li>
                <li>Podés volver más adelante eligiendo un nuevo plan.</li>
              </ul>
              <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
                Tu solicitud va a ser revisada por administración antes de hacerse efectiva.
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => handleClose(false)}>Cancelar</Button>
              <Button onClick={() => setStep(2)}>Continuar</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Contanos el motivo</DialogTitle>
              <DialogDescription>Nos ayuda a mejorar y a contactarte si podemos ofrecer una alternativa.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Motivo *</Label>
                <Select value={motivo} onValueChange={setMotivo}>
                  <SelectTrigger><SelectValue placeholder="Elegí un motivo" /></SelectTrigger>
                  <SelectContent>
                    {MOTIVOS.map((m) => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Comentario {requiereComentario ? "*" : "(opcional)"}</Label>
                <Textarea
                  value={comentario}
                  onChange={(e) => setComentario(e.target.value)}
                  rows={3}
                  placeholder="Contanos más para entender mejor tu situación"
                />
              </div>
              <label className="flex items-start gap-2 text-xs text-muted-foreground cursor-pointer">
                <Checkbox checked={confirma} onCheckedChange={(v) => setConfirma(!!v)} className="mt-0.5" />
                <span>Entiendo que mi solicitud será revisada por administración antes de hacerse efectiva.</span>
              </label>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep(1)}>Atrás</Button>
              <Button variant="destructive" disabled={!canSubmit || loading} onClick={handleSubmit}>
                {loading ? "Enviando..." : "Enviar solicitud"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
