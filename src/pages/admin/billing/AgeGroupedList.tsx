import { ReactNode, useState } from "react";
import { ChevronDown, Clock, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { AGE_BUCKETS, AgeBucket, groupByAge } from "./ageBuckets";

interface Props<T> {
  items: T[];
  getDate: (item: T) => string | null | undefined;
  renderItem: (item: T) => ReactNode;
  emptyMessage?: string;
}

const TONE_CLASSES: Record<AgeBucket, { icon: ReactNode; header: string; count: string }> = {
  current: {
    icon: <Clock className="w-4 h-4 text-primary" />,
    header: "text-primary",
    count: "text-muted-foreground",
  },
  mid: {
    icon: <Clock className="w-4 h-4 text-amber-500" />,
    header: "text-amber-500",
    count: "text-muted-foreground",
  },
  overdue: {
    icon: <AlertTriangle className="w-4 h-4 text-destructive" />,
    header: "text-destructive",
    count: "text-destructive",
  },
};

export function AgeGroupedList<T>({ items, getDate, renderItem, emptyMessage }: Props<T>) {
  const groups = groupByAge(items, getDate);
  const [open, setOpen] = useState<Record<AgeBucket, boolean>>({
    current: true,
    mid: false,
    overdue: false,
  });

  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        {emptyMessage ?? "No hay registros para mostrar."}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {AGE_BUCKETS.map((b) => {
        const bucketItems = groups[b.id];
        if (bucketItems.length === 0) return null;
        const isOpen = open[b.id];
        const tone = TONE_CLASSES[b.id];
        return (
          <div key={b.id} className="rounded-xl border border-border overflow-hidden">
            <button
              type="button"
              onClick={() => setOpen((s) => ({ ...s, [b.id]: !s[b.id] }))}
              className={cn(
                "w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors",
                b.id === "overdue" && "bg-destructive/5 hover:bg-destructive/10"
              )}
              aria-expanded={isOpen}
            >
              <div className="flex items-center gap-2 min-w-0">
                {tone.icon}
                <span className={cn("text-sm font-semibold", tone.header)}>{b.label}</span>
                {b.hint && (
                  <span className="text-xs text-muted-foreground truncate">{b.hint}</span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={cn("text-sm font-bold tabular-nums", tone.count)}>
                  {bucketItems.length}
                </span>
                <ChevronDown
                  className={cn(
                    "w-4 h-4 text-muted-foreground transition-transform",
                    isOpen && "rotate-180"
                  )}
                />
              </div>
            </button>
            {isOpen && (
              <div className="p-3 space-y-2 bg-background">
                {bucketItems.map((item) => renderItem(item))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
