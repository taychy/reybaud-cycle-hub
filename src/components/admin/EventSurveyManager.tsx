import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ClipboardList, Send, CalendarClock, BarChart3, Plus, Trash2, Image as ImageIcon, TestTube2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface Question {
  id: string;
  tipo: "nps" | "rating" | "texto";
  titulo: string;
  descripcion?: string;
}

interface Survey {
  id: string;
  event_id: string;
  titulo: string;
  descripcion: string | null;
  preguntas: Question[];
  anonima: boolean;
  activa: boolean;
  fecha_envio_programada: string | null;
  enviada_at: string | null;
  recipients_count: number | null;
  mostrar_album: boolean;
  album_titulo: string | null;
  album_url: string | null;
  album_cover_image_url: string | null;
  album_mensaje: string | null;
  album_cta_label: string | null;
}

interface Response {
  id: string;
  respondent_name: string | null;
  respondent_email: string | null;
  nps: number | null;
  respuestas: Record<string, any>;
  created_at: string;
}

const defaultTemplate: Question[] = [
  { id: crypto.randomUUID(), tipo: "nps", titulo: "¿Qué tan probable es que recomiendes este training camp a un amigo o compañero?", descripcion: "0 = Nada probable, 10 = Muy probable" },
  { id: crypto.randomUUID(), tipo: "rating", titulo: "Nivel de coaching y acompañamiento en ruta" },
  { id: crypto.randomUUID(), tipo: "rating", titulo: "Calidad de las rutas y recorridos elegidos" },
  { id: crypto.randomUUID(), tipo: "rating", titulo: "Logística general (transporte, coordinación, tiempos)" },
  { id: crypto.randomUUID(), tipo: "rating", titulo: "Hospedaje y comidas" },
  { id: crypto.randomUUID(), tipo: "rating", titulo: "Ambiente del grupo y experiencia humana" },
  { id: crypto.randomUUID(), tipo: "texto", titulo: "¿Qué fue lo mejor del camp?" },
  { id: crypto.randomUUID(), tipo: "texto", titulo: "¿Qué mejorarías para el próximo?" },
];

interface Props { eventId: string; eventTitle: string; }

