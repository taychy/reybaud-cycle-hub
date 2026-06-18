import { useEffect, useMemo, useState } from "react";
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
import { Send, Users, Search, FileCode } from "lucide-react";
import { EMAIL_TEMPLATES } from "@/lib/emailTemplates/tourDeFrancia26";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId: string;
  /** If provided: sends a pre-existing announcement. Otherwise opens manual mode. */
  announcement?: { id: string; title: string; content: string } | null;
  onSent?: () => void;
}

const INACTIVE_RES_STATUSES = ["cancelada", "rechazada", "cancelacion_solicitada"];

interface Recipient {
  reservation_id: string;
  alumno_id: string | null;
  external_id: string | null;
  package_id: string | null;
  name: string;
  email: string;
  is_external: boolean;
}

type ReservationRecipientRow = {
  id: string;
  alumno_id: string | null;
  external_participant_id: string | null;
  package_id: string | null;
  reservation_status: string | null;
  external_email?: string | null;
  external_first_name?: string | null;
  external_last_name?: string | null;
  alumno?: { nombre: string | null; apellido: string | null; email: string | null } | null;
  external_participant?: { nombre: string | null; apellido: string | null; email: string | null } | null;
};

const EventEmailSenderDialog = ({ open, onOpenChange, eventId, announcement, onSent }: Props) => {
  const { toast } = useToast();
  const [packages, setPackages] = useState<{ id: string; nombre: string }[]>([]);
  const [selectedPackages, setSelectedPackages] = useState<string[]>([]);
  const [includeExternals, setIncludeExternals] = useState(true);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [isHtml, setIsHtml] = useState(false);
  const [sending, setSending] = useState(false);
  const [allRecipients, setAllRecipients] = useState<Recipient[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loadingRecipients, setLoadingRecipients] = useState(false);
  const [search, setSearch] = useState("");

  const isManual = !announcement;

  // Reset on open + load packages
  useEffect(() => {
    if (!open) return;
    setSelectedPackages([]);
    setIncludeExternals(true);
    setSearch("");
    if (announcement) {
      setSubject(announcement.title);
      setBody(announcement.content);
      setIsHtml(false);
    } else {
      setSubject("");
      setBody("");
      setIsHtml(false);
    }
    supabase
      .from("event_packages" as any)
      .select("id, nombre")
      .eq("event_id", eventId)
      .eq("activo", true)
      .order("sort_order")
      .then(({ data }) => setPackages((data as any[]) || []));
  }, [open, eventId, announcement]);

  // Cargar lista de participantes (alumnos + externos)
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoadingRecipients(true);
      const { data: reservations, error } = await supabase
        .from("event_reservations" as any)
        .select("id, alumno_id, external_participant_id, package_id, reservation_status, external_email, external_first_name, external_last_name, alumno:alumnos!event_reservations_alumno_id_fkey(nombre, apellido, email), external_participant:event_external_participants!event_reservations_external_participant_id_fkey(nombre, apellido, email)")
        .eq("event_id", eventId);

      if (cancelled) return;
      if (error) {
        setAllRecipients([]);
        setSelectedIds(new Set());
        setLoadingRecipients(false);
        toast({ title: "No se pudieron cargar los participantes.", description: error.message, variant: "destructive" });
        return;
      }

      const rows = (((reservations as unknown) as ReservationRecipientRow[]) || []).filter(
        (r) => !INACTIVE_RES_STATUSES.includes(r.reservation_status || "")
      );

      const list: Recipient[] = [];
      for (const r of rows) {
        if (r.alumno_id && r.alumno?.email) {
          const a = r.alumno;
          if (!a.email) continue;
          list.push({
            reservation_id: r.id,
            alumno_id: r.alumno_id,
            external_id: null,
            package_id: r.package_id,
            name: `${a.nombre || ""} ${a.apellido || ""}`.trim() || a.email,
            email: a.email,
            is_external: false,
          });
        } else if (r.external_participant_id && (r.external_participant?.email || r.external_email)) {
          const e = r.external_participant;
          const email = e?.email || r.external_email || "";
          if (!email) continue;
          list.push({
            reservation_id: r.id,
            alumno_id: null,
            external_id: r.external_participant_id,
            package_id: r.package_id,
            name: `${e?.nombre || r.external_first_name || ""} ${e?.apellido || r.external_last_name || ""}`.trim() || email,
            email,
            is_external: true,
          });
        }
      }
      if (cancelled) return;
      setAllRecipients(list);
      // Por defecto: todos seleccionados
      setSelectedIds(new Set(list.map((r) => r.reservation_id)));
      setLoadingRecipients(false);
    })();
    return () => { cancelled = true; };
  }, [open, eventId]);

  // Filtrado: por paquetes, externos, búsqueda
  const visibleRecipients = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allRecipients.filter((r) => {
      if (!includeExternals && r.is_external) return false;
      if (selectedPackages.length && (!r.package_id || !selectedPackages.includes(r.package_id))) return false;
      if (q && !r.name.toLowerCase().includes(q) && !r.email.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [allRecipients, includeExternals, selectedPackages, search]);

  // Cuando cambian los filtros, ajustar selección: mantener solo IDs todavía visibles
  useEffect(() => {
    setSelectedIds((prev) => {
      const visibleIds = new Set(visibleRecipients.map((r) => r.reservation_id));
      const next = new Set<string>();
      prev.forEach((id) => { if (visibleIds.has(id)) next.add(id); });
      // Si la selección se vació y hay visibles, seleccionar todos
      if (next.size === 0 && visibleIds.size > 0) {
        visibleIds.forEach((id) => next.add(id));
      }
      return next;
    });
  }, [visibleRecipients]);

  const allVisibleSelected =
    visibleRecipients.length > 0 && visibleRecipients.every((r) => selectedIds.has(r.reservation_id));

  const toggleAllVisible = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        visibleRecipients.forEach((r) => next.delete(r.reservation_id));
      } else {
        visibleRecipients.forEach((r) => next.add(r.reservation_id));
      }
      return next;
    });
  };

  const togglePkg = (id: string) =>
    setSelectedPackages((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const recipientCount = selectedIds.size;

  const handleSend = async () => {
    if (isManual && (!subject.trim() || !body.trim())) {
      toast({ title: "Asunto y mensaje son obligatorios.", variant: "destructive" });
      return;
    }
    if (recipientCount === 0) {
      toast({ title: "Seleccioná al menos un participante.", variant: "destructive" });
      return;
    }
    setSending(true);
    const { data: { user } } = await supabase.auth.getUser();
    const bodyHtml = isHtml
      ? body
      : body
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
          // Selección explícita de reservas (vence sobre cualquier otro filtro)
          reservation_ids: Array.from(selectedIds),
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
          <DialogTitle>{isManual ? "Enviar mail manual a participantes" : "Enviar novedad por email"}</DialogTitle>
          <DialogDescription>
            {isManual
              ? "Asunto y mensaje libres. Elegí a quién enviar."
              : "Se enviará la novedad seleccionada a los participantes que elijas."}
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
                <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} placeholder="Escribí el contenido. Doble salto = nuevo párrafo." />
              </div>
            </>
          )}

          {!isManual && (
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <p className="font-medium">{announcement?.title}</p>
              <p className="text-muted-foreground line-clamp-3 mt-1 whitespace-pre-line">{announcement?.content}</p>
            </div>
          )}

          {/* Filtros opcionales (acotan la lista de abajo) */}
          {packages.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Filtrar por paquete</Label>
              <div className="grid grid-cols-2 gap-2">
                {packages.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 rounded-md border p-2 cursor-pointer hover:bg-muted/40">
                    <Checkbox checked={selectedPackages.includes(p.id)} onCheckedChange={() => togglePkg(p.id)} />
                    <span className="text-sm truncate">{p.nombre}</span>
                  </label>
                ))}
              </div>
              {selectedPackages.length === 0 && (
                <p className="text-[11px] text-muted-foreground">Sin selección = todos los paquetes.</p>
              )}
            </div>
          )}

          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label className="text-sm">Incluir participantes externos</Label>
              <p className="text-[11px] text-muted-foreground">Invitados sin cuenta dentro del sistema.</p>
            </div>
            <Switch checked={includeExternals} onCheckedChange={setIncludeExternals} />
          </div>

          {/* Lista de participantes con selector individual */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Participantes ({visibleRecipients.length})
              </Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={toggleAllVisible}
                disabled={visibleRecipients.length === 0}
              >
                {allVisibleSelected ? "Deseleccionar todos" : "Seleccionar todos"}
              </Button>
            </div>

            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nombre o email…"
                className="pl-7 h-8 text-xs"
              />
            </div>

            <div className="max-h-64 overflow-y-auto rounded-md border divide-y">
              {loadingRecipients ? (
                <p className="text-xs text-muted-foreground p-3">Cargando participantes…</p>
              ) : visibleRecipients.length === 0 ? (
                <p className="text-xs text-muted-foreground p-3 italic">
                  {allRecipients.length === 0
                    ? "Este evento todavía no tiene participantes con reserva activa."
                    : "Ningún participante coincide con los filtros."}
                </p>
              ) : (
                visibleRecipients.map((r) => {
                  const checked = selectedIds.has(r.reservation_id);
                  return (
                    <label
                      key={r.reservation_id}
                      className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/40"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) => {
                          setSelectedIds((prev) => {
                            const next = new Set(prev);
                            if (v) next.add(r.reservation_id); else next.delete(r.reservation_id);
                            return next;
                          });
                        }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm truncate">{r.name}</div>
                        <div className="text-[11px] text-muted-foreground truncate">{r.email}</div>
                      </div>
                      {r.is_external && (
                        <Badge variant="outline" className="text-[9px]">Externo</Badge>
                      )}
                    </label>
                  );
                })
              )}
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border-2 border-primary/30 bg-primary/5 p-3">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">Destinatarios seleccionados</span>
            </div>
            <Badge variant="outline" className="text-base px-3">
              {recipientCount}
            </Badge>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>Cancelar</Button>
          <Button variant="gold" onClick={handleSend} disabled={sending || recipientCount === 0}>
            <Send className="w-4 h-4 mr-1" />
            {sending ? "Enviando…" : `Enviar a ${recipientCount}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EventEmailSenderDialog;
