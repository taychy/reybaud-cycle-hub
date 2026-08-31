import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, CheckCircle2, MapPin, Camera, ChevronRight } from "lucide-react";
import ConfirmarClaseDialog from "./ConfirmarClaseDialog";
import { labelFecha, resumenPlan, toLocalIso } from "@/lib/coachAgenda";
import type { ProximaClase } from "@/hooks/useCoachHome";

export default function ProximaClaseCard({ clase, onChanged }: { clase: ProximaClase | null; onChanged: () => void }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  if (!clase) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="p-4">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium mb-1">Próxima clase</p>
          <p className="text-sm text-muted-foreground">No tenés clases en tu agenda semanal.</p>
        </CardContent>
      </Card>
    );
  }

  const esHoy = clase.fecha === toLocalIso(new Date());
  const lineas = resumenPlan(clase.plan?.descripcion, 3);

  return (
    <Card className="bg-card border-border">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Próxima clase</p>
          <CalendarDays className="w-4 h-4 text-muted-foreground" />
        </div>

        <div className="space-y-1.5">
          <p className="text-base font-heading font-semibold text-foreground capitalize">
            {labelFecha(clase.fecha)} · {clase.hora_inicio?.slice(0, 5)}–{clase.hora_fin?.slice(0, 5)}
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            {clase.grupo && <Badge variant="secondary" className="text-[10px]">{clase.grupo}</Badge>}
            {clase.sede_nombre && (
              <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                <MapPin className="w-3 h-3" /> {clase.sede_nombre}
              </span>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-border/60 bg-background/50 p-3">
          {clase.plan ? (
            <>
              <p className="text-[13px] font-medium text-foreground">
                {clase.plan.titulo || "Plan del día"}
                {clase.plan.tipo && <span className="text-muted-foreground font-normal capitalize"> · {clase.plan.tipo}</span>}
              </p>
              {lineas.map((l, i) => (
                <p key={i} className="text-[12px] text-muted-foreground mt-1 line-clamp-1">{l}</p>
              ))}
            </>
          ) : (
            <p className="text-[12px] text-muted-foreground">Sin plan cargado para esa fecha.</p>
          )}
          <button
            onClick={() => navigate("/coach/entrenamientos")}
            className="mt-2 text-[12px] text-primary inline-flex items-center gap-1 hover:underline"
          >
            Ver plan completo <ChevronRight className="w-3 h-3" />
          </button>
        </div>

        {clase.confirmada ? (
          <Badge variant="outline" className="gap-1">
            <CheckCircle2 className="w-3 h-3 text-green-500" /> Clase confirmada
          </Badge>
        ) : (
          <Button className="w-full h-11" disabled={!esHoy} onClick={() => setOpen(true)}>
            <Camera className="w-4 h-4 mr-2" />
            {esHoy ? "Di la clase" : "Se confirma el día de la clase"}
          </Button>
        )}
      </CardContent>

      <ConfirmarClaseDialog
        open={open}
        onOpenChange={setOpen}
        slot={{
          id: clase.agenda_id,
          coach_id: "",
          sede_id: clase.sede_id,
          honorario_id: clase.honorario_id,
          hora_inicio: clase.hora_inicio,
          hora_fin: clase.hora_fin,
          grupo: clase.grupo,
        } as any}
        fecha={clase.fecha}
        onConfirmed={onChanged}
      />
    </Card>
  );
}
