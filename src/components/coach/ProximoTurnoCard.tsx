import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CalendarClock, MapPin, User, ChevronRight } from "lucide-react";
import { labelFecha } from "@/lib/coachAgenda";
import type { ProximoTurno } from "@/hooks/useCoachHome";

export default function ProximoTurnoCard({ turno }: { turno: ProximoTurno | null }) {
  const navigate = useNavigate();

  return (
    <Card
      className="bg-card border-border cursor-pointer hover:border-primary/40 transition"
      onClick={() => navigate("/coach/agenda")}
    >
      <CardContent className="p-4 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Próximo turno</p>
          <CalendarClock className="w-4 h-4 text-muted-foreground" />
        </div>

        {turno ? (
          <>
            <p className="text-base font-heading font-semibold text-foreground capitalize">
              {labelFecha(turno.fecha)} · {turno.hora_inicio?.slice(0, 5)}–{turno.hora_fin?.slice(0, 5)}
            </p>
            <p className="text-[13px] text-foreground">{turno.servicio}</p>
            <p className="text-[12px] text-muted-foreground flex items-center gap-1">
              <User className="w-3 h-3" /> {turno.alumno}
            </p>
            {turno.sede_nombre && (
              <p className="text-[12px] text-muted-foreground flex items-center gap-1">
                <MapPin className="w-3 h-3" /> {turno.sede_nombre}
              </p>
            )}
            {turno.pago_estado === "aprobado" && (
              <Badge variant="outline" className="text-[10px]">Pagado</Badge>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No tenés turnos agendados.</p>
        )}

        <span className="text-[12px] text-primary inline-flex items-center gap-1">
          Ver mi agenda y horarios <ChevronRight className="w-3 h-3" />
        </span>
      </CardContent>
    </Card>
  );
}
