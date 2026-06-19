import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, AlertCircle, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/currency";

const PreorderPagoRedirect = () => {
  const { preorderId } = useParams<{ preorderId: string }>();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<any>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!preorderId) { setError("Reserva inválida"); return; }
      const { data: po, error: e } = await supabase
        .from("store_preorders")
        .select("id, producto_nombre, sena_monto, saldo_pendiente, moneda, estado, estado_pago_sena")
        .eq("id", preorderId)
        .maybeSingle();
      if (cancelled) return;
      if (e || !po) { setError("Reserva no encontrada"); return; }
      if (po.estado === "cancelada") { setError("Esta reserva fue cancelada"); return; }
      setInfo(po);

      const senaConfirmada = po.estado_pago_sena === "confirmada";
      const saldo = Number(po.saldo_pendiente || 0);
      if (senaConfirmada && saldo <= 0) { setError("Esta reserva está totalmente pagada ✓"); return; }

      const fn = senaConfirmada
        ? "create-preorder-saldo-mp-preference"
        : "create-preorder-mp-preference";

      const { data, error: fnErr } = await supabase.functions.invoke(fn, {
        body: { preorder_id: preorderId },
      });
      if (cancelled) return;
      if (fnErr || !data) {
        setError(fnErr?.message || "No se pudo generar el pago");
        return;
      }
      const url = (data as any).init_point || (data as any).sandbox_init_point;
      if (!url) { setError("No se recibió URL de pago"); return; }
      window.location.replace(url);
    })();
    return () => { cancelled = true; };
  }, [preorderId]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="max-w-md w-full rounded-2xl border border-border bg-card p-6 space-y-4 text-center">
        {!error ? (
          <>
            <Loader2 className="w-10 h-10 mx-auto animate-spin text-primary" />
            <h1 className="font-heading text-xl">Generando pago seguro...</h1>
            {info && (
              <div className="text-sm text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">{info.producto_nombre}</p>
                <p>
                  {info.estado_pago_sena === "confirmada"
                    ? `Saldo a pagar: ${formatPrice(Number(info.saldo_pendiente), info.moneda)}`
                    : `Seña: ${formatPrice(Number(info.sena_monto), info.moneda)}`}
                </p>
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

export default PreorderPagoRedirect;
