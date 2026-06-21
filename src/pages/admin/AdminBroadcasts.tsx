import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Send, Eye, Save, Settings, Mail, History, FileText, Users, AlertTriangle, Plus, Trash2, Loader2, Search } from "lucide-react";

const ESTADOS = ["activo", "inactivo", "vacaciones"];
const GRUPOS = ["G1", "G2", "G3", "G4", "Principiante", "Personalizado", "Sin grupo"];

interface Broadcast {
  id: string;
  subject: string;
  status: string;
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  created_at: string;
  sent_at: string | null;
  segment_filters: any;
}
interface Template {
  id: string; name: string; description: string | null; subject: string; content_html: string;
}
interface Sede { id: string; nombre: string }
interface Contact {
  id: string;
  type: "alumno" | "coach";
  name: string;
  email: string;
  estado: string | null;
  grupo?: string | null;
  grupos?: string[] | null;
  sede_id?: string | null;
}

const emptyComposer = {
  subject: "",
  preheader: "",
  content_html: "",
  audience: ["students"] as ("students" | "coaches")[],
  estados: ["activo"] as string[],
  grupos: [] as string[],
  sede_ids: [] as string[],
  alumno_ids: [] as string[],
  coach_ids: [] as string[],
};

export default function AdminBroadcasts() {
  const { toast } = useToast();
  const [tab, setTab] = useState("composer");
  const [composer, setComposer] = useState(emptyComposer);
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactSearch, setContactSearch] = useState("");
  const [sender, setSender] = useState<{ id?: string; sender_email: string; sender_name: string; reply_to: string }>({
    sender_email: "", sender_name: "", reply_to: "",
  });
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [previewSample, setPreviewSample] = useState<any[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [showConfirmSend, setShowConfirmSend] = useState(false);
  const [showSenderDialog, setShowSenderDialog] = useState(false);
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [showDetail, setShowDetail] = useState<Broadcast | null>(null);
  const [detailRecipients, setDetailRecipients] = useState<any[]>([]);

  const loadAll = async () => {
    const [bres, tres, sres, cfg, alumnosRes, coachesRes] = await Promise.all([
      supabase.from("broadcasts" as any).select("*").order("created_at", { ascending: false }).limit(100),
      supabase.from("broadcast_templates" as any).select("*").order("updated_at", { ascending: false }),
      supabase.from("sedes" as any).select("id, nombre").order("nombre"),
      supabase.from("broadcast_sender_config" as any).select("*").limit(1).maybeSingle(),
      supabase.from("alumnos" as any).select("id, nombre, apellido, email, estado, grupo, sede_id").not("email", "is", null).order("nombre"),
      supabase.from("coaches" as any).select("id, nombre, email, estado, grupos, sede_id").not("email", "is", null).order("nombre"),
    ]);
    setBroadcasts((bres.data as any) || []);
    setTemplates((tres.data as any) || []);
    setSedes((sres.data as any) || []);
    setContacts([
      ...(((alumnosRes.data as any[]) || []).map((a) => ({
        id: a.id,
        type: "alumno" as const,
        name: `${a.nombre || ""} ${a.apellido || ""}`.trim() || a.email,
        email: a.email,
        estado: a.estado,
        grupo: a.grupo,
        sede_id: a.sede_id,
      }))),
      ...(((coachesRes.data as any[]) || []).map((c) => ({
        id: c.id,
        type: "coach" as const,
        name: c.nombre || c.email,
        email: c.email,
        estado: c.estado,
        grupos: c.grupos,
        sede_id: c.sede_id,
      }))),
    ].filter((c) => c.email?.includes("@")));
    if (cfg.data) setSender({
      id: (cfg.data as any).id,
      sender_email: (cfg.data as any).sender_email || "",
      sender_name: (cfg.data as any).sender_name || "",
      reply_to: (cfg.data as any).reply_to || "",
    });
  };

  useEffect(() => { loadAll(); }, []);

  const segmentFilters = useMemo(() => ({
    audience: composer.audience.length ? composer.audience : undefined,
    estados: composer.estados.length ? composer.estados : undefined,
    grupos: composer.grupos.length ? composer.grupos : undefined,
    sede_ids: composer.sede_ids.length ? composer.sede_ids : undefined,
    alumno_ids: composer.alumno_ids.length ? composer.alumno_ids : undefined,
    coach_ids: composer.coach_ids.length ? composer.coach_ids : undefined,
  }), [composer]);

  const previewSegment = async () => {
    setLoadingPreview(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-broadcast", {
        body: { mode: "preview_count", segment_filters: segmentFilters },
      });
      if (error) throw error;
      setPreviewCount(data.count);
      setPreviewSample(data.sample || []);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setLoadingPreview(false);
    }
  };

  const sendTest = async () => {
    if (!testEmail || !composer.subject || !composer.content_html) {
      toast({ title: "Faltan datos", description: "Email de prueba, asunto y contenido son obligatorios.", variant: "destructive" });
      return;
    }
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-broadcast", {
        body: {
          mode: "test",
          test_email: testEmail,
          subject: composer.subject,
          content_html: composer.content_html,
          preheader: composer.preheader,
        },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.response?.message || "Falló el envío de prueba");
      toast({ title: "Test enviado", description: `Revisá ${testEmail}` });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const doSend = async () => {
    setShowConfirmSend(false);
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-broadcast", {
        body: {
          mode: "send",
          subject: composer.subject,
          content_html: composer.content_html,
          preheader: composer.preheader,
          segment_filters: segmentFilters,
        },
      });
      if (error) throw error;
      toast({
        title: "Envío completado",
        description: `${data.sent}/${data.total} enviados. ${data.failed} fallidos.`,
      });
      setComposer(emptyComposer);
      setPreviewCount(null);
      setTab("history");
      loadAll();
    } catch (e: any) {
      toast({ title: "Error en envío", description: e.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const saveSender = async () => {
    const payload = {
      sender_email: sender.sender_email.trim(),
      sender_name: sender.sender_name.trim(),
      reply_to: sender.reply_to.trim() || null,
      updated_at: new Date().toISOString(),
    };
    if (sender.id) {
      await supabase.from("broadcast_sender_config" as any).update(payload as any).eq("id", sender.id);
    } else {
      await supabase.from("broadcast_sender_config" as any).insert(payload as any);
    }
    toast({ title: "Remitente guardado" });
    setShowSenderDialog(false);
    loadAll();
  };

  const saveTemplate = async () => {
    if (!editingTemplate?.name || !editingTemplate?.subject || !editingTemplate?.content_html) {
      toast({ title: "Faltan datos", variant: "destructive" });
      return;
    }
    if (editingTemplate.id) {
      await supabase.from("broadcast_templates" as any)
        .update({
          name: editingTemplate.name,
          description: editingTemplate.description,
          subject: editingTemplate.subject,
          content_html: editingTemplate.content_html,
          updated_at: new Date().toISOString(),
        } as any)
        .eq("id", editingTemplate.id);
    } else {
      await supabase.from("broadcast_templates" as any).insert({
        name: editingTemplate.name,
        description: editingTemplate.description,
        subject: editingTemplate.subject,
        content_html: editingTemplate.content_html,
      } as any);
    }
    toast({ title: "Plantilla guardada" });
    setShowTemplateDialog(false);
    setEditingTemplate(null);
    loadAll();
  };

  const useTemplate = (t: Template) => {
    setComposer({ ...composer, subject: t.subject, content_html: t.content_html });
    setTab("composer");
    toast({ title: `Plantilla "${t.name}" cargada` });
  };

  const deleteTemplate = async (id: string) => {
    await supabase.from("broadcast_templates" as any).delete().eq("id", id);
    loadAll();
  };

  const openDetail = async (b: Broadcast) => {
    setShowDetail(b);
    const { data } = await supabase
      .from("broadcast_recipients" as any)
      .select("*")
      .eq("broadcast_id", b.id)
      .order("status");
    setDetailRecipients((data as any) || []);
  };

  const toggleArr = (arr: string[], v: string) =>
    arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v];

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3">
          <Mail className="w-7 h-7 text-primary mt-1" />
          <div>
            <h1 className="font-heading text-2xl md:text-3xl">Email Masivo</h1>
            <p className="text-sm text-muted-foreground max-w-2xl">
              Enviá comunicaciones a tus alumnos. Las cuentas transaccionales (reservas, pagos) usan otro canal aparte para proteger su entregabilidad.
            </p>
          </div>
        </div>
        <Button variant="outline" onClick={() => setShowSenderDialog(true)}>
          <Settings className="w-4 h-4 mr-1" /> Remitente
        </Button>
      </div>

      {sender.sender_email && (
        <div className="text-xs text-muted-foreground flex items-center gap-2">
          <Mail className="w-3 h-3" />
          Enviando desde <b>{sender.sender_name} &lt;{sender.sender_email}&gt;</b>
          {sender.reply_to && <> · Responder a {sender.reply_to}</>}
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="composer"><Send className="w-4 h-4 mr-1" />Nuevo envío</TabsTrigger>
          <TabsTrigger value="history"><History className="w-4 h-4 mr-1" />Historial</TabsTrigger>
          <TabsTrigger value="templates"><FileText className="w-4 h-4 mr-1" />Plantillas</TabsTrigger>
        </TabsList>

        {/* COMPOSER */}
        <TabsContent value="composer" className="space-y-4">
          <Card className="p-4 space-y-4">
            <div className="space-y-1.5">
              <Label>Asunto *</Label>
              <Input value={composer.subject}
                onChange={e => setComposer({ ...composer, subject: e.target.value })}
                placeholder="Ej: Nuevo viaje a Bariloche — abrimos cupos" />
            </div>
            <div className="space-y-1.5">
              <Label>Preheader (texto que se ve en la bandeja, opcional)</Label>
              <Input value={composer.preheader}
                onChange={e => setComposer({ ...composer, preheader: e.target.value })}
                placeholder="Reservá tu lugar con seña antes del viernes" />
            </div>
            <div className="space-y-1.5">
              <Label>Contenido (HTML simple permitido) *</Label>
              <Textarea
                value={composer.content_html}
                onChange={e => setComposer({ ...composer, content_html: e.target.value })}
                rows={10}
                placeholder={`Hola,\n\nAbrimos cupos para...\n\n<a href="https://reybaud-app.com/eventos/...">Reservar</a>`}
              />
              <p className="text-[11px] text-muted-foreground">
                Podés usar &lt;b&gt;, &lt;a href&gt;, &lt;br&gt;, &lt;p&gt;. El header con logo y el footer se agregan automáticamente.
              </p>
            </div>
          </Card>

          <Card className="p-4 space-y-3">
            <div className="flex items-center gap-2"><Users className="w-4 h-4" /><b>Segmentación</b></div>
            <div className="grid md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="text-xs">Estados</Label>
                <div className="flex flex-wrap gap-1.5">
                  {ESTADOS.map(s => (
                    <Badge key={s}
                      variant={composer.estados.includes(s) ? "default" : "outline"}
                      className="cursor-pointer capitalize"
                      onClick={() => setComposer({ ...composer, estados: toggleArr(composer.estados, s) })}>
                      {s}
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Grupos</Label>
                <div className="flex flex-wrap gap-1.5">
                  {GRUPOS.map(g => (
                    <Badge key={g}
                      variant={composer.grupos.includes(g) ? "default" : "outline"}
                      className="cursor-pointer"
                      onClick={() => setComposer({ ...composer, grupos: toggleArr(composer.grupos, g) })}>
                      {g}
                    </Badge>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground">Vacío = todos</p>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Sedes</Label>
                <div className="flex flex-wrap gap-1.5">
                  {sedes.map(s => (
                    <Badge key={s.id}
                      variant={composer.sede_ids.includes(s.id) ? "default" : "outline"}
                      className="cursor-pointer"
                      onClick={() => setComposer({ ...composer, sede_ids: toggleArr(composer.sede_ids, s.id) })}>
                      {s.nombre}
                    </Badge>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground">Vacío = todas</p>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2 flex-wrap">
              <Button variant="secondary" onClick={previewSegment} disabled={loadingPreview}>
                {loadingPreview ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Eye className="w-4 h-4 mr-1" />}
                Calcular destinatarios
              </Button>
              {previewCount !== null && (
                <div className="text-sm">
                  Se enviará a <b>{previewCount}</b> alumno{previewCount === 1 ? "" : "s"}.
                  {previewSample.length > 0 && (
                    <span className="text-muted-foreground ml-2">
                      Ej: {previewSample.map((s: any) => s.email).slice(0, 3).join(", ")}…
                    </span>
                  )}
                </div>
              )}
            </div>
          </Card>

          <Card className="p-4 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Input
                placeholder="tu-email@ejemplo.com"
                value={testEmail}
                onChange={e => setTestEmail(e.target.value)}
                className="max-w-xs"
              />
              <Button variant="outline" onClick={sendTest} disabled={sending}>
                {sending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Send className="w-4 h-4 mr-1" />}
                Enviar prueba
              </Button>
              <div className="ml-auto flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setEditingTemplate({
                      id: "", name: "", description: "",
                      subject: composer.subject, content_html: composer.content_html,
                    });
                    setShowTemplateDialog(true);
                  }}
                  disabled={!composer.subject || !composer.content_html}
                >
                  <Save className="w-4 h-4 mr-1" />Guardar como plantilla
                </Button>
                <Button
                  variant="gold"
                  onClick={() => setShowConfirmSend(true)}
                  disabled={sending || previewCount === null || previewCount === 0 || !composer.subject || !composer.content_html}
                >
                  <Send className="w-4 h-4 mr-1" />Enviar ahora
                </Button>
              </div>
            </div>
            {previewCount === null && (
              <p className="text-[11px] text-amber-500 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Calculá los destinatarios antes de poder enviar.
              </p>
            )}
          </Card>
        </TabsContent>

        {/* HISTORY */}
        <TabsContent value="history" className="space-y-2">
          {broadcasts.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              Todavía no enviaste ninguna campaña.
            </div>
          ) : broadcasts.map(b => (
            <Card key={b.id} className="p-3 flex items-center gap-3 cursor-pointer hover:bg-muted/30" onClick={() => openDetail(b)}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant={b.status === "sent" ? "default" : b.status === "failed" ? "destructive" : "secondary"}>
                    {b.status}
                  </Badge>
                  <span className="font-medium truncate">{b.subject}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {new Date(b.created_at).toLocaleString("es-AR")} · {b.sent_count}/{b.total_recipients} enviados · {b.failed_count} fallidos
                </p>
              </div>
            </Card>
          ))}
        </TabsContent>

        {/* TEMPLATES */}
        <TabsContent value="templates" className="space-y-2">
          <Button variant="gold" onClick={() => { setEditingTemplate({ id: "", name: "", description: "", subject: "", content_html: "" }); setShowTemplateDialog(true); }}>
            <Plus className="w-4 h-4 mr-1" />Nueva plantilla
          </Button>
          {templates.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              No hay plantillas. Guardá una desde el composer o creala acá.
            </div>
          ) : templates.map(t => (
            <Card key={t.id} className="p-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{t.name}</div>
                <div className="text-xs text-muted-foreground truncate">{t.subject}</div>
                {t.description && <div className="text-[11px] text-muted-foreground">{t.description}</div>}
              </div>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" onClick={() => useTemplate(t)}>Usar</Button>
                <Button variant="ghost" size="sm" onClick={() => { setEditingTemplate(t); setShowTemplateDialog(true); }}>Editar</Button>
                <Button variant="ghost" size="sm" className="text-destructive" onClick={() => deleteTemplate(t.id)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </Card>
          ))}
        </TabsContent>
      </Tabs>

      {/* Sender dialog */}
      <Dialog open={showSenderDialog} onOpenChange={setShowSenderDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remitente</DialogTitle>
            <DialogDescription>
              El email debe estar verificado en Brevo. Recomendamos un subdominio propio (ej. <code>news.reybaud-app.com</code>) para no afectar la entregabilidad de los emails transaccionales.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nombre del remitente</Label>
              <Input value={sender.sender_name} onChange={e => setSender({ ...sender, sender_name: e.target.value })} placeholder="Reybaud" />
            </div>
            <div className="space-y-1.5">
              <Label>Email del remitente</Label>
              <Input value={sender.sender_email} onChange={e => setSender({ ...sender, sender_email: e.target.value })} placeholder="news@reybaud-app.com" />
            </div>
            <div className="space-y-1.5">
              <Label>Responder a (opcional)</Label>
              <Input value={sender.reply_to} onChange={e => setSender({ ...sender, reply_to: e.target.value })} placeholder="hola@reybaud-app.com" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSenderDialog(false)}>Cancelar</Button>
            <Button variant="gold" onClick={saveSender}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Template dialog */}
      <Dialog open={showTemplateDialog} onOpenChange={setShowTemplateDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingTemplate?.id ? "Editar plantilla" : "Nueva plantilla"}</DialogTitle>
          </DialogHeader>
          {editingTemplate && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Nombre interno *</Label>
                <Input value={editingTemplate.name}
                  onChange={e => setEditingTemplate({ ...editingTemplate, name: e.target.value })}
                  placeholder="Ej: Anuncio nuevo evento" />
              </div>
              <div className="space-y-1.5">
                <Label>Descripción</Label>
                <Input value={editingTemplate.description || ""}
                  onChange={e => setEditingTemplate({ ...editingTemplate, description: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Asunto *</Label>
                <Input value={editingTemplate.subject}
                  onChange={e => setEditingTemplate({ ...editingTemplate, subject: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Contenido *</Label>
                <Textarea rows={10} value={editingTemplate.content_html}
                  onChange={e => setEditingTemplate({ ...editingTemplate, content_html: e.target.value })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTemplateDialog(false)}>Cancelar</Button>
            <Button variant="gold" onClick={saveTemplate}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm send */}
      <AlertDialog open={showConfirmSend} onOpenChange={setShowConfirmSend}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Enviar a {previewCount} alumno{previewCount === 1 ? "" : "s"}?</AlertDialogTitle>
            <AlertDialogDescription>
              Asunto: <b>{composer.subject}</b><br />
              Esta acción no se puede deshacer. Se enviarán los emails ahora mismo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={doSend}>Enviar ahora</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Detail */}
      <Dialog open={!!showDetail} onOpenChange={(v) => !v && setShowDetail(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{showDetail?.subject}</DialogTitle>
            <DialogDescription>
              {showDetail && `${showDetail.sent_count}/${showDetail.total_recipients} enviados · ${showDetail.failed_count} fallidos`}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[400px] overflow-y-auto space-y-1">
            {detailRecipients.map((r) => (
              <div key={r.id} className="flex items-center gap-2 text-xs border-b py-1.5">
                <Badge variant={r.status === "sent" ? "default" : r.status === "failed" ? "destructive" : "secondary"} className="text-[10px]">
                  {r.status}
                </Badge>
                <span className="flex-1 truncate">{r.email}</span>
                <span className="text-muted-foreground truncate max-w-[200px]">{r.error_message || ""}</span>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
