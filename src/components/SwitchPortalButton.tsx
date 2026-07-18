import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeftRight } from "lucide-react";
import { getAvailablePortals, setRememberedPortal } from "@/lib/portalPreference";

interface Props {
  variant?: "ghost" | "outline";
  size?: "sm" | "default" | "icon";
  className?: string;
  fullWidth?: boolean;
  onNavigate?: () => void;
}

/** Botón "Cambiar de portal" — solo se renderiza si el usuario tiene 2+ portales. */
const SwitchPortalButton = ({ variant = "ghost", size = "sm", className, fullWidth, onNavigate }: Props) => {
  const navigate = useNavigate();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const portals = await getAvailablePortals(session.user.id);
      if (!cancelled) setVisible(portals.length > 1);
    })();
    return () => { cancelled = true; };
  }, []);

  if (!visible) return null;

  return (
    <Button
      variant={variant}
      size={size}
      className={`${fullWidth ? "w-full justify-start" : ""} ${className || ""}`}
      onClick={() => {
        // Al cambiar de portal, olvidar la preferencia "recordar" para que vuelva a preguntar
        setRememberedPortal(null);
        onNavigate?.();
        navigate("/portal");
      }}
    >
      <ArrowLeftRight className="w-4 h-4 mr-2" />
      Cambiar de portal
    </Button>
  );
};

export default SwitchPortalButton;
