import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Upload, Eye, Loader2, FileCheck, FileX, AlertTriangle, Clock, FileText } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type Alumno = Tables<"alumnos">;

interface MedicalCertificateStudentProps {
  alumno: Alumno;
  onUpdate: (a: Alumno) => void;
  readOnly?: boolean;
}

const ACCEPTED_TYPES = ["application/pdf", "image/jpeg", "image/jpg", "image/png"];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

const getStatus = (alumno: Alumno) => {
  const a = alumno as any;
  if (!a.medical_certificate_url) return "no_cargado";
  if (a.medical_certificate_expiration_date) {
    const exp = new Date(a.medical_certificate_expiration_date);
    const now = new Date();
    const thirtyDays = new Date();
    thirtyDays.setDate(thirtyDays.getDate() + 30);
    if (exp < now) return "vencido";
    if (exp <= thirtyDays) return "por_vencer";
  }
  return "cargado";
};

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: any; className: string }> = {
  no_cargado: { label: "No cargado", variant: "outline", icon: FileX, className: "border-muted-foreground/30 text-muted-foreground" },
  cargado: { label: "Cargado", variant: "default", icon: FileCheck, className: "bg-emerald-600 text-white" },
  vencido: { label: "Vencido", variant: "destructive", icon: AlertTriangle, className: "" },
  por_vencer: { label: "Por vencer", variant: "outline", icon: Clock, className: "border-amber-500/50 text-amber-400" },
};

export const MedicalCertificateStudent = ({ alumno, onUpdate, readOnly = false }: MedicalCertificateStudentProps) => {
  const [uploading, setUploading] = useState(false);

  const status = getStatus(alumno);
  const config = statusConfig[status];
  const StatusIcon = config.icon;
  const certUrl = (alumno as any).medical_certificate_url;
  const uploadedAt = (alumno as any).medical_certificate_uploaded_at;
  const expDate = (alumno as any).medical_certificate_expiration_date;

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ACCEPTED_TYPES.includes(file.type)) {
      toast.error("Formato no permitido. Usá PDF, JPG o PNG.");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.error("El archivo supera los 5MB permitidos.");
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${alumno.id}/apto-fisico-${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("medical-certificates")
        .upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;

      const { data: updated, error: updateError } = await supabase
        .from("alumnos")
        .update({
          medical_certificate_url: path,
          medical_certificate_uploaded_at: new Date().toISOString(),
          medical_certificate_status: "cargado",
        } as any)
        .eq("id", alumno.id)
        .select("*")
        .single();

      if (updateError) throw updateError;
      onUpdate(updated as Alumno);
      toast.success("Apto físico cargado correctamente");
    } catch (err: any) {
      toast.error(err.message || "Error al subir el archivo");
    } finally {
      setUploading(false);
    }
  };

  const handleView = async () => {
    if (!certUrl) return;
    const { data } = await supabase.storage
      .from("medical-certificates")
      .createSignedUrl(certUrl, 60 * 60);
    if (data?.signedUrl) {
      window.open(data.signedUrl, "_blank");
    } else {
      toast.error("No se pudo abrir el archivo");
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card/80 backdrop-blur-sm overflow-hidden">
      <div className="px-4 py-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            <span className="font-medium text-foreground text-sm">Apto físico</span>
          </div>
          <Badge variant={config.variant} className={`text-[10px] gap-1 ${config.className}`}>
            <StatusIcon className="w-3 h-3" />
            {config.label}
          </Badge>
        </div>

        {certUrl && (
          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Cargado</span>
              <span className="text-foreground">
                {uploadedAt ? new Date(uploadedAt).toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
              </span>
            </div>
            {expDate && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Vencimiento</span>
                <span className={`${status === "vencido" ? "text-destructive" : status === "por_vencer" ? "text-amber-400" : "text-foreground"}`}>
                  {new Date(expDate).toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" })}
                </span>
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2">
          {!readOnly && (
            <Button
              variant={certUrl ? "outline" : "gold"}
              size="sm"
              className="flex-1 text-xs"
              disabled={uploading}
              onClick={() => document.getElementById("student-cert-upload")?.click()}
            >
              {uploading ? (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : (
                <Upload className="w-3.5 h-3.5 mr-1.5" />
              )}
              {certUrl ? "Reemplazar" : "Subir apto físico"}
            </Button>
          )}

          {certUrl && (
            <Button variant="outline" size="sm" className="text-xs" onClick={handleView}>
              <Eye className="w-3.5 h-3.5 mr-1.5" /> Ver
            </Button>
          )}
        </div>

        <input
          id="student-cert-upload"
          type="file"
          accept=".pdf,.jpg,.jpeg,.png"
          className="hidden"
          onChange={handleUpload}
        />

        <p className="text-[10px] text-muted-foreground">
          Formatos: PDF, JPG, PNG · Máximo 5MB
        </p>
      </div>
    </div>
  );
};
