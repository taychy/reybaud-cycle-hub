import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GripVertical, Plus, Trash2, ChevronUp, ChevronDown } from "lucide-react";
import {
  WaitlistQuestion,
  WaitlistQuestionType,
  QUESTION_TYPE_LABELS,
  emptyQuestion,
} from "@/lib/waitlistTypes";

interface Props {
  value: WaitlistQuestion[];
  onChange: (next: WaitlistQuestion[]) => void;
}

export default function WaitlistQuestionsEditor({ value, onChange }: Props) {
  const update = (id: string, patch: Partial<WaitlistQuestion>) => {
    onChange(value.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  };

  const remove = (id: string) => {
    onChange(value.filter((q) => q.id !== id).map((q, i) => ({ ...q, orden: i })));
  };

  const move = (id: string, dir: -1 | 1) => {
    const idx = value.findIndex((q) => q.id === id);
    if (idx < 0) return;
    const next = [...value];
    const swap = idx + dir;
    if (swap < 0 || swap >= next.length) return;
    [next[idx], next[swap]] = [next[swap], next[idx]];
    onChange(next.map((q, i) => ({ ...q, orden: i })));
  };

  const add = () => {
    onChange([...value, emptyQuestion(value.length)]);
  };

  return (
    <div className="space-y-3">
      {value.length === 0 && (
        <p className="text-xs text-muted-foreground italic">
          Sin preguntas. Agregá al menos una para nutrir la base con información útil.
        </p>
      )}
      {value.map((q, idx) => (
        <div key={q.id} className="rounded-md border border-border bg-card/40 p-3 space-y-2.5">
          <div className="flex items-start gap-2">
            <div className="flex flex-col items-center pt-1.5 text-muted-foreground">
              <GripVertical className="w-4 h-4" />
              <span className="text-[10px]">#{idx + 1}</span>
            </div>
            <div className="flex-1 space-y-2">
              <div className="grid grid-cols-1 md:grid-cols-[1fr_180px] gap-2">
                <div>
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Pregunta
                  </Label>
                  <Input
                    value={q.label}
                    onChange={(e) => update(q.id, { label: e.target.value })}
                    placeholder="Ej: ¿Qué fecha te viene mejor este camp?"
                  />
                </div>
                <div>
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Tipo
                  </Label>
                  <Select
                    value={q.tipo}
                    onValueChange={(v) => update(q.id, { tipo: v as WaitlistQuestionType })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(QUESTION_TYPE_LABELS).map(([k, l]) => (
                        <SelectItem key={k} value={k}>
                          {l}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {(q.tipo === "single_choice" || q.tipo === "multi_choice") && (
                <div>
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Opciones (una por línea)
                  </Label>
                  <Textarea
                    value={(q.opciones || []).join("\n")}
                    onChange={(e) =>
                      update(q.id, {
                        opciones: e.target.value
                          .split("\n")
                          .map((s) => s.trim())
                          .filter(Boolean),
                      })
                    }
                    rows={3}
                    placeholder={`Marzo\nAbril\nMayo`}
                  />
                </div>
              )}

              {(q.tipo === "text" || q.tipo === "textarea" || q.tipo === "number") && (
                <div>
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Placeholder (opcional)
                  </Label>
                  <Input
                    value={q.placeholder || ""}
                    onChange={(e) => update(q.id, { placeholder: e.target.value })}
                  />
                </div>
              )}

              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <Checkbox
                    checked={!!q.requerida}
                    onCheckedChange={(v) => update(q.id, { requerida: !!v })}
                  />
                  <span>Requerida</span>
                </label>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => move(q.id, -1)}
                    disabled={idx === 0}
                  >
                    <ChevronUp className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => move(q.id, 1)}
                    disabled={idx === value.length - 1}
                  >
                    <ChevronDown className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => remove(q.id)}
                    className="text-destructive"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ))}

      <Button variant="outline" size="sm" onClick={add} className="gap-1">
        <Plus className="w-4 h-4" /> Agregar pregunta
      </Button>
    </div>
  );
}
