import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

type State = "loading" | "valid" | "invalid" | "used" | "success" | "error";

export default function Unsubscribe() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [state, setState] = useState<State>("loading");
  const [email, setEmail] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setState("invalid");
      return;
    }
    (async () => {
      try {
        const res = await fetch(
          `${SUPABASE_URL}/functions/v1/handle-email-unsubscribe?token=${encodeURIComponent(token)}`,
          { headers: { apikey: SUPABASE_ANON_KEY } }
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setState(data?.reason === "already_used" ? "used" : "invalid");
          return;
        }
        setEmail(data?.email || "");
        setState("valid");
      } catch {
        setState("error");
      }
    })();
  }, [token]);

  const confirm = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(
        `${SUPABASE_URL}/functions/v1/handle-email-unsubscribe`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ token }),
        }
      );
      if (!res.ok) {
        setState("error");
        return;
      }
      setState("success");
    } catch {
      setState("error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-card border border-border rounded-xl p-8 text-center space-y-4">
        <h1 className="text-2xl font-bold text-foreground">Ciclismo Reybaud</h1>

        {state === "loading" && (
          <div className="flex flex-col items-center gap-3 py-4">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <p className="text-muted-foreground">Verificando enlace…</p>
          </div>
        )}

        {state === "valid" && (
          <>
            <p className="text-foreground">
              ¿Querés dejar de recibir emails{email ? ` en ${email}` : ""}?
            </p>
            <Button onClick={confirm} disabled={submitting} className="w-full">
              {submitting ? "Procesando…" : "Confirmar baja"}
            </Button>
          </>
        )}

        {state === "success" && (
          <p className="text-foreground">
            Listo. No vas a recibir más emails de nuestra parte.
          </p>
        )}

        {state === "used" && (
          <p className="text-muted-foreground">
            Este enlace ya fue usado. Tu suscripción está dada de baja.
          </p>
        )}

        {state === "invalid" && (
          <p className="text-muted-foreground">
            El enlace no es válido o expiró.
          </p>
        )}

        {state === "error" && (
          <p className="text-destructive">
            Ocurrió un error. Probá de nuevo en unos minutos.
          </p>
        )}
      </div>
    </div>
  );
}
