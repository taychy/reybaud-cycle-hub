import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Upload, Download, Eye, MailPlus, Loader2, FileCheck, FileX, AlertTriangle, Clock, Trash2 } from "lucide-react";
import { logStudentActivity } from "@/lib/logStudentActivity";
import type { Tables } from "@/integrations/supabase/types";

type Alumno = Tables<"alumnos">;

interface MedicalCertificateSectionProps {
  alumno: Alumno;
  isSuperAdmin: boolean;
  onAlumnoUpdate: (a: Alumno) => void;
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

export const MedicalCertificateSection = ({ alumno, isSuperAdmin, onAlumnoUpdate }: MedicalCertificateSectionProps) => {
  const [uploading, setUploading] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [expirationDate, setExpirationDate] = useState((alumno as any).medical_certificate_expiration_date || "");

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

      const { data: urlData } = supabase.storage.from("medical-certificates").getPublicUrl(path);

      // Since bucket is private, construct signed URL or use the path
      const { data: signedData } = await supabase.storage
        .from("medical-certificates")
        .createSignedUrl(path, 60 * 60 * 24 * 365); // 1 year

      const fileUrl = signedData?.signedUrl || urlData.publicUrl;

      const computedStatus = expirationDate
        ? new Date(expirationDate) < new Date()
          ? "vencido"
          : new Date(expirationDate) <= new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
            ? "por_vencer"
            : "cargado"
        : "cargado";

      const { data: updated, error: updateError } = await supabase
        .from("alumnos")
        .update({
          medical_certificate_url: path,
          medical_certificate_uploaded_at: new Date().toISOString(),
          medical_certificate_expiration_date: expirationDate || null,
          medical_certificate_status: computedStatus,
        } as any)
        .eq("id", alumno.id)
        .select("*")
        .single();

      if (updateError) throw updateError;

      onAlumnoUpdate(updated as Alumno);
      await logStudentActivity({
        alumnoId: alumno.id,
        eventType: "apto_fisico_cargado",
        title: "Apto físico cargado",
        description: "Apto físico subido por admin",
        actorRole: isSuperAdmin ? "super_admin" : "admin",
      });
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
      .createSignedUrl(certUrl, 60 * 60); // 1 hour
    if (data?.signedUrl) {
      window.open(data.signedUrl, "_blank");
    } else {
      toast.error("No se pudo generar el link de descarga");
    }
  };

  const handleRequestEmail = async () => {
    setRequesting(true);
    try {
      const { error } = await supabase.functions.invoke("request-medical-certificate", {
        body: { alumno_id: alumno.id },
      });
      if (error) throw error;

      await supabase.from("alumnos").update({
        medical_certificate_requested_at: new Date().toISOString(),
      } as any).eq("id", alumno.id);

      await logStudentActivity({
        alumnoId: alumno.id,
        eventType: "solicitud_apto_fisico",
        title: "Solicitud de apto físico",
        description: "Se solicitó al alumno que cargue su apto físico por email",
        actorRole: isSuperAdmin ? "super_admin" : "admin",
        referenceType: "mail",
      });

      toast.success("Solicitud enviada por email");
    } catch (err: any) {
      toast.error(err.message || "Error al enviar la solicitud");
    } finally {
      setRequesting(false);
    }
  };

  const handleRemove = async () => {
    try {
      if (certUrl) {
        await supabase.storage.from("medical-certificates").remove([certUrl]);
      }
      const { data: updated, error } = await supabase
        .from("alumnos")
        .update({
          medical_certificate_url: null,
          medical_certificate_uploaded_at: null,
          medical_certificate_expiration_date: null,
          medical_certificate_status: "no_cargado",
        } as any)
        .eq("id", alumno.id)
        .select("*")
        .single();
      if (error) throw error;
      onAlumnoUpdate(updated as Alumno);
      setExpirationDate("");
      toast.success("Apto físico eliminado");
    } catch (err: any) {
      toast.error(err.message || "Error al eliminar");
    }
  };

  const handleExpirationChange = async (date: string) => {
    setExpirationDate(date);
    if (certUrl) {
      const computedStatus = date
        ? new Date(date) < new Date()
          ? "vencido"
          : new Date(date) <= new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
            ? "por_vencer"
            : "cargado"
        : "cargado";

      const { data: updated } = await supabase
        .from("alumnos")
        .update({
          medical_certificate_expiration_date: date || null,
          medical_certificate_status: computedStatus,
        } as any)
        .eq("id", alumno.id)
        .select("*")
        .single();
      if (updated) onAlumnoUpdate(updated as Alumno);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Apto físico</h3>
        <Badge variant={config.variant} className={`text-[10px] gap-1 ${config.className}`}>
          <StatusIcon className="w-3 h-3" />
          {config.label}
        </Badge>
      </div>

      {certUrl && (
        <div className="space-y-1.5 text-xs">
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Fecha de carga</span>
            <span className="text-foreground">
              {uploadedAt ? new Date(uploadedAt).toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
            </span>
          </div>
          {expDate && (
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Vencimiento</span>
              <span className={`text-foreground ${status === "vencido" ? "text-destructive" : status === "por_vencer" ? "text-amber-400" : ""}`}>
                {new Date(expDate).toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" })}
              </span>
            </div>
          )}
        </div>
      )}

      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Fecha de vencimiento</Label>
        <Input
          type="date"
          value={expirationDate}
          onChange={(e) => handleExpirationChange(e.target.value)}
          className="bg-secondary border-border text-xs h-8"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="outline"
          size="sm"
          className="text-xs justify-start relative"
          disabled={uploading}
          onClick={() => document.getElementById(`cert-upload-${alumno.id}`)?.click()}
        >
          {uploading ? <Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> : <Upload className="w-3 h-3 mr-1.5" />}
          {certUrl ? "Reemplazar" : "Subir archivo"}
        </Button>
        <input
          id={`cert-upload-${alumno.id}`}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png"
          className="hidden"
          onChange={handleUpload}
        />

        {certUrl && (
          <Button variant="outline" size="sm" className="text-xs justify-start" onClick={handleView}>
            <Eye className="w-3 h-3 mr-1.5" /> Ver / Descargar
          </Button>
        )}

        <Button
          variant="outline"
          size="sm"
          className="text-xs justify-start"
          disabled={requesting}
          onClick={handleRequestEmail}
        >
          {requesting ? <Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> : <MailPlus className="w-3 h-3 mr-1.5" />}
          Solicitar por mail
        </Button>

        {certUrl && (
          <Button variant="outline" size="sm" className="text-xs justify-start text-destructive hover:text-destructive" onClick={handleRemove}>
            <Trash2 className="w-3 h-3 mr-1.5" /> Eliminar
          </Button>
        )}
      </div>

      <p className="text-[10px] text-muted-foreground">Formatos: PDF, JPG, PNG · Máx: 5MB</p>
    </div>
  );
};
