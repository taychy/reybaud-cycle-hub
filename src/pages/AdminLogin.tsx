import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { supabase } from "@/integrations/supabase/client";
import { ChevronRight, ArrowLeft, MailCheck, AlertTriangle, RefreshCw, KeyRound } from "lucide-react";
import logo from "@/assets/logo.png";
import { toast } from "sonner";
import { clearPendingOtpState, getSafeReturnTo, loadPendingOtpState, OTP_LENGTH, savePendingOtpState } from "@/lib/pendingOtp";

const PRODUCTION_ORIGIN = "https://reybaud-app.com";

const AdminLogin = () => {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [otpCode, setOtpCode] = useState("");
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [linkSent, setLinkSent] = useState(false);
  const [showResendFromError, setShowResendFromError] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = getSafeReturnTo(searchParams.get("returnTo"));
  const [otpReturnTo, setOtpReturnTo] = useState<string | null>(returnTo);

  // Detect callback errors from URL
  useEffect(() => {
    const urlError = searchParams.get("error");
    const errorCode = searchParams.get("error_code");
    const errorDesc = searchParams.get("error_description");

    const hash = window.location.hash;
    const hashParams = new URLSearchParams(hash.replace("#", "?"));
    const hashError = hashParams.get("error");
    const hashErrorCode = hashParams.get("error_code");
    const hashErrorDesc = hashParams.get("error_description");

    const finalError = urlError || hashError;
    const finalCode = errorCode || hashErrorCode;
    const finalDesc = errorDesc || hashErrorDesc;

    if (finalError) {
      let friendlyMessage = "El código o enlace de acceso no pudo ser validado.";

      if (finalCode === "otp_expired" || finalDesc?.includes("expired")) {
        friendlyMessage = "El código venció. Pedí uno nuevo.";
      } else if (finalCode === "otp_disabled") {
        friendlyMessage = "El acceso por código está deshabilitado.";
      } else if (finalDesc) {
        friendlyMessage = `Error: ${finalDesc}`;
      }

      setError(friendlyMessage);
      setShowResendFromError(true);
      setCheckingSession(false);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [searchParams]);

  // Auto-redirect if already authenticated — check all roles
  useEffect(() => {
    const redirectByRole = async (session: any) => {
      if (!session) return false;
      const userId = session.user.id;

      const { data: isAdmin } = await supabase.rpc("has_role", {
        _user_id: userId,
        _role: "admin" as any,
      });
      if (isAdmin) { clearPendingOtpState(); navigate("/admin", { replace: true }); return true; }

      const { data: isCoach } = await supabase.rpc("has_role", {
        _user_id: userId,
        _role: "coach" as any,
      });
      if (isCoach) { clearPendingOtpState(); navigate("/coach", { replace: true }); return true; }

      // Check alumno
      const { data: alumno } = await supabase
        .from("alumnos")
        .select("id")
        .eq("user_id", userId)
        .maybeSingle();
      if (alumno) { clearPendingOtpState(); navigate(otpReturnTo || "/alumno", { replace: true }); return true; }

      return false;
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      await redirectByRole(session);
    });

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      const redirected = await redirectByRole(session);
      if (!redirected) {
        const pendingOtp = loadPendingOtpState("staff");
        if (pendingOtp) {
          setEmail(pendingOtp.email);
          setOtpReturnTo(pendingOtp.returnTo);
          setLinkSent(true);
        }
        setCheckingSession(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate, otpReturnTo]);

  const handleSendOtp = async (e: React.FormEvent) => {
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

    const { data: isValidEmail } = await supabase.rpc("check_admin_or_coach_email" as any, {
      _email: trimmedEmail,
    });

    if (!isValidEmail) {
      setError("No se encontró una cuenta de staff con ese email. Si sos alumno, ingresá desde el login principal.");
      setLoading(false);
      return;
    }

    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: trimmedEmail,
      options: {
        emailRedirectTo: `${PRODUCTION_ORIGIN}/auth/callback`,
      },
    });

    if (otpError) {
      setError(otpError.message || "Error al enviar el código.");
      setLoading(false);
      return;
    }

    savePendingOtpState({ email: trimmedEmail, returnTo, context: "staff" });
    setOtpReturnTo(returnTo);
    setLinkSent(true);
    setLoading(false);
    toast.success("Código de acceso enviado. Revisá tu bandeja de entrada.");
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

  // Error from callback
  if (showResendFromError && !linkSent) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
        <div className="w-full max-w-md space-y-8 animate-fade-in text-center">
          <img src={logo} alt="Ciclismo Reybaud" className="w-20 h-20 mx-auto mb-2" />
          <AlertTriangle className="w-14 h-14 text-amber-500 mx-auto" />
          <h1 className="text-2xl font-heading font-bold uppercase tracking-wider text-foreground">
            Código no válido
          </h1>
          {error && (
            <div className="text-sm text-destructive bg-destructive/10 rounded-md p-4 text-left">
              {error}
            </div>
          )}
          <div className="glass-card rounded-lg p-6 space-y-4">
            <p className="text-muted-foreground text-sm">
              Ingresá tu email para recibir un nuevo código de acceso.
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
              onClick={(e) => handleSendOtp(e as any)}
            >
              {loading ? "Enviando..." : "Pedir nuevo código de acceso"}
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

  const handleVerifyOtp = async () => {
    if (otpCode.length < OTP_LENGTH) return;
    setVerifyingOtp(true);
    setError(null);

    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: email.toLowerCase().trim(),
      token: otpCode,
      type: "email",
    });

    setVerifyingOtp(false);
    if (verifyError) {
      if (verifyError.message?.includes("expired")) {
        setError("El código venció. Pedí uno nuevo.");
      } else if (verifyError.message?.includes("invalid") || verifyError.message?.includes("Token")) {
        setError("Código incorrecto. Revisalo e intentá nuevamente.");
      } else {
        setError(verifyError.message || "Error al verificar el código.");
      }
      setOtpCode("");
      return;
    }
    // onAuthStateChange will handle redirect
    toast.success("Sesión iniciada correctamente.");
  };

  // OTP sent — show code entry
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
            Te enviamos un código de acceso a <strong className="text-foreground">{email}</strong>.
            <br />
            Ingresalo acá para entrar.
          </p>

          <div className="glass-card rounded-lg p-6 space-y-4">
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <KeyRound className="w-4 h-4" />
              <span>Código de acceso</span>
            </div>
            <div className="flex justify-center">
              <InputOTP
                maxLength={OTP_LENGTH}
                value={otpCode}
                onChange={(value) => {
                  setOtpCode(value);
                  setError(null);
                }}
              >
                <InputOTPGroup>
                  {Array.from({ length: OTP_LENGTH }, (_, i) => (
                    <InputOTPSlot key={i} index={i} />
                  ))}
                </InputOTPGroup>
              </InputOTP>
            </div>

            {error && (
              <div className="text-sm text-destructive bg-destructive/10 rounded-md p-3">
                {error}
              </div>
            )}

            <Button
              variant="gold"
              className="w-full"
              size="lg"
              disabled={verifyingOtp || otpCode.length < OTP_LENGTH}
              onClick={handleVerifyOtp}
            >
              {verifyingOtp ? "Verificando..." : "Ingresar"}
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            También podés tocar el enlace del email si estás en el navegador.
          </p>

          <div className="space-y-3">
            <Button
              variant="outline"
              onClick={() => {
                clearPendingOtpState();
                setLinkSent(false);
                setError(null);
                setOtpCode("");
                setOtpReturnTo(returnTo);
              }}
              className="w-full"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Cambiar email
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setOtpCode("");
                handleSendOtp({ preventDefault: () => {} } as React.FormEvent);
              }}
              className="w-full text-xs"
              disabled={loading}
            >
              {loading ? "Reenviando..." : "Reenviar código"}
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
            Acceso Staff
          </h1>
          <p className="text-muted-foreground text-sm">Ciclismo Reybaud</p>
        </div>

        <form onSubmit={handleSendOtp} className="space-y-4">
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
              {loading ? "Enviando..." : "Pedir código de acceso"}
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
            Volver al login principal
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
