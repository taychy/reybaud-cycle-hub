import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { ChevronRight, Shield, Download, MailCheck, ArrowLeft } from "lucide-react";
import logo from "@/assets/logo.png";
import { toast } from "sonner";

const Login = () => {
  const [email, setEmail] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const navigate = useNavigate();

  // On mount: check existing session and auto-redirect
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
        .from("alumnos")
        .select("id, estado, grupo")
        .eq("email", userEmail)
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

      // Bloqueado: no puede ingresar
      if (alumno.estado === "bloqueado") {
        setCheckingSession(false);
        setLoginError("Tu acceso está deshabilitado. Si creés que esto es un error, contactate con administración.");
        return;
      }

      // Inactivo sin grupo: nuevo registro, va a elegir plan
      if (alumno.estado === "inactivo" && alumno.grupo === "Sin grupo") {
        localStorage.setItem("registro_alumno_id", alumno.id);
        navigate("/planes", { replace: true });
        return;
      }

      // Inactivo con grupo: fue dado de baja
      if (alumno.estado === "inactivo") {
        setCheckingSession(false);
        setLoginError("Tu cuenta se encuentra inactiva. Contactate con administración para reactivarla.");
        return;
      }

      // Pendiente: onboarding
      if (alumno.estado === "pendiente") {
        if (alumno.grupo === "Sin grupo") {
          setCheckingSession(false);
          setLoginError("Tu registro está pendiente de aprobación. Te avisaremos cuando esté listo.");
          return;
        }
        localStorage.setItem("registro_alumno_id", alumno.id);
        navigate("/planes", { replace: true });
        return;
      }

      // Sin grupo asignado (activo o vacaciones)
      if (alumno.grupo === "Sin grupo" && alumno.estado !== "vacaciones") {
        setCheckingSession(false);
        setLoginError("Tu usuario aún no tiene grupo asignado. Contactá administración.");
        return;
      }

      // Vacaciones: acceso limitado
      if (alumno.estado === "vacaciones") {
        navigate("/alumno", { replace: true });
        return;
      }

      // Activo: verificar suscripción
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
  }, [navigate]);

  const handleSendMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setLoading(true);

    const trimmedEmail = email.toLowerCase().trim();
    if (!trimmedEmail) {
      setLoginError("Ingresá tu email.");
      setLoading(false);
      return;
    }

    // Verify alumno exists
    const { data, error: fetchError } = await supabase
      .from("alumnos")
      .select("id, estado, grupo")
      .eq("email", trimmedEmail)
      .maybeSingle();

    if (fetchError || !data) {
      setLoginError("No se encontró un usuario con ese email.");
      setLoading(false);
      return;
    }

    // Bloqueado
    if (data.estado === "bloqueado") {
      setLoginError("Tu acceso está deshabilitado. Si creés que esto es un error, contactate con administración.");
      setLoading(false);
      return;
    }

    // Inactivo
    if (data.estado === "inactivo" && data.grupo === "Sin grupo") {
      localStorage.setItem("registro_alumno_id", data.id);
      navigate("/planes");
      setLoading(false);
      return;
    }

    if (data.estado === "inactivo") {
      setLoginError("Tu cuenta se encuentra inactiva. Contactate con administración para reactivarla.");
      setLoading(false);
      return;
    }

    // Pendiente
    if (data.estado === "pendiente") {
      setLoginError("Tu registro está pendiente de aprobación. Te avisaremos cuando esté listo.");
      setLoading(false);
      return;
    }

    if (data.grupo === "Sin grupo" && data.estado !== "vacaciones") {
      setLoginError("Tu usuario aún no tiene grupo asignado. Contactá administración.");
      setLoading(false);
      return;
    }

    // Send Magic Link
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: trimmedEmail,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
      },
    });

    if (otpError) {
      setLoginError(otpError.message || "Error al enviar el enlace de acceso.");
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
              onClick={() => { setMagicLinkSent(false); setLoginError(null); }}
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
        {/* Logo */}
        <div className="text-center space-y-3">
          <img src={logo} alt="Ciclismo Reybaud" className="w-20 h-20 mx-auto mb-2" />
          <h1 className="text-3xl font-heading font-bold uppercase tracking-wider text-foreground">
            Ciclismo Reybaud
          </h1>
          <p className="text-muted-foreground text-sm">
            Ingresá con tu email
          </p>
        </div>

        {/* Login form */}
        <form onSubmit={handleSendMagicLink} className="space-y-4">
          <div className="glass-card rounded-lg p-6 space-y-4">
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium text-foreground">
                Email
              </label>
              <Input
                id="email"
                type="email"
                name="email"
                autoComplete="username"
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
              {loading ? "Enviando..." : "Enviar Magic Link"}
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

        {/* Developer credit */}
        <div className="text-center pt-4">
          <a
            href="https://wa.me/5491171711122?text=Hola%20me%20gustar%C3%ADa%20obtener%20informaci%C3%B3n%20para%20desarrollar%20una%20app%20para%20gestionar%20mi%20negocio"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors"
          >
            Desarrollado por SB
          </a>
        </div>
      </div>
    </div>
  );
};

export default Login;
