import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { ChevronRight, MailCheck, ArrowLeft, Loader2, KeyRound } from "lucide-react";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import logo from "@/assets/logo.png";
import { toast } from "sonner";
import LanguageSelector from "@/components/LanguageSelector";
import { lovable } from "@/integrations/lovable/index";
import { canRequestOtpAgain, clearPendingOtpState, finishOtpRequest, getOtpErrorMessage, getSafeReturnTo, loadPendingOtpState, normalizeOtpCode, OTP_LENGTH, savePendingOtpState, startOtpRequest } from "@/lib/pendingOtp";

/**
 * Helper: check roles and redirect accordingly.
 * Priority: admin > coach > alumno > fallback.
 */
async function redirectByRole(userId: string, navigate: ReturnType<typeof useNavigate>, returnTo: string | null) {
  // Check admin
  const { data: isAdmin } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: "admin" as any,
  });
  if (isAdmin) {
    clearPendingOtpState();
    navigate("/admin", { replace: true });
    return;
  }

  // Check coach
  const { data: isCoach } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: "coach" as any,
  });
  if (isCoach) {
    clearPendingOtpState();
    navigate("/coach", { replace: true });
    return;
  }

  // Check alumno
  const { data: alumno } = await supabase
    .from("alumnos")
    .select("id, estado, grupo")
    .eq("user_id", userId)
    .maybeSingle();

  if (alumno) {
    clearPendingOtpState();
    navigate(getSafeReturnTo(returnTo) || "/alumno", { replace: true });
    return;
  }

  // No role found
  navigate("/", { replace: true });
}

