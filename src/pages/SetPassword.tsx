import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { KeyRound, CheckCircle, Check, X } from "lucide-react";
import logo from "@/assets/logo.png";

const PASSWORD_RULES = [
  { id: "length", label: "Mínimo 8 caracteres", test: (p: string) => p.length >= 8 },
  { id: "uppercase", label: "Al menos una mayúscula", test: (p: string) => /[A-Z]/.test(p) },
  { id: "number", label: "Al menos un número", test: (p: string) => /\d/.test(p) },
];

const SetPassword = () => {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [checking, setChecking] = useState(true);

  const ruleResults = useMemo(
    () => PASSWORD_RULES.map((r) => ({ ...r, passed: r.test(password) })),
    [password]
  );
  const allRulesPassed = ruleResults.every((r) => r.passed);
  const passwordsMatch = password.length > 0 && password === confirmPassword;

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        setChecking(false);
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setChecking(false);
      } else {
        setTimeout(() => setChecking(false), 2000);
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

    setSuccess(true);
    setLoading(false);

    // Mark password as set in admin_profiles (if applicable)
    const { data: { session: currentSession } } = await supabase.auth.getSession();
    if (currentSession) {
      await supabase
        .from("admin_profiles")
        .update({ password_set: true } as any)
        .eq("user_id", currentSession.user.id);
    }

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
      }
      navigate("/", { replace: true });
    }, 2000);
  };

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4 animate-fade-in">
          <img src={logo} alt="Ciclismo Reybaud" className="w-16 h-16" />
          <div className="animate-pulse text-muted-foreground text-sm">Verificando enlace...</div>
        </div>
      </div>
    );
  }

  if (success) {
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

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-8 animate-fade-in">
        <div className="text-center space-y-3">
          <img src={logo} alt="Ciclismo Reybaud" className="w-16 h-16 mx-auto mb-2" />
          <KeyRound className="w-10 h-10 text-primary mx-auto" />
          <h1 className="text-2xl font-heading font-bold uppercase tracking-wider text-foreground">
            Creá tu contraseña
          </h1>
          <p className="text-muted-foreground text-sm">
            Establecé una contraseña segura para acceder a tu cuenta
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="glass-card rounded-lg p-6 space-y-4">
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium text-foreground">
                Nueva contraseña
              </label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(null); }}
                required
                placeholder="Ingresá tu contraseña"
                className="bg-secondary border-border text-foreground placeholder:text-muted-foreground"
              />
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

            <div className="space-y-2">
              <label htmlFor="confirm-password" className="text-sm font-medium text-foreground">
                Confirmar contraseña
              </label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => { setConfirmPassword(e.target.value); setError(null); }}
                required
                placeholder="Repetí la contraseña"
                className="bg-secondary border-border text-foreground placeholder:text-muted-foreground"
              />
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
