import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { ChevronRight, Shield, Download } from "lucide-react";
import logo from "@/assets/logo.png";

const Login = () => {
  const [email, setEmail] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const navigate = useNavigate();

  // Auto-redirect: check existing sessions on mount
  useEffect(() => {
    const checkExistingSession = async () => {
      // 1. Check Supabase Auth session (admin/coach)
      // NOTE: Do NOT auto-redirect admins from here.
      // A user can have both admin and alumno roles.
      // They choose their role by which login they use.
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        // Only auto-redirect coaches (they don't use email-only login)
        const { data: isCoach } = await supabase.rpc("has_role", {
          _user_id: session.user.id,
          _role: "coach" as any,
        });
        if (isCoach) {
          navigate("/coach", { replace: true });
          return;
        }
      }

      // 2. Check stored alumno session (localStorage)
      const storedAlumno = localStorage.getItem("alumno");
      if (storedAlumno) {
        try {
          const alumno = JSON.parse(storedAlumno);
          
          // Re-validate: fetch fresh data
          const { data: freshAlumno } = await supabase
            .from("alumnos")
            .select("*")
            .eq("id", alumno.id)
            .maybeSingle();

          if (!freshAlumno) {
            localStorage.removeItem("alumno");
            setCheckingSession(false);
            return;
          }

          if (freshAlumno.estado === "inactivo" || freshAlumno.grupo === "Sin grupo") {
            localStorage.removeItem("alumno");
            setCheckingSession(false);
            return;
          }

          // Check active subscription
          const now = new Date();
          const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

          const { data: activeSub } = await supabase
            .from("suscripciones")
            .select("id")
            .eq("alumno_id", freshAlumno.id)
            .eq("estado", "activa")
            .gte("fecha_fin", todayStr)
            .limit(1);

          if (!activeSub || activeSub.length === 0) {
            // Subscription expired → plans
            localStorage.removeItem("alumno");
            localStorage.setItem("registro_alumno_id", freshAlumno.id);
            localStorage.setItem("alumno_renewal", "1");
            navigate("/planes", { replace: true });
            return;
          }

          // Valid session → update stored data and go to dashboard
          localStorage.setItem("alumno", JSON.stringify(freshAlumno));
          navigate("/alumno", { replace: true });
          return;
        } catch {
          localStorage.removeItem("alumno");
        }
      }

      setCheckingSession(false);
    };

    checkExistingSession();
  }, [navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setLoading(true);

    const trimmedEmail = email.toLowerCase().trim();

    const { data, error: fetchError } = await supabase
      .from("alumnos")
      .select("*")
      .eq("email", trimmedEmail)
      .maybeSingle();

    if (fetchError || !data) {
      setLoginError("No se encontró un usuario con ese email.");
      setLoading(false);
      return;
    }

    if (data.estado === "inactivo" && data.grupo === "Sin grupo") {
      localStorage.setItem("registro_alumno_id", data.id);
      navigate("/planes");
      setLoading(false);
      return;
    }

    if (data.grupo === "Sin grupo") {
      setLoginError("Tu usuario aún no tiene grupo asignado. Contactá administración.");
      setLoading(false);
      return;
    }

    // Check active subscription
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
      localStorage.setItem("registro_alumno_id", data.id);
      localStorage.setItem("alumno_renewal", "1");
      navigate("/planes");
      setLoading(false);
      return;
    }

    localStorage.setItem("alumno", JSON.stringify(data));
    navigate("/alumno");
    setLoading(false);
  };

  // Show loading while checking session
  if (checkingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4 animate-fade-in">
          <img src={logo} alt="Ciclismo Reybaud" className="w-16 h-16" />
          <div className="animate-pulse text-muted-foreground text-sm">Cargando...</div>
        </div>
      </div>
    );
  }

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

            <Button type="submit" variant="gold" className="w-full" size="lg" disabled={loading}>
              {loading ? "Ingresando..." : "Ingresar"}
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
        {!window.matchMedia("(display-mode: standalone)").matches && (
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
        )}

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
