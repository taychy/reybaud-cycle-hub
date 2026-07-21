import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, ClipboardList, Loader2, Users, Mail, Phone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import WaitlistQuestionsEditor from "@/components/waitlist/WaitlistQuestionsEditor";
import { WaitlistQuestion, STATE_LABELS, STATE_COLORS, WaitlistEntryState } from "@/lib/waitlistTypes";

interface Template {
  id: string;
  nombre: string;
  descripcion: string | null;
  preguntas: WaitlistQuestion[];
  updated_at: string;
}

export default function AdminWaitlistTemplates() {
  const { toast } = useToast();
  const [rows, setRows] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Template | null>(null);
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [preguntas, setPreguntas] = useState<WaitlistQuestion[]>([]);
  const [saving, setSaving] = useState(false);
  const [viewingResponses, setViewingResponses] = useState<Template | null>(null);
  const [responses, setResponses] = useState<any[]>([]);
  const [loadingResponses, setLoadingResponses] = useState(false);

  const refreshAdminBadges = () => {
    window.dispatchEvent(new Event("reybaud:refresh-admin-badges"));
  };

  const openResponses = async (t: Template) => {
    setViewingResponses(t);
    setLoadingResponses(true);
    setResponses([]);
    const { data, error } = await supabase.rpc("get_waitlist_entries_for_template" as any, { p_template_id: t.id });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setResponses((data as any[]) || []);
    }
    // Marcar como vistas las entradas de esta plantilla para limpiar el badge
    await supabase.rpc("mark_waitlist_entries_seen_for_template" as any, { p_template_id: t.id });
    refreshAdminBadges();
    setLoadingResponses(false);
  };

  const formatAnswer = (val: any): string => {
    if (val == null) return "—";
    if (Array.isArray(val)) return val.join(", ");
    if (typeof val === "object") return JSON.stringify(val);
    return String(val);
  };

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("waitlist_question_templates" as any)
      .select("*")
      .order("updated_at", { ascending: false });
    setRows(((data as any[]) || []) as Template[]);
    setLoading(false);
  };

  useEffect(() => {
    load().then(() => {
      // Al abrir la página se marcan todas las entradas nuevas como vistas
      supabase.rpc("mark_waitlist_entries_seen" as any).then(() => refreshAdminBadges());
    });
  }, []);

  const openNew = () => {
    setEditing({ id: "", nombre: "", descripcion: "", preguntas: [], updated_at: "" });
    setNombre("");
    setDescripcion("");
    setPreguntas([]);
  };

  const openEdit = (t: Template) => {
    setEditing(t);
    setNombre(t.nombre);
    setDescripcion(t.descripcion || "");
    setPreguntas(Array.isArray(t.preguntas) ? t.preguntas : []);
  };

  const save = async () => {
    if (!nombre.trim()) {
      toast({ title: "Falta el nombre", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        nombre: nombre.trim(),
        descripcion: descripcion.trim() || null,
        preguntas: preguntas.map((q, i) => ({ ...q, orden: i })),
      };
      if (editing?.id) {
        const { error } = await supabase
          .from("waitlist_question_templates" as any)
          .update(payload as any)
          .eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("waitlist_question_templates" as any)
          .insert(payload as any);
        if (error) throw error;
      }
      toast({ title: "Guardado" });
      setEditing(null);
      load();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("waitlist_question_templates" as any).delete().eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Plantilla eliminada" });
    load();
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold flex items-center gap-2">
            <ClipboardList className="w-6 h-6 text-primary" /> Plantillas lista de espera
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Preguntas reutilizables para nutrir tu base de datos cuando publiques eventos en construcción.
          </p>
        </div>
        <Button onClick={openNew} className="gap-1">
          <Plus className="w-4 h-4" /> Nueva plantilla
        </Button>
      </div>

      {loading ? (
        <div className="py-16 text-center text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin mx-auto" />
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No hay plantillas cargadas todavía. Creá una para reutilizarla en tus próximos eventos.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {rows.map((t) => (
            <Card key={t.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">{t.nombre}</CardTitle>
                    {t.descripcion && (
                      <p className="text-xs text-muted-foreground mt-1">{t.descripcion}</p>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1 text-primary hover:text-primary"
                      onClick={() => openResponses(t)}
                    >
                      <Users className="w-4 h-4" /> Respuestas
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => openEdit(t)}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="text-destructive">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>¿Eliminar plantilla?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Los eventos que ya la copiaron mantienen sus preguntas; esto solo borra la plantilla base.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => remove(t.id)}>Eliminar</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-xs text-muted-foreground">
                  {(t.preguntas || []).length} pregunta{(t.preguntas || []).length === 1 ? "" : "s"}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Editar plantilla" : "Nueva plantilla"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Nombre *</Label>
              <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Camp base" />
            </div>
            <div>
              <Label className="text-xs">Descripción interna</Label>
              <Textarea
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                rows={2}
                placeholder="Cuándo usarla, notas para el equipo…"
              />
            </div>
            <div className="pt-2 border-t border-border">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Preguntas</Label>
              <div className="mt-2">
                <WaitlistQuestionsEditor value={preguntas} onChange={setPreguntas} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Respuestas por plantilla */}
      <Dialog open={!!viewingResponses} onOpenChange={(v) => !v && setViewingResponses(null)}>
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              Respuestas · {viewingResponses?.nombre}
            </DialogTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Personas que respondieron preguntas de esta plantilla en cualquier evento.
            </p>
          </DialogHeader>

          {loadingResponses ? (
            <div className="py-12 text-center">
              <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
            </div>
          ) : responses.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              Todavía nadie respondió esta plantilla.
            </div>
          ) : (
            <div className="space-y-3">
              <div className="text-xs text-muted-foreground">
                {responses.length} respuesta{responses.length === 1 ? "" : "s"}
              </div>
              {responses.map((r) => {
                const preguntasMap = new Map(
                  (viewingResponses?.preguntas || []).map((q) => [q.id, q.label])
                );
                const estadoKey = (r.estado as WaitlistEntryState) || "nuevo";
                return (
                  <Card key={r.entry_id} className="bg-card/60">
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div>
                          <CardTitle className="text-sm">{r.nombre}</CardTitle>
                          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mt-1">
                            {r.email && (
                              <span className="flex items-center gap-1">
                                <Mail className="w-3 h-3" /> {r.email}
                              </span>
                            )}
                            {r.telefono && (
                              <span className="flex items-center gap-1">
                                <Phone className="w-3 h-3" /> {r.telefono}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <Badge variant="outline" className={STATE_COLORS[estadoKey]}>
                            {STATE_LABELS[estadoKey] || r.estado}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(r.created_at).toLocaleDateString("es-AR", {
                              day: "2-digit", month: "2-digit", year: "2-digit",
                            })}
                          </span>
                        </div>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-1">
                        Evento: <span className="text-foreground">{r.event_title}</span>
                      </p>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="space-y-2">
                        {Object.entries(r.respuestas || {}).map(([qid, val]) => {
                          const label = preguntasMap.get(qid) || qid;
                          return (
                            <div key={qid} className="border-l-2 border-primary/40 pl-3">
                              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                                {label}
                              </div>
                              <div className="text-sm text-foreground">{formatAnswer(val)}</div>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