const EventSurveyManager = ({ eventId, eventTitle }: Props) => {
  const { toast } = useToast();
  const [survey, setSurvey] = useState<Survey | null>(null);
  const [responses, setResponses] = useState<Response[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [showDashboard, setShowDashboard] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("event_surveys" as any).select("*").eq("event_id", eventId).maybeSingle();
    if (data) {
      setSurvey({ ...(data as any), preguntas: (data as any).preguntas || [] });
      const { data: resps } = await supabase
        .from("event_survey_responses" as any)
        .select("*")
        .eq("survey_id", (data as any).id)
        .order("created_at", { ascending: false });
      setResponses((resps as any[]) || []);
    } else {
      setSurvey(null);
      setResponses([]);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [eventId]);

  const createSurvey = async () => {
    setSaving(true);
    const { data, error } = await supabase.from("event_surveys" as any).insert({
      event_id: eventId,
      titulo: `Encuesta de cierre · ${eventTitle}`,
      descripcion: "Nos encantaría conocer tu experiencia y qué podemos mejorar para los próximos camps. Son solo 3-5 minutos.",
      preguntas: defaultTemplate as any,
      anonima: false,
      activa: true,
    } as any).select("*").single();
    setSaving(false);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    setSurvey({ ...(data as any), preguntas: (data as any).preguntas || [] });
    toast({ title: "Encuesta creada con plantilla estándar." });
  };

  const save = async (patch: Partial<Survey>) => {
    if (!survey) return;
    const { error } = await supabase.from("event_surveys" as any).update(patch as any).eq("id", survey.id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    setSurvey({ ...survey, ...patch });
  };

  const updateQuestion = (idx: number, patch: Partial<Question>) => {
    if (!survey) return;
    const next = [...survey.preguntas];
    next[idx] = { ...next[idx], ...patch };
    setSurvey({ ...survey, preguntas: next });
  };

  const addQuestion = (tipo: Question["tipo"]) => {
    if (!survey) return;
    setSurvey({ ...survey, preguntas: [...survey.preguntas, { id: crypto.randomUUID(), tipo, titulo: "Nueva pregunta" }] });
  };

  const removeQuestion = (idx: number) => {
    if (!survey) return;
    const next = [...survey.preguntas]; next.splice(idx, 1);
    setSurvey({ ...survey, preguntas: next });
  };

  const persistQuestions = async () => {
    if (!survey) return;
    setSaving(true);
    await save({ preguntas: survey.preguntas, titulo: survey.titulo, descripcion: survey.descripcion });
    setSaving(false);
    toast({ title: "Cambios guardados." });
  };

  const sendNow = async () => {
    if (!survey) return;
    setSending(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase.functions.invoke("send-event-survey", {
      body: { survey_id: survey.id, force: !!survey.enviada_at, enviado_por: user?.id || null },
    });
    setSending(false);
    if (error) { toast({ title: "Error al enviar", description: error.message, variant: "destructive" }); return; }
    toast({ title: `Enviada a ${(data as any)?.sent || 0} participantes.` });
    load();
  };

  const scheduleAt = async (isoLocal: string) => {
    if (!survey) return;
    const iso = new Date(isoLocal).toISOString();
    await save({ fecha_envio_programada: iso });
    toast({ title: `Envío programado para ${format(new Date(iso), "PPP p", { locale: es })}` });
  };

  const clearSchedule = async () => {
    await save({ fecha_envio_programada: null });
    toast({ title: "Programación eliminada." });
  };

  const stats = useMemo(() => {
    if (!survey || responses.length === 0) return null;
    const nps = responses.map((r) => r.nps).filter((n): n is number => n != null);
    const promoters = nps.filter((n) => n >= 9).length;
    const detractors = nps.filter((n) => n <= 6).length;
    const npsScore = nps.length > 0 ? Math.round(((promoters - detractors) / nps.length) * 100) : null;

    const ratingAverages: Record<string, number> = {};
    for (const q of survey.preguntas) {
      if (q.tipo !== "rating") continue;
      const values = responses.map((r) => r.respuestas?.[q.id]).filter((v) => typeof v === "number");
      if (values.length) ratingAverages[q.id] = values.reduce((s, v) => s + v, 0) / values.length;
    }
    return { npsScore, promoters, detractors, totalNps: nps.length, ratingAverages };
  }, [responses, survey]);

  if (loading) return <p className="text-sm text-muted-foreground animate-pulse">Cargando...</p>;

  if (!survey) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <ClipboardList className="w-5 h-5 text-primary" />
          <h3 className="font-heading font-semibold text-sm uppercase tracking-wide">Encuesta de cierre</h3>
        </div>
        <p className="text-sm text-muted-foreground">No hay encuesta creada para este evento.</p>
        <Button variant="gold" size="sm" onClick={createSurvey} disabled={saving}>
          <Plus className="w-4 h-4 mr-1" /> Crear encuesta con plantilla
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <ClipboardList className="w-5 h-5 text-primary" />
          <h3 className="font-heading font-semibold text-sm uppercase tracking-wide">Encuesta de cierre</h3>
          {survey.enviada_at && (
            <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-600/30">
              ✉ {survey.recipients_count || 0} enviados
            </Badge>
          )}
          {responses.length > 0 && (
            <Badge variant="outline" className="text-[10px]">{responses.length} respuestas</Badge>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => setShowDashboard(true)}>
            <BarChart3 className="w-4 h-4 mr-1" /> Ver resultados
          </Button>
        </div>
      </div>

      <div className="rounded-lg border p-3 space-y-3">
        <div className="grid gap-2">
          <Label className="text-xs">Título</Label>
          <Input value={survey.titulo} onChange={(e) => setSurvey({ ...survey, titulo: e.target.value })} />
        </div>
        <div className="grid gap-2">
          <Label className="text-xs">Descripción (aparece en el email y arriba de la encuesta)</Label>
          <Textarea value={survey.descripcion || ""} onChange={(e) => setSurvey({ ...survey, descripcion: e.target.value })} rows={3} />
        </div>
        <div className="flex items-center gap-6 flex-wrap">
          <div className="flex items-center gap-2">
            <Switch checked={survey.anonima} onCheckedChange={(v) => save({ anonima: v })} />
            <Label className="text-sm">Anónima</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={survey.activa} onCheckedChange={(v) => save({ activa: v })} />
            <Label className="text-sm">Activa</Label>
          </div>
        </div>
      </div>

      <div className="rounded-lg border p-3 space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Preguntas</p>
        {survey.preguntas.map((q, idx) => (
          <div key={q.id} className="border rounded p-2 space-y-1.5 bg-muted/30">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px] uppercase">{q.tipo}</Badge>
              <Input value={q.titulo} onChange={(e) => updateQuestion(idx, { titulo: e.target.value })} className="flex-1 h-8 text-sm" />
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive" onClick={() => removeQuestion(idx)}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
            {q.tipo !== "texto" && (
              <Input placeholder="Descripción opcional" value={q.descripcion || ""} onChange={(e) => updateQuestion(idx, { descripcion: e.target.value })} className="h-7 text-xs" />
            )}
          </div>
        ))}
        <div className="flex gap-2 flex-wrap pt-1">
          <Button variant="outline" size="sm" onClick={() => addQuestion("nps")}>+ NPS</Button>
          <Button variant="outline" size="sm" onClick={() => addQuestion("rating")}>+ Rating 1-5</Button>
          <Button variant="outline" size="sm" onClick={() => addQuestion("texto")}>+ Texto libre</Button>
          <Button variant="gold" size="sm" onClick={persistQuestions} disabled={saving} className="ml-auto">
            {saving ? "Guardando..." : "Guardar cambios"}
          </Button>
        </div>
      </div>

      <div className="rounded-lg border p-3 space-y-3">
        <div className="flex items-center gap-2">
          <CalendarClock className="w-4 h-4 text-primary" />
          <p className="text-sm font-medium">Envío por email</p>
        </div>
        <p className="text-xs text-muted-foreground">
          Se envía a todos los participantes con reserva confirmada, pendiente o solicitud enviada. Podés programar el envío o disparar ahora.
        </p>
        <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
          <Input
            type="datetime-local"
            className="w-full sm:w-64"
            value={survey.fecha_envio_programada ? format(new Date(survey.fecha_envio_programada), "yyyy-MM-dd'T'HH:mm") : ""}
            onChange={(e) => e.target.value && scheduleAt(e.target.value)}
          />
          {survey.fecha_envio_programada && !survey.enviada_at && (
            <Button variant="ghost" size="sm" onClick={clearSchedule}>Quitar programación</Button>
          )}
          <div className="sm:ml-auto flex gap-2">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="gold" size="sm" disabled={sending}>
                  <Send className="w-4 h-4 mr-1" />
                  {survey.enviada_at ? "Reenviar ahora" : "Enviar ahora"}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>¿Enviar la encuesta ahora?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Se enviará un email con link único a cada participante del evento. {survey.enviada_at ? "Esta encuesta ya fue enviada antes: se reenviará." : ""}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={sendNow}>Sí, enviar</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
        {survey.fecha_envio_programada && !survey.enviada_at && (
          <p className="text-xs text-primary">
            Programada para: {format(new Date(survey.fecha_envio_programada), "PPP 'a las' p", { locale: es })}
          </p>
        )}
        {survey.enviada_at && (
          <p className="text-xs text-muted-foreground">
            Última vez enviada: {format(new Date(survey.enviada_at), "PPP p", { locale: es })} · {survey.recipients_count || 0} destinatarios
          </p>
        )}
      </div>

      <Dialog open={showDashboard} onOpenChange={setShowDashboard}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Resultados · {survey.titulo}</DialogTitle>
            <DialogDescription>{responses.length} respuestas recibidas</DialogDescription>
          </DialogHeader>
          {responses.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todavía no hay respuestas.</p>
          ) : (
            <div className="space-y-4">
              {stats?.npsScore != null && (
                <div className="rounded-lg border p-4 bg-muted/30">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Net Promoter Score</p>
                  <p className="text-4xl font-bold" style={{ color: stats.npsScore >= 50 ? "hsl(var(--primary))" : stats.npsScore >= 0 ? "#eab308" : "#ef4444" }}>
                    {stats.npsScore}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {stats.promoters} promotores · {stats.totalNps - stats.promoters - stats.detractors} pasivos · {stats.detractors} detractores
                  </p>
                </div>
              )}

              {stats && Object.keys(stats.ratingAverages).length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Ratings promedio</p>
                  {survey.preguntas.filter((q) => q.tipo === "rating" && stats.ratingAverages[q.id]).map((q) => (
                    <div key={q.id} className="flex items-center justify-between border rounded p-2 text-sm">
                      <span className="truncate mr-2">{q.titulo}</span>
                      <Badge variant="outline">{stats.ratingAverages[q.id].toFixed(1)} / 5</Badge>
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Respuestas de texto</p>
                {survey.preguntas.filter((q) => q.tipo === "texto").map((q) => {
                  const texts = responses.map((r) => ({ text: r.respuestas?.[q.id], name: r.respondent_name })).filter((t) => t.text);
                  if (texts.length === 0) return null;
                  return (
                    <div key={q.id} className="border rounded p-2">
                      <p className="text-xs font-medium mb-1">{q.titulo}</p>
                      <div className="space-y-1">
                        {texts.map((t, i) => (
                          <div key={i} className="text-xs bg-muted/40 p-2 rounded">
                            <span className="text-muted-foreground">{survey.anonima ? "Anónimo" : (t.name || "—")}:</span> {String(t.text)}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EventSurveyManager;
