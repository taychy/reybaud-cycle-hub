import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Loader2, Upload, CheckCircle, FileText, ExternalLink } from "lucide-react";
import { toast } from "sonner";

interface TripDocumentDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reservationId: string;
  alumnoId: string | null;
  stepKey: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  helpText: string;
  onSaved: () => void;
}

const TripDocumentDrawer = ({
  open, onOpenChange, reservationId, alumnoId, stepKey,
  title, description, icon, helpText, onSaved,
}: TripDocumentDrawerProps) => {
  const folderId = alumnoId || `external/${reservationId}`;
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [existingId, setExistingId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    supabase
      .from("reservation_checklist_data")
      .select("*")
      .eq("reservation_id", reservationId)
      .eq("step_key", stepKey)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setExistingId(data.id);
          setFileUrl(data.file_url || null);
        } else {
          setExistingId(null);
          setFileUrl(null);
        }
        setLoading(false);
      });
  }, [open, reservationId, stepKey]);

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
    const { data: urlData } = supabase.storage.from("trip-documents").getPublicUrl(path);
    setFileUrl(urlData.publicUrl);
    setUploading(false);
    // Auto-save when file is uploaded
    await saveData(urlData.publicUrl);
  };

  const saveData = async (url: string | null) => {
    setSaving(true);
    const payload = {
      reservation_id: reservationId,
      alumno_id: alumnoId,
      step_key: stepKey,
      completed: !!url,
      needs_advice: false,
      data: {},
      file_url: url,
    };

    let error;
    if (existingId) {
      ({ error } = await supabase.from("reservation_checklist_data").update(payload).eq("id", existingId));
    } else {
      ({ error } = await supabase.from("reservation_checklist_data").insert(payload));
      if (!error) {
        // Re-fetch to get the ID
        const { data } = await supabase
          .from("reservation_checklist_data")
          .select("id")
          .eq("reservation_id", reservationId)
          .eq("step_key", stepKey)
          .maybeSingle();
        if (data) setExistingId(data.id);
      }
    }

    setSaving(false);
    if (error) {
      toast.error("Error al guardar");
      return;
    }
    toast.success("¡Archivo guardado!");
    onSaved();
  };

  const isImage = fileUrl && /\.(jpg|jpeg|png|gif|webp)$/i.test(fileUrl);

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[90vh]">
        <DrawerHeader className="text-left">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
              {icon}
            </div>
            <div>
              <DrawerTitle>{title}</DrawerTitle>
              <DrawerDescription>{description}</DrawerDescription>
            </div>
          </div>
        </DrawerHeader>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="px-4 pb-6 space-y-5">
            <p className="text-xs text-muted-foreground">{helpText}</p>

            {fileUrl ? (
              <div className="space-y-3">
                {isImage ? (
                  <img src={fileUrl} alt={title} className="w-full h-40 object-cover rounded-lg border border-border" />
                ) : (
                  <div className="flex items-center gap-3 p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                    <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">Archivo cargado</p>
                      <p className="text-xs text-muted-foreground truncate">{fileUrl.split("/").pop()}</p>
                    </div>
                    <a href={fileUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="w-4 h-4 text-primary" />
                    </a>
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
              <label className="flex flex-col items-center justify-center gap-3 h-32 rounded-xl border-2 border-dashed border-border hover:border-primary/50 cursor-pointer transition-colors bg-muted/20">
                {uploading || saving ? (
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
                <input type="file" className="hidden" onChange={handleFileUpload} disabled={uploading || saving} />
              </label>
            )}

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

export default TripDocumentDrawer;
