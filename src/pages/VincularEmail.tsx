import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import logo from "@/assets/logo.png";

const VincularEmail = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = (params.get("token") || "").replace(/[^a-f0-9]/gi, "");
  const [loading, setLoading] = useState(true);
  const [ok, setOk] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [detalle, setDetalle] = useState<{ principal?: string; vinculado?: string; nombre?: string }>({});

  useEffect(() => {
    const run = async () => {
      if (!token) {
        setMensaje("Enlace inválido");
        setLoading(false);
        return;
      }
      const { data, error } = await supabase.rpc("confirm_alumno_email_link", { p_token: token });
      const row = (data as any[] | null)?.[0];
      if (error || !row) {
        setMensaje(error?.message || "No pudimos procesar el enlace");
      } else {
        setOk(!!row.ok);
        setMensaje(row.mensaje);
        setDetalle({ principal: row.email_principal, vinculado: row.email_vinculado, nombre: row.nombre_completo });
      }
      setLoading(false);
    };
    run();
  }, [token]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-6 text-center animate-fade-in">
        <img src={logo} alt="Ciclismo Reybaud" className="w-16 h-16 mx-auto" />
        <div className="glass-card rounded-lg p-6 space-y-4">
          {loading ? (
            <>
              <Loader2 className="w-10 h-10 mx-auto animate-spin text-primary" />
              <p className="text-muted-foreground text-sm">Verificando el enlace...</p>
            </>
          ) : ok ? (
            <>
              <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-500" />
              <h1 className="text-xl font-heading font-bold uppercase tracking-wide text-foreground">
                Email vinculado
              </h1>
              <p className="text-sm text-muted-foreground">{mensaje}</p>
              {detalle.vinculado && (
                <div className="text-sm text-foreground bg-secondary rounded-md p-3 space-y-1">
                  <p>
                    <span className="text-muted-foreground">Ficha:</span> {detalle.nombre}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Email principal:</span> {detalle.principal}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Email vinculado:</span> {detalle.vinculado}
                  </p>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Tus suscripciones, pagos y cuenta corriente siguen en la misma ficha.
              </p>
            </>
          ) : (
            <>
              <XCircle className="w-12 h-12 mx-auto text-destructive" />
              <h1 className="text-xl font-heading font-bold uppercase tracking-wide text-foreground">
                No pudimos vincular
              </h1>
              <p className="text-sm text-muted-foreground">{mensaje}</p>
            </>
          )}
          <Button variant="gold" className="w-full" onClick={() => navigate("/")}>
            Ir al inicio
          </Button>
        </div>
      </div>
    </div>
  );
};

export default VincularEmail;
