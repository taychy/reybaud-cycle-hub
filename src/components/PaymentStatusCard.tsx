import { Clock, CheckCircle2, XCircle, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PaymentStatusCardProps {
  estado: string;
  planName: string;
  precio: number;
  fechaPago: string;
  medioPago: string;
}

const statusConfig: Record<string, {
  icon: React.ReactNode;
  label: string;
  message: string;
  colorClass: string;
}> = {
  pendiente_verificacion: {
    icon: <Clock className="w-5 h-5" />,
    label: "⏳ Pendiente de validación",
    message: "Tu pago está siendo revisado por administración.",
    colorClass: "text-yellow-500 border-yellow-500/30 bg-yellow-500/5",
  },
  activa: {
    icon: <CheckCircle2 className="w-5 h-5" />,
    label: "✅ Pago confirmado",
    message: "Tu pago fue confirmado. Ya podés usar la app normalmente.",
    colorClass: "text-emerald-500 border-emerald-500/30 bg-emerald-500/5",
  },
  rechazada: {
    icon: <XCircle className="w-5 h-5" />,
    label: "❌ Pago rechazado",
    message: "Hubo un problema con el pago informado. Por favor revisalo o contactá a administración.",
    colorClass: "text-destructive border-destructive/30 bg-destructive/5",
  },
};

const formatPrice = (precio: number) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(precio);

const formatDate = (dateStr: string) => {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr).toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
};

const medioPagoLabels: Record<string, string> = {
  pendiente_verificacion: "Efectivo / Externo",
  efectivo: "Efectivo",
  mercadopago: "Mercado Pago",
  tarjeta: "Tarjeta",
  plataforma_externa: "Plataforma externa",
};

const PaymentStatusCard = ({ estado, planName, precio, fechaPago, medioPago }: PaymentStatusCardProps) => {
  const config = statusConfig[estado] || statusConfig.pendiente_verificacion;

  return (
    <div className={`rounded-xl border p-5 space-y-4 ${config.colorClass}`}>
      <div className="flex items-center gap-2">
        {config.icon}
        <h3 className="text-sm font-heading font-semibold uppercase tracking-wider text-foreground">
          Estado de tu pago
        </h3>
      </div>

      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Plan</span>
          <span className="font-medium text-foreground">{planName}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Monto</span>
          <span className="font-medium text-foreground">{formatPrice(precio)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Fecha del pago</span>
          <span className="font-medium text-foreground">{formatDate(fechaPago)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Medio de pago</span>
          <span className="font-medium text-foreground">{medioPagoLabels[medioPago] || medioPago}</span>
        </div>
      </div>

      <div className="rounded-md bg-secondary/40 p-3">
        <p className="text-sm font-medium">{config.label}</p>
        <p className="text-xs text-muted-foreground mt-1">{config.message}</p>
      </div>

      {estado === "rechazada" && (
        <a
          href="https://wa.me/5491140312299?text=Hola%2C%20tengo%20un%20problema%20con%20mi%20pago"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Button variant="gold-outline" size="sm" className="w-full mt-2">
            <ExternalLink className="w-4 h-4" />
            Contactar administración
          </Button>
        </a>
      )}
    </div>
  );
};

export default PaymentStatusCard;
