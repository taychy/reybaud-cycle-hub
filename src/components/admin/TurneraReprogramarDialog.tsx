import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/hooks/use-toast";
import { ArrowRight, AlertTriangle } from "lucide-react";

interface Props {
  reserva: any | null;
  coaches: { id: string; nombre: string }[];
  sedes: { id: string; nombre: string }[];
  servicioNombre?: string;
  onClose: () => void;
  onSaved: () => void;
}

const hhmm = (t?: string | null) => (t || "").substring(0, 5);

export function TurneraReprogramarDialog({ reserva, coaches, sedes, servicioNombre, onClose, onSaved }: Props) {
  const [form, setForm] = useState({
    coach_id: "",
    fecha: "",
    hora_inicio: "",
    hora_fin: "",
    sede_id: "",
    nota: "",
  });
  const [motivo, setMotivo] = useState("");
  const [avisar, setAvisar] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!reserva) return;
    setForm({
      coach_id: reserva.coach_id || "",
      fecha: reserva.fecha || "",
      hora_inicio: hhmm(reserva.hora_inicio),
      hora_fin: hhmm(reserva.hora_fin),
      sede_id: reserva.sede_id || "",
      nota: reserva.nota || "",
    });
    setMotivo("");
    setAvisar(true);
  }, [reserva]);

  const coachName = (id?: string | null) => coaches.find(c => c.id === id)?.nombre || "–";
  const sedeName = (id?: string | null) => sedes.find(s => s.id === id)?.nombre || "Sin sede";

  const cambios = useMemo(() => {
    if (!reserva) return [] as { label: string; antes: string; ahora: string }[];
    const out: { label: string; antes: string; ahora: string }[] = [];
    if (form.fecha !== reserva.fecha) out.push({ label: "Fecha", antes: reserva.fecha, ahora: form.fecha });
    if (form.hora_inicio !== hhmm(reserva.hora_inicio) || form.hora_fin !== hhmm(reserva.hora_fin)) {
      out.push({
        label: "Hora",
        antes: `${hhmm(reserva.hora_inicio)}–${hhmm(reserva.hora_fin)}`,
        ahora: `${form.hora_inicio}–${form.hora_fin}`,
      });
    }
    if (form.coach_id !== (reserva.coach_id || "")) {
      out.push({ label: "Coach", antes: coachName(reserva.coach_id), ahora: coachName(form.coach_id) });
    }
    if (form.sede_id !== (reserva.sede_id || "")) {
      out.push({ label: "Sede", antes: sedeName(reserva.sede_id), ahora: sedeName(form.sede_id) });
    }
    if ((form.nota || "") !== (reserva.nota || "")) {
      out.push({ label: "Nota", antes: reserva.nota || "–", ahora: form.nota || "–" });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, reserva, coaches, sedes]);

  const horaInvalida = !!form.hora_inicio && !!form.hora_fin && form.hora_fin <= form.hora_inicio;
  const puedeGuardar =
    !!reserva && !!form.coach_id && !!form.fecha && !!form.hora_inicio && !!form.hora_fin &&
    !horaInvalida && motivo.trim().length > 0 && cambios.length > 0 && !saving;

  const notificar = async (tipo: string, before: any, coachTarget?: string | null) => {
    const { error } = await supabase.functions.invoke("send-turnera-email", {
      body: {
        reservation_id: reserva.id,
        tipo,
        before,
        motivo: motivo.trim(),
        coach_id_target: coachTarget || undefined,
      },
    });
    if (error) throw error;
  };

  const guardar = async () => {
    if (!reserva) return;
    setSaving(true);
    const { data, error } = await supabase.rpc("admin_update_turnera_reservation" as any, {
      p_reservation_id: reserva.id,
      p_coach_id: form.coach_id,
      p_fecha: form.fecha,
      p_hora_inicio: form.hora_inicio,
      p_hora_fin: form.hora_fin,
      p_sede_id: form.sede_id || null,
      p_nota: form.nota || null,
      p_motivo: motivo.trim(),
    });

    if (error) {
      setSaving(false);
      toast({ title: "No se pudo reprogramar", description: error.message, variant: "destructive" });
      return;
    }

    const before = (data as any)?.before || {};
    const coachCambio = form.coach_id !== (reserva.coach_id || "");

    let avisoFallido = false;
    if (avisar) {
      try { await notificar("reprogramacion", before); } catch { avisoFallido = true; }
      try { await notificar("coach_reprogramacion", before, form.coach_id); } catch { avisoFallido = true; }
      if (coachCambio && reserva.coach_id) {
        try { await notificar("coach_reprogramacion_removida", before, reserva.coach_id); } catch { avisoFallido = true; }
      }
    }

    setSaving(false);
    if (avisoFallido) {
      toast({
        title: "Clase actualizada, pero un aviso no pudo enviarse",
        description: "Revisá y avisá manualmente si hace falta.",
      });
    } else {
      toast({ title: "Clase reprogramada" });
    }
    onSaved();
    onClose();
  };

  const cancelada = !!reserva?.estado_operativo?.startsWith("cancelada");

  return (
    <Dialog open={!!reserva} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Editar / Reprogramar clase</DialogTitle></DialogHeader>

        {!reserva ? null : cancelada ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
            Esta reserva está cancelada. No se puede reprogramar desde acá.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border p-3 text-xs bg-muted/30 space-y-1">
              <div><span className="text-muted-foreground">Alumno:</span> <strong>{reserva.nombre} {reserva.apellido}</strong></div>
              <div><span className="text-muted-foreground">Servicio:</span> {servicioNombre || "–"}</div>
              <div>
                <span className="text-muted-foreground">Actual:</span>{" "}
                {reserva.fecha} · {hhmm(reserva.hora_inicio)}–{hhmm(reserva.hora_fin)} · {coachName(reserva.coach_id)} · {sedeName(reserva.sede_id)}
              </div>
              <div className="text-muted-foreground">No se modifican alumno, servicio, precio ni estado de pago.</div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Coach *</label>
                <Select value={form.coach_id} onValueChange={(v) => setForm(p => ({ ...p, coach_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Elegí coach" /></SelectTrigger>
                  <SelectContent>{coaches.map(c => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Sede</label>
                <Select value={form.sede_id || "none"} onValueChange={(v) => setForm(p => ({ ...p, sede_id: v === "none" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="Sin sede" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin sede</SelectItem>
                    {sedes.map(s => <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Fecha *</label>
                <Input type="date" value={form.fecha} onChange={e => setForm(p => ({ ...p, fecha: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Inicio *</label>
                <Input type="time" value={form.hora_inicio} onChange={e => setForm(p => ({ ...p, hora_inicio: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Fin *</label>
                <Input type="time" value={form.hora_fin} onChange={e => setForm(p => ({ ...p, hora_fin: e.target.value }))} />
              </div>
            </div>

            {horaInvalida && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                La hora de fin debe ser posterior a la hora de inicio.
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Nota</label>
              <Textarea rows={2} value={form.nota} onChange={e => setForm(p => ({ ...p, nota: e.target.value }))} />
            </div>

            {cambios.length > 0 && (
              <div className="rounded-lg border p-3 space-y-2">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Antes → Ahora</div>
                {cambios.map(c => (
                  <div key={c.label} className="flex items-center gap-2 text-sm">
                    <span className="text-xs text-muted-foreground w-14">{c.label}</span>
                    <span className="line-through text-muted-foreground">{c.antes}</span>
                    <ArrowRight className="w-3 h-3 text-muted-foreground" />
                    <span className="font-semibold">{c.ahora}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Motivo del cambio *</label>
              <Textarea
                rows={2}
                placeholder="Ej: el alumno pidió cambiar el horario"
                value={motivo}
                onChange={e => setMotivo(e.target.value)}
              />
            </div>

            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={avisar} onCheckedChange={(v) => setAvisar(!!v)} />
              Avisar al alumno y profesores
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
              <Button onClick={guardar} disabled={!puedeGuardar}>
                {saving ? "Guardando…" : "Guardar cambios"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default TurneraReprogramarDialog;
