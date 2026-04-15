import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface MonthlyProgressData {
  planRealizadas: number;
  presenciales: number;
  extras: number;
  noRealizadas: number;
  totalPlanificadas: number;
  totalCompletadas: number;
  totalDenominador: number;
  porcentaje: number;
  loading: boolean;
}

export function useMonthlyProgress(alumnoId: string | null, grupo: string | null, refreshKey = 0) {
  const [data, setData] = useState<MonthlyProgressData>({
    planRealizadas: 0,
    presenciales: 0,
    extras: 0,
    noRealizadas: 0,
    totalPlanificadas: 0,
    totalCompletadas: 0,
    totalDenominador: 0,
    porcentaje: 0,
    loading: true,
  });

  useEffect(() => {
    if (!alumnoId || !grupo) {
      setData(prev => ({ ...prev, loading: false }));
      return;
    }

    const load = async () => {
      const now = new Date();
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      const fromDate = firstDay.toISOString().split("T")[0];
      const toDate = lastDay.toISOString().split("T")[0];
      const todayStr = now.toISOString().split("T")[0];

      // 1. Get planned trainings for this month
      // For "Personalizado" students, fetch by alumno_id; for group students, fetch by grupo
      let query = supabase
        .from("entrenamientos")
        .select("id, fecha, tipo")
        .eq("visible", true)
        .gte("fecha", fromDate)
        .lte("fecha", toDate);

      if (grupo === "Personalizado") {
        query = query.eq("alumno_id", alumnoId);
      } else {
        query = query.eq("grupo", grupo as any).is("alumno_id", null);
      }

      const { data: entrenamientos } = await query;

      const allEntrenamientos = entrenamientos || [];
      // Only past or today count for progress tracking
      const pastEntrenamientos = allEntrenamientos.filter(e => e.fecha <= todayStr);
      const pastIds = pastEntrenamientos.map(e => e.id);

      // 2. Get registro_sesiones for this student in this month
      const { data: registros } = await supabase
        .from("registro_sesiones")
        .select("id, entrenamiento_id, estado")
        .eq("alumno_id", alumnoId)
        .in("entrenamiento_id", pastIds.length > 0 ? pastIds : ["__none__"]);

      const registroMap = new Map((registros || []).map(r => [r.entrenamiento_id, r.estado]));

      // 3. Get asistencias (presenciales) for this month
      const { data: asistencias } = await supabase
        .from("asistencias")
        .select("id, entrenamiento_id, estado")
        .eq("alumno_id", alumnoId)
        .in("entrenamiento_id", pastIds.length > 0 ? pastIds : ["__none__"]);

      const asistenciaMap = new Map((asistencias || []).map(a => [a.entrenamiento_id, a.estado]));

      // 4. Get extras for this month
      const { data: extras } = await supabase
        .from("sesiones_extra")
        .select("id")
        .eq("alumno_id", alumnoId)
        .gte("fecha", fromDate)
        .lte("fecha", toDate);

      const extrasCount = extras?.length || 0;

      // 5. Calculate
      let planRealizadas = 0;
      let presenciales = 0;
      let noRealizadas = 0;

      for (const ent of pastEntrenamientos) {
        const regEstado = registroMap.get(ent.id);
        const asistEstado = asistenciaMap.get(ent.id);

        if (regEstado === "realizada") {
          planRealizadas++;
        } else if (regEstado === "no_realizada") {
          noRealizadas++;
        } else if (asistEstado === "asistio") {
          presenciales++;
        }
      }

      const totalPlanificadas = allEntrenamientos.length;
      const totalCompletadas = planRealizadas + presenciales + extrasCount;
      const totalDenominador = totalPlanificadas + extrasCount;
      const porcentaje = totalDenominador > 0
        ? Math.min(100, Math.round((totalCompletadas / totalDenominador) * 100))
        : 0;

      setData({
        planRealizadas,
        presenciales,
        extras: extrasCount,
        noRealizadas,
        totalPlanificadas,
        totalCompletadas,
        totalDenominador,
        porcentaje,
        loading: false,
      });
    };

    load();
  }, [alumnoId, grupo, refreshKey]);

  return data;
}
