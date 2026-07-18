import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Shield, Package, Users, Bike, LogOut } from "lucide-react";
import logo from "@/assets/logo.png";
import {
  getAvailablePortals,
  getRememberedPortal,
  setRememberedPortal,
  PORTAL_PATHS,
  PORTAL_LABELS,
  type Portal,
} from "@/lib/portalPreference";

const ICONS: Record<Portal, React.ComponentType<{ className?: string }>> = {
  admin: Shield,
  coach: Users,
  deposito: Package,
  alumno: Bike,
};

const DESCRIPTIONS: Record<Portal, string> = {
  admin: "Panel de administración",
  coach: "Panel de staff / entrenadores",
  deposito: "Gestión de depósito y stock",
  alumno: "Dashboard de alumno",
};

const Portal = () => {
  const navigate = useNavigate();
  const [portals, setPortals] = useState<Portal[] | null>(null);
  const [remember, setRemember] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/", { replace: true });
        return;
      }
      const available = await getAvailablePortals(session.user.id);
      if (cancelled) return;
      if (available.length === 0) {
        navigate("/", { replace: true });
        return;
      }
      if (available.length === 1) {
        navigate(PORTAL_PATHS[available[0]], { replace: true });
        return;
      }
      setPortals(available);
    })();
    return () => { cancelled = true; };
  }, [navigate]);

  const choose = (portal: Portal) => {
    if (remember) setRememberedPortal(portal);
    else setRememberedPortal(null);
    navigate(PORTAL_PATHS[portal], { replace: true });
  };

  const logout = async () => {
    setRememberedPortal(null);
    await supabase.auth.signOut();
    navigate("/", { replace: true });
  };

  if (!portals) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground text-sm">Cargando...</div>
      </div>
    );
  }

  const lastUsed = getRememberedPortal();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md space-y-6 animate-fade-in">
        <div className="text-center space-y-2">
          <img src={logo} alt="Ciclismo Reybaud" className="w-16 h-16 mx-auto" />
          <h1 className="text-2xl font-heading font-bold uppercase tracking-wider text-foreground">
            ¿A qué portal querés entrar?
          </h1>
          <p className="text-sm text-muted-foreground">Tenés acceso a más de una sección.</p>
        </div>

        <div className="grid gap-3">
          {portals.map((p) => {
            const Icon = ICONS[p];
            const isLast = lastUsed === p;
            return (
              <button
                key={p}
                onClick={() => choose(p)}
                className={`glass-card rounded-lg p-5 flex items-center gap-4 text-left transition-all hover:scale-[1.01] hover:border-primary/50 ${
                  isLast ? "border-primary/60 ring-1 ring-primary/40" : ""
                }`}
              >
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Icon className="w-6 h-6 text-primary" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-heading font-bold uppercase text-foreground">
                      {PORTAL_LABELS[p]}
                    </span>
                    {isLast && (
                      <span className="text-[10px] uppercase tracking-wider text-primary font-semibold">
                        Última vez
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">{DESCRIPTIONS[p]}</div>
                </div>
              </button>
            );
          })}
        </div>

        <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer justify-center">
          <Checkbox
            checked={remember}
            onCheckedChange={(v) => setRemember(!!v)}
          />
          Recordar este portal y no volver a preguntar
        </label>

        <div className="text-center">
          <Button variant="ghost" size="sm" onClick={logout}>
            <LogOut className="w-4 h-4 mr-2" />
            Cerrar sesión
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Portal;
