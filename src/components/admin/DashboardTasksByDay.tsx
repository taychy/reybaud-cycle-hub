import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DayTask, dayLabel, toISODate, weekDays } from "@/lib/adminAlerts";

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

  const groups = useMemo(() => {
    const today = toISODate(new Date());
    const week = weekDays();
    const weekEnd = week[6];
    const tomorrow = toISODate(new Date(Date.now() + 86400000));

    const out: { key: string; title: string; sub?: string; items: DayTask[]; tone: string }[] = [];

    // El backlog se consolida por categoría (no tiene sentido una fila por día viejo)
    const overdueRaw = tasks.filter((t) => t.date && t.date < today);
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
      const items = tasks.filter((t) => t.date === iso);
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

    const later = tasks.filter((t) => !t.date || t.date > weekEnd);
    if (later.length) out.push({ key: "later", title: "Próximos días", sub: "Sin fecha / más adelante", items: later, tone: "info" });

    return out;
  }, [tasks]);

  return (
    <Card className="border-border">
      <CardContent className="p-4 space-y-4">
        <h2 className="text-xs font-heading uppercase tracking-wider text-muted-foreground">Tareas por día</h2>

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
