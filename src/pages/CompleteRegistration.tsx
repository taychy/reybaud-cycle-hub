import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CheckCircle, Loader2 } from "lucide-react";
import logo from "@/assets/logo.png";
import { toast } from "sonner";

const REFERRAL_OPTIONS = [
  "Instagram",
  "Facebook",
  "Un amigo / conocido",
  "Google",
  "Evento / Carrera",
  "Otro",
];

const CompleteRegistration = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const alumnoId = searchParams.get("id");

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [alumnoData, setAlumnoData] = useState<{
    nombre: string;
    email: string;
    telefono: string | null;
  } | null>(null);

  const [form, setForm] = useState({
    telefono: "",
    direccion: "",
    ciudad: "",
    provincia: "",
    contacto_emergencia_nombre: "",
    contacto_emergencia_telefono: "",
    condicion_medica: "",
    como_se_entero: "",
  });

  useEffect(() => {
    if (!alumnoId) {
      setError("Enlace inválido. No se encontró el ID del alumno.");
      setLoading(false);
      return;
    }

    const fetchAlumno = async () => {
      const { data, error: fetchErr } = await supabase
        .from("alumnos")
        .select("nombre, email, telefono, profile_complete")
        .eq("id", alumnoId)
        .maybeSingle();

      if (fetchErr || !data) {
        setError("No se encontró el registro. Contactá al administrador.");
        setLoading(false);
        return;
      }

      if ((data as any).profile_complete) {
        navigate("/pendiente-aprobacion", { replace: true });
        return;
      }

      setAlumnoData({
        nombre: (data as any).nombre,
        email: (data as any).email,
        telefono: (data as any).telefono,
      });

      if ((data as any).telefono) {
        setForm((prev) => ({ ...prev, telefono: (data as any).telefono }));
      }

      setLoading(false);
    };

    fetchAlumno();
  }, [alumnoId, navigate]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (
      !form.telefono.trim() ||
      !form.direccion.trim() ||
      !form.ciudad.trim() ||
      !form.provincia.trim() ||
      !form.contacto_emergencia_nombre.trim() ||
      !form.contacto_emergencia_telefono.trim()
    ) {
      setError("Completá todos los campos obligatorios.");
      return;
    }

    setSubmitting(true);

    const { error: updateErr } = await supabase
      .from("alumnos")
      .update({
        telefono: form.telefono.trim(),
        direccion: form.direccion.trim(),
        ciudad: form.ciudad.trim(),
        provincia: form.provincia.trim(),
        contacto_emergencia_nombre: form.contacto_emergencia_nombre.trim(),
        contacto_emergencia_telefono: form.contacto_emergencia_telefono.trim(),
        condicion_medica: form.condicion_medica.trim() || null,
        como_se_entero: form.como_se_entero || null,
        profile_complete: true,
        registration_status: "pending_admin_approval",
      } as any)
      .eq("id", alumnoId!);

    if (updateErr) {
      setError("Error al guardar los datos. Intentá nuevamente.");
      setSubmitting(false);
      return;
    }

    toast.success("¡Registro completado!");
    navigate("/pendiente-aprobacion", { replace: true });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4 animate-fade-in">
          <img src={logo} alt="Ciclismo Reybaud" className="w-16 h-16" />
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (error && !alumnoData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="w-full max-w-md text-center space-y-6 animate-fade-in">
          <img src={logo} alt="Ciclismo Reybaud" className="w-16 h-16 mx-auto" />
          <p className="text-destructive text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center bg-background px-4 py-8">
      <div className="w-full max-w-md space-y-6 animate-fade-in">
        {/* Header */}
        <div className="text-center space-y-3">
          <img src={logo} alt="Ciclismo Reybaud" className="w-16 h-16 mx-auto" />
          <h1 className="text-xl font-heading font-bold uppercase tracking-wider text-foreground leading-tight">
            Completá tus datos para finalizar tu inscripción
          </h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="glass-card rounded-lg p-5 space-y-4">
            {/* Read-only fields */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">
                Nombre
              </label>
              <Input
                value={alumnoData?.nombre || ""}
                readOnly
                className="bg-muted border-border text-muted-foreground cursor-not-allowed"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">
                Email
              </label>
              <Input
                value={alumnoData?.email || ""}
                readOnly
                className="bg-muted border-border text-muted-foreground cursor-not-allowed"
              />
            </div>

            {/* WhatsApp */}
            <div className="space-y-2">
              <label htmlFor="telefono" className="text-sm font-medium text-foreground">
                WhatsApp <span className="text-primary">*</span>
              </label>
              <Input
                id="telefono"
                name="telefono"
                type="tel"
                placeholder="+54 11 1234-5678"
                value={form.telefono}
                onChange={handleChange}
                required
                className="bg-secondary border-border text-foreground placeholder:text-muted-foreground"
              />
            </div>

            {/* Dirección */}
            <div className="space-y-2">
              <label htmlFor="direccion" className="text-sm font-medium text-foreground">
                Dirección <span className="text-primary">*</span>
              </label>
              <Input
                id="direccion"
                name="direccion"
                type="text"
                placeholder="Calle y número"
                value={form.direccion}
                onChange={handleChange}
                required
                className="bg-secondary border-border text-foreground placeholder:text-muted-foreground"
              />
            </div>

            {/* Ciudad */}
            <div className="space-y-2">
              <label htmlFor="ciudad" className="text-sm font-medium text-foreground">
                Ciudad <span className="text-primary">*</span>
              </label>
              <Input
                id="ciudad"
                name="ciudad"
                type="text"
                placeholder="Ej: Buenos Aires"
                value={form.ciudad}
                onChange={handleChange}
                required
                className="bg-secondary border-border text-foreground placeholder:text-muted-foreground"
              />
            </div>

            {/* Provincia */}
            <div className="space-y-2">
              <label htmlFor="provincia" className="text-sm font-medium text-foreground">
                Provincia <span className="text-primary">*</span>
              </label>
              <Input
                id="provincia"
                name="provincia"
                type="text"
                placeholder="Ej: CABA"
                value={form.provincia}
                onChange={handleChange}
                required
                className="bg-secondary border-border text-foreground placeholder:text-muted-foreground"
              />
            </div>

            {/* Contacto de emergencia */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Contacto de emergencia <span className="text-primary">*</span>
              </label>
              <Input
                name="contacto_emergencia_nombre"
                type="text"
                placeholder="Nombre del contacto"
                value={form.contacto_emergencia_nombre}
                onChange={handleChange}
                required
                className="bg-secondary border-border text-foreground placeholder:text-muted-foreground"
              />
              <Input
                name="contacto_emergencia_telefono"
                type="tel"
                placeholder="Teléfono del contacto"
                value={form.contacto_emergencia_telefono}
                onChange={handleChange}
                required
                className="bg-secondary border-border text-foreground placeholder:text-muted-foreground"
              />
            </div>

            {/* Condición médica */}
            <div className="space-y-2">
              <label htmlFor="condicion_medica" className="text-sm font-medium text-foreground">
                ¿Tenés alguna condición médica relevante?{" "}
                <span className="text-muted-foreground text-xs">(opcional)</span>
              </label>
              <Textarea
                id="condicion_medica"
                name="condicion_medica"
                placeholder="Ej: asma, alergias, lesiones previas..."
                value={form.condicion_medica}
                onChange={handleChange}
                className="bg-secondary border-border text-foreground placeholder:text-muted-foreground min-h-[60px]"
              />
            </div>

            {/* Cómo se enteró */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                ¿Cómo te enteraste de nosotros?{" "}
                <span className="text-muted-foreground text-xs">(opcional)</span>
              </label>
              <Select
                value={form.como_se_entero}
                onValueChange={(val) =>
                  setForm((prev) => ({ ...prev, como_se_entero: val }))
                }
              >
                <SelectTrigger className="bg-secondary border-border text-foreground">
                  <SelectValue placeholder="Seleccioná una opción" />
                </SelectTrigger>
                <SelectContent>
                  {REFERRAL_OPTIONS.map((opt) => (
                    <SelectItem key={opt} value={opt}>
                      {opt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {error && (
              <div className="text-sm text-destructive bg-destructive/10 rounded-md p-3">
                {error}
              </div>
            )}

            <Button
              type="submit"
              variant="gold"
              className="w-full"
              size="lg"
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Guardando...
                </>
              ) : (
                "Finalizar inscripción"
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CompleteRegistration;
