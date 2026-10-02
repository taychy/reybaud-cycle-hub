import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import {
  derivarTipo, formatARS, itemTotal, LIQ_ESTADO_ECON_LABELS, LIQ_TIPO_LABELS, nuevoItem, sinGrupo,
  type Honorario, type ItemDraft,
} from "@/lib/liquidacionCarga";

export type MovimientoExistente = {
  id: string; fecha: string; tipo_actividad: string; origen: string; grupo: string | null;
  detalle: string | null; total: number; estado_economico: string;
};

const fechaCorta = (iso: string) => {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
};

export function MovimientosExistentes({ movimientos }: { movimientos: MovimientoExistente[] }) {
  const total = movimientos.reduce((s, m) => s + Number(m.total || 0), 0);
  if (movimientos.length === 0) {
    return <p className="text-sm text-muted-foreground">Todavía no hay actividad registrada por el sistema este mes.</p>;
  }
  return (
    <div className="space-y-2">
      <ul className="divide-y divide-border rounded-lg border border-border bg-background/40">
        {movimientos.map((m) => (
          <li key={m.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
            <div className="min-w-0">
              <p className="text-foreground truncate">
                <span className="text-muted-foreground mr-2">{fechaCorta(m.fecha)}</span>
                {LIQ_TIPO_LABELS[m.tipo_actividad] || m.tipo_actividad}
              </p>
              {(m.grupo || m.detalle) && (
                <p className="text-xs text-muted-foreground truncate">{[m.grupo, m.detalle].filter(Boolean).join(" · ")}</p>
              )}
            </div>
            <div className="text-right shrink-0">
              <p className="font-medium text-foreground">{formatARS(m.total)}</p>
              <p className="text-[11px] text-muted-foreground">{LIQ_ESTADO_ECON_LABELS[m.estado_economico] || m.estado_economico}</p>
            </div>
          </li>
        ))}
      </ul>
      <div className="flex justify-between text-sm font-medium px-1">
        <span className="text-muted-foreground">Total registrado</span>
        <span className="text-foreground">{formatARS(total)}</span>
      </div>
    </div>
  );
}

interface FormProps {
  mes: string;
  honorarios: Honorario[];
  items: ItemDraft[];
  onChange: (items: ItemDraft[]) => void;
  disabled?: boolean;
}

export function FaltantesForm({ mes, honorarios, items, onChange, disabled }: FormProps) {
  const update = (key: string, patch: Partial<ItemDraft>) =>
    onChange(items.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  const [y, m] = mes.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();

  return (
    <div className="space-y-3">
      {items.map((it, idx) => {
        const hon = honorarios.find((h) => h.id === it.honorario_id);
        const tipo = derivarTipo(hon?.nombre);
        return (
          <div key={it.key} className="rounded-lg border border-border bg-background/40 p-3 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Faltante {idx + 1}</p>
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8" disabled={disabled}
                aria-label="Quitar fila" onClick={() => onChange(items.filter((i) => i.key !== it.key))}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Fecha</Label>
                <Input type="date" value={it.fecha} min={`${mes}-01`} max={`${mes}-${String(lastDay).padStart(2, "0")}`}
                  disabled={disabled} onChange={(e) => update(it.key, { fecha: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Concepto</Label>
                <Select value={it.honorario_id || "none"} disabled={disabled}
                  onValueChange={(v) => update(it.key, { honorario_id: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Solo reintegro / otro gasto</SelectItem>
                    {honorarios.map((h) => (
                      <SelectItem key={h.id} value={h.id}>{h.nombre} · {formatARS(h.valor)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">Tipo: {LIQ_TIPO_LABELS[tipo] || tipo}</p>
              </div>
              {!sinGrupo(tipo) && (
                <>
                  <div className="space-y-1">
                    <Label className="text-xs">Grupo</Label>
                    <Input value={it.grupo} maxLength={80} placeholder="Ej. G3" disabled={disabled}
                      onChange={(e) => update(it.key, { grupo: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Alumno / detalle</Label>
                    <Input value={it.detalle} maxLength={160} disabled={disabled}
                      onChange={(e) => update(it.key, { detalle: e.target.value })} />
                  </div>
                </>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {([
                ["entrada", "Entrada"], ["estacionamiento", "Estacionamiento"], ["viaticos", "Viático"], ["extras", "Extras"],
              ] as const).map(([k, label]) => (
                <div key={k} className="space-y-1">
                  <Label className="text-xs">{label}</Label>
                  <Input type="number" inputMode="numeric" min={0} value={it[k]} disabled={disabled}
                    onChange={(e) => update(it.key, { [k]: e.target.value } as Partial<ItemDraft>)} />
                </div>
              ))}
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Observaciones</Label>
              <Input value={it.observaciones} maxLength={500} disabled={disabled}
                onChange={(e) => update(it.key, { observaciones: e.target.value })} />
            </div>
            <p className="text-right text-sm">
              <span className="text-muted-foreground">Total estimado </span>
              <span className="font-semibold text-foreground">{formatARS(itemTotal(it, honorarios))}</span>
            </p>
          </div>
        );
      })}
      <Button type="button" variant="outline" className="w-full" disabled={disabled}
        onClick={() => onChange([...items, nuevoItem(mes)])}>
        <Plus className="w-4 h-4 mr-2" /> Agregar faltante
      </Button>
      <p className="text-[11px] text-muted-foreground">
        Entrada y estacionamiento se reintegran por el valor real. Todo lo agregado queda en revisión de administración.
      </p>
    </div>
  );
}
