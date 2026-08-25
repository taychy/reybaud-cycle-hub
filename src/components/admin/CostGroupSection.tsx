import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Copy } from "lucide-react";
import { MONEDAS, formatPrice } from "@/lib/currency";
import {
  CATEGORIA_LABELS, SUBCATEGORIAS_POR_GRUPO,
  type CostItem, type GrupoCosto, type Modalidad,
} from "@/lib/eventCostCalculator";

export interface CostRow extends CostItem { id: string }

interface Props {
  grupo: Exclude<GrupoCosto, "alojamiento">;
  titulo: string;
  descripcion: string;
  items: CostRow[];
  modalidades: Modalidad[];
  monedaBase: string;
  /** líneas de encabezado ya formateadas */
  headline: string;
  subheadline?: string;
  onAdd: () => void;
  onPatch: (id: string, patch: Partial<CostRow>) => void;
  onCommit: (id: string) => void;
  onUpdate: (id: string, patch: Partial<CostRow>) => void;
  onDuplicate: (it: CostRow) => void;
  onDelete: (id: string) => void;
}

export default function CostGroupSection({
  grupo, titulo, descripcion, items, modalidades, monedaBase,
  headline, subheadline, onAdd, onPatch, onCommit, onUpdate, onDuplicate, onDelete,
}: Props) {
  const subcats = SUBCATEGORIAS_POR_GRUPO[grupo];
  const mostrarAplicaA = grupo === "participante" && modalidades.length > 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-foreground">{titulo}</div>
          <p className="text-xs text-muted-foreground mt-1 max-w-xl">{descripcion}</p>
        </div>
        <div className="text-right shrink-0">
          <div className="text-sm font-semibold">{headline}</div>
          {subheadline && <div className="text-xs text-muted-foreground">{subheadline}</div>}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.length === 0 && (
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">Sin costos cargados aún.</p>
            <Button size="sm" variant="outline" onClick={onAdd}>
              <Plus className="w-4 h-4 mr-1" /> Agregar
            </Button>
          </div>
        )}

        {items.map((it) => (
          <div key={it.id} className="grid grid-cols-12 gap-2 items-center border rounded-md p-2">
            <Select value={it.categoria} onValueChange={(v) => onUpdate(it.id, { categoria: v })}>
              <SelectTrigger className="col-span-3 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {subcats.map((c) => (
                  <SelectItem key={c} value={c}>{CATEGORIA_LABELS[c] || c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input className="col-span-4 h-8" placeholder="Descripción"
              value={it.descripcion}
              onChange={(e) => onPatch(it.id, { descripcion: e.target.value })}
              onBlur={() => onCommit(it.id)} />
            <Input type="number" className="col-span-1 h-8" placeholder="Cant"
              value={it.cantidad}
              onChange={(e) => onPatch(it.id, { cantidad: Number(e.target.value) })}
              onBlur={() => onCommit(it.id)} />
            <Input type="number" className="col-span-2 h-8" placeholder="Precio"
              value={it.precio_unitario}
              onChange={(e) => onPatch(it.id, { precio_unitario: Number(e.target.value) })}
              onBlur={() => onCommit(it.id)} />
            <Select value={it.moneda} onValueChange={(v) => onUpdate(it.id, { moneda: v })}>
              <SelectTrigger className="col-span-1 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MONEDAS.map((m) => <SelectItem key={m.value} value={m.value}>{m.value}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="col-span-1 flex items-center justify-end gap-0.5">
              <Button variant="ghost" size="icon" className="h-8 w-7"
                title="Duplicar" onClick={() => onDuplicate(it)}>
                <Copy className="w-4 h-4 text-muted-foreground" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-7"
                title="Eliminar" onClick={() => onDelete(it.id)}>
                <Trash2 className="w-4 h-4 text-destructive" />
              </Button>
            </div>

            <div className="col-span-12 text-[10px] text-muted-foreground pl-1">
              {grupo === "participante"
                ? `${formatPrice(Number(it.cantidad || 0) * Number(it.precio_unitario || 0), it.moneda)} por participante`
                : `${formatPrice(Number(it.cantidad || 0) * Number(it.precio_unitario || 0), it.moneda)} total`}
            </div>

            {mostrarAplicaA && (
              <div className="col-span-12 flex flex-wrap gap-1 pl-1">
                <span className="text-[10px] text-muted-foreground mr-1">Aplica a:</span>
                {modalidades.map((m) => {
                  const active = it.aplica_a_modalidades?.length === 0 || it.aplica_a_modalidades?.includes(m.key);
                  return (
                    <Badge key={m.key}
                      variant={active ? "default" : "outline"}
                      className="cursor-pointer text-[10px]"
                      onClick={() => {
                        const cur = it.aplica_a_modalidades || [];
                        let next: string[];
                        if (cur.length === 0) {
                          next = modalidades.filter((x) => x.key !== m.key).map((x) => x.key);
                        } else if (cur.includes(m.key)) {
                          next = cur.filter((k) => k !== m.key);
                        } else {
                          next = [...cur, m.key];
                        }
                        if (next.length === modalidades.length) next = [];
                        onUpdate(it.id, { aplica_a_modalidades: next });
                      }}>{m.label}</Badge>
                  );
                })}
              </div>
            )}
          </div>
        ))}

        {items.length > 0 && (
          <Button variant="outline" className="w-full" onClick={onAdd}>
            <Plus className="w-4 h-4 mr-1" /> Agregar {monedaBase ? "" : ""}otro costo
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
