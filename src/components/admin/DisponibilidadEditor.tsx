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

// ============================================================
//  Modo principal: BLOQUES DE TRABAJO (agrupado multi-servicio)
// ============================================================
export function DisponibilidadBloques({ coaches, servicios, sedes, disponibilidades, reload, lockedCoachId }: DispEditorProps) {
  const [coachId, setCoachId] = useState<string>(lockedCoachId || "");
  const [saving, setSaving] = useState(false);
  const [openForm, setOpenForm] = useState(false);
  const [editKey, setEditKey] = useState<string | null>(null);
  const [form, setForm] = useState({
    sede_id: "none",
    dia_semana: "1",
    hora_inicio: "09:00",
    hora_fin: "12:00",
    servicio_ids: [] as string[],
  });

  const serviciosActivos = servicios.filter(s => s.activo !== false && !s.archivado);
  const servicioNombre = (id: string) => servicios.find(s => s.id === id)?.nombre || "Servicio";

  useEffect(() => {
    if (lockedCoachId) { if (coachId !== lockedCoachId) setCoachId(lockedCoachId); }
    else if (!coachId && coaches.length) setCoachId(coaches[0].id);
  }, [coaches, lockedCoachId]);

  const bloques = agruparDisponibilidad(
    (disponibilidades || []).filter((d: any) => d.coach_id === coachId && d.activo !== false),
  );

  const openCreate = () => {
    setEditKey(null);
    setForm({ sede_id: "none", dia_semana: "1", hora_inicio: "09:00", hora_fin: "12:00", servicio_ids: [] });
    setOpenForm(true);
  };

  const openEdit = (b: BloqueDisponibilidad) => {
    setEditKey(b.key);
    setForm({
      sede_id: b.sede_id || "none",
      dia_semana: String(b.dia_semana),
      hora_inicio: b.hora_inicio,
      hora_fin: b.hora_fin,
      servicio_ids: [...b.servicio_ids],
    });
    setOpenForm(true);
  };

  const toggleServicio = (id: string) =>
    setForm(f => ({
      ...f,
      servicio_ids: f.servicio_ids.includes(id) ? f.servicio_ids.filter(s => s !== id) : [...f.servicio_ids, id],
    }));

  const eliminarBloque = async (b: BloqueDisponibilidad) => {
    setSaving(true);
    await supabase.from("disponibilidad_coaches").delete().in("id", b.row_ids);
    setSaving(false);
    toast({ title: "Bloque eliminado" });
    reload();
  };

  const guardar = async () => {
    if (!coachId) { toast({ title: "Elegí un coach", variant: "destructive" }); return; }
    if (form.hora_fin <= form.hora_inicio) {
      toast({ title: "La hora de fin debe ser posterior al inicio", variant: "destructive" });
      return;
    }
    if (form.servicio_ids.length === 0) {
      toast({ title: "Elegí al menos un servicio", variant: "destructive" });
      return;
    }
    const sede_id = form.sede_id === "none" ? null : form.sede_id;
    const dia = Number(form.dia_semana);
    const actual = editKey ? bloques.find(b => b.key === editKey) : null;
    setSaving(true);

    if (actual) {
      const { toAdd, toRemove } = diffServicios(actual.servicio_ids, form.servicio_ids);
      await supabase
        .from("disponibilidad_coaches")
        .update({ sede_id, dia_semana: dia, hora_inicio: form.hora_inicio, hora_fin: form.hora_fin } as any)
        .in("id", actual.row_ids);
      for (const sv of toRemove) {
        const row = (disponibilidades || []).find(
          (d: any) => actual.row_ids.includes(d.id) && d.servicio_id === sv,
        );
        if (row) await supabase.from("disponibilidad_coaches").delete().eq("id", row.id);
      }
      for (const sv of toAdd) {
        await supabase.from("disponibilidad_coaches").insert({
          coach_id: coachId, servicio_id: sv, sede_id, dia_semana: dia,
          hora_inicio: form.hora_inicio, hora_fin: form.hora_fin,
        } as any);
      }
    } else {
      for (const sv of form.servicio_ids) {
        const dup = (disponibilidades || []).some(
          (d: any) =>
            d.coach_id === coachId && d.servicio_id === sv && (d.sede_id ?? null) === sede_id &&
            d.dia_semana === dia && (d.hora_inicio || "").slice(0, 5) === form.hora_inicio &&
            (d.hora_fin || "").slice(0, 5) === form.hora_fin,
        );
        if (dup) continue;
        await supabase.from("disponibilidad_coaches").insert({
          coach_id: coachId, servicio_id: sv, sede_id, dia_semana: dia,
          hora_inicio: form.hora_inicio, hora_fin: form.hora_fin,
        } as any);
      }
    }

    setSaving(false);
    setOpenForm(false);
    setEditKey(null);
    toast({ title: actual ? "Bloque actualizado" : "Bloque agregado" });
    reload();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        {!lockedCoachId ? (
          <Select value={coachId} onValueChange={setCoachId}>
            <SelectTrigger className="h-9 w-[220px]"><SelectValue placeholder="Elegí un coach" /></SelectTrigger>
            <SelectContent>{coaches.map(c => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}</SelectContent>
          </Select>
        ) : <span className="text-xs text-muted-foreground">Tus bloques de trabajo</span>}
        <Button size="sm" onClick={openCreate}>
          <Plus className="w-3.5 h-3.5 mr-1" /> Agregar bloque
        </Button>
      </div>

      {bloques.length === 0 ? (
        <Card className="bg-card border-border">
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No hay bloques de trabajo cargados.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5, 6, 0].map(d => {
            const delDia = bloques.filter(b => b.dia_semana === d);
            if (delDia.length === 0) return null;
            return (
              <Card key={d} className="bg-card border-border">
                <CardContent className="p-3 space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-primary">{DIAS[d]}</h4>
                  {delDia.map(b => (
                    <div key={b.key} className="flex items-start justify-between gap-2 border-b border-border last:border-0 pb-2 last:pb-0">
                      <div className="space-y-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">{b.hora_inicio}–{b.hora_fin}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {sedes.find(s => s.id === b.sede_id)?.nombre || "Sin sede"}
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {b.servicio_ids.map(sv => (
                            <Badge key={sv} variant="secondary" className="text-[10px]">{servicioNombre(sv)}</Badge>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(b)}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" disabled={saving} onClick={() => eliminarBloque(b)}>
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={openForm} onOpenChange={(o) => { setOpenForm(o); if (!o) setEditKey(null); }}>
        <DialogContent className="sm:max-w-md bg-card border-border max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading uppercase tracking-wider text-sm">
              {editKey ? "Editar bloque de trabajo" : "Nuevo bloque de trabajo"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Sede</Label>
              <Select value={form.sede_id} onValueChange={v => setForm({ ...form, sede_id: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin sede</SelectItem>
                  {sedes.map(s => <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1.5 col-span-3 sm:col-span-1">
                <Label>Día</Label>
                <Select value={form.dia_semana} onValueChange={v => setForm({ ...form, dia_semana: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5, 6, 0].map(i => <SelectItem key={i} value={String(i)}>{DIAS[i]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Inicio</Label>
                <Input type="time" value={form.hora_inicio} onChange={e => setForm({ ...form, hora_inicio: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Fin</Label>
                <Input type="time" value={form.hora_fin} onChange={e => setForm({ ...form, hora_fin: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Servicios habilitados</Label>
              <div className="rounded-md border border-border divide-y divide-border max-h-56 overflow-y-auto">
                {serviciosActivos.map(s => (
                  <label key={s.id} className="flex items-center gap-2 px-3 py-2 cursor-pointer">
                    <Checkbox checked={form.servicio_ids.includes(s.id)} onCheckedChange={() => toggleServicio(s.id)} />
                    <span className="text-sm text-foreground">{s.nombre}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenForm(false)}>Cancelar</Button>
            <Button disabled={saving} onClick={guardar}>{saving ? "Guardando…" : "Guardar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================
//  Wrapper: bloques (por defecto) + editor avanzado por servicio
// ============================================================
export function DisponibilidadManager(props: DispEditorProps) {
  return (
    <Tabs defaultValue="bloques">
      <TabsList className="w-full grid grid-cols-2">
        <TabsTrigger value="bloques">Bloques de trabajo</TabsTrigger>
        <TabsTrigger value="avanzado">Avanzado (por servicio)</TabsTrigger>
      </TabsList>
      <TabsContent value="bloques" className="mt-3">
        <DisponibilidadBloques {...props} />
      </TabsContent>
      <TabsContent value="avanzado" className="mt-3">
        <DisponibilidadEditor {...props} />
      </TabsContent>
    </Tabs>
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

