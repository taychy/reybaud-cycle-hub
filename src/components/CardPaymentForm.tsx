import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, CreditCard, Loader2 } from "lucide-react";
import { formatPrice } from "@/lib/currency";

interface CardPaymentFormProps {
  planId: string;
  planName: string;
  planPrice: number;
  precioBase: number;
  descuentoId: string | null;
  descuentoNombre: string | null;
  descuentoValor: number | null;
  descuentoTipo: string | null;
  moneda: string;
  alumnoId: string;
  onBack: () => void;
}

declare global {
  interface Window {
    MercadoPago: any;
  }
}

const CardPaymentForm = ({
  planId,
  planName,
  planPrice,
  precioBase,
  descuentoId,
  descuentoNombre,
  descuentoValor,
  descuentoTipo,
  moneda,
  alumnoId,
  onBack,
}: CardPaymentFormProps) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mpPublicKey, setMpPublicKey] = useState<string | null>(null);
  const cardFormRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch MP public key
  useEffect(() => {
    const fetchKey = async () => {
      try {
        const functionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-mp-public-key`;
        const res = await fetch(functionUrl, {
          headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
        });
        const data = await res.json();
        if (data.public_key) {
          setMpPublicKey(data.public_key);
        } else {
          setError("No se pudo obtener la configuración de pago.");
        }
      } catch {
        setError("Error al conectar con el servicio de pagos.");
      }
    };
    fetchKey();
  }, []);

  // Load MercadoPago SDK and initialize card form
  useEffect(() => {
    if (!mpPublicKey) return;

    const script = document.createElement("script");
    script.src = "https://sdk.mercadopago.com/js/v2";
    script.onload = () => {
      initCardForm();
    };
    script.onerror = () => {
      setError("Error al cargar el SDK de pagos.");
      setLoading(false);
    };
    document.head.appendChild(script);

    return () => {
      if (cardFormRef.current) {
        try {
          cardFormRef.current.unmount();
        } catch {}
      }
    };
  }, [mpPublicKey]);

  const initCardForm = () => {
    try {
      const mp = new window.MercadoPago(mpPublicKey, { locale: "es-AR" });

      const cardForm = mp.cardForm({
        amount: String(planPrice),
        iframe: true,
        form: {
          id: "mp-card-form",
          cardNumber: {
            id: "mp-card-number",
            placeholder: "Número de tarjeta",
          },
          expirationDate: {
            id: "mp-expiration-date",
            placeholder: "MM/AA",
          },
          securityCode: {
            id: "mp-security-code",
            placeholder: "CVV",
          },
          cardholderName: {
            id: "mp-cardholder-name",
            placeholder: "Nombre del titular",
          },
          identificationNumber: {
            id: "mp-identification-number",
            placeholder: "DNI",
          },
          identificationType: {
            id: "mp-identification-type",
          },
          installments: {
            id: "mp-installments",
          },
          issuer: {
            id: "mp-issuer",
          },
        },
        callbacks: {
          onFormMounted: (err: any) => {
            if (err) {
              console.error("Card form mount error:", err);
              setError("Error al inicializar el formulario de pago.");
            }
            setLoading(false);
          },
          onSubmit: async (event: Event) => {
            event.preventDefault();
            setProcessing(true);
            setError(null);

            try {
              const formData = cardForm.getCardFormData();

              // Create subscription first
              const { data: sub, error: subError } = await supabase
                .from("suscripciones")
                .insert({
                  alumno_id: alumnoId,
                  plan_id: planId,
                  estado: "pendiente",
                })
                .select("id")
                .single();

              if (subError) {
                setError("Error al procesar. Intentá nuevamente.");
                setProcessing(false);
                return;
              }

              // Process payment via edge function
              const functionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-card-payment`;
              const res = await fetch(functionUrl, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
                },
                body: JSON.stringify({
                  token: formData.token,
                  issuer_id: formData.issuerId,
                  payment_method_id: formData.paymentMethodId,
                  transaction_amount: planPrice,
                  installments: Number(formData.installments),
                  payer: {
                    email: formData.cardholderEmail || "",
                    identification: {
                      type: formData.identificationType,
                      number: formData.identificationNumber,
                    },
                  },
                  suscripcion_id: sub.id,
                  alumno_id: alumnoId,
                  plan_id: planId,
                }),
              });

              const result = await res.json();

              if (!res.ok || result.status === "rejected") {
                setError(
                  result.error ||
                    result.status_detail ||
                    "El pago fue rechazado. Intentá con otra tarjeta."
                );
                setProcessing(false);
                return;
              }

              // Payment approved
              if (result.status === "approved") {
                navigate("/pago-resultado?status=approved");
              } else if (result.status === "in_process") {
                navigate("/pago-resultado?status=pending");
              } else {
                navigate(`/pago-resultado?status=${result.status}`);
              }
            } catch (err) {
              console.error("Card payment error:", err);
              setError("Error inesperado al procesar el pago.");
              setProcessing(false);
            }
          },
          onError: (err: any) => {
            console.error("MP card form error:", err);
          },
        },
      });

      cardFormRef.current = cardForm;
    } catch (err) {
      console.error("MP init error:", err);
      setError("Error al inicializar Mercado Pago.");
      setLoading(false);
    }
  };

  const formatPrice = (precio: number) => {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(precio);
  };

  return (
    <div className="max-w-md mx-auto space-y-6 animate-fade-in" ref={containerRef}>
      <div className="text-center space-y-2">
        <CreditCard className="w-10 h-10 text-primary mx-auto" />
        <h2 className="text-xl font-heading font-bold uppercase tracking-wider text-foreground">
          Pago con tarjeta
        </h2>
        <p className="text-sm text-muted-foreground">
          {planName} — {formatPrice(planPrice)}/mes
        </p>
      </div>

      {error && (
        <div className="text-sm text-destructive bg-destructive/10 rounded-md p-3 text-center">
          {error}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          <span className="ml-2 text-sm text-muted-foreground">Cargando formulario...</span>
        </div>
      )}

      <form id="mp-card-form" className={loading ? "hidden" : "space-y-4"}>
        {/* Card number */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Número de tarjeta</label>
          <div
            id="mp-card-number"
            className="h-11 rounded-md border border-input bg-background px-1"
          />
        </div>

        {/* Expiration + CVV */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Vencimiento</label>
            <div
              id="mp-expiration-date"
              className="h-11 rounded-md border border-input bg-background px-1"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">CVV</label>
            <div
              id="mp-security-code"
              className="h-11 rounded-md border border-input bg-background px-1"
            />
          </div>
        </div>

        {/* Cardholder name */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Titular de la tarjeta</label>
          <input
            id="mp-cardholder-name"
            type="text"
            className="w-full h-11 rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        {/* ID type + number */}
        <div className="grid grid-cols-[120px_1fr] gap-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Tipo doc.</label>
            <select
              id="mp-identification-type"
              className="w-full h-11 rounded-md border border-input bg-background px-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Nro. documento</label>
            <input
              id="mp-identification-number"
              type="text"
              className="w-full h-11 rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </div>

        {/* Issuer (hidden if not needed, auto-populated by SDK) */}
        <select id="mp-issuer" className="hidden" />

        {/* Installments */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Cuotas</label>
          <select
            id="mp-installments"
            className="w-full h-11 rounded-md border border-input bg-background px-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <Button
          type="submit"
          variant="gold"
          size="lg"
          className="w-full"
          disabled={processing}
        >
          {processing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              Procesando...
            </>
          ) : (
            `Pagar ${formatPrice(planPrice)}`
          )}
        </Button>
      </form>

      <button
        onClick={onBack}
        className="flex items-center gap-1.5 mx-auto text-xs text-muted-foreground hover:text-primary transition-colors"
      >
        <ArrowLeft className="w-3 h-3" />
        Volver a métodos de pago
      </button>
    </div>
  );
};

export default CardPaymentForm;
