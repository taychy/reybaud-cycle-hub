import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Bike, CalendarDays, CheckCircle2, MapPin, MessageCircle, XCircle, Copy } from "lucide-react";
import {
  FONDAZO_NOTICE, ADULT_LUNCH_PRICE_ANNOUNCED, COMPANIONS_TECH_MAX,
  LUNCH_POLICY_PENDING,
  LUNCH_POLICY_TEXT,
  LUNCH_POLICY_VERSION,
  LUNCH_STATUS_LABELS,
  PARTICIPATION_LABELS,
  RESTAURANT_ALIAS,
  RESTAURANT_WHATSAPP_URL,
  formatLunchPrice,
  hasLunchInterest,
  lunchAmount,
  lunchDinerTotal,
  validateLunchCounts,
  type LunchCounts,
  type LunchPrices,
  type LunchStatus,
  type ParticipationMode,
} from "@/lib/eventRsvp";
import { formatPrice } from "@/lib/currency";

type LunchGuest = { name: string; category: "adult" | "child_4_9" | "under_4" };
const newLunchGuest = (): LunchGuest => ({ name: "", category: "adult" });

type RsvpData = {
  event: { title: string; date: string; location: string };
  name: string | null;
  response: "voy" | "no_voy" | null;
  participation_mode: ParticipationMode | null;
  guests_count: number;
  lunch: LunchCounts & { status: LunchStatus; terms_version: string | null; terms_accepted_at: string | null; attendees: LunchGuest[] };
  prices: LunchPrices;
};

const modes = Object.entries(PARTICIPATION_LABELS) as [ParticipationMode, string][];
const eventDate = (value: string) => {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  const weekday = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"][new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  return `${weekday} ${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
};

