import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { CheckCircle, XCircle, Clock, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import logo from "@/assets/logo.png";

const PaymentResult = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const status = params.get("status") || params.get("pago") || "unknown";

  const isApproved = status === "approved" || status === "ok";
  const isPending = status === "pending" || status === "pendiente" || status === "in_process";
  const isFailure = !isApproved && !isPending;

  const config = isApproved
    ? {
        icon: <CheckCircle className="w-16 h-16 text-green-500" />,
        title: "¡Pago confirmado!",
        message: "Tu suscripción fue activada. Ya podés iniciar sesión y ver tus entrenamientos.",
        cta: "Ir al inicio de sesión",
        route: "/",
      }
    : isPending
    ? {
        icon: <Clock className="w-16 h-16 text-yellow-500" />,
        title: "Pago en proceso",
        message: "Tu pago está siendo procesado. Te notificaremos cuando se confirme. Podés iniciar sesión mientras tanto.",
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
