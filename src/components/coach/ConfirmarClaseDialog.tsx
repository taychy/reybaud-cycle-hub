import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Camera, Loader2, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";

interface SlotInfo {
  id: string; // agenda_id
  coach_id: string;
  sede_id: string | null;
  honorario_id: string | null;
  hora_inicio: string | null;
  hora_fin: string | null;
  grupo: string | null;
  sede_nombre?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  slot: SlotInfo | null;
  fecha: string; // YYYY-MM-DD
  onConfirmed?: () => void;
}

export default function ConfirmarClaseDialog({ open, onOpenChange, slot, fecha, onConfirmed }: Props) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [foto, setFoto] = useState<File | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  const [notas, setNotas] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setFoto(null);
    setFotoPreview(null);
    setNotas("");
  };

  const handleFile = (f: File | null) => {
    setFoto(f);
    if (f) setFotoPreview(URL.createObjectURL(f));
    else setFotoPreview(null);
  };

  const handleConfirm = async () => {
    if (!slot) return;
    setSaving(true);
    try {
      let fotoUrl: string | null = null;
      if (foto) {
        const ext = foto.name.split(".").pop() || "jpg";
        const path = `${slot.coach_id}/${fecha}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("class-photos").upload(path, foto, { upsert: false });
        if (upErr) throw upErr;
        const { data: signed } = await supabase.storage.from("class-photos").createSignedUrl(path, 60 * 60 * 24 * 365);
        fotoUrl = signed?.signedUrl ?? null;
      }

      const { error } = await supabase.from("clases_dictadas").insert({
        coach_id: slot.coach_id,
        agenda_id: slot.id,
        sede_id: slot.sede_id,
        honorario_id: slot.honorario_id,
        fecha,
        hora_inicio: slot.hora_inicio,
        hora_fin: slot.hora_fin,
        foto_grupal_url: fotoUrl,
        notas: notas.trim() || null,
      } as any);
      if (error) throw error;

      toast({
        title: "Clase confirmada",
        description: fotoUrl ? "Foto enviada a Gestión de Redes." : "Registro guardado.",
      });
      reset();
      onConfirmed?.();
      onOpenChange(false);
    } catch (e: any) {
      console.error(e);
      toast({ title: "Error", description: e.message || "No se pudo guardar", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const goAsistencia = () => {
    onOpenChange(false);
    navigate("/coach/asistencia");
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Confirmar clase dictada</DialogTitle>
          <DialogDescription>
            {slot?.grupo && <span className="font-medium">{slot.grupo} · </span>}
            {slot?.sede_nombre} · {slot?.hora_inicio?.slice(0, 5)}–{slot?.hora_fin?.slice(0, 5)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-sm">Foto grupal <span className="text-muted-foreground">(opcional)</span></Label>
            <p className="text-xs text-muted-foreground mb-2">
              Si la cargás, se envía automáticamente al panel de redes sociales para publicarla.
            </p>
            {fotoPreview ? (
              <div className="relative w-full h-40 rounded-lg overflow-hidden border border-border">
                <img src={fotoPreview} alt="preview" className="w-full h-full object-cover" />
                <Button size="sm" variant="destructive" className="absolute top-2 right-2 h-7" onClick={() => handleFile(null)}>
                  Quitar
                </Button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center w-full h-32 rounded-lg border-2 border-dashed border-border hover:border-primary/50 cursor-pointer bg-secondary/30">
                <Camera className="w-6 h-6 text-muted-foreground mb-1" />
                <span className="text-xs text-muted-foreground">Sacar / subir foto</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
                />
              </label>
            )}
          </div>

          <div>
            <Label className="text-sm">Notas <span className="text-muted-foreground">(opcional)</span></Label>
            <Textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Algo a destacar de la clase…"
              rows={3}
            />
          </div>

          <Button variant="outline" className="w-full" onClick={goAsistencia} type="button">
            Cargar asistencia (opcional)
          </Button>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={handleConfirm} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
            Confirmar clase
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
