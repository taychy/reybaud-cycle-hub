import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";

type Status = "processing" | "done" | "invalid" | "missing";

/**
 * Página pública de baja de comunicaciones de marketing.
 * No requiere login y nunca muestra el email asociado al token.
 * El token es de un solo uso lógico: repetir la baja es inofensivo.
 */
const BroadcastUnsubscribe = () => {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<Status>("processing");

  useEffect(() => {
    const token = searchParams.get("token");
    if (!token || !/^[a-f0-9]{64}$/.test(token)) {
      setStatus("missing");
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc("unsubscribe_broadcast" as any, { p_token: token });
      if (cancelled) return;
      if (error) {
        setStatus("invalid");
        return;
      }
      setStatus(data === true ? "done" : "invalid");
    })();
    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-card border border-border rounded-2xl p-8 text-center space-y-4">
        <div className="font-heading text-2xl font-extrabold tracking-[4px] text-primary">REYBAUD</div>

        {status === "processing" && (
          <>
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
            <p className="text-sm text-muted-foreground">Procesando tu baja…</p>
          </>
        )}

        {status === "done" && (
          <>
            <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-500" />
            <h1 className="text-lg font-heading font-bold">Listo, te dimos de baja</h1>
            <p className="text-sm text-muted-foreground">
              No vas a recibir más comunicaciones comerciales de Ciclismo Reybaud.
              Los avisos esenciales de tus servicios activos (pagos, reservas, entrenamientos) no se ven afectados.
            </p>
          </>
        )}

        {status === "invalid" && (
          <>
            <XCircle className="w-10 h-10 mx-auto text-destructive" />
            <h1 className="text-lg font-heading font-bold">Este enlace no es válido</h1>
            <p className="text-sm text-muted-foreground">
              El enlace puede haber expirado o ser incorrecto. Si querés darte de baja,
              respondé "BAJA" al correo que recibiste y lo resolvemos manualmente.
            </p>
          </>
        )}

        {status === "missing" && (
          <>
            <XCircle className="w-10 h-10 mx-auto text-destructive" />
            <h1 className="text-lg font-heading font-bold">Enlace incompleto</h1>
            <p className="text-sm text-muted-foreground">
              Este enlace de baja está incompleto. Usá el enlace completo que figura al pie del correo que recibiste.
            </p>
          </>
        )}

        <Link to="/" className="inline-block text-xs text-muted-foreground underline underline-offset-2">
          Volver a reybaud-app.com
        </Link>
      </div>
    </div>
  );
};

export default BroadcastUnsubscribe;
