import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Download, Share, CheckCircle, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import logo from "@/assets/logo.png";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const Install = () => {
  const navigate = useNavigate();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(
    (window as any).__pwaInstallPrompt ?? null
  );
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent;
    setIsIOS(/iPad|iPhone|iPod/.test(ua));

    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
    }

    const handler = (e: Event) => {
      e.preventDefault();
      (window as any).__pwaInstallPrompt = e;
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", () => setIsInstalled(true));

    // Pick up prompt that fired before this component mounted
    if ((window as any).__pwaInstallPrompt) {
      setDeferredPrompt((window as any).__pwaInstallPrompt);
    }

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    const prompt = deferredPrompt || (window as any).__pwaInstallPrompt;
    if (!prompt) return;
    setInstalling(true);
    try {
      await prompt.prompt();
      const { outcome } = await prompt.userChoice;
      if (outcome === "accepted") setIsInstalled(true);
    } catch (err) {
      console.error("Install prompt error:", err);
    } finally {
      (window as any).__pwaInstallPrompt = null;
      setDeferredPrompt(null);
      setInstalling(false);
    }
  };

  const hasPrompt = !!(deferredPrompt || (window as any).__pwaInstallPrompt);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-6 text-center">
      <img src={logo} alt="Ciclismo Reybaud" className="w-24 h-24 mb-6" />

      {isInstalled ? (
        <div className="space-y-4">
          <CheckCircle className="w-16 h-16 text-primary mx-auto" />
          <h1 className="text-2xl font-heading font-bold text-foreground">
            ¡App instalada!
          </h1>
          <p className="text-muted-foreground max-w-sm">
            Ya podés abrir Ciclismo Reybaud desde tu pantalla de inicio.
          </p>
        </div>
      ) : isIOS ? (
        <div className="space-y-6 max-w-sm">
          <h1 className="text-2xl font-heading font-bold text-foreground">
            Instalar Ciclismo Reybaud
          </h1>
          <div className="bg-card border border-border rounded-xl p-6 space-y-4 text-left">
            <p className="text-foreground font-medium">En Safari:</p>
            <ol className="space-y-3 text-muted-foreground">
              <li className="flex items-start gap-3">
                <span className="bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold shrink-0">1</span>
                <span>Tocá el botón <Share className="inline w-4 h-4 text-accent" /> Compartir en la barra inferior</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold shrink-0">2</span>
                <span>Seleccioná <strong>"Agregar a pantalla de inicio"</strong></span>
              </li>
              <li className="flex items-start gap-3">
                <span className="bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold shrink-0">3</span>
                <span>Confirmá tocando <strong>"Agregar"</strong></span>
              </li>
            </ol>
          </div>
        </div>
      ) : (
        <div className="space-y-6 max-w-sm">
          <h1 className="text-2xl font-heading font-bold text-foreground">
            Instalar Ciclismo Reybaud
          </h1>
          <p className="text-muted-foreground">
            Instalá la app en tu teléfono para acceder rápido a tus entrenamientos.
          </p>
          {hasPrompt ? (
            <Button onClick={handleInstall} variant="gold" size="lg" className="w-full gap-2" disabled={installing}>
              <Download className="w-5 h-5" />
              {installing ? "Instalando..." : "Instalar App"}
            </Button>
          ) : (
            <div className="bg-card border border-border rounded-xl p-6 space-y-3 text-left">
              <p className="text-muted-foreground text-sm">
                Abrí el menú del navegador (⋮) y seleccioná <strong>"Instalar app"</strong> o <strong>"Agregar a pantalla de inicio"</strong>.
              </p>
            </div>
          )}
        </div>
      )}

      <Button variant="outline" onClick={() => navigate("/")} className="mt-8">
        <ArrowLeft className="w-4 h-4 mr-2" />
        Volver al inicio
      </Button>
    </div>
  );
};

export default Install;
