import { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { KeyRound, CheckCircle, Check, X, Eye, EyeOff, AlertTriangle, MailCheck } from "lucide-react";
import logo from "@/assets/logo.png";
import { toast } from "sonner";

const PASSWORD_RULES = [
  { id: "length", label: "Entre 4 y 20 caracteres", test: (p: string) => p.length >= 4 && p.length <= 20 },
];

type PageState = "loading" | "form" | "success" | "error";

const SetPassword = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pageState, setPageState] = useState<PageState>("loading");
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [resendDone, setResendDone] = useState(false);

  const ruleResults = useMemo(
    () => PASSWORD_RULES.map((r) => ({ ...r, passed: r.test(password) })),
    [password]
  );
  const allRulesPassed = ruleResults.every((r) => r.passed);
  const passwordsMatch = password.length > 0 && password === confirmPassword;

  useEffect(() => {
    // Check for error in URL hash (Supabase puts errors there for expired/invalid tokens)
    const hash = window.location.hash;
    if (hash) {
      const params = new URLSearchParams(hash.replace("#", ""));
      const errorParam = params.get("error");
      const errorDesc = params.get("error_description");
      if (errorParam) {
        setTokenError(errorDesc || "El enlace es inválido o ha expirado.");
        setPageState("error");
        return;
      }
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        if (session?.user) {
          // Try to get the user's name from profile tables
          const uid = session.user.id;
          setUserEmail(session.user.email || "");

          const { data: adminProfile } = await supabase
            .from("admin_profiles")
            .select("first_name, last_name")
            .eq("user_id", uid)
            .maybeSingle();

          if (adminProfile) {
            setUserName(`${adminProfile.first_name} ${adminProfile.last_name}`.trim());
            setPageState("form");
            return;
          }

          const { data: alumnoProfile } = await supabase
            .from("alumnos")
            .select("nombre")
            .eq("user_id", uid)
            .maybeSingle();

          if (alumnoProfile) {
            setUserName((alumnoProfile as any).nombre || "");
            setPageState("form");
            return;
          }

          const { data: coachProfile } = await supabase
            .from("coaches")
            .select("nombre")
            .eq("user_id", uid)
            .maybeSingle();

          if (coachProfile) {
            setUserName((coachProfile as any).nombre || "");
            setPageState("form");
            return;
          }

          // No profile found but session exists — allow password set anyway
          setPageState("form");
        }
      }
    });

    // Also check if there's already a session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session) {
        const uid = session.user.id;
        setUserEmail(session.user.email || "");

        const { data: adminProfile } = await supabase
          .from("admin_profiles")
          .select("first_name, last_name")
          .eq("user_id", uid)
          .maybeSingle();

        if (adminProfile) {
          setUserName(`${adminProfile.first_name} ${adminProfile.last_name}`.trim());
        } else {
          const { data: alumnoProfile } = await supabase
            .from("alumnos")
            .select("nombre")
            .eq("user_id", uid)
            .maybeSingle();
          if (alumnoProfile) {
            setUserName((alumnoProfile as any).nombre || "");
          } else {
            const { data: coachProfile } = await supabase
              .from("coaches")
              .select("nombre")
              .eq("user_id", uid)
              .maybeSingle();
            if (coachProfile) {
              setUserName((coachProfile as any).nombre || "");
            }
          }
        }

        setPageState("form");
      } else {
        // Wait a bit for the auth state change to fire, then show error
        setTimeout(() => {
          setPageState((prev) => prev === "loading" ? "error" : prev);
          setTokenError("No se pudo verificar el enlace. Puede haber expirado o ya fue utilizado.");
        }, 3000);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!allRulesPassed) {
      setError("La contraseña no cumple todos los requisitos.");
      return;
    }

    if (!passwordsMatch) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setLoading(true);

    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setError(updateError.message || "Error al establecer la contraseña.");
      setLoading(false);
      return;
    }

    // Mark password as set in relevant profile tables
    const { data: { session: currentSession } } = await supabase.auth.getSession();
    if (currentSession) {
      const uid = currentSession.user.id;
      await supabase
        .from("admin_profiles")
        .update({ password_set: true } as any)
        .eq("user_id", uid);
      await supabase
        .from("alumnos")
        .update({ password_set: true } as any)
        .eq("user_id", uid);
      await supabase
        .from("coaches")
        .update({ password_set: true } as any)
        .eq("user_id", uid);
    }

    setPageState("success");
    setLoading(false);

    // Redirect after a moment
    setTimeout(async () => {
      const { data: { session } } = await supabase.auth.getSession();
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

        const { data: isAlumno } = await supabase.rpc("has_role", {
          _user_id: session.user.id,
          _role: "alumno" as any,
        });
        if (isAlumno) {
          navigate("/alumno", { replace: true });
          return;
        }
      }
      navigate("/", { replace: true });
    }, 2000);
  };

  const handleResendInvite = async () => {
    if (!userEmail) {
      toast.error("No se pudo identificar el email. Contactá al administrador.");
      return;
    }

    setResending(true);
    try {
      const { data, error } = await supabase.functions.invoke("resend-invite", {
        body: { email: userEmail, user_type: "admin" },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setResendDone(true);
      toast.success("¡Nuevo enlace enviado! Revisá tu email.");
    } catch (err: any) {
      toast.error(err.message || "Error al reenviar la invitación");
    } finally {
      setResending(false);
    }
  };

  // --- LOADING STATE ---
  if (pageState === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4 animate-fade-in">
          <img src={logo} alt="Ciclismo Reybaud" className="w-16 h-16" />
          <div className="animate-pulse text-muted-foreground text-sm">Verificando enlace...</div>
        </div>
      </div>
    );
  }

  // --- ERROR STATE ---
  if (pageState === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="w-full max-w-md text-center space-y-6 animate-fade-in">
          <img src={logo} alt="Ciclismo Reybaud" className="w-16 h-16 mx-auto" />
          <AlertTriangle className="w-14 h-14 text-destructive mx-auto" />
          <h1 className="text-2xl font-heading font-bold uppercase tracking-wider text-foreground">
            Este enlace ya no es válido
          </h1>
          <p className="text-muted-foreground text-sm">
            {tokenError || "El enlace puede haber expirado o ya fue utilizado."}
          </p>

          {resendDone ? (
            <div className="flex flex-col items-center gap-3 pt-2">
              <MailCheck className="w-10 h-10 text-primary" />
              <p className="text-sm text-muted-foreground">
                Te enviamos un nuevo enlace. Revisá tu bandeja de entrada.
              </p>
            </div>
          ) : (
            <div className="space-y-3 pt-2">
              <p className="text-xs text-muted-foreground">
                Contactá a tu administrador para que te reenvíe la invitación desde el panel.
              </p>
              <Button
                variant="outline"
                onClick={() => navigate("/admin/login")}
                className="w-full"
              >
                Ir al inicio de sesión
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // --- SUCCESS STATE ---
  if (pageState === "success") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="w-full max-w-md text-center space-y-6 animate-fade-in">
          <img src={logo} alt="Ciclismo Reybaud" className="w-16 h-16 mx-auto" />
          <CheckCircle className="w-14 h-14 text-primary mx-auto" />
          <h1 className="text-2xl font-heading font-bold uppercase tracking-wider text-foreground">
            ¡Contraseña creada!
          </h1>
          <p className="text-muted-foreground text-sm">
            Tu cuenta está activa. Redirigiendo al panel...
          </p>
        </div>
      </div>
    );
  }

  // --- FORM STATE ---
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-8 animate-fade-in">
        <div className="text-center space-y-3">
          <img src={logo} alt="Ciclismo Reybaud" className="w-16 h-16 mx-auto mb-2" />
          <KeyRound className="w-10 h-10 text-primary mx-auto" />
          <h1 className="text-2xl font-heading font-bold uppercase tracking-wider text-foreground">
            Activá tu cuenta
          </h1>
          <p className="text-muted-foreground text-sm">
            {userName
              ? `Hola ${userName}, creá tu contraseña para comenzar.`
              : "Creá tu contraseña para acceder a tu cuenta."
            }
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="glass-card rounded-lg p-6 space-y-4">
            {/* Password field */}
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium text-foreground">
                Nueva contraseña
              </label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(null); }}
                  required
                  placeholder="Ingresá tu contraseña"
                  className="bg-secondary border-border text-foreground placeholder:text-muted-foreground pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Password rules checklist */}
            {password.length > 0 && (
              <div className="space-y-1.5">
                {ruleResults.map((rule) => (
                  <div key={rule.id} className="flex items-center gap-2 text-xs">
                    {rule.passed ? (
                      <Check className="w-3.5 h-3.5 text-primary shrink-0" />
                    ) : (
                      <X className="w-3.5 h-3.5 text-destructive shrink-0" />
                    )}
                    <span className={rule.passed ? "text-muted-foreground" : "text-destructive"}>
                      {rule.label}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Confirm password field */}
            <div className="space-y-2">
              <label htmlFor="confirm-password" className="text-sm font-medium text-foreground">
                Confirmar contraseña
              </label>
              <div className="relative">
                <Input
                  id="confirm-password"
                  type={showConfirm ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => { setConfirmPassword(e.target.value); setError(null); }}
                  required
                  placeholder="Repetí la contraseña"
                  className="bg-secondary border-border text-foreground placeholder:text-muted-foreground pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                >
                  {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {confirmPassword.length > 0 && (
                <div className="flex items-center gap-2 text-xs">
                  {passwordsMatch ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-primary shrink-0" />
                      <span className="text-muted-foreground">Las contraseñas coinciden</span>
                    </>
                  ) : (
                    <>
                      <X className="w-3.5 h-3.5 text-destructive shrink-0" />
                      <span className="text-destructive">Las contraseñas no coinciden</span>
                    </>
                  )}
                </div>
              )}
            </div>

            {error && (
              <div className="text-sm text-destructive bg-destructive/10 rounded-md p-3">
                {error}
              </div>
            )}

            <Button
              type="submit"
              variant="gold"
              className="w-full"
              size="lg"
              disabled={loading || !allRulesPassed || !passwordsMatch}
            >
              {loading ? "Guardando..." : "Crear contraseña"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SetPassword;
