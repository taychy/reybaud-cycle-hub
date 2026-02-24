import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Bike, ChevronRight, ArrowLeft } from "lucide-react";

const Register = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState({ nombre: "", email: "", telefono: "" });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const email = form.email.toLowerCase().trim();

    // Check if email already exists
    const { data: existing } = await supabase
      .from("alumnos")
      .select("id, estado")
      .eq("email", email)
      .maybeSingle();

    if (existing) {
      if (existing.estado === "activo") {
        setError("Ya existe una cuenta con ese email. Podés iniciar sesión.");
      } else {
        // Existing inactive user — send to plan selection
        sessionStorage.setItem("registro_alumno_id", existing.id);
        navigate("/planes");
      }
      setLoading(false);
      return;
    }

    // Create new student (inactive, sin grupo)
    const { data, error: insertError } = await supabase
      .from("alumnos")
      .insert({
        nombre: form.nombre.trim(),
        email,
        telefono: form.telefono.trim() || null,
        estado: "inactivo",
        grupo: "Sin grupo",
      })
      .select("id")
      .single();

    if (insertError) {
      setError("Error al crear la cuenta. Intentá nuevamente.");
      setLoading(false);
      return;
    }

    sessionStorage.setItem("registro_alumno_id", data.id);
    navigate("/planes");
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-8 animate-fade-in">
        {/* Logo */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full gold-gradient mb-2">
            <Bike className="w-8 h-8 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-heading font-bold uppercase tracking-wider text-foreground">
            Registrate
          </h1>
          <p className="text-muted-foreground text-sm">
            Creá tu cuenta y elegí tu plan de entrenamiento
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="glass-card rounded-lg p-6 space-y-4">
            <div className="space-y-2">
              <label htmlFor="nombre" className="text-sm font-medium text-foreground">
                Nombre completo
              </label>
              <Input
                id="nombre"
                name="nombre"
                type="text"
                placeholder="Tu nombre"
                value={form.nombre}
                onChange={handleChange}
                required
                className="bg-secondary border-border text-foreground placeholder:text-muted-foreground"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium text-foreground">
                Email
              </label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="tu@email.com"
                value={form.email}
                onChange={handleChange}
                required
                className="bg-secondary border-border text-foreground placeholder:text-muted-foreground"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="telefono" className="text-sm font-medium text-foreground">
                Teléfono <span className="text-muted-foreground">(opcional)</span>
              </label>
              <Input
                id="telefono"
                name="telefono"
                type="tel"
                placeholder="+54 11 1234-5678"
                value={form.telefono}
                onChange={handleChange}
                className="bg-secondary border-border text-foreground placeholder:text-muted-foreground"
              />
            </div>

            {error && (
              <div className="text-sm text-destructive bg-destructive/10 rounded-md p-3">
                {error}
              </div>
            )}

            <Button type="submit" variant="gold" className="w-full" size="lg" disabled={loading}>
              {loading ? "Creando cuenta..." : "Continuar"}
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </form>

        {/* Back to login */}
        <div className="text-center">
          <button
            onClick={() => navigate("/")}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
          >
            <ArrowLeft className="w-3 h-3" />
            Ya tengo cuenta, iniciar sesión
          </button>
        </div>
      </div>
    </div>
  );
};

export default Register;
