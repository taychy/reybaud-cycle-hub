import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { ChevronRight, ArrowLeft, MailCheck } from "lucide-react";
import logo from "@/assets/logo.png";
import { toast } from "sonner";

const AdminLogin = () => {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const navigate = useNavigate();

  // Auto-redirect if already authenticated
  useEffect(() => {
    const checkAdminSession = async (session: any) => {
      if (!session) return false;
      const { data: isAdmin } = await supabase.rpc("has_role", {
        _user_id: session.user.id,
        _role: "admin",
      });
      if (isAdmin) {
        navigate("/admin", { replace: true });
        return true;
      }
      return false;
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      await checkAdminSession(session);
    });

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      const redirected = await checkAdminSession(session);
      if (!redirected) setCheckingSession(false);
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleSendMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const trimmedEmail = email.toLowerCase().trim();
    if (!trimmedEmail) {
      setError("Ingresá tu email.");
      setLoading(false);
      return;
    }

    // Verify the email belongs to an admin (not coach — coaches use their own portal)
    const { data: isValidEmail } = await supabase.rpc("check_admin_or_coach_email" as any, {
      _email: trimmedEmail,
    });

    if (!isValidEmail) {
      setError("No se encontró una cuenta de administrador con ese email. Si sos coach, ingresá desde el portal de coaches.");
      setLoading(false);
      return;
    }

    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: trimmedEmail,
      options: {
        emailRedirectTo: `${window.location.origin}/admin/login`,
      },
    });

    if (otpError) {
      setError(otpError.message || "Error al enviar el enlace.");
      setLoading(false);
      return;
    }

    setMagicLinkSent(true);
    setLoading(false);
    toast.success("Magic Link enviado. Revisá tu bandeja de entrada.");
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

  // Magic link sent confirmation
  if (magicLinkSent) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
        <div className="w-full max-w-md space-y-8 animate-fade-in text-center">
          <img src={logo} alt="Ciclismo Reybaud" className="w-20 h-20 mx-auto mb-2" />
          <MailCheck className="w-14 h-14 text-primary mx-auto" />
          <h1 className="text-2xl font-heading font-bold uppercase tracking-wider text-foreground">
            Revisá tu email
          </h1>
          <p className="text-muted-foreground text-sm">
            Te enviamos un enlace de acceso a <strong className="text-foreground">{email}</strong>. Hacé clic en el enlace para ingresar.
          </p>
          <div className="space-y-3">
            <Button
              variant="outline"
              onClick={() => { setMagicLinkSent(false); setError(null); }}
              className="w-full"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Cambiar email
            </Button>
            <Button
              variant="ghost"
              onClick={() => handleSendMagicLink({ preventDefault: () => {} } as React.FormEvent)}
              className="w-full text-xs"
              disabled={loading}
            >
              {loading ? "Reenviando..." : "Reenviar enlace"}
            </Button>
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

        <form onSubmit={handleSendMagicLink} className="space-y-4">
          <div className="glass-card rounded-lg p-6 space-y-4">
            <div className="space-y-2">
              <label htmlFor="admin-email" className="text-sm font-medium text-foreground">Email</label>
              <Input
                id="admin-email"
                type="email"
                name="email"
                autoComplete="username"
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
              {loading ? "Enviando..." : "Enviar Magic Link"}
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
