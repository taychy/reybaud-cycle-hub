import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Check, ArrowLeft, CreditCard } from "lucide-react";
import logo from "@/assets/logo.png";

interface Plan {
  id: string;
  nombre: string;
  descripcion: string | null;
  precio: number;
  frecuencia: string;
}

const frecuenciaLabels: Record<string, string> = {
  mensual_libre: "Acceso ilimitado",
  "2x_semana": "2 veces por semana",
  "1x_semana": "1 vez por semana",
};

const PlanSelection = () => {
  const navigate = useNavigate();
  const [planes, setPlanes] = useState<Plan[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const alumnoId = sessionStorage.getItem("registro_alumno_id");

  useEffect(() => {
    if (!alumnoId) {
      navigate("/registro");
      return;
    }

    supabase
      .from("planes")
      .select("*")
      .eq("activo", true)
      .order("precio", { ascending: false })
      .then(({ data }) => {
        setPlanes((data as Plan[]) || []);
        setLoading(false);
      });
  }, [alumnoId, navigate]);

  const formatPrice = (precio: number) => {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(precio);
  };

  const handleCheckout = async () => {
    if (!selected || !alumnoId) return;
    setProcessing(true);
    setError(null);

    const plan = planes.find((p) => p.id === selected);
    if (!plan) return;

    // Create subscription record
    const { data: sub, error: subError } = await supabase
      .from("suscripciones")
      .insert({
        alumno_id: alumnoId,
        plan_id: plan.id,
        estado: "pendiente",
      })
      .select("id")
      .single();

    if (subError) {
      setError("Error al procesar. Intentá nuevamente.");
      setProcessing(false);
      return;
    }

    // Call edge function to create MP preference
    const { data: mpData, error: mpError } = await supabase.functions.invoke(
      "create-mp-preference",
      {
        body: {
          plan_id: plan.id,
          alumno_id: alumnoId,
          suscripcion_id: sub.id,
        },
      }
    );

    if (mpError || !mpData?.init_point) {
      setError(mpData?.error || "Error al conectar con Mercado Pago. Intentá nuevamente.");
      setProcessing(false);
      return;
    }

    // Redirect to Mercado Pago checkout
    window.location.href = mpData.init_point;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Cargando planes...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="max-w-4xl mx-auto space-y-8 animate-fade-in">
        {/* Header */}
        <div className="text-center space-y-3">
          <img src={logo} alt="Ciclismo Reybaud" className="w-20 h-20 mx-auto mb-2" />
          <h1 className="text-3xl font-heading font-bold uppercase tracking-wider text-foreground">
            Elegí tu plan
          </h1>
          <p className="text-muted-foreground text-sm max-w-md mx-auto">
            Seleccioná el plan que mejor se adapte a tus objetivos
          </p>
        </div>

        {/* Plans grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {planes.map((plan, index) => {
            const isPopular = index === 0;
            const isSelected = selected === plan.id;

            return (
              <button
                key={plan.id}
                onClick={() => setSelected(plan.id)}
                className={`relative text-left rounded-lg p-6 transition-all duration-200 ${
                  isSelected
                    ? "ring-2 ring-primary card-glow"
                    : "hover:ring-1 hover:ring-border"
                } glass-card`}
              >
                {isPopular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full gold-gradient text-xs font-heading font-semibold uppercase tracking-wider text-primary-foreground">
                    Más elegido
                  </div>
                )}

                <div className="space-y-4">
                  <div>
                    <h3 className="text-lg font-heading font-semibold uppercase tracking-wider text-foreground">
                      {plan.nombre}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      {frecuenciaLabels[plan.frecuencia] || plan.frecuencia}
                    </p>
                  </div>

                  <div>
                    <span className="text-3xl font-heading font-bold gold-text-gradient">
                      {formatPrice(plan.precio)}
                    </span>
                    <span className="text-muted-foreground text-sm"> /mes</span>
                  </div>

                  {plan.descripcion && (
                    <p className="text-sm text-secondary-foreground">
                      {plan.descripcion}
                    </p>
                  )}

                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Check className={`w-4 h-4 ${isSelected ? "text-primary" : ""}`} />
                    <span>Acceso a entrenamientos</span>
                  </div>
                </div>

                {isSelected && (
                  <div className="absolute top-4 right-4 w-6 h-6 rounded-full gold-gradient flex items-center justify-center">
                    <Check className="w-3 h-3 text-primary-foreground" />
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Error */}
        {error && (
          <div className="max-w-md mx-auto text-sm text-destructive bg-destructive/10 rounded-md p-3 text-center">
            {error}
          </div>
        )}

        {/* CTA */}
        <div className="flex flex-col items-center gap-4">
          <Button
            variant="gold"
            size="lg"
            className="w-full max-w-md"
            disabled={!selected || processing}
            onClick={handleCheckout}
          >
            {processing ? "Procesando..." : "Pagar con Mercado Pago"}
            <CreditCard className="w-4 h-4" />
          </Button>

          <button
            onClick={() => navigate("/")}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
          >
            <ArrowLeft className="w-3 h-3" />
            Volver al inicio
          </button>
        </div>
      </div>
    </div>
  );
};

export default PlanSelection;
