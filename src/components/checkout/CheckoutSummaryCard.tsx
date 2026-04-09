import { formatPrice } from "@/lib/currency";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

interface CheckoutSummaryCardProps {
  planName: string;
  precioBase: number;
  precioFinal: number;
  moneda: string;
  frecuencia?: string;
  modality?: "total" | "cuotas" | null;
  cuotasCantidad?: number | null;
  cuotaValor?: number | null;
  paymentMethod?: string | null;
  discountName?: string | null;
  discountValue?: number | null;
  discountType?: string | null;
  collapsible?: boolean;
}

const frecuenciaLabels: Record<string, string> = {
  mensual_libre: "Acceso ilimitado",
  "2x_semana": "2 veces por semana",
  "1x_semana": "1 vez por semana",
};

const methodLabels: Record<string, string> = {
  mercadopago: "Mercado Pago",
  card: "Tarjeta de crédito/débito",
  cash: "Efectivo al profesor",
  external_platform: "Transferencia u otro medio",
};

const CheckoutSummaryCard = ({
  planName,
  precioBase,
  precioFinal,
  moneda,
  frecuencia,
  modality,
  cuotasCantidad,
  cuotaValor,
  paymentMethod,
  discountName,
  discountValue,
  discountType,
  collapsible = false,
}: CheckoutSummaryCardProps) => {
  const [expanded, setExpanded] = useState(!collapsible);
  const hasDiscount = discountName && precioFinal < precioBase;

  const content = (
    <div className="space-y-2 text-sm">
      <div className="flex justify-between">
        <span className="text-muted-foreground">Plan</span>
        <span className="font-medium text-foreground">{planName}</span>
      </div>

      {frecuencia && (
        <div className="flex justify-between">
          <span className="text-muted-foreground">Frecuencia</span>
          <span className="text-foreground">{frecuenciaLabels[frecuencia] || frecuencia}</span>
        </div>
      )}

      {modality && (
        <div className="flex justify-between">
          <span className="text-muted-foreground">Modalidad</span>
          <span className="text-foreground">
            {modality === "total" ? "Pago total" : `${cuotasCantidad} cuotas`}
          </span>
        </div>
      )}

      {paymentMethod && (
        <div className="flex justify-between">
          <span className="text-muted-foreground">Medio de pago</span>
          <span className="text-foreground">{methodLabels[paymentMethod] || paymentMethod}</span>
        </div>
      )}

      <div className="border-t border-border pt-2 mt-2">
        {hasDiscount && (
          <>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Precio</span>
              <span className="text-muted-foreground line-through">{formatPrice(precioBase, moneda)}</span>
            </div>
            <div className="flex justify-between text-emerald-400">
              <span>{discountName} ({discountType === "fijo" ? `-${formatPrice(discountValue!, moneda)}` : `-${discountValue}%`})</span>
              <span>-{formatPrice(precioBase - precioFinal, moneda)}</span>
            </div>
          </>
        )}
        <div className="flex justify-between font-semibold text-base mt-1">
          <span className="text-foreground">
            {modality === "cuotas" ? "Pagás hoy" : "Total"}
          </span>
          <span className="text-foreground">
            {modality === "cuotas" && cuotaValor
              ? formatPrice(cuotaValor, moneda)
              : formatPrice(precioFinal, moneda)}
          </span>
        </div>
        {modality === "cuotas" && cuotasCantidad && cuotaValor && (
          <p className="text-xs text-muted-foreground mt-1 text-right">
            + {cuotasCantidad - 1} cuotas restantes de {formatPrice(cuotaValor, moneda)}
          </p>
        )}
      </div>
    </div>
  );

  if (collapsible) {
    return (
      <div className="rounded-lg border border-border bg-card/50 overflow-hidden">
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-between p-4 text-left"
        >
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">{planName}</span>
            <span className="text-sm font-semibold gold-text-gradient">
              {formatPrice(precioFinal, moneda)}
            </span>
          </div>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
        </button>
        {expanded && <div className="px-4 pb-4">{content}</div>}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card/50 p-4">
      {content}
    </div>
  );
};

export default CheckoutSummaryCard;
