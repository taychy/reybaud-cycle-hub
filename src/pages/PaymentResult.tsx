import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { CheckCircle, XCircle, Clock, ArrowRight, Bike, Download, Share, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import logo from "@/assets/logo.png";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const grupoOptions = [
  { value: "G1", label: "G1", desc: "Nivel avanzado" },
  { value: "G2", label: "G2", desc: "Nivel intermedio-alto" },
  { value: "G3", label: "G3", desc: "Nivel intermedio" },
  { value: "G4", label: "G4", desc: "Nivel inicial" },
  { value: "Principiante", label: "Principiante", desc: "Recién empiezo" },
  { value: "No lo sé", label: "No lo sé", desc: "Necesito orientación" },
];

const PaymentResult = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const status = params.get("status") || params.get("pago") || "unknown";

  const isApproved = status === "approved" || status === "ok";
  const isPending = status === "pending" || status === "pendiente" || status === "in_process";
  const isFailure = !isApproved && !isPending;

  const isRenewal = sessionStorage.getItem("alumno_renewal") === "1";

  // For renewals, skip grupo selection — go straight to result/install
  const [step, setStep] = useState<"result" | "grupo" | "install">(
    isApproved ? (isRenewal ? "install" : "grupo") : "result"
  );
  const [selectedGrupo, setSelectedGrupo] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);

  const alumnoId = sessionStorage.getItem("registro_alumno_id");

  useEffect(() => {
    setIsIOS(/iPad|iPhone|iPod/.test(navigator.userAgent));

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstallPrompt = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
  };

  const handleSaveGrupo = async () => {
    if (!selectedGrupo || !alumnoId) return;
    setSaving(true);

    try {
      // Save grupo_preferido
      const functionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/notify-admin-registration`;
      
      await supabase
        .from("alumnos")
        .update({ grupo_preferido: selectedGrupo } as any)
        .eq("id", alumnoId);

      // Notify admins
      await fetch(functionUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ alumno_id: alumnoId, grupo_preferido: selectedGrupo }),
      }).catch(() => {}); // Non-blocking

      sessionStorage.removeItem("registro_alumno_id");
      setStep("install");
    } catch {
      setStep("install");
    } finally {
      setSaving(false);
    }
  };

  // Install step — after choosing grupo
  if (step === "install") {
    // Clean up session flags
    const cleanupAndNavigate = (path: string) => {
      sessionStorage.removeItem("registro_alumno_id");
      sessionStorage.removeItem("alumno_renewal");
      navigate(path);
    };

    // For renewals, show a simpler success screen
    if (isRenewal) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center px-4">
          <div className="max-w-md w-full space-y-6 animate-fade-in text-center">
            <img src={logo} alt="Ciclismo Reybaud" className="w-16 h-16 mx-auto" />
            <CheckCircle className="w-14 h-14 text-primary mx-auto" />
            <h1 className="text-2xl font-heading font-bold uppercase tracking-wider text-foreground">
              ¡Suscripción renovada!
            </h1>
            <p className="text-muted-foreground text-sm">
              Tu pago fue confirmado. Ya podés acceder a tus entrenamientos.
            </p>
            <Button
              variant="gold"
              size="lg"
              className="w-full"
              onClick={() => cleanupAndNavigate("/")}
            >
              Ir al inicio de sesión
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="max-w-md w-full space-y-6 animate-fade-in text-center">
          <img src={logo} alt="Ciclismo Reybaud" className="w-16 h-16 mx-auto" />
          <Smartphone className="w-14 h-14 text-primary mx-auto" />
          <h1 className="text-2xl font-heading font-bold uppercase tracking-wider text-foreground">
            Instalá la app
          </h1>
          <p className="text-muted-foreground text-sm">
            Para la mejor experiencia, instalá Ciclismo Reybaud en tu celular y accedé directo desde la pantalla de inicio.
          </p>

          {isIOS ? (
            <div className="glass-card rounded-xl p-5 space-y-3 text-left">
              <p className="text-foreground font-medium text-sm">En Safari:</p>
              <ol className="space-y-2 text-muted-foreground text-sm">
                <li className="flex items-start gap-2">
                  <span className="bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold shrink-0">1</span>
                  <span>Tocá <Share className="inline w-3.5 h-3.5 text-accent" /> Compartir</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold shrink-0">2</span>
                  <span><strong>"Agregar a pantalla de inicio"</strong></span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold shrink-0">3</span>
                  <span>Confirmá con <strong>"Agregar"</strong></span>
                </li>
              </ol>
            </div>
          ) : deferredPrompt ? (
            <Button onClick={handleInstallPrompt} variant="gold" size="lg" className="w-full gap-2">
              <Download className="w-5 h-5" />
              Instalar App
            </Button>
          ) : (
            <div className="glass-card rounded-xl p-5 text-left">
              <p className="text-muted-foreground text-sm">
                Abrí el menú del navegador (⋮) y seleccioná <strong>"Instalar app"</strong> o <strong>"Agregar a pantalla de inicio"</strong>.
              </p>
            </div>
          )}

          <Button
            variant="gold-outline"
            size="lg"
            className="w-full"
            onClick={() => cleanupAndNavigate("/")}
          >
            Ir al inicio de sesión
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>

          <button
            onClick={() => cleanupAndNavigate("/")}
            className="block mx-auto text-xs text-muted-foreground hover:text-primary transition-colors"
          >
            Omitir por ahora
          </button>
        </div>
      </div>
    );
  }

  if (step === "grupo" && isApproved) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="max-w-md w-full space-y-6 animate-fade-in">
          <div className="text-center space-y-3">
            <img src={logo} alt="Ciclismo Reybaud" className="w-16 h-16 mx-auto" />
            <CheckCircle className="w-12 h-12 text-primary mx-auto" />
            <h1 className="text-2xl font-heading font-bold uppercase tracking-wider text-foreground">
              ¡Pago confirmado!
            </h1>
            <p className="text-muted-foreground text-sm">
              Una última cosa: ¿en qué nivel/pelotón considerás que estás?
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {grupoOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setSelectedGrupo(opt.value)}
                className={`text-left rounded-lg p-4 transition-all duration-200 glass-card ${
                  selectedGrupo === opt.value
                    ? "ring-2 ring-primary card-glow"
                    : "hover:ring-1 hover:ring-border"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Bike className={`w-4 h-4 ${selectedGrupo === opt.value ? "text-primary" : "text-muted-foreground"}`} />
                  <span className="font-heading font-semibold text-sm text-foreground">{opt.label}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{opt.desc}</p>
              </button>
            ))}
          </div>

          <Button
            variant="gold"
            size="lg"
            className="w-full"
            disabled={!selectedGrupo || saving}
            onClick={handleSaveGrupo}
          >
            {saving ? "Guardando..." : "Confirmar"}
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>

          <button
            onClick={() => { setStep("install"); sessionStorage.removeItem("registro_alumno_id"); }}
            className="block mx-auto text-xs text-muted-foreground hover:text-primary transition-colors"
          >
            Omitir por ahora
          </button>
        </div>
      </div>
    );
  }

  const config = isApproved
    ? {
        icon: <CheckCircle className="w-16 h-16 text-green-500" />,
        title: "¡Todo listo!",
        message: "Tu suscripción fue activada y tu nivel fue registrado. Ya podés iniciar sesión.",
        cta: "Ir al inicio de sesión",
        route: "/",
      }
    : isPending
    ? {
        icon: <Clock className="w-16 h-16 text-yellow-500" />,
        title: "Pago en proceso",
        message: "Tu pago está siendo procesado. Te notificaremos cuando se confirme.",
        cta: "Ir al inicio de sesión",
        route: "/",
      }
    : {
        icon: <XCircle className="w-16 h-16 text-destructive" />,
        title: "Pago no completado",
        message: "Hubo un problema con tu pago. Podés intentar nuevamente.",
        cta: "Volver a intentar",
        route: "/planes",
      };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center space-y-6 animate-fade-in">
        <img src={logo} alt="Ciclismo Reybaud" className="w-16 h-16 mx-auto" />
        {config.icon}
        <h1 className="text-2xl font-heading font-bold uppercase tracking-wider text-foreground">
          {config.title}
        </h1>
        <p className="text-muted-foreground">{config.message}</p>
        <Button
          variant="gold"
          size="lg"
          className="w-full"
          onClick={() => navigate(config.route)}
        >
          {config.cta}
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );
};

export default PaymentResult;
