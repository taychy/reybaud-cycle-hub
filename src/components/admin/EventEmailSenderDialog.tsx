import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Send, Users } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId: string;
  /** If provided: sends a pre-existing announcement. Otherwise opens manual mode. */
  announcement?: { id: string; title: string; content: string } | null;
  onSent?: () => void;
}

const PAYMENT_STATUS_OPTIONS = [
  { value: "pending", label: "Pendiente" },
  { value: "partial", label: "Parcial" },
  { value: "paid", label: "Pagado" },
  { value: "overdue", label: "Vencido" },
];

const RES_STATUS_DEFAULT = ["confirmed", "pending", "partial", "reserved"];

const EventEmailSenderDialog = ({ open, onOpenChange, eventId, announcement, onSent }: Props) => {
  const { toast } = useToast();
  const [packages, setPackages] = useState<{ id: string; nombre: string }[]>([]);
  const [selectedPackages, setSelectedPackages] = useState<string[]>([]);
  const [selectedPaymentStatuses, setSelectedPaymentStatuses] = useState<string[]>([]);
  const [includeExternals, setIncludeExternals] = useState(true);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [recipientCount, setRecipientCount] = useState<number | null>(null);
  const [sending, setSending] = useState(false);

  const isManual = !announcement;

  useEffect(() => {
    if (!open) return;
    setSelectedPackages([]);
    setSelectedPaymentStatuses([]);
    setIncludeExternals(true);
    setRecipientCount(null);
    if (announcement) {
      setSubject(announcement.title);
      setBody(announcement.content);
    } else {
      setSubject("");
      setBody("");
    }
    // Load packages for filter
    supabase
      .from("event_packages" as any)
      .select("id, nombre")
      .eq("event_id", eventId)
      .eq("activo", true)
      .order("sort_order")
      .then(({ data }) => setPackages((data as any[]) || []));
  }, [open, eventId, announcement]);

  // Estimate recipient count when filters change
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      let q = supabase
        .from("event_reservations" as any)
        .select("id, alumno_id, external_participant_id", { count: "exact", head: false })
        .eq("event_id", eventId)
        .in("reservation_status", RES_STATUS_DEFAULT);
      if (selectedPackages.length) q = q.in("package_id", selectedPackages);
      if (selectedPaymentStatuses.length) q = q.in("payment_status", selectedPaymentStatuses);
      const { data } = await q;
      if (cancelled) return;
      const rows = (data as any[]) || [];
      const filtered = includeExternals ? rows : rows.filter((r) => r.alumno_id);
      setRecipientCount(filtered.length);
    })();
    return () => { cancelled = true; };
  }, [open, eventId, selectedPackages, selectedPaymentStatuses, includeExternals]);

  const togglePkg = (id: string) =>
    setSelectedPackages((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const togglePay = (v: string) =>
    setSelectedPaymentStatuses((p) => (p.includes(v) ? p.filter((x) => x !== v) : [...p, v]));

  const handleSend = async () => {
    if (isManual && (!subject.trim() || !body.trim())) {
      toast({ title: "Asunto y mensaje son obligatorios.", variant: "destructive" });
      return;
    }
    setSending(true);
    const { data: { user } } = await supabase.auth.getUser();
    const bodyHtml = body
      .split(/\n{2,}/)
      .map((p) => `<p style="margin:0 0 12px;">${p.replace(/\n/g, "<br/>")}</p>`)
      .join("");

    const { data, error } = await supabase.functions.invoke("send-event-announcement", {
      body: {
        event_id: eventId,
        announcement_id: announcement?.id || null,
        subject: isManual ? subject : undefined,
        body_html: isManual ? bodyHtml : undefined,
        filters: {
          package_ids: selectedPackages.length ? selectedPackages : null,
          payment_statuses: selectedPaymentStatuses.length ? selectedPaymentStatuses : null,
          include_externals: includeExternals,
        },
        enviado_por: user?.id || null,
        enviado_por_email: user?.email || null,
      },
    });

    setSending(false);

    if (error) {
      toast({ title: "Error al enviar", description: error.message, variant: "destructive" });
      return;
    }
    toast({
      title: `Enviados: ${data?.sent ?? 0}`,
      description: data?.failed ? `Fallaron: ${data.failed}` : "Los correos se encolaron correctamente.",
    });
    onSent?.();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isManual ? "Enviar mail manual a participantes" : `Enviar novedad por email`}</DialogTitle>
          <DialogDescription>
            {isManual
              ? "Asunto y mensaje libres. Se envía a los participantes según los filtros."
              : "Se enviará el contenido de la novedad seleccionada a los participantes filtrados."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {isManual && (
            <>
              <div className="space-y-1.5">
                <Label>Asunto *</Label>
                <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Ej: Cambio de horario del punto de encuentro" />
              </div>
              <div className="space-y-1.5">
                <Label>Mensaje *</Label>
                <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} placeholder="Escribí el contenido del mensaje. Doble salto = nuevo párrafo." />
              </div>
            </>
          )}

          {!isManual && (
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <p className="font-medium">{announcement?.title}</p>
              <p className="text-muted-foreground line-clamp-3 mt-1 whitespace-pre-line">{announcement?.content}</p>
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Paquetes</Label>
            {packages.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sin paquetes definidos · se envía a todos.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {packages.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 rounded-md border p-2 cursor-pointer hover:bg-muted/40">
                    <Checkbox checked={selectedPackages.includes(p.id)} onCheckedChange={() => togglePkg(p.id)} />
                    <span className="text-sm truncate">{p.nombre}</span>
                  </label>
                ))}
              </div>
            )}
            {selectedPackages.length === 0 && packages.length > 0 && (
              <p className="text-[11px] text-muted-foreground">Sin selección = todos los paquetes.</p>
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Estado de pago</Label>
            <div className="flex flex-wrap gap-2">
              {PAYMENT_STATUS_OPTIONS.map((opt) => (
                <label key={opt.value} className="flex items-center gap-2 rounded-md border px-3 py-1.5 cursor-pointer hover:bg-muted/40">
                  <Checkbox checked={selectedPaymentStatuses.includes(opt.value)} onCheckedChange={() => togglePay(opt.value)} />
                  <span className="text-sm">{opt.label}</span>
                </label>
              ))}
            </div>
            {selectedPaymentStatuses.length === 0 && (
              <p className="text-[11px] text-muted-foreground">Sin selección = todos los estados.</p>
            )}
          </div>

          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label className="text-sm">Incluir participantes externos</Label>
              <p className="text-[11px] text-muted-foreground">Invitados sin cuenta dentro del sistema.</p>
            </div>
            <Switch checked={includeExternals} onCheckedChange={setIncludeExternals} />
          </div>

          <div className="flex items-center justify-between rounded-lg border-2 border-primary/30 bg-primary/5 p-3">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">Destinatarios estimados</span>
            </div>
            <Badge variant="outline" className="text-base px-3">
              {recipientCount === null ? "…" : recipientCount}
            </Badge>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>Cancelar</Button>
          <Button variant="gold" onClick={handleSend} disabled={sending || recipientCount === 0}>
            <Send className="w-4 h-4 mr-1" />
            {sending ? "Enviando…" : `Enviar a ${recipientCount ?? 0}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EventEmailSenderDialog;
