import { useTranslation } from "react-i18next";
import { formatPrice } from "@/lib/currency";
import { Clock, CheckCircle2, XCircle, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PaymentStatusCardProps {
  estado: string;
  planName: string;
  precio: number;
  fechaPago: string;
  medioPago: string;
}

// formatPrice imported from @/lib/currency
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

const PaymentStatusCard = ({ estado, planName, precio, fechaPago, medioPago }: PaymentStatusCardProps) => {
  const { t } = useTranslation();

  const statusConfig: Record<string, {
    icon: React.ReactNode;
    label: string;
    message: string;
    colorClass: string;
  }> = {
    pendiente_verificacion: {
      icon: <Clock className="w-5 h-5" />,
      label: t("paymentStatus.pendingLabel"),
      message: t("paymentStatus.pendingMsg"),
      colorClass: "text-yellow-500 border-yellow-500/30 bg-yellow-500/5",
    },
    activa: {
      icon: <CheckCircle2 className="w-5 h-5" />,
      label: t("paymentStatus.confirmedLabel"),
      message: t("paymentStatus.confirmedMsg"),
      colorClass: "text-emerald-500 border-emerald-500/30 bg-emerald-500/5",
    },
    rechazada: {
      icon: <XCircle className="w-5 h-5" />,
      label: t("paymentStatus.rejectedLabel"),
      message: t("paymentStatus.rejectedMsg"),
      colorClass: "text-destructive border-destructive/30 bg-destructive/5",
    },
  };

  const medioPagoLabels: Record<string, string> = {
    pendiente_verificacion: t("paymentStatus.cashExternal"),
    efectivo: t("paymentStatus.cash"),
    mercadopago: t("paymentStatus.mercadoPago"),
    tarjeta: t("paymentStatus.card"),
    plataforma_externa: t("paymentStatus.externalPlatform"),
  };

  const config = statusConfig[estado] || statusConfig.pendiente_verificacion;

  return (
    <div className={`rounded-xl border p-5 space-y-4 ${config.colorClass}`}>
      <div className="flex items-center gap-2">
        {config.icon}
        <h3 className="text-sm font-heading font-semibold uppercase tracking-wider text-foreground">
          {t("paymentStatus.title")}
        </h3>
      </div>

      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t("paymentStatus.plan")}</span>
          <span className="font-medium text-foreground">{planName}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t("paymentStatus.amount")}</span>
          <span className="font-medium text-foreground">{formatPrice(precio)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t("paymentStatus.paymentDate")}</span>
          <span className="font-medium text-foreground">{formatDate(fechaPago)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t("paymentStatus.paymentMethod")}</span>
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
            {t("paymentStatus.contactAdmin")}
          </Button>
        </a>
      )}
    </div>
  );
};

export default PaymentStatusCard;
