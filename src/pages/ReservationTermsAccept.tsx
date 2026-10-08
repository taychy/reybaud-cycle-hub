import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { TermsAcceptForm, TermsSnapshot } from "@/components/reservation/ReservationTermsPending";

type Info = { status: "pendiente" | "invalido" | "expirado"; event_title?: string; package?: string; nombre?: string; terms?: TermsSnapshot };

/** Enlace seguro de un solo uso para aceptar condiciones de una reserva cargada por Administración. */
export default function ReservationTermsAccept() {
  const { token = "" } = useParams();
  const [info, setInfo] = useState<Info | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    supabase.rpc("get_reservation_terms_by_token" as any, { p_token: token }).then(({ data, error }) =>
      setInfo(error ? { status: "invalido" } : (data as any)));
  }, [token]);

  return (
    <main className="min-h-screen bg-background text-foreground px-4 py-10">
      <div className="mx-auto max-w-xl space-y-6">
        {!info && <Loader2 className="w-6 h-6 animate-spin mx-auto" />}
        {done && (
          <div className="rounded-lg border border-primary/40 p-5 text-center space-y-2">
            <h1 className="text-xl font-semibold">¡Condiciones aceptadas!</h1>
            <p className="text-sm text-muted-foreground">Quedó registrado el {done}. Ya podés continuar con el pago de la seña.</p>
          </div>
        )}
        {info && !done && info.status !== "pendiente" && (
          <div className="rounded-lg border border-border p-5 text-center space-y-2">
            <h1 className="text-xl font-semibold">{info.status === "expirado" ? "El enlace venció" : "Enlace no válido"}</h1>
            <p className="text-sm text-muted-foreground">Pedile a Administración un enlace nuevo para aceptar las condiciones.</p>
          </div>
        )}
        {info?.status === "pendiente" && !done && info.terms && (
          <>
            <header className="space-y-1">
              <p className="text-sm text-muted-foreground">Hola{info.nombre ? ` ${info.nombre}` : ""}, para confirmar tu lugar</p>
              <h1 className="text-2xl font-semibold">{info.event_title}</h1>
              {info.package && <p className="text-sm text-muted-foreground">{info.package}</p>}
            </header>
            <TermsAcceptForm terms={info.terms} onAccept={async (version) => {
              const { data, error } = await supabase.rpc("accept_reservation_terms_by_token" as any, { p_token: token, p_version: version });
              if (error) return error.message;
              setDone(new Date((data as any).aceptado_at).toLocaleString("es-AR", { dateStyle: "long", timeStyle: "short" }));
              return null;
            }} />
          </>
        )}
      </div>
    </main>
  );
}
