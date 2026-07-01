import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Eye, Mail, Send, Lock, Loader2, Pencil, History, RotateCcw, AlertTriangle } from "lucide-react";

interface Variable { name: string; description?: string; example?: string }
interface Template {
  key: string;
  subject: string;
  html_body: string;
  text_body: string | null;
  description: string | null;
  variables: Variable[];
  required_variables: string[];
  wired: boolean;
  updated_at: string;
  updated_by_name: string | null;
}
interface Version {
  id: string;
  version_number: number;
  subject: string;
  html_body: string;
  changed_at: string;
  changed_by_name: string | null;
}

const renderPreview = (html: string, subject: string, vars: Variable[]) => {
  const map: Record<string, string> = {};
  for (const v of vars) map[v.name] = v.example ?? `[${v.name}]`;
  const replace = (s: string) => s.replace(/\{(\w+)\}/g, (_, k) => map[k] ?? `{${k}}`);
  return { subject: replace(subject), html: replace(html) };
};

const AdminEmailTemplates = () => {
  const { toast } = useToast();
  const [tab, setTab] = useState("plantillas");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewTpl, setPreviewTpl] = useState<Template | null>(null);
  const [editTpl, setEditTpl] = useState<Template | null>(null);
  const [historyTpl, setHistoryTpl] = useState<Template | null>(null);

  // Config tab (super_admin)
  const [isSuper, setIsSuper] = useState(false);
  const [maskedInfo, setMaskedInfo] = useState<{ count: number; emails: string[]; masked: boolean } | null>(null);
  const [editEmails, setEditEmails] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const loadTemplates = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("email_templates").select("*").order("key");
    if (error) {
      toast({ title: "Error cargando plantillas", description: error.message, variant: "destructive" });
    } else {
      setTemplates((data || []) as any);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadTemplates();
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data: superCheck } = await supabase.rpc("is_super_admin", { _user_id: u.user.id });
      setIsSuper(!!superCheck);
      const { data: masked } = await supabase.rpc("get_admin_notification_emails_masked");
      if (masked) {
        const m = masked as any;
        setMaskedInfo({ count: m.count || 0, emails: m.emails || [], masked: !!m.masked });
        if (!m.masked) setEditEmails((m.emails as string[]).join("\n"));
      }
    })();
  }, []);

  const saveEmails = async () => {
    setSaving(true);
    const list = editEmails.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean);
    const { error } = await supabase.from("app_config").update({ value: list }).eq("key", "admin_notification_emails");
    setSaving(false);
    if (error) toast({ title: "Error al guardar", description: error.message, variant: "destructive" });
    else {
      toast({ title: "Lista actualizada", description: `${list.length} destinatarios.` });
      const { data: masked } = await supabase.rpc("get_admin_notification_emails_masked");
      if (masked) setMaskedInfo(masked as any);
    }
  };

  const sendTest = async () => {
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-test-email", { body: {} });
      if (error) throw error;
      toast({ title: "Prueba enviada", description: `Encolados ${((data as any)?.results || []).filter((r: any) => r.queued).length} emails.` });
    } catch (e: any) {
      toast({ title: "Falló el envío de prueba", description: e.message, variant: "destructive" });
    }
    setTesting(false);
  };

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-heading font-bold flex items-center gap-2"><Mail className="w-6 h-6" /> Comunicaciones</h1>
        <p className="text-sm text-muted-foreground">Plantillas de emails automáticos enviadas por la plataforma.</p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="plantillas">Plantillas</TabsTrigger>
          <TabsTrigger value="config">Configuración</TabsTrigger>
        </TabsList>

        <TabsContent value="plantillas" className="space-y-3 mt-4">
          <Card className="p-3 text-xs text-muted-foreground bg-muted/40">
            {isSuper ? (
              <><strong>Fase 2 activa.</strong> Como super_admin podés editar cualquier plantilla. Cada cambio queda versionado y podés restaurar versiones anteriores. Badge <b>Wireada</b> = la edge function ya lee de acá; sin badge = editable pero aún no wireada (próxima iteración).</>
            ) : (
              <><strong>Solo lectura.</strong> Solo super_admin puede editar plantillas.</>
            )}
          </Card>

          {loading ? (
            <div className="text-center py-8"><Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" /></div>
          ) : (
            <div className="space-y-2">
              {templates.map(t => (
                <Card key={t.key} className="p-4 flex flex-col md:flex-row md:items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <code className="text-[11px] bg-muted px-2 py-0.5 rounded">{t.key}</code>
                      {t.wired && <Badge variant="outline" className="text-[10px] bg-emerald-500/15 text-emerald-600 border-emerald-500/30">Wireada</Badge>}
                    </div>
                    <p className="text-sm font-semibold mt-1">{t.subject}</p>
                    {t.description && <p className="text-xs text-muted-foreground mt-0.5">{t.description}</p>}
                    <p className="text-[10px] text-muted-foreground/70 mt-1">
                      Actualizada: {new Date(t.updated_at).toLocaleString("es-AR")}{t.updated_by_name ? ` · por ${t.updated_by_name}` : ""}
                    </p>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Button size="sm" variant="outline" onClick={() => setPreviewTpl(t)}>
                      <Eye className="w-3.5 h-3.5 mr-1" /> Ver
                    </Button>
                    {isSuper && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => setHistoryTpl(t)}>
                          <History className="w-3.5 h-3.5 mr-1" /> Historial
                        </Button>
                        <Button size="sm" onClick={() => setEditTpl(t)}>
                          <Pencil className="w-3.5 h-3.5 mr-1" /> Editar
                        </Button>
                      </>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="config" className="space-y-4 mt-4">
          <Card className="p-4 space-y-3">
            <h2 className="font-semibold">Destinatarios admin</h2>
            {!isSuper ? (
              <div className="text-sm">
                <p className="text-muted-foreground">Tenés permiso de lectura limitada.</p>
                <p className="mt-2"><strong>{maskedInfo?.count || 0}</strong> destinatarios configurados.</p>
                {maskedInfo?.emails && maskedInfo.emails.length > 0 && (
                  <ul className="mt-2 text-xs text-muted-foreground space-y-1">
                    {maskedInfo.emails.map((e, i) => <li key={i}>• {e}</li>)}
                  </ul>
                )}
                <p className="mt-3 text-xs text-muted-foreground flex items-center gap-1"><Lock className="w-3 h-3" /> Solo super_admin puede ver y editar la lista completa.</p>
              </div>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">Un email por línea.</p>
                <Textarea rows={6} value={editEmails} onChange={e => setEditEmails(e.target.value)} placeholder="admin@reybaud-app.com" />
                <div className="flex gap-2">
                  <Button onClick={saveEmails} disabled={saving}>
                    {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null} Guardar lista
                  </Button>
                  <Button variant="outline" onClick={sendTest} disabled={testing}>
                    {testing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                    Enviar email de prueba
                  </Button>
                </div>
              </>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      {/* Preview */}
      <Dialog open={!!previewTpl} onOpenChange={() => setPreviewTpl(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-sm">{previewTpl && renderPreview(previewTpl.html_body, previewTpl.subject, previewTpl.variables).subject}</DialogTitle>
          </DialogHeader>
          <div className="text-xs text-muted-foreground mb-2">Vista previa con datos ficticios.</div>
          <div className="border rounded-lg overflow-hidden bg-white">
            <div dangerouslySetInnerHTML={{ __html: previewTpl ? renderPreview(previewTpl.html_body, previewTpl.subject, previewTpl.variables).html : "" }} />
          </div>
        </DialogContent>
      </Dialog>

      {/* Editor */}
      {editTpl && (
        <TemplateEditor
          template={editTpl}
          onClose={() => setEditTpl(null)}
          onSaved={() => { setEditTpl(null); loadTemplates(); }}
        />
      )}

      {/* History */}
      {historyTpl && (
        <TemplateHistory
          template={historyTpl}
          onClose={() => setHistoryTpl(null)}
          onRestored={() => { setHistoryTpl(null); loadTemplates(); }}
        />
      )}
    </div>
  );
};

// ============ Editor Component ============
const TemplateEditor = ({ template, onClose, onSaved }: { template: Template; onClose: () => void; onSaved: () => void }) => {
  const { toast } = useToast();
  const [subject, setSubject] = useState(template.subject);
  const [html, setHtml] = useState(template.html_body);
  const [saving, setSaving] = useState(false);

  const missingRequired = useMemo(() => {
    const combined = `${subject}\n${html}`;
    return template.required_variables.filter(v => !combined.includes(`{${v}}`));
  }, [subject, html, template.required_variables]);

  const preview = useMemo(() => renderPreview(html, subject, template.variables), [html, subject, template.variables]);

  const insertVar = (name: string) => setHtml(prev => prev + `{${name}}`);

  const save = async () => {
    if (missingRequired.length > 0) {
      if (!confirm(`Faltan variables obligatorias: ${missingRequired.join(", ")}. ¿Guardar igual?`)) return;
    }
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    const { data: profile } = await supabase.from("admin_profiles").select("nombre").eq("user_id", u.user!.id).maybeSingle();
    const { error } = await supabase
      .from("email_templates")
      .update({
        subject, html_body: html,
        updated_by: u.user!.id,
        updated_by_name: (profile as any)?.nombre || u.user!.email,
      })
      .eq("key", template.key);
    setSaving(false);
    if (error) toast({ title: "Error al guardar", description: error.message, variant: "destructive" });
    else { toast({ title: "Plantilla guardada", description: "Se creó una nueva versión en el historial." }); onSaved(); }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="w-4 h-4" /> Editar plantilla
            <code className="text-xs bg-muted px-2 py-0.5 rounded font-normal">{template.key}</code>
          </DialogTitle>
        </DialogHeader>

        <div className="grid md:grid-cols-2 gap-4 mt-2">
          {/* Left: editor */}
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium">Asunto</label>
              <Input value={subject} onChange={e => setSubject(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium">HTML del cuerpo</label>
              <Textarea value={html} onChange={e => setHtml(e.target.value)} rows={16} className="font-mono text-xs" />
            </div>
            {missingRequired.length > 0 && (
              <div className="text-xs bg-amber-500/10 border border-amber-500/30 rounded p-2 flex gap-2 text-amber-700 dark:text-amber-400">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <div>Faltan variables obligatorias: <b>{missingRequired.map(v => `{${v}}`).join(", ")}</b></div>
              </div>
            )}
            <div>
              <label className="text-xs font-medium">Variables disponibles (click para insertar)</label>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {template.variables.map(v => (
                  <button key={v.name} type="button" onClick={() => insertVar(v.name)}
                    title={v.description || ""}
                    className="text-[11px] bg-muted hover:bg-primary/20 px-2 py-1 rounded border">
                    <code>{`{${v.name}}`}</code>
                    {template.required_variables.includes(v.name) && <span className="text-red-500 ml-1">*</span>}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">* obligatoria</p>
            </div>
          </div>

          {/* Right: preview */}
          <div className="space-y-2">
            <label className="text-xs font-medium">Vista previa (con datos ficticios)</label>
            <div className="border rounded p-2 bg-muted/30 text-xs">
              <div className="text-muted-foreground">Asunto:</div>
              <div className="font-medium">{preview.subject}</div>
            </div>
            <div className="border rounded overflow-hidden bg-white max-h-[500px] overflow-y-auto">
              <div dangerouslySetInnerHTML={{ __html: preview.html }} />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Guardar cambios
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ============ History Component ============
const TemplateHistory = ({ template, onClose, onRestored }: { template: Template; onClose: () => void; onRestored: () => void }) => {
  const { toast } = useToast();
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewing, setViewing] = useState<Version | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("email_templates_versions")
        .select("*")
        .eq("template_key", template.key)
        .order("version_number", { ascending: false })
        .limit(30);
      setVersions((data || []) as any);
      setLoading(false);
    })();
  }, [template.key]);

  const restore = async (v: Version) => {
    if (!confirm(`Restaurar la versión ${v.version_number}? La versión actual quedará guardada en el historial.`)) return;
    const { data: u } = await supabase.auth.getUser();
    const { data: profile } = await supabase.from("admin_profiles").select("nombre").eq("user_id", u.user!.id).maybeSingle();
    const { error } = await supabase
      .from("email_templates")
      .update({
        subject: v.subject, html_body: v.html_body,
        updated_by: u.user!.id,
        updated_by_name: `${(profile as any)?.nombre || u.user!.email} (restauró v${v.version_number})`,
      })
      .eq("key", template.key);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else { toast({ title: `Restaurada versión ${v.version_number}` }); onRestored(); }
  };

  return (
    <>
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><History className="w-4 h-4" /> Historial — {template.key}</DialogTitle>
          </DialogHeader>
          {loading ? (
            <Loader2 className="w-6 h-6 animate-spin mx-auto my-6 text-muted-foreground" />
          ) : versions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Sin cambios previos. Esta es la versión original.</p>
          ) : (
            <div className="space-y-2">
              {versions.map(v => (
                <Card key={v.id} className="p-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">v{v.version_number}</Badge>
                      <span className="text-xs text-muted-foreground">{new Date(v.changed_at).toLocaleString("es-AR")}</span>
                    </div>
                    <p className="text-sm mt-1 truncate">{v.subject}</p>
                    {v.changed_by_name && <p className="text-[10px] text-muted-foreground">por {v.changed_by_name}</p>}
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setViewing(v)}><Eye className="w-3.5 h-3.5" /></Button>
                  <Button size="sm" variant="outline" onClick={() => restore(v)}><RotateCcw className="w-3.5 h-3.5 mr-1" />Restaurar</Button>
                </Card>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewing} onOpenChange={() => setViewing(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-sm">v{viewing?.version_number} — {viewing?.subject}</DialogTitle>
          </DialogHeader>
          <div className="border rounded overflow-hidden bg-white">
            <div dangerouslySetInnerHTML={{ __html: viewing ? renderPreview(viewing.html_body, viewing.subject, template.variables).html : "" }} />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default AdminEmailTemplates;
