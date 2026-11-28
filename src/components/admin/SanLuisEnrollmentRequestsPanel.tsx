import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, Loader2, Search } from "lucide-react";
import { sanLuisCamps, sanLuisPackages } from "@/lib/sanLuisPreRegistration";
import { ENROLLMENT_PAYMENT_BLOCKER, ENROLLMENT_STATUS_LABELS, ENROLLMENT_STATUSES, EnrollmentStatus } from "@/lib/sanLuisEnrollment";
import { formatPrice } from "@/lib/currency";

interface Attendee { firstName: string; lastName: string }
interface RequestRow {
  id: string;
  reference: string;
  event_id: string;
  package_id: string;
  preregistration_id: string | null;
  email: string;
  phone: string;
  people_count: number;
  attendees: Attendee[];
  extra_night_interest: boolean;
  comment: string;
  estimated_unit_price: number;
  estimated_total: number;
  currency: string;
  status: EnrollmentStatus;
  hotel_validated: boolean;
  approved_unit_price: number | null;
  admin_notes: string;
  reviewed_at: string | null;
  created_at: string;
}
interface HistoryRow { id: string; action: string; from_status: string | null; to_status: string | null; review_note: string; details: Record<string, unknown>; created_at: string }

const eventIds = Object.values(sanLuisCamps).map(c => c.id);
const campForEvent = (eventId: string) => Object.values(sanLuisCamps).find(c => c.id === eventId);
const packageFor = (packageId: string) => Object.values(sanLuisPackages).flat().find(p => p.id === packageId);

