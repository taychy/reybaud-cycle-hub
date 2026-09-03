import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Check, ChevronDown, X } from "lucide-react";

export interface FilterOption {
  key: string;
  label: string;
  count: number;
}

interface FilterGroup {
  label: string | null;
  options: FilterOption[];
}

interface Props {
  title: string;
  /** Todas las opciones del menú (para detectar el filtro activo). */
  options: FilterOption[];
  /** Agrupación opcional para render (mismas opciones que `options`). */
  groups?: FilterGroup[];
  statusFilter: string;
  onSelect: (key: string) => void;
}

/**
 * Menú desplegable de filtros de Admin > Alumnos.
 * Sólo agrupa visualmente: emite exactamente las mismas keys de `statusFilter`.
 */
export default function AlumnosFilterMenu({ title, options, groups, statusFilter, onSelect }: Props) {
  if (options.length === 0) return null;

  const active = options.find((o) => o.key === statusFilter) || null;
  const renderGroups: FilterGroup[] = groups
    ? groups.filter((g) => g.options.length > 0)
    : [{ label: null, options }];

  return (
    <div className="flex items-center">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant={active ? "default" : "outline"}
            size="sm"
            className={`text-xs h-7 gap-1 max-w-[220px] ${active ? "rounded-r-none" : ""}`}
          >
            <span className="truncate">
              {active ? `${title}: ${active.label} · ${active.count}` : title}
            </span>
            <ChevronDown className="w-3 h-3 shrink-0 opacity-70" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-[60vh] overflow-y-auto w-64 bg-popover z-50">
          {renderGroups.map((g, gi) => (
            <div key={g.label ?? `g-${gi}`}>
              {gi > 0 && <DropdownMenuSeparator />}
              {g.label && (
                <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {g.label}
                </DropdownMenuLabel>
              )}
              {g.options.map((o) => (
                <DropdownMenuItem
                  key={o.key}
                  onClick={() => onSelect(o.key)}
                  className="text-xs gap-2"
                >
                  <span className="w-3 shrink-0">
                    {statusFilter === o.key && <Check className="w-3 h-3" />}
                  </span>
                  <span className="flex-1 truncate">{o.label}</span>
                  <span className="text-muted-foreground tabular-nums">{o.count}</span>
                </DropdownMenuItem>
              ))}
            </div>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {active && (
        <Button
          variant="default"
          size="sm"
          aria-label={`Quitar filtro ${title}`}
          className="text-xs h-7 px-1.5 rounded-l-none border-l border-primary-foreground/20"
          onClick={() => onSelect("todos")}
        >
          <X className="w-3 h-3" />
        </Button>
      )}
    </div>
  );
}
