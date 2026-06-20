import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, AlertCircle, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/currency";

const PreorderAlumnoPagoRedirect = () => {
  const { alumnoId } = useParams<{ alumnoId: string }>();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<{ monto: number; moneda: string; count: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!alumnoId) { setError("Cliente inválido"); return; }
      const { data, error: fnErr } = await supabase.functions.invoke(
        "create-preorder-alumno-saldo-mp-preference",
        { body: { alumno_id: alumnoId } },
      );
      if (cancelled) return;
      if (fnErr || !data || (data as any).error) {
        setError((data as any)?.error || fnErr?.message || "No se pudo generar el pago");
        return;
      }
      const url = (data as any).init_point || (data as any).sandbox_init_point;
      if (!url) { setError("No se recibió URL de pago"); return; }
      setInfo({ monto: (data as any).monto, moneda: (data as any).moneda, count: (data as any).count });
      window.location.replace(url);
    })();
    return () => { cancelled = true; };
  }, [alumnoId]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="max-w-md w-full rounded-2xl border border-border bg-card p-6 space-y-4 text-center">
        {!error ? (
          <>
            <Loader2 className="w-10 h-10 mx-auto animate-spin text-primary" />
            <h1 className="font-heading text-xl">Generando pago seguro…</h1>
            {info && (
              <div className="text-sm text-muted-foreground space-y-1">
                <p>{info.count} preventa{info.count > 1 ? "s" : ""} pendientes</p>
                <p className="font-medium text-foreground">Total: {formatPrice(info.monto, info.moneda)}</p>
              </div>
            )}
            <p className="text-xs text-muted-foreground">Te estamos redirigiendo a Mercado Pago…</p>
          </>
        ) : (
          <>
            <AlertCircle className="w-10 h-10 mx-auto text-destructive" />
            <h1 className="font-heading text-xl">No pudimos abrir el pago</h1>
            <p className="text-sm text-muted-foreground">{error}</p>
            <div className="flex gap-2 justify-center pt-2">
              <Button variant="outline" onClick={() => navigate("/")}>Ir al inicio</Button>
              <Button onClick={() => window.location.reload()}>
                <CreditCard className="w-4 h-4 mr-1" /> Reintentar
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default PreorderAlumnoPagoRedirect;
