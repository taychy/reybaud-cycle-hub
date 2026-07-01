import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Eye, Send, ArrowLeft, AlertTriangle, RefreshCw } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Link } from "react-router-dom";

interface Preview {
  variant: "paid_full" | "with_balance" | "interested";
  email: string;
  nombre: string;
  subject: string;
  html: string;
  balance: number | null;
}

interface EventRow { id: string; title: string; }

const VARIANT_LABEL: Record<Preview["variant"], string> = {
  paid_full: "Ya pagó",
  with_balance: "Con saldo",
  interested: "Interesado",
};
const VARIANT_COLOR: Record<Preview["variant"], string> = {
  paid_full: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  with_balance: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  interested: "bg-sky-500/15 text-sky-600 border-sky-500/30",
};

const AdminPriceAlertApproval = () => {
  const { toast } = useToast();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [eventId, setEventId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [previews, setPreviews] = useState<Preview[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [approved, setApproved] = useState<Set<string>>(new Set());
  const [previewOpen, setPreviewOpen] = useState<Preview | null>(null);
  const [sending, setSending] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);

  useEffect(() => {
    supabase
      .from("events")
      .select("id, title")
      .order("start_date", { ascending: false })
      .limit(50)
      .then(({ data }) => setEvents((data as EventRow[]) || []));
  }, []);

  const loadPreviews = async () => {
    if (!eventId) return;
    setLoading(true);
    setPreviews([]);
    setApproved(new Set());
    setSummary(null);
    setWarnings([]);
    try {
      const { data, error } = await supabase.functions.invoke("send-price-increase-alert", {
        body: { mode: "preview", event_id: eventId },
      });
      if (error) throw error;
      const result = ((data as any)?.results || [])[0];
      if (!result) {
        toast({ title: "Sin etapas futuras", description: "No hay etapas de precio programadas a futuro para este evento.", variant: "destructive" });
        setLoading(false);
        return;
      }
      const list: Preview[] = result.previews || [];
      setPreviews(list);
      setApproved(new Set(list.map((p) => p.email))); // por defecto todos aprobados
      setSummary(result);

      // Warnings (solo advertencia)
      const w: string[] = [];
      const vig = new Date(result.vigente_desde);
      if (vig.getFullYear() < 2020) w.push(`⚠️ Fecha de vigencia inusual: ${vig.toLocaleString("es-AR")}`);
      if (result.old_min && result.new_min && Number(result.new_min) <= Number(result.old_min)) {
        w.push(`⚠️ Precio nuevo (${result.new_min}) no es mayor al actual (${result.old_min})`);
      }
      if (list.length === 0) w.push("⚠️ 0 destinatarios encontrados");
      setWarnings(w);
    } catch (e: any) {
      toast({ title: "Error al cargar preview", description: e.message, variant: "destructive" });
    }
    setLoading(false);
  };

  const grouped = useMemo(() => {
    const g: Record<Preview["variant"], Preview[]> = { paid_full: [], with_balance: [], interested: [] };
    for (const p of previews) g[p.variant].push(p);
    return g;
  }, [previews]);

  const toggleApproved = (email: string) => {
    setApproved((prev) => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email); else next.add(email);
      return next;
    });
  };

  const toggleGroup = (variant: Preview["variant"]) => {
    const emails = grouped[variant].map((p) => p.email);
    const allSelected = emails.every((e) => approved.has(e));
    setApproved((prev) => {
      const next = new Set(prev);
      if (allSelected) emails.forEach((e) => next.delete(e));
      else emails.forEach((e) => next.add(e));
      return next;
    });
  };

  const handleSend = async () => {
    if (approved.size === 0) {
      toast({ title: "No hay destinatarios aprobados", variant: "destructive" });
      return;
    }
    if (!confirm(`¿Enviar ${approved.size} mail(s) reales ahora?`)) return;
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-price-increase-alert", {
        body: {
          mode: "send",
          event_id: eventId,
          approved_emails: Array.from(approved),
        },
      });
      if (error) throw error;
      const sent = ((data as any)?.results || [])[0]?.emails_sent || 0;
      toast({ title: `Encolados ${sent} mails`, description: "Se envían en el próximo ciclo de la cola (segundos)." });
    } catch (e: any) {
      toast({ title: "Error al enviar", description: e.message, variant: "destructive" });
    }
    setSending(false);
  };

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-5 max-w-6xl">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link to="/admin/comunicaciones"><ArrowLeft className="w-4 h-4 mr-1" /> Comunicaciones</Link>
        </Button>
      </div>

      <div>
        <h1 className="text-2xl font-heading font-bold">Aprobar aviso de aumento de precio</h1>
        <p className="text-sm text-muted-foreground">Cargá el evento, revisá cada mail y aprobá uno por uno antes de enviar.</p>
      </div>

      <Card className="p-4 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[240px]">
          <label className="text-xs text-muted-foreground">Evento</label>
          <Select value={eventId} onValueChange={setEventId}>
            <SelectTrigger><SelectValue placeholder="Elegí un evento" /></SelectTrigger>
            <SelectContent>
              {events.map((e) => <SelectItem key={e.id} value={e.id}>{e.title}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={loadPreviews} disabled={!eventId || loading}>
          {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
          Cargar destinatarios
        </Button>
      </Card>

      {summary && (
        <Card className="p-4 text-sm space-y-1">
          <div className="font-semibold">{summary.event_title} — Etapa "{summary.stage}"</div>
          <div className="text-muted-foreground">
            Vigente desde: <b>{new Date(summary.vigente_desde).toLocaleString("es-AR")}</b> · Precio actual: <b>{summary.old_min ?? "—"}</b> → Precio nuevo: <b>{summary.new_min}</b> {summary.currency}
          </div>
          <div className="text-xs text-muted-foreground">
            Buckets: ya pagó <b>{summary.buckets.paid_full}</b> · con saldo <b>{summary.buckets.with_balance}</b> · interesados <b>{summary.buckets.interested}</b>
          </div>
        </Card>
      )}

      {warnings.length > 0 && (
        <Card className="p-3 border-amber-500/40 bg-amber-500/5 space-y-1">
          {warnings.map((w, i) => (
            <div key={i} className="text-xs text-amber-700 dark:text-amber-400 flex gap-2"><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />{w}</div>
          ))}
          <div className="text-[10px] text-muted-foreground pt-1">Estos son avisos, no bloquean el envío. Vos decidís.</div>
        </Card>
      )}

      {previews.length > 0 && (
        <>
          {(["paid_full", "with_balance", "interested"] as const).map((variant) => (
            grouped[variant].length === 0 ? null : (
              <Card key={variant} className="p-3">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={VARIANT_COLOR[variant]}>{VARIANT_LABEL[variant]}</Badge>
                    <span className="text-sm text-muted-foreground">{grouped[variant].length} destinatarios</span>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => toggleGroup(variant)}>
                    {grouped[variant].every((p) => approved.has(p.email)) ? "Desmarcar todos" : "Marcar todos"}
                  </Button>
                </div>
                <div className="divide-y">
                  {grouped[variant].map((p) => (
                    <div key={p.email} className="flex items-center gap-3 py-2">
                      <Checkbox checked={approved.has(p.email)} onCheckedChange={() => toggleApproved(p.email)} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{p.nombre}</div>
                        <div className="text-xs text-muted-foreground truncate">{p.email}</div>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => setPreviewOpen(p)}>
                        <Eye className="w-3.5 h-3.5 mr-1" /> Ver mail
                      </Button>
                    </div>
                  ))}
                </div>
              </Card>
            )
          ))}

          <div className="sticky bottom-4 z-10">
            <Card className="p-3 flex items-center justify-between shadow-lg border-primary/40">
              <div className="text-sm">
                Aprobados: <b>{approved.size}</b> / {previews.length}
              </div>
              <Button onClick={handleSend} disabled={sending || approved.size === 0} variant="gold">
                {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                Enviar {approved.size} mail(s)
              </Button>
            </Card>
          </div>
        </>
      )}

      <Dialog open={!!previewOpen} onOpenChange={() => setPreviewOpen(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-sm">
              <div className="text-xs text-muted-foreground font-normal">Para: {previewOpen?.email}</div>
              <div>{previewOpen?.subject}</div>
            </DialogTitle>
          </DialogHeader>
          <div className="border rounded-lg overflow-hidden bg-white">
            <div dangerouslySetInnerHTML={{ __html: previewOpen?.html || "" }} />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminPriceAlertApproval;
