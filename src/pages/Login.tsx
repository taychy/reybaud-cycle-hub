import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useStudentAuth } from "@/hooks/useStudentAuth";
import { ChevronRight, Shield, Download } from "lucide-react";
import logo from "@/assets/logo.png";

const Login = () => {
  const [email, setEmail] = useState("");
  const { login, loading, error } = useStudentAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await login(email);
  };

  // If login succeeds, the parent component handles routing via context
  // For now, we store in sessionStorage and redirect
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);

    const { supabase } = await import("@/integrations/supabase/client");
    
    const trimmedEmail = email.toLowerCase().trim();

    const { data, error: fetchError } = await supabase
      .from("alumnos")
      .select("*")
      .eq("email", trimmedEmail)
      .maybeSingle();

    if (fetchError || !data) {
      setLoginError("No se encontró un usuario con ese email.");
      return;
    }

    if (data.estado === "inactivo" && data.grupo === "Sin grupo") {
      // User registered but never completed payment — send to plans
      sessionStorage.setItem("registro_alumno_id", data.id);
      navigate("/planes");
      return;
    }

    if (data.grupo === "Sin grupo") {
      setLoginError("Tu usuario aún no tiene grupo asignado. Contactá administración.");
      return;
    }

    // Check active subscription (fecha_fin >= today)
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    const { data: activeSub } = await supabase
      .from("suscripciones")
      .select("id")
      .eq("alumno_id", data.id)
      .eq("estado", "activa")
      .gte("fecha_fin", todayStr)
      .limit(1);

    if (!activeSub || activeSub.length === 0) {
      // Subscription expired — redirect to plans for renewal (no re-registration)
      sessionStorage.setItem("registro_alumno_id", data.id);
      sessionStorage.setItem("alumno_renewal", "1");
      navigate("/planes");
      return;
    }

    sessionStorage.setItem("alumno", JSON.stringify(data));
    navigate("/alumno");
  };

  const [loginError, setLoginError] = useState<string | null>(null);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-8 animate-fade-in">
        {/* Logo */}
        <div className="text-center space-y-3">
          <img src={logo} alt="Ciclismo Reybaud" className="w-20 h-20 mx-auto mb-2" />
          <h1 className="text-3xl font-heading font-bold uppercase tracking-wider text-foreground">
            Ciclismo Reybaud
          </h1>
          <p className="text-muted-foreground text-sm">
            Ingresá con tu email para ver tu entrenamiento
          </p>
        </div>

        {/* Login form */}
        <form onSubmit={handleLogin} className="space-y-4">
          <div className="glass-card rounded-lg p-6 space-y-4">
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium text-foreground">
                Email
              </label>
              <Input
                id="email"
                type="email"
                placeholder="tu@email.com"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setLoginError(null); }}
                required
                className="bg-secondary border-border text-foreground placeholder:text-muted-foreground"
              />
            </div>

            {loginError && (
              <div className="text-sm text-destructive bg-destructive/10 rounded-md p-3">
                {loginError}
              </div>
            )}

            <Button type="submit" variant="gold" className="w-full" size="lg">
              Ingresar
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </form>

        {/* Register link */}
        <div className="text-center space-y-2">
          <button
            onClick={() => navigate("/registro")}
            className="text-sm text-primary hover:text-gold-light transition-colors font-medium"
          >
            ¿No tenés cuenta? Registrate
          </button>
          <br />
          <button
            onClick={() => navigate("/asesoria")}
            className="text-sm text-muted-foreground hover:text-primary transition-colors"
          >
            Ver servicios y valores
          </button>
        </div>

        {/* Install app banner */}
        <div className="glass-card rounded-lg p-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Download className="w-5 h-5 text-primary shrink-0" />
            <p className="text-sm text-muted-foreground">
              Instalá la app para acceder más rápido
            </p>
          </div>
          <Button
            variant="gold-outline"
            size="sm"
            onClick={async () => {
              const prompt = (window as any).__pwaInstallPrompt;
              if (prompt) {
                await prompt.prompt();
                await prompt.userChoice;
                (window as any).__pwaInstallPrompt = null;
                return;
              }
              navigate("/instalar");
            }}
          >
            Instalar
          </Button>
        </div>

        {/* Admin link */}
        <div className="text-center">
          <button
            onClick={() => navigate("/admin/login")}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
          >
            <Shield className="w-3 h-3" />
            Acceso administrador
          </button>
        </div>
      </div>
    </div>
  );
};

export default Login;
