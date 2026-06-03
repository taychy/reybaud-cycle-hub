import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { supabase } from "@/integrations/supabase/client";
import { Package, ChevronRight, ArrowLeft, MailCheck, KeyRound } from "lucide-react";
import { toast } from "sonner";
import {
  canRequestOtpAgain,
  clearPendingOtpState,
  finishOtpRequest,
  getOtpErrorMessage,
  loadPendingOtpState,
  normalizeOtpCode,
  OTP_LENGTH,
  savePendingOtpState,
  startOtpRequest,
} from "@/lib/pendingOtp";

const PRODUCTION_ORIGIN = "https://reybaud-app.com";
const ROLE_CHECK_TIMEOUT_MS = 7000;

const DepositoLogin = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [linkSent, setLinkSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [verifyingOtp, setVerifyingOtp] = useState(false);

  const restorePendingOtp = useCallback(() => {
    const pending = loadPendingOtpState("staff");
    if (pending) {
      setEmail(pending.email);
      setLinkSent(true);
    }
  }, []);

  // Auto-redirect if already authenticated as deposito
  useEffect(() => {
    let cancelled = false;

    const redirectIfDeposito = async (session: any) => {
      if (!session) return false;
      const roleCheck = supabase.rpc("has_role", {
        _user_id: session.user.id,
        _role: "deposito" as any,
      });
      const timeout = new Promise<{ data: false }>((resolve) => {
        window.setTimeout(() => resolve({ data: false }), ROLE_CHECK_TIMEOUT_MS);
      });
      const { data: isDeposito } = await Promise.race([roleCheck, timeout]);
      if (cancelled) return true;
      if (isDeposito) {
        clearPendingOtpState();
        navigate("/deposito", { replace: true });
        return true;
      }
      return false;
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      // No ejecutar RPCs dentro del callback de auth: puede dejar la app clavada.
      window.setTimeout(() => {
        void redirectIfDeposito(session).finally(() => {
          if (!cancelled) {
            restorePendingOtp();
            setCheckingSession(false);
          }
        });
      }, 0);
    });

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      const redirected = await redirectIfDeposito(session);
      if (!cancelled && !redirected) {
        restorePendingOtp();
        setCheckingSession(false);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [navigate, restorePendingOtp]);

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!startOtpRequest()) return;
    setError(null);
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
        setError("No se encontró una cuenta de depósito con ese email.");
        setLoading(false);
        return;
      }

      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: trimmedEmail,
        options: { emailRedirectTo: `${PRODUCTION_ORIGIN}/auth/callback` },
      });

      if (otpError) {
        setError(otpError.message || "Error al enviar el código.");
        setLoading(false);
        return;
      }

      savePendingOtpState({ email: trimmedEmail, returnTo: "/deposito", context: "staff" });
      setLinkSent(true);
      setLoading(false);
      toast.success("Código enviado. Revisá tu email.");
    } finally {
      finishOtpRequest();
    }
  };

  const handleVerifyOtp = async () => {
    if (verifyingOtp) return;
    const normalized = normalizeOtpCode(otpCode);
    if (normalized.length < OTP_LENGTH) return;
    setVerifyingOtp(true);
    setError(null);

    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: email.toLowerCase().trim(),
      token: normalized,
      type: "email",
    });

    setVerifyingOtp(false);
    if (verifyError) {
      setError(getOtpErrorMessage(verifyError));
      setOtpCode("");
      return;
    }
    clearPendingOtpState();
    toast.success("Sesión iniciada.");
    // onAuthStateChange handles redirect
  };

  if (checkingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground text-sm">Cargando...</div>
      </div>
    );
  }

  if (linkSent) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
        <div className="w-full max-w-md space-y-6 animate-fade-in text-center">
          <MailCheck className="w-14 h-14 text-primary mx-auto" />
          <h1 className="text-2xl font-heading font-bold uppercase tracking-wider text-foreground">
            Revisá tu email
          </h1>
          <p className="text-muted-foreground text-sm">
            Te enviamos un código a <strong className="text-foreground">{email}</strong>.<br />
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
                onChange={(v) => { setOtpCode(normalizeOtpCode(v)); setError(null); }}
              >
                <InputOTPGroup>
                  {Array.from({ length: OTP_LENGTH }, (_, i) => (
                    <InputOTPSlot key={i} index={i} className="h-9 w-7 text-base sm:h-10 sm:w-10" />
                  ))}
                </InputOTPGroup>
              </InputOTP>
            </div>

            {error && (
              <div className="text-sm text-destructive bg-destructive/10 rounded-md p-3">{error}</div>
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

          <div className="space-y-3">
            <Button
              variant="outline"
              onClick={() => {
                clearPendingOtpState();
                setLinkSent(false);
                setOtpCode("");
                setError(null);
              }}
              className="w-full"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Cambiar email
            </Button>
            <Button
              variant="ghost"
              onClick={() => { setOtpCode(""); handleSendOtp({ preventDefault: () => {} } as React.FormEvent); }}
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
      <div className="w-full max-w-md space-y-6 animate-fade-in">
        <div className="text-center space-y-3">
          <div className="mx-auto w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
            <Package className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-2xl font-heading font-bold uppercase tracking-wider text-foreground">
            Acceso Depósito
          </h1>
          <p className="text-muted-foreground text-sm">Ciclismo Reybaud</p>
        </div>

        <form onSubmit={handleSendOtp} className="space-y-4">
          <div className="glass-card rounded-lg p-6 space-y-4">
            <div className="space-y-2">
              <label htmlFor="deposito-email" className="text-sm font-medium text-foreground">Email</label>
              <Input
                id="deposito-email"
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
        </div>
      </div>
    </div>
  );
};

export default DepositoLogin;
