import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Eye, Mail, Send, Lock, Loader2 } from "lucide-react";

interface TemplateMeta {
  key: string;
  subject: string;
  description: string;
  trigger: string;
  recipients: string;
  previewHtml: () => string;
}

const TEMPLATES: TemplateMeta[] = [
  {
    key: "reservation_confirmed_with_payment",
    subject: "Tu reserva fue confirmada — coordinemos la seña",
    description: "Email al participante cuando admin confirma su reserva. Incluye CTAs de Mercado Pago y aviso de efectivo.",
    trigger: "RPC confirm_reservation → admin_notification_events → process-admin-notifications",
    recipients: "Alumno o participante externo titular de la reserva",
    previewHtml: () => `<div style="font-family:system-ui;max-width:560px;padding:20px"><h2>¡Tu reserva está confirmada!</h2><p>Hola <b>Juan Pérez</b>, ya quedaste anotado en <b>Camp de Verano 2026</b>.</p><div style="border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin:16px 0"><p style="margin:0;color:#6b7280;font-size:12px">Próximo pago sugerido</p><p style="margin:4px 0 0;font-size:24px;font-weight:700;color:#ea580c">$150.000</p><p style="margin:8px 0 0;color:#6b7280;font-size:12px">Seña</p></div><a href="#" style="display:block;background:#22c55e;color:#fff;text-decoration:none;text-align:center;padding:14px;border-radius:10px;font-weight:600;margin-bottom:8px">Pagar ahora con Mercado Pago</a><a href="#" style="display:block;background:#fff;color:#111;border:2px solid #f59e0b;text-decoration:none;text-align:center;padding:12px;border-radius:10px;font-weight:600">Voy a pagar en efectivo</a></div>`,
  },
  {
    key: "reservation_payment_reported",
    subject: "💳 Pago informado — reserva {id}",
    description: "Notificación a admin cuando el alumno reporta un pago vía transferencia / depósito / MP externo.",
    trigger: "ReportPaymentDrawer (modo 'Ya pagué') → admin_notification_events",
    recipients: "Admins suscriptos a 'pagos'",
    previewHtml: () => `<div style="font-family:system-ui;padding:20px"><h2>💳 Pago informado</h2><p>Juan Pérez reportó un pago de <b>$150.000</b> via <b>Transferencia</b>.</p><a href="#" style="background:#0ea5e9;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Ver reserva</a></div>`,
  },
  {
    key: "reservation_cash_announced",
    subject: "💵 Efectivo anunciado — reserva {id}",
    description: "Notificación a admin cuando un alumno anuncia que pagará en efectivo. El pago NO está acreditado.",
    trigger: "RPC announce_cash_payment → admin_notification_events",
    recipients: "Admins suscriptos a 'efectivo_anunciado'",
    previewHtml: () => `<div style="font-family:system-ui;padding:20px"><h2>💵 Efectivo anunciado</h2><p>Juan Pérez avisó que pagará <b>$150.000</b> en efectivo en <b>sede</b> antes del 30/06.</p><div style="background:#fef3c7;border-left:4px solid #f59e0b;padding:10px;border-radius:6px;margin:12px 0">El pago aún no está acreditado.</div></div>`,
  },
  {
    key: "reservation_cash_collected",
    subject: "✅ Efectivo cobrado — reserva {id}",
    description: "Notificación a admin cuando se marca un anuncio de efectivo como cobrado. Crea el pago real.",
    trigger: "RPC mark_cash_collected → admin_notification_events",
    recipients: "Admins suscriptos a 'pagos'",
    previewHtml: () => `<div style="font-family:system-ui;padding:20px"><h2>✅ Efectivo cobrado</h2><p>Se acreditó el pago en efectivo de Juan Pérez por <b>$150.000</b>.</p></div>`,
  },
  {
    key: "reservation_checklist_critical_progress",
    subject: "⚠️ Checklist crítico — reserva {id}",
    description: "Alerta a admin cuando un alumno completa un item crítico (documentación, seguro, transporte, apto médico).",
    trigger: "Checklist update con dedup key 'checklist:{res}:{item}'",
    recipients: "Admins suscriptos a 'checklist_critico'",
    previewHtml: () => `<div style="font-family:system-ui;padding:20px"><h2>⚠️ Checklist crítico</h2><p>Juan Pérez completó: <b>Apto médico subido</b>.</p></div>`,
  },
  {
    key: "admin_test_email",
    subject: "✅ Email de prueba — Reybaud Admin",
    description: "Email manual de prueba para verificar que el dominio remitente y la cola funcionan.",
    trigger: "Botón 'Enviar prueba' (solo super_admin)",
    recipients: "Lista app_config.admin_notification_emails",
    previewHtml: () => `<div style="font-family:system-ui;padding:20px"><h2>Email de prueba</h2><p>Si recibís este mensaje, el dominio y la cola funcionan correctamente.</p></div>`,
  },
];

