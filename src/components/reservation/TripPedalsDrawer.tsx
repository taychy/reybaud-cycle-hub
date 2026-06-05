import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { tripTokenGet, tripTokenSaveStep } from "@/lib/tripTokenApi";
import { getTripDocumentSignedUrl } from "@/lib/tripDocuments";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Upload, CheckCircle, Footprints, Camera } from "lucide-react";
import { toast } from "sonner";

interface TripPedalsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reservationId: string;
  alumnoId: string | null;
  token?: string;
  onSaved: () => void;
}

const TripPedalsDrawer = ({ open, onOpenChange, reservationId, alumnoId, token, onSaved }: TripPedalsDrawerProps) => {
  const folderId = alumnoId || `external/${reservationId}`;
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pedalType, setPedalType] = useState("");
  const [needsAdvice, setNeedsAdvice] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [existingId, setExistingId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);

    const applyRow = (row: any | null) => {
      if (row) {
        setExistingId(row.id);
        const d = row.data as any;
        setPedalType(d?.pedal_type || "");
        setNeedsAdvice(row.needs_advice || false);
        setPhotoUrl(row.file_url || null);
      } else {
        setExistingId(null);
        setPedalType("");
        setNeedsAdvice(false);
        setPhotoUrl(null);
      }
      setLoading(false);
    };

    if (token) {
      tripTokenGet(token)
        .then((resp) => applyRow(resp.checklist.find((c) => c.step_key === "pedales") ?? null))
        .catch(() => applyRow(null));
    } else {
      supabase
        .from("reservation_checklist_data")
        .select("*")
        .eq("reservation_id", reservationId)
        .eq("step_key", "pedales")
        .maybeSingle()
        .then(({ data }) => applyRow(data));
    }
  }, [open, reservationId, token]);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${folderId}/${reservationId}/pedals_${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("trip-documents").upload(path, file, { upsert: true });
    if (error) {
      toast.error("Error al subir la foto");
      setUploading(false);
      return;
    }
    const { data: urlData } = supabase.storage.from("trip-documents").getPublicUrl(path);
    setPhotoUrl(urlData.publicUrl);
    setUploading(false);
  };

  const isComplete = !!(pedalType || photoUrl || needsAdvice);

  const handleSave = async () => {
    setSaving(true);

    if (token) {
      try {
        await tripTokenSaveStep({
          token,
          step_key: "pedales",
          completed: isComplete,
          needs_advice: needsAdvice,
          data: { pedal_type: pedalType },
          file_url: photoUrl,
        });
        setSaving(false);
        toast.success("¡Información guardada!");
        onSaved();
        onOpenChange(false);
      } catch {
        setSaving(false);
        toast.error("Error al guardar");
      }
      return;
    }

    const payload = {
      reservation_id: reservationId,
      alumno_id: alumnoId,
      step_key: "pedales",
      completed: isComplete,
      needs_advice: needsAdvice,
      data: { pedal_type: pedalType },
      file_url: photoUrl,
    };

    let error;
    if (existingId) {
      ({ error } = await supabase.from("reservation_checklist_data").update(payload).eq("id", existingId));
    } else {
      ({ error } = await supabase.from("reservation_checklist_data").insert(payload));
    }

    setSaving(false);
    if (error) {
      toast.error("Error al guardar");
      return;
    }
    toast.success("¡Información guardada!");
    onSaved();
    onOpenChange(false);
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[90vh]">
        <DrawerHeader className="text-left">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
              <Footprints className="w-5 h-5 text-primary" />
            </div>
            <div>
              <DrawerTitle>Pedales y calas</DrawerTitle>
              <DrawerDescription>Contanos qué usás o subí una foto para ayudarte</DrawerDescription>
            </div>
          </div>
        </DrawerHeader>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="px-4 pb-6 space-y-5">
            <p className="text-xs text-muted-foreground">
              Necesitamos saber qué tipo de pedales usás para asegurar la compatibilidad con la bicicleta del viaje.
            </p>

            <div className="space-y-2">
              <Label htmlFor="pedalType">Tipo de pedales</Label>
              <Input
                id="pedalType"
                placeholder="Ej: Shimano SPD-SL, Look Keo, plataforma..."
                value={pedalType}
                onChange={(e) => setPedalType(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Foto de tus pedales o calas (opcional)</Label>
              {photoUrl ? (
                <div className="space-y-2">
                  <img src={photoUrl} alt="Pedales" className="w-full h-32 object-cover rounded-lg border border-border" />
                  <label className="flex items-center justify-center text-xs text-primary cursor-pointer hover:underline">
                    Cambiar foto
                    <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
                  </label>
                </div>
              ) : (
                <label className="flex items-center justify-center gap-2 h-12 rounded-lg border-2 border-dashed border-border hover:border-primary/50 cursor-pointer transition-colors">
                  {uploading ? (
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  ) : (
                    <>
                      <Camera className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Subir foto</span>
                    </>
                  )}
                  <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} disabled={uploading} />
                </label>
              )}
            </div>

            <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 border border-border/50">
              <Checkbox
                id="needsAdvicePedals"
                checked={needsAdvice}
                onCheckedChange={(v) => setNeedsAdvice(!!v)}
                className="mt-0.5"
              />
              <label htmlFor="needsAdvicePedals" className="text-sm text-foreground cursor-pointer leading-snug">
                No sé qué tipo de pedales tengo
              </label>
            </div>

            <Button
              className="w-full h-12"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Guardar
            </Button>
          </div>
        )}
      </DrawerContent>
    </Drawer>
  );
};

export default TripPedalsDrawer;
