import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useStudentAuth } from "@/hooks/useStudentAuth";
import { Bike, ChevronRight, Shield } from "lucide-react";

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
    // We need to check the student and redirect
    const { useStudentAuth: _ } = await import("@/hooks/useStudentAuth");
    // Actually, let's just do inline logic
    const { supabase } = await import("@/integrations/supabase/client");
    
    const { data, error: fetchError } = await supabase
      .from("alumnos")
      .select("*")
      .eq("email", email.toLowerCase().trim())
      .maybeSingle();

    if (fetchError || !data) {
      setLoginError("No se encontró un usuario con ese email.");
      return;
    }

    if (data.estado === "inactivo") {
      setLoginError("Tu membresía no se encuentra activa. Contactá administración.");
      return;
    }

    if (data.grupo === "Sin grupo") {
      setLoginError("Tu usuario aún no tiene grupo asignado. Contactá administración.");
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
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full gold-gradient mb-2">
            <Bike className="w-8 h-8 text-primary-foreground" />
          </div>
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
