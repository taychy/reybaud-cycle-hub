import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { ChevronRight, ArrowLeft, Mail, MailCheck, Eye, EyeOff } from "lucide-react";
import logo from "@/assets/logo.png";
import { toast } from "sonner";

const AdminLogin = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [forgotMode, setForgotMode] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();

  // Auto-redirect if already authenticated
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session) {
        const { data: isAdmin } = await supabase.rpc("has_role", {
          _user_id: session.user.id,
          _role: "admin",
        });
        if (isAdmin) {
          navigate("/admin", { replace: true });
          return;
        }
        const { data: isCoach } = await supabase.rpc("has_role", {
          _user_id: session.user.id,
          _role: "coach" as any,
        });
        if (isCoach) {
          navigate("/coach", { replace: true });
          return;
        }
      }
      setCheckingSession(false);
    });
  }, [navigate]);

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const trimmedEmail = email.toLowerCase().trim();
    if (!trimmedEmail) {
      setError("Ingresá tu email.");
      setLoading(false);
      return;
    }

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
      redirectTo: `${window.location.origin}/activar-cuenta`,
    });

    if (resetError) {
      setError(resetError.message || "Error al enviar el email.");
      setLoading(false);
      return;
    }

    setResetSent(true);
    setLoading(false);
    toast.success("Email enviado. Revisá tu bandeja de entrada.");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) throw authError;

      const { data: session } = await supabase.auth.getSession();
      if (session.session) {
        const { data: isAdmin } = await supabase.rpc("has_role", {
          _user_id: session.session.user.id,
          _role: "admin",
        });

        if (isAdmin) {
          navigate("/admin");
          return;
        }

        const { data: isCoach } = await supabase.rpc("has_role", {
          _user_id: session.session.user.id,
          _role: "coach" as any,
        });

        if (isCoach) {
          navigate("/coach");
          return;
        }

        await supabase.auth.signOut();
        setError("No tenés permisos de administrador o coach.");
        setLoading(false);
        return;
      }
    } catch (err: any) {
      setError(err.message || "Error al iniciar sesión.");
    } finally {
      setLoading(false);
    }
  };

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

  // Forgot password: reset sent confirmation
  if (forgotMode && resetSent) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
        <div className="w-full max-w-md space-y-8 animate-fade-in text-center">
          <img src={logo} alt="Ciclismo Reybaud" className="w-20 h-20 mx-auto mb-2" />
          <MailCheck className="w-14 h-14 text-primary mx-auto" />
          <h1 className="text-2xl font-heading font-bold uppercase tracking-wider text-foreground">
            Email enviado
          </h1>
          <p className="text-muted-foreground text-sm">
            Si existe una cuenta con ese email, vas a recibir un enlace para restablecer tu contraseña. Revisá tu bandeja de entrada.
          </p>
          <Button
            variant="outline"
            onClick={() => { setForgotMode(false); setResetSent(false); setError(null); }}
            className="w-full"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Volver al login
          </Button>
        </div>
      </div>
    );
  }

  // Forgot password form
  if (forgotMode) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
        <div className="w-full max-w-md space-y-8 animate-fade-in">
          <div className="text-center space-y-3">
            <img src={logo} alt="Ciclismo Reybaud" className="w-20 h-20 mx-auto mb-2" />
            <Mail className="w-10 h-10 text-primary mx-auto" />
            <h1 className="text-2xl font-heading font-bold uppercase tracking-wider text-foreground">
              Recuperar contraseña
            </h1>
            <p className="text-muted-foreground text-sm">
              Ingresá tu email y te enviaremos un enlace para restablecer tu contraseña.
            </p>
          </div>

          <form onSubmit={handleForgotPassword} className="space-y-4">
            <div className="glass-card rounded-lg p-6 space-y-4">
              <div className="space-y-2">
                <label htmlFor="forgot-email" className="text-sm font-medium text-foreground">Email</label>
                <Input
                  id="forgot-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="tu@email.com"
                  className="bg-secondary border-border text-foreground placeholder:text-muted-foreground"
                />
              </div>

              {error && (
                <div className="text-sm text-destructive bg-destructive/10 rounded-md p-3">{error}</div>
              )}

              <Button type="submit" variant="gold" className="w-full" size="lg" disabled={loading}>
                {loading ? "Enviando..." : "Enviar enlace"}
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </form>

          <div className="text-center">
            <button
              onClick={() => { setForgotMode(false); setError(null); }}
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
            >
              <ArrowLeft className="w-3 h-3" />
              Volver al login
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-8 animate-fade-in">
        <div className="text-center space-y-3">
          <img src={logo} alt="Ciclismo Reybaud" className="w-20 h-20 mx-auto mb-2" />
          <h1 className="text-3xl font-heading font-bold uppercase tracking-wider text-foreground">
            Admin Panel
          </h1>
          <p className="text-muted-foreground text-sm">Ciclismo Reybaud</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="glass-card rounded-lg p-6 space-y-4">
            <div className="space-y-2">
              <label htmlFor="admin-email" className="text-sm font-medium text-foreground">Email</label>
              <Input
                id="admin-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="bg-secondary border-border text-foreground placeholder:text-muted-foreground"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label htmlFor="admin-password" className="text-sm font-medium text-foreground">Contraseña</label>
                <button
                  type="button"
                  onClick={() => { setForgotMode(true); setError(null); }}
                  className="text-xs text-primary hover:text-primary/80 transition-colors"
                >
                  ¿Olvidaste tu clave?
                </button>
              </div>
              <Input
                id="admin-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="bg-secondary border-border text-foreground placeholder:text-muted-foreground"
              />
            </div>

            {error && (
              <div className="text-sm text-destructive bg-destructive/10 rounded-md p-3">{error}</div>
            )}

            <Button type="submit" variant="gold" className="w-full" size="lg" disabled={loading}>
              {loading ? "Ingresando..." : "Ingresar"}
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </form>

        <div className="text-center">
          <button
            onClick={() => navigate("/")}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
          >
            <ArrowLeft className="w-3 h-3" />
            Volver al login de alumnos
          </button>
          <br />
          <button
            onClick={() => navigate("/coach/registro")}
            className="text-sm text-primary hover:text-primary/80 transition-colors font-medium mt-2"
          >
            ¿Sos profesor? Registrate acá
          </button>
        </div>
      </div>
    </div>
  );
};

export default AdminLogin;
