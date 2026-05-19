import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type TareaEstado = "pendiente" | "en_curso" | "hecha" | "pospuesta";
export type TareaPrioridad = "baja" | "media" | "alta" | "critica";
export type TareaRol = "super_admin" | "admin" | "coach" | "deposito";
export type TareaTipo = "automatica" | "manual" | "recurrente";

export interface Tarea {
  id: string;
  tipo: TareaTipo;
  origen: string;
  titulo: string;
  descripcion: string | null;
  rol_destino: TareaRol;
  asignado_user_id: string | null;
  entidad_tipo: string | null;
  entidad_id: string | null;
  prioridad: TareaPrioridad;
  fecha_vencimiento: string | null;
  estado: TareaEstado;
  pospuesta_hasta: string | null;
  nota_cierre: string | null;
  cerrada_por: string | null;
  cerrada_at: string | null;
  dedupe_key: string | null;
  metadata: Record<string, any>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type TareaScope = "mias" | "mi_rol" | "todas";

export function useTareas(scope: TareaScope, userId: string | null, isSuperAdmin: boolean) {
  const [tareas, setTareas] = useState<Tarea[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase.from("tareas" as any).select("*").order("created_at", { ascending: false });
    if (scope === "mias" && userId) q = q.eq("asignado_user_id", userId);
    const { data, error } = await q;
    if (!error) setTareas((data || []) as unknown as Tarea[]);
    setLoading(false);
  }, [scope, userId]);

  const generate = useCallback(async () => {
    setGenerating(true);
    const { data, error } = await supabase.rpc("generate_tareas_automaticas" as any);
    setGenerating(false);
    await load();
    return { count: (data as number) || 0, error };
  }, [load]);

  // Al montar: auto-resolver tareas obsoletas (ej: renovación ya gestionada) antes de cargar
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try { await supabase.rpc("auto_resolve_tareas_automaticas" as any); } catch {}
      if (!cancelled) await load();
    })();
    return () => { cancelled = true; };
  }, [load]);

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel("tareas-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "tareas" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  const updateTarea = useCallback(async (id: string, patch: Partial<Tarea>, action: string, nota?: string) => {
    const before = tareas.find(t => t.id === id);
    const { error } = await supabase.from("tareas" as any).update(patch).eq("id", id);
    if (error) throw error;
    if (userId) {
      await supabase.from("tareas_historial" as any).insert({
        tarea_id: id, accion: action,
        estado_anterior: before?.estado, estado_nuevo: patch.estado ?? before?.estado,
        nota: nota || null, changed_by: userId,
      });
    }
    await load();
  }, [tareas, userId, load]);

  const createTarea = useCallback(async (t: Partial<Tarea>) => {
    const { data, error } = await supabase.from("tareas" as any).insert({
      tipo: "manual", origen: "manual", created_by: userId, ...t,
    }).select().single();
    if (error) throw error;
    await load();
    return data;
  }, [userId, load]);

  return { tareas, loading, generating, generate, updateTarea, createTarea, reload: load };
}
