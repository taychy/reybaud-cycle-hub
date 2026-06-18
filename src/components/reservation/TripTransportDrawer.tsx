import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { tripTokenGet, tripTokenSaveStep } from "@/lib/tripTokenApi";
import { getTripDocumentSignedUrl } from "@/lib/tripDocuments";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Upload, CheckCircle, ExternalLink, Plane } from "lucide-react";
import { toast } from "sonner";

interface TripTransportDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reservationId: string;
  alumnoId: string | null;
  token?: string;
  onSaved: () => void;
}

const TripTransportDrawer = ({
  open, onOpenChange, reservationId, alumnoId, token, onSaved,
}: TripTransportDrawerProps) => {
  const folderId = alumnoId || `external/${reservationId}`;
  const stepKey = "pasaje";
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [existingId, setExistingId] = useState<string | null>(null);

  // Campos adicionales de transporte
  const [arrivalDate, setArrivalDate] = useState("");
  const [arrivalTime, setArrivalTime] = useState("");
  const [needsTransfer, setNeedsTransfer] = useState(false);
  const [arrivalNotes, setArrivalNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    setLoading(true);

    const applyRow = async (row: any | null) => {
      if (row) {
        setExistingId(row.id);
        const stored = row.file_url || null;
        setFileUrl(stored);
        setFilePreview(await getTripDocumentSignedUrl(stored));
        const d = row.data || {};
        setArrivalDate(d.arrival_date || "");
        setArrivalTime(d.arrival_time || "");
        setNeedsTransfer(!!d.needs_transfer);
        setArrivalNotes(d.arrival_notes || "");
      } else {
        setExistingId(null);
        setFileUrl(null);
        setFilePreview(null);
        setArrivalDate("");
        setArrivalTime("");
        setNeedsTransfer(false);
        setArrivalNotes("");
      }
      setLoading(false);
    };

    if (token) {
      tripTokenGet(token)
        .then((resp) => applyRow(resp.checklist.find((c: any) => c.step_key === stepKey) ?? null))
        .catch(() => applyRow(null));
    } else {
      supabase
        .from("reservation_checklist_data")
        .select("*")
        .eq("reservation_id", reservationId)
        .eq("step_key", stepKey)
        .maybeSingle()
        .then(({ data }) => applyRow(data));
    }
  }, [open, reservationId, token]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${folderId}/${reservationId}/${stepKey}_${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("trip-documents").upload(path, file, { upsert: true });
    if (error) {
      toast.error("Error al subir el archivo");
      setUploading(false);
      return;
    }
    setFileUrl(path);
    setFilePreview(await getTripDocumentSignedUrl(path));
    setUploading(false);
  };

  const isComplete = !!(
    fileUrl || arrivalDate || arrivalTime || needsTransfer || arrivalNotes
  );

  const handleSave = async () => {
    setSaving(true);

    const dataPayload = {
      arrival_date: arrivalDate || null,
      arrival_time: arrivalTime || null,
      needs_transfer: needsTransfer || null,
      arrival_notes: arrivalNotes || null,
    };

    if (token) {
      try {
        const res = await tripTokenSaveStep({
          token,
          step_key: stepKey,
          completed: isComplete,
          needs_advice: false,
          data: dataPayload,
          file_url: fileUrl,
        });
        if (res.id) setExistingId(res.id);
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
      step_key: stepKey,
      completed: isComplete,
      needs_advice: false,
      data: dataPayload,
      file_url: fileUrl,
    };

    let error;
    if (existingId) {
      ({ error } = await supabase.from("reservation_checklist_data").update(payload).eq("id", existingId));
    } else {
      const { error: insertError, data: inserted } = await supabase.from("reservation_checklist_data").insert(payload).select("id").maybeSingle();
      error = insertError;
      if (!error && inserted) {
        setExistingId(inserted.id);
      }
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

  const isImage = fileUrl && /\.(jpg|jpeg|png|gif|webp)$/i.test(fileUrl);

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[90vh]">
        <DrawerHeader className="text-left">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
              <Plane className="w-5 h-5 text-primary" />
            </div>
            <div>
              <DrawerTitle>Pasaje o transporte</DrawerTitle>
              <DrawerDescription>Reserva de vuelo, micro o transporte</DrawerDescription>
            </div>
          </div>
        </DrawerHeader>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="px-4 pb-6 space-y-5">
            {/* Campos de llegada */}
            <div className="space-y-4 rounded-lg border border-border p-4 bg-muted/20">
              <p className="text-xs font-medium text-foreground">
                ¿No viajás en el vuelo recomendado?
              </p>
              <p className="text-[11px] text-muted-foreground -mt-2">
                Contanos cuándo llegás al hotel para poder coordinar.
              </p>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="arrival_date" className="text-xs">Día de llegada</Label>
                  <Input
                    id="arrival_date"
                    type="date"
                    value={arrivalDate}
                    onChange={(e) => setArrivalDate(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="arrival_time" className="text-xs">Horario de llegada</Label>
                  <Input
                    id="arrival_time"
                    type="time"
                    value={arrivalTime}
                    onChange={(e) => setArrivalTime(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
              </div>

              <div className="flex items-start gap-2 pt-1">
                <Checkbox
                  id="needs_transfer"
                  checked={needsTransfer}
                  onCheckedChange={(v) => setNeedsTransfer(v === true)}
                  className="mt-0.5"
                />
                <Label htmlFor="needs_transfer" className="text-xs font-normal cursor-pointer leading-tight">
                  Necesito transfer del aeropuerto
                </Label>
              </div>

              <div className="space-y-1.5 pt-1">
                <Label htmlFor="arrival_notes" className="text-xs">Comentarios sobre tu llegada (opcional)</Label>
                <Textarea
                  id="arrival_notes"
                  value={arrivalNotes}
                  onChange={(e) => setArrivalNotes(e.target.value)}
                  placeholder="Ej. llego solo con equipaje de mano, necesito ayuda con la bici, etc."
                  className="min-h-[72px] text-xs resize-none"
                />
              </div>
            </div>

            {/* Subida de archivo */}
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Subí una imagen o PDF de la reserva (opcional).</p>

              {fileUrl ? (
                <div className="space-y-3">
                  {isImage ? (
                    filePreview ? (
                      <img src={filePreview} alt="Pasaje" className="w-full h-40 object-cover rounded-lg border border-border" />
                    ) : (
                      <div className="w-full h-40 rounded-lg border border-border bg-muted/30 flex items-center justify-center text-xs text-muted-foreground">Cargando preview…</div>
                    )
                  ) : (
                    <div className="flex items-center gap-3 p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                      <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">Archivo cargado</p>
                        <p className="text-xs text-muted-foreground truncate">{(fileUrl ?? "").split("/").pop()}</p>
                      </div>
                      {filePreview && (
                        <a href={filePreview} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="w-4 h-4 text-primary" />
                        </a>
                      )}
                    </div>
                  )}

                  <label className="flex items-center justify-center gap-2 h-10 rounded-lg border border-border hover:bg-muted/50 cursor-pointer transition-colors">
                    {uploading ? (
                      <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                    ) : (
                      <>
                        <Upload className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">Reemplazar archivo</span>
                      </>
                    )}
                    <input type="file" className="hidden" onChange={handleFileUpload} disabled={uploading} />
                  </label>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center gap-3 h-28 rounded-xl border-2 border-dashed border-border hover:border-primary/50 cursor-pointer transition-colors bg-muted/20">
                  {uploading ? (
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  ) : (
                    <>
                      <Upload className="w-8 h-8 text-muted-foreground" />
                      <div className="text-center">
                        <p className="text-sm font-medium text-foreground">Subir archivo o imagen</p>
                        <p className="text-xs text-muted-foreground">PDF, imagen o documento</p>
                      </div>
                    </>
                  )}
                  <input type="file" className="hidden" onChange={handleFileUpload} disabled={uploading} />
                </label>
              )}
            </div>

            <Button
              className="w-full"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Guardando…
                </>
              ) : (
                "Guardar"
              )}
            </Button>

            <Button
              variant="outline"
              className="w-full"
              onClick={() => onOpenChange(false)}
            >
              Cerrar
            </Button>
          </div>
        )}
      </DrawerContent>
    </Drawer>
  );
};

export default TripTransportDrawer;
