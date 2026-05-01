import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { ChevronRight, ArrowLeft, MailCheck, AlertTriangle, RefreshCw } from "lucide-react";
import logo from "@/assets/logo.png";
import { toast } from "sonner";

const PRODUCTION_ORIGIN = "https://reybaud-app.com";

const AdminLogin = () => {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [linkSent, setLinkSent] = useState(false);
  const [showResendFromError, setShowResendFromError] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Detect callback errors from URL (e.g. otp_expired, access_denied)
  useEffect(() => {
    const urlError = searchParams.get("error");
    const errorCode = searchParams.get("error_code");
    const errorDesc = searchParams.get("error_description");

    // Also check hash fragment (Supabase sometimes puts errors there)
    const hash = window.location.hash;
    const hashParams = new URLSearchParams(hash.replace("#", "?"));
    const hashError = hashParams.get("error");
    const hashErrorCode = hashParams.get("error_code");
    const hashErrorDesc = hashParams.get("error_description");

    const finalError = urlError || hashError;
    const finalCode = errorCode || hashErrorCode;
    const finalDesc = errorDesc || hashErrorDesc;

    if (finalError) {
      let friendlyMessage = "El enlace de acceso no pudo ser validado.";

      if (finalCode === "otp_expired" || finalDesc?.includes("expired")) {
        friendlyMessage = "El enlace de acceso expiró o ya fue utilizado. Solicitá uno nuevo.";
      } else if (finalCode === "otp_disabled") {
        friendlyMessage = "El acceso por enlace está deshabilitado.";
      } else if (finalDesc) {
        friendlyMessage = `Error: ${finalDesc}`;
      }

      // If opened from PWA in browser, add context
      const isPWACrossContext = document.referrer === "" && !window.matchMedia("(display-mode: standalone)").matches;
      if (isPWACrossContext && finalCode === "otp_expired") {
        friendlyMessage = "El enlace de acceso se abrió en un contexto distinto al que lo solicitó (ej. app instalada vs navegador). Solicitá un nuevo enlace desde este navegador.";
      }

      setError(friendlyMessage);
      setShowResendFromError(true);
      setCheckingSession(false);

      // Clean URL params
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [searchParams]);

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

  const handleSendLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setShowResendFromError(false);
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

    // Always redirect to production domain to avoid PWA/browser context mismatch
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: trimmedEmail,
      options: {
        emailRedirectTo: `${PRODUCTION_ORIGIN}/auth/callback`,
      },
    });

    if (otpError) {
      setError(otpError.message || "Error al enviar el enlace.");
      setLoading(false);
      return;
    }

    setLinkSent(true);
    setLoading(false);
    toast.success("Enlace de acceso enviado. Revisá tu bandeja de entrada.");
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

  // Error from callback — show friendly error with resend option
  if (showResendFromError && !linkSent) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
        <div className="w-full max-w-md space-y-8 animate-fade-in text-center">
          <img src={logo} alt="Ciclismo Reybaud" className="w-20 h-20 mx-auto mb-2" />
          <AlertTriangle className="w-14 h-14 text-amber-500 mx-auto" />
          <h1 className="text-2xl font-heading font-bold uppercase tracking-wider text-foreground">
            Enlace no válido
          </h1>
          {error && (
            <div className="text-sm text-destructive bg-destructive/10 rounded-md p-4 text-left">
              {error}
            </div>
          )}
          <div className="glass-card rounded-lg p-6 space-y-4">
            <p className="text-muted-foreground text-sm">
              Ingresá tu email para recibir un nuevo enlace de acceso.
            </p>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@email.com"
              className="bg-secondary border-border text-foreground placeholder:text-muted-foreground"
            />
            <Button
              variant="gold"
              className="w-full"
              size="lg"
              disabled={loading || !email.trim()}
              onClick={(e) => handleSendLink(e as any)}
            >
              {loading ? "Enviando..." : "Enviar nuevo enlace de acceso"}
              <RefreshCw className="w-4 h-4 ml-2" />
            </Button>
          </div>
          <button
            onClick={() => { setShowResendFromError(false); setError(null); }}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
          >
            <ArrowLeft className="w-3 h-3" />
            Volver al login
          </button>
        </div>
      </div>
    );
  }

  // Link sent confirmation
  if (linkSent) {
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
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
            <p className="text-xs text-amber-200">
              💡 Si usás la app instalada, el enlace se abrirá en tu navegador. Es normal — ingresá desde ahí.
            </p>
          </div>
          <div className="space-y-3">
            <Button
              variant="outline"
              onClick={() => { setLinkSent(false); setError(null); }}
              className="w-full"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Cambiar email
            </Button>
            <Button
              variant="ghost"
              onClick={() => handleSendLink({ preventDefault: () => {} } as React.FormEvent)}
              className="w-full text-xs"
              disabled={loading}
            >
              {loading ? "Reenviando..." : "Reenviar enlace de acceso"}
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

        <form onSubmit={handleSendLink} className="space-y-4">
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
              {loading ? "Enviando..." : "Enviar enlace de acceso"}
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
