import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Bike, CalendarDays, CheckCircle2, MapPin, MessageCircle, XCircle, Copy, UtensilsCrossed, ShieldCheck, AlertTriangle } from "lucide-react";
import {
  ADULT_LUNCH_PRICE_ANNOUNCED,
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
import EventRsvpGuests, { type CyclistGuest, type DinnerGuest } from "@/components/events/EventRsvpGuests";

type LunchGuest = DinnerGuest;

type RsvpData = {
  event: { title: string; date: string; location: string };
  name: string | null;
  response: "voy" | "no_voy" | null;
  participation_mode: ParticipationMode | null;
  guests_count: number;
  cyclist_guests: CyclistGuest[];
  non_cyclist_guests: DinnerGuest[];
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
  const linkChoice = params.get("opcion");
  const [choice, setChoice] = useState<"voy" | "no_voy">(linkChoice === "no_voy" ? "no_voy" : "voy");
  // Si la PWA está abierta y se pulsa el otro botón del correo con el mismo
  // token, React conserva el componente: actualizar la elección por la URL.
  useEffect(() => {
    if (linkChoice === "voy" || linkChoice === "no_voy") setChoice(linkChoice);
  }, [linkChoice, token]);
  const [mode, setMode] = useState<ParticipationMode>("fondo_y_almuerzo");
  const [cyclists, setCyclists] = useState<CyclistGuest[]>([]);
  const [nonCyclists, setNonCyclists] = useState<DinnerGuest[]>([]);
  const guests = choice === "voy" && mode !== "solo_fondo"
    ? nonCyclists.length + (mode === "solo_almuerzo" ? 0 : cyclists.filter((person) => person.lunch).length)
    : 0;
  const guestDetails = useMemo<LunchGuest[]>(() => [
    ...nonCyclists.map((person) => ({ name: person.name, category: person.category, is_cyclist: false })),
    ...(mode === "fondo_y_almuerzo"
      ? cyclists.filter((person) => person.lunch).map((person) => ({ name: person.name, category: "adult" as const, is_cyclist: true }))
      : []),
  ], [cyclists, nonCyclists, mode]);
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

  const hydrate = (response: RsvpData, isInitialLoad = false) => {
    setData(response);
    // Un enlace VOY/NO VOY del correo debe respetar la elección inicial incluso
    // si el participante ya respondió anteriormente. Al guardar usamos el estado del servidor.
    const requestedOption = params.get("opcion");
    const hasLinkChoice = requestedOption === "voy" || requestedOption === "no_voy";
    if (response.response && (!isInitialLoad || !hasLinkChoice)) setChoice(response.response);
    if (response.participation_mode) setMode(response.participation_mode);
    setCyclists(Array.isArray(response.cyclist_guests)
      ? response.cyclist_guests.map((person) => ({ ...person, category: "adult" as const }))
      : []);
    setNonCyclists(Array.isArray(response.non_cyclist_guests) ? response.non_cyclist_guests : []);
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
      else hydrate(response as RsvpData, true);
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, [token]);

  const call = async (action: "respond_with_types" | "confirm_lunch_named", extra: Record<string, unknown>) => {
    if (!token) return;
    setSaving(true); setError(""); setNotice("");
    // Los nombres se guardan por RPC segura con el token de invitación.
    // El resto de las respuestas mantiene el canal existente, sin desplegar nuevas Edge Functions.
    let response: RsvpData | { error?: string } | null = null;
    let failure: { message: string } | null = null;
    if (action === "confirm_lunch_named" || action === "respond_with_types") {
      const namedRpc = supabase as unknown as {
        rpc: (name: string, args: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
      };
      const saved = action === "confirm_lunch_named"
        ? await namedRpc.rpc("confirm_event_rsvp_lunch_named", {
            p_token: token, p_guests: extra.guest_details,
          })
        : await namedRpc.rpc("respond_event_rsvp_with_guest_types", {
            p_token: token, p_response: extra.response, p_mode: extra.participation_mode,
            p_cyclists: extra.cyclists, p_non_cyclists: extra.non_cyclists,
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
      setNotice(action === "respond_with_types"
        ? "Respuesta actualizada. Podés volver a editarla desde este mismo enlace."
        : "Datos y aceptación guardados. La reserva queda confirmada sólo cuando administración verifica el pago con el restaurante.");
      setAccepted(false);
    }
    setSaving(false);
  };

  const submitRsvp = () => {
    const riders = choice === "voy" && mode !== "solo_almuerzo"
      ? cyclists.map((person) => ({ name: person.name.trim(), category: "adult", lunch: mode !== "solo_fondo" && person.lunch }))
      : [];
    const diners = choice === "voy" && mode !== "solo_fondo"
      ? nonCyclists.map((person) => ({ name: person.name.trim(), category: person.category }))
      : [];
    if ([...riders, ...diners].some((person) => person.name.length < 2 || person.name.length > 100)) {
      setError("Completá nombre y apellido de cada acompañante."); return;
    }
    call("respond_with_types", {
      response: choice, participation_mode: choice === "voy" ? mode : null,
      cyclists: riders, non_cyclists: diners,
    });
  };

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
    call("confirm_lunch_named", { guest_details: guestDetails.map((person) => ({
      name: person.name.trim(), category: person.category, is_cyclist: person.is_cyclist === true,
    })) });
  };
  const savedDetails = data?.lunch.attendees || [];
  // Postgres serializa las claves jsonb en un orden distinto del objeto JS.
  // Comparar cada campo evita bloquear WhatsApp aunque la aceptación se haya guardado.
  const detailsAreSaved = !!data?.lunch.terms_accepted_at &&
    savedDetails.length === guestDetails.length &&
    savedDetails.every((saved, index) =>
      saved.name === guestDetails[index]?.name.trim() &&
      saved.category === guestDetails[index]?.category &&
      (saved.is_cyclist === true) === (guestDetails[index]?.is_cyclist === true)
    );
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
              <a
                href="https://maps.app.goo.gl/6Bg9nS9BFn4g8hV79"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-accent text-sm font-semibold underline underline-offset-4 hover:opacity-80"
                aria-label="Ver ubicación de La Carreta del Gato en Google Maps (abre en una pestaña nueva)"
              >
                <MapPin className="w-4 h-4" />
                Ver restaurante en Google Maps (nueva pestaña)
              </a>
            </>}
          </div>

          {loading ? <p className="text-muted-foreground">Abriendo tu invitación…</p> : data ? <>
            <div role="note" className="rounded-xl border border-border overflow-hidden">
              <div className="bg-muted/40 px-4 py-3 border-b border-border font-semibold text-sm">Información de la jornada</div>
              <div className="grid sm:grid-cols-2 gap-0">
                <div className="p-4 space-y-1.5 sm:border-r border-b sm:border-b-0 border-border">
                  <div className="flex gap-2 items-center font-semibold text-primary"><Bike className="h-4 w-4" /> Fondo en bicicleta</div>
                  <p className="text-sm"><strong>Gratis</strong> para alumnos activos.</p>
                  <p className="text-xs text-muted-foreground">Amigos ciclistas: $30.000 por persona, sujetos a aprobación de Claudio. 10 cupos disponibles en total.</p>
                </div>
                <div className="p-4 space-y-1.5">
                  <div className="flex gap-2 items-center font-semibold text-accent"><UtensilsCrossed className="h-4 w-4" /> Parrilla</div>
                  <p className="text-sm">Adultos <strong>$40.000</strong> · Niños de 4 a 9 <strong>$20.000</strong></p>
                  <p className="text-xs text-muted-foreground">Menores de 4 sin cargo · Bebidas aparte. Acompañantes no ciclistas sin cupo comercial.</p>
                </div>
              </div>
            </div>
            <p className="text-sm sm:text-base">Hola{data.name ? `, ${data.name}` : ""}! ¿Nos acompañás? Elegí una opción para confirmar tu asistencia.</p>
            <div className="grid grid-cols-2 gap-3">
              <Button type="button" aria-pressed={choice === "voy"} variant={choice === "voy" ? "gold" : "outline"} onClick={() => setChoice("voy")}>
                <CheckCircle2 /> VOY
              </Button>
              <Button type="button" aria-pressed={choice === "no_voy"} variant={choice === "no_voy" ? "secondary" : "outline"}
                className={choice === "no_voy" ? "border-2 border-accent bg-accent/15 text-foreground" : ""}
                onClick={() => setChoice("no_voy")}>
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
              <EventRsvpGuests cyclists={cyclists} setCyclists={setCyclists}
                nonCyclists={nonCyclists} setNonCyclists={setNonCyclists}
                mode={mode} disabled={!!locked} />
            </div>}

            <p className="text-xs text-muted-foreground">Podés modificar tu respuesta más adelante. El almuerzo se reserva cuando se verifica el pago.</p>
            <Button onClick={submitRsvp} disabled={saving} variant="gold" className="w-full">
              {saving ? "Guardando…" : "Confirmar mi respuesta"}
            </Button>

            {choice === "voy" && hasLunchInterest(data.response, data.participation_mode) && <section className="border-t border-border pt-6 space-y-5">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <UtensilsCrossed className="h-5 w-5 text-accent" aria-hidden="true" />
                  <h2 className="text-xl font-bold">Tu reserva de parrilla</h2>
                </div>
                <Badge variant="outline" className="w-fit max-w-full whitespace-normal px-3 py-1.5 text-xs font-medium border-primary/40 text-primary">{LUNCH_STATUS_LABELS[data.lunch.status]}</Badge>
                <p className="text-sm text-muted-foreground">La parrilla se paga directamente al restaurante. Revisá quiénes van a comer y confirmá las condiciones antes de transferir.</p>
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
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm" aria-label="Valores de la parrilla por edad">
                  {[
                    ["Adultos · 10 años o más", data.prices.adult_price],
                    ["Niños · 4 a 9 años", data.prices.child_4_9_price],
                    ["Menores de 4", data.prices.under_4_price],
                  ].map(([label, price]) => (
                    <div key={String(label)} className="rounded-lg border border-border bg-muted/25 px-4 py-3 flex items-center justify-between sm:items-start sm:flex-col gap-1">
                      <span className="text-xs text-muted-foreground">{String(label)}</span>
                      <strong className="text-sm">{formatLunchPrice(price as number | null)}</strong>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">Bebidas aparte. Total de comensales: {guests + 1} (incluyéndote). Los ciclistas que también comen se cuentan una sola vez.</p>
                <div className="space-y-2">
                  <h3 className="font-semibold">¿Quiénes vienen a la parrilla?</h3>
                  <p className="text-xs text-muted-foreground">Los nombres se completan en la sección de acompañantes de arriba.</p>
                  <div className="rounded-lg bg-muted/40 p-3 text-sm">{data.name || "Titular de la invitación"} · Titular adulto</div>
                  {guestDetails.map((person, index) => <div key={index} className="rounded-lg border p-3 text-sm">
                    {person.name || "Falta completar nombre"} · {person.is_cyclist ? "Ciclista invitado pendiente de aprobación" : "No ciclista"} · {person.category === "adult" ? "Adulto" : person.category === "child_4_9" ? "Niño de 4 a 9 años" : "Menor de 4 años"}
                  </div>)}
                </div>
                <div className="rounded-xl border-2 border-accent/40 bg-accent/10 p-4 sm:p-5 space-y-1">
                  <div className="font-semibold text-sm">Total de la parrilla · {lunchDinerTotal(counts)} comensales</div>
                  <div className="text-3xl font-extrabold text-accent tabular-nums">{total == null ? "Revisá las cantidades" : formatPrice(total, "ARS")}</div>
                  <p className="text-xs text-muted-foreground">Bebidas aparte. Este total NO incluye los $30.000 del fondo por cada amigo ciclista aprobado.</p>
                </div>

                <div className="rounded-xl border border-border overflow-hidden">
                  <div className="bg-muted/30 px-4 py-3 flex gap-2 items-center border-b border-border">
                    <ShieldCheck className="h-5 w-5 text-primary" />
                    <h3 className="font-semibold">Condiciones de reserva</h3>
                  </div>
                  <div className="p-4 space-y-3 text-sm">
                    <div className="space-y-1">
                      <p className="font-semibold">Si avisás hasta el 24/11 inclusive</p>
                      <p className="text-muted-foreground">El importe abonado queda como crédito para comer en La Carreta del Gato en otra ocasión.</p>
                    </div>
                    <div className="border-t border-border pt-3 space-y-1">
                      <p className="font-semibold">Si no asistís y no avisás</p>
                      <p className="text-muted-foreground">Se pierde el 100% del importe abonado.</p>
                    </div>
                    <div className="border-t border-border pt-3 flex gap-2 items-start">
                      <AlertTriangle className="h-4 w-4 shrink-0 text-accent mt-0.5" />
                      <p className="text-muted-foreground">Cancelaciones avisadas del 25 al 28/11, o el mismo día: las condiciones están pendientes de definición. No se consideran automáticamente una ausencia sin aviso.</p>
                    </div>
                    <p className="text-xs text-muted-foreground">El crédito lo administra el restaurante, no Reybaud.</p>
                    <label className="flex items-start gap-3 rounded-lg bg-primary/5 border border-primary/20 p-3 cursor-pointer">
                      <Checkbox checked={accepted} onCheckedChange={(value) => setAccepted(value === true)} className="mt-0.5 shrink-0" />
                      <span className="font-medium">Leí y acepto las condiciones del almuerzo.</span>
                    </label>
                  </div>
                </div>
                <Button onClick={submitLunch} disabled={saving || locked} variant="gold" className="w-full">
                  {saving ? "Guardando…" : locked ? "Reserva en revisión por administración" : data.lunch.terms_accepted_at ? "Actualizar nombres y aceptación" : "Confirmar comensales y aceptar condiciones"}
                </Button>

                <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
                  <h3 className="font-semibold">Pago directo al restaurante</h3>
                  <div className="flex items-center justify-between gap-2"><strong className="text-sm">Alias: {RESTAURANT_ALIAS}</strong>
                    <Button type="button" size="sm" variant="outline" onClick={copyAlias}><Copy /> Copiar</Button></div>
                  <p className="text-xs text-muted-foreground">Este alias es solo para la parrilla. No incluyas acá el aporte de $30.000 de amigos ciclistas.</p>
                  <p className="text-sm">{detailsAreSaved ? "Transferí el total de la parrilla y enviá el comprobante al WhatsApp de Scarlett. Nosotros lo compartiremos con el restaurante." : "Primero confirmá los nombres de los comensales y aceptá las condiciones. Después vas a poder enviar tu comprobante a Scarlett."}</p>
                  {detailsAreSaved
                    ? <Button asChild variant="outline" className="w-full"><a href={whatsappUrl} target="_blank" rel="noopener noreferrer"><MessageCircle /> Enviar comprobante a Scarlett por WhatsApp</a></Button>
                    : <Button type="button" variant="outline" className="w-full" disabled><MessageCircle /> Enviar comprobante (después de confirmar)</Button>}
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
