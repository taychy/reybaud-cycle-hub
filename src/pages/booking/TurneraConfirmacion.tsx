import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { CheckCircle2, Clock, XCircle, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import logo from "@/assets/logo.png";

type PagoEstado = "pendiente" | "aprobado" | "rechazado" | "reembolsado" | null;

const TurneraConfirmacion = () => {
  const [params] = useSearchParams();
  const reservationId = params.get("id");
  const urlStatus = params.get("status") || "unknown";

  const [estado, setEstado] = useState<PagoEstado>(null);
  const [reserva, setReserva] = useState<any>(null);
  const [servicio, setServicio] = useState<any>(null);
  const [attempts, setAttempts] = useState(0);

  useEffect(() => {
    if (!reservationId) return;
    let cancelled = false;
    const MAX = 15;
    const INT = 1500;

    const check = async (n: number) => {
      const { data: r } = await supabase
        .from("reservas_turnera")
        .select("id, nombre, fecha, hora_inicio, hora_fin, pago_estado, servicio_id")
        .eq("id", reservationId)
        .maybeSingle();
      if (cancelled) return;
      if (r) {
        setReserva(r);
        setEstado((r.pago_estado as PagoEstado) || "pendiente");
        if (!servicio && r.servicio_id) {
          const { data: s } = await supabase
            .from("servicios_turnera")
            .select("nombre, politica_cancelacion")
            .eq("id", r.servicio_id)
            .maybeSingle();
          if (!cancelled && s) setServicio(s);
        }
        // Stop polling if resolved
        if (r.pago_estado === "aprobado" || r.pago_estado === "rechazado" || r.pago_estado === "reembolsado") return;
      }
      if (n < MAX && urlStatus !== "failure") {
        setTimeout(() => { setAttempts(n + 1); check(n + 1); }, INT);
      }
    };
    check(0);
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reservationId]);

  const renderIcon = () => {
    if (urlStatus === "failure" || estado === "rechazado") return <XCircle className="w-16 h-16 text-destructive" />;
    if (estado === "aprobado") return <CheckCircle2 className="w-16 h-16 text-emerald-500" />;
    return <Clock className="w-16 h-16 text-primary animate-pulse" />;
  };

  const titulo = (() => {
    if (urlStatus === "failure" || estado === "rechazado") return "Pago rechazado";
    if (estado === "aprobado") return "¡Reserva confirmada!";
    return "Confirmando tu pago…";
  })();

  const descripcion = (() => {
    if (urlStatus === "failure" || estado === "rechazado") {
      return "Tu pago fue rechazado por Mercado Pago. La reserva quedó cancelada. Podés intentar reservar nuevamente.";
    }
    if (estado === "aprobado") {
      return `Recibimos tu pago. Te enviamos un email con los detalles de la reserva${reserva?.nombre ? `, ${reserva.nombre}` : ""}.`;
    }
    return "Estamos validando tu pago con Mercado Pago. Esto puede tardar unos segundos.";
  })();

  const fmtFecha = (iso?: string) => {
    if (!iso) return "";
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md text-center space-y-6">
        <img src={logo} alt="Reybaud" className="w-12 h-12 mx-auto opacity-80" />
        <div className="flex justify-center">{renderIcon()}</div>
        <div className="space-y-2">
          <h1 className="text-2xl font-heading font-bold text-foreground">{titulo}</h1>
          <p className="text-sm text-muted-foreground">{descripcion}</p>
        </div>

        {reserva && (
          <div className="bg-card border border-border rounded-xl p-4 text-left space-y-2 text-sm">
            {servicio?.nombre && (
              <div>
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Servicio</div>
                <div className="font-medium text-foreground">{servicio.nombre}</div>
              </div>
            )}
            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Fecha y hora</div>
              <div className="text-foreground capitalize">
                {fmtFecha(reserva.fecha)} · {(reserva.hora_inicio || "").substring(0, 5)} – {(reserva.hora_fin || "").substring(0, 5)} hs
              </div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Estado de pago</div>
              <div className="text-foreground capitalize">{estado || "—"}</div>
            </div>
          </div>
        )}

        {estado === "pendiente" && attempts >= 12 && (
          <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/40 rounded-lg p-3 text-left">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>El pago está tardando más de lo normal. Si ya lo aprobaste en Mercado Pago, vas a recibir el email cuando se confirme.</span>
          </div>
        )}

        <div className="pt-4">
          <a href="/reservar" className="text-sm text-primary underline-offset-2 hover:underline">
            Volver a la turnera
          </a>
        </div>
      </div>
    </div>
  );
};

export default TurneraConfirmacion;
