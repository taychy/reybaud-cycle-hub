import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { ChevronRight, Shield, Download, MailCheck, ArrowLeft, Loader2 } from "lucide-react";
import logo from "@/assets/logo.png";
import { toast } from "sonner";
import LanguageSelector from "@/components/LanguageSelector";
import { lovable } from "@/integrations/lovable/index";

const Login = () => {
  const [email, setEmail] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [adminRedirect, setAdminRedirect] = useState<string | null>(null);
  const navigate = useNavigate();
  const { t } = useTranslation();

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        localStorage.removeItem("alumno");
        setCheckingSession(false);
        return;
      }

      const userEmail = session.user.email?.toLowerCase().trim();
      if (!userEmail) {
        setCheckingSession(false);
        return;
      }

      const { data: alumno } = await supabase
        .rpc("lookup_alumno_by_email", { p_email: userEmail })
        .maybeSingle();

      if (!alumno) {
        setCheckingSession(false);
        return;
      }

      await supabase
        .from("alumnos")
        .update({ user_id: session.user.id })
        .eq("id", alumno.id)
        .is("user_id", null);

      if (alumno.estado === "bloqueado") {
        setCheckingSession(false);
        setLoginError(t("login.accessDisabled"));
        return;
      }

      if (alumno.estado === "inactivo" && alumno.grupo === "Sin grupo") {
        localStorage.setItem("registro_alumno_id", alumno.id);
        navigate("/planes", { replace: true });
        return;
      }

      if (alumno.estado === "inactivo") {
        setCheckingSession(false);
        setLoginError(t("login.accountInactive"));
        return;
      }

      if (alumno.estado === "pendiente") {
        if (alumno.grupo === "Sin grupo") {
          setCheckingSession(false);
          setLoginError(t("login.pendingApproval"));
          return;
        }
        localStorage.setItem("registro_alumno_id", alumno.id);
        navigate("/planes", { replace: true });
        return;
      }

      if (alumno.grupo === "Sin grupo" && alumno.estado !== "vacaciones") {
        setCheckingSession(false);
        setLoginError(t("login.noGroupAssigned"));
        return;
      }

      if (alumno.estado === "vacaciones") {
        navigate("/alumno", { replace: true });
        return;
      }

      const now = new Date();
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      const { data: activeSub } = await supabase
        .from("suscripciones")
        .select("id")
        .eq("alumno_id", alumno.id)
        .eq("estado", "activa")
        .gte("fecha_fin", todayStr)
        .limit(1);

      if (!activeSub || activeSub.length === 0) {
        localStorage.setItem("registro_alumno_id", alumno.id);
        localStorage.setItem("alumno_renewal", "1");
        navigate("/planes", { replace: true });
        return;
      }

      navigate("/alumno", { replace: true });
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) {
        checkSession();
      }
    });

    checkSession();

    return () => subscription.unsubscribe();
  }, [navigate, t]);

  const handleSendMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setLoading(true);

    const trimmedEmail = email.toLowerCase().trim();
    if (!trimmedEmail) {
      setLoginError(t("login.enterEmail"));
      setLoading(false);
      return;
    }

    const { data, error: fetchError } = await supabase
      .rpc("lookup_alumno_by_email", { p_email: trimmedEmail })
      .maybeSingle();

    if (fetchError || !data) {
      // Check if email belongs to admin or coach
      const { data: isAdminOrCoach } = await supabase.rpc("check_admin_or_coach_email" as any, {
        _email: trimmedEmail,
      });
      if (isAdminOrCoach) {
        setLoginError(null);
        setAdminRedirect(trimmedEmail);
      } else {
        setLoginError(t("login.userNotFound"));
      }
      setLoading(false);
      return;
    }

    if (data.estado === "bloqueado") {
      setLoginError(t("login.accessDisabled"));
      setLoading(false);
      return;
    }

    if (data.estado === "inactivo" && data.grupo === "Sin grupo") {
      localStorage.setItem("registro_alumno_id", data.id);
      navigate("/planes");
      setLoading(false);
      return;
    }

    if (data.estado === "inactivo") {
      setLoginError(t("login.accountInactive"));
      setLoading(false);
      return;
    }

    if (data.estado === "pendiente") {
      setLoginError(t("login.pendingApproval"));
      setLoading(false);
      return;
    }

    if (data.grupo === "Sin grupo" && data.estado !== "vacaciones") {
      setLoginError(t("login.noGroupAssigned"));
      setLoading(false);
      return;
    }

    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: trimmedEmail,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
      },
    });

    if (otpError) {
      setLoginError(otpError.message || "Error");
      setLoading(false);
      return;
    }

    setMagicLinkSent(true);
    setLoading(false);
    toast.success(t("login.magicLinkSuccess"));
  };

  const handleGoogleLogin = async () => {
    setLoginError(null);
    setGoogleLoading(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) {
        setLoginError(result.error.message || "Error al iniciar sesión con Google");
        setGoogleLoading(false);
        return;
      }
      if (result.redirected) {
        return;
      }
    } catch (err: any) {
      setLoginError(err.message || "Error al iniciar sesión con Google");
      setGoogleLoading(false);
    }
  };

  if (checkingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4 animate-fade-in">
          <img src={logo} alt="Ciclismo Reybaud" className="w-16 h-16" />
          <div className="animate-pulse text-muted-foreground text-sm">{t("dashboard.loading")}</div>
        </div>
      </div>
    );
  }

  if (magicLinkSent) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
        <div className="absolute top-4 right-4">
          <LanguageSelector />
        </div>
        <div className="w-full max-w-md space-y-8 animate-fade-in text-center">
          <img src={logo} alt="Ciclismo Reybaud" className="w-20 h-20 mx-auto mb-2" />
          <MailCheck className="w-14 h-14 text-primary mx-auto" />
          <h1 className="text-2xl font-heading font-bold uppercase tracking-wider text-foreground">
            {t("login.checkEmail")}
          </h1>
          <p className="text-muted-foreground text-sm">
            {t("login.magicLinkSent")} <strong className="text-foreground">{email}</strong>. {t("login.clickToLogin")}
          </p>
          <div className="space-y-3">
            <Button
              variant="outline"
              onClick={() => { setMagicLinkSent(false); setLoginError(null); }}
              className="w-full"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              {t("login.changeEmail")}
            </Button>
            <Button
              variant="ghost"
              onClick={() => handleSendMagicLink({ preventDefault: () => {} } as React.FormEvent)}
              className="w-full text-xs"
              disabled={loading}
            >
              {loading ? t("login.resending") : t("login.resendLink")}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
      <div className="absolute top-4 right-4">
        <LanguageSelector />
      </div>
      <div className="w-full max-w-md space-y-8 animate-fade-in">
        {/* Logo */}
        <div className="text-center space-y-3">
          <img src={logo} alt="Ciclismo Reybaud" className="w-20 h-20 mx-auto mb-2" />
          <h1 className="text-3xl font-heading font-bold uppercase tracking-wider text-foreground">
            {t("login.title")}
          </h1>
          <p className="text-muted-foreground text-sm">
            {t("login.subtitle")}
          </p>
        </div>

        {/* Login form */}
        <form onSubmit={handleSendMagicLink} className="space-y-4">
          <div className="glass-card rounded-lg p-6 space-y-4">
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium text-foreground">
                {t("login.email")}
              </label>
              <Input
                id="email"
                type="email"
                name="email"
                autoComplete="username"
                placeholder={t("login.emailPlaceholder")}
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
              {loading ? t("login.sending") : t("login.sendMagicLink")}
              <ChevronRight className="w-4 h-4" />
            </Button>

            <div className="relative flex items-center justify-center">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <span className="relative bg-background px-3 text-xs text-muted-foreground uppercase">
                {t("login.or", "o")}
              </span>
            </div>

            <Button
              type="button"
              variant="outline"
              className="w-full"
              size="lg"
              onClick={handleGoogleLogin}
              disabled={googleLoading}
            >
              {googleLoading ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
              )}
              {t("login.googleSignIn", "Continuar con Google")}
            </Button>
          </div>
        </form>

        {/* Register link */}
        <div className="text-center space-y-2">
          <button
            onClick={() => navigate("/registro")}
            className="text-sm text-primary hover:text-gold-light transition-colors font-medium"
          >
            {t("login.noAccount")}
          </button>
          <br />
          <button
            onClick={() => navigate("/asesoria")}
            className="text-sm text-muted-foreground hover:text-primary transition-colors"
          >
            {t("login.viewServices")}
          </button>
        </div>

        {/* Install app banner */}
        {!window.matchMedia("(display-mode: standalone)").matches && (
          <div className="glass-card rounded-lg p-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Download className="w-5 h-5 text-primary shrink-0" />
              <p className="text-sm text-muted-foreground">
                {t("login.installApp")}
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
              {t("login.install")}
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
            {t("login.adminAccess")}
          </button>
        </div>

      </div>
    </div>
  );
};

export default Login;
