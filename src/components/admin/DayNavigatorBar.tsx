import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";

interface Props {
  label: string;
  selected: string; // YYYY-MM-DD
  minISO: string;
  todayISO: string;
  canGoPrev: boolean;
  canGoNext: boolean;
  isToday: boolean;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onPick: (iso: string) => void;
  /** Optional right-side content, e.g. a pending-count badge */
  rightContent?: React.ReactNode;
}

const DayNavigatorBar = ({
  label, selected, minISO, todayISO,
  canGoPrev, canGoNext, isToday,
  onPrev, onNext, onToday, onPick, rightContent,
}: Props) => {
  return (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" className="h-9 w-9" onClick={onPrev} disabled={!canGoPrev} title="Día anterior">
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <div className="min-w-[180px] text-center">
          <p className="text-sm font-heading font-bold uppercase tracking-wider">{label}</p>
          {!isToday && (
            <button onClick={onToday} className="text-[10px] text-primary hover:underline">
              Volver a hoy
            </button>
          )}
          {isToday && <p className="text-[10px] text-muted-foreground">Hoy</p>}
        </div>
        <Button variant="outline" size="icon" className="h-9 w-9" onClick={onNext} disabled={!canGoNext} title="Día siguiente">
          <ChevronRight className="w-4 h-4" />
        </Button>
        <div className="relative ml-1">
          <CalendarDays className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input
            type="date"
            value={selected}
            min={minISO}
            max={todayISO}
            onChange={(e) => e.target.value && onPick(e.target.value)}
            className="h-9 text-sm w-[160px] pl-8"
          />
        </div>
      </div>
      {rightContent}
    </div>
  );
};

export default DayNavigatorBar;
