import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, Camera, CheckCircle, Loader2, Upload } from "lucide-react";
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
import StockCountStage from "@/components/deposito/StockCountStage";

const DepositoProcesoRunner = () => {
  const { instanceId } = useParams<{ instanceId: string }>();
  const navigate = useNavigate();

  const [instance, setInstance] = useState<ProcessInstance | null>(null);
  const [template, setTemplate] = useState<ProcessTemplate | null>(null);
  const [tplStages, setTplStages] = useState<ProcessTemplateStage[]>([]);
  const [instStages, setInstStages] = useState<ProcessInstanceStage[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Per-stage form state
  const [nota, setNota] = useState("");
  const [fotoUrl, setFotoUrl] = useState<string | null>(null);
  const [entidadRefId, setEntidadRefId] = useState("");

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

  const currentIdx = instStages.findIndex((s) => s.estado === "en_curso");
  const current = currentIdx >= 0 ? instStages[currentIdx] : null;
  const currentTpl = current ? tplStages.find((t) => t.id === current.template_stage_id) : null;
  const totalStages = instStages.length;
  const completedCount = instStages.filter((s) => s.estado === "completada").length;
  const progress = totalStages > 0 ? (completedCount / totalStages) * 100 : 0;

  // Reset form when current stage changes
  useEffect(() => {
    if (current) {
      setNota(current.nota || "");
      setFotoUrl(current.foto_url || null);
      setEntidadRefId(current.entidad_ref_id || current.entidad_ref_texto || "");
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
      const { data: { user } } = await supabase.auth.getUser();
      const nextStage = instStages[currentIdx + 1];
      const isLast = !nextStage;
      const isUuid = /^[0-9a-f-]{36}$/i.test(entidadRefId);
      await completeStage({
        instanceStageId: current.id,
        nextInstanceStageId: nextStage?.id || null,
        patch: {
          nota: nota.trim() || null,
          foto_url: fotoUrl,
          entidad_ref_id: isUuid ? entidadRefId : null,
          entidad_ref_texto: !isUuid && entidadRefId ? entidadRefId : null,
        },
        userId: user!.id,
      });
      if (isLast) {
        await finalizeInstance(instanceId!);
        if (currentTpl.accion_final === "send_report") {
          toast({ title: "Proceso completado", description: "Se envió el reporte por mail." });
        } else {
          toast({ title: "Proceso completado" });
        }
        navigate("/deposito/alertas");
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
    if (!confirm("¿Cancelar el proceso? No se podrá retomar.")) return;
    await cancelInstance(instanceId!);
    navigate("/deposito/alertas");
  };

  if (loading) return <div className="text-center py-12"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>;
  if (!instance || !template) return <div className="text-center py-12 text-muted-foreground">No encontrado.</div>;

  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate("/deposito/alertas")}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Volver
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
        <CardContent>
          <p className="text-xs text-muted-foreground">{template.descripcion}</p>
        </CardContent>
      </Card>

      {/* Lista de etapas con estado */}
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

      {/* Etapa actual */}
      {current && currentTpl && (
        <Card className="border-primary/40">
          <CardHeader>
            <CardTitle className="text-base">{currentTpl.titulo}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {currentTpl.instrucciones && (
              <p className="text-sm whitespace-pre-wrap">{currentTpl.instrucciones}</p>
            )}

            {currentTpl.requiere_foto && (
              <div>
                <label className="text-sm font-medium block mb-2">Foto {fotoUrl && <span className="text-green-500 text-xs">✓ subida</span>}</label>
                <label className="flex items-center justify-center gap-2 border-2 border-dashed border-border rounded-md p-6 cursor-pointer hover:border-primary">
                  {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Camera className="w-5 h-5" />}
                  <span className="text-sm">{fotoUrl ? "Cambiar foto" : "Sacar / subir foto"}</span>
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

            {currentTpl.entidad_control !== "none" && (
              <div>
                <label className="text-sm font-medium block mb-1">
                  {currentTpl.entidad_control === "store_preorder" ? "ID o referencia de preventa" : "Referencia del pedido al proveedor"}
                </label>
                <Input
                  value={entidadRefId}
                  onChange={(e) => setEntidadRefId(e.target.value)}
                  placeholder={currentTpl.entidad_control === "store_preorder" ? "UUID de preventa o texto" : "N° de pedido / texto libre"}
                />
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
                {currentIdx === totalStages - 1 ? "Finalizar proceso" : "Confirmar etapa"}
              </Button>
              <Button variant="ghost" onClick={handleCancel}>Cancelar</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default DepositoProcesoRunner;
