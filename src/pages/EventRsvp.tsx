import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Bike, CalendarDays, CheckCircle2, MapPin, XCircle, UtensilsCrossed } from "lucide-react";
import {
  PARTICIPATION_LABELS,
  normalizeGuestWhatsApp,
  lunchAmount,
  lunchDinerTotal,
  type LunchCounts,
  type LunchPrices,
  type ParticipationMode,
} from "@/lib/eventRsvp";
import { formatPrice } from "@/lib/currency";
import EventRsvpGuests, { type CyclistGuest, type DinnerGuest } from "@/components/events/EventRsvpGuests";

type LunchGuest = DinnerGuest;

type RsvpData = {
  event: { title: string; date: string; location: string };
  name: string | null;
  identity: {
    linked: boolean;
    first_name: string;
    last_name: string;
    full_name: string;
    email: string;
    whatsapp: string;
  };
  response: "voy" | "no_voy" | null;
  participation_mode: ParticipationMode | null;
  guests_count: number;
  cyclist_guests: CyclistGuest[];
  non_cyclist_guests: DinnerGuest[];
  lunch: LunchCounts & { status: string; terms_version: string | null; terms_accepted_at: string | null; attendees: LunchGuest[] };
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
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
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
  const [loading, setLoading] = useState(true);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  // Pantalla de éxito: se muestra cuando el servidor devuelve una respuesta guardada
  // y el usuario no pidió explícitamente modificarla.
  const [editing, setEditing] = useState(false);
  const [emailStatus, setEmailStatus] = useState<"sent" | "unconfirmed" | null>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const showSuccess = !!data?.response && !editing;
  useEffect(() => {
    if (showSuccess) {
      topRef.current?.scrollIntoView?.({ block: "start" });
      topRef.current?.focus?.();
    }
  }, [showSuccess]);

  const hydrate = (response: RsvpData, isInitialLoad = false) => {
    setData(response);
    if (response.identity) {
      setFirstName(response.identity.first_name || "");
      setLastName(response.identity.last_name || "");
      setWhatsapp(response.identity.whatsapp || "");
    }
    // Un enlace VOY/NO VOY del correo debe respetar la elección inicial incluso
    // si el participante ya respondió anteriormente. Al guardar usamos el estado del servidor.
    const requestedOption = params.get("opcion");
    const hasLinkChoice = requestedOption === "voy" || requestedOption === "no_voy";
    if (response.response || !isInitialLoad || !hasLinkChoice) { if (response.response) setChoice(response.response); }
    if (response.participation_mode) setMode(response.participation_mode);
    setCyclists(Array.isArray(response.cyclist_guests)
      ? response.cyclist_guests.map((person) => ({ ...person, category: "adult" as const, whatsapp: person.whatsapp || "" }))
      : []);
    setNonCyclists(Array.isArray(response.non_cyclist_guests) ? response.non_cyclist_guests : []);
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError("");
      if (!token) { setError("Enlace inválido."); setLoading(false); return; }
      let response: RsvpData | null = null;
      let lastError = "";
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const result = await supabase.functions.invoke("event-rsvp", { body: { action: "status", token } });
          if (!result.error && result.data && !result.data.error) {
            response = result.data as RsvpData;
            break;
          }
          lastError = result.data?.error || result.error?.message || "El enlace no respondió.";
          // Los enlaces vencidos o inválidos no deberían recibir reintentos.
          if (result.data?.error) break;
        } catch (err) {
          lastError = err instanceof Error ? err.message : "Problema de conexión.";
        }
      }
      if (!mounted) return;
      if (response) hydrate(response, true);
      else setError(lastError || "No pudimos abrir tu encuesta. Intentá nuevamente.");
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, [token, reloadNonce]);

  const call = async (action: "respond_with_types", extra: Record<string, unknown>) => {
    if (!token) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const saved = await supabase.functions.invoke("event-rsvp", {
        body: {
          action, token,
          response: extra.response,
          participation_mode: extra.participation_mode,
          cyclists: extra.cyclists,
          non_cyclists: extra.non_cyclists,
          identity: { first_name: firstName, last_name: lastName, whatsapp: normalizeGuestWhatsApp(whatsapp) || "" },
        },
      });
      if (saved.error || saved.data?.error || !saved.data) {
        throw new Error(saved.data?.error || saved.error?.message || "No pudimos comprobar la respuesta guardada.");
      }
      const persisted = saved.data as RsvpData;
      const expectedMode = extra.response === "voy" ? extra.participation_mode : null;
      if (persisted.response !== extra.response || (expectedMode && persisted.participation_mode !== expectedMode)) {
        throw new Error("No pudimos comprobar que tu respuesta quedó guardada. Intentá nuevamente.");
      }
      hydrate(persisted);
      setEmailStatus(extra.response === "voy" ? (saved.data.notification?.participant === "sent" ? "sent" : "unconfirmed") : null);
      setEditing(false);
      const cyclistRequests = Array.isArray(extra.cyclists) ? extra.cyclists.length : 0;
      if (extra.response === "no_voy") {
        setNotice("Gracias por responder. Registramos que no vas a asistir. No se generó ningún cobro.");
      } else if (saved.data.notification?.participant !== "sent") {
        setNotice("Tu respuesta quedó registrada y ya está visible en gestión, pero no pudimos confirmar el envío del correo.");
      } else if (cyclistRequests && saved.data.notification?.claudio !== "sent") {
        setNotice("Tu asistencia y el correo quedaron registrados. El aviso a Claudio quedó pendiente; los ciclistas no quedaron inscriptos.");
      } else {
        setNotice(cyclistRequests
          ? "¡Tu asistencia quedó registrada! Enviamos tu correo y la solicitud a Claudio. Los ciclistas siguen pendientes de aprobación."
          : "¡Tu asistencia quedó registrada! Te enviamos el correo correspondiente.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos confirmar tu respuesta. Intentá nuevamente.");
    } finally {
      setSaving(false);
    }
  };

  const submitRsvp = () => {
    if (!data?.identity?.linked && (firstName.trim().length < 2 || lastName.trim().length < 2)) {
      setError("Completá tu nombre y apellido para registrar la respuesta."); return;
    }
    if (!data?.identity?.linked && !normalizeGuestWhatsApp(whatsapp)) {
      setError("Ingresá tu WhatsApp con código de país (por ejemplo, +54 9 11 1234-5678)."); return;
    }
    const riders = choice === "voy" && mode !== "solo_almuerzo"
      ? cyclists.map((person) => ({
          name: person.name.trim(),
          category: "adult",
          lunch: mode !== "solo_fondo" && person.lunch,
          whatsapp: normalizeGuestWhatsApp(person.whatsapp) || "",
        }))
      : [];
    const diners = choice === "voy" && mode !== "solo_fondo"
      ? nonCyclists.map((person) => ({ name: person.name.trim(), category: person.category }))
      : [];
    if ([...riders, ...diners].some((person) => person.name.length < 2 || person.name.length > 100)) {
      setError("Completá nombre y apellido de cada acompañante."); return;
    }
    if (riders.some((person) => !/\S+\s+\S+/.test(person.name))) {
      setError("Ingresá nombre y apellido completos de cada ciclista invitado."); return;
    }
    if (riders.some((person) => !person.whatsapp)) {
      setError("Ingresá el WhatsApp de cada ciclista invitado con código de país (por ejemplo, +54 9 11 1234-5678)."); return;
    }
    call("respond_with_types", {
      response: choice, participation_mode: choice === "voy" ? mode : null,
      cyclists: riders, non_cyclists: diners,
    });
  };

  const total = useMemo(() => data ? lunchAmount(counts, data.prices) : null, [counts, data]);
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

          {loading ? <p className="text-muted-foreground">Abriendo tu invitación…</p> : data && showSuccess ? (
            <RsvpSuccess data={data} emailStatus={emailStatus} topRef={topRef}
              onEdit={() => { setNotice(""); setError(""); setEmailStatus(null); hydrate(data); setEditing(true); }} />
          ) : data ? <>
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
            <section className="rounded-xl border border-border bg-muted/20 p-4 space-y-3" aria-label="Tus datos">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-semibold text-sm">Tus datos</h2>
                <span className="text-xs text-muted-foreground">{data.identity?.linked ? "Alumno vinculado a esta invitación" : "Visitante · completá tus datos"}</span>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label htmlFor="rsvp-first-name">Nombre</Label><Input id="rsvp-first-name" autoComplete="given-name" maxLength={70} required readOnly={!!data.identity?.linked} value={firstName} onChange={(event) => setFirstName(event.target.value)} /></div>
                <div className="space-y-1.5"><Label htmlFor="rsvp-last-name">Apellido</Label><Input id="rsvp-last-name" autoComplete="family-name" maxLength={70} required readOnly={!!data.identity?.linked} value={lastName} onChange={(event) => setLastName(event.target.value)} /></div>
              </div>
              <div className="space-y-1.5"><Label htmlFor="rsvp-email">Email de esta invitación</Label><Input id="rsvp-email" type="email" readOnly value={data.identity?.email || ""} /></div>
              {!data.identity?.linked && <div className="space-y-1.5">
                <Label htmlFor="rsvp-whatsapp">WhatsApp</Label>
                <Input id="rsvp-whatsapp" type="tel" inputMode="tel" autoComplete="tel" required maxLength={24} placeholder="+54 9 11 1234-5678" value={whatsapp} onChange={(event) => setWhatsapp(event.target.value)} />
                <p className="text-xs text-muted-foreground">Obligatorio para visitantes. Estos datos se guardan únicamente en tu invitación.</p>
              </div>}
              {data.identity?.linked && <p className="text-xs text-muted-foreground">Nombre, apellido y email se conservan desde la invitación vinculada; no se pueden reemplazar desde este formulario.</p>}
            </section>
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

            <p className="text-xs text-muted-foreground">Solo estamos confirmando tu asistencia y la cantidad de acompañantes. Si corresponde un pago, recibirás sus instrucciones por correo separado.</p>
            <Button onClick={submitRsvp} disabled={saving} variant="gold" className="w-full">
              {saving ? "Guardando…" : "Confirmar mi respuesta"}
            </Button>

            {choice === "voy" && mode !== "solo_fondo" && <section className="rounded-xl border border-accent/30 bg-accent/5 p-4 sm:p-5 space-y-3" aria-label="Resumen de personas para la parrilla">
              <div className="flex items-center gap-2 font-semibold"><UtensilsCrossed className="h-5 w-5 text-accent" /> Personas para la parrilla</div>
              <p className="text-sm text-muted-foreground">Comprobá los datos de arriba antes de confirmar tu respuesta.</p>
              <div className="text-sm grid grid-cols-3 gap-2">
                <div className="rounded-lg bg-card p-3"><div className="text-muted-foreground text-xs">Adultos</div><strong>{counts.adults_count}</strong></div>
                <div className="rounded-lg bg-card p-3"><div className="text-muted-foreground text-xs">Niños (4–9)</div><strong>{counts.children_4_9_count}</strong></div>
                <div className="rounded-lg bg-card p-3"><div className="text-muted-foreground text-xs">Menores de 4</div><strong>{counts.under_4_count}</strong></div>
              </div>
              <p className="font-semibold text-sm">Total: {lunchDinerTotal(counts)} {lunchDinerTotal(counts) === 1 ? "comensal" : "comensales"}, incluyéndote.</p>
              {total !== null && <p className="text-sm text-muted-foreground">Valor estimado de la parrilla: {formatPrice(total, "ARS")} (bebidas aparte).</p>}
              <p className="text-xs text-muted-foreground">No tenés que transferir ahora. El correo de pago llegará por separado después de confirmar tu asistencia.</p>
            </section>}

            {notice && <p role="status" className="rounded-lg bg-accent/10 text-accent p-3 text-sm">{notice}</p>}
            {error && <p role="alert" className="rounded-lg bg-destructive/10 text-destructive p-3 text-sm">{error}</p>}
          </> : <div className="space-y-3">
            <p role="alert" className="text-destructive">{error || "Enlace no disponible."}</p>
            <Button type="button" variant="outline" onClick={() => setReloadNonce((value) => value + 1)}>
              Reintentar abrir mi encuesta
            </Button>
          </div>}

          <p className="text-center text-xs text-muted-foreground flex items-center justify-center gap-2"><Bike className="w-4 h-4" /> Ciclismo Reybaud</p>
        </CardContent>
      </Card>
    </div>
  );
}

