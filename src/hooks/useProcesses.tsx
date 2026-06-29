import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type EntidadControl = "none" | "store_preorder" | "supplier_order";
export type AccionFinal = "none" | "send_report";
export type InstanceEstado = "en_curso" | "completada" | "cancelada";
export type StageEstado = "pendiente" | "en_curso" | "completada";

export interface ProcessTemplate {
  id: string;
  nombre: string;
  descripcion: string | null;
  rol_destino: string;
  icono: string | null;
  activo: boolean;
  created_at: string;
}

export interface ProcessTemplateStage {
  id: string;
  template_id: string;
  orden: number;
  titulo: string;
  instrucciones: string | null;
  requiere_foto: boolean;
  requiere_nota: boolean;
  entidad_control: EntidadControl;
  accion_final: AccionFinal;
}

export interface ProcessInstance {
  id: string;
  template_id: string;
  iniciado_por: string;
  asignado_a: string | null;
  destinatario_reporte_email: string | null;
  estado: InstanceEstado;
  started_at: string;
  completed_at: string | null;
  metadata: Record<string, any>;
}

export interface ProcessInstanceStage {
  id: string;
  instance_id: string;
  template_stage_id: string;
  orden: number;
  estado: StageEstado;
  foto_url: string | null;
  nota: string | null;
  entidad_ref_id: string | null;
  entidad_ref_texto: string | null;
  completed_by: string | null;
  completed_at: string | null;
}

const sb: any = supabase;

export function useProcessTemplates(includeInactive = false) {
  const [templates, setTemplates] = useState<ProcessTemplate[]>([]);
  const [stages, setStages] = useState<ProcessTemplateStage[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    let q = sb.from("process_templates").select("*").order("created_at", { ascending: true });
    if (!includeInactive) q = q.eq("activo", true);
    const { data: tpls } = await q;
    setTemplates((tpls || []) as ProcessTemplate[]);
    const { data: st } = await sb
      .from("process_template_stages")
      .select("*")
      .order("orden", { ascending: true });
    setStages((st || []) as ProcessTemplateStage[]);
    setLoading(false);
  }, [includeInactive]);

  useEffect(() => { load(); }, [load]);

  return { templates, stages, loading, reload: load };
}

export function useMyInstances(userId: string | null) {
  const [instances, setInstances] = useState<ProcessInstance[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) { setInstances([]); setLoading(false); return; }
    setLoading(true);
    const { data } = await sb
      .from("process_instances")
      .select("*")
      .eq("estado", "en_curso")
      .order("started_at", { ascending: false });
    setInstances((data || []) as ProcessInstance[]);
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const ch = sb
      .channel("process-instances")
      .on("postgres_changes", { event: "*", schema: "public", table: "process_instances" }, () => load())
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [load]);

  return { instances, loading, reload: load };
}

export async function startProcessInstance(params: {
  template_id: string;
  iniciado_por: string;
  destinatario_reporte_email: string | null;
}): Promise<string> {
  const { data, error } = await sb
    .from("process_instances")
    .insert({
      template_id: params.template_id,
      iniciado_por: params.iniciado_por,
      asignado_a: params.iniciado_por,
      destinatario_reporte_email: params.destinatario_reporte_email,
      estado: "en_curso",
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function fetchInstanceWithStages(instanceId: string) {
  const { data: inst } = await sb.from("process_instances").select("*").eq("id", instanceId).single();
  const { data: stages } = await sb
    .from("process_instance_stages")
    .select("*")
    .eq("instance_id", instanceId)
    .order("orden", { ascending: true });
  const tplStages = inst
    ? (await sb.from("process_template_stages").select("*").eq("template_id", inst.template_id).order("orden", { ascending: true })).data
    : [];
  const tpl = inst ? (await sb.from("process_templates").select("*").eq("id", inst.template_id).single()).data : null;
  return {
    instance: inst as ProcessInstance,
    template: tpl as ProcessTemplate,
    templateStages: (tplStages || []) as ProcessTemplateStage[],
    instanceStages: (stages || []) as ProcessInstanceStage[],
  };
}

export async function completeStage(params: {
  instanceStageId: string;
  nextInstanceStageId: string | null;
  patch: Partial<ProcessInstanceStage>;
  userId: string;
}) {
  const { error } = await sb
    .from("process_instance_stages")
    .update({
      ...params.patch,
      estado: "completada",
      completed_by: params.userId,
      completed_at: new Date().toISOString(),
    })
    .eq("id", params.instanceStageId);
  if (error) throw error;
  if (params.nextInstanceStageId) {
    await sb.from("process_instance_stages").update({ estado: "en_curso" }).eq("id", params.nextInstanceStageId);
  }
}

export async function finalizeInstance(instanceId: string) {
  const { error } = await sb
    .from("process_instances")
    .update({ estado: "completada", completed_at: new Date().toISOString() })
    .eq("id", instanceId);
  if (error) throw error;
  try {
    await sb.functions.invoke("process-complete-instance", { body: { instance_id: instanceId } });
  } catch (e) {
    console.error("process-complete-instance error", e);
  }
}

export async function cancelInstance(instanceId: string) {
  const { error } = await sb
    .from("process_instances")
    .update({ estado: "cancelada", completed_at: new Date().toISOString() })
    .eq("id", instanceId);
  if (error) throw error;
}
