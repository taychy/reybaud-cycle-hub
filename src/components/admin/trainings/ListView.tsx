import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, MoreVertical, Pencil, Trash2, Eye, EyeOff } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { Tables } from "@/integrations/supabase/types";

type Entrenamiento = Tables<"entrenamientos">;

const TYPE_COLORS: Record<string, string> = {
  ruta: "bg-green-900/30 text-green-400",
  rodillo: "bg-blue-900/30 text-blue-400",
  gimnasio: "bg-orange-900/30 text-orange-400",
  tecnica: "bg-purple-900/30 text-purple-400",
};

interface ListViewProps {
  entrenamientos: Entrenamiento[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onEdit: (ent: Entrenamiento) => void;
  onDelete: (id: string) => void;
  onToggleVisibility: (ent: Entrenamiento) => void;
}

interface WeekGroup {
  weekNum: number;
  days: { date: string; label: string; entrenamientos: Entrenamiento[] }[];
}

const ListView = ({ entrenamientos, selectedIds, onToggleSelect, onEdit, onDelete, onToggleVisibility }: ListViewProps) => {
  const [expandedWeeks, setExpandedWeeks] = useState<Set<number>>(() => new Set([1, 2, 3, 4, 5]));

  const weeks = useMemo<WeekGroup[]>(() => {
    const dayMap = new Map<string, Entrenamiento[]>();
    entrenamientos.forEach(e => {
      if (!dayMap.has(e.fecha)) dayMap.set(e.fecha, []);
      dayMap.get(e.fecha)!.push(e);
    });

    const weekMap = new Map<number, { date: string; label: string; entrenamientos: Entrenamiento[] }[]>();
    Array.from(dayMap.entries()).sort(([a], [b]) => a.localeCompare(b)).forEach(([date, ents]) => {
      const dayNum = parseInt(date.split("-")[2]);
      const weekNum = Math.ceil(dayNum / 7);
      if (!weekMap.has(weekNum)) weekMap.set(weekNum, []);
      const dateObj = new Date(date + "T12:00:00");
      weekMap.get(weekNum)!.push({
        date,
        label: dateObj.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "short" }),
        entrenamientos: ents,
      });
    });

    return Array.from(weekMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([weekNum, days]) => ({ weekNum, days }));
  }, [entrenamientos]);

  const toggleWeek = (weekNum: number) => {
    setExpandedWeeks(prev => {
      const next = new Set(prev);
      if (next.has(weekNum)) next.delete(weekNum); else next.add(weekNum);
      return next;
    });
  };

  if (entrenamientos.length === 0) {
    return <p className="text-center py-8 text-muted-foreground text-sm">No hay entrenamientos con los filtros seleccionados</p>;
  }

  return (
    <div className="space-y-3">
      {weeks.map(week => (
        <div key={week.weekNum} className="rounded-lg border border-border overflow-hidden">
          <button
            onClick={() => toggleWeek(week.weekNum)}
            className="w-full flex items-center gap-2 p-3 bg-secondary/50 hover:bg-secondary transition-colors text-left"
          >
            {expandedWeeks.has(week.weekNum)
              ? <ChevronDown className="w-4 h-4 text-muted-foreground" />
              : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
            <span className="font-heading font-semibold text-sm text-foreground">Semana {week.weekNum}</span>
            <span className="text-xs text-muted-foreground ml-auto">
              {week.days.reduce((sum, d) => sum + d.entrenamientos.length, 0)} entrenamientos
            </span>
          </button>

          {expandedWeeks.has(week.weekNum) && (
            <div className="divide-y divide-border/50">
              {week.days.map(day => (
                <div key={day.date} className="px-3 py-2">
                  <p className="text-xs font-medium text-primary capitalize mb-2">{day.label}</p>
                  <div className="space-y-1 pl-2">
                    {day.entrenamientos.map(ent => (
                      <div key={ent.id} className={`flex items-center gap-2 p-2 rounded-md hover:bg-secondary/50 transition-colors ${selectedIds.has(ent.id) ? "bg-primary/10" : ""}`}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(ent.id)}
                          onChange={() => onToggleSelect(ent.id)}
                          className="rounded border-border shrink-0"
                        />
                        <Badge variant="secondary" className="text-[10px] font-mono shrink-0 w-8 justify-center">{ent.grupo}</Badge>
                        <span className="text-sm text-foreground truncate flex-1">{ent.titulo}</span>
                        {ent.tipo && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${TYPE_COLORS[ent.tipo] || ""}`}>
                            {ent.tipo}
                          </span>
                        )}
                        <span className={`w-2 h-2 rounded-full shrink-0 ${ent.visible ? "bg-green-500" : "bg-muted-foreground/40"}`} />
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0">
                              <MoreVertical className="w-3 h-3" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => onEdit(ent)}>
                              <Pencil className="w-3 h-3 mr-2" /> Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => onToggleVisibility(ent)}>
                              {ent.visible ? <EyeOff className="w-3 h-3 mr-2" /> : <Eye className="w-3 h-3 mr-2" />}
                              {ent.visible ? "Ocultar" : "Mostrar"}
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-destructive" onClick={() => onDelete(ent.id)}>
                              <Trash2 className="w-3 h-3 mr-2" /> Eliminar
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default ListView;
