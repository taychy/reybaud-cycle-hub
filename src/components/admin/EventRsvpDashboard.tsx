import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { CheckCircle, Mail, RefreshCw, Send, Users, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatPrice } from "@/lib/currency";
import {
  LUNCH_STATUS_LABELS,
  PARTICIPATION_LABELS,
  RESTAURANT_ALIAS,
  RESTAURANT_WHATSAPP_URL,
  hasLunchInterest,
  lunchDinerTotal,
  rsvpInvitationEmail,
  rsvpLunchEmail,
  guestCyclistPaymentEmail,
  type LunchStatus,
  type ParticipationMode,
} from "@/lib/eventRsvp";

type Row = {
  id: string;
  recipient_name: string | null;
  recipient_email: string;
  response: "voy" | "no_voy" | null;
  participation_mode: ParticipationMode | null;
  guests_count: number;
  lunch_attendees: { name: string; category: "adult" | "child_4_9" | "under_4"; is_cyclist?: boolean }[];
  cyclist_guests: { name: string; lunch: boolean; category: "adult" | "child_4_9" | "under_4" }[];
  non_cyclist_guests: { name: string; category: "adult" | "child_4_9" | "under_4" }[];
  responded_at: string | null;
  last_sent_at: string | null;
  lunch_status: LunchStatus;
  adults_count: number;
  children_4_9_count: number;
  under_4_count: number;
  terms_version: string | null;
  terms_accepted_at: string | null;
  receipt_reference: string | null;
  lunch_admin_comment: string | null;
  lunch_status_changed_at: string | null;
};
type TestRow = Pick<Row, "id" | "recipient_name" | "recipient_email" | "response" | "participation_mode" | "cyclist_guests" | "non_cyclist_guests" | "responded_at">;
type Prices = { adult_price: number | null; child_4_9_price: number | null; under_4_price: number | null; prices_confirmed_at: string | null; prices_note?: string | null };
type Audit = { id: string; invite_id: string; from_status: LunchStatus | null; to_status: LunchStatus; comment: string; receipt_reference: string | null; created_at: string };
type Summary = { event_title: string; rows: Row[]; prices: Prices; audit: Audit[] };
type CampaignKind = "invitacion" | "almuerzo";

const statusOptions: LunchStatus[] = ["intencion_confirmada", "instrucciones_pendientes", "instrucciones_enviadas", "comprobante_informado", "pago_verificado"];
const diners = (row: Row) => row.guests_count + 1;