export default function EventRsvp() {
  const { token } = useParams<{ token: string }>();
  const [params] = useSearchParams();
  const [data, setData] = useState<RsvpData | null>(null);
  const [choice, setChoice] = useState<"voy" | "no_voy">(params.get("opcion") === "no_voy" ? "no_voy" : "voy");
  const [mode, setMode] = useState<ParticipationMode>("fondo_y_almuerzo");
  const [guests, setGuests] = useState(0);
  const [guestDetails, setGuestDetails] = useState<LunchGuest[]>([]);
  useEffect(() => {
    setGuestDetails((previous) => Array.from({ length: guests }, (_, index) => previous[index] || newLunchGuest()));
  }, [guests]);
  const counts = useMemo<LunchCounts>(() => {
    const derived = { adults_count: 1, children_4_9_count: 0, under_4_count: 0 };
    guestDetails.slice(0, guests).forEach((person) => {
      if (person.category === "adult") derived.adults_count += 1;
      else if (person.category === "child_4_9") derived.children_4_9_count += 1;
      else derived.under_4_count += 1;
    });
    return derived;
  }, [guestDetails, guests]);
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const hydrate = (response: RsvpData) => {
    setData(response);
    if (response.response) setChoice(response.response);
    if (response.participation_mode) setMode(response.participation_mode);
    setGuests(response.guests_count || 0);
    setGuestDetails(Array.isArray(response.lunch.attendees) ? response.lunch.attendees : []);
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!token) { setError("Enlace inválido."); setLoading(false); return; }
      const { data: response, error: failure } = await supabase.functions.invoke("event-rsvp", {
        body: { action: "status", token },
      });
      if (!mounted) return;
      if (failure || response?.error) setError(response?.error || "No pudimos abrir este enlace.");
      else hydrate(response as RsvpData);
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, [token]);

  const call = async (action: "respond" | "confirm_lunch_named", extra: Record<string, unknown>) => {
    if (!token) return;
    setSaving(true); setError(""); setNotice("");
    // Los nombres se guardan por RPC segura con el token de invitación.
    // El resto de las respuestas mantiene el canal existente, sin desplegar nuevas Edge Functions.
    let response: RsvpData | { error?: string } | null = null;
    let failure: { message: string } | null = null;
    if (action === "confirm_lunch_named") {
      const namedRpc = supabase as unknown as {
        rpc: (name: string, args: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
      };
      const saved = await namedRpc.rpc("confirm_event_rsvp_lunch_named", {
        p_token: token, p_guests: extra.guest_details,
      });
      failure = saved.error;
      if (!failure) {
        const loaded = await supabase.functions.invoke("event-rsvp", { body: { action: "status", token } });
        response = loaded.data as RsvpData | null;
        failure = loaded.error;
      }
    } else {
      const saved = await supabase.functions.invoke("event-rsvp", { body: { action, token, ...extra } });
      response = saved.data as RsvpData | null;
      failure = saved.error;
    }
    if (failure || response?.error) setError(response?.error || failure?.message || "No pudimos guardar. Intentá de nuevo.");
    else {
      hydrate(response as RsvpData);
      setNotice(action === "respond"
        ? "Respuesta actualizada. Podés volver a editarla desde este mismo enlace."
        : "Datos y aceptación guardados. La reserva queda confirmada sólo cuando administración verifica el pago con el restaurante.");
      setAccepted(false);
    }
    setSaving(false);
  };

  const submitRsvp = () => call("respond", {
    response: choice,
    participation_mode: choice === "voy" ? mode : null,
    guests_count: choice === "voy" && mode !== "solo_fondo" ? guests : 0,
  });

  const total = useMemo(() => data ? lunchAmount(counts, data.prices) : null, [counts, data]);
  const whatsappUrl = useMemo(() => {
    const text = data
      ? `Hola! Soy ${data.name || "participante de Reybaud"}. Envío el comprobante del almuerzo del Fondazo para ${lunchDinerTotal(counts)} persona(s). Total transferido: ${total == null ? "importe a confirmar" : formatPrice(total, "ARS")}.`
      : "Hola! Envío el comprobante del almuerzo del Fondazo.";
    return `${RESTAURANT_WHATSAPP_URL}?text=${encodeURIComponent(text)}`;
  }, [counts, data, total]);

  const copyAlias = async () => {
    try { await navigator.clipboard.writeText(RESTAURANT_ALIAS); setNotice("Alias copiado."); }
    catch { setError(`No pudimos copiar. El alias es ${RESTAURANT_ALIAS}.`); }
  };

  const submitLunch = () => {
    const validation = validateLunchCounts(counts, guests);
    if (validation || guestDetails.length !== guests) { setError(validation || "Revisá la cantidad de acompañantes."); return; }
    if (guestDetails.some((person) => person.name.trim().length < 2 || person.name.trim().length > 100)) {
      setError("Completá nombre y apellido de cada acompañante."); return;
    }
    if (!accepted) { setError("Leé y aceptá las condiciones para continuar."); return; }
    call("confirm_lunch_named", { guest_details: guestDetails.map((person) => ({ name: person.name.trim(), category: person.category })) });
  };
  const savedDetails = data?.lunch.attendees || [];
  const detailsAreSaved = !!data?.lunch.terms_accepted_at &&
    JSON.stringify(savedDetails) === JSON.stringify(guestDetails.map((person) => ({ name: person.name.trim(), category: person.category })));
  const locked = data?.lunch.status === "pago_verificado" || data?.lunch.status === "comprobante_informado";

  return (
    <div className="min-h-screen bg-background text-foreground px-4 py-8 sm:py-12">
      <Card className="w-full max-w-xl mx-auto border-accent/30 bg-card shadow-xl">
        <CardContent className="space-y-6 p-5 sm:p-8">
          <div className="space-y-3 border-l-4 border-primary pl-4">
            <div className="font-heading uppercase tracking-widest text-sm text-primary">Ciclismo Reybaud</div>
            <h1 className="font-heading text-3xl sm:text-4xl font-bold uppercase">{data?.event.title || "Fondazo de Fin de Año"}</h1>
            {data && <>
              <p className="flex gap-2 items-center text-accent"><CalendarDays className="w-4 h-4" /> {eventDate(data.event.date)}</p>
              <p className="flex gap-2 items-start text-muted-foreground text-sm"><MapPin className="w-4 h-4 mt-0.5 shrink-0" /> {data.event.location}</p>
            </>}
          </div>

          {loading ? <p className="text-muted-foreground">Abriendo tu invitación…</p> : data ? <>
            <div role="note" className="rounded-lg border-2 border-primary bg-primary/10 p-4 text-sm font-medium">{FONDAZO_NOTICE}</div>
            <p>Hola{data.name ? `, ${data.name}` : ""}! Elegí una opción y después tocá <strong>Confirmar mi respuesta</strong>.</p>
            <div className="grid grid-cols-2 gap-3">
              <Button type="button" variant={choice === "voy" ? "gold" : "outline"} onClick={() => setChoice("voy")}>
                <CheckCircle2 /> VOY
              </Button>
              <Button type="button" variant={choice === "no_voy" ? "secondary" : "outline"} onClick={() => setChoice("no_voy")}>
                <XCircle /> NO VOY
              </Button>
            </div>

            {choice === "voy" && <div className="space-y-4">
              <div className="space-y-2">
                <Label>¿De qué parte de la jornada vas a participar?</Label>
                {modes.map(([value, label]) => (
                  <label key={value} className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer ${mode === value ? "border-accent bg-accent/10" : ""}`}>
                    <input type="radio" name="mode" checked={mode === value} onChange={() => setMode(value)} className="accent-[hsl(var(--accent))]" />
                    {label}
                  </label>
                ))}
              </div>
              {mode !== "solo_fondo" && <div className="space-y-2">
                <Label htmlFor="guests">¿Cuántos acompañantes que no pedalean vienen al almuerzo?</Label>
                <Input id="guests" type="number" min={0} max={COMPANIONS_TECH_MAX} value={guests}
                  onChange={(e) => setGuests(Math.max(0, Math.min(COMPANIONS_TECH_MAX, Math.trunc(Number(e.target.value) || 0))))} />
                <p className="text-xs text-muted-foreground">Total preliminar para el almuerzo: {guests + 1}, incluyéndote. Sin límite comercial de cupos (solo un control interno técnico). Cuenta únicamente personas que no pedalean.</p>
                <p className="text-xs text-muted-foreground"><strong>No sumes acá a amigos ciclistas.</strong> Para traer un amigo al fondo, consultalo antes con Claudio: su participación no queda registrada ni aprobada con este formulario.</p>
              </div>}
            </div>}

            <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
              Esta respuesta es preliminar y editable. No reserva el almuerzo, no genera cargos y no confirma pagos.
            </div>
            <Button onClick={submitRsvp} disabled={saving} variant="gold" className="w-full">
              {saving ? "Guardando…" : "Confirmar mi respuesta"}
            </Button>

            {hasLunchInterest(data.response, data.participation_mode) && <section className="border-t border-border pt-6 space-y-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold">Almuerzo en La Carreta del Gato</h2>
                  <p className="text-sm text-muted-foreground">Reserva y pago se gestionan directamente con el restaurante.</p>
                </div>
                <Badge variant="outline" className="text-xs">{LUNCH_STATUS_LABELS[data.lunch.status]}</Badge>
              </div>

              {!data.prices.prices_confirmed_at ? <>
                <div className="grid grid-cols-3 gap-2 text-center text-sm">
                  <div className="rounded-lg bg-muted/40 p-3"><div className="text-xs text-muted-foreground">Adultos</div><strong>{formatPrice(ADULT_LUNCH_PRICE_ANNOUNCED, "ARS")}</strong></div>
                  <div className="rounded-lg bg-muted/40 p-3"><div className="text-xs text-muted-foreground">De 4 a 9 años</div><strong>A confirmar</strong></div>
                  <div className="rounded-lg bg-muted/40 p-3"><div className="text-xs text-muted-foreground">Menores de 4</div><strong>A confirmar</strong></div>
                </div>
                <p className="text-xs text-muted-foreground">Bebidas aparte.</p>
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
                  <h3 className="font-semibold">Pago directo al restaurante (solo parrilla)</h3>
                  <div className="flex items-center justify-between gap-2"><strong>Alias: {RESTAURANT_ALIAS}</strong>
                    <Button type="button" size="sm" variant="outline" onClick={copyAlias}><Copy /> Copiar</Button></div>
                  <p className="text-sm"><strong>No transfieras todavía.</strong> Falta confirmar las tarifas de menores para calcular tu total exacto; te avisamos cuando puedas transferir. El aporte de $30.000 de amigos ciclistas no se paga a este alias.</p>
                  <Button type="button" variant="outline" className="w-full" disabled><MessageCircle /> Enviar comprobante a Scarlett (disponible al confirmar el total)</Button>
                </div>
              </> : <>
                <div className="grid grid-cols-3 gap-2 text-center text-sm">
                  <div className="rounded-lg bg-muted/40 p-3"><div className="text-xs text-muted-foreground">Adultos</div><strong>{formatLunchPrice(data.prices.adult_price)}</strong></div>
                  <div className="rounded-lg bg-muted/40 p-3"><div className="text-xs text-muted-foreground">De 4 a 9 años</div><strong>{formatLunchPrice(data.prices.child_4_9_price)}</strong></div>
                  <div className="rounded-lg bg-muted/40 p-3"><div className="text-xs text-muted-foreground">Menores de 4</div><strong>{formatLunchPrice(data.prices.under_4_price)}</strong></div>
                </div>
                <p className="text-xs text-muted-foreground">Bebidas aparte. Confirmá las edades: deben sumar {guests + 1}, incluyéndote.</p>
                <div className="space-y-3">
                  <h3 className="font-semibold">¿Quiénes vienen a la parrilla?</h3>
                  <p className="text-xs text-muted-foreground">Sumamos tu nombre como titular adulto. Completá nombre y apellido y grupo de edad de cada acompañante que no pedalea.</p>
                  <div className="rounded-lg bg-muted/40 p-3 text-sm">
                    <div className="font-medium">{data.name || "Titular de la invitación"}</div>
                    <div className="text-xs text-muted-foreground">Titular · Adulto · {formatLunchPrice(data.prices.adult_price)}</div>
                  </div>
                  {guestDetails.map((person, index) => <div key={index} className="rounded-lg border p-3 space-y-2">
                    <Label htmlFor={`guest-name-${index}`}>Acompañante {index + 1}</Label>
                    <Input id={`guest-name-${index}`} placeholder="Nombre y apellido" maxLength={100} value={person.name} disabled={locked}
                      onChange={(e) => setGuestDetails((previous) => previous.map((item, i) => i === index ? { ...item, name: e.target.value } : item))} />
                    <select aria-label={`Grupo de edad del acompañante ${index + 1}`} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={person.category} disabled={locked}
                      onChange={(e) => setGuestDetails((previous) => previous.map((item, i) => i === index ? { ...item, category: e.target.value as LunchGuest["category"] } : item))}>
                      <option value="adult">Adulto (10 años o más) · {formatLunchPrice(data.prices.adult_price)}</option>
                      <option value="child_4_9">4 a 9 años · {formatLunchPrice(data.prices.child_4_9_price)}</option>
                      <option value="under_4">Menor de 4 años · {formatLunchPrice(data.prices.under_4_price)}</option>
                    </select>
                  </div>)}
                  <p className="text-xs text-muted-foreground">No agregues acá amigos ciclistas: requieren aprobación previa de Claudio y se gestionan por separado.</p>
                </div>
                <div className="rounded-lg border border-accent/30 bg-accent/5 p-4">
                  <div className="text-sm text-muted-foreground">Total a transferir al restaurante · {lunchDinerTotal(counts)} comensales</div>
                  <div className="text-2xl font-bold text-accent">{total == null ? "Revisá las cantidades" : formatPrice(total, "ARS")}</div>
                  <p className="text-xs mt-1">Importe completo de la parrilla, bebidas aparte. No incluye el fondo de $30.000 de amigos ciclistas.</p>
                </div>

                <div className="space-y-3 text-sm rounded-lg border p-4">
                  <h3 className="font-semibold">Condiciones del almuerzo</h3>
                  <p>{LUNCH_POLICY_TEXT}</p>
                  <p className="text-muted-foreground">{LUNCH_POLICY_PENDING}</p>
                  <label className="flex items-start gap-3 cursor-pointer">
                    <Checkbox checked={accepted} onCheckedChange={(value) => setAccepted(value === true)} className="mt-1" />
                    <span>Leí y acepto las condiciones, versión {LUNCH_POLICY_VERSION}.</span>
                  </label>
                </div>
                <Button onClick={submitLunch} disabled={saving || locked} variant="gold" className="w-full">
                  {saving ? "Guardando…" : locked ? "Reserva en revisión por administración" : data.lunch.terms_accepted_at ? "Actualizar nombres y aceptación" : "Confirmar comensales y aceptar condiciones"}
                </Button>

                <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
                  <h3 className="font-semibold">Pago directo al restaurante</h3>
                  <div className="flex items-center justify-between gap-2"><strong className="text-sm">Alias: {RESTAURANT_ALIAS}</strong>
                    <Button type="button" size="sm" variant="outline" onClick={copyAlias}><Copy /> Copiar</Button></div>
                  <p className="text-xs text-muted-foreground">Este alias es solo para la parrilla. No incluyas acá el aporte de $30.000 de amigos ciclistas.</p>
                  <p className="text-sm">{detailsAreSaved ? "Transferí el total de la parrilla al restaurante y enviá tu comprobante al WhatsApp de Scarlett. Nosotros lo compartiremos con el restaurante para verificar tu reserva." : "Primero confirmá los nombres, las categorías y las condiciones. Después podrás transferir el total de la parrilla y enviar el comprobante a Scarlett."}</p>
                  <Button asChild variant="outline" className="w-full" disabled={!detailsAreSaved}><a href={detailsAreSaved ? whatsappUrl : undefined} target="_blank" rel="noreferrer"><MessageCircle /> Enviar comprobante a Scarlett por WhatsApp</a></Button>
                  <p className="text-xs text-muted-foreground"><strong>No pagues en la aplicación.</strong> Reybaud no cobra ni factura este almuerzo. Avisar que transferiste no confirma la reserva: administración debe verificarla con el restaurante.</p>
                </div>
              </>}
            </section>}

            {notice && <p role="status" className="rounded-lg bg-accent/10 text-accent p-3 text-sm">{notice}</p>}
            {error && <p role="alert" className="rounded-lg bg-destructive/10 text-destructive p-3 text-sm">{error}</p>}
          </> : <p role="alert" className="text-destructive">{error || "Enlace no disponible."}</p>}

          <p className="text-center text-xs text-muted-foreground flex items-center justify-center gap-2"><Bike className="w-4 h-4" /> Ciclismo Reybaud</p>
        </CardContent>
      </Card>
    </div>
  );
}
