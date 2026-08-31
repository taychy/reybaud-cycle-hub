import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { DIAS_SEMANA, hhmm } from "@/lib/agenda";
import { TIPO_SOLICITUD_LABEL, type SolicitudTipo, type TipoAjuste } from "@/lib/agendaSolicitudes";


export type SolicitudSeed = {
  tipo: SolicitudTipo;
  /** Fila de `agenda_grupal` o bloque agrupado de disponibilidad, si edita algo existente. */
  entidad?: any;
};

type Props = {
  seed: SolicitudSeed | null;
  sedes: any[];
  servicios: any[];
  onOpenChange: (o: boolean) => void;
  onSent: () => void;
};

/**
 * Un profesor NO edita la agenda oficial: propone un cambio.
 * Al enviar se crea una solicitud pendiente + tarea para administración.
 */
export const SolicitudAgendaDialog = ({ seed, sedes, servicios, onOpenChange, onSent }: Props) => {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    modalidad: "recurrente" as "recurrente" | "puntual",
    fecha: "",
    dia_semana: "1",
    hora_inicio: "09:00",
    hora_fin: "10:00",
    sede_id: "none",
    grupo: "",
    servicio_ids: [] as string[],
    alcance: "desde_fecha" as "solo_fecha" | "desde_fecha" | "toda_serie",
    fecha_efectiva: "",
    motivo: "",
    tipo_ajuste: "bloquear" as TipoAjuste,
  });

  const esGrupal = (seed?.tipo || "").startsWith("grupal");
  const esAjuste = (seed?.tipo || "").startsWith("ajuste");
  const esEdicionSerie = seed?.tipo === "grupal_editar";


  useEffect(() => {
    if (!seed) return;
    const e = seed.entidad || {};
    setForm({
      modalidad: (e.tipo_clase === "puntual" ? "puntual" : "recurrente") as any,
      fecha: e.fecha ? String(e.fecha).slice(0, 10) : "",
      dia_semana: String(e.dia_semana ?? 1),
      hora_inicio: hhmm(e.hora_inicio) || "09:00",
      hora_fin: hhmm(e.hora_fin) || "10:00",
      sede_id: e.sede_id || "none",
      grupo: e.grupo || "",
      servicio_ids: e.servicio_ids ? [...e.servicio_ids] : [],
      alcance: e.tipo_clase === "puntual" ? "toda_serie" : "desde_fecha",
      fecha_efectiva: "",
      motivo: "",
      tipo_ajuste: (e.tipo || "bloquear") as TipoAjuste,
    });

  }, [seed]);

  const toggleServicio = (id: string) =>
    setForm((f) => ({
      ...f,
      servicio_ids: f.servicio_ids.includes(id)
        ? f.servicio_ids.filter((s) => s !== id)
        : [...f.servicio_ids, id],
    }));

  const enviar = async () => {
    if (!seed) return;

    // --- Cambio PUNTUAL de disponibilidad (disponibilidad_ajustada) ---
    if (esAjuste) {
      if (seed.tipo === "ajuste_crear") {
        if (!form.fecha) {
          toast({ title: "Elegí la fecha del cambio", variant: "destructive" });
          return;
        }
        if (form.tipo_ajuste !== "bloquear" && form.hora_fin <= form.hora_inicio) {
          toast({ title: "La hora de fin debe ser posterior al inicio", variant: "destructive" });
          return;
        }
      }
      setSaving(true);
      const { error } = await supabase.rpc("solicitar_cambio_agenda" as any, {
        p_tipo: seed.tipo,
        p_entidad_tipo: "disponibilidad_ajustada",
        p_entidad_id: seed.tipo === "ajuste_eliminar" ? seed.entidad?.id ?? null : null,
        p_alcance: null,
        p_fecha_efectiva:
          seed.tipo === "ajuste_crear"
            ? form.fecha
            : seed.entidad?.fecha
              ? String(seed.entidad.fecha).slice(0, 10)
              : null,
        p_valores_nuevos:
          seed.tipo === "ajuste_crear"
            ? {
                fecha: form.fecha,
                tipo_ajuste: form.tipo_ajuste,
                hora_inicio: form.tipo_ajuste === "bloquear" ? null : form.hora_inicio,
                hora_fin: form.tipo_ajuste === "bloquear" ? null : form.hora_fin,
              }
            : {},
        p_motivo: form.motivo || null,
      });
      setSaving(false);
      if (error) {
        toast({ title: "No se pudo enviar", description: error.message, variant: "destructive" });
        return;
      }
      toast({
        title: "Solicitud enviada",
        description: "Administración la va a revisar. La agenda no cambia hasta que la aprueben.",
      });
      onOpenChange(false);
      onSent();
      return;
    }

    if (form.hora_fin <= form.hora_inicio) {
      toast({ title: "La hora de fin debe ser posterior al inicio", variant: "destructive" });
      return;
    }
    if (esGrupal && form.modalidad === "puntual" && !form.fecha) {
      toast({ title: "Elegí la fecha de la clase puntual", variant: "destructive" });
      return;
    }
    if (!esGrupal && seed.tipo !== "disp_eliminar" && form.servicio_ids.length === 0) {
      toast({ title: "Elegí al menos un servicio", variant: "destructive" });
      return;
    }

    const valores: Record<string, any> = {
      dia_semana: Number(form.dia_semana),
      hora_inicio: form.hora_inicio,
      hora_fin: form.hora_fin,
      sede_id: form.sede_id === "none" ? null : form.sede_id,
    };
    if (esGrupal) {
      valores.tipo_clase = form.modalidad;
      valores.fecha = form.modalidad === "puntual" ? form.fecha : null;
      if (form.grupo) valores.grupo = form.grupo;
      if (form.modalidad === "puntual") valores.dia_semana = null;
    } else {
      valores.servicio_ids = form.servicio_ids;
      if (seed.entidad?.row_ids) valores.row_ids = seed.entidad.row_ids;
    }

    const alcance = esEdicionSerie && form.modalidad === "recurrente" ? form.alcance : null;
    const fechaEfectiva =
      seed.tipo === "grupal_finalizar"
        ? form.fecha_efectiva || null
        : alcance && alcance !== "toda_serie"
          ? form.fecha_efectiva || null
          : null;

    if (alcance && alcance !== "toda_serie" && !fechaEfectiva) {
      toast({ title: "Indicá desde qué fecha aplica el cambio", variant: "destructive" });
      return;
    }

    setSaving(true);
    const { error } = await supabase.rpc("solicitar_cambio_agenda" as any, {
      p_tipo: seed.tipo,
      p_entidad_tipo: esGrupal ? "agenda_grupal" : "disponibilidad",
      p_entidad_id: esGrupal ? seed.entidad?.id ?? null : null,
      p_alcance: alcance,
      p_fecha_efectiva: fechaEfectiva,
      p_valores_nuevos: valores,
      p_motivo: form.motivo || null,
    });

    setSaving(false);
    if (error) {
      toast({ title: "No se pudo enviar", description: error.message, variant: "destructive" });
      return;
    }
    toast({
      title: "Solicitud enviada",
      description: "Administración la va a revisar. La agenda no cambia hasta que la aprueben.",
    });
    onOpenChange(false);
    onSent();
  };

  return (
    <Dialog open={!!seed} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-card border-border max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading uppercase tracking-wider text-sm">
            Proponer: {seed ? TIPO_SOLICITUD_LABEL[seed.tipo] : ""}
          </DialogTitle>
        </DialogHeader>

        <p className="text-[12px] text-muted-foreground">
          Esto no modifica la agenda: se envía como solicitud para que administración la apruebe.
        </p>

        <div className="space-y-3 py-1">
          {esAjuste ? (
            seed?.tipo === "ajuste_eliminar" ? (
              <div className="rounded-md border border-border bg-muted/20 p-3 text-sm text-foreground">
                Pedís quitar el cambio puntual del{" "}
                <span className="font-semibold">
                  {seed?.entidad?.fecha ? String(seed.entidad.fecha).slice(0, 10) : "—"}
                </span>
                . Al aprobarse, esa fecha vuelve a tu horario habitual.
              </div>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label>Fecha del cambio</Label>
                  <Input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>¿Qué querés cambiar ese día?</Label>
                  <Select value={form.tipo_ajuste} onValueChange={(v) => setForm({ ...form, tipo_ajuste: v as TipoAjuste })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bloquear">🚫 No estoy disponible ese día</SelectItem>
                      <SelectItem value="reemplazar">🔁 Ese día trabajo en otro horario</SelectItem>
                      <SelectItem value="agregar">➕ Sumo un tramo extra</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {form.tipo_ajuste !== "bloquear" && (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1.5">
                      <Label>Inicio</Label>
                      <Input type="time" value={form.hora_inicio} onChange={(e) => setForm({ ...form, hora_inicio: e.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Fin</Label>
                      <Input type="time" value={form.hora_fin} onChange={(e) => setForm({ ...form, hora_fin: e.target.value })} />
                    </div>
                  </div>
                )}
                <p className="text-[11px] text-amber-500">
                  El cambio puntual aplica a toda tu agenda de turnera de esa fecha: no se puede
                  limitar por servicio ni por sede.
                </p>
              </>
            )
          ) : (
            <>
          {esGrupal && (

            <div className="space-y-1.5">
              <Label>Modalidad</Label>
              <Select
                value={form.modalidad}
                onValueChange={(v) => setForm({ ...form, modalidad: v as any })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="recurrente">Clase recurrente (semanal)</SelectItem>
                  <SelectItem value="puntual">Clase puntual (una sola fecha)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {esGrupal && form.modalidad === "puntual" ? (
            <div className="space-y-1.5">
              <Label>Fecha</Label>
              <Input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>Día</Label>
              <Select value={form.dia_semana} onValueChange={(v) => setForm({ ...form, dia_semana: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5, 6, 0].map((i) => (
                    <SelectItem key={i} value={String(i)}>{DIAS_SEMANA[i]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label>Inicio</Label>
              <Input type="time" value={form.hora_inicio} onChange={(e) => setForm({ ...form, hora_inicio: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Fin</Label>
              <Input type="time" value={form.hora_fin} onChange={(e) => setForm({ ...form, hora_fin: e.target.value })} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Sede</Label>
            <Select value={form.sede_id} onValueChange={(v) => setForm({ ...form, sede_id: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin sede</SelectItem>
                {sedes.filter((s) => s.activa !== false).map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {!esGrupal && seed?.tipo !== "disp_eliminar" && (
            <div className="space-y-1.5">
              <Label>Servicios</Label>
              <div className="rounded-md border border-border divide-y divide-border max-h-48 overflow-y-auto">
                {servicios.filter((s) => s.activo !== false && !s.archivado).map((s) => (
                  <label key={s.id} className="flex items-center gap-2 px-3 py-2 cursor-pointer">
                    <Checkbox checked={form.servicio_ids.includes(s.id)} onCheckedChange={() => toggleServicio(s.id)} />
                    <span className="text-sm text-foreground">{s.nombre}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {esEdicionSerie && form.modalidad === "recurrente" && (
            <div className="rounded-md border border-border bg-muted/20 p-3 space-y-2">
              <Label className="text-[11px]">¿Desde cuándo aplica?</Label>
              <Select value={form.alcance} onValueChange={(v) => setForm({ ...form, alcance: v as any })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="solo_fecha">Solo esa clase</SelectItem>
                  <SelectItem value="desde_fecha">Esa clase y las siguientes</SelectItem>
                  <SelectItem value="toda_serie">Toda la serie</SelectItem>
                </SelectContent>
              </Select>
              {form.alcance !== "toda_serie" && (
                <Input
                  type="date"
                  value={form.fecha_efectiva}
                  onChange={(e) => setForm({ ...form, fecha_efectiva: e.target.value })}
                />
              )}
            </div>
          )}

          {seed?.tipo === "grupal_finalizar" && (
            <div className="space-y-1.5">
              <Label>Última fecha de la serie</Label>
              <Input type="date" value={form.fecha_efectiva} onChange={(e) => setForm({ ...form, fecha_efectiva: e.target.value })} />
            </div>
          )}
            </>
          )}



          <div className="space-y-1.5">
            <Label>Motivo / comentario</Label>
            <Textarea rows={2} value={form.motivo} onChange={(e) => setForm({ ...form, motivo: e.target.value })} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button variant="gold" disabled={saving} onClick={enviar}>
            {saving ? "Enviando…" : "Enviar solicitud"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SolicitudAgendaDialog;
