import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowLeft, Plus, Trash2, Pencil, ChevronUp, ChevronDown, Save } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  useProcessTemplates,
  ProcessTemplate,
  ProcessTemplateStage,
  EntidadControl,
  AccionFinal,
} from "@/hooks/useProcesses";

const sb: any = supabase;

const AdminProcessTemplates = () => {
  const { templates, stages, loading, reload } = useProcessTemplates(true);
  const [editing, setEditing] = useState<ProcessTemplate | null>(null);
  const [creating, setCreating] = useState(false);

  const createTemplate = async () => {
    const { data, error } = await sb
      .from("process_templates")
      .insert({ nombre: "Nueva plantilla", rol_destino: "deposito", activo: false })
      .select()
      .single();
    if (error) return toast({ title: "Error", description: error.message, variant: "destructive" });
    await reload();
    setEditing(data as ProcessTemplate);
  };

  const deleteTemplate = async (id: string) => {
    if (!confirm("¿Eliminar plantilla? Esta acción es permanente.")) return;
    const { error } = await sb.from("process_templates").delete().eq("id", id);
    if (error) return toast({ title: "Error", description: error.message, variant: "destructive" });
    toast({ title: "Plantilla eliminada" });
    reload();
  };

  const toggleActive = async (t: ProcessTemplate) => {
    await sb.from("process_templates").update({ activo: !t.activo }).eq("id", t.id);
    reload();
  };

  if (editing) {
    return (
      <TemplateEditor
        template={editing}
        initialStages={stages.filter((s) => s.template_id === editing.id)}
        onClose={() => { setEditing(null); reload(); }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/admin/resumen">
          <Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4 mr-1" /> Volver a Resumen</Button>
        </Link>
      </div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold uppercase tracking-wider">Plantillas de Procesos</h1>
          <p className="text-sm text-muted-foreground">Definí los procesos guiados que ejecutan los usuarios (depósito, coach, admin).</p>
        </div>
        <Button onClick={createTemplate}><Plus className="w-4 h-4 mr-1" /> Nueva plantilla</Button>
      </div>

      {loading ? (
        <div className="text-center text-muted-foreground py-8">Cargando…</div>
      ) : templates.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">No hay plantillas todavía.</CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {templates.map((t) => {
            const tStages = stages.filter((s) => s.template_id === t.id);
            return (
              <Card key={t.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-base">{t.nombre}</CardTitle>
                      <p className="text-xs text-muted-foreground mt-1">{t.descripcion || "Sin descripción"}</p>
                    </div>
                    <Badge variant={t.activo ? "default" : "outline"}>{t.activo ? "Activa" : "Inactiva"}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="text-xs text-muted-foreground">
                    {tStages.length} etapa{tStages.length === 1 ? "" : "s"} · rol: <span className="font-medium">{t.rol_destino}</span>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Button size="sm" variant="outline" onClick={() => setEditing(t)}>
                      <Pencil className="w-3 h-3 mr-1" /> Editar
                    </Button>
                    <div className="flex items-center gap-2">
                      <Switch checked={t.activo} onCheckedChange={() => toggleActive(t)} />
                      <span className="text-xs">Activa</span>
                    </div>
                    <Button size="sm" variant="ghost" className="text-destructive ml-auto" onClick={() => deleteTemplate(t.id)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ---------------- Editor ----------------

function TemplateEditor({
  template,
  initialStages,
  onClose,
}: {
  template: ProcessTemplate;
  initialStages: ProcessTemplateStage[];
  onClose: () => void;
}) {
  const [nombre, setNombre] = useState(template.nombre);
  const [descripcion, setDescripcion] = useState(template.descripcion || "");
  const [rolDestino, setRolDestino] = useState(template.rol_destino);
  const [icono, setIcono] = useState(template.icono || "");
  const [activo, setActivo] = useState(template.activo);
  const [stages, setStages] = useState<ProcessTemplateStage[]>(
    [...initialStages].sort((a, b) => a.orden - b.orden)
  );
  const [editingStage, setEditingStage] = useState<ProcessTemplateStage | null>(null);
  const [saving, setSaving] = useState(false);

  const saveTemplate = async () => {
    setSaving(true);
    const { error } = await sb
      .from("process_templates")
      .update({ nombre, descripcion: descripcion || null, rol_destino: rolDestino, icono: icono || null, activo })
      .eq("id", template.id);
    setSaving(false);
    if (error) return toast({ title: "Error", description: error.message, variant: "destructive" });
    toast({ title: "Guardado" });
  };

  const addStage = async () => {
    const next = (stages[stages.length - 1]?.orden || 0) + 1;
    const { data, error } = await sb
      .from("process_template_stages")
      .insert({
        template_id: template.id,
        orden: next,
        titulo: `Etapa ${next}`,
        requiere_foto: false,
        requiere_nota: false,
        entidad_control: "none",
        accion_final: "none",
      })
      .select()
      .single();
    if (error) return toast({ title: "Error", description: error.message, variant: "destructive" });
    setStages([...stages, data as ProcessTemplateStage]);
    setEditingStage(data as ProcessTemplateStage);
  };

  const deleteStage = async (id: string) => {
    if (!confirm("¿Eliminar etapa?")) return;
    const { error } = await sb.from("process_template_stages").delete().eq("id", id);
    if (error) return toast({ title: "Error", description: error.message, variant: "destructive" });
    setStages(stages.filter((s) => s.id !== id));
  };

  const moveStage = async (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= stages.length) return;
    const a = stages[idx], b = stages[target];
    // swap ordens, using a temp negative to avoid unique violation
    await sb.from("process_template_stages").update({ orden: -1 }).eq("id", a.id);
    await sb.from("process_template_stages").update({ orden: a.orden }).eq("id", b.id);
    await sb.from("process_template_stages").update({ orden: b.orden }).eq("id", a.id);
    const newStages = [...stages];
    newStages[idx] = { ...b, orden: a.orden };
    newStages[target] = { ...a, orden: b.orden };
    setStages(newStages.sort((x, y) => x.orden - y.orden));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onClose}><ArrowLeft className="w-4 h-4 mr-1" /> Volver</Button>
        <h1 className="text-xl font-heading font-bold uppercase tracking-wider">Editar plantilla</h1>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Datos generales</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div><Label>Nombre</Label><Input value={nombre} onChange={(e) => setNombre(e.target.value)} /></div>
          <div><Label>Descripción</Label><Textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Rol destino</Label>
              <Select value={rolDestino} onValueChange={setRolDestino}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="deposito">Depósito</SelectItem>
                  <SelectItem value="coach">Coach</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Icono (lucide)</Label><Input value={icono} onChange={(e) => setIcono(e.target.value)} placeholder="PackagePlus" /></div>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={activo} onCheckedChange={setActivo} />
            <span className="text-sm">Plantilla activa</span>
          </div>
          <Button onClick={saveTemplate} disabled={saving}><Save className="w-4 h-4 mr-1" /> Guardar datos</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Etapas</CardTitle>
          <Button size="sm" onClick={addStage}><Plus className="w-4 h-4 mr-1" /> Agregar etapa</Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {stages.length === 0 && <p className="text-sm text-muted-foreground">Aún no hay etapas.</p>}
          {stages.map((s, idx) => (
            <div key={s.id} className="flex items-start gap-2 p-3 border border-border rounded-md">
              <div className="flex flex-col gap-1">
                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => moveStage(idx, -1)}><ChevronUp className="w-3 h-3" /></Button>
                <span className="text-xs text-center text-muted-foreground">{s.orden}</span>
                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => moveStage(idx, 1)}><ChevronDown className="w-3 h-3" /></Button>
              </div>
              <div className="flex-1">
                <p className="font-medium text-sm">{s.titulo}</p>
                <p className="text-xs text-muted-foreground line-clamp-2">{s.instrucciones || "Sin instrucciones"}</p>
                <div className="flex gap-2 mt-1 text-[10px] text-muted-foreground">
                  {s.requiere_foto && <Badge variant="outline" className="text-[10px]">📷 foto</Badge>}
                  {s.requiere_nota && <Badge variant="outline" className="text-[10px]">📝 nota</Badge>}
                  {s.entidad_control !== "none" && <Badge variant="outline" className="text-[10px]">{s.entidad_control}</Badge>}
                  {s.accion_final !== "none" && <Badge variant="outline" className="text-[10px]">→ {s.accion_final}</Badge>}
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingStage(s)}><Pencil className="w-3 h-3" /></Button>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => deleteStage(s.id)}><Trash2 className="w-3 h-3" /></Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <StageEditDialog
        stage={editingStage}
        onClose={() => setEditingStage(null)}
        onSaved={(updated) => {
          setStages(stages.map((s) => (s.id === updated.id ? updated : s)));
          setEditingStage(null);
        }}
      />
    </div>
  );
}

function StageEditDialog({
  stage,
  onClose,
  onSaved,
}: {
  stage: ProcessTemplateStage | null;
  onClose: () => void;
  onSaved: (s: ProcessTemplateStage) => void;
}) {
  const [titulo, setTitulo] = useState("");
  const [instrucciones, setInstrucciones] = useState("");
  const [requiereFoto, setRequiereFoto] = useState(false);
  const [requiereNota, setRequiereNota] = useState(false);
  const [entidadControl, setEntidadControl] = useState<EntidadControl>("none");
  const [accionFinal, setAccionFinal] = useState<AccionFinal>("none");

  useEffect(() => {
    if (stage) {
      setTitulo(stage.titulo);
      setInstrucciones(stage.instrucciones || "");
      setRequiereFoto(stage.requiere_foto);
      setRequiereNota(stage.requiere_nota);
      setEntidadControl(stage.entidad_control);
      setAccionFinal(stage.accion_final);
    }
  }, [stage?.id]);


  const save = async () => {
    if (!stage) return;
    const patch = {
      titulo,
      instrucciones: instrucciones || null,
      requiere_foto: requiereFoto,
      requiere_nota: requiereNota,
      entidad_control: entidadControl,
      accion_final: accionFinal,
    };
    const { error } = await sb.from("process_template_stages").update(patch).eq("id", stage.id);
    if (error) return toast({ title: "Error", description: error.message, variant: "destructive" });
    onSaved({ ...stage, ...patch });
    // reset for next open
    setTitulo(""); setInstrucciones("");
  };

  return (
    <Dialog open={!!stage} onOpenChange={(o) => { if (!o) { setTitulo(""); setInstrucciones(""); onClose(); } }}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Editar etapa</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Título</Label><Input value={titulo} onChange={(e) => setTitulo(e.target.value)} /></div>
          <div><Label>Instrucciones</Label><Textarea rows={4} value={instrucciones} onChange={(e) => setInstrucciones(e.target.value)} /></div>
          <div className="flex items-center gap-2">
            <Switch checked={requiereFoto} onCheckedChange={setRequiereFoto} /><span className="text-sm">Requiere foto</span>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={requiereNota} onCheckedChange={setRequiereNota} /><span className="text-sm">Requiere nota</span>
          </div>
          <div>
            <Label>Entidad a controlar</Label>
            <Select value={entidadControl} onValueChange={(v) => setEntidadControl(v as EntidadControl)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Ninguna</SelectItem>
                <SelectItem value="store_preorder">Preventa (store_preorder)</SelectItem>
                <SelectItem value="supplier_order">Pedido a proveedor (texto libre)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Acción final</Label>
            <Select value={accionFinal} onValueChange={(v) => setAccionFinal(v as AccionFinal)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Ninguna</SelectItem>
                <SelectItem value="send_report">Enviar reporte por mail</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => { setTitulo(""); setInstrucciones(""); onClose(); }}>Cancelar</Button>
          <Button onClick={save}>Guardar etapa</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default AdminProcessTemplates;