export default function EventRsvpDashboard({ eventId }: { eventId: string }) {
  const { toast } = useToast();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [testRows, setTestRows] = useState<TestRow[]>([]);
  const [eligible, setEligible] = useState<Record<CampaignKind, number>>({ invitacion: 0, almuerzo: 0 });
  const [testEmail, setTestEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [testState, setTestState] = useState<Record<CampaignKind, { sent: boolean; verified: boolean }>>({
    invitacion: { sent: false, verified: false }, almuerzo: { sent: false, verified: false },
  });
  const [priceForm, setPriceForm] = useState({ adult: "", child: "", under4: "", note: "" });
  const [statusEdit, setStatusEdit] = useState<{ row: Row; status: LunchStatus } | null>(null);
  const [statusComment, setStatusComment] = useState("");
  const [receiptReference, setReceiptReference] = useState("");
  const [approvedForEmail, setApprovedForEmail] = useState<Record<string, string[]>>({});

  const call = async (action: string, extra: Record<string, unknown> = {}) => {
    const { data, error } = await supabase.functions.invoke("event-rsvp", { body: { action, event_id: eventId, ...extra } });
    if (error || data?.error) throw new Error(data?.error || error?.message || "Error inesperado");
    return data;
  };

  const campaignFilters = (kind: CampaignKind) => ({
    audience: ["students"], estados: ["activo"], layout: "plain", rsvp_event_id: eventId, rsvp_kind: kind,
  });

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await call("summary");
      const adminRpc = supabase as unknown as {
        rpc: (name: string, args: Record<string, unknown>) => Promise<{
          data: Record<string, Row["lunch_attendees"]> | null;
          error: { message: string } | null;
        }>;
      };
      const guestNames = await adminRpc.rpc("get_event_rsvp_guest_names_admin", { p_event_id: eventId });
      if (guestNames.error) throw new Error(guestNames.error.message);
      const typeRpc = supabase as unknown as {
        rpc: (name: string, args: Record<string, unknown>) => Promise<{
          data: Record<string, { cyclists: Row["cyclist_guests"]; non_cyclists: Row["non_cyclist_guests"] }> | null;
          error: { message: string } | null;
        }>;
      };
      const guestTypes = await typeRpc.rpc("get_event_rsvp_guest_types_admin", { p_event_id: eventId });
      if (guestTypes.error) throw new Error(guestTypes.error.message);
      // Consulta administrativa de pruebas, sin incorporarlas a los contadores reales.
      const testRpc = supabase as unknown as {
        rpc: (name: string, args: Record<string, unknown>) => Promise<{
          data: TestRow[] | null; error: { message: string } | null;
        }>;
      };
      const tests = await testRpc.rpc("get_event_rsvp_test_rows_admin", { p_event_id: eventId });
      if (tests.error) {
        setTestRows([]);
        toast({ title: "No se pudieron cargar las respuestas de prueba", description: tests.error.message, variant: "destructive" });
      } else {
        setTestRows(Array.isArray(tests.data) ? tests.data : []);
      }
      const baseSummary = result as Summary;
      setSummary({
        ...baseSummary,
        rows: (baseSummary.rows || []).map((row) => ({
          ...row,
          lunch_attendees: guestNames.data?.[row.id] || [],
          cyclist_guests: guestTypes.data?.[row.id]?.cyclists || [],
          non_cyclist_guests: guestTypes.data?.[row.id]?.non_cyclists || [],
        })),
      });
      const counts = await Promise.all((["invitacion", "almuerzo"] as CampaignKind[]).map(async (kind) => {
        const { data, error } = await supabase.functions.invoke("send-broadcast", {
          body: { mode: "preview_count", segment_filters: campaignFilters(kind) },
        });
        if (error) throw error;
        return [kind, data?.count || 0] as const;
      }));
      setEligible(Object.fromEntries(counts) as Record<CampaignKind, number>);
    } catch (error) {
      toast({ title: "No pudimos actualizar el Fondazo", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    } finally { setLoading(false); }
  }, [eventId]);

  useEffect(() => {
    refresh();
    supabase.auth.getUser().then(({ data }) => setTestEmail(data.user?.email || ""));
  }, [refresh]);

  useEffect(() => {
    if (!summary?.prices) return;
    setPriceForm({
      adult: summary.prices.adult_price?.toString() || "",
      child: summary.prices.child_4_9_price?.toString() || "",
      under4: summary.prices.under_4_price?.toString() || "",
      note: summary.prices.prices_note || "",
    });
  }, [summary?.prices]);

  const rows = useMemo(() => summary?.rows || [], [summary]);
  const lunchRows = useMemo(() => rows.filter((r) => hasLunchInterest(r.response, r.participation_mode)), [rows]);
  const totals = useMemo(() => ({
    invited: rows.filter((r) => r.last_sent_at).length,
    yes: rows.filter((r) => r.response === "voy").length,
    no: rows.filter((r) => r.response === "no_voy").length,
    pending: rows.filter((r) => r.last_sent_at && !r.response).length,
    fondo: rows.filter((r) => r.response === "voy" && r.participation_mode !== "solo_almuerzo").length,
    lunch: lunchRows.reduce((sum, row) => sum + diners(row), 0),
    paid: lunchRows.filter((r) => r.lunch_status === "pago_verificado").reduce((sum, row) => sum + diners(row), 0),
    cyclistRequested: rows.reduce((sum, row) => sum + (row.cyclist_guests?.length || 0), 0),
    nonCyclists: rows.reduce((sum, row) => sum + (row.non_cyclist_guests?.length || 0), 0),
  }), [rows, lunchRows]);

  const sendCampaign = async (kind: CampaignKind, mode: "test" | "send") => {
    setBusy(true);
    try {
      const mail = kind === "invitacion" ? rsvpInvitationEmail() : rsvpLunchEmail();
      const { data, error } = await supabase.functions.invoke("send-broadcast", {
        body: {
          mode, ...mail, segment_filters: campaignFilters(kind),
          ...(mode === "test" ? { test_email: testEmail } : {}),
        },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message || "El proveedor rechazó el envío");
      if (mode === "test") {
        if (!data?.ok) throw new Error("El proveedor no confirmó la prueba");
        setTestState((current) => ({ ...current, [kind]: { sent: true, verified: false } }));
        toast({ title: "Prueba enviada", description: `Revisá ${testEmail} y probá los enlaces antes de continuar.` });
      } else {
        toast({ title: "Envío general en curso", description: `${data?.queued || 0} correos aceptados para procesamiento por Brevo.` });
        await refresh();
      }
    } catch (error) {
      toast({ title: "No se pudo procesar el correo", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    } finally { setBusy(false); }
  };

  const savePrices = async () => {
    if ([priceForm.adult, priceForm.child, priceForm.under4].some((value) => value.trim() === "")) {
      toast({ title: "Ingresá las tres tarifas confirmadas", variant: "destructive" }); return;
    }
    setBusy(true);
    try {
      await call("update_prices", {
        adult_price: Number(priceForm.adult), child_4_9_price: Number(priceForm.child),
        under_4_price: Number(priceForm.under4), prices_note: priceForm.note,
      });
      toast({ title: "Tarifas confirmadas", description: "El segundo correo y la aceptación del almuerzo ya pueden prepararse." });
      await refresh();
    } catch (error) {
      toast({ title: "No se guardaron las tarifas", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    } finally { setBusy(false); }
  };

  const saveStatus = async () => {
    if (!statusEdit) return;
    setBusy(true);
    try {
      await call("update_lunch", {
        invite_id: statusEdit.row.id, status: statusEdit.status,
        comment: statusComment, receipt_reference: receiptReference || null,
      });
      toast({ title: "Estado actualizado con auditoría" });
      setStatusEdit(null); setStatusComment(""); setReceiptReference("");
      await refresh();
    } catch (error) {
      toast({ title: "No se actualizó el estado", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    } finally { setBusy(false); }
  };

  const prepareCyclistPaymentEmail = (row: Row) => {
    const approved = approvedForEmail[row.id] || [];
    if (row.response !== "voy" || !approved.length) {
      toast({ title: "Primero indicá qué ciclistas aprobó Claudio", variant: "destructive" }); return;
    }
    const { subject, body } = guestCyclistPaymentEmail(approved);
    const destination = `mailto:${encodeURIComponent(row.recipient_email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.assign(destination);
  };

  const campaignBlock = (kind: CampaignKind) => {
    const isLunch = kind === "almuerzo";
    const state = testState[kind];
    const blocked = isLunch && !summary?.prices?.prices_confirmed_at;
    return <div className="rounded-lg border p-4 space-y-3">
      <div>
        <h4 className="font-semibold">{isLunch ? "Segundo correo · pago de parrilla (después de VOY)" : "Primer correo · VOY / NO VOY"}</h4>
        <p className="text-sm text-muted-foreground">
          {isLunch ? `Solo quienes confirmaron VOY e incluyeron almuerzo (${eligible.almuerzo}). Alias del restaurante ${RESTAURANT_ALIAS}, comprobante al WhatsApp de Scarlett. El cupo aprobado se comunica por separado.` : `Alumnos activos elegibles: ${eligible.invitacion}. Los botones abren la pantalla; no votan por prefetch.`}
        </p>
      </div>
      {blocked && <p className="text-sm text-primary">Bloqueado hasta ingresar y confirmar las tres tarifas actuales.</p>}
      <div className="flex flex-col sm:flex-row gap-2">
        <Input type="email" value={testEmail} onChange={(e) => setTestEmail(e.target.value)} aria-label={`Correo de prueba ${kind}`} />
        <Button variant="outline" onClick={() => sendCampaign(kind, "test")} disabled={busy || blocked || !testEmail}>Enviar una prueba</Button>
      </div>
      {state.sent && <label className="flex items-start gap-2 text-sm">
        <Checkbox checked={state.verified} onCheckedChange={(checked) => setTestState((current) => ({ ...current, [kind]: { ...current[kind], verified: checked === true } }))} />
        Revisé el correo y comprobé los enlaces y los datos antes del envío general.
      </label>}
      <AlertDialog>
        <AlertDialogTrigger asChild><Button disabled={busy || blocked || !state.verified || !eligible[kind]}><Send /> Enviar correo general</Button></AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>¿Confirmás el envío general?</AlertDialogTitle>
            <AlertDialogDescription>Se procesarán {eligible[kind]} destinatarios mediante Brevo. Esta acción no se puede deshacer. No se enviará ningún cargo ni se activará el evento.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => sendCampaign(kind, "send")}>Confirmar envío general</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>;
  };

  return <Card className="border-accent/30">
    <CardContent className="p-4 sm:p-6 space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div><h3 className="text-lg font-heading font-bold">Fondazo · asistencia y almuerzo</h3>
          <p className="text-xs text-muted-foreground">Evento en borrador. Los contadores muestran participantes reales; las pruebas aparecen separadas en Respuestas.</p></div>
        <Button variant="outline" size="sm" onClick={refresh} disabled={loading}><RefreshCw /> Actualizar</Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          ["Invitados", totals.invited], ["VOY", totals.yes], ["NO VOY", totals.no], ["Pendientes", totals.pending],
          ["Al fondo (alumnos)", totals.fondo], ["Ciclistas invitados · requieren aprobación", totals.cyclistRequested], ["Acompañantes no ciclistas", totals.nonCyclists], ["Comensales preliminares", totals.lunch], ["Comensales con pago verificado", totals.paid],
        ].map(([label, value]) => <div key={String(label)} className="border rounded-lg p-3 bg-muted/20"><div className="text-xs text-muted-foreground">{label}</div><div className="text-2xl font-bold">{value}</div></div>)}
      </div>

      <Tabs defaultValue="respuestas">
        <TabsList className="grid grid-cols-3 w-full"><TabsTrigger value="respuestas">Respuestas</TabsTrigger><TabsTrigger value="almuerzo">Almuerzo</TabsTrigger><TabsTrigger value="correos">Correos</TabsTrigger></TabsList>
        <TabsContent value="respuestas" className="space-y-2 pt-3">
          <p className="text-xs text-muted-foreground">Respuestas reales: {rows.length}. Las pruebas no ocupan cupos ni se incluyen en correos generales.</p>
          {rows.length ? <div className="border rounded-lg divide-y">{rows.map((row) => <div key={row.id} className="p-3 flex items-center justify-between gap-3 text-sm">
            <div className="min-w-0"><div className="font-medium truncate">{row.recipient_name || row.recipient_email}</div><div className="text-xs text-muted-foreground truncate">{row.recipient_email}</div>
              {row.participation_mode && <div className="text-xs">{PARTICIPATION_LABELS[row.participation_mode]} · {row.cyclist_guests?.length || 0} amigos ciclistas (solicitud) · {row.non_cyclist_guests?.length || 0} acompañantes no ciclistas · {row.guests_count} acompañantes a parrilla</div>}
              {!!row.cyclist_guests?.length && <div className="text-xs text-primary">Ciclistas a consultar con Claudio: {row.cyclist_guests.map((person) => person.name).join(", ")}. No quedan aprobados automáticamente.</div>}
              {row.response === "voy" && !!row.cyclist_guests?.length && <div className="mt-2 border border-primary/30 rounded-lg p-3 space-y-2">
                <p className="text-xs font-semibold">Pago del cupo ciclista · después de la aprobación de Claudio</p>
                <p className="text-xs text-muted-foreground">Marcá solo los ciclistas que Claudio haya aprobado. Esta selección prepara el correo y no guarda una aprobación automática.</p>
                {row.cyclist_guests.map((person, i) => <label key={i} className="flex gap-2 items-center text-xs">
                  <Checkbox checked={(approvedForEmail[row.id] || []).includes(person.name)}
                    onCheckedChange={(checked) => setApprovedForEmail((current) => ({
                      ...current,
                      [row.id]: checked === true
                        ? [...(current[row.id] || []).filter((name) => name !== person.name), person.name]
                        : (current[row.id] || []).filter((name) => name !== person.name),
                    }))} />
                  Claudio aprobó a {person.name}
                </label>)}
                <Button type="button" size="sm" variant="outline" disabled={busy || !(approvedForEmail[row.id] || []).length}
                  onClick={() => prepareCyclistPaymentEmail(row)}>
                  <Mail className="h-4 w-4" /> Preparar correo de cupo aprobado
                </Button>
                <p className="text-xs text-muted-foreground">Abre un borrador para revisar y enviar: alias granfondo.tc, titular Scarlett Tayná y $30.000 por ciclista. No registra aprobación ni envía automáticamente.</p>
              </div>}</div>
            <span className="shrink-0 flex items-center gap-1 text-xs">{row.response === "voy" ? <><CheckCircle className="text-accent" /> VOY</> : row.response === "no_voy" ? <><XCircle /> NO VOY</> : row.last_sent_at ? "Pendiente" : "Preparado"}</span>
          </div>)}</div> : <p className="text-sm text-muted-foreground">Todavía no hay invitaciones ni respuestas reales registradas.</p>}
          <section className="rounded-lg border border-dashed border-accent/40 bg-muted/10 p-3 sm:p-4 space-y-3 mt-4" aria-label="Respuestas de prueba">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="font-semibold text-sm">Respuestas de prueba ({testRows.length})</h4>
              <Badge variant="outline">No cuentan para cupos ni envíos</Badge>
            </div>
            {testRows.length ? testRows.map((test) => (
              <div key={test.id} className="rounded-lg border bg-card/70 p-3 space-y-1 text-sm">
                <div className="flex flex-wrap gap-2 items-center justify-between">
                  <div className="font-semibold">{test.recipient_name || "Invitación de prueba"} <Badge variant="secondary">PRUEBA</Badge></div>
                  <div className="text-xs font-semibold">{test.response === "voy" ? "VOY" : test.response === "no_voy" ? "NO VOY" : "Sin respuesta"}</div>
                </div>
                {test.participation_mode && <p className="text-xs">{PARTICIPATION_LABELS[test.participation_mode]}</p>}
                <p className="text-xs text-muted-foreground">
                  {test.cyclist_guests?.length || 0} amigo(s) ciclista(s) · {test.non_cyclist_guests?.length || 0} acompañante(s) no ciclista(s)
                </p>
                {(test.cyclist_guests || []).map((person, index) =>
                  <p key={`test-c-${index}`} className="text-xs">Ciclista: {person.name} · Adulto{person.lunch ? " · también almuerza" : ""}</p>)}
                {(test.non_cyclist_guests || []).map((person, index) =>
                  <p key={`test-n-${index}`} className="text-xs">{person.category === "adult" ? "Adulto" : person.category === "child_4_9" ? "Niño/a 4 a 9 años" : "Menor de 4"}: {person.name}</p>)}
              </div>
            )) : <p className="text-xs text-muted-foreground">No hay respuestas de prueba registradas.</p>}
          </section>
        </TabsContent>

        <TabsContent value="almuerzo" className="space-y-5 pt-3">
          <div className="rounded-lg border p-4 space-y-3">
            <h4 className="font-semibold">Tarifas actuales del restaurante</h4>
            <p className="text-xs text-muted-foreground">Sin valores históricos precargados. Ingresá los importes reconfirmados; el cero para menores de cuatro también requiere confirmación explícita.</p>
            <div className="grid grid-cols-3 gap-2">
              <div><Label htmlFor="price-adult">Adultos ARS</Label><Input id="price-adult" type="number" min="0" value={priceForm.adult} onChange={(e) => setPriceForm({ ...priceForm, adult: e.target.value })} /></div>
              <div><Label htmlFor="price-child">4–9 años ARS</Label><Input id="price-child" type="number" min="0" value={priceForm.child} onChange={(e) => setPriceForm({ ...priceForm, child: e.target.value })} /></div>
              <div><Label htmlFor="price-under4">Menores de 4 ARS</Label><Input id="price-under4" type="number" min="0" value={priceForm.under4} onChange={(e) => setPriceForm({ ...priceForm, under4: e.target.value })} /></div>
            </div>
            <Textarea value={priceForm.note} onChange={(e) => setPriceForm({ ...priceForm, note: e.target.value })} placeholder="Fuente, fecha y aclaración de la confirmación" />
            <Button onClick={savePrices} disabled={busy}>Confirmar tarifas actuales</Button>
            {summary?.prices.prices_confirmed_at && <p className="text-xs text-accent">Confirmadas: adultos {formatPrice(Number(summary.prices.adult_price), "ARS")} · 4–9 {formatPrice(Number(summary.prices.child_4_9_price), "ARS")} · menores de 4 {formatPrice(Number(summary.prices.under_4_price), "ARS")}</p>}
          </div>

          <div className="space-y-2"><h4 className="font-semibold">Gestión administrativa</h4>
            {lunchRows.length ? lunchRows.map((row) => <div key={row.id} className="border rounded-lg p-3 space-y-2">
              <div className="flex justify-between gap-3"><div><strong>{row.recipient_name || row.recipient_email}</strong><div className="text-xs text-muted-foreground">{diners(row)} comensales · {row.guests_count} acompañantes</div></div><Badge variant="outline">{LUNCH_STATUS_LABELS[row.lunch_status]}</Badge></div>
              {!!row.cyclist_guests?.length && <div className="rounded-md border border-primary/40 p-2 text-xs">
                <strong>Ciclistas invitados · aprobación de Claudio pendiente</strong>
                {row.cyclist_guests.map((person, index) => <div key={index}>{person.name} · {person.lunch ? "Fondo + almuerzo" : "Solo fondo"}</div>)}
              </div>}
              <div className="text-xs text-muted-foreground">Asistencia confirmada en la encuesta. Las condiciones y comprobantes se comunican en el correo de pago posterior.</div>
              <div className="rounded-md bg-muted/30 p-3 text-xs space-y-1">
                <div className="font-semibold">Comensales declarados en la encuesta</div>
                <div>{row.recipient_name || row.recipient_email} · Titular adulto</div>
                {(row.non_cyclist_guests || []).map((person, index) =>
                  <div key={`non-${index}`}>{person.name} · No ciclista · {person.category === "adult" ? "Adulto" : person.category === "child_4_9" ? "4 a 9 años" : "Menor de 4"}</div>
                )}
                {(row.cyclist_guests || []).filter((person) => person.lunch).map((person, index) =>
                  <div key={`cyclist-${index}`}>{person.name} · Amigo ciclista · Adulto</div>
                )}
                {summary?.prices.prices_confirmed_at && <div className="font-medium pt-1">Estimación parrilla: {formatPrice(
                  (1 + row.non_cyclist_guests.filter((person) => person.category === "adult").length +
                    row.cyclist_guests.filter((person) => person.lunch).length) * Number(summary.prices.adult_price) +
                  row.non_cyclist_guests.filter((person) => person.category === "child_4_9").length * Number(summary.prices.child_4_9_price) +
                  row.non_cyclist_guests.filter((person) => person.category === "under_4").length * Number(summary.prices.under_4_price), "ARS"
                )}</div>}
              </div>
              {row.receipt_reference && <div className="text-xs">Comprobante: {row.receipt_reference}</div>}
              <div className="flex flex-col sm:flex-row gap-2"><Select value={statusEdit?.row.id === row.id ? statusEdit.status : row.lunch_status} onValueChange={(status) => { setStatusEdit({ row, status: status as LunchStatus }); setStatusComment(""); setReceiptReference(row.receipt_reference || ""); }}>
                <SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{statusOptions.map((status) => <SelectItem key={status} value={status}>{LUNCH_STATUS_LABELS[status]}</SelectItem>)}</SelectContent></Select>
              </div>
            </div>) : <p className="text-sm text-muted-foreground">Todavía no hay interesados en el almuerzo.</p>}
          </div>

          {summary?.audit.length ? <div className="rounded-lg border p-4 space-y-2"><h4 className="font-semibold">Auditoría reciente</h4>{summary.audit.slice(0, 12).map((entry) => {
            const person = rows.find((row) => row.id === entry.invite_id);
            return <div key={entry.id} className="text-xs border-b pb-2 last:border-0"><strong>{person?.recipient_name || "Participante"}</strong> · {entry.from_status ? LUNCH_STATUS_LABELS[entry.from_status] : "Inicio"} → {LUNCH_STATUS_LABELS[entry.to_status]}<div>{entry.comment}</div><div className="text-muted-foreground">{new Date(entry.created_at).toLocaleString("es-AR")}</div></div>;
          })}</div> : null}
        </TabsContent>

        <TabsContent value="correos" className="space-y-4 pt-3">
          <div className="rounded-lg bg-muted/30 p-3 text-sm"><Mail className="inline mr-2" />Los envíos usan el canal Brevo existente, con bajas, supresiones y trazabilidad. Ningún correo se envía al abrir este tablero.</div>
          {campaignBlock("invitacion")}
          {campaignBlock("almuerzo")}
          <p className="text-xs text-muted-foreground">Comprobantes a la organización de Ciclismo Reybaud: <a className="text-accent" href={RESTAURANT_WHATSAPP_URL} target="_blank" rel="noreferrer">WhatsApp de Scarlett +54 9 11 7171-1122</a>. Scarlett los reenvía al restaurante; la reserva del almuerzo sólo se confirma con pago verificado.</p>
        </TabsContent>
      </Tabs>

      <Dialog open={!!statusEdit} onOpenChange={(open) => !open && setStatusEdit(null)}>
        <DialogContent><DialogHeader><DialogTitle>Cambiar estado del almuerzo</DialogTitle><DialogDescription>{statusEdit?.row.recipient_name} · {statusEdit && LUNCH_STATUS_LABELS[statusEdit.status]}. La fecha y el usuario quedan registrados.</DialogDescription></DialogHeader>
          <div className="space-y-2"><Label htmlFor="status-comment">Comentario obligatorio</Label><Textarea id="status-comment" value={statusComment} onChange={(e) => setStatusComment(e.target.value)} placeholder="Motivo del cambio o verificación con el restaurante" /></div>
          <div className="space-y-2"><Label htmlFor="receipt-reference">Referencia del comprobante {statusEdit?.status === "pago_verificado" ? "(obligatoria)" : "(opcional)"}</Label><Input id="receipt-reference" value={receiptReference} onChange={(e) => setReceiptReference(e.target.value)} placeholder="Dato administrativo, sin subir archivos" /></div>
          <DialogFooter><Button variant="outline" onClick={() => setStatusEdit(null)}>Cancelar</Button><Button onClick={saveStatus} disabled={busy || statusComment.trim().length < 3 || (statusEdit?.status === "pago_verificado" && !receiptReference.trim())}>Guardar con auditoría</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </CardContent>
  </Card>;
}
