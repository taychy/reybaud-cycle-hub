import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, AlertTriangle, MessageCircle, ArrowLeft } from "lucide-react";
import { formatPrice } from "@/lib/currency";

interface DeudaItem {
  moneda: string;
  monto: number;
}

const WHATSAPP = "5491140311122";

export default function Reingreso() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [nombre, setNombre] = useState("");
  const [deudas, setDeudas] = useState<DeudaItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      const alumnoId = localStorage.getItem("reingreso_alumno_id");
      if (!alumnoId) {
        navigate("/", { replace: true });
        return;
      }
      const { data, error: rpcError } = await supabase.rpc("get_reingreso_status", {
        p_alumno_id: alumnoId,
      });
      if (rpcError || !data) {
        setError("No pudimos verificar tu cuenta. Escribinos y lo resolvemos.");
        setLoading(false);
        return;
      }
      const info = data as any;
      setNombre(info.nombre || "");
      const lista: DeudaItem[] = (info.deudas || []).map((d: any) => ({
        moneda: d.moneda,
        monto: Number(d.monto) || 0,
      }));
      setDeudas(lista);
      if (info.puede_reingresar) {
        localStorage.setItem("registro_alumno_id", alumnoId);
        localStorage.setItem("alumno_renewal", "1");
        localStorage.removeItem("reingreso_alumno_id");
        navigate("/planes", { replace: true });
        return;
      }
      setLoading(false);
    };
    run();
  }, [navigate]);

  const mensaje = encodeURIComponent(
    `Hola! Soy ${nombre || "un ex alumno"} y quiero volver a la escuela. Vi que tengo un saldo pendiente y quiero regularizarlo.`
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md border-border/60">
        <CardHeader className="space-y-2">
          <div className="flex items-center gap-2 text-amber-500">
            <AlertTriangle className="h-5 w-5" />
            <span className="text-xs font-semibold uppercase tracking-wide">Saldo pendiente</span>
          </div>
          <CardTitle className="text-2xl">
            {nombre ? `¡Qué bueno tenerte de vuelta, ${nombre.split(" ")[0]}!` : "¡Qué bueno tenerte de vuelta!"}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Antes de reactivar tu cuenta necesitamos regularizar lo que quedó pendiente de tu última etapa.
            Una vez saldado, vas a poder elegir tu plan y volver a entrenar al instante.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : (
            <div className="rounded-lg border border-border/60 divide-y divide-border/60">
              {deudas.map((d) => (
                <div key={d.moneda} className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm text-muted-foreground">Saldo en {d.moneda}</span>
                  <span className="text-lg font-bold">{formatPrice(d.monto, d.moneda)}</span>
                </div>
              ))}
            </div>
          )}

          <Button asChild className="w-full" size="lg">
            <a href={`https://wa.me/${WHATSAPP}?text=${mensaje}`} target="_blank" rel="noreferrer">
              <MessageCircle className="mr-2 h-4 w-4" />
              Coordinar el pago por WhatsApp
            </a>
          </Button>

          <Button
            variant="ghost"
            className="w-full"
            onClick={async () => {
              localStorage.removeItem("reingreso_alumno_id");
              await supabase.auth.signOut();
              navigate("/", { replace: true });
            }}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Volver al inicio
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
