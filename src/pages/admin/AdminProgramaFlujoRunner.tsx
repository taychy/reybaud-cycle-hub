import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Camera, CheckCircle, Loader2, Mail, ListTodo } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/hooks/use-toast";
import {
  fetchInstanceWithStages,
  completeStage,
  finalizeInstance,
  cancelInstance,
  ProcessTemplate,
  ProcessTemplateStage,
  ProcessInstance,
  ProcessInstanceStage,
} from "@/hooks/useProcesses";

const sb: any = supabase;

const AdminProgramaFlujoRunner = () => {
  const { cohortId, instanceId } = useParams<{ cohortId: string; instanceId: string }>();
  const navigate = useNavigate();

  const [instance, setInstance] = useState<ProcessInstance | null>(null);
  const [template, setTemplate] = useState<ProcessTemplate | null>(null);
  const [tplStages, setTplStages] = useState<ProcessTemplateStage[]>([]);
  const [instStages, setInstStages] = useState<ProcessInstanceStage[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [nota, setNota] = useState("");
  const [fotoUrl, setFotoUrl] = useState<string | null>(null);
  const [emailTemplateKey, setEmailTemplateKey] = useState<string>("");
  const [emailTemplates, setEmailTemplates] = useState<Array<{ key: string; name: string }>>([]);
  const [taskCreating, setTaskCreating] = useState(false);

  const backTo = cohortId ? `/admin/programas/${cohortId}` : `/admin/procesos`;

  const load = async () => {
    if (!instanceId) return;
    setLoading(true);
    const data = await fetchInstanceWithStages(instanceId);
    setInstance(data.instance);
    setTemplate(data.template);
    setTplStages(data.templateStages);
    setInstStages(data.instanceStages);
    setLoading(false);
  };

  useEffect(() => { load(); }, [instanceId]);

  // Load email templates (best-effort — usa email_templates si existe)
  useEffect(() => {
    (async () => {
      const { data } = await sb.from("email_templates").select("key, description").eq("is_active", true).limit(100);
      setEmailTemplates((data || []).map((t: any) => ({ key: t.key, name: t.description || t.key })));
    })();
  }, []);

  const currentIdx = instStages.findIndex((s) => s.estado === "en_curso");
  const current = currentIdx >= 0 ? instStages[currentIdx] : null;
  const currentTpl = current ? tplStages.find((t) => t.id === current.template_stage_id) : null;
  const totalStages = instStages.length;
  const completedCount = instStages.filter((s) => s.estado === "completada").length;
  const progress = totalStages > 0 ? (completedCount / totalStages) * 100 : 0;

  useEffect(() => {
    if (current) {
      setNota(current.nota || "");
      setFotoUrl(current.foto_url || null);
      setEmailTemplateKey(current.entidad_ref_texto?.startsWith("email:") ? current.entidad_ref_texto.slice(6) : "");
    }
  }, [current?.id]);

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Sin sesión");
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${user.id}/${instanceId}/${current?.id}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("process-photos").upload(path, file, { upsert: true });
      if (error) throw error;
      setFotoUrl(path);
      toast({ title: "Foto subida" });
    } catch (e: any) {
      toast({ title: "Error al subir", description: e.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const generateTask = async () => {
    if (!currentTpl || !instance) return;
    setTaskCreating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await sb.from("tareas").insert({
        titulo: `[Playbook] ${currentTpl.titulo}`,
        descripcion: `${currentTpl.instrucciones || ""}\n\nGenerada desde el playbook del programa. Instancia: ${instance.id}`,
        estado: "pendiente",
        prioridad: "media",
        rol_destino: template?.rol_destino || "admin",
        entidad_tipo: "process_instance",
        entidad_id: instance.id,
        created_by: user?.id || null,
        origen: "playbook",
      });
      if (error) throw error;
      toast({ title: "Tarea generada", description: "Asignada al equipo. La verás en 'Tareas'." });
    } catch (e: any) {
      toast({ title: "Error al generar tarea", description: e.message, variant: "destructive" });
    } finally {
      setTaskCreating(false);
    }
  };

  const sendCohortEmail = async () => {
    if (!emailTemplateKey || !cohortId) {
      toast({ title: "Elegí una plantilla", description: "Seleccioná el mail a enviar a la cohorte.", variant: "destructive" });
      return false;
    }
    try {
      const { data, error } = await supabase.functions.invoke("send-cohort-playbook-email", {
        body: {
          plan_id: cohortId,
          template_key: emailTemplateKey,
          instance_id: instanceId,
          stage_id: current?.id,
        },
      });
      if (error) throw error;
      const sent = (data as any)?.sent ?? 0;
      const total = (data as any)?.total ?? 0;
      toast({ title: `Emails encolados: ${sent}/${total}` });
      return true;
    } catch (e: any) {
      toast({ title: "Error al enviar", description: e.message, variant: "destructive" });
      return false;
    }
  };

  const handleConfirmStage = async () => {
    if (!current || !currentTpl) return;
    if (currentTpl.requiere_foto && !fotoUrl) {
      return toast({ title: "Falta foto", description: "Esta etapa requiere una foto.", variant: "destructive" });
    }
    if (currentTpl.requiere_nota && !nota.trim()) {
      return toast({ title: "Falta nota", description: "Esta etapa requiere una nota.", variant: "destructive" });
    }
    setSaving(true);
    try {
      // Si la etapa tiene acción send_cohort_email, dispararla antes de completar
      if (currentTpl.accion_final === "send_cohort_email") {
        const ok = await sendCohortEmail();
        if (!ok) { setSaving(false); return; }
      }

      const { data: { user } } = await supabase.auth.getUser();
      const nextStage = instStages[currentIdx + 1];
      const isLast = !nextStage;
      await completeStage({
        instanceStageId: current.id,
        nextInstanceStageId: nextStage?.id || null,
        patch: {
          nota: nota.trim() || null,
          foto_url: fotoUrl,
          entidad_ref_texto: emailTemplateKey ? `email:${emailTemplateKey}` : null,
        },
        userId: user!.id,
      });
      if (isLast) {
        await finalizeInstance(instanceId!);
        toast({ title: "Playbook completado" });
        navigate(backTo);
        return;
      }
      toast({ title: "Etapa confirmada" });
      await load();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async () => {
    if (!confirm("¿Cancelar el playbook? No se podrá retomar.")) return;
    await cancelInstance(instanceId!);
    navigate(backTo);
  };

  if (loading) return <div className="text-center py-12"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>;
  if (!instance || !template) return <div className="text-center py-12 text-muted-foreground">No encontrado.</div>;

  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate(backTo)}>
          <ArrowLeft className="w-4 h-4 mr-1" /> {cohortId ? "Volver al programa" : "Volver a Procesos activos"}
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <CardTitle className="text-lg">{template.nombre}</CardTitle>
            <Badge variant="outline">{completedCount}/{totalStages}</Badge>
          </div>
          <Progress value={progress} className="h-2 mt-2" />
        </CardHeader>
        {template.descripcion && (
          <CardContent><p className="text-xs text-muted-foreground">{template.descripcion}</p></CardContent>
        )}
      </Card>

      <Card>
        <CardContent className="p-3 space-y-2">
          {instStages.map((s, i) => {
            const t = tplStages.find((x) => x.id === s.template_stage_id);
            return (
              <div key={s.id} className={`flex items-center gap-2 text-sm p-2 rounded ${s.estado === "en_curso" ? "bg-primary/10" : ""}`}>
                {s.estado === "completada" ? (
                  <CheckCircle className="w-4 h-4 text-green-500" />
                ) : (
                  <span className={`w-4 h-4 rounded-full border ${s.estado === "en_curso" ? "border-primary bg-primary/30" : "border-muted-foreground/40"}`} />
                )}
                <span className={s.estado === "completada" ? "line-through text-muted-foreground" : ""}>
                  {i + 1}. {t?.titulo}
                </span>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {current && currentTpl && (
        <Card className="border-primary/40">
          <CardHeader>
            <CardTitle className="text-base">{currentTpl.titulo}</CardTitle>
            <div className="flex gap-1 flex-wrap mt-1">
              {currentTpl.entidad_control === "cohort_task" && <Badge variant="outline" className="text-[10px]"><ListTodo className="w-3 h-3 mr-1" />Genera tarea</Badge>}
              {currentTpl.entidad_control === "cohort_kpi" && <Badge variant="outline" className="text-[10px]">KPI cohorte</Badge>}
              {currentTpl.accion_final === "send_cohort_email" && <Badge variant="outline" className="text-[10px]"><Mail className="w-3 h-3 mr-1" />Envía mail a cohorte</Badge>}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {currentTpl.instrucciones && (
              <p className="text-sm whitespace-pre-wrap text-muted-foreground">{currentTpl.instrucciones}</p>
            )}

            {/* Sub-tareas / checklist */}
            {Array.isArray(currentTpl.subtasks) && currentTpl.subtasks.length > 0 && (() => {
              const state = (current.subtasks_state || {}) as Record<string, { done: boolean }>;
              const done = currentTpl.subtasks.filter((s) => state[s.id]?.done).length;
              const total = currentTpl.subtasks.length;
              const toggle = async (id: string, checked: boolean) => {
                const { data: { user } } = await supabase.auth.getUser();
                const next = {
                  ...(state || {}),
                  [id]: checked
                    ? { done: true, at: new Date().toISOString(), by: user?.id || null }
                    : { done: false },
                };
                // Optimistic update
                setInstStages((prev) => prev.map((s) => s.id === current.id ? { ...s, subtasks_state: next } : s));
                const { error } = await sb
                  .from("process_instance_stages")
                  .update({ subtasks_state: next })
                  .eq("id", current.id);
                if (error) {
                  toast({ title: "No se pudo guardar", description: error.message, variant: "destructive" });
                  await load();
                }
              };
              return (
                <div className="rounded-md border border-border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Checklist</span>
                    <Badge variant="outline" className="text-[10px]">{done}/{total}</Badge>
                  </div>
                  <div className="space-y-1.5">
                    {currentTpl.subtasks.map((st) => {
                      const isDone = !!state[st.id]?.done;
                      return (
                        <label key={st.id} className="flex items-start gap-2 text-sm cursor-pointer hover:bg-muted/40 rounded px-1 py-0.5">
                          <Checkbox
                            checked={isDone}
                            onCheckedChange={(v) => toggle(st.id, !!v)}
                            className="mt-0.5"
                          />
                          <span className={isDone ? "line-through text-muted-foreground" : ""}>{st.titulo}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {currentTpl.entidad_control === "cohort_task" && (
              <div className="bg-muted/40 rounded p-3 space-y-2">
                <p className="text-xs text-muted-foreground">Esta etapa está pensada para delegar en el equipo.</p>
                <Button size="sm" variant="secondary" onClick={generateTask} disabled={taskCreating}>
                  {taskCreating ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <ListTodo className="w-4 h-4 mr-1" />}
                  Generar tarea al equipo
                </Button>
              </div>
            )}

            {currentTpl.accion_final === "send_cohort_email" && (
              <div className="bg-muted/40 rounded p-3 space-y-2">
                <label className="text-sm font-medium">Plantilla de mail a enviar</label>
                <Select value={emailTemplateKey} onValueChange={setEmailTemplateKey}>
                  <SelectTrigger><SelectValue placeholder="Elegí una plantilla…" /></SelectTrigger>
                  <SelectContent>
                    {emailTemplates.length === 0 && <SelectItem value="__none" disabled>Sin plantillas configuradas</SelectItem>}
                    {emailTemplates.map((t) => (
                      <SelectItem key={t.key} value={t.key}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">Al confirmar la etapa, se enviará a todos los inscriptos activos.</p>
              </div>
            )}

            {currentTpl.requiere_foto && (
              <div>
                <label className="text-sm font-medium block mb-2">Foto {fotoUrl && <span className="text-green-500 text-xs">✓ subida</span>}</label>
                <label className="flex items-center justify-center gap-2 border-2 border-dashed border-border rounded-md p-6 cursor-pointer hover:border-primary">
                  {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Camera className="w-5 h-5" />}
                  <span className="text-sm">{fotoUrl ? "Cambiar foto" : "Subir foto"}</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
                  />
                </label>
              </div>
            )}

            {currentTpl.requiere_nota && (
              <div>
                <label className="text-sm font-medium block mb-1">Nota</label>
                <Textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={4} />
              </div>
            )}

            <div className="flex gap-2">
              <Button onClick={handleConfirmStage} disabled={saving} className="flex-1">
                {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-1" />}
                {currentIdx === totalStages - 1 ? "Finalizar playbook" : "Confirmar etapa"}
              </Button>
              <Button variant="ghost" onClick={handleCancel}>Cancelar</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default AdminProgramaFlujoRunner;
