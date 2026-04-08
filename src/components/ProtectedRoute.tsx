import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ShieldX, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

type AllowedRole = "admin" | "coach" | "alumno";

interface ProtectedRouteProps {
  allowedRoles: AllowedRole[];
  children: React.ReactNode;
  /** Where to redirect if not authenticated at all */
  loginPath?: string;
}

/**
 * Server-validated role guard. Checks real DB roles via has_role RPC.
 * Shows access-denied UI instead of silent redirects.
 */
const ProtectedRoute = ({
  allowedRoles,
  children,
  loginPath = "/",
}: ProtectedRouteProps) => {
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "allowed" | "denied" | "unauthenticated">("loading");
  const [userRoles, setUserRoles] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;

    const checkRoles = async (userId: string) => {
      const foundRoles: string[] = [];
      for (const role of (["admin", "coach"] as const)) {
        const { data } = await supabase.rpc("has_role", {
          _user_id: userId,
          _role: role as any,
        });
        if (data) foundRoles.push(role);
      }

      const { data: alumnoData } = await supabase
        .from("alumnos")
        .select("id")
        .eq("user_id", userId)
        .maybeSingle();
      if (alumnoData) foundRoles.push("alumno");

      if (cancelled) return;
      setUserRoles(foundRoles);

      const hasAccess = allowedRoles.some((r) => foundRoles.includes(r));
      setStatus(hasAccess ? "allowed" : "denied");
    };

    // Listen for auth state changes (handles token refresh on app reopen)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      if (!session) {
        setStatus("unauthenticated");
      } else {
        checkRoles(session.user.id);
      }
    });

    // Also check current session immediately
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return;
      if (!session) {
        setStatus("unauthenticated");
      } else {
        checkRoles(session.user.id);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [allowedRoles, loginPath]);

  useEffect(() => {
    if (status === "unauthenticated") {
      navigate(loginPath, { replace: true });
    }
  }, [status, loginPath, navigate]);

  if (status === "loading" || status === "unauthenticated") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground text-sm">Cargando...</div>
      </div>
    );
  }

  if (status === "denied") {
    // Determine best portal for the user
    const suggestedPortal = userRoles.includes("admin")
      ? { label: "Panel Admin", path: "/admin" }
      : userRoles.includes("coach")
        ? { label: "Panel Coach", path: "/coach" }
        : userRoles.includes("alumno")
          ? { label: "Dashboard Alumno", path: "/alumno" }
          : null;

    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="max-w-md w-full text-center space-y-6 animate-fade-in">
          <div className="mx-auto w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
            <ShieldX className="w-8 h-8 text-destructive" />
          </div>
          <h1 className="text-2xl font-heading font-bold text-foreground">
            Acceso no permitido
          </h1>
          <p className="text-muted-foreground text-sm">
            Tu cuenta no tiene permisos para ingresar a esta sección.
          </p>
          <div className="flex flex-col gap-3">
            {suggestedPortal && (
              <Button
                variant="gold"
                onClick={() => navigate(suggestedPortal.path, { replace: true })}
                className="w-full"
              >
                Ir a {suggestedPortal.label}
              </Button>
            )}
            <Button
              variant="outline"
              onClick={async () => {
                await supabase.auth.signOut();
                navigate("/", { replace: true });
              }}
              className="w-full"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Cerrar sesión e ir al inicio
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default ProtectedRoute;
