import { useNavigate } from "react-router-dom";
import { Clock, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import logo from "@/assets/logo.png";

const PendingApproval = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md text-center space-y-6 animate-fade-in">
        <img src={logo} alt="Ciclismo Reybaud" className="w-16 h-16 mx-auto" />
        <Clock className="w-14 h-14 text-primary mx-auto" />
        <h1 className="text-2xl font-heading font-bold uppercase tracking-wider text-foreground">
          ¡Registro enviado!
        </h1>
        <p className="text-muted-foreground text-sm leading-relaxed">
          Tu inscripción está siendo revisada por el equipo de Reybaud.
          <br />
          Te notificaremos cuando sea aprobada.
        </p>
        <div className="glass-card rounded-lg p-4">
          <p className="text-xs text-muted-foreground">
            Si tenés dudas, escribinos por WhatsApp o Instagram.
          </p>
        </div>
        <Button variant="outline" onClick={() => navigate("/")} className="w-full">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Volver al inicio
        </Button>
      </div>
    </div>
  );
};

export default PendingApproval;
