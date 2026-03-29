import { Card, CardContent } from "@/components/ui/card";
import { Calendar, Dumbbell, Users, Eye, EyeOff } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type Entrenamiento = Tables<"entrenamientos">;

const TYPE_COLORS: Record<string, string> = {
  ruta: "text-green-400",
  rodillo: "text-blue-400",
  gimnasio: "text-orange-400",
  tecnica: "text-purple-400",
};

const SummaryCards = ({ entrenamientos }: { entrenamientos: Entrenamiento[] }) => {
  const totalDays = new Set(entrenamientos.map(e => e.fecha)).size;
  const totalGroups = new Set(entrenamientos.map(e => e.grupo)).size;
  const visible = entrenamientos.filter(e => e.visible).length;
  const hidden = entrenamientos.filter(e => !e.visible).length;

  const byType: Record<string, number> = {};
  entrenamientos.forEach(e => {
    const t = e.tipo || "otro";
    byType[t] = (byType[t] || 0) + 1;
  });

  const metrics = [
    { label: "Días", value: totalDays, icon: Calendar },
    { label: "Total", value: entrenamientos.length, icon: Dumbbell },
    { label: "Grupos", value: totalGroups, icon: Users },
    { label: "Visibles", value: visible, icon: Eye },
    { label: "Ocultos", value: hidden, icon: EyeOff },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
        {metrics.map(m => (
          <Card key={m.label} className="bg-card border-border">
            <CardContent className="p-3 text-center">
              <m.icon className="w-4 h-4 text-muted-foreground mx-auto mb-1" />
              <p className="text-xl font-heading font-bold text-foreground">{m.value}</p>
              <p className="text-[10px] text-muted-foreground">{m.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      {Object.keys(byType).length > 0 && (
        <div className="flex gap-3 text-xs">
          {Object.entries(byType).map(([tipo, count]) => (
            <span key={tipo} className={`${TYPE_COLORS[tipo] || "text-muted-foreground"} capitalize`}>
              {tipo}: {count}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

export default SummaryCards;
