import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Plus, X, CopyPlus, Ban } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";

const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];


// ============================================================
//  DisponibilidadEditor — UX estilo Google Calendar
// ============================================================
type DispEditorProps = {
  coaches: any[];
  servicios: any[];
  sedes: any[];
  disponibilidades: any[];
  reload: () => void;
  /** Cuando se pasa, el selector de coach queda oculto y fijo (vista del propio coach). */
  lockedCoachId?: string;
};

const DIAS_CORTO = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

export function DisponibilidadEditor({ coaches, servicios, sedes, disponibilidades, reload, lockedCoachId }: DispEditorProps) {

  const [coachId, setCoachId] = useState<string>("");
  const [servicioId, setServicioId] = useState<string>("");
  const [sedeId, setSedeId] = useState<string>("none");
  const [saving, setSaving] = useState(false);

  const serviciosActivos = servicios.filter(s => s.activo !== false && !s.archivado);

  // Set defaults once data is available
  useEffect(() => {
    if (lockedCoachId) { if (coachId !== lockedCoachId) setCoachId(lockedCoachId); }
    else if (!coachId && coaches.length) setCoachId(coaches[0].id);
    if (!servicioId && serviciosActivos.length) setServicioId(serviciosActivos[0].id);

    // Si el servicio seleccionado ya no está activo, saltar al primero activo
    if (servicioId && !serviciosActivos.some(s => s.id === servicioId) && serviciosActivos.length) {
      setServicioId(serviciosActivos[0].id);
    }
  }, [coaches, serviciosActivos, servicioId]);

  const bloquesDelContexto = disponibilidades.filter(
    d => d.coach_id === coachId && d.servicio_id === servicioId && (sedeId === "none" ? !d.sede_id : d.sede_id === sedeId)
  );

  const porDia: Record<number, any[]> = {};
  for (let i = 0; i < 7; i++) porDia[i] = [];
  bloquesDelContexto.forEach(b => porDia[b.dia_semana]?.push(b));
  Object.values(porDia).forEach(arr => arr.sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio)));

  const refresh = async () => reload();

  const addRange = async (dia: number, hora_inicio = "09:00", hora_fin = "17:00") => {
    if (!coachId || !servicioId) {
      toast({ title: "Seleccioná coach y servicio primero", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("disponibilidad_coaches").insert({
      coach_id: coachId,
      servicio_id: servicioId,
      sede_id: sedeId === "none" ? null : sedeId,
      dia_semana: dia,
      hora_inicio,
      hora_fin,
    } as any);
    setSaving(false);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    refresh();
  };

  const removeRange = async (id: string) => {
    await supabase.from("disponibilidad_coaches").delete().eq("id", id);
    refresh();
  };

  const updateRange = async (id: string, patch: any) => {
    const { error } = await supabase.from("disponibilidad_coaches").update(patch).eq("id", id);
    if (error) toast({ title: "Error al guardar", description: error.message, variant: "destructive" });
    refresh();
  };

  const copyDayTo = async (sourceDay: number, targetDays: number[]) => {
    const source = porDia[sourceDay];
    if (!source.length) return;
    setSaving(true);
    for (const td of targetDays) {
      // Borrar lo existente del día destino
      const existing = porDia[td];
      for (const e of existing) await supabase.from("disponibilidad_coaches").delete().eq("id", e.id);
      // Insertar copia
      for (const s of source) {
        await supabase.from("disponibilidad_coaches").insert({
          coach_id: coachId,
          servicio_id: servicioId,
          sede_id: sedeId === "none" ? null : sedeId,
          dia_semana: td,
          hora_inicio: s.hora_inicio,
          hora_fin: s.hora_fin,
        } as any);
      }
    }
    setSaving(false);
    toast({ title: `Horarios copiados a ${targetDays.length} día(s)` });
    refresh();
  };

  const noContext = !coachId || !servicioId;

  return (
    <div className="space-y-4">
      {/* Selector de contexto */}
      <Card className="bg-card border-border">
        <CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {!lockedCoachId && (
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Coach</label>
              <Select value={coachId} onValueChange={setCoachId}>
                <SelectTrigger><SelectValue placeholder="Elegí un coach" /></SelectTrigger>
                <SelectContent>{coaches.map(c => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            )}

            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Servicio</label>
              <Select value={servicioId} onValueChange={setServicioId}>
                <SelectTrigger><SelectValue placeholder="Elegí un servicio" /></SelectTrigger>
                <SelectContent>{serviciosActivos.map(s => <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {sedes.length > 0 && (
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Sede (opcional)</label>
                <Select value={sedeId} onValueChange={setSedeId}>
                  <SelectTrigger><SelectValue placeholder="Sin sede" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Sin sede —</SelectItem>
                    {sedes.map(s => <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Definí los horarios disponibles para esta combinación. Cada fila es un día de la semana.
          </p>
        </CardContent>
      </Card>

      {/* Grilla semanal */}
      <Card className="bg-card border-border">
        <CardContent className={`p-0 ${noContext ? "opacity-50 pointer-events-none" : ""}`}>
          {DIAS.map((dia, idx) => {
            const rangos = porDia[idx] || [];
            const otros = [0, 1, 2, 3, 4, 5, 6].filter(d => d !== idx);
            

            return (
              <DayRow
                key={idx}
                dia={dia}
                idx={idx}
                rangos={rangos}
                otrosDias={otros}
                onAdd={() => addRange(idx)}
                onRemove={removeRange}
                onUpdate={updateRange}
                onCopyTo={(targets) => copyDayTo(idx, targets)}
                saving={saving}
              />
            );
          })}
        </CardContent>
      </Card>

      {noContext && (
        <p className="text-xs text-muted-foreground text-center">
          Elegí un coach y un servicio arriba para empezar a configurar la disponibilidad.
        </p>
      )}
    </div>
  );
}

// Fila de un día
function DayRow({
  dia, idx, rangos, otrosDias, onAdd, onRemove, onUpdate, onCopyTo, saving,
}: {
  dia: string; idx: number; rangos: any[]; otrosDias: number[];
  onAdd: () => void; onRemove: (id: string) => void;
  onUpdate: (id: string, patch: any) => void;
  onCopyTo: (targets: number[]) => void; saving: boolean;
}) {
  const [targets, setTargets] = useState<number[]>([]);
  const [copyOpen, setCopyOpen] = useState(false);

  const toggleTarget = (d: number) =>
    setTargets(t => t.includes(d) ? t.filter(x => x !== d) : [...t, d]);

  const applyCopy = () => {
    if (targets.length === 0) { setCopyOpen(false); return; }
    onCopyTo(targets);
    setTargets([]);
    setCopyOpen(false);
  };

  return (
    <div className="flex items-start gap-3 px-4 py-3 border-b border-border last:border-0">
      <div className="w-10 pt-2 text-sm font-medium text-muted-foreground shrink-0">{DIAS_CORTO[idx]}</div>

      <div className="flex-1 space-y-2">
        {rangos.length === 0 ? (
          <div className="flex items-center gap-2 h-9">
            <Ban className="w-3.5 h-3.5 text-muted-foreground/60" />
            <span className="text-sm text-muted-foreground/80 italic">No disponible</span>
          </div>
        ) : (
          rangos.map(r => (
            <div key={r.id} className="flex items-center gap-2">
              <Input
                type="time"
                defaultValue={r.hora_inicio.slice(0, 5)}
                onBlur={e => {
                  const v = e.target.value + ":00";
                  if (v !== r.hora_inicio) onUpdate(r.id, { hora_inicio: v });
                }}
                className="h-9 w-[120px] font-mono text-sm"
              />
              <span className="text-muted-foreground text-sm">–</span>
              <Input
                type="time"
                defaultValue={r.hora_fin.slice(0, 5)}
                onBlur={e => {
                  const v = e.target.value + ":00";
                  if (v !== r.hora_fin) onUpdate(r.id, { hora_fin: v });
                }}
                className="h-9 w-[120px] font-mono text-sm"
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                onClick={() => onRemove(r.id)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          ))
        )}
      </div>

      <div className="flex items-center gap-1 shrink-0 pt-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onAdd}
          disabled={saving}
          title="Agregar rango"
        >
          <Plus className="w-4 h-4" />
        </Button>

        {rangos.length > 0 && (
          <DropdownMenu open={copyOpen} onOpenChange={setCopyOpen}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" title="Copiar a otros días">
                <CopyPlus className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel>Copiar a…</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {otrosDias.map(d => (
                <DropdownMenuCheckboxItem
                  key={d}
                  checked={targets.includes(d)}
                  onCheckedChange={() => toggleTarget(d)}
                  onSelect={(e) => e.preventDefault()}
                >
                  {DIAS[d]}
                </DropdownMenuCheckboxItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={applyCopy} disabled={targets.length === 0}>
                Aplicar a {targets.length} día(s)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}