const Login = () => {
  const [email, setEmail] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get("returnTo");
  const [otpReturnTo, setOtpReturnTo] = useState<string | null>(returnTo);
  const { t } = useTranslation();

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        const pendingOtp = loadPendingOtpState("main");
        if (pendingOtp) {
          setEmail(pendingOtp.email);
          setOtpReturnTo(pendingOtp.returnTo);
          setMagicLinkSent(true);
        }
        localStorage.removeItem("alumno");
        setCheckingSession(false);
        return;
      }

      const targetReturnTo = getSafeReturnTo(returnTo || otpReturnTo);

      const userId = session.user.id;
      const userEmail = session.user.email?.toLowerCase().trim();

      // Check admin/coach first for fast redirect
      const { data: isAdmin } = await supabase.rpc("has_role", {
        _user_id: userId,
        _role: "admin" as any,
      });
      if (isAdmin) {
        clearPendingOtpState();
        navigate("/admin", { replace: true });
        return;
      }

      const { data: isCoach } = await supabase.rpc("has_role", {
        _user_id: userId,
        _role: "coach" as any,
      });
      if (isCoach) {
        clearPendingOtpState();
        navigate("/coach", { replace: true });
        return;
      }

      // Alumno flow
      if (!userEmail) { setCheckingSession(false); return; }

      const { data: alumno } = await supabase
        .rpc("lookup_alumno_by_email", { p_email: userEmail })
        .maybeSingle();

      if (!alumno) { setCheckingSession(false); return; }

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
        clearPendingOtpState();
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
          clearPendingOtpState();
          return;
        }
        clearPendingOtpState();
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
        clearPendingOtpState();
        navigate(targetReturnTo || "/alumno", { replace: true });
        return;
      }

      const { data: recentSubs } = await supabase
        .from("suscripciones")
        .select("id, estado, fecha_fin, cancelada_at")
        .eq("alumno_id", alumno.id)
        .in("estado", ["activa", "pendiente_verificacion", "cancelada"])
        .order("fecha_fin", { ascending: false })
        .limit(10);

      const hasAccess = (recentSubs || []).some((sub: any) => {
        if (sub.estado === "pendiente_verificacion") return true;
        if (sub.estado !== "activa" && sub.estado !== "cancelada") return false;
        if (!sub.fecha_fin) return sub.estado === "activa";
        const parts = sub.fecha_fin.substring(0, 10).split("-");
        const finDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]), 23, 59, 59);
        const now2 = new Date();
        now2.setHours(0, 0, 0, 0);
        if (now2 <= finDate) return true;
        const expMonth = finDate.getMonth();
        const expYear = finDate.getFullYear();
        const curMonth = now2.getMonth();
        const curYear = now2.getFullYear();
        const isNextMonth =
          (curYear === expYear && curMonth === expMonth + 1) ||
          (curYear === expYear + 1 && expMonth === 11 && curMonth === 0);
        return sub.estado === "activa" && isNextMonth && now2.getDate() <= 5;
      });

      if (!hasAccess) {
        clearPendingOtpState();
        localStorage.setItem("registro_alumno_id", alumno.id);
        localStorage.setItem("alumno_renewal", "1");
        navigate("/planes", { replace: true });
        return;
      }
      localStorage.removeItem("alumno_renewal");
      localStorage.removeItem("alumno_from_vacation");
      localStorage.removeItem("upgrade_from_sub_id");
      localStorage.removeItem("upgrade_preselect_plan_id");
      clearPendingOtpState();
      navigate(targetReturnTo || "/alumno", { replace: true });
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) checkSession();
    });
    checkSession();
    return () => subscription.unsubscribe();
  }, [navigate, t, returnTo, otpReturnTo]);

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!startOtpRequest()) return;
    setLoginError(null);
    setLoading(true);
    try {
      const trimmedEmail = email.toLowerCase().trim();
      if (!trimmedEmail) { setLoginError(t("login.enterEmail")); setLoading(false); return; }

      if (!canRequestOtpAgain("main", trimmedEmail)) {
        setLoading(false);
        return;
      }

    // Check if email exists anywhere (alumno, admin, or coach)
    const { data: alumnoData } = await supabase
      .rpc("lookup_alumno_by_email", { p_email: trimmedEmail })
      .maybeSingle();

    const { data: isAdminOrCoach } = await supabase.rpc("check_admin_or_coach_email" as any, { _email: trimmedEmail });

    if (!alumnoData && !isAdminOrCoach) {
      setLoginError("No se encontró una cuenta con ese email. Si sos nuevo, creá tu cuenta primero.");
      setLoading(false);
      return;
    }

    // Check blocked alumno
    if (alumnoData?.estado === "bloqueado") { setLoginError(t("login.accessDisabled")); setLoading(false); return; }

    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: trimmedEmail,
      options: { emailRedirectTo: "https://reybaud-app.com/auth/callback" },
    });
    if (otpError) { setLoginError(otpError.message || "Error"); setLoading(false); return; }

    const safeReturnTo = getSafeReturnTo(returnTo);
    savePendingOtpState({ email: trimmedEmail, returnTo: safeReturnTo, context: "main" });
    setOtpReturnTo(safeReturnTo);
    setMagicLinkSent(true);
    setLoading(false);
    toast.success("Código de acceso enviado. Revisá tu email.");
    } finally {
      finishOtpRequest();
    }
  };

  const handleGoogleLogin = async () => {
    setLoginError(null);
    setGoogleLoading(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
      if (result.error) { setLoginError(result.error.message || "Error al iniciar sesión con Google"); setGoogleLoading(false); return; }
      if (result.redirected) return;
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

  const handleVerifyOtp = async () => {
    if (otpCode.length < OTP_LENGTH) return;
    setVerifyingOtp(true);
    setLoginError(null);

    const normalizedCode = normalizeOtpCode(otpCode);
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: email.toLowerCase().trim(),
      token: normalizedCode,
      type: "email",
    });

    setVerifyingOtp(false);
    if (verifyError) {
      setLoginError(getOtpErrorMessage(verifyError));
      setOtpCode("");
      return;
    }
    clearPendingOtpState();
    toast.success("Sesión iniciada correctamente.");
    // onAuthStateChange will handle redirect
  };

  if (magicLinkSent) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background px-6 safe-area-inset">
        <div className="absolute top-4 right-4"><LanguageSelector /></div>
        <div className="w-full max-w-sm space-y-8 animate-fade-in text-center">
          <img src={logo} alt="Ciclismo Reybaud" className="w-20 h-20 mx-auto" />
          <MailCheck className="w-12 h-12 text-primary mx-auto" />
          <div className="space-y-2">
            <h1 className="text-2xl font-heading font-bold uppercase tracking-wider text-foreground">
              Revisá tu email
            </h1>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Te enviamos un código de acceso a{" "}
              <strong className="text-foreground">{email}</strong>.
              <br />
              Ingresalo acá para entrar.
            </p>
          </div>

          <div className="glass-card rounded-xl p-4 sm:p-6 space-y-4">
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
                  setLoginError(null);
                }}
              >
                <InputOTPGroup>
                  {Array.from({ length: OTP_LENGTH }, (_, i) => (
                    <InputOTPSlot key={i} index={i} className="h-9 w-7 text-base sm:h-10 sm:w-10" />
                  ))}
                </InputOTPGroup>
              </InputOTP>
            </div>

            {loginError && (
              <div className="text-sm text-destructive bg-destructive/10 rounded-xl p-3">
                {loginError}
              </div>
            )}

            <Button
              variant="gold"
              className="w-full h-12 rounded-xl"
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

          <div className="space-y-3 pt-2">
            <Button
              variant="outline"
              onClick={() => {
                clearPendingOtpState();
                setMagicLinkSent(false);
                setLoginError(null);
                setOtpCode("");
                setOtpReturnTo(returnTo);
              }}
              className="w-full h-12 rounded-xl"
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
              {loading ? "Reenviando…" : "Reenviar código"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-6 safe-area-inset">
      <div className="absolute top-4 right-4"><LanguageSelector /></div>

      <div className="w-full max-w-sm space-y-10 animate-fade-in">
        <div className="text-center space-y-3 pt-4">
          <img src={logo} alt="Ciclismo Reybaud" className="w-24 h-24 mx-auto" />
          <h1 className="text-2xl font-heading font-bold uppercase tracking-wider text-foreground">
            Bienvenido a Ciclismo Reybaud
          </h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Ingresá para ver tus clases, pagos, eventos y trámites
          </p>
        </div>

        <form onSubmit={handleSendOtp} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="email" className="text-sm font-medium text-foreground">
              Tu email
            </label>
            <Input
              id="email"
              type="email"
              name="email"
              autoComplete="username"
              placeholder="nombre@email.com"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setLoginError(null); }}
              required
              className="h-12 rounded-xl bg-secondary border-border text-foreground placeholder:text-muted-foreground text-base"
            />
          </div>

          {loginError && (
            <div className="text-sm text-destructive bg-destructive/10 rounded-xl p-3">
              {loginError}
            </div>
          )}

          <Button type="submit" variant="gold" className="w-full h-12 rounded-xl text-base" disabled={loading}>
            {loading ? "Enviando…" : "Pedir código de acceso"}
            {!loading && <ChevronRight className="w-4 h-4" />}
          </Button>

          <div className="relative flex items-center justify-center py-1">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <span className="relative bg-background px-4 text-xs text-muted-foreground uppercase">o</span>
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full h-12 rounded-xl text-base"
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
            Continuar con Google
          </Button>
        </form>

        <div className="text-center space-y-4 pt-2">
          <button
            onClick={() => navigate("/registro")}
            className="text-sm text-primary hover:text-primary/80 transition-colors font-semibold"
          >
            Crear cuenta
          </button>
          <br />
          <button
            onClick={() => navigate("/asesoria")}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Ver planes y valores
          </button>
        </div>

        <div className="text-center pb-6 pt-4">
          <button
            onClick={() => navigate("/admin/login")}
            className="text-[11px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
          >
            Acceso staff
          </button>
        </div>
      </div>
    </div>
  );
};

export default Login;