function RsvpSuccess({ data, emailStatus, topRef, onEdit }: {
  data: RsvpData;
  emailStatus: "sent" | "unconfirmed" | null;
  topRef: React.RefObject<HTMLDivElement>;
  onEdit: () => void;
}) {
  const going = data.response === "voy";
  const mode = data.participation_mode;
  const cyclists = going && mode !== "solo_almuerzo" ? data.cyclist_guests || [] : [];
  const diners = going && mode !== "solo_fondo" ? data.non_cyclist_guests || [] : [];
  const lunch = going && mode !== "solo_fondo";
  const name = data.identity?.full_name || data.name || [data.identity?.first_name, data.identity?.last_name].filter(Boolean).join(" ");
  const closeWindow = () => { window.close(); };
  return (
    <div ref={topRef} tabIndex={-1} role="status" aria-live="polite" className="space-y-5 text-center outline-none" data-testid="rsvp-success">
      <CheckCircle2 aria-hidden className="mx-auto h-20 w-20 text-success" />
      <h2 className="font-heading text-2xl sm:text-3xl font-bold">
        {going ? "¡Tu asistencia está confirmada!" : "Registramos que no vas a asistir"}
      </h2>
      <dl className="text-left rounded-xl border border-border bg-muted/20 p-4 space-y-2 text-sm">
        {name && <div><dt className="inline text-muted-foreground">Nombre: </dt><dd className="inline font-semibold">{name}</dd></div>}
        <div><dt className="inline text-muted-foreground">Fecha: </dt><dd className="inline">{eventDate(data.event.date)}</dd></div>
        <div><dt className="inline text-muted-foreground">Lugar: </dt><dd className="inline">La Carreta del Gato</dd></div>
        <div><dt className="inline text-muted-foreground">Respuesta: </dt><dd className="inline font-semibold">{going ? (mode ? PARTICIPATION_LABELS[mode] : "Voy") : "No voy"}</dd></div>
        {diners.length > 0 && <div><dt className="inline text-muted-foreground">Acompañantes que no pedalean (almuerzo): </dt><dd className="inline">{diners.length}</dd></div>}
      </dl>
      {cyclists.length > 0 && <p className="text-left rounded-lg border border-primary/40 bg-primary/10 p-3 text-sm">
        <strong>{cyclists.length === 1 ? "Tu amigo ciclista está pendiente" : `Tus ${cyclists.length} amigos ciclistas están pendientes`} de aprobación de Claudio.</strong> Todavía no {cyclists.length === 1 ? "está confirmado" : "están confirmados"}.
      </p>}
      {lunch && <p className="text-left text-sm text-muted-foreground">Las instrucciones de pago de la parrilla llegan por correo separado.</p>}
      {going && emailStatus === "sent" && <p className="text-sm text-muted-foreground">Te enviamos el correo de confirmación.</p>}
      {going && emailStatus === "unconfirmed" && <p className="text-left rounded-lg bg-accent/10 p-3 text-sm">Tu asistencia quedó confirmada, pero no pudimos confirmar el envío del correo. Si no te llega, escribinos.</p>}
      <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
        <Button type="button" variant="outline" onClick={onEdit}>Modificar mi respuesta</Button>
        {typeof window !== "undefined" && window.opener ? (
          <Button type="button" variant="ghost" onClick={closeWindow}>Cerrar</Button>
        ) : (
          <Button asChild variant="ghost"><Link to="/">Volver al inicio</Link></Button>
        )}
      </div>
    </div>
  );
}
