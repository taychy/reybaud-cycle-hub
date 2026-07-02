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
import { Send, Eye, Settings, Mail, History, Users, AlertTriangle, Loader2, Search, Contact as ContactIcon } from "lucide-react";
import MarketingContactsManager from "@/components/admin/MarketingContactsManager";

const ESTADOS = ["activo", "inactivo", "vacaciones"];
const GRUPOS = ["G1", "G2", "G3", "G4", "Principiante", "Personalizado", "Sin grupo"];
const MARKETING_TIPOS = [
  { value: "lead", label: "Leads" },
  { value: "ex_alumno", label: "Ex alumnos" },
  { value: "evento_externo", label: "Eventos externos" },
  { value: "manual", label: "Manuales" },
  { value: "importado", label: "Importados" },
];

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
  cta_url: "",
  cta_label: "",
  audience: ["students"] as ("students" | "coaches" | "marketing")[],
  estados: ["activo"] as string[],
  grupos: [] as string[],
  sede_ids: [] as string[],
  alumno_ids: [] as string[],
  coach_ids: [] as string[],
  marketing_tipos: [] as string[],
  marketing_tags: [] as string[],
  marketing_ignore_frequency: false,
};

export default function AdminBroadcasts() {
  const { toast } = useToast();
  const [tab, setTab] = useState("composer");
  const [composer, setComposer] = useState(emptyComposer);
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactSearch, setContactSearch] = useState("");
  const [sender, setSender] = useState<{ id?: string; sender_email: string; sender_name: string; reply_to: string }>({
    sender_email: "", sender_name: "", reply_to: "",
  });
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [previewSample, setPreviewSample] = useState<any[]>([]);
  const [fullRecipients, setFullRecipients] = useState<any[]>([]);
  const [excludedEmails, setExcludedEmails] = useState<Set<string>>(new Set());
  const [recipientsDialogOpen, setRecipientsDialogOpen] = useState(false);
  const [recipientsSearch, setRecipientsSearch] = useState("");
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [showConfirmSend, setShowConfirmSend] = useState(false);
  const [showSenderDialog, setShowSenderDialog] = useState(false);
  const [showDetail, setShowDetail] = useState<Broadcast | null>(null);
  const [detailRecipients, setDetailRecipients] = useState<any[]>([]);

  const loadAll = async () => {
    const [bres, sres, cfg, alumnosRes, coachesRes] = await Promise.all([
      supabase.from("broadcasts" as any).select("*").order("created_at", { ascending: false }).limit(100),
      supabase.from("sedes" as any).select("id, nombre").order("nombre"),
      supabase.from("broadcast_sender_config" as any).select("*").limit(1).maybeSingle(),
      supabase.from("alumnos" as any).select("id, nombre, apellido, email, estado, grupo, sede_id").not("email", "is", null).order("nombre"),
      supabase.from("coaches" as any).select("id, nombre, email, estado, grupos, sede_id").not("email", "is", null).order("nombre"),
    ]);
    setBroadcasts((bres.data as any) || []);
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
    audience: composer.audience,
    estados: composer.estados.length ? composer.estados : undefined,
    grupos: composer.grupos.length ? composer.grupos : undefined,
    sede_ids: composer.sede_ids.length ? composer.sede_ids : undefined,
    alumno_ids: composer.alumno_ids.length ? composer.alumno_ids : undefined,
    coach_ids: composer.coach_ids.length ? composer.coach_ids : undefined,
    marketing_tipos: composer.marketing_tipos.length ? composer.marketing_tipos : undefined,
    marketing_tags: composer.marketing_tags.length ? composer.marketing_tags : undefined,
    marketing_ignore_frequency: composer.marketing_ignore_frequency || undefined,
  }), [composer]);

  const [marketingTagOptions, setMarketingTagOptions] = useState<string[]>([]);
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("marketing_contacts" as any).select("tags").limit(2000);
      const s = new Set<string>();
      ((data as any[]) || []).forEach((r) => (r?.tags || []).forEach((t: string) => s.add(t)));
      setMarketingTagOptions(Array.from(s).sort());
    })();
  }, [tab]);

  // Alerta: etapas de precio que entran en vigencia en los próximos 7 días
  const [stageAlerts, setStageAlerts] = useState<Array<{ eventTitle: string; stageName: string; vigenteDesde: string; daysLeft: number }>>([]);
  useEffect(() => {
    (async () => {
      const now = new Date();
      const in7 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const { data } = await supabase
        .from("event_package_price_stages" as any)
        .select("nombre, vigente_desde, event_packages(title, event_id, events(title))")
        .eq("activo", true)
        .gte("vigente_desde", now.toISOString())
        .lte("vigente_desde", in7.toISOString())
        .order("vigente_desde", { ascending: true });
      const rows = ((data as any[]) || []).map((r) => {
        const t = new Date(r.vigente_desde).getTime();
        const daysLeft = Math.max(0, Math.ceil((t - now.getTime()) / (24 * 60 * 60 * 1000)));
        const eventTitle = r.event_packages?.events?.title || "Evento";
        return { eventTitle, stageName: r.nombre, vigenteDesde: r.vigente_desde, daysLeft };
      });
      // dedup por evento (mostramos la más próxima por evento)
      const byEvent = new Map<string, typeof rows[number]>();
      rows.forEach((r) => { if (!byEvent.has(r.eventTitle)) byEvent.set(r.eventTitle, r); });
      setStageAlerts(Array.from(byEvent.values()));
    })();
  }, []);


  const previewSegment = async () => {
    setLoadingPreview(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-broadcast", {
        body: {
          mode: "preview_count",
          segment_filters: segmentFilters,
          include_full_list: true,
          excluded_emails: Array.from(excludedEmails),
        },
      });
      if (error) throw error;
      setPreviewCount(data.count);
      setPreviewSample(data.sample || []);
      setFullRecipients(data.recipients || []);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setLoadingPreview(false);
    }
  };

  const toggleExcluded = (email: string) => {
    const next = new Set(excludedEmails);
    const k = email.toLowerCase();
    if (next.has(k)) next.delete(k);
    else next.add(k);
    setExcludedEmails(next);
    // Re-derive count from currently loaded list (avoid re-querying)
    if (fullRecipients.length) {
      const remaining = fullRecipients.filter((r) => !next.has(r.email.toLowerCase()));
      setPreviewCount(remaining.length);
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
          cta_url: composer.cta_url || undefined,
          cta_label: composer.cta_label || undefined,
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
          cta_url: composer.cta_url || undefined,
          cta_label: composer.cta_label || undefined,
          excluded_emails: Array.from(excludedEmails),
        },
      });
      if (error) throw error;
      toast({
        title: "Envío completado",
        description: `${data.sent}/${data.total} enviados. ${data.failed} fallidos.`,
      });
      setComposer(emptyComposer);
      setPreviewCount(null);
      setFullRecipients([]);
      setExcludedEmails(new Set());
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

  const selectedContactCount = composer.alumno_ids.length + composer.coach_ids.length;
  const filteredContacts = contacts.filter((contact) => {
    const q = contactSearch.trim().toLowerCase();
    if (!q) return true;
    return `${contact.name} ${contact.email} ${contact.grupo || ""} ${(contact.grupos || []).join(" ")}`.toLowerCase().includes(q);
  });
  const toggleContact = (contact: Contact) => {
    if (contact.type === "coach") {
      setComposer({ ...composer, coach_ids: toggleArr(composer.coach_ids, contact.id) });
    } else {
      setComposer({ ...composer, alumno_ids: toggleArr(composer.alumno_ids, contact.id) });
    }
  };
  const isContactSelected = (contact: Contact) =>
    contact.type === "coach" ? composer.coach_ids.includes(contact.id) : composer.alumno_ids.includes(contact.id);

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
        <div className="flex items-center gap-2 flex-wrap">
          {stageAlerts.length > 0 ? (
            <Button asChild size="sm" className="bg-red-600 hover:bg-red-700 text-white border-red-700 animate-pulse">
              <a href="/admin/aprobar-aviso-precio" title={stageAlerts.map(s => `${s.eventTitle} — ${s.stageName} (en ${s.daysLeft}d)`).join("\n")}>
                <AlertTriangle className="w-4 h-4 mr-1" />
                Aprobar aviso de aumento ({stageAlerts.length})
              </a>
            </Button>
          ) : (
            <Button asChild variant="outline" size="sm">
              <a href="/admin/aprobar-aviso-precio">
                <AlertTriangle className="w-4 h-4 mr-1" />
                Aviso de aumento
              </a>
            </Button>
          )}
          <Button variant="outline" onClick={() => setShowSenderDialog(true)}>
            <Settings className="w-4 h-4 mr-1" /> Remitente
          </Button>
        </div>
      </div>

      {stageAlerts.length > 0 && (
        <Card className="p-3 border-red-500/40 bg-red-500/5">
          <div className="flex items-start gap-2 text-sm">
            <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
            <div className="space-y-1">
              <div className="font-semibold text-red-500">
                {stageAlerts.length === 1 ? "1 evento" : `${stageAlerts.length} eventos`} cambia{stageAlerts.length === 1 ? "" : "n"} de etapa de precio en los próximos 7 días
              </div>
              <ul className="text-xs text-muted-foreground list-disc list-inside space-y-0.5">
                {stageAlerts.slice(0, 5).map((s, i) => (
                  <li key={i}>
                    <b className="text-foreground">{s.eventTitle}</b> — "{s.stageName}" en {s.daysLeft} día{s.daysLeft === 1 ? "" : "s"} ({new Date(s.vigenteDesde).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })})
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Card>
      )}


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
          <TabsTrigger value="contacts"><ContactIcon className="w-4 h-4 mr-1" />Contactos</TabsTrigger>
          <TabsTrigger value="history"><History className="w-4 h-4 mr-1" />Historial</TabsTrigger>
        </TabsList>

        <TabsContent value="contacts" className="space-y-4">
          <MarketingContactsManager />
        </TabsContent>

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
              <Label>Contenido *</Label>
              <Textarea
                value={composer.content_html}
                onChange={e => setComposer({ ...composer, content_html: e.target.value })}
                rows={10}
                placeholder={`Hola pelotón,\n\nAbrimos cupos para el próximo viaje...\n\nNos vemos en la ruta!`}
              />
              <p className="text-[11px] text-muted-foreground">
                Escribí libre, se respetan los saltos de línea. El logo y el footer se agregan automáticamente.
              </p>
            </div>

            <div className="grid md:grid-cols-[1fr_auto] gap-3 items-end pt-2 border-t border-border/60">
              <div className="space-y-1.5">
                <Label>Botón de acción (opcional)</Label>
                <Input
                  value={composer.cta_url}
                  onChange={e => setComposer({ ...composer, cta_url: e.target.value })}
                  placeholder="https://reybaud-app.com/eventos/..."
                />
                <p className="text-[11px] text-muted-foreground">URL adonde lleva el botón. Si la dejás vacía y hay un link en el texto, se usa ese.</p>
              </div>
              <div className="space-y-1.5">
                <Label>Texto del botón</Label>
                <Input
                  value={composer.cta_label}
                  onChange={e => setComposer({ ...composer, cta_label: e.target.value })}
                  placeholder="Reservar mi lugar"
                  className="md:w-56"
                />
              </div>
            </div>
          </Card>

          <Card className="p-4 space-y-3">
            <div className="flex items-center gap-2"><Users className="w-4 h-4" /><b>Segmentación</b></div>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={composer.audience.includes("students")}
                  onCheckedChange={() => setComposer({ ...composer, audience: toggleArr(composer.audience, "students") as any })}
                />
                Alumnos
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={composer.audience.includes("coaches")}
                  onCheckedChange={() => setComposer({ ...composer, audience: toggleArr(composer.audience, "coaches") as any })}
                />
                Coaches
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={composer.audience.includes("marketing")}
                  onCheckedChange={() => setComposer({ ...composer, audience: toggleArr(composer.audience, "marketing") as any })}
                />
                Contactos marketing
              </label>
              <span className="text-xs text-muted-foreground self-center">Alumnos, coaches y/o la base de leads y ex-clientes.</span>
            </div>

            {composer.audience.includes("marketing") && (
              <div className="rounded-md border border-dashed p-3 space-y-3 bg-muted/20">
                <div className="text-xs font-medium flex items-center gap-2">
                  <ContactIcon className="w-3.5 h-3.5" /> Filtros de la base de marketing
                </div>
                <div className="grid md:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="text-xs">Tipo de contacto</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {MARKETING_TIPOS.map((t) => (
                        <Badge key={t.value}
                          variant={composer.marketing_tipos.includes(t.value) ? "default" : "outline"}
                          className="cursor-pointer"
                          onClick={() => setComposer({ ...composer, marketing_tipos: toggleArr(composer.marketing_tipos, t.value) })}>
                          {t.label}
                        </Badge>
                      ))}
                    </div>
                    <p className="text-[10px] text-muted-foreground">Vacío = todos los tipos.</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Tags</Label>
                    <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                      {marketingTagOptions.length === 0 ? (
                        <span className="text-[10px] text-muted-foreground">Todavía no hay tags definidos. Asigná tags al cargar contactos.</span>
                      ) : marketingTagOptions.map((t) => (
                        <Badge key={t}
                          variant={composer.marketing_tags.includes(t) ? "default" : "outline"}
                          className="cursor-pointer"
                          onClick={() => setComposer({ ...composer, marketing_tags: toggleArr(composer.marketing_tags, t) })}>
                          {t}
                        </Badge>
                      ))}
                    </div>
                    <p className="text-[10px] text-muted-foreground">Vacío = sin filtro de tags.</p>
                  </div>
                </div>
                <label className="flex items-center gap-2 cursor-pointer text-xs">
                  <Checkbox
                    checked={composer.marketing_ignore_frequency}
                    onCheckedChange={(v) => setComposer({ ...composer, marketing_ignore_frequency: !!v })}
                  />
                  <span>
                    Ignorar tope de frecuencia (por defecto excluye contactos que recibieron una campaña en los últimos 7 días).
                  </span>
                </label>
                <p className="text-[10px] text-muted-foreground">
                  Sólo se envía a contactos con <b>opt-in activo</b>. Los rebotes/bajas (suppressed_emails) se descartan siempre.
                </p>
              </div>
            )}
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

            <div className="space-y-2 pt-2">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <Label className="text-xs">Seleccionar contactos puntuales</Label>
                {selectedContactCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setComposer({ ...composer, alumno_ids: [], coach_ids: [] })}
                  >
                    Limpiar selección ({selectedContactCount})
                  </Button>
                )}
              </div>
              <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={contactSearch}
                  onChange={(e) => setContactSearch(e.target.value)}
                  placeholder="Buscar por nombre, email o grupo..."
                  className="pl-9"
                />
              </div>
              <div className="rounded-md border max-h-64 overflow-y-auto divide-y">
                {filteredContacts.length === 0 ? (
                  <div className="p-3 text-xs text-muted-foreground">No hay contactos con ese filtro.</div>
                ) : filteredContacts.slice(0, 120).map((contact) => (
                  <label key={`${contact.type}-${contact.id}`} className="flex items-center gap-3 p-2 cursor-pointer hover:bg-muted/30">
                    <Checkbox checked={isContactSelected(contact)} onCheckedChange={() => toggleContact(contact)} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium truncate">{contact.name}</span>
                        <Badge variant="outline" className="text-[10px]">{contact.type === "coach" ? "Coach" : "Alumno"}</Badge>
                        {contact.estado && <Badge variant="secondary" className="text-[10px] capitalize">{contact.estado}</Badge>}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {contact.email}{contact.type === "coach" && contact.grupos?.length ? ` · ${contact.grupos.join(", ")}` : contact.grupo ? ` · ${contact.grupo}` : ""}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground">
                Si seleccionás contactos puntuales, el envío usa esa lista exacta. Si no seleccionás ninguno, usa la segmentación de arriba.
              </p>
            </div>

            <div className="flex items-center gap-3 pt-2 flex-wrap">
              <Button variant="secondary" onClick={previewSegment} disabled={loadingPreview}>
                {loadingPreview ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Eye className="w-4 h-4 mr-1" />}
                Calcular destinatarios
              </Button>
              {previewCount !== null && (
                <>
                  <div className="text-sm">
                    Se enviará a <b>{previewCount}</b> destinatario{previewCount === 1 ? "" : "s"}.
                    {excludedEmails.size > 0 && (
                      <span className="text-amber-500 ml-2">({excludedEmails.size} excluido{excludedEmails.size === 1 ? "" : "s"})</span>
                    )}
                  </div>
                  {fullRecipients.length > 0 && (
                    <Button variant="outline" size="sm" onClick={() => { setRecipientsSearch(""); setRecipientsDialogOpen(true); }}>
                      <Users className="w-4 h-4 mr-1" /> Ver y editar lista
                    </Button>
                  )}
                </>
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

      {/* Confirm send */}
      <AlertDialog open={showConfirmSend} onOpenChange={setShowConfirmSend}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Enviar a {previewCount} destinatario{previewCount === 1 ? "" : "s"}?</AlertDialogTitle>
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

      {/* RECIPIENTS LIST EDITOR */}
      <Dialog open={recipientsDialogOpen} onOpenChange={setRecipientsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Destinatarios ({fullRecipients.length - excludedEmails.size} de {fullRecipients.length})</DialogTitle>
            <DialogDescription>
              Destildá los que NO querés que reciban el email. Los excluidos se mantienen al enviar.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={recipientsSearch}
                  onChange={(e) => setRecipientsSearch(e.target.value)}
                  placeholder="Buscar email o nombre..."
                  className="pl-9"
                />
              </div>
              {excludedEmails.size > 0 && (
                <Button variant="ghost" size="sm" onClick={() => setExcludedEmails(new Set())}>
                  Restaurar todos
                </Button>
              )}
            </div>
            <div className="max-h-[420px] overflow-y-auto rounded-md border divide-y">
              {fullRecipients
                .filter((r) => {
                  const q = recipientsSearch.trim().toLowerCase();
                  if (!q) return true;
                  return `${r.email} ${r.nombre || ""}`.toLowerCase().includes(q);
                })
                .map((r) => {
                  const excluded = excludedEmails.has(r.email.toLowerCase());
                  return (
                    <label key={r.email} className="flex items-center gap-3 p-2 cursor-pointer hover:bg-muted/30">
                      <Checkbox
                        checked={!excluded}
                        onCheckedChange={() => toggleExcluded(r.email)}
                      />
                      <div className="min-w-0 flex-1">
                        <div className={`text-sm truncate ${excluded ? "line-through text-muted-foreground" : ""}`}>
                          {r.nombre || r.email}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">{r.email}</div>
                      </div>
                      <Badge variant="outline" className="text-[10px]">{r.type === "coach" ? "Coach" : "Alumno"}</Badge>
                    </label>
                  );
                })}
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setRecipientsDialogOpen(false)}>Listo</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
