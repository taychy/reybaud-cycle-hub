import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { templateContentUpdate, type MailingTemplateDraft } from "@/lib/broadcastTemplateDraft";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Eye, Save, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function MailingTemplatePreview() {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<MailingTemplateDraft[]>([]);
  const [draft, setDraft] = useState<MailingTemplateDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState("preview");

  useEffect(() => {
    let active = true;
    (async () => {
      const { data, error } = await supabase.from("broadcast_templates")
        .select("id,name,description,subject,preheader,content_html")
        .order("updated_at", { ascending: false });
      if (!active) return;
      if (error) toast({ title: "No se pudieron cargar las plantillas", description: error.message, variant: "destructive" });
      else setTemplates(data || []);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [toast]);

  const save = async () => {
    if (!draft || !draft.name.trim() || !draft.subject.trim() || !draft.content_html.trim()) return;
    setSaving(true);
    const { data, error } = await supabase.from("broadcast_templates")
      .update(templateContentUpdate(draft)).eq("id", draft.id)
      .select("id,name,description,subject,preheader,content_html").single();
    setSaving(false);
    if (error || !data) {
      toast({ title: "No se pudo guardar", description: error?.message, variant: "destructive" });
      return;
    }
    setTemplates(previous => previous.map(t => t.id === data.id ? data : t));
    setDraft(data);
    toast({ title: "Plantilla guardada", description: "Sin campaña, destinatarios ni envíos." });
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="font-heading text-xl">Plantillas de mailing</h2>
        <Badge variant="secondary">Solo contenido · Sin destinatarios</Badge>
      </div>
      {loading ? <Loader2 className="h-5 w-5 animate-spin" aria-label="Cargando plantillas" /> : (
        <div className="space-y-2">
          <Label>Plantilla de mailing</Label>
          <Select value={draft?.id || ""} onValueChange={id => {
            const selected = templates.find(t => t.id === id);
            if (selected) { setDraft({ ...selected }); setView("preview"); }
          }}>
            <SelectTrigger className="h-auto min-h-10 [&>span]:whitespace-normal [&>span]:text-left">
              <SelectValue placeholder="Seleccionar plantilla" />
            </SelectTrigger>
            <SelectContent>{templates.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      )}
      {draft && (
        <>
          <div className="space-y-2">
            <Label htmlFor="mailing-template-subject">Asunto</Label>
            <Input id="mailing-template-subject" value={draft.subject} onChange={e => setDraft({ ...draft, subject: e.target.value })} />
            <Label htmlFor="mailing-template-preheader">Preheader</Label>
            <Input id="mailing-template-preheader" value={draft.preheader || ""} onChange={e => setDraft({ ...draft, preheader: e.target.value })} />
          </div>
          <Tabs value={view} onValueChange={setView}>
            <div className="flex justify-between gap-2 flex-wrap">
              <TabsList>
                <TabsTrigger value="preview"><Eye className="h-4 w-4 mr-2" />Vista previa</TabsTrigger>
                <TabsTrigger value="edit">Editar HTML</TabsTrigger>
              </TabsList>
              <Button onClick={save} disabled={saving || !draft.name.trim() || !draft.subject.trim() || !draft.content_html.trim()}>
                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}Guardar plantilla
              </Button>
            </div>
            <TabsContent value="preview">
              <iframe title="Vista previa de la plantilla de mailing" sandbox="" referrerPolicy="no-referrer"
                className="w-full max-w-[640px] mx-auto h-[1500px] border border-border rounded-md bg-background"
                srcDoc={`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0">${draft.content_html}</body></html>`} />
            </TabsContent>
            <TabsContent value="edit" className="space-y-2">
              <Label htmlFor="mailing-template-name">Nombre</Label>
              <Input id="mailing-template-name" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} />
              <Label htmlFor="mailing-template-html">Contenido HTML</Label>
              <Textarea id="mailing-template-html" className="font-mono text-xs" rows={22} value={draft.content_html} onChange={e => setDraft({ ...draft, content_html: e.target.value })} />
            </TabsContent>
          </Tabs>
          <p className="text-xs text-muted-foreground">La baja individual se incorpora por el módulo al enviar. Esta vista previa no genera enlaces de baja ni autoriza envíos.</p>
        </>
      )}
    </section>
  );
}