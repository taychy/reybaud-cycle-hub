import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, ChevronDown, ChevronRight } from "lucide-react";
import {
  DatedAlertItem,
  dayLabel,
  toISODate,
  weekDays,
} from "@/lib/adminAlerts";

interface Props {
  items: DatedAlertItem[];
  loading?: boolean;
}

const toneDot: Record<string, string> = {
  danger: "bg-destructive",
  warning: "bg-yellow-500",
  info: "bg-blue-500",
};

const WeeklyPendingsPanel = ({ items, loading }: Props) => {
  const navigate = useNavigate();
  const [openDay, setOpenDay] = useState<string | null>(toISODate(new Date()));

  const { days, overdue, todayIso, stats, urgent } = useMemo(() => {
    const todayIso = toISODate(new Date());
    const week = weekDays();
    const overdue = items.filter((i) => i.date < todayIso);
    const days = week.map((iso) => ({
      iso,
      items: items.filter((i) => i.date === iso),
    }));
    const hoy = items.filter((i) => i.date === todayIso).length;
    const semana = items.filter((i) => i.date >= todayIso && i.date <= week[6]).length;
    const stats = { vencidas: overdue.length, hoy, semana };
    const urgent = [...items]
      .filter((i) => i.tone === "danger" || i.date <= todayIso)
      .sort((a, b) => (a.date < b.date ? -1 : 1))
      .slice(0, 3);
    return { days, overdue, todayIso, stats, urgent };
  }, [items]);


  const renderItems = (list: DatedAlertItem[]) => (
    <div className="space-y-1 pl-3 pt-1">
      {list.slice(0, 8).map((it, i) => (
        <button
          key={i}
          onClick={() => navigate(it.link)}
          className="w-full text-left flex items-start gap-2 rounded px-2 py-1 hover:bg-muted/50 transition-colors"
        >
          <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${toneDot[it.tone]}`} />
          <span className="min-w-0">
            <span className="block text-xs truncate">{it.label}</span>
            <span className="block text-[10px] text-muted-foreground truncate">{it.kind}</span>
          </span>
        </button>
      ))}
      {list.length > 8 && (
        <p className="text-[10px] text-muted-foreground pl-2">+{list.length - 8} más…</p>
      )}
    </div>
  );

  return (
    <Card className="border-border lg:sticky lg:top-4">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-primary" />
          <h2 className="text-xs font-heading uppercase tracking-wider">Pendientes de la semana</h2>
        </div>

        {loading ? (
          <p className="text-xs text-muted-foreground">Cargando…</p>
        ) : (
          <>
            {overdue.length > 0 && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10">
                <button
                  onClick={() => setOpenDay(openDay === "overdue" ? null : "overdue")}
                  className="w-full flex items-center justify-between px-3 py-2"
                >
                  <span className="flex items-center gap-2 text-xs font-medium text-destructive">
                    {openDay === "overdue" ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                    Vencidas (backlog)
                  </span>
                  <Badge variant="destructive" className="tabular-nums">{overdue.length}</Badge>
                </button>
                {openDay === "overdue" && <div className="pb-2">{renderItems(overdue)}</div>}
              </div>
            )}

            <div className="space-y-1">
              {days.map((d) => {
                const isToday = d.iso === todayIso;
                const isOpen = openDay === d.iso;
                return (
                  <div
                    key={d.iso}
                    className={`rounded-md border ${isToday ? "border-primary/50 bg-primary/5" : "border-border/60"}`}
                  >
                    <button
                      onClick={() => setOpenDay(isOpen ? null : d.iso)}
                      className="w-full flex items-center justify-between px-3 py-2"
                      disabled={d.items.length === 0}
                    >
                      <span className="flex items-center gap-2 text-xs">
                        {d.items.length > 0 ? (
                          isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />
                        ) : (
                          <span className="w-3" />
                        )}
                        <span className={isToday ? "font-bold" : ""}>{dayLabel(d.iso)}</span>
                        {isToday && <span className="text-[10px] text-primary uppercase">hoy</span>}
                      </span>
                      {d.items.length > 0 ? (
                        <Badge variant="outline" className="tabular-nums">{d.items.length}</Badge>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">—</span>
                      )}
                    </button>
                    {isOpen && d.items.length > 0 && <div className="pb-2">{renderItems(d.items)}</div>}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default WeeklyPendingsPanel;
