import { useEffect, useState } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CheckCircle2, Loader2, AlertCircle } from "lucide-react";

export default function EventInterest() {
  const { eventId } = useParams();
  const [params] = useSearchParams();
  const tipo = params.get("tipo") || "contacto";
  const emailQ = params.get("email") || "";
  const nombreQ = params.get("nombre") || "";
  const isValidEmailQuery = /.+@.+\..+/.test(emailQ) && !/[{}]/.test(emailQ);
  const cleanNombreQ = /[{}]/.test(nombreQ) ? "" : nombreQ;

  const [email, setEmail] = useState(isValidEmailQuery ? emailQ : "");
  const [nombre, setNombre] = useState(cleanNombreQ);
  const [state, setState] = useState<"idle" | "sending" | "ok" | "error">(isValidEmailQuery ? "sending" : "idle");
  const [error, setError] = useState("");

  const send = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!eventId) return;
    setState("sending");
    try {
      const { error } = await supabase.functions.invoke("event-interest", {
        body: { event_id: eventId, tipo, email, nombre, fuente: "email_camp_san_luis" },
      });
      if (error) throw error;
      setState("ok");
    } catch (err: any) {
      setError(err.message || "Error");
      setState("error");
    }
  };

  useEffect(() => {
    if (isValidEmailQuery) send();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const titulo = tipo === "personalizado"
    ? "Entrenamiento personalizado"
    : tipo === "reserva"
      ? "Reservar mi lugar"
      : "Que me contacten";

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-10">
      <Card className="max-w-md w-full p-8 space-y-6">
        <div className="text-center">
          <div className="text-primary font-heading text-2xl tracking-widest">REYBAUD</div>
          <p className="text-xs text-muted-foreground mt-1">Training Camp San Luis 2026</p>
        </div>

        {state === "ok" && (
          <div className="text-center space-y-3">
            <CheckCircle2 className="w-12 h-12 mx-auto text-primary" />
            <h1 className="text-xl font-semibold">¡Recibimos tu mensaje!</h1>
            <p className="text-sm text-muted-foreground">
              Un asesor de Reybaud te va a contactar en las próximas horas para conversar sobre {titulo.toLowerCase()}.
            </p>
            <Button asChild variant="gold" className="w-full">
              <Link to={`/eventos/${eventId}`}>Ver detalle del camp</Link>
            </Button>
          </div>
        )}

        {state === "error" && (
          <div className="text-center space-y-3">
            <AlertCircle className="w-12 h-12 mx-auto text-destructive" />
            <p className="text-sm text-muted-foreground">No pudimos registrar tu interés: {error}</p>
            <Button onClick={() => send()} className="w-full">Reintentar</Button>
          </div>
        )}

        {(state === "idle" || state === "sending") && (
          <form onSubmit={send} className="space-y-4">
            <h1 className="text-xl font-semibold text-center">{titulo}</h1>
            <p className="text-sm text-muted-foreground text-center">
              Dejanos tus datos y te contactamos.
            </p>
            <div className="space-y-2">
              <input
                className="w-full h-11 px-3 rounded-md bg-input border border-border text-sm"
                placeholder="Tu nombre"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                required
              />
              <input
                type="email"
                className="w-full h-11 px-3 rounded-md bg-input border border-border text-sm"
                placeholder="tu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <Button type="submit" variant="gold" className="w-full" disabled={state === "sending"}>
              {state === "sending" ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Enviando…</> : "Enviar"}
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
