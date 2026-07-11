import { useEffect, useMemo, useRef, useState } from "react";
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
import { ClipboardList, Send, CalendarClock, BarChart3, Plus, Trash2, Image as ImageIcon, GripVertical, Users, Check, Loader2, Upload, X, Tag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

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
  fecha_limite_respuesta: string | null;
  descuento_activo: boolean;
  descuento_porcentaje: number | null;
  descuento_titulo: string | null;
  descuento_mensaje: string | null;
  descuento_cta_label: string | null;
  descuento_url: string | null;
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

/* ---------------- Sortable Question ---------------- */
const SortableQuestion = ({ q, idx, onUpdate, onRemove }: {
  q: Question; idx: number;
  onUpdate: (patch: Partial<Question>) => void;
  onRemove: () => void;
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: q.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-2 border rounded-lg bg-muted/30 p-2">
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground p-1 touch-none"
        aria-label="Reordenar"
      >
        <GripVertical className="w-4 h-4" />
      </button>
      <Badge variant="outline" className="text-[10px] uppercase shrink-0">{q.tipo}</Badge>
      <div className="flex-1 min-w-0 space-y-1">
        <Input value={q.titulo} onChange={(e) => onUpdate({ titulo: e.target.value })} className="h-8 text-sm" />
        {q.tipo !== "texto" && (
          <Input placeholder="Descripción opcional" value={q.descripcion || ""} onChange={(e) => onUpdate({ descripcion: e.target.value })} className="h-7 text-xs" />
        )}
      </div>
      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive shrink-0" onClick={onRemove}>
        <Trash2 className="w-4 h-4" />
      </Button>
    </div>
  );
};

/* ---------------- Album cover drop zone ---------------- */
const CoverDropZone = ({ value, onChange }: { value: string | null; onChange: (url: string | null) => void }) => {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = async (file: File) => {
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `event-surveys/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("product-images").upload(path, file, { upsert: true });
    setUploading(false);
    if (error) return;
    const { data } = supabase.storage.from("product-images").getPublicUrl(path);
    onChange(data.publicUrl);
  };

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault(); setDragOver(false);
        const file = e.dataTransfer.files?.[0];
        if (file && file.type.startsWith("image/")) upload(file);
      }}
      className={`relative rounded-lg border-2 border-dashed p-4 text-center transition ${dragOver ? "border-primary bg-primary/5" : "border-border"} ${value ? "bg-transparent" : "bg-muted/20"}`}
    >
      {value ? (
        <div className="relative">
          <img src={value} alt="Portada" className="w-full h-40 object-cover rounded" />
          <Button
            type="button"
            variant="destructive"
            size="icon"
            className="absolute top-1 right-1 h-7 w-7"
            onClick={() => onChange(null)}
          >
            <X className="w-3 h-3" />
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="w-full flex flex-col items-center gap-2 py-4"
        >
          {uploading ? <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /> : <Upload className="w-5 h-5 text-muted-foreground" />}
          <span className="text-xs text-muted-foreground">Arrastrá la portada o hacé clic para subirla</span>
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }}
      />
    </div>
  );
};

/* ---------------- Email Preview ---------------- */
const EmailPreview = ({ survey, eventTitle }: { survey: Survey; eventTitle: string }) => {
  const deadlineLabel = useMemo(() => {
    if (!survey.fecha_limite_respuesta) return null;
    try {
      const d = new Date(survey.fecha_limite_respuesta);
      return format(d, "d 'de' MMMM", { locale: es });
    } catch { return null; }
  }, [survey.fecha_limite_respuesta]);

  return (
    <div className="rounded-lg border overflow-hidden bg-[#0b1220] max-w-md mx-auto text-white">
      <div className="p-6 text-sm">
        <div className="text-[10px] tracking-[.18em] text-cyan-400 uppercase">{eventTitle}</div>
        <h2 className="mt-1 text-xl font-bold leading-tight">{survey.titulo}</h2>

        <p className="mt-4 text-white/90">Hola Prueba,</p>
        <p className="mt-2 text-white/70 leading-relaxed text-[13px]">
          {survey.descripcion || "Nos encantaría conocer tu experiencia para mejorar los próximos camps. Son 3-5 minutos, podés responder desde el celu."}
        </p>

        {deadlineLabel && (
          <div className="mt-4 rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 flex items-center gap-2">
            <span>🕒</span>
            <span className="text-cyan-400 text-xs font-semibold">Respondé antes del {deadlineLabel}</span>
          </div>
        )}

        <div className="mt-3 bg-white text-black text-center rounded-lg py-3 font-semibold">
          Responder encuesta ↗
        </div>

        {survey.descuento_activo && (
          <div className="mt-4 rounded-lg border border-white/10 bg-white/5 p-3">
            <div className="flex items-center gap-2">
              <Tag className="w-4 h-4 text-cyan-400" />
              <p className="font-semibold text-sm">
                {survey.descuento_titulo || `${survey.descuento_porcentaje || 10}% off tu próximo camp`}
              </p>
            </div>
            <p className="mt-1 text-[12px] text-white/70">
              {survey.descuento_mensaje || "Anotate ahora y asegurate el lugar con descuento."}
            </p>
            <div className="mt-2 border border-white/20 rounded-lg px-3 py-2 text-center text-xs">
              {survey.descuento_cta_label || "Anotarme con descuento"} ↗
            </div>
          </div>
        )}

        {survey.mostrar_album && (
          <div className="mt-6">
            <div className="text-[10px] tracking-[.22em] text-white/50 uppercase mb-2">Álbum de fotos</div>
            {survey.album_cover_image_url ? (
              <img src={survey.album_cover_image_url} alt="" className="w-full h-32 object-cover rounded-lg" />
            ) : (
              <div className="w-full h-32 rounded-lg bg-white/5 flex items-center justify-center">
                <ImageIcon className="w-8 h-8 text-white/30" />
              </div>
            )}
            <p className="mt-2 text-sm font-semibold">{survey.album_titulo || "Las fotos del viaje ya están acá"}</p>
            {survey.album_mensaje && <p className="text-[12px] text-white/60 mt-0.5">{survey.album_mensaje}</p>}
          </div>
        )}
      </div>
    </div>
  );
};

/* ============================= Main ============================= */
const EventSurveyManager = ({ eventId, eventTitle }: Props) => {
  const { toast } = useToast();
  const [survey, setSurvey] = useState<Survey | null>(null);
  const [savedSurvey, setSavedSurvey] = useState<Survey | null>(null);
  const [responses, setResponses] = useState<Response[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [testEmail, setTestEmail] = useState("scarlettbonatto@gmail.com");
  const [sendingTest, setSendingTest] = useState(false);
  const [showDashboard, setShowDashboard] = useState(false);
  const [recipientCount, setRecipientCount] = useState<number | null>(null);
  const [scheduleValue, setScheduleValue] = useState<string>("");

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("event_surveys" as any).select("*").eq("event_id", eventId).maybeSingle();
    if (data) {
      const full = { ...(data as any), preguntas: (data as any).preguntas || [] };
      setSurvey(full);
      setSavedSurvey(full);
      setScheduleValue(full.fecha_envio_programada ? format(new Date(full.fecha_envio_programada), "yyyy-MM-dd'T'HH:mm") : "");
      const { data: resps } = await supabase
        .from("event_survey_responses" as any)
        .select("*").eq("survey_id", full.id).order("created_at", { ascending: false });
      setResponses((resps as any[]) || []);
    } else {
      setSurvey(null); setSavedSurvey(null); setResponses([]);
    }

    // recipient count
    const { count } = await supabase
      .from("event_reservations")
      .select("id", { count: "exact", head: true })
      .eq("event_id", eventId)
      .in("reservation_status", ["reserva_confirmada", "solicitud_enviada", "reserva_pendiente"]);
    setRecipientCount(count ?? 0);

    setLoading(false);
  };

  useEffect(() => { load(); }, [eventId]);

  const dirty = useMemo(() => {
    if (!survey || !savedSurvey) return false;
    return JSON.stringify(survey) !== JSON.stringify(savedSurvey);
  }, [survey, savedSurvey]);

  const createSurvey = async () => {
    setSaving(true);
    const { data, error } = await supabase.from("event_surveys" as any).insert({
      event_id: eventId,
      titulo: `Encuesta de cierre · ${eventTitle}`,
      descripcion: "Nos encantaría conocer tu experiencia para mejorar los próximos camps. Son 3-5 minutos, podés responder desde el celu.",
      preguntas: defaultTemplate as any,
      anonima: false,
      activa: true,
    } as any).select("*").single();
    setSaving(false);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    const full = { ...(data as any), preguntas: (data as any).preguntas || [] };
    setSurvey(full); setSavedSurvey(full);
    toast({ title: "Encuesta creada con plantilla estándar." });
  };

  const saveAll = async () => {
    if (!survey) return;
    setSaving(true);
    const { fecha_envio_programada, enviada_at, recipients_count, ...patch } = survey as any;
    const { error } = await supabase.from("event_surveys" as any).update(patch).eq("id", survey.id);
    setSaving(false);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    setSavedSurvey(survey);
    toast({ title: "Cambios guardados." });
  };

  const patch = (p: Partial<Survey>) => setSurvey((s) => (s ? { ...s, ...p } : s));

  const updateQuestion = (idx: number, p: Partial<Question>) => {
    if (!survey) return;
    const next = [...survey.preguntas]; next[idx] = { ...next[idx], ...p };
    patch({ preguntas: next });
  };
  const addQuestion = (tipo: Question["tipo"]) => {
    if (!survey) return;
    patch({ preguntas: [...survey.preguntas, { id: crypto.randomUUID(), tipo, titulo: "Nueva pregunta" }] });
  };
  const removeQuestion = (idx: number) => {
    if (!survey) return;
    const next = [...survey.preguntas]; next.splice(idx, 1);
    patch({ preguntas: next });
  };
  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || !survey || active.id === over.id) return;
    const oldIdx = survey.preguntas.findIndex((q) => q.id === active.id);
    const newIdx = survey.preguntas.findIndex((q) => q.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    patch({ preguntas: arrayMove(survey.preguntas, oldIdx, newIdx) });
  };

  const sendNow = async () => {
    if (!survey) return;
    if (dirty) await saveAll();
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

  const sendTest = async () => {
    if (!survey) return;
    const email = testEmail.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast({ title: "Ingresá un email válido.", variant: "destructive" }); return;
    }
    if (dirty) await saveAll();
    setSendingTest(true);
    const { data, error } = await supabase.functions.invoke("send-event-survey", {
      body: { survey_id: survey.id, test_email: email, test_name: "Prueba" },
    });
    setSendingTest(false);
    if (error || (data as any)?.error) {
      toast({ title: "Error", description: (error?.message || (data as any).error), variant: "destructive" }); return;
    }
    toast({ title: `Email de prueba enviado a ${email}.` });
  };

  const applySchedule = async () => {
    if (!survey || !scheduleValue) return;
    const iso = new Date(scheduleValue).toISOString();
    const { error } = await supabase.from("event_surveys" as any).update({ fecha_envio_programada: iso }).eq("id", survey.id);
    if (error) { toast({ title: "Error", variant: "destructive" }); return; }
    setSurvey({ ...survey, fecha_envio_programada: iso });
    setSavedSurvey((s) => s ? { ...s, fecha_envio_programada: iso } : s);
    toast({ title: `Envío programado para ${format(new Date(iso), "PPP p", { locale: es })}` });
  };
  const clearSchedule = async () => {
    if (!survey) return;
    await supabase.from("event_surveys" as any).update({ fecha_envio_programada: null }).eq("id", survey.id);
    setSurvey({ ...survey, fecha_envio_programada: null });
    setSavedSurvey((s) => s ? { ...s, fecha_envio_programada: null } : s);
    setScheduleValue("");
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
      {/* Sticky top bar */}
      <div className="sticky top-0 z-20 -mx-3 sm:mx-0 px-3 sm:px-4 py-3 bg-background/95 backdrop-blur border-b flex items-center justify-between gap-2 flex-wrap">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Eventos › {eventTitle}</p>
          <p className="text-sm font-semibold truncate">Encuesta de cierre</p>
        </div>
        <div className="flex items-center gap-2">
          {dirty ? (
            <span className="text-xs text-amber-500 flex items-center gap-1">● Sin guardar</span>
          ) : (
            <span className="text-xs text-emerald-500 flex items-center gap-1"><Check className="w-3 h-3" /> Guardado</span>
          )}
          <Button variant="outline" size="sm" onClick={() => setShowDashboard(true)}>
            <BarChart3 className="w-4 h-4 mr-1" /> Resultados
            {responses.length > 0 && <Badge variant="outline" className="ml-1 text-[10px]">{responses.length}</Badge>}
          </Button>
          <Button variant="gold" size="sm" onClick={saveAll} disabled={!dirty || saving}>
            {saving ? "Guardando…" : "Guardar cambios"}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* Left: editor */}
        <div className="space-y-4 min-w-0">
          {/* Info general */}
          <section className="rounded-lg border p-4 space-y-3">
            <div className="flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-primary" />
              <h4 className="text-sm font-semibold">Información general</h4>
            </div>
            <div className="grid gap-2">
              <Label className="text-xs">Título</Label>
              <Input value={survey.titulo} onChange={(e) => patch({ titulo: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label className="text-xs">Descripción (aparece en el email y arriba de la encuesta)</Label>
              <Textarea rows={3} value={survey.descripcion || ""} onChange={(e) => patch({ descripcion: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label className="text-xs">Fecha límite de respuesta (opcional, aparece en el mail)</Label>
              <Input
                type="datetime-local"
                value={survey.fecha_limite_respuesta ? format(new Date(survey.fecha_limite_respuesta), "yyyy-MM-dd'T'HH:mm") : ""}
                onChange={(e) => patch({ fecha_limite_respuesta: e.target.value ? new Date(e.target.value).toISOString() : null })}
              />
            </div>
            <div className="flex items-center gap-6 flex-wrap pt-1">
              <div className="flex items-center gap-2">
                <Switch checked={survey.anonima} onCheckedChange={(v) => patch({ anonima: v })} />
                <Label className="text-sm">Anónima</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={survey.activa} onCheckedChange={(v) => patch({ activa: v })} />
                <Label className="text-sm">Activa</Label>
              </div>
            </div>
          </section>

          {/* Preguntas */}
          <section className="rounded-lg border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold">Preguntas ({survey.preguntas.length})</h4>
              <p className="text-[11px] text-muted-foreground">Arrastrá para reordenar</p>
            </div>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={survey.preguntas.map((q) => q.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-2">
                  {survey.preguntas.map((q, idx) => (
                    <SortableQuestion
                      key={q.id}
                      q={q}
                      idx={idx}
                      onUpdate={(p) => updateQuestion(idx, p)}
                      onRemove={() => removeQuestion(idx)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
            <div className="flex gap-2 flex-wrap pt-1">
              <Button variant="outline" size="sm" onClick={() => addQuestion("nps")}>+ NPS</Button>
              <Button variant="outline" size="sm" onClick={() => addQuestion("rating")}>+ Rating 1-5</Button>
              <Button variant="outline" size="sm" onClick={() => addQuestion("texto")}>+ Texto libre</Button>
            </div>
          </section>

          {/* Álbum */}
          <section className="rounded-lg border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-primary" />
                <h4 className="text-sm font-semibold">Álbum de fotos</h4>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={survey.mostrar_album} onCheckedChange={(v) => patch({ mostrar_album: v })} />
                <Label className="text-xs">Incluir en el email</Label>
              </div>
            </div>
            <div className={survey.mostrar_album ? "space-y-3" : "space-y-3 opacity-50 pointer-events-none"}>
              <CoverDropZone value={survey.album_cover_image_url} onChange={(url) => patch({ album_cover_image_url: url })} />
              <div className="grid gap-1.5">
                <Label className="text-xs">Título del bloque</Label>
                <Input placeholder="Las fotos de Girona ya están acá" value={survey.album_titulo || ""} onChange={(e) => patch({ album_titulo: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Link del álbum (Google Photos, Drive, iCloud…)</Label>
                <Input placeholder="https://photos.app.goo.gl/…" value={survey.album_url || ""} onChange={(e) => patch({ album_url: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Mensaje corto</Label>
                <Input placeholder="Un vistazo de todo lo que vivimos." value={survey.album_mensaje || ""} onChange={(e) => patch({ album_mensaje: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Texto del botón</Label>
                <Input placeholder="Ver el álbum completo" value={survey.album_cta_label || ""} onChange={(e) => patch({ album_cta_label: e.target.value })} />
              </div>
            </div>
          </section>

          {/* Descuento */}
          <section className="rounded-lg border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Tag className="w-4 h-4 text-primary" />
                <h4 className="text-sm font-semibold">Descuento próximo camp</h4>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={survey.descuento_activo} onCheckedChange={(v) => patch({ descuento_activo: v })} />
                <Label className="text-xs">Incluir en el email</Label>
              </div>
            </div>
            <div className={survey.descuento_activo ? "grid gap-3 sm:grid-cols-2" : "grid gap-3 sm:grid-cols-2 opacity-50 pointer-events-none"}>
              <div className="grid gap-1.5">
                <Label className="text-xs">% de descuento</Label>
                <Input type="number" min={1} max={99} value={survey.descuento_porcentaje ?? ""} onChange={(e) => patch({ descuento_porcentaje: e.target.value ? Number(e.target.value) : null })} placeholder="10" />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Título</Label>
                <Input placeholder="10% off tu próximo camp" value={survey.descuento_titulo || ""} onChange={(e) => patch({ descuento_titulo: e.target.value })} />
              </div>
              <div className="grid gap-1.5 sm:col-span-2">
                <Label className="text-xs">Mensaje</Label>
                <Input placeholder="Anotate ahora y asegurate el lugar con descuento." value={survey.descuento_mensaje || ""} onChange={(e) => patch({ descuento_mensaje: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Texto del botón</Label>
                <Input placeholder="Anotarme con descuento" value={survey.descuento_cta_label || ""} onChange={(e) => patch({ descuento_cta_label: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Link del botón</Label>
                <Input placeholder="https://…" value={survey.descuento_url || ""} onChange={(e) => patch({ descuento_url: e.target.value })} />
              </div>
            </div>
          </section>

          {/* Envío */}
          <section className="rounded-lg border p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Send className="w-4 h-4 text-primary" />
              <h4 className="text-sm font-semibold">Envío</h4>
            </div>
            <div className="flex items-center gap-2 text-sm bg-muted/40 rounded-lg px-3 py-2">
              <Users className="w-4 h-4 text-primary" />
              <span><strong>{recipientCount ?? "—"}</strong> participantes recibirán este email</span>
            </div>

            {/* Test */}
            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <Input type="email" value={testEmail} onChange={(e) => setTestEmail(e.target.value)} placeholder="tu@email.com" />
              <Button variant="outline" size="sm" onClick={sendTest} disabled={sendingTest}>
                {sendingTest ? "Enviando…" : "Enviar prueba"}
              </Button>
            </div>

            {/* Schedule + send */}
            <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
              <Input
                type="datetime-local"
                value={scheduleValue}
                onChange={(e) => setScheduleValue(e.target.value)}
              />
              <Button variant="outline" size="sm" onClick={applySchedule} disabled={!scheduleValue}>
                <CalendarClock className="w-4 h-4 mr-1" /> Programar
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="gold" size="sm" disabled={sending}>
                    <Send className="w-4 h-4 mr-1" />
                    {survey.enviada_at ? "Reenviar" : "Enviar ahora"}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>¿Enviar la encuesta a {recipientCount ?? 0} participantes?</AlertDialogTitle>
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

            {survey.fecha_envio_programada && !survey.enviada_at && (
              <div className="flex items-center justify-between text-xs bg-primary/5 border border-primary/20 rounded px-3 py-2">
                <span className="text-primary">Programada: {format(new Date(survey.fecha_envio_programada), "PPP p", { locale: es })}</span>
                <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={clearSchedule}>Quitar</Button>
              </div>
            )}
            {survey.enviada_at && (
              <p className="text-xs text-muted-foreground">
                Última vez enviada: {format(new Date(survey.enviada_at), "PPP p", { locale: es })} · {survey.recipients_count || 0} destinatarios
              </p>
            )}
          </section>
        </div>

        {/* Right: Live preview */}
        <div className="lg:sticky lg:top-24 lg:self-start">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Vista previa del email</p>
          <EmailPreview survey={survey} eventTitle={eventTitle} />
        </div>
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
