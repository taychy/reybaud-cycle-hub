import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Check, Eye } from "lucide-react";
import { DayTask, dayLabel, toISODate, weekDays } from "@/lib/adminAlerts";
import {
  dismissTask,
  getDismissed,
  isDismissed,
  restoreAll,
  taskKey,
} from "@/lib/dismissedTasks";
import { toast } from "@/hooks/use-toast";

interface Props {
  tasks: DayTask[];
  loading?: boolean;
}

const toneText: Record<string, string> = {
  danger: "text-destructive",
  warning: "text-yellow-500",
  info: "text-blue-500",
};

const toneBtn: Record<string, string> = {
  danger: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
  warning: "bg-primary text-primary-foreground hover:bg-primary/90",
  info: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
};

const toneRail: Record<string, string> = {
  danger: "border-l-destructive",
  warning: "border-l-primary",
  info: "border-l-border",
};

const DashboardTasksByDay = ({ tasks, loading }: Props) => {
  const navigate = useNavigate();
  const [version, setVersion] = useState(0);

  const { groups, hiddenCount } = useMemo(() => {
    const store = getDismissed();
    let hidden = 0;

    const visible = tasks.filter((t) => {
      if (isDismissed(taskKey(t.date, t.label), t.count, store)) {
        hidden += 1;
        return false;
      }
      return true;
    });

    const today = toISODate(new Date());
    const week = weekDays();
    const weekEnd = week[6];
    const tomorrow = toISODate(new Date(Date.now() + 86400000));

    const out: { key: string; title: string; sub?: string; items: DayTask[]; tone: string }[] = [];

    // El backlog se consolida por categoría (no tiene sentido una fila por día viejo)
    const overdueRaw = visible.filter((t) => t.date && t.date < today);
    const overdueMap = new Map<string, DayTask>();
    overdueRaw.forEach((t) => {
      const prev = overdueMap.get(t.label);
      if (prev) prev.count += t.count;
      else overdueMap.set(t.label, { ...t, hint: undefined });
    });
    const overdue = Array.from(overdueMap.values()).sort((a, b) => b.count - a.count);
    if (overdue.length) out.push({ key: "backlog", title: "Vencidas", sub: "Backlog", items: overdue, tone: "danger" });

    const days = week.filter((d) => d >= today);
    days.forEach((iso) => {
      const items = visible.filter((t) => t.date === iso);
      if (!items.length) return;
      const title = iso === today ? "Hoy" : iso === tomorrow ? "Mañana" : dayLabel(iso).split(" ")[0];
      out.push({
        key: iso,
        title,
        sub: dayLabel(iso),
        items,
        tone: iso === today ? "warning" : "info",
      });
    });

    const later = visible.filter((t) => !t.date || t.date > weekEnd);
    if (later.length) out.push({ key: "later", title: "Próximos días", sub: "Sin fecha / más adelante", items: later, tone: "info" });

    return { groups: out, hiddenCount: hidden };
  }, [tasks, version]);

  const handleDismiss = (t: DayTask, groupKey: string, days: number, texto: string) => {
    // En el backlog las tareas se consolidan por categoría: ocultamos todas las
    // fechas viejas de esa misma categoría.
    if (groupKey === "backlog") {
      const today = toISODate(new Date());
      tasks
        .filter((x) => x.date && x.date < today && x.label === t.label)
        .forEach((x) => dismissTask(taskKey(x.date, x.label), x.count, days));
    } else {
      dismissTask(taskKey(t.date, t.label), t.count, days);
    }
    setVersion((v) => v + 1);
    toast({
      title: "Tarea marcada como gestionada",
      description: `“${t.label}” se oculta ${texto}. Reaparece si surgen casos nuevos.`,
    });
  };

  return (
    <Card className="border-border">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs font-heading uppercase tracking-wider text-muted-foreground">Tareas por día</h2>
          {hiddenCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[11px] text-muted-foreground"
              onClick={() => {
                restoreAll();
                setVersion((v) => v + 1);
              }}
            >
              <Eye className="w-3 h-3 mr-1" /> Ver {hiddenCount} oculta{hiddenCount > 1 ? "s" : ""}
            </Button>
          )}
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin tareas pendientes. Todo al día.</p>
        ) : (
          <div className="space-y-3">
            {groups.map((g) => {
              const total = g.items.reduce((s, i) => s + i.count, 0);
              return (
                <div
                  key={g.key}
                  className={`flex flex-col sm:flex-row gap-3 rounded-lg border border-border/60 border-l-2 ${toneRail[g.tone]} bg-muted/20 p-3`}
                >
                  <div className="sm:w-32 shrink-0 space-y-1">
                    <p className="text-sm font-heading font-bold">{g.title}</p>
                    {g.sub && <p className="text-[11px] text-muted-foreground">{g.sub}</p>}
                    <Badge variant="outline" className="tabular-nums text-[10px]">{total}</Badge>
                  </div>

                  <div className="flex-1 min-w-0 space-y-1">
                    {g.items.map((t, i) => (
                      <div
                        key={`${g.key}-${i}`}
                        className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-muted/50 transition-colors"
                      >
                        <span className={`text-sm font-heading font-bold tabular-nums w-7 text-right ${toneText[t.tone]}`}>
                          {t.count}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm truncate">{t.label}</p>
                          {t.hint && <p className="text-[11px] text-muted-foreground truncate">{t.hint}</p>}
                        </div>
                        <Button
                          size="sm"
                          className={`h-7 px-3 text-xs shrink-0 ${toneBtn[t.tone]}`}
                          onClick={() => navigate(t.link)}
                        >
                          {t.cta}
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
                              title="Ya la gestioné"
                            >
                              <Check className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">
                              Ya la gestioné, ocultar…
                            </DropdownMenuLabel>
                            <DropdownMenuItem onClick={() => handleDismiss(t, g.key, 0, "hasta mañana")}>
                              Por hoy
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDismiss(t, g.key, 3, "por 3 días")}>
                              Por 3 días
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDismiss(t, g.key, 7, "por 7 días")}>
                              Por 7 días
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default DashboardTasksByDay;
