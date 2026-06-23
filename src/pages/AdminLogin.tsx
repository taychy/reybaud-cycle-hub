import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { supabase } from "@/integrations/supabase/client";
import { ChevronRight, ArrowLeft, MailCheck, AlertTriangle, RefreshCw, KeyRound } from "lucide-react";
import logo from "@/assets/logo.png";
import { toast } from "sonner";
import { canRequestOtpAgain, clearPendingOtpState, finishOtpRequest, getOtpErrorMessage, getSafeReturnTo, loadPendingOtpState, normalizeOtpCode, OTP_LENGTH, savePendingOtpState, startOtpRequest } from "@/lib/pendingOtp";

const PRODUCTION_ORIGIN = "https://reybaud-app.com";
const ROLE_CHECK_TIMEOUT_MS = 7000;

const checkAppRole = async (userId: string, role: "admin" | "coach" | "deposito") => {
  try {
    const roleCheck = supabase.rpc("has_role", {
      _user_id: userId,
      _role: role as any,
    });
    const timeout = new Promise<{ data: false }>((resolve) => {
      window.setTimeout(() => resolve({ data: false }), ROLE_CHECK_TIMEOUT_MS);
    });
    const { data } = await Promise.race([roleCheck, timeout]);
    return !!data;
  } catch {
    return false;
  }
};

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

  const redirectByRole = useCallback(async (session: any) => {
    if (!session) return false;
    const userId = session.user.id;

    if (await checkAppRole(userId, "admin")) {
      clearPendingOtpState();
      const target = otpReturnTo && otpReturnTo.startsWith("/admin") ? otpReturnTo : "/admin";
      navigate(target, { replace: true });
      return true;
    }

    if (await checkAppRole(userId, "coach")) {
      clearPendingOtpState();
      const target = otpReturnTo && otpReturnTo.startsWith("/coach") ? otpReturnTo : "/coach";
      navigate(target, { replace: true });
      return true;
    }

    if (await checkAppRole(userId, "deposito")) {
      clearPendingOtpState();
      const target = otpReturnTo?.startsWith("/deposito") ? otpReturnTo : "/deposito";
      navigate(target, { replace: true });
      return true;
    }


    const { data: alumno } = await supabase
      .from("alumnos")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (alumno) {
      clearPendingOtpState();
      navigate(otpReturnTo || "/alumno", { replace: true });
      return true;
    }

    return false;
  }, [navigate, otpReturnTo]);

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
    let cancelled = false;

    const restorePendingOtp = () => {
      const pendingOtp = loadPendingOtpState("staff");
      if (pendingOtp) {
        setEmail(pendingOtp.email);
        setOtpReturnTo(pendingOtp.returnTo);
        setLinkSent(true);
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "INITIAL_SESSION") return;
      window.setTimeout(() => {
        void redirectByRole(session).then((redirected) => {
          if (!cancelled && !redirected) {
            restorePendingOtp();
            setCheckingSession(false);
          }
        });
      }, 0);
    });

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      const redirected = await redirectByRole(session);
      if (!cancelled && !redirected) {
        restorePendingOtp();
        setCheckingSession(false);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [redirectByRole]);

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!startOtpRequest()) return;
    setError(null);
    setShowResendFromError(false);
    setLoading(true);
    try {
      const trimmedEmail = email.toLowerCase().trim();
      if (!trimmedEmail) {
        setError("Ingresá tu email.");
        setLoading(false);
        return;
      }

      if (!canRequestOtpAgain("staff", trimmedEmail)) {
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
      console.warn("OTP request failed", {
        code: otpError.code,
        status: otpError.status,
        message: otpError.message,
        at: new Date().toISOString(),
      });
      setError(otpError.message || "Error al enviar el código.");
      setLoading(false);
      return;
    }

    savePendingOtpState({ email: trimmedEmail, returnTo, context: "staff" });
    setOtpReturnTo(returnTo);
    setLinkSent(true);
    setLoading(false);
    toast.success("Código de acceso enviado. Revisá tu bandeja de entrada.");
    } finally {
      finishOtpRequest();
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
          <div className="glass-card rounded-lg p-4 sm:p-6 space-y-4">
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
    if (verifyingOtp) return;
    const normalizedCode = normalizeOtpCode(otpCode);
    if (normalizedCode.length < OTP_LENGTH) return;
    setVerifyingOtp(true);
    setError(null);

    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: email.toLowerCase().trim(),
      token: normalizedCode,
      type: "email",
    });

    setVerifyingOtp(false);
    if (verifyError) {
      setError(getOtpErrorMessage(verifyError));
      setOtpCode("");
      return;
    }
    clearPendingOtpState();
    toast.success("Sesión iniciada correctamente.");
    const { data: { session } } = await supabase.auth.getSession();
    const redirected = await redirectByRole(session);
    if (!redirected) {
      setError("Sesión iniciada, pero no se pudo confirmar el permiso de staff.");
    }
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
                  setOtpCode(normalizeOtpCode(value));
                  setError(null);
                }}
              >
                <InputOTPGroup>
                  {Array.from({ length: OTP_LENGTH }, (_, i) => (
                    <InputOTPSlot key={i} index={i} className="h-9 w-7 text-base sm:h-10 sm:w-10" />
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
