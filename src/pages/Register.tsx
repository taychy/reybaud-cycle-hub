import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronRight, ArrowLeft } from "lucide-react";
import logo from "@/assets/logo.png";

const Register = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState({ nombre: "", apellido: "", email: "", telefono: "", documento: "" });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    setError(null);
  };

  const [dupWarning, setDupWarning] = useState<string | null>(null);
  const [dupMotivo, setDupMotivo] = useState<"documento" | "telefono" | null>(null);
  const [linkSent, setLinkSent] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);

  const handleLinkEmail = async () => {
    setLinking(true);
    setError(null);
    const { data, error: fnError } = await supabase.functions.invoke("request-email-link", {
      body: {
        email: form.email.toLowerCase().trim(),
        telefono: form.telefono.trim() || null,
        documento: form.documento.trim() || null,
      },
    });
    if (fnError || (data as any)?.error) {
      setError("No pudimos enviar el email de confirmación. Escribinos a administración.");
    } else {
      setLinkSent((data as any)?.destino_enmascarado || null);
    }
    setLinking(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const email = form.email.toLowerCase().trim();

    // Check if email already exists
    const { data: existing } = await supabase
      .rpc("lookup_alumno_by_email", { p_email: email })
      .maybeSingle();

    if (existing) {
      if (existing.estado === "activo") {
        setError("Ya existe una cuenta con ese email. Podés iniciar sesión.");
      } else {
        // Existing inactive user — send to plan selection
        localStorage.setItem("registro_alumno_id", existing.id);
        navigate("/planes");
      }
      setLoading(false);
      return;
    }

    // Anti-duplicado: misma persona con otro email (teléfono o documento ya cargados)
    if (!dupWarning) {
      const { data: dups } = await supabase.rpc("lookup_alumno_duplicate", {
        p_email: email,
        p_telefono: form.telefono.trim() || null,
        p_documento: form.documento.trim() || null,
      });
      const hit = (dups as any[] | null)?.find(
        (d) => d.motivo === "documento" || d.motivo === "telefono"
      );
      if (hit) {
        setDupMotivo(hit.motivo);
        setDupWarning(
          `Encontramos una ficha existente asociada a estos datos (${hit.nombre_parcial} · ${hit.email_enmascarado}, coincide el ${hit.motivo === "documento" ? "documento" : "teléfono"}). Podés vincular este nuevo email a tu ficha actual en lugar de crear una cuenta duplicada.`
        );
        setLoading(false);
        return;
      }
    }



    // Create new student (inactive, sin grupo)
    const newId = crypto.randomUUID();
    const { error: insertError } = await supabase
      .from("alumnos")
      .insert({
        id: newId,
        nombre: form.nombre.trim(),
        apellido: form.apellido.trim(),
        email,
        telefono: form.telefono.trim() || null,
        documento: form.documento.trim() || null,
        estado: "inactivo",
        grupo: "Sin grupo",
      } as any);

    if (insertError) {
      setError("Error al crear la cuenta. Intentá nuevamente.");
      setLoading(false);
      return;
    }

    localStorage.setItem("registro_alumno_id", newId);
    navigate("/planes");
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-8 animate-fade-in">
        {/* Logo */}
        <div className="text-center space-y-3">
          <img src={logo} alt="Ciclismo Reybaud" className="w-20 h-20 mx-auto mb-2" />
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
                Nombre *
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
              <label htmlFor="apellido" className="text-sm font-medium text-foreground">
                Apellido *
              </label>
              <Input
                id="apellido"
                name="apellido"
                type="text"
                placeholder="Tu apellido"
                value={form.apellido}
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

            <div className="space-y-2">
              <label htmlFor="documento" className="text-sm font-medium text-foreground">
                DNI / CUIT / CUIL <span className="text-muted-foreground">(para facturación)</span>
              </label>
              <Input
                id="documento"
                name="documento"
                type="text"
                placeholder="Ej: 30123456 o 20-30123456-9"
                value={form.documento}
                onChange={handleChange}
                className="bg-secondary border-border text-foreground placeholder:text-muted-foreground"
              />
            </div>

            {error && (
              <div className="text-sm text-destructive bg-destructive/10 rounded-md p-3">
                {error}
              </div>
            )}

            {dupWarning && (
              <div className="text-sm text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-md p-3 space-y-3">
                <p>{dupWarning}</p>
                {linkSent ? (
                  <p className="text-emerald-400">
                    Te enviamos un email a {linkSent} para confirmar la vinculación. Abrilo y confirmá:
                    tu ficha, suscripciones y pagos se mantienen.
                  </p>
                ) : (
                  <>
                    <Button
                      type="button"
                      variant="gold"
                      className="w-full"
                      disabled={linking}
                      onClick={handleLinkEmail}
                    >
                      {linking ? "Enviando..." : "Vincular este email a mi ficha"}
                    </Button>
                    <p className="text-xs text-amber-400/80">
                      Enviaremos un email de confirmación a la casilla principal de esa ficha.
                      Si no sos vos, presioná "Continuar" de nuevo para crear una cuenta nueva.
                    </p>
                  </>
                )}
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