export default function SanLuisEnrollmentRequestsPanel() {
  const { toast } = useToast();
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("todos");
  const [camp, setCamp] = useState("todos");
  const [selected, setSelected] = useState<RequestRow | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [reviewStatus, setReviewStatus] = useState<EnrollmentStatus>("en_revision");
  const [hotelValidated, setHotelValidated] = useState(false);
  const [approvedPrice, setApprovedPrice] = useState("");
  const [adminNotes, setAdminNotes] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("event_enrollment_requests").select("*").in("event_id", eventIds).order("created_at", { ascending: false });
    if (error) toast({ title: "No se pudieron leer las solicitudes", description: error.message, variant: "destructive" });
    setRows(((data ?? []) as unknown as RequestRow[]));
    setLoading(false);
  };
  useEffect(() => { void load(); }, []);

  const openReview = async (row: RequestRow) => {
    setSelected(row);
    setReviewStatus(row.status === "recibida" ? "en_revision" : row.status);
    setHotelValidated(row.hotel_validated);
    setApprovedPrice(String(row.approved_unit_price ?? row.estimated_unit_price));
    setAdminNotes(row.admin_notes ?? "");
    setReviewNote("");
    const { data } = await supabase.from("event_enrollment_request_history").select("*").eq("request_id", row.id).order("created_at", { ascending: false });
    setHistory((data ?? []) as unknown as HistoryRow[]);
  };
  const saveReview = async () => {
    if (!selected || saving) return;
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc("admin_review_event_enrollment_request", {
        p_request_id: selected.id,
        p_status: reviewStatus,
        p_admin_notes: adminNotes,
        p_hotel_validated: hotelValidated,
        p_approved_unit_price: approvedPrice === "" ? null : Number(approvedPrice),
        p_review_note: reviewNote,
      });
      if (error) throw error;
      toast({ title: "Revisión guardada", description: "No se creó una reserva, un cobro ni una plaza confirmada." });
      setSelected(null);
      await load();
    } catch (e) {
      toast({ title: "No se pudo guardar", description: e instanceof Error ? e.message : "Revisá los datos", variant: "destructive" });
    } finally { setSaving(false); }
  };

  const filtered = useMemo(() => rows.filter(row => {
    if (status !== "todos" && row.status !== status) return false;
    if (camp !== "todos" && row.event_id !== sanLuisCamps[camp as "full" | "mini"].id) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [row.reference, row.email, row.phone, ...row.attendees.flatMap(a => [a.firstName, a.lastName])].some(v => v.toLowerCase().includes(q));
  }), [rows, search, status, camp]);

  return <div className="space-y-4">
    <Card className="border-primary/40"><CardHeader><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-primary" /> Aprobación manual obligatoria</CardTitle></CardHeader><CardContent className="text-sm space-y-2">
      <p>Las solicitudes no ocupan plazas ni generan cargos. Para aprobar una cotización, Naty debe validar hotel y precio y dejar una nota de revisión.</p>
      <p className="text-muted-foreground">{ENROLLMENT_PAYMENT_BLOCKER}</p>
    </CardContent></Card>
    <Card><CardContent className="pt-4 grid gap-3 md:grid-cols-[1fr_180px_180px]">
      <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="pl-9" placeholder="Referencia, persona, email o WhatsApp…" value={search} onChange={e => setSearch(e.target.value)} /></div>
      <Select value={camp} onValueChange={setCamp}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Ambos camps</SelectItem><SelectItem value="full">Camp completo</SelectItem><SelectItem value="mini">Mini Camp</SelectItem></SelectContent></Select>
      <Select value={status} onValueChange={setStatus}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todos los estados</SelectItem>{ENROLLMENT_STATUSES.map(s => <SelectItem key={s} value={s}>{ENROLLMENT_STATUS_LABELS[s]}</SelectItem>)}</SelectContent></Select>
    </CardContent></Card>
    {loading ? <Loader2 className="mx-auto h-6 w-6 animate-spin" /> : filtered.length === 0 ? <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">No hay solicitudes con esos filtros.</CardContent></Card> : <div className="space-y-3">
      {filtered.map(row => {
        const pkg = packageFor(row.package_id);
        const campInfo = campForEvent(row.event_id);
        return <Card key={row.id}><CardContent className="pt-4 space-y-3">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
            <div><p className="font-semibold">{row.attendees.map(a => `${a.firstName} ${a.lastName}`).join(" · ")}</p><p className="text-xs text-muted-foreground">{row.reference} · {new Date(row.created_at).toLocaleString("es-AR")}</p></div>
            <Badge variant={row.status === "aprobada_cotizacion" ? "default" : "outline"}>{ENROLLMENT_STATUS_LABELS[row.status]}</Badge>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
            <div><p className="text-xs text-muted-foreground">Camp y paquete</p><p>{campInfo?.label}</p><p>{pkg?.label}</p></div>
            <div><p className="text-xs text-muted-foreground">Personas y estimado</p><p>{row.people_count} · {formatPrice(row.estimated_total, row.currency)}</p><p className="text-xs text-muted-foreground">Precio final: {row.approved_unit_price ? `${formatPrice(row.approved_unit_price, row.currency)} c/u` : "pendiente"}</p></div>
            <div><p className="text-xs text-muted-foreground">Contacto</p><p>{row.email}</p><p>{row.phone}</p></div>
            <div><p className="text-xs text-muted-foreground">Revisión</p><p>Hotel: {row.hotel_validated ? "validado" : "pendiente"}</p><p>Noche 17: {row.extra_night_interest ? "interés" : "no"}</p><p>Preinscripción: {row.preregistration_id ? "vinculada" : "sin previa"}</p></div>
          </div>
          {row.comment && <p className="text-sm text-muted-foreground">Comentario: {row.comment}</p>}
          <Button variant="outline" size="sm" onClick={() => void openReview(row)}>Revisar solicitud</Button>
        </CardContent></Card>;
      })}
    </div>}

    <Dialog open={!!selected} onOpenChange={open => !open && setSelected(null)}><DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto"><DialogHeader><DialogTitle>{selected?.reference} · Revisión manual</DialogTitle></DialogHeader>
      {selected && <div className="space-y-5 text-sm">
        <div className="rounded-lg bg-secondary/40 p-4 space-y-2"><p className="font-medium">{selected.attendees.map(a => `${a.firstName} ${a.lastName}`).join(" · ")}</p><p>{campForEvent(selected.event_id)?.label} · {packageFor(selected.package_id)?.label}</p><p>{selected.people_count} personas · estimado {formatPrice(selected.estimated_total, selected.currency)}</p><p>{selected.email} · {selected.phone}</p>{selected.extra_night_interest && <p>Interés en noche extra 17/01: precio y disponibilidad a confirmar.</p>}{selected.comment && <p>Comentario: {selected.comment}</p>}</div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-2"><Label>Estado</Label><Select value={reviewStatus} onValueChange={v => setReviewStatus(v as EnrollmentStatus)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{ENROLLMENT_STATUSES.map(s => <SelectItem key={s} value={s} disabled={s === "pendiente_pago" || s === "confirmada"}>{ENROLLMENT_STATUS_LABELS[s]}{s === "pendiente_pago" || s === "confirmada" ? " · bloqueado" : ""}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-2"><Label htmlFor="approved-price">Precio unitario revisado (ARS)</Label><Input id="approved-price" type="number" min="1" step="1" value={approvedPrice} onChange={e => setApprovedPrice(e.target.value)} /></div>
        </div>
        <div className="flex items-start gap-3"><Checkbox id="hotel-validated" checked={hotelValidated} onCheckedChange={v => setHotelValidated(v === true)} /><Label htmlFor="hotel-validated">Validé manualmente con el hotel el alojamiento para esta solicitud.</Label></div>
        <p className="text-xs text-muted-foreground">Esto no confirma plazas. La validación atómica entre ambos camps se exigirá antes de habilitar pagos.</p>
        <div className="space-y-2"><Label htmlFor="review-note">Nota de decisión {["aprobada_cotizacion", "rechazada"].includes(reviewStatus) ? "*" : "(opcional)"}</Label><Textarea id="review-note" value={reviewNote} onChange={e => setReviewNote(e.target.value)} placeholder="Qué verificaste, con quién y qué queda pendiente…" /></div>
        <div className="space-y-2"><Label htmlFor="admin-notes">Notas internas</Label><Textarea id="admin-notes" value={adminNotes} onChange={e => setAdminNotes(e.target.value)} /></div>
        <Button onClick={() => void saveReview()} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Guardar revisión · sin cobrar</Button>
        <div className="border-t border-border pt-4"><p className="font-medium mb-2">Historial</p><div className="space-y-2">{history.map(h => <div key={h.id} className="text-xs border-l border-border pl-3"><p>{new Date(h.created_at).toLocaleString("es-AR")} · {h.action}{h.to_status ? ` → ${ENROLLMENT_STATUS_LABELS[h.to_status as EnrollmentStatus] ?? h.to_status}` : ""}</p>{h.review_note && <p className="text-muted-foreground">{h.review_note}</p>}</div>)}</div></div>
      </div>}
    </DialogContent></Dialog>
  </div>;
}
