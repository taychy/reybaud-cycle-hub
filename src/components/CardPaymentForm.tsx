import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, CreditCard, Loader2, RefreshCw } from "lucide-react";
import { formatPrice } from "@/lib/currency";
import { Checkbox } from "@/components/ui/checkbox";
import { tryReuseExistingSubscription } from "@/lib/paymentReuseSub";

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
  allowAutoRenewal?: boolean;
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
  allowAutoRenewal = false,
  onBack,
}: CardPaymentFormProps) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mpPublicKey, setMpPublicKey] = useState<string | null>(null);
  const [payerEmail, setPayerEmail] = useState("");
  const [autoRenewalChecked, setAutoRenewalChecked] = useState(false);
  const cardFormRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch MP public key
  useEffect(() => {
    const fetchKey = async () => {
      try {
        const [keyRes, alumnoRes] = await Promise.all([
          fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-mp-public-key`, {
            headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
          }),
          supabase.from("alumnos").select("email").eq("id", alumnoId).maybeSingle(),
        ]);
        const data = await keyRes.json();
        if (data.public_key) {
          setMpPublicKey(data.public_key);
          setPayerEmail((alumnoRes.data?.email || "").trim().toLowerCase());
        } else {
          setError("No se pudo obtener la configuración de pago.");
        }
      } catch {
        setError("Error al conectar con el servicio de pagos.");
      }
    };
    fetchKey();
  }, [alumnoId]);

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
        style: {
          input: {
            color: "#111827",
            "font-size": "16px",
            "font-family": "Inter, sans-serif",
          },
          placeholder: {
            color: "#6b7280",
          },
        },
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
          cardholderEmail: {
            id: "mp-cardholder-email",
            placeholder: "Email",
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
              const email = (formData.cardholderEmail || payerEmail || "").trim().toLowerCase();

              if (!email) {
                setError("Ingresá un email para continuar con Mercado Pago.");
                setProcessing(false);
                return;
              }

              // Reutilizar sub del período actual si venimos de "Pagar este plan"
              const reused = await tryReuseExistingSubscription(alumnoId, planId, {
                estado: "pendiente",
                descuento_id: descuentoId,
                precio_base: precioBase,
                precio_final: planPrice,
              });

              let subId: string;
              if (reused) {
                subId = reused.id;
              } else {
                const now = new Date();
                const fechaInicio = now.toISOString().split("T")[0];
                const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
                const fechaFin = lastDay.toISOString().split("T")[0];

                const { data: sub, error: subError } = await supabase
                  .from("suscripciones")
                  .insert({
                    alumno_id: alumnoId,
                    plan_id: planId,
                    estado: "pendiente",
                    descuento_id: descuentoId,
                    precio_base: precioBase,
                    precio_final: planPrice,
                    fecha_inicio: fechaInicio,
                    fecha_fin: fechaFin,
                  } as any)
                  .select("id")
                  .single();

                if (subError) {
                  setError("Error al procesar. Intentá nuevamente.");
                  setProcessing(false);
                  return;
                }
                subId = sub.id;
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
                    email,
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
                // Opt-in to monthly auto-renewal via MP Preapproval (redirect mode)
                if (autoRenewalChecked && allowAutoRenewal) {
                  try {
                    const preapprovalUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-mp-preapproval`;
                    const ppRes = await fetch(preapprovalUrl, {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
                      },
                      body: JSON.stringify({
                        payer_email: email,
                        suscripcion_id: sub.id,
                        alumno_id: alumnoId,
                        plan_id: planId,
                        transaction_amount: planPrice,
                      }),
                    });
                    const ppData = await ppRes.json();
                    if (ppRes.ok && ppData?.init_point) {
                      // Redirect to MP for the user to authorize the recurring agreement.
                      window.location.href = ppData.init_point;
                      return;
                    }
                    console.warn("Preapproval setup failed, continuing without auto-renewal:", ppData);
                  } catch (ppErr) {
                    console.warn("Preapproval setup error:", ppErr);
                  }
                }
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

  const hasDiscount = descuentoId !== null && planPrice < precioBase;

  const formatPriceLocal = (precio: number) => {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: moneda || "ARS",
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(precio);
  };

  // Fondo claro fijo + texto oscuro fijo para asegurar contraste consistente en light/dark mode.
  // El iframe de MP fuerza color #111827 (ver style.input.color), así que el contenedor debe ser claro siempre.
  const mpFieldClass = "h-12 rounded-md border border-input bg-white px-2 text-gray-900 shadow-inner shadow-black/5";
  const nativeFieldClass = "w-full h-12 rounded-md border border-input bg-white px-3 text-sm text-gray-900 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary";

  return (
    <div className="max-w-md mx-auto space-y-6 animate-fade-in" ref={containerRef}>
      <div className="text-center space-y-2">
        <CreditCard className="w-10 h-10 text-primary mx-auto" />
        <h2 className="text-xl font-heading font-bold uppercase tracking-wider text-foreground">
          Pago con tarjeta
        </h2>
        <p className="text-sm text-muted-foreground">
          {planName} — {formatPriceLocal(planPrice)}/mes
        </p>
      </div>

      {/* Discount summary */}
      {hasDiscount && (
        <div className="rounded-lg border border-border bg-secondary/30 p-3 space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Precio base</span>
            <span className="text-muted-foreground line-through">{formatPriceLocal(precioBase)}</span>
          </div>
          <div className="flex justify-between text-emerald-400">
            <span>{descuentoNombre} ({descuentoTipo === "fijo" ? `-${formatPriceLocal(descuentoValor!)}` : `-${descuentoValor}%`})</span>
            <span>-{formatPriceLocal(precioBase - planPrice)}</span>
          </div>
          <div className="border-t border-border pt-1 flex justify-between font-medium">
            <span className="text-foreground">Total</span>
            <span className="text-foreground">{formatPriceLocal(planPrice)}</span>
          </div>
        </div>
      )}

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
            className={mpFieldClass}
          />
        </div>

        {/* Expiration + CVV */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Vencimiento</label>
            <div
              id="mp-expiration-date"
              className={mpFieldClass}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">CVV</label>
            <div
              id="mp-security-code"
              className={mpFieldClass}
            />
          </div>
        </div>

        {/* Cardholder name */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Titular de la tarjeta</label>
          <input
            id="mp-cardholder-name"
            type="text"
            className={nativeFieldClass}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Email</label>
          <input
            id="mp-cardholder-email"
            type="email"
            value={payerEmail}
            onChange={(event) => setPayerEmail(event.target.value)}
            className={nativeFieldClass}
          />
        </div>

        {/* ID type + number */}
        <div className="grid grid-cols-[120px_1fr] gap-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Tipo doc.</label>
            <select
              id="mp-identification-type"
              className={nativeFieldClass}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Nro. documento</label>
            <input
              id="mp-identification-number"
              type="text"
              className={nativeFieldClass}
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
            className={nativeFieldClass}
          />
        </div>

        {allowAutoRenewal && (
          <div className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
            <Checkbox
              id="auto-renewal"
              checked={autoRenewalChecked}
              onCheckedChange={(v) => setAutoRenewalChecked(v === true)}
              className="mt-0.5"
            />
            <label htmlFor="auto-renewal" className="text-xs text-foreground cursor-pointer leading-snug">
              <span className="flex items-center gap-1.5 font-medium">
                <RefreshCw className="w-3 h-3 text-primary" />
                Renovar automáticamente cada mes
              </span>
              <span className="text-muted-foreground">
                Cobramos tu plan a esta tarjeta cada mes. Podés cancelar cuando quieras desde tu perfil.
              </span>
            </label>
          </div>
        )}

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
            `Pagar ${formatPriceLocal(planPrice)}`
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
