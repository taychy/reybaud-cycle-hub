import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  buildAgendaEventos,
  detectarConflictos,
  startOfWeek,
  weekDays,
  type AgendaEvento,
  type AusenciaRow,
  type DisponibilidadRow,
} from "@/lib/agenda";

/**
 * Fuente ÚNICA de datos de la agenda operativa semanal.
 * La usan tanto `/admin/agenda` (vista ampliada) como el calendario
 * embebido en el Resumen Admin: misma normalización, mismos conflictos.
 * No crea registros propios: sólo lee las fuentes existentes.
 */
export function useAgendaSemana(initialMonday?: Date) {
  const [monday, setMonday] = useState<Date>(() => startOfWeek(initialMonday ?? new Date()));
  const [coaches, setCoaches] = useState<any[]>([]);
  const [sedes, setSedes] = useState<any[]>([]);
  const [servicios, setServicios] = useState<any[]>([]);
  const [grupal, setGrupal] = useState<any[]>([]);
  const [turnos, setTurnos] = useState<any[]>([]);
  const [disp, setDisp] = useState<DisponibilidadRow[]>([]);
  const [ausencias, setAusencias] = useState<AusenciaRow[]>([]);
  const [solicitudesPendientes, setSolicitudesPendientes] = useState(0);
  const [loading, setLoading] = useState(true);

  const dias = useMemo(() => weekDays(monday), [monday]);

  const reload = useCallback(async () => {
    setLoading(true);
    const desde = dias[0];
    const hasta = dias[6];
    const [coachRes, sedeRes, servRes, agRes, resRes, dispRes, ausRes, solRes] = await Promise.all([
      supabase.from("coaches").select("id, nombre, estado, sede_id").order("nombre"),
      supabase.from("sedes").select("id, nombre, activa").order("nombre"),
      supabase.from("servicios_turnera").select("id, nombre, activo, archivado").order("nombre"),
      supabase.from("agenda_grupal").select("*"),
      supabase
        .from("reservas_turnera")
        .select(
          "id, fecha, hora_inicio, hora_fin, coach_id, sede_id, nombre, apellido, estado_operativo, pago_estado, servicio_id",
        )
        .gte("fecha", desde)
        .lte("fecha", hasta),
      supabase.from("disponibilidad_coaches").select("*"),
      supabase
        .from("ausencias_coaches")
        .select("id, coach_id, fecha_inicio, fecha_fin, todo_el_dia, hora_inicio, hora_fin, motivo")
        .lte("fecha_inicio", hasta)
        .gte("fecha_fin", desde),
      supabase
        .from("agenda_solicitudes" as any)
        .select("id", { count: "exact", head: true })
        .eq("estado", "pendiente"),
    ]);

    setCoaches((coachRes.data as any[]) || []);
    setSedes((sedeRes.data as any[]) || []);
    setServicios((servRes.data as any[]) || []);
    setGrupal((agRes.data as any[]) || []);
    setTurnos((resRes.data as any[]) || []);
    setDisp((dispRes.data as any[]) || []);
    setAusencias((ausRes.data as any[]) || []);
    setSolicitudesPendientes(solRes.count || 0);
    setLoading(false);
  }, [dias]);

  useEffect(() => { reload(); }, [reload]);

  const coachNombre = useCallback(
    (id: string | null) => coaches.find((c) => c.id === id)?.nombre || "—",
    [coaches],
  );
  const sedeNombre = useCallback(
    (id: string | null) => (id ? sedes.find((s) => s.id === id)?.nombre || null : null),
    [sedes],
  );
  const servicioNombre = useCallback(
    (id: string | null) => servicios.find((s) => s.id === id)?.nombre || "Turno",
    [servicios],
  );

  const eventos = useMemo(
    () =>
      buildAgendaEventos({
        dias,
        grupal,
        turnos,
        disponibilidad: disp,
        ausencias,
        coachNombre,
        sedeNombre,
        servicioNombre,
      }),
    [dias, grupal, turnos, disp, ausencias, coachNombre, sedeNombre, servicioNombre],
  );

  const conflictos = useMemo(() => detectarConflictos(eventos), [eventos]);

  return {
    monday,
    setMonday,
    dias,
    loading,
    reload,
    coaches,
    sedes,
    servicios,
    eventos,
    conflictos,
    solicitudesPendientes,
    coachNombre,
    sedeNombre,
    servicioNombre,
  };
}
