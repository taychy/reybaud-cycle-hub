import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CheckCircle2, Clock, XCircle, AlertCircle, CreditCard, Banknote } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import logo from "@/assets/logo.png";

const TurneraConfirmacion = () => {
  const [params] = useSearchParams();
  const reservationId = params.get("id");
  const urlStatus = params.get("status") || "unknown";

  const [estado, setEstado] = useState<string | null>(null);
  const [reserva, setReserva] = useState<any>(null);
  const [servicio, setServicio] = useState<any>(null);
  const [attempts, setAttempts] = useState(0);
  const [retrying, setRetrying] = useState<"mp" | "transfer" | null>(null);

  useEffect(() => {
    if (!reservationId) return;
    let cancelled = false;
    const MAX = 15;
    const INT = 1500;

    const check = async (n: number) => {
      const { data: r } = await supabase
        .from("reservas_turnera")
        .select("id, nombre, fecha, hora_inicio, hora_fin, pago_estado, servicio_id, upload_token")
        .eq("id", reservationId)
        .maybeSingle();
      if (cancelled) return;
      if (r) {
        setReserva(r);
        setEstado((r.pago_estado as string) || "pendiente");
        if (!servicio && r.servicio_id) {
          const { data: s } = await supabase
            .from("servicios_turnera")
            .select("nombre, politica_cancelacion")
            .eq("id", r.servicio_id)
            .maybeSingle();
          if (!cancelled && s) setServicio(s);
        }
        // Estados finales — dejar de pollear
        if (["aprobado", "rechazado", "reembolsado", "expirado", "comprobante_subido"].includes(String(r.pago_estado))) return;
        // Si MP devolvió failure/pending y la DB sigue en pendiente_mp → dejar de pollear, mostrar opciones
        if ((urlStatus === "failure" || urlStatus === "pending") && r.pago_estado === "pendiente_mp") return;
      }
      if (n < MAX && urlStatus !== "failure") {
        setTimeout(() => { setAttempts(n + 1); check(n + 1); }, INT);
      }
    };
    check(0);
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reservationId]);

  // Determinar si el usuario volvió de MP sin haber pagado (reserva sigue pendiente).
  // En ese caso mostramos re-selección de método en lugar de "Pago rechazado".
  const abandonoMp =
    reservationId &&
    reserva &&
    (urlStatus === "failure" || urlStatus === "pending" || urlStatus === "unknown") &&
    ["pendiente", "pendiente_mp"].includes(String(estado));

  const rechazadoReal = estado === "rechazado";

  const retryMercadoPago = async () => {
    if (!reservationId) return;
    setRetrying("mp");
    try {
      const { data, error } = await supabase.functions.invoke("create-turnera-mp-preference", {
        body: { reservation_id: reservationId },
      });
      if (error) throw error;
      const initPoint = (data as any)?.init_point || (data as any)?.sandbox_init_point;
      if (!initPoint) throw new Error("No se pudo generar el link de pago.");
      window.location.href = initPoint;
    } catch (e: any) {
      toast({ title: "No pudimos abrir Mercado Pago", description: e.message || String(e), variant: "destructive" });
      setRetrying(null);
    }
  };

  const switchToTransferencia = async () => {
    if (!reservationId) return;
    setRetrying("transfer");
    try {
      const { data, error } = await supabase.functions.invoke("create-turnera-transferencia", {
        body: { reservation_id: reservationId },
      });
      if (error) throw error;
      const token = (data as any)?.upload_token;
      if (!token) throw new Error("No se pudo generar el link de transferencia.");
      window.location.href = `/reservar/transferencia/${reservationId}?token=${token}`;
    } catch (e: any) {
      toast({ title: "No pudimos preparar la transferencia", description: e.message || String(e), variant: "destructive" });
      setRetrying(null);
    }
  };

  const renderIcon = () => {
    if (rechazadoReal) return <XCircle className="w-16 h-16 text-destructive" />;
    if (abandonoMp) return <AlertCircle className="w-16 h-16 text-amber-500" />;
    if (estado === "aprobado") return <CheckCircle2 className="w-16 h-16 text-emerald-500" />;
    return <Clock className="w-16 h-16 text-primary animate-pulse" />;
  };

  const titulo = (() => {
    if (rechazadoReal) return "Pago rechazado";
    if (abandonoMp) return "No completaste el pago";
    if (estado === "aprobado") return "¡Reserva confirmada!";
    return "Confirmando tu pago…";
  })();

  const descripcion = (() => {
    if (rechazadoReal) {
      return "Tu pago fue rechazado por Mercado Pago. Podés intentar de nuevo con otro método sin perder la reserva.";
    }
    if (abandonoMp) {
      return "Volviste sin completar el pago. La reserva sigue apartada por unos minutos — elegí cómo querés pagar:";
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
          </div>
        )}

        {(abandonoMp || rechazadoReal) && (
          <div className="space-y-3 pt-2">
            <Button
              variant="gold"
              size="lg"
              className="w-full gap-2"
              disabled={retrying !== null}
              onClick={retryMercadoPago}
            >
              <CreditCard className="w-4 h-4" />
              {retrying === "mp" ? "Abriendo Mercado Pago…" : "Reintentar Mercado Pago"}
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="w-full gap-2"
              disabled={retrying !== null}
              onClick={switchToTransferencia}
            >
              <Banknote className="w-4 h-4" />
              {retrying === "transfer" ? "Preparando…" : "Pagar por transferencia"}
            </Button>
          </div>
        )}

        {!abandonoMp && !rechazadoReal && estado === "pendiente" && attempts >= 12 && (
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
