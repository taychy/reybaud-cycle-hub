import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, RefreshCw, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import logo from "@/assets/logo.png";

/**
 * Centralized auth callback handler.
 *
 * All magic-link / OTP redirects point here. This page:
 * 1. Lets the Supabase client exchange the PKCE code for a session.
 * 2. Waits for getSession() to confirm success.
 * 3. Checks roles via has_role RPC.
 * 4. Redirects to /admin, /coach, or /alumno accordingly.
 * 5. Shows a clear error + resend option on failure.
 */
const AuthCallback = () => {
  const navigate = useNavigate();
  const [status, setStatus] = useState<"processing" | "error">("processing");
  const [errorMessage, setErrorMessage] = useState("");
  const [email, setEmail] = useState("");
  const [resending, setResending] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const process = async () => {
      // 1. Check for explicit error params from Supabase redirect
      const url = new URL(window.location.href);
      const hashParams = new URLSearchParams(url.hash.replace("#", "?"));

      const errorParam =
        url.searchParams.get("error") || hashParams.get("error");
      const errorCode =
        url.searchParams.get("error_code") || hashParams.get("error_code");
      const errorDesc =
        url.searchParams.get("error_description") ||
        hashParams.get("error_description");

      if (errorParam) {
        if (cancelled) return;
        let msg = "El enlace de acceso no pudo ser validado.";
        if (errorCode === "otp_expired" || errorDesc?.includes("expired")) {
          msg =
            "El enlace de acceso expiró o ya fue utilizado. Solicitá uno nuevo.";
        } else if (errorDesc) {
          msg = errorDesc;
        }
        setErrorMessage(msg);
        setStatus("error");
        window.history.replaceState({}, "", "/auth/callback");
        return;
      }

      // 2. Give the Supabase client time to exchange the PKCE code.
      //    The client auto-detects ?code= on init; onAuthStateChange fires on success.
      //    We poll getSession for up to 5 seconds.
      let session = null;
      for (let i = 0; i < 10; i++) {
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          session = data.session;
          break;
        }
        await new Promise((r) => setTimeout(r, 500));
      }

      if (cancelled) return;

      if (!session) {
        setErrorMessage(
          "No se pudo establecer la sesión. El enlace puede haber expirado o ya fue utilizado."
        );
        setStatus("error");
        window.history.replaceState({}, "", "/auth/callback");
        return;
      }

      // 3. Determine role and redirect
      const userId = session.user.id;

      // Check admin
      const { data: isAdmin } = await supabase.rpc("has_role", {
        _user_id: userId,
        _role: "admin" as any,
      });
      if (!cancelled && isAdmin) {
        navigate("/admin", { replace: true });
        return;
      }

      // Check coach
      const { data: isCoach } = await supabase.rpc("has_role", {
        _user_id: userId,
        _role: "coach" as any,
      });
      if (!cancelled && isCoach) {
        navigate("/coach", { replace: true });
        return;
      }

      // Check alumno
      const { data: alumno } = await supabase
        .from("alumnos")
        .select("id")
        .eq("user_id", userId)
        .maybeSingle();
      if (!cancelled && alumno) {
        navigate("/alumno", { replace: true });
        return;
      }

      // Fallback: user exists but no role matched — send to home
      if (!cancelled) {
        navigate("/", { replace: true });
      }
    };

    process();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const handleResend = async () => {
    const trimmed = email.toLowerCase().trim();
    if (!trimmed) return;
    setResending(true);

    const { error } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: {
        emailRedirectTo: "https://reybaud-app.com/auth/callback",
      },
    });

    setResending(false);
    if (error) {
      setErrorMessage(error.message);
    } else {
      setErrorMessage("");
      setStatus("processing");
      // Show a temporary success, then revert to error so they can try again if needed
      setErrorMessage("Enlace enviado. Revisá tu email.");
      setStatus("error"); // reuse error UI to show message + input
    }
  };

  if (status === "processing") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4 animate-fade-in">
          <img src={logo} alt="Ciclismo Reybaud" className="w-16 h-16" />
          <div className="animate-pulse text-muted-foreground text-sm">
            Verificando acceso...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-8 animate-fade-in text-center">
        <img
          src={logo}
          alt="Ciclismo Reybaud"
          className="w-20 h-20 mx-auto mb-2"
        />
        <AlertTriangle className="w-14 h-14 text-amber-500 mx-auto" />
        <h1 className="text-2xl font-heading font-bold uppercase tracking-wider text-foreground">
          Enlace no válido
        </h1>
        {errorMessage && (
          <div className="text-sm text-destructive bg-destructive/10 rounded-md p-4 text-left">
            {errorMessage}
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
            disabled={resending || !email.trim()}
            onClick={handleResend}
          >
            {resending ? "Enviando..." : "Enviar nuevo enlace de acceso"}
            <RefreshCw className="w-4 h-4 ml-2" />
          </Button>
        </div>
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => navigate("/")}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
          >
            <ArrowLeft className="w-3 h-3" />
            Login alumnos
          </button>
          <button
            onClick={() => navigate("/admin/login")}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
          >
            Login staff
          </button>
        </div>
      </div>
    </div>
  );
};

export default AuthCallback;
