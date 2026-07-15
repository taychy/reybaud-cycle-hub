import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Sparkles, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { TemplateEditor } from "./AdminProcessTemplates";
import type { ProcessTemplate, ProcessTemplateStage } from "@/hooks/useProcesses";

const sb: any = supabase;

// 8 etapas base para el playbook de Formación Inicial
const SEED_STAGES: Omit<ProcessTemplateStage, "id" | "template_id">[] = [
  {
    orden: 1,
    titulo: "Publicar landing y abrir inscripciones",
    instrucciones: "Verificá que la landing esté publicada, el precio y las fechas correctos, y el botón de inscripción activo.",
    requiere_foto: false,
    requiere_nota: true,
    entidad_control: "cohort_kpi",
    accion_final: "none",
  },
  {
    orden: 2,
    titulo: "Difusión inicial (redes / WhatsApp / email)",
    instrucciones: "Coordinar publicación en redes y envío inicial de novedad. Generar tarea al equipo de contenido.",
    requiere_foto: false,
    requiere_nota: true,
    entidad_control: "cohort_task",
    accion_final: "none",
  },
  {
    orden: 3,
    titulo: "Cierre de inscripciones",
    instrucciones: "Confirmar que se alcanzó el cupo o que se llegó a la fecha de cierre. Cerrar landing pública.",
    requiere_foto: false,
    requiere_nota: true,
    entidad_control: "cohort_kpi",
    accion_final: "none",
  },
  {
    orden: 4,
    titulo: "Mail de bienvenida a la cohorte",
    instrucciones: "Enviar bienvenida con lugar, día, hora y qué llevar a la primera clase.",
    requiere_foto: false,
    requiere_nota: false,
    entidad_control: "none",
    accion_final: "send_cohort_email",
  },
  {
    orden: 5,
    titulo: "Primera clase realizada",
    instrucciones: "Registrar asistencia, foto grupal opcional y observaciones del coach.",
    requiere_foto: true,
    requiere_nota: true,
    entidad_control: "cohort_task",
    accion_final: "none",
  },
  {
    orden: 6,
    titulo: "Check-in intermedio (mitad del programa)",
    instrucciones: "Revisar avance de cada alumno con el coach. Detectar riesgos de abandono.",
    requiere_foto: false,
    requiere_nota: true,
    entidad_control: "cohort_task",
    accion_final: "none",
  },
  {
    orden: 7,
    titulo: "Graduación y cierre del programa",
    instrucciones: "Última clase, feedback final y foto grupal. Enviar mail de graduación con siguientes pasos.",
    requiere_foto: true,
    requiere_nota: true,
    entidad_control: "none",
    accion_final: "send_cohort_email",
  },
  {
    orden: 8,
    titulo: "Oferta de continuidad G4 y seguimiento 90 días",
    instrucciones: "Ofrecer plan regular G4 con descuento de cohort. Generar tareas de contacto semanal por egresado durante 90 días.",
    requiere_foto: false,
    requiere_nota: true,
    entidad_control: "cohort_task",
    accion_final: "none",
  },
];

const PlanPlaybookEditor = () => {
  const { planId } = useParams<{ planId: string }>();
  const [template, setTemplate] = useState<ProcessTemplate | null>(null);
  const [stages, setStages] = useState<ProcessTemplateStage[]>([]);
  const [planNombre, setPlanNombre] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const load = async () => {
    if (!planId) return;
    setLoading(true);
    const [{ data: plan }, { data: tpl }] = await Promise.all([
      sb.from("planes").select("nombre").eq("id", planId).maybeSingle(),
      sb.from("process_templates").select("*").eq("plan_id", planId).maybeSingle(),
    ]);
    setPlanNombre(plan?.nombre || "");
    if (tpl) {
      setTemplate(tpl as ProcessTemplate);
      const { data: st } = await sb
        .from("process_template_stages")
        .select("*")
        .eq("template_id", tpl.id)
        .order("orden", { ascending: true });
      setStages((st || []) as ProcessTemplateStage[]);
    } else {
      setTemplate(null);
      setStages([]);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [planId]);

  const createPlaybook = async (withSeed: boolean) => {
    if (!planId) return;
    setCreating(true);
    try {
      const { data: t, error } = await sb
        .from("process_templates")
        .insert({
          nombre: `Playbook · ${planNombre || "programa"}`,
          descripcion: "Playbook de ejecución del programa",
          rol_destino: "admin",
          activo: true,
          plan_id: planId,
        })
        .select()
        .single();
      if (error) throw error;
      if (withSeed) {
        const rows = SEED_STAGES.map((s) => ({ ...s, template_id: t.id }));
        const { error: e2 } = await sb.from("process_template_stages").insert(rows);
        if (e2) throw e2;
      }
      toast({ title: "Playbook creado", description: withSeed ? "Con 8 etapas base editables." : "Vacío. Agregá etapas desde el editor." });
      await load();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  if (loading) return <div className="text-center py-12 text-muted-foreground">Cargando…</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/admin/planes">
          <Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4 mr-1" /> Planes</Button>
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-heading font-bold uppercase tracking-wider">Playbook del plan</h1>
        <p className="text-sm text-muted-foreground mt-1">{planNombre}</p>
      </div>

      {!template ? (
        <Card>
          <CardContent className="p-8 text-center space-y-4">
            <div>
              <Sparkles className="w-8 h-8 mx-auto text-primary mb-3" />
              <p className="font-medium">Este plan todavía no tiene playbook.</p>
              <p className="text-sm text-muted-foreground mt-1">
                Un <b>playbook</b> es la receta escrita: etapas ordenadas para ejecutar el programa siempre de la misma manera.
              </p>
            </div>
            <div className="flex gap-2 justify-center flex-wrap">
              <Button onClick={() => createPlaybook(true)} disabled={creating}>
                {creating ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1" />}
                Crear con 8 etapas base
              </Button>
              <Button variant="outline" onClick={() => createPlaybook(false)} disabled={creating}>
                Crear vacío
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <TemplateEditor
          template={template}
          initialStages={stages}
          onClose={() => load()}
        />
      )}
    </div>
  );
};

export default PlanPlaybookEditor;
