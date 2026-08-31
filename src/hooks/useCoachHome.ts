import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { nextOccurrence, toLocalIso, type AgendaSlotLite } from "@/lib/coachAgenda";

export type ProximaClase = {
  agenda_id: string;
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
  grupo: string | null;
  sede_id: string | null;
  sede_nombre: string | null;
  honorario_id: string | null;
  confirmada: boolean;
  plan: { titulo: string | null; descripcion: string | null; tipo: string | null } | null;
};

export type ProximoTurno = {
  id: string;
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
  servicio: string;
  alumno: string;
  celular: string | null;
  sede_nombre: string | null;
  estado_operativo: string | null;
  pago_estado: string | null;
};

export type ResumenLiquidacion = {
  mes: string;
  confirmado: number;
  enRevision: number;
  pagado: number;
  cantidad: number;
};

const currentMonth = () => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`;
};

/** Datos del home del coach: próxima clase (con plan), próximo turno y resumen de liquidación. */
export function useCoachHome() {
  const [loading, setLoading] = useState(true);
  const [coachId, setCoachId] = useState<string | null>(null);
  const [proximaClase, setProximaClase] = useState<ProximaClase | null>(null);
  const [proximoTurno, setProximoTurno] = useState<ProximoTurno | null>(null);
  const [resumen, setResumen] = useState<ResumenLiquidacion | null>(null);
  const [tareasPendientes, setTareasPendientes] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setLoading(false); return; }

    const { data: coach } = await supabase
      .from("coaches").select("id").eq("user_id", session.user.id).maybeSingle();
    if (!coach) { setLoading(false); return; }
    const cid = (coach as any).id as string;
    setCoachId(cid);

    const hoy = toLocalIso(new Date());
    const mes = currentMonth();
    const [y, m] = mes.split("-").map(Number);
    const desde = `${mes}-01`;
    const hasta = toLocalIso(new Date(y, m, 0));

    const [agendaRes, turnoRes, movsRes, tareasRes] = await Promise.all([
      supabase
        .from("agenda_grupal")
        .select("id, dia_semana, hora_inicio, hora_fin, grupo, sede_id, honorario_id, sedes:sede_id(nombre)")
        .eq("coach_id", cid).eq("activo", true),
      supabase
        .from("reservas_turnera")
        .select("id, fecha, hora_inicio, hora_fin, nombre, apellido, celular, pago_estado, estado_operativo, servicios_turnera:servicio_id(nombre), sedes:sede_id(nombre)")
        .eq("coach_id", cid)
        .gte("fecha", hoy)
        .not("estado_operativo", "in", "(cancelada,cancelada_por_admin,realizada)")
        .order("fecha").order("hora_inicio").limit(1),
      supabase
        .from("movimientos_liquidacion")
        .select("total, estado_economico")
        .eq("coach_id", cid).gte("fecha", desde).lte("fecha", hasta),
      supabase
        .from("tareas" as any)
        .select("id", { count: "exact", head: true })
        .eq("rol_destino", "coach")
        .in("estado", ["pendiente", "en_curso"]),
    ]);

    // Próxima clase grupal
    const slots = (agendaRes.data || []) as any[];
    const next = nextOccurrence(slots as AgendaSlotLite[]);
    if (next) {
      const s: any = next.slot;
      const [planRes, dictadaRes] = await Promise.all([
        s.grupo
          ? supabase.from("entrenamientos").select("titulo, descripcion, tipo")
              .eq("grupo", s.grupo).eq("fecha", next.fecha).maybeSingle()
          : Promise.resolve({ data: null } as any),
        supabase.from("clases_dictadas").select("id")
          .eq("coach_id", cid).eq("agenda_id", s.id).eq("fecha", next.fecha).maybeSingle(),
      ]);
      setProximaClase({
        agenda_id: s.id,
        fecha: next.fecha,
        hora_inicio: s.hora_inicio,
        hora_fin: s.hora_fin,
        grupo: s.grupo,
        sede_id: s.sede_id,
        sede_nombre: s.sedes?.nombre ?? null,
        honorario_id: s.honorario_id,
        confirmada: !!dictadaRes.data,
        plan: (planRes as any).data || null,
      });
    } else setProximaClase(null);

    // Próximo turno de Turnera
    const t: any = (turnoRes.data || [])[0];
    setProximoTurno(t ? {
      id: t.id,
      fecha: t.fecha,
      hora_inicio: t.hora_inicio,
      hora_fin: t.hora_fin,
      servicio: t.servicios_turnera?.nombre || "Turno",
      alumno: `${t.nombre} ${t.apellido || ""}`.trim(),
      celular: t.celular,
      sede_nombre: t.sedes?.nombre || null,
      estado_operativo: t.estado_operativo,
      pago_estado: t.pago_estado,
    } : null);

    // Resumen de liquidación del mes en curso
    const movs = (movsRes.data || []) as any[];
    const sum = (pred: (e: string) => boolean) =>
      movs.filter(mv => pred(mv.estado_economico)).reduce((a, mv) => a + Number(mv.total || 0), 0);
    setResumen({
      mes,
      confirmado: sum(e => e === "liquidable" || e === "liquidada"),
      enRevision: sum(e => e === "pendiente_revision"),
      pagado: sum(e => e === "pagada"),
      cantidad: movs.length,
    });

    setTareasPendientes(tareasRes.count || 0);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return { loading, coachId, proximaClase, proximoTurno, resumen, tareasPendientes, reload: load };
}
