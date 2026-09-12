import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft, CalendarDays, AlertCircle } from "lucide-react";
import { formatPrice } from "@/lib/currency";
import { optionLabel, type ReingresoOption } from "@/lib/reingreso";

interface Props {
  options: ReingresoOption[];
  planName: string;
  precioFinal: number;
  moneda: string;
  ultimaCobertura?: string | null;
  onSelect: (option: ReingresoOption) => void;
  onBack: () => void;
  disabled?: boolean;
}

const fmt = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

const ReingresoPeriodStep = ({
  options,
  planName,
  precioFinal,
  moneda,
  ultimaCobertura,
  onSelect,
  onBack,
  disabled,
}: Props) => (
  <div className="space-y-4">
    <div className="space-y-1.5">
      <h2 className="text-lg font-heading font-bold uppercase tracking-wider text-foreground">
        ¿Qué mensualidad querés pagar?
      </h2>
      <p className="text-sm text-muted-foreground">
        Como venís de un período sin actividad, elegís vos el mes que estás abonando.
        {ultimaCobertura ? ` Tu última mensualidad llegó hasta el ${fmt(ultimaCobertura)}.` : ""}
      </p>
    </div>

    <div className="space-y-3">
      {options.map((option) => (
        <Card
          key={option.fechaInicio}
          className="p-4 border-border/60 hover:border-primary/60 transition-colors cursor-pointer"
          onClick={() => !disabled && onSelect(option)}
        >
          <div className="flex items-start gap-3">
            <CalendarDays className="w-5 h-5 text-primary mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-foreground">{optionLabel(option)}</p>
              <p className="text-sm text-muted-foreground">
                {planName} · {formatPrice(option.monto ?? precioFinal, moneda)}
              </p>
              {option.esDeudaExistente && (
                <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-amber-500">
                  <AlertCircle className="w-3.5 h-3.5" />
                  Ya tenés esta mensualidad pendiente: al pagarla se salda.
                </p>
              )}
            </div>
            <Button size="sm" disabled={disabled} onClick={(e) => { e.stopPropagation(); onSelect(option); }}>
              Elegir
            </Button>
          </div>
        </Card>
      ))}
    </div>

    <Button variant="ghost" className="w-full" onClick={onBack} disabled={disabled}>
      <ArrowLeft className="w-4 h-4 mr-1.5" />
      Volver
    </Button>
  </div>
);

export default ReingresoPeriodStep;