const AdminEmailTemplates = () => {
  const { toast } = useToast();
  const [tab, setTab] = useState("plantillas");
  const [previewTpl, setPreviewTpl] = useState<TemplateMeta | null>(null);

  // Config tab (super_admin)
  const [isSuper, setIsSuper] = useState(false);
  const [maskedInfo, setMaskedInfo] = useState<{ count: number; emails: string[]; masked: boolean } | null>(null);
  const [editEmails, setEditEmails] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
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
    if (error) {
      toast({ title: "Error al guardar", description: error.message, variant: "destructive" });
    } else {
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
      toast({
        title: "Prueba enviada",
        description: `Encolados ${((data as any)?.results || []).filter((r: any) => r.queued).length} emails.`,
      });
    } catch (e: any) {
      toast({ title: "Falló el envío de prueba", description: e.message, variant: "destructive" });
    }
    setTesting(false);
  };

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6 max-w-6xl">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-heading font-bold flex items-center gap-2"><Mail className="w-6 h-6" /> Comunicaciones</h1>
          <p className="text-sm text-muted-foreground">Plantillas de emails automáticos enviadas por la plataforma.</p>
        </div>
        <Button asChild variant="gold" size="sm">
          <a href="/admin/aprobar-aviso-precio">Aprobar aviso de aumento →</a>
        </Button>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="plantillas">Plantillas</TabsTrigger>
          <TabsTrigger value="config">Configuración</TabsTrigger>
        </TabsList>

        <TabsContent value="plantillas" className="space-y-3 mt-4">
          <Card className="p-3 text-xs text-muted-foreground bg-muted/40">
            <strong>Fase 1 (solo lectura).</strong> Estas plantillas se envían automáticamente. Para sugerir cambios, usá el botón "Solicitar cambio".
          </Card>

          <div className="space-y-2">
            {TEMPLATES.map(t => (
              <Card key={t.key} className="p-4 flex flex-col md:flex-row md:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <code className="text-[11px] bg-muted px-2 py-0.5 rounded">{t.key}</code>
                    <Badge variant="outline" className="text-[10px]">{t.recipients}</Badge>
                  </div>
                  <p className="text-sm font-semibold mt-1">{t.subject}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{t.description}</p>
                  <p className="text-[10px] text-muted-foreground/70 mt-1">Trigger: {t.trigger}</p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setPreviewTpl(t)}>
                    <Eye className="w-3.5 h-3.5 mr-1" /> Vista previa
                  </Button>
                </div>
              </Card>
            ))}
          </div>

          <Card className="p-3 text-[11px] text-muted-foreground bg-muted/40 flex items-center gap-2">
            <Lock className="w-3.5 h-3.5" /> Edición de plantillas: <strong>fase 2</strong> (solo super_admin, con versionado y restauración).
          </Card>
        </TabsContent>

        <TabsContent value="config" className="space-y-4 mt-4">
          <Card className="p-4 space-y-3">
            <h2 className="font-semibold flex items-center gap-2">Destinatarios admin</h2>
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
                <p className="text-xs text-muted-foreground">Un email por línea. Estos destinatarios reciben las notificaciones automáticas.</p>
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
                <p className="text-[11px] text-muted-foreground">El envío de prueba no bloquea ningún flujo si falla.</p>
              </>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!previewTpl} onOpenChange={() => setPreviewTpl(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{previewTpl?.subject}</DialogTitle>
          </DialogHeader>
          <div className="text-xs text-muted-foreground mb-2">Vista previa con datos ficticios.</div>
          <div className="border rounded-lg overflow-hidden bg-white">
            <div dangerouslySetInnerHTML={{ __html: previewTpl?.previewHtml() || "" }} />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminEmailTemplates;
