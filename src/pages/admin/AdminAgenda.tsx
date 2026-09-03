import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/hooks/use-toast";
import {
  AlertTriangle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
  Plus,
  Repeat,
  Trash2,
  User,
  Users,
} from "lucide-react";
import {
  DIAS_SEMANA,
  addDays,
  agruparDisponibilidad,
  detectarConflictos,
  diffServicios,
  hhmm,
  ocurrenciasEnSemana,
  ocurrenciasSerie,
  parseIso,
  startOfWeek,
  toLocalIso,
  weekDays,
  type AgendaEvento,
} from "@/lib/agenda";
import { buildGrupoOptions } from "@/lib/coachContact";
import { effectiveCoachSedes } from "@/lib/coachSedes";
import AgendaSolicitudes from "@/components/admin/AgendaSolicitudes";
import { TIPO_AJUSTE_LABEL, type TipoAjuste } from "@/lib/agendaSolicitudes";


type TipoFiltro = "todos" | "grupal" | "turno" | "disponibilidad";

const TIPO_LABEL: Record<string, string> = {
  grupal: "Clase grupal",
  turno: "Turno",
  disponibilidad: "Disponibilidad",
};

const AdminAgenda = () => {
  const [monday, setMonday] = useState<Date>(() => startOfWeek(new Date()));
  const [sedeFiltro, setSedeFiltro] = useState("all");
  const [coachFiltro, setCoachFiltro] = useState("all");
  const [tipoFiltro, setTipoFiltro] = useState<TipoFiltro>("todos");

  const [coaches, setCoaches] = useState<any[]>([]);
  const [sedes, setSedes] = useState<any[]>([]);
  const [servicios, setServicios] = useState<any[]>([]);
  const [honorarios, setHonorarios] = useState<any[]>([]);
  const [grupal, setGrupal] = useState<any[]>([]);
  const [turnos, setTurnos] = useState<any[]>([]);
  const [disp, setDisp] = useState<any[]>([]);
  const [coachSedes, setCoachSedes] = useState<any[]>([]);
  const [gruposExistentes, setGruposExistentes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const dias = useMemo(() => weekDays(monday), [monday]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    const desde = dias[0];
    const hasta = dias[6];
    const [coachRes, sedeRes, servRes, honRes, agRes, resRes, dispRes, csRes, alumnosRes] =
      await Promise.all([
        supabase.from("coaches").select("id, nombre, estado, sede_id").order("nombre"),
        supabase.from("sedes").select("id, nombre, activa").order("nombre"),
        supabase.from("servicios_turnera").select("id, nombre, activo, archivado, duracion_minutos").order("nombre"),
        supabase.from("honorarios").select("id, nombre_concepto, valor").eq("activo", true).eq("categoria", "clase"),
        supabase.from("agenda_grupal").select("*"),
        supabase
          .from("reservas_turnera")
          .select("id, fecha, hora_inicio, hora_fin, coach_id, sede_id, nombre, apellido, estado_operativo, pago_estado, servicio_id")
          .gte("fecha", desde)
          .lte("fecha", hasta),
        supabase.from("disponibilidad_coaches").select("*"),
        supabase.from("coach_sedes").select("coach_id, sede_id"),
        supabase.from("alumnos").select("grupo").limit(2000),
      ]);
    setCoaches((coachRes.data as any[]) || []);
    setSedes((sedeRes.data as any[]) || []);
    setServicios((servRes.data as any[]) || []);
    setHonorarios((honRes.data as any[]) || []);
    setGrupal((agRes.data as any[]) || []);
    setTurnos((resRes.data as any[]) || []);
    setDisp((dispRes.data as any[]) || []);
    setCoachSedes((csRes.data as any[]) || []);
    setGruposExistentes(((alumnosRes.data as any[]) || []).map((a) => a.grupo));
    setLoading(false);
  }, [dias]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const coachNombre = (id: string | null) => coaches.find((c) => c.id === id)?.nombre || "—";
  const sedeNombre = (id: string | null) => (id ? sedes.find((s) => s.id === id)?.nombre || null : null);
  const servicioNombre = (id: string | null) => servicios.find((s) => s.id === id)?.nombre || "Turno";

  // ---------------- Eventos unificados (misma normalización que el Resumen) ----------------
  const eventos: AgendaEvento[] = useMemo(
    () =>
      buildAgendaEventos({
        dias,
        grupal,
        turnos,
        disponibilidad: disp,
        coachNombre,
        sedeNombre,
        servicioNombre,
      }),
    [grupal, turnos, disp, dias, coaches, sedes, servicios],
  );

  const filtrados = useMemo(
    () =>
      eventos.filter((e) => {
        if (tipoFiltro !== "todos" && e.tipo !== tipoFiltro) return false;
        if (tipoFiltro === "todos" && e.tipo === "disponibilidad") return false;
        if (sedeFiltro !== "all" && (e.sede_id || "none") !== sedeFiltro) return false;
        if (coachFiltro !== "all" && e.coach_id !== coachFiltro) return false;
        return true;
      }),
    [eventos, tipoFiltro, sedeFiltro, coachFiltro],
  );

  const conflictos = useMemo(() => detectarConflictos(eventos), [eventos]);
  const conflictosVisibles = filtrados.filter((e) => conflictos.has(e.id));

  // ---------------- Diálogo "Agregar bloque" ----------------
  const [openForm, setOpenForm] = useState(false);
  const [editBloque, setEditBloque] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    coach_id: "",
    sede_id: "none",
    dia_semana: "1",
    hora_inicio: "09:00",
    hora_fin: "10:00",
    tipo: "grupal" as "grupal" | "turnera",
    modalidad: "recurrente" as "recurrente" | "puntual",
    fecha: "",
    grupo: "G1",
    honorario_id: "none",
    notas: "",
    servicio_ids: [] as string[],
    vigente_desde: "",
    vigente_hasta: "",
    alcance: "desde_fecha" as "solo_fecha" | "desde_fecha" | "toda_serie",
    fecha_efectiva: "",
    // Disponibilidad de turnera: habitual (semanal) vs cambio puntual en una fecha.
    disp_modalidad: "habitual" as "habitual" | "puntual",
    tipo_ajuste: "bloquear" as TipoAjuste,
    fecha_ajuste: "",
    motivo_ajuste: "",
  });

  const [editSerie, setEditSerie] = useState<any | null>(null);


  const serviciosActivos = servicios.filter((s) => s.activo !== false && !s.archivado);
  const grupoOptions = useMemo(() => buildGrupoOptions(gruposExistentes), [gruposExistentes]);

  const sedesDelCoach = useMemo(() => {
    if (!form.coach_id) return [];
    const rel = coachSedes.filter((cs) => cs.coach_id === form.coach_id).map((cs) => cs.sede_id);
    const legacy = coaches.find((c) => c.id === form.coach_id)?.sede_id ?? null;
    return effectiveCoachSedes(rel, legacy);
  }, [form.coach_id, coachSedes, coaches]);

  const sedeNoAsignada =
    form.sede_id !== "none" && form.coach_id && !sedesDelCoach.includes(form.sede_id);

  /** Un cambio puntual (clase o disponibilidad) usa la FECHA como fuente de verdad, no el día de semana. */
  const esPuntual =
    form.tipo === "grupal" ? form.modalidad === "puntual" : form.disp_modalidad === "puntual";
  const diaAplica = !esPuntual;
  const horasAplican = !(form.tipo === "turnera" && form.disp_modalidad === "puntual" && form.tipo_ajuste === "bloquear");


  const openCreate = () => {
    setEditBloque(null);
    setEditSerie(null);
    setForm((f) => ({
      ...f,
      coach_id: coachFiltro !== "all" ? coachFiltro : coaches[0]?.id || "",
      sede_id: sedeFiltro !== "all" ? sedeFiltro : "none",
      tipo: "grupal",
      modalidad: "recurrente",
      fecha: "",
      servicio_ids: [],
      vigente_desde: "",
      vigente_hasta: "",
      alcance: "desde_fecha",
      fecha_efectiva: "",
      disp_modalidad: "habitual",
      tipo_ajuste: "bloquear",
      fecha_ajuste: "",
      motivo_ajuste: "",
    }));

    setOpenForm(true);
  };

  /** Abre la edición de una clase grupal. `fechaOcurrencia` = día clickeado (para "solo esta clase"). */
  const openEditSerie = (serie: any, fechaOcurrencia?: string) => {
    setEditBloque(null);
    setEditSerie(serie);
    const puntual = (serie.tipo_clase ?? "recurrente") === "puntual";
    setForm({
      coach_id: serie.coach_id,
      sede_id: serie.sede_id || "none",
      dia_semana: String(serie.dia_semana),
      hora_inicio: hhmm(serie.hora_inicio),
      hora_fin: hhmm(serie.hora_fin),
      tipo: "grupal",
      modalidad: puntual ? "puntual" : "recurrente",
      fecha: serie.fecha ? String(serie.fecha).slice(0, 10) : fechaOcurrencia || "",
      grupo: serie.grupo || "G1",
      honorario_id: serie.honorario_id || "none",
      notas: serie.notas || "",
      servicio_ids: [],
      vigente_desde: serie.vigente_desde ? String(serie.vigente_desde).slice(0, 10) : "",
      vigente_hasta: serie.vigente_hasta ? String(serie.vigente_hasta).slice(0, 10) : "",
      alcance: "desde_fecha",
      fecha_efectiva: fechaOcurrencia || "",
      disp_modalidad: "habitual",
      tipo_ajuste: "bloquear",
      fecha_ajuste: "",
      motivo_ajuste: "",
    });

    setOpenForm(true);
  };


  const finalizarSerie = async () => {
    if (!editSerie) return;
    const hasta = form.vigente_hasta || toLocalIso(new Date());
    setSaving(true);
    const { error } = await supabase
      .from("agenda_grupal")
      .update({ vigente_hasta: hasta } as any)
      .eq("id", editSerie.id);
    setSaving(false);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Serie finalizada", description: `No genera clases después del ${hasta}.` });
    setOpenForm(false);
    setEditSerie(null);
    loadAll();
  };

  const eliminarSerie = async () => {
    if (!editSerie) return;
    if (!window.confirm("¿Eliminar definitivamente esta serie semanal? Se perderá su configuración.")) return;
    setSaving(true);
    const { error } = await supabase.from("agenda_grupal").delete().eq("id", editSerie.id);
    setSaving(false);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Serie eliminada" });
    setOpenForm(false);
    setEditSerie(null);
    loadAll();
  };

  const openEditDisponibilidad = (bloque: any) => {
    setEditSerie(null);
    setEditBloque(bloque);
    setForm({
      coach_id: bloque.coach_id,
      sede_id: bloque.sede_id || "none",
      dia_semana: String(bloque.dia_semana),
      hora_inicio: bloque.hora_inicio,
      hora_fin: bloque.hora_fin,
      tipo: "turnera",
      modalidad: "recurrente",
      fecha: "",
      grupo: "G1",
      honorario_id: "none",
      notas: "",
      servicio_ids: [...bloque.servicio_ids],
      vigente_desde: "",
      vigente_hasta: "",
      alcance: "desde_fecha",
      fecha_efectiva: "",
      disp_modalidad: "habitual",
      tipo_ajuste: "bloquear",
      fecha_ajuste: "",
      motivo_ajuste: "",
    });

    setOpenForm(true);
  };

  const toggleServicio = (id: string) =>
    setForm((f) => ({
      ...f,
      servicio_ids: f.servicio_ids.includes(id)
        ? f.servicio_ids.filter((s) => s !== id)
        : [...f.servicio_ids, id],
    }));

  const guardarBloque = async () => {
    if (!form.coach_id) { toast({ title: "Elegí un profesor", variant: "destructive" }); return; }
    if (form.hora_fin <= form.hora_inicio) {
      toast({ title: "La hora de fin debe ser posterior al inicio", variant: "destructive" });
      return;
    }
    const sede_id = form.sede_id === "none" ? null : form.sede_id;
    const dia = Number(form.dia_semana);
    setSaving(true);

    // Si la sede no está asignada al coach, la agregamos (no bloqueamos datos existentes).
    if (sede_id && !sedesDelCoach.includes(sede_id)) {
      await supabase.from("coach_sedes").insert({ coach_id: form.coach_id, sede_id } as any);
    }

    if (form.tipo === "grupal") {
      const puntual = form.modalidad === "puntual";
      if (puntual && !form.fecha) {
        setSaving(false);
        toast({ title: "Elegí la fecha de la clase puntual", variant: "destructive" });
        return;
      }
      const payload = {
        coach_id: form.coach_id,
        sede_id,
        dia_semana: puntual ? parseIso(form.fecha).getDay() : dia,
        hora_inicio: form.hora_inicio,
        hora_fin: form.hora_fin,
        grupo: form.grupo,
        honorario_id: form.honorario_id === "none" ? null : form.honorario_id,
        notas: form.notas || null,
        tipo_clase: puntual ? "puntual" : "recurrente",
        fecha: puntual ? form.fecha : null,
        vigente_desde: puntual ? null : form.vigente_desde || null,
        vigente_hasta: puntual ? null : form.vigente_hasta || null,
        activo: true,
      };

      // Editar una serie recurrente pasa por el RPC de alcance (excepción / desde fecha / toda la serie).
      const esSerieRecurrente = editSerie && (editSerie.tipo_clase ?? "recurrente") !== "puntual" && !puntual;
      if (esSerieRecurrente && form.alcance !== "toda_serie" && !form.fecha_efectiva) {
        setSaving(false);
        toast({ title: "Indicá la fecha desde la que aplica el cambio", variant: "destructive" });
        return;
      }

      const { error } = esSerieRecurrente
        ? await supabase.rpc("aplicar_cambio_serie_grupal" as any, {
            p_serie_id: editSerie.id,
            p_alcance: form.alcance,
            p_fecha_efectiva: form.alcance === "toda_serie" ? null : form.fecha_efectiva,
            p_payload: payload as any,
          })
        : editSerie
          ? await supabase.from("agenda_grupal").update(payload as any).eq("id", editSerie.id)
          : await supabase.from("agenda_grupal").insert(payload as any);
      setSaving(false);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
      toast({
        title: editSerie
          ? esSerieRecurrente
            ? form.alcance === "solo_fecha"
              ? "Excepción creada para esa fecha"
              : form.alcance === "desde_fecha"
                ? "Nueva serie creada desde esa fecha"
                : "Serie actualizada por completo"
            : "Clase puntual actualizada"
          : puntual
            ? "Clase puntual creada"
            : "Clase grupal recurrente creada",
      });

    } else if (form.disp_modalidad === "puntual") {
      // Cambio puntual en una fecha → `disponibilidad_ajustada` (no hay serie semanal nueva).
      if (!form.fecha_ajuste) {
        setSaving(false);
        toast({ title: "Elegí la fecha del cambio puntual", variant: "destructive" });
        return;
      }
      const { error } = await supabase.from("disponibilidad_ajustada" as any).insert({
        coach_id: form.coach_id,
        fecha: form.fecha_ajuste,
        tipo: form.tipo_ajuste,
        hora_inicio: form.tipo_ajuste === "bloquear" ? null : `${form.hora_inicio}:00`,
        hora_fin: form.tipo_ajuste === "bloquear" ? null : `${form.hora_fin}:00`,
        motivo: form.motivo_ajuste.trim() || null,
      } as any);
      setSaving(false);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
      toast({
        title: "Cambio puntual guardado",
        description: `${TIPO_AJUSTE_LABEL[form.tipo_ajuste]} · ${form.fecha_ajuste}`,
      });
    } else {
      if (form.servicio_ids.length === 0) {
        setSaving(false);
        toast({ title: "Elegí al menos un servicio", variant: "destructive" });
        return;
      }

      const actuales = editBloque ? editBloque.servicio_ids : [];
      const { toAdd, toRemove } = diffServicios(actuales, form.servicio_ids);

      if (editBloque) {
        // 1) Borrar PRIMERO los servicios removidos, por row ID (robusto aunque
        //    cambien sede/día/hora en la misma edición).
        const removeSet = new Set(toRemove);
        const removeIds = editBloque.row_ids.filter((id: string) =>
          removeSet.has(disp.find((d) => d.id === id)?.servicio_id),
        );
        if (removeIds.length > 0) {
          await supabase.from("disponibilidad_coaches").delete().in("id", removeIds);
        }
        // 2) Actualizar horario/sede sólo de las filas conservadas.
        const keepIds = editBloque.row_ids.filter((id: string) => !removeIds.includes(id));
        if (keepIds.length > 0) {
          await supabase
            .from("disponibilidad_coaches")
            .update({
              sede_id,
              dia_semana: dia,
              hora_inicio: form.hora_inicio,
              hora_fin: form.hora_fin,
            } as any)
            .in("id", keepIds);
        }
      }

      for (const sv of toAdd) {
        const dup = disp.some(
          (d) =>
            d.coach_id === form.coach_id &&
            d.servicio_id === sv &&
            (d.sede_id ?? null) === sede_id &&
            d.dia_semana === dia &&
            hhmm(d.hora_inicio) === form.hora_inicio &&
            hhmm(d.hora_fin) === form.hora_fin,
        );
        if (dup) continue;
        await supabase.from("disponibilidad_coaches").insert({
          coach_id: form.coach_id,
          servicio_id: sv,
          sede_id,
          dia_semana: dia,
          hora_inicio: form.hora_inicio,
          hora_fin: form.hora_fin,
        } as any);
      }
      setSaving(false);
      toast({ title: editBloque ? "Bloque actualizado" : "Bloque de trabajo agregado" });
    }

    setOpenForm(false);
    setEditBloque(null);
    setEditSerie(null);
    loadAll();
  };

  const rangoLabel = `${parseIso(dias[0]).toLocaleDateString("es-AR", { day: "numeric", month: "short" })} – ${parseIso(dias[6]).toLocaleDateString("es-AR", { day: "numeric", month: "short" })}`;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-heading font-semibold uppercase tracking-wider text-foreground flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-primary" /> Agenda
          </h1>
          <p className="text-xs text-muted-foreground">
            Clases grupales, turnos y disponibilidad en una sola vista semanal.
          </p>
        </div>
        <Button variant="gold" size="sm" onClick={openCreate}>
          <Plus className="w-3.5 h-3.5 mr-1" /> Agregar bloque
        </Button>
      </div>

      <details className="group rounded-md border border-border bg-card">
        <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2.5 text-sm font-medium text-foreground">
          <span>Solicitudes de agenda de profesores</span>
          <span className="text-xs text-muted-foreground group-open:hidden">Revisar y aprobar cambios</span>
        </summary>
        <div className="border-t border-border p-3">
          <AgendaSolicitudes onResolved={loadAll} />
        </div>
      </details>

      {/* Filtros */}
      <Card className="bg-card border-border">
        <CardContent className="p-3 space-y-3">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setMonday((m) => addDays(m, -7))}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" className="h-8" onClick={() => setMonday(startOfWeek(new Date()))}>
              Hoy
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setMonday((m) => addDays(m, 7))}>
              <ChevronRight className="w-4 h-4" />
            </Button>
            <span className="text-sm font-medium text-foreground ml-1">{rangoLabel}</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <Select value={sedeFiltro} onValueChange={setSedeFiltro}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Sede" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las sedes</SelectItem>
                <SelectItem value="none">Sin sede</SelectItem>
                {sedes.filter((s) => s.activa !== false).map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={coachFiltro} onValueChange={setCoachFiltro}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Profesor" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los profesores</SelectItem>
                {coaches.filter((c) => c.estado !== "inactivo").map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={tipoFiltro} onValueChange={(v) => setTipoFiltro(v as TipoFiltro)}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Tipo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos (clases + turnos)</SelectItem>
                <SelectItem value="grupal">Clases grupales</SelectItem>
                <SelectItem value="turno">Turnos</SelectItem>
                <SelectItem value="disponibilidad">Disponibilidad</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {conflictosVisibles.length > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2">
          <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
          <p className="text-xs text-destructive">
            {conflictosVisibles.length} evento(s) con conflicto esta semana (mismo profesor superpuesto).
          </p>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground text-center py-10 animate-pulse">Cargando agenda…</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {dias.map((iso) => {
            const delDia = filtrados.filter((e) => e.fecha === iso);
            const esHoy = iso === toLocalIso(new Date());
            return (
              <Card key={iso} className={`bg-card border-border ${esHoy ? "ring-1 ring-primary/50" : ""}`}>
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-baseline justify-between">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-primary">
                      {DIAS_SEMANA[parseIso(iso).getDay()]}{" "}
                      <span className="text-muted-foreground font-normal normal-case">
                        {parseIso(iso).toLocaleDateString("es-AR", { day: "numeric", month: "short" })}
                      </span>
                    </h3>
                    {esHoy && <Badge variant="outline" className="text-[10px]">Hoy</Badge>}
                  </div>

                  {delDia.length === 0 ? (
                    <p className="text-xs text-muted-foreground/70 italic py-2">Sin actividad</p>
                  ) : (
                    delDia.map((e) => {
                      const enConflicto = conflictos.has(e.id);
                      return (
                        <div
                          key={e.id}
                          onClick={() => {
                            if (e.tipo === "disponibilidad") openEditDisponibilidad(e.raw);
                            else if (e.tipo === "grupal") openEditSerie(e.raw, e.fecha);
                          }}
                          className={`rounded-md border px-2.5 py-2 space-y-1 ${
                            e.tipo === "disponibilidad"
                              ? "border-dashed border-border/60 bg-muted/20 cursor-pointer"
                              : e.tipo === "grupal"
                                ? `cursor-pointer ${enConflicto ? "border-destructive/50 bg-destructive/5" : "border-border bg-secondary/40"}`
                              : enConflicto
                                ? "border-destructive/50 bg-destructive/5"
                                : "border-border bg-secondary/40"
                          }`}
                        >
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-foreground flex items-center gap-1">
                              <Clock className="w-3 h-3 text-muted-foreground" />
                              {e.hora_inicio}–{e.hora_fin}
                            </span>
                            <Badge variant="outline" className="text-[10px]">{TIPO_LABEL[e.tipo]}</Badge>
                            {e.tipo === "grupal" && (
                              (e.raw?.tipo_clase ?? "recurrente") === "puntual" ? (
                                <Badge variant="outline" className="text-[10px]">Puntual</Badge>
                              ) : (
                                <Badge variant="secondary" className="text-[10px] gap-1">
                                  <Repeat className="w-2.5 h-2.5" /> Semanal
                                </Badge>
                              )
                            )}

                            {enConflicto && (
                              <Badge variant="destructive" className="text-[10px]">Conflicto</Badge>
                            )}
                          </div>
                          <p className="text-[13px] text-foreground">{e.titulo}</p>
                          <div className="flex items-center gap-3 flex-wrap text-[11px] text-muted-foreground">
                            <span className="flex items-center gap-1"><Users className="w-3 h-3" />{e.coach_nombre}</span>
                            {e.sede_nombre && (
                              <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{e.sede_nombre}</span>
                            )}
                            {e.detalle && (
                              <span className="flex items-center gap-1"><User className="w-3 h-3" />{e.detalle}</span>
                            )}
                          </div>
                          {e.chips && e.chips.length > 0 && (
                            <div className="flex flex-wrap gap-1 pt-0.5">
                              {e.chips.map((c) => (
                                <Badge key={c} variant="secondary" className="text-[10px]">{c}</Badge>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Diálogo agregar / editar bloque */}
      <Dialog open={openForm} onOpenChange={(o) => { setOpenForm(o); if (!o) { setEditBloque(null); setEditSerie(null); } }}>
        <DialogContent className="sm:max-w-md bg-card border-border max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading uppercase tracking-wider text-sm">
              {editSerie
                ? form.modalidad === "puntual"
                  ? "Editar clase puntual"
                  : "Editar serie semanal"
                : editBloque
                  ? "Editar bloque de trabajo"
                  : form.tipo === "grupal"
                    ? form.modalidad === "puntual"
                      ? "Nueva clase puntual"
                      : "Nueva clase grupal recurrente"
                    : form.disp_modalidad === "puntual"
                      ? "Cambio puntual de disponibilidad"
                      : "Nuevo horario habitual"}

            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label>Profesor</Label>
              <Select value={form.coach_id} onValueChange={(v) => setForm({ ...form, coach_id: v })}>
                <SelectTrigger><SelectValue placeholder="Elegí un profesor" /></SelectTrigger>
                <SelectContent>
                  {coaches.filter((c) => c.estado !== "inactivo").map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Sede</Label>
              <Select value={form.sede_id} onValueChange={(v) => setForm({ ...form, sede_id: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin sede</SelectItem>
                  {sedes.filter((s) => s.activa !== false).map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.nombre}{sedesDelCoach.includes(s.id) ? "" : " · no asignada"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {sedeNoAsignada && (
                <p className="text-[11px] text-amber-500">
                  Esta sede no está asignada al profesor: se agregará automáticamente al guardar.
                </p>
              )}
            </div>

            {(diaAplica || horasAplican) && (
              <div className={`grid gap-2 ${diaAplica ? "grid-cols-3" : "grid-cols-2"}`}>
                {diaAplica && (
                  <div className="space-y-1.5 col-span-3 sm:col-span-1">
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
                {horasAplican && (
                  <>
                    <div className="space-y-1.5">
                      <Label>Inicio</Label>
                      <Input type="time" value={form.hora_inicio} onChange={(e) => setForm({ ...form, hora_inicio: e.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Fin</Label>
                      <Input type="time" value={form.hora_fin} onChange={(e) => setForm({ ...form, hora_fin: e.target.value })} />
                    </div>
                  </>
                )}
              </div>
            )}



            {!editBloque && !editSerie && (
              <div className="space-y-1.5">
                <Label>Tipo de bloque</Label>
                <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v as any })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="grupal">Clase grupal</SelectItem>
                    <SelectItem value="turnera">Disponible para turnera</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {form.tipo === "grupal" ? (
              <>
                <div className="space-y-1.5">
                  <Label>Grupo</Label>
                  <Select value={form.grupo} onValueChange={(v) => setForm({ ...form, grupo: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {grupoOptions.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Concepto de honorario (opcional)</Label>
                  <Select value={form.honorario_id} onValueChange={(v) => setForm({ ...form, honorario_id: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sin asignar</SelectItem>
                      {honorarios.map((h) => (
                        <SelectItem key={h.id} value={h.id}>
                          {h.nombre_concepto} (${Number(h.valor).toLocaleString("es-AR")})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Notas</Label>
                  <Textarea rows={2} value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
                </div>

                 <div className="rounded-md border border-border bg-muted/20 p-3 space-y-2">
                   <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                     <Repeat className="w-3.5 h-3.5 text-primary" /> Tipo de clase
                   </p>
                   <Select value={form.modalidad} onValueChange={(v) => setForm({ ...form, modalidad: v as any })}>
                     <SelectTrigger><SelectValue /></SelectTrigger>
                     <SelectContent>
                       <SelectItem value="recurrente">Clase recurrente (semanal)</SelectItem>
                       <SelectItem value="puntual">Clase puntual (una sola fecha)</SelectItem>
                     </SelectContent>
                   </Select>

                   {form.modalidad === "puntual" ? (
                     <div className="space-y-1.5">
                       <Label className="text-[11px]">Fecha de la clase</Label>
                       <Input type="date" value={form.fecha} onChange={(ev) => setForm({ ...form, fecha: ev.target.value })} />
                       <p className="text-[11px] text-muted-foreground">Se mostrará una sola vez, sin repetirse.</p>
                     </div>
                   ) : (
                     <>
                       <p className="text-[12px] text-muted-foreground">
                         Se repite todos los {DIAS_SEMANA[Number(form.dia_semana)]} de {form.hora_inicio} a {form.hora_fin}.
                       </p>
                       <div className="grid grid-cols-2 gap-2">
                         <div className="space-y-1.5">
                           <Label className="text-[11px]">Desde</Label>
                           <Input type="date" value={form.vigente_desde} onChange={(ev) => setForm({ ...form, vigente_desde: ev.target.value })} />
                         </div>
                         <div className="space-y-1.5">
                           <Label className="text-[11px]">Hasta (opcional)</Label>
                           <Input type="date" value={form.vigente_hasta} onChange={(ev) => setForm({ ...form, vigente_hasta: ev.target.value })} />
                         </div>
                       </div>
                       <p className="text-[11px] text-muted-foreground">Sin fechas, la serie se repite indefinidamente.</p>
                     </>
                   )}

                   {editSerie && form.modalidad === "recurrente" && (
                     <div className="border-t border-border pt-2 mt-2 space-y-2">
                       <Label className="text-[11px]">Alcance del cambio</Label>
                       <Select value={form.alcance} onValueChange={(v) => setForm({ ...form, alcance: v as any })}>
                         <SelectTrigger><SelectValue /></SelectTrigger>
                         <SelectContent>
                           <SelectItem value="solo_fecha">Solo esta clase</SelectItem>
                           <SelectItem value="desde_fecha">Esta y las siguientes</SelectItem>
                           <SelectItem value="toda_serie">Toda la serie</SelectItem>
                         </SelectContent>
                       </Select>
                       {form.alcance !== "toda_serie" && (
                         <Input type="date" value={form.fecha_efectiva} onChange={(ev) => setForm({ ...form, fecha_efectiva: ev.target.value })} />
                       )}
                       {form.alcance === "toda_serie" && (
                         <p className="text-[11px] text-amber-500">Advertencia: también corrige la configuración histórica de la serie.</p>
                       )}
                     </div>
                   )}

                   {editSerie && (
                     <div className="flex flex-wrap gap-2 pt-1">
                       <Button type="button" variant="outline" size="sm" disabled={saving} onClick={finalizarSerie}>
                         Finalizar serie
                       </Button>
                       <Button type="button" variant="ghost" size="sm" disabled={saving} onClick={eliminarSerie}>
                         <Trash2 className="w-3.5 h-3.5 mr-1" /> Eliminar
                       </Button>
                     </div>
                   )}
                 </div>

                 {editSerie && (
                   <p className="text-[11px] text-amber-500">
                     {form.modalidad === "puntual" ? "Clase puntual: se verá solo en la fecha elegida." : "El alcance seleccionado preserva el histórico de la serie."}
                   </p>
                 )}

              </>
            ) : (
              <div className="space-y-3">
                {!editBloque && (
                  <div className="rounded-md border border-border bg-muted/20 p-3 space-y-2">
                    <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <Repeat className="w-3.5 h-3.5 text-primary" /> Tipo de disponibilidad
                    </p>
                    <Select
                      value={form.disp_modalidad}
                      onValueChange={(v) => setForm({ ...form, disp_modalidad: v as any })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="habitual">Horario habitual (semanal)</SelectItem>
                        <SelectItem value="puntual">Cambio puntual en una fecha</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-[11px] text-muted-foreground">
                      {form.disp_modalidad === "habitual"
                        ? `Se repite todos los ${DIAS_SEMANA[Number(form.dia_semana)]} mientras esté activo.`
                        : "Se aplica una sola vez, sobre el horario habitual de esa fecha."}
                    </p>
                  </div>
                )}

                {form.disp_modalidad === "puntual" && !editBloque ? (
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label>Fecha del cambio</Label>
                      <Input
                        type="date"
                        value={form.fecha_ajuste}
                        onChange={(ev) => setForm({ ...form, fecha_ajuste: ev.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Tipo de ajuste</Label>
                      <Select value={form.tipo_ajuste} onValueChange={(v) => setForm({ ...form, tipo_ajuste: v as TipoAjuste })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="bloquear">🚫 Bloquear el día completo</SelectItem>
                          <SelectItem value="reemplazar">🔁 Reemplazar el horario del día</SelectItem>
                          <SelectItem value="agregar">➕ Agregar un tramo extra</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-[11px] text-muted-foreground">
                        {form.tipo_ajuste === "bloquear"
                          ? "No habrá turnos disponibles ese día."
                          : form.tipo_ajuste === "reemplazar"
                            ? "Esa fecha ignora el horario habitual y solo vale el rango indicado arriba."
                            : "El rango indicado arriba se suma al horario habitual de ese día."}
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Motivo (solo admin)</Label>
                      <Input
                        value={form.motivo_ajuste}
                        maxLength={200}
                        placeholder="Ej: feriado, capacitación, viaje…"
                        onChange={(ev) => setForm({ ...form, motivo_ajuste: ev.target.value })}
                      />
                    </div>
                    <p className="text-[11px] text-amber-500">
                      Un cambio puntual aplica a toda la agenda del profesor en esa fecha: no se puede limitar
                      por servicio ni por sede. Si necesitás eso, usá un horario habitual.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <Label>Servicios habilitados</Label>
                    <div className="rounded-md border border-border divide-y divide-border max-h-56 overflow-y-auto">
                      {serviciosActivos.map((s) => (
                        <label key={s.id} className="flex items-center gap-2 px-3 py-2 cursor-pointer">
                          <Checkbox
                            checked={form.servicio_ids.includes(s.id)}
                            onCheckedChange={() => toggleServicio(s.id)}
                          />
                          <span className="text-sm text-foreground">{s.nombre}</span>
                        </label>
                      ))}
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Se guarda un bloque único de trabajo; internamente habilita cada servicio elegido.
                    </p>
                  </div>
                )}
              </div>
            )}

          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenForm(false)}>Cancelar</Button>
            <Button variant="gold" disabled={saving} onClick={guardarBloque}>
              {saving ? "Guardando…" : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminAgenda;
