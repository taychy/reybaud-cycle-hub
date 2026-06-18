import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { tripTokenGet, tripTokenSaveStep } from "@/lib/tripTokenApi";

import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Upload, CheckCircle, Bike } from "lucide-react";
import { toast } from "sonner";

interface TripBikeDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reservationId: string;
  alumnoId: string | null;
  /** Si está presente, el GET/SAVE se hace por edge function (flujo /viaje?token=). */
  token?: string;
  onSaved: () => void;
}

const TripBikeDrawer = ({ open, onOpenChange, reservationId, alumnoId, token, onSaved }: TripBikeDrawerProps) => {
  const folderId = alumnoId || `external/${reservationId}`;
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [stature, setStature] = useState("");
  const [bikeSize, setBikeSize] = useState("");
  const [seatHeight, setSeatHeight] = useState("");
  const [bikeBrand, setBikeBrand] = useState("");
  const [bikeModel, setBikeModel] = useState("");
  const [needsAdvice, setNeedsAdvice] = useState(false);
  const [fittingUrl, setFittingUrl] = useState<string | null>(null);
  const [existingId, setExistingId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);

    const applyRow = (row: any | null) => {
      if (row) {
        setExistingId(row.id);
        const d = row.data as any;
        setStature(d?.stature || "");
        setBikeSize(d?.bike_size || "");
        setNeedsAdvice(row.needs_advice || false);
        setFittingUrl(row.file_url || null);
      } else {
        setExistingId(null);
        setStature("");
        setBikeSize("");
        setNeedsAdvice(false);
        setFittingUrl(null);
      }
      setLoading(false);
    };

    if (token) {
      tripTokenGet(token)
        .then((resp) => applyRow(resp.checklist.find((c) => c.step_key === "bici") ?? null))
        .catch(() => applyRow(null));
    } else {
      supabase
        .from("reservation_checklist_data")
        .select("*")
        .eq("reservation_id", reservationId)
        .eq("step_key", "bici")
        .maybeSingle()
        .then(({ data }) => applyRow(data));
    }
  }, [open, reservationId, token]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${folderId}/${reservationId}/fitting_${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("trip-documents").upload(path, file, { upsert: true });
    if (error) {
      toast.error("Error al subir el archivo");
      setUploading(false);
      return;
    }
    // Bucket privado: guardamos el path; el preview/admin lo abre por signed URL.
    setFittingUrl(path);
    setUploading(false);
  };

  const isComplete = !!(stature || bikeSize || fittingUrl || needsAdvice);

  const handleSave = async () => {
    setSaving(true);

    if (token) {
      try {
        await tripTokenSaveStep({
          token,
          step_key: "bici",
          completed: isComplete,
          needs_advice: needsAdvice,
          data: { stature, bike_size: bikeSize },
          file_url: fittingUrl,
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
      step_key: "bici",
      completed: isComplete,
      needs_advice: needsAdvice,
      data: { stature, bike_size: bikeSize },
      file_url: fittingUrl,
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
              <Bike className="w-5 h-5 text-primary" />
            </div>
            <div>
              <DrawerTitle>Bicicleta y posición</DrawerTitle>
              <DrawerDescription>Cargá tu estatura, tu talle o tu fitting para ayudarte con la bici</DrawerDescription>
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
              Con estos datos podemos preparar tu bicicleta de alquiler o asesorarte sobre posición. Completá lo que puedas.
            </p>

            <div className="space-y-2">
              <Label htmlFor="stature">Estatura (cm)</Label>
              <Input
                id="stature"
                placeholder="Ej: 175"
                value={stature}
                onChange={(e) => setStature(e.target.value)}
                type="number"
                inputMode="numeric"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="bikeSize">Talle de bicicleta</Label>
              <Input
                id="bikeSize"
                placeholder="Ej: 54, M, L..."
                value={bikeSize}
                onChange={(e) => setBikeSize(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Archivo de fitting (opcional)</Label>
              {fittingUrl ? (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                  <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="text-xs text-emerald-400 truncate flex-1">Archivo cargado</span>
                  <label className="text-xs text-primary cursor-pointer hover:underline">
                    Cambiar
                    <input type="file" className="hidden" onChange={handleFileUpload} />
                  </label>
                </div>
              ) : (
                <label className="flex items-center justify-center gap-2 h-12 rounded-lg border-2 border-dashed border-border hover:border-primary/50 cursor-pointer transition-colors">
                  {uploading ? (
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  ) : (
                    <>
                      <Upload className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Subir archivo</span>
                    </>
                  )}
                  <input type="file" className="hidden" onChange={handleFileUpload} disabled={uploading} />
                </label>
              )}
            </div>

            <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 border border-border/50">
              <Checkbox
                id="needsAdvice"
                checked={needsAdvice}
                onCheckedChange={(v) => setNeedsAdvice(!!v)}
                className="mt-0.5"
              />
              <label htmlFor="needsAdvice" className="text-sm text-foreground cursor-pointer leading-snug">
                No sé el talle de mi bici, necesito asesoramiento
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

export default TripBikeDrawer;
