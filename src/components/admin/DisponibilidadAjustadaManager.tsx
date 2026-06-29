import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { Plus, Trash2, Ban, CalendarIcon, Lock } from "lucide-react";
import { es } from "date-fns/locale";

interface Coach { id: string; nombre: string }
interface Ajuste {
  id: string;
  coach_id: string | null;
  fecha: string;
  tipo: "bloquear" | "reemplazar" | "agregar";
  hora_inicio: string | null;
  hora_fin: string | null;
  motivo: string | null;
}

const TIPO_LABEL: Record<string, string> = {
  bloquear: "🚫 Bloquear el día",
  reemplazar: "🔁 Reemplazar horario",
  agregar: "➕ Tramo extra",
};

const TIPO_BADGE_CLASS: Record<string, string> = {
  bloquear: "bg-destructive/15 text-destructive border-destructive/30",
  reemplazar: "bg-primary/15 text-primary border-primary/30",
  agregar: "bg-secondary/40 text-foreground border-border",
};

function fmtFecha(s: string) {
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
}

function toIso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function DisponibilidadAjustadaManager({ coaches }: { coaches: Coach[] }) {
  const [ajustes, setAjustes] = useState<Ajuste[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  // form
  const [fecha, setFecha] = useState<Date | undefined>();
  const [coachScope, setCoachScope] = useState<string>("global"); // 'global' | coach.id
  const [tipo, setTipo] = useState<"bloquear" | "reemplazar" | "agregar">("bloquear");
  const [horaIni, setHoraIni] = useState("09:00");
  const [horaFin, setHoraFin] = useState("17:00");
  const [motivo, setMotivo] = useState("");
  const [saving, setSaving] = useState(false);
  const [datePopOpen, setDatePopOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    const today = toIso(new Date());
    const { data } = await supabase
      .from("disponibilidad_ajustada" as any)
      .select("*")
      .gte("fecha", today)
      .order("fecha", { ascending: true });
    setAjustes((data as any[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const reset = () => {
    setFecha(undefined);
    setCoachScope("global");
    setTipo("bloquear");
    setHoraIni("09:00");
    setHoraFin("17:00");
    setMotivo("");
  };

  const save = async () => {
    if (!fecha) { toast({ title: "Elegí una fecha", variant: "destructive" }); return; }
    if (tipo !== "bloquear" && horaFin <= horaIni) {
      toast({ title: "El horario final debe ser mayor al inicial", variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload: any = {
      coach_id: coachScope === "global" ? null : coachScope,
      fecha: toIso(fecha),
      tipo,
      hora_inicio: tipo === "bloquear" ? null : `${horaIni}:00`,
      hora_fin: tipo === "bloquear" ? null : `${horaFin}:00`,
      motivo: motivo.trim() || null,
    };
    const { error } = await supabase.from("disponibilidad_ajustada" as any).insert(payload);
    setSaving(false);
    if (error) {
      toast({ title: "Error al guardar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Ajuste creado" });
    setOpen(false);
    reset();
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("¿Eliminar este ajuste?")) return;
    const { error } = await supabase.from("disponibilidad_ajustada" as any).delete().eq("id", id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    load();
  };

  const coachName = (id: string | null) => id ? (coaches.find(c => c.id === id)?.nombre || "—") : "Todos los coaches";

  return (
    <div className="space-y-4">
      <Card className="bg-primary/5 border-primary/30">
        <CardContent className="p-4 space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                <CalendarIcon className="w-4 h-4 text-primary" /> Disponibilidad ajustada
              </p>
              <p className="text-xs text-muted-foreground">
                Indicá a qué horas estarás disponible en fechas específicas. El motivo es interno y no se muestra al alumno.
              </p>
            </div>
            <Button size="sm" onClick={() => { reset(); setOpen(true); }}>
              <Plus className="w-4 h-4 mr-1" /> Cambiar la disponibilidad en una fecha
            </Button>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <p className="text-sm text-muted-foreground text-center py-6">Cargando…</p>
      ) : ajustes.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">No hay ajustes para fechas futuras.</p>
      ) : (
        <div className="space-y-2">
          {ajustes.map(a => (
            <Card key={a.id} className="bg-card border-border">
              <CardContent className="p-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="space-y-1.5 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="font-mono text-xs">{fmtFecha(a.fecha)}</Badge>
                      <Badge variant="outline" className={`text-xs ${TIPO_BADGE_CLASS[a.tipo]}`}>{TIPO_LABEL[a.tipo]}</Badge>
                      <Badge variant="secondary" className="text-xs">{coachName(a.coach_id)}</Badge>
                      {a.tipo !== "bloquear" && a.hora_inicio && (
                        <span className="text-xs font-mono text-muted-foreground">
                          {a.hora_inicio.slice(0,5)} – {a.hora_fin?.slice(0,5)}
                        </span>
                      )}
                    </div>
                    {a.motivo && (
                      <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                        <Lock className="w-3 h-3 mt-0.5 shrink-0" />
                        <span><span className="font-medium text-foreground/80">Motivo (solo admin):</span> {a.motivo}</span>
                      </p>
                    )}
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => remove(a.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cambiar la disponibilidad en una fecha</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs">Fecha</Label>
              <Popover open={datePopOpen} onOpenChange={setDatePopOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start font-normal">
                    <CalendarIcon className="w-4 h-4 mr-2" />
                    {fecha ? fmtFecha(toIso(fecha)) : "Elegí una fecha"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={fecha}
                    onSelect={(d) => { setFecha(d); setDatePopOpen(false); }}
                    locale={es}
                    disabled={(d) => d < new Date(new Date().setHours(0,0,0,0))}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div>
              <Label className="text-xs">Alcance</Label>
              <Select value={coachScope} onValueChange={setCoachScope}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="global">🌐 Todos los coaches (global)</SelectItem>
                  {coaches.map(c => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs">Tipo de ajuste</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bloquear">🚫 Bloquear el día completo</SelectItem>
                  <SelectItem value="reemplazar">🔁 Reemplazar el horario del día</SelectItem>
                  <SelectItem value="agregar">➕ Agregar un tramo extra</SelectItem>
                </SelectContent>
              </Select>
              {tipo === "reemplazar" && (
                <p className="text-[11px] text-muted-foreground mt-1">
                  Para esa fecha se ignora el horario habitual y solo aplica el rango que indiques.
                </p>
              )}
              {tipo === "agregar" && (
                <p className="text-[11px] text-muted-foreground mt-1">
                  Se suma al horario habitual de ese día.
                </p>
              )}
              {tipo === "bloquear" && (
                <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                  <Ban className="w-3 h-3" /> No habrá turnos disponibles ese día.
                </p>
              )}
            </div>

            {tipo !== "bloquear" && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Desde</Label>
                  <Input type="time" value={horaIni} onChange={e => setHoraIni(e.target.value)} className="font-mono" />
                </div>
                <div>
                  <Label className="text-xs">Hasta</Label>
                  <Input type="time" value={horaFin} onChange={e => setHoraFin(e.target.value)} className="font-mono" />
                </div>
              </div>
            )}

            <div>
              <Label className="text-xs flex items-center gap-1">
                <Lock className="w-3 h-3" /> Motivo (solo visible para admin)
              </Label>
              <Input
                value={motivo}
                onChange={e => setMotivo(e.target.value)}
                placeholder="Ej: feriado, capacitación, viaje…"
                maxLength={200}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Guardando…" : "Guardar ajuste"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
