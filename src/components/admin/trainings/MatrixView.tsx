import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import type { Tables } from "@/integrations/supabase/types";

type Entrenamiento = Tables<"entrenamientos">;

const TYPE_COLORS: Record<string, string> = {
  ruta: "bg-green-500",
  rodillo: "bg-blue-500",
  gimnasio: "bg-orange-500",
  tecnica: "bg-purple-500",
};

interface MatrixViewProps {
  entrenamientos: Entrenamiento[];
  allEntrenamientos: Entrenamiento[];
  month: string;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onCellClick: (ent: Entrenamiento) => void;
}

const MatrixView = ({ entrenamientos, allEntrenamientos, month, selectedIds, onToggleSelect, onCellClick }: MatrixViewProps) => {
  const groups = useMemo(() => {
    const g = new Set(allEntrenamientos.map(e => e.grupo as string));
    const order = ["G1", "G2", "G3", "G4", "Principiante"];
    const active = order.filter(o => g.has(o));
    return active.length > 0 ? active : ["G1", "G2", "G3", "G4"];
  }, [allEntrenamientos]);

  const allDates = useMemo(() => {
    const [year, m] = month.split("-").map(Number);
    const daysInMonth = new Date(year, m, 0).getDate();
    return Array.from({ length: daysInMonth }, (_, i) => {
      const day = String(i + 1).padStart(2, "0");
      return `${month}-${day}`;
    });
  }, [month]);

  const map = useMemo(() => {
    const m = new Map<string, Entrenamiento>();
    entrenamientos.forEach(e => m.set(`${e.fecha}-${e.grupo}`, e));
    return m;
  }, [entrenamientos]);

  const formatDay = (dateStr: string) => {
    const date = new Date(dateStr + "T12:00:00");
    const dayName = date.toLocaleDateString("es-AR", { weekday: "short" });
    const dayNum = dateStr.split("-")[2];
    return { dayName, dayNum };
  };

  const isWeekend = (dateStr: string) => {
    const date = new Date(dateStr + "T12:00:00");
    const day = date.getDay();
    return day === 0 || day === 6;
  };

  return (
    <ScrollArea className="w-full">
      <div className="min-w-[600px]">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-background p-2 text-left text-xs font-medium text-muted-foreground border-b border-r border-border w-24">
                Fecha
              </th>
              {groups.map(g => (
                <th key={g} className="p-2 text-center text-xs font-medium text-muted-foreground border-b border-border min-w-[130px]">
                  <Badge variant="secondary" className="text-xs font-mono">{g}</Badge>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {allDates.map(date => {
              const { dayName, dayNum } = formatDay(date);
              const weekend = isWeekend(date);
              const hasAny = groups.some(g => map.has(`${date}-${g}`));

              return (
                <tr key={date} className={`border-b border-border/50 ${weekend ? "bg-secondary/30" : ""} ${!hasAny ? "opacity-40" : ""}`}>
                  <td className="sticky left-0 z-10 bg-background p-2 text-xs border-r border-border">
                    <div className="flex items-center gap-1.5">
                      <span className="text-muted-foreground capitalize w-8">{dayName}</span>
                      <span className="font-mono font-medium text-foreground">{dayNum}</span>
                    </div>
                  </td>
                  {groups.map(g => {
                    const ent = map.get(`${date}-${g}`);
                    if (!ent) return <td key={g} className="p-1.5 border-r border-border/30" />;

                    const isSelected = selectedIds.has(ent.id);
                    return (
                      <td key={g} className={`p-1 border-r border-border/30 ${isSelected ? "bg-primary/10" : ""}`}>
                        <div className="flex items-start gap-1">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => onToggleSelect(ent.id)}
                            className="mt-1 shrink-0 rounded border-border"
                          />
                          <div
                            className="flex-1 cursor-pointer rounded px-1.5 py-1 hover:bg-secondary/50 transition-colors min-w-0"
                            onClick={() => onCellClick(ent)}
                          >
                            <p className="text-xs truncate text-foreground leading-tight">{ent.titulo}</p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              {ent.tipo && (
                                <span className={`w-2 h-2 rounded-full shrink-0 ${TYPE_COLORS[ent.tipo] || "bg-muted-foreground"}`} />
                              )}
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${ent.visible ? "bg-green-500" : "bg-muted-foreground/40"}`} />
                            </div>
                          </div>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  );
};

export default MatrixView;
