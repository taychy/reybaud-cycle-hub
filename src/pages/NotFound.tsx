import { useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { forceAppHardReload, isRsvpEventEntryPath, isRsvpLinkPath, RSVP_NOTFOUND_KEY, shouldRecoverRsvpNotFound } from "@/lib/appUpdate";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const isRsvp = isRsvpLinkPath(location.pathname) || isRsvpEventEntryPath(location.pathname);
  const [recovering, setRecovering] = useState(false);

  useEffect(() => {
    let tried: string | null = null;
    try { tried = sessionStorage.getItem(RSVP_NOTFOUND_KEY); } catch { /* noop */ }
    if (!shouldRecoverRsvpNotFound(location.pathname, tried)) return;
    try { sessionStorage.setItem(RSVP_NOTFOUND_KEY, location.pathname); } catch { /* noop */ }
    setRecovering(true);
    void forceAppHardReload();
  }, [location.pathname]);

  const retry = () => {
    setRecovering(true);
    void forceAppHardReload();
  };

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  if (isRsvp) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
        <div className="text-center space-y-4 max-w-sm">
          <p className="text-lg text-foreground">
            {recovering ? "Actualizando la app para abrir tu confirmación…" : "Necesitamos actualizar la app para abrir tu confirmación."}
          </p>
          <Button onClick={retry} disabled={recovering}>Actualizar y abrir</Button>
          <p className="text-sm text-muted-foreground">
            Si sigue sin abrir, copiá el enlace y abrilo en el navegador.
          </p>
        </div>
      </div>
    );
  }


  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="text-center space-y-4">
        <h1 className="text-5xl font-heading font-bold text-foreground">404</h1>
        <p className="text-lg text-muted-foreground">Página no encontrada</p>
        <Button variant="outline" onClick={() => navigate("/")}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Volver al inicio
        </Button>
      </div>
    </div>
  );
};

export default NotFound;
