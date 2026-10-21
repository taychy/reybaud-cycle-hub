import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { chooseBookingPackage, type BookingRequestPackage } from "@/lib/eventBookingRequest";
import EventBookingRequestDialog from "./EventBookingRequestDialog";
import EventReglamentoSection from "./EventReglamentoSection";
import { ArrowLeft, Bike, CalendarDays, Check, Flag, Hotel, MapPin, MessageCircle, Mountain, Route, X } from "lucide-react";
import { formatPrice } from "@/lib/currency";
import { buildWhatsAppUrl } from "@/lib/contactInfo";
import heroFallback from "@/assets/maratona-hero.jpg";
import { canOpenNativeBooking, type BookingOpening } from '@/lib/eventBookingOpening';

/**
 * Landing editorial exclusiva para eventos con `premium_landing.layout_variant === "editorial_maratona"`.
 * Solo lee datos públicos aprobados (precios finales y alquiler); nunca muestra `metadata.budget`.
 * La foto de portada es reemplazable vía `premium_landing.hero_image`.
 * La foto secundaria (`secondary_image`) se muestra con su crédito y licencia enlazados debajo.
 */
interface Props {
  title: string;
  eventId: string;
  contact?: {name:string;email:string;phone:string};
  metadata: any;
  onBack: () => void;
  onNativeReserve?: (packageId:string) => void;
}

const DAYS = [
  { date: "Mié 30/6", title: "Llegada a las Dolomitas", body: "Recepción en el aeropuerto de Venecia a las 12 h y traslado a Corvara. Check-in en el Hotel La Tambra y entrega de bicicletas." },
  { date: "Jue 1/7", title: "Sellaronda", body: "La vuelta clásica alrededor del macizo del Sella: Campolongo, Pordoi, Sella y Gardena." },
  { date: "Vie 2/7", title: "Campolongo y Falzarego", body: "Reconocimiento de puertos del recorrido y retiro del kit de carrera en Badia." },
  { date: "Sáb 3/7", title: "Descanso y preparación", body: "Día liviano para soltar piernas, revisar bicicletas y planificar la largada." },
  { date: "Dom 4/7", title: "Maratona dles Dolomites", body: "Día de carrera. Al llegar, hospitality con hidratación y pizza para celebrar con el grupo.", race: true },
  { date: "Lun 5/7", title: "Regreso", body: "Transfer al aeropuerto de Venecia para vuelos posteriores a las 15 h." },
];

const INCLUDED = [
  "Bicicleta Cannondale SuperSix EVO / Scott Addict, Shimano 105 electrónico (modelo y talle según disponibilidad)",
  "Plan de entrenamiento previo incluido",
  "5 noches en hotel 3* superior en Corvara",
  "Desayunos, almuerzos y cenas",
  "Transfers desde y hacia el aeropuerto de Venecia",
  "Asistencia en van con hidratación",
  "Asistencia mecánica",
  "Claudio Reybaud acompañando al grupo",
  "Retiro del kit de carrera",
  "Inscripción a la Maratona",
  "Hospitality en la llegada de la carrera",
];
const NOT_INCLUDED = ["Pasajes aéreos", "Seguro de viaje", "Gastos personales"];

const FAQ = [
  ["¿La bicicleta está incluida?", "Sí. Cannondale SuperSix EVO / Scott Addict, Shimano 105 electrónico, modelo y talle según disponibilidad. Si llevás tu bicicleta: Solo Maratona €3.100 (−€400); para participantes de La Conquista Alpina €2.800 (−€200). La tarifa €3.000 con bicicleta requiere alquilar en ambos viajes, previa validación."],
  ["¿Puedo hacer ambas experiencias?", "Sí. En habitación doble: La Conquista Alpina €3.890 + Maratona €3.000 con bicicleta = €6.890; con bicicleta propia en la Maratona, su precio baja a €2.800 y el subtotal combinado a €6.690. Es el subtotal de los dos programas, NO el costo total del período. Del 21/6 al 5/7 son 15 días calendario, con 7 noches de La Conquista Alpina y 5 de Maratona. Las 2 noches y el traslado intermedio del 28 al 30/6 están pendientes de cotización y NO incluidos. Esta solicitud solo corresponde a Maratona; La Conquista Alpina se reserva por separado."],
  ["¿Qué días tengo que volar?", "Llegada a Venecia el 30 de junio antes de las 12 h, regreso el 5 de julio en vuelos posteriores a las 15 h. Consultanos antes de comprar pasajes."],
  ["¿Cómo es la habitación?", "El alojamiento es en habitación doble. No hay habitaciones individuales disponibles por alta demanda hotelera."],
  ["¿Tengo que prepararme?", "Sí, es una prueba de montaña exigente. El programa incluye reconocimiento de puertos y acompañamiento en destino; el plan de entrenamiento previo está incluido. Escribinos y te explicamos."],
  ["¿Ya puedo reservar?", "Sí, podés iniciar tu reserva con el botón Reservar. Se registra una solicitud pendiente: la confirmación de la plaza depende de disponibilidad, validación administrativa y condiciones de pago. No se cobra seña ni se confirma plaza al enviar."],
];

export default function MaratonaEditorialLanding({ title, metadata, onBack, eventId, contact, onNativeReserve }: Props) {
  const pl = metadata?.premium_landing || {};
  const [packages, setPackages] = useState<BookingRequestPackage[]>([]);
  const [ownBike, setOwnBike] = useState(false);
  const [selected, setSelected] = useState<BookingRequestPackage|null>(null);
  const [loadError, setLoadError] = useState('');
  const [opening,setOpening]=useState<BookingOpening|null>(null);
  useEffect(()=>{let active=true;setOpening(null);void supabase.rpc('event_booking_opening_status',{p_event_id:eventId}).then(({data,error})=>{if(active&&!error)setOpening(data as unknown as BookingOpening)});return()=>{active=false};},[eventId]);
  const nativeOpen=canOpenNativeBooking(opening)&&!!onNativeReserve;
  useEffect(()=>{let active=true;void supabase.rpc('event_booking_request_options',{p_event_id:eventId}).then(({data,error})=>{if(!active)return;if(error){setLoadError('No se pudieron cargar las modalidades. Reintentá más tarde.');return;}setPackages((data as unknown as {packages?:BookingRequestPackage[]})?.packages??[]);});return()=>{active=false};},[eventId]);
  const solo = chooseBookingPackage(packages,false,!ownBike);
  const combo = chooseBookingPackage(packages,true,!ownBike);
  const alpsDoublePrice = Number(metadata?.linked_alps?.double_room_alps_eur);
  const combinedPrice = combo && Number.isFinite(alpsDoublePrice) && alpsDoublePrice > 0
    ? alpsDoublePrice + Number(combo.price)
    : null;
  const wa = buildWhatsAppUrl(pl.whatsapp?.message || "Hola, quiero consultar por Maratona dles Dolomites 2027.", pl.whatsapp?.number);
  const reserve = (p?:BookingRequestPackage) => {if(p){if(nativeOpen)onNativeReserve?.(p.id);else setSelected(p);}else document.getElementById('precio')?.scrollIntoView({behavior:'smooth'});};

  // La foto secundaria es un paisaje real del Passo Pordoi (no la Maratona en curso).
  // El crédito de licencia solo se muestra si existe secondary_image: con el fallback
  // local la atribución no correspondería a la foto mostrada.
  const txt = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const secondary = txt(pl.secondary_image);
  const secondaryCredit = txt(pl.secondary_image_credit);
  const secondaryCreditUrl = txt(pl.secondary_image_credit_url);
  const secondaryLicenseUrl = txt(pl.secondary_image_license_url);
  // "Foto: Dmitry Djouce · CC BY 4.0" → autor/archivo + licencia, cada uno con su enlace.
  const creditParts = secondaryCredit ? secondaryCredit.split("·").map((s) => s.trim()).filter(Boolean) : [];
  const creditAuthor = creditParts[0] || secondaryCredit || "Ver foto original";
  const creditLicense = creditParts[1] || "Licencia";

  const Cta = ({ label = nativeOpen ? "Reservar" : "Solicitar reserva", className = "" }: { label?: string; className?: string }) => (
    <Button onClick={()=>reserve()} className={"min-h-12 px-6 font-heading font-bold uppercase " + className}>{label}</Button>
  );
  const h2 = "font-heading text-3xl font-black uppercase leading-none tracking-normal sm:text-5xl";
  const eyebrow = "font-heading text-xs font-semibold uppercase tracking-[0.2em] text-primary";

  return (
    <div className="alpine-event min-h-screen bg-background text-foreground">
      <header className="relative isolate flex min-h-[92svh] items-end overflow-hidden px-4 pb-10 pt-32">
        <img src={pl.hero_image || heroFallback} alt="Ciclistas subiendo un puerto de las Dolomitas" width={1920} height={1088} loading="eager" decoding="async" className="absolute inset-0 -z-10 h-full w-full object-cover object-[60%_center]" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-background/50 via-background/30 to-background" />
        <Button variant="ghost" type="button" onClick={onBack} aria-label="Volver" className="absolute left-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-background/50 backdrop-blur focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <p className="absolute right-4 top-6 font-heading text-xs uppercase tracking-[0.25em] text-foreground/80">Ciclismo Reybaud</p>
        <div className="mx-auto w-full max-w-5xl animate-fade-in">
          <p className={eyebrow}>Corvara · Alta Badia · Italia</p>
          <h1 className="mt-3 max-w-4xl font-heading text-5xl sm:text-7xl lg:text-8xl font-black uppercase leading-[.9] tracking-normal">{title}</h1>
          <p className="mt-5 max-w-xl text-lg text-foreground/90 sm:text-2xl">El desafío tiene una fecha. La preparación empieza antes.</p>
          <div className="mt-7 flex flex-wrap gap-x-6 gap-y-2 text-sm text-foreground/90 sm:text-base">
            <span className="flex items-center gap-2"><CalendarDays className="h-5 w-5 text-primary" aria-hidden="true" />30 de junio — 5 de julio de 2027</span>
            <span className="flex items-center gap-2"><Flag className="h-5 w-5 text-primary" aria-hidden="true" />Carrera: domingo 4 de julio</span>
          </div>
          <Cta className="mt-8 w-full sm:w-auto" />
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-20 px-4 pb-28">
        <section className="grid gap-6 pt-6 md:grid-cols-[1fr_1.4fr] md:items-end">
          <p className={eyebrow + " md:col-span-2"}>La experiencia</p>
          <h2 className={h2}>No es solo llegar a la largada.<br /><span className="text-primary">Es llegar preparado.</span></h2>
          <p className="text-base leading-relaxed text-foreground/80 sm:text-lg">
            La Maratona dles Dolomites es una de las grandes pruebas de ciclismo de montaña del mundo. La vivimos en grupo:
            reconocemos los puertos antes de la carrera, planificamos cada día y te acompañamos con asistencia en ruta,
            mecánica y una comunidad que pedalea con vos. Vos te ocupás de disfrutar los pasos míticos; del resto, nos ocupamos nosotros.
          </p>
        </section>

        <section aria-label="Resumen" className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[[CalendarDays, "6 días", "5 noches"], [Flag, "4 de julio", "Día de carrera"], [MapPin, "Corvara", "Base en Alta Badia"], [Hotel, "3* superior", "Media pensión + almuerzos"]].map(([Icon, v, l]: any) => (
            <div key={v} className="rounded-lg border border-border bg-card p-5">
              <Icon className="mb-3 h-6 w-6 text-primary" aria-hidden="true" />
              <p className="font-heading text-2xl font-black uppercase leading-none sm:text-3xl">{v}</p>
              <p className="mt-1.5 text-xs uppercase tracking-[.14em] text-muted-foreground">{l}</p>
            </div>
          ))}
        </section>

        <section id="programa" className="scroll-mt-6 space-y-8">
          <div><p className={eyebrow}>Programa</p><h2 className={h2 + " mt-2"}>El camino hasta la largada</h2></div>
          <ol className="grid gap-4 md:grid-cols-2">
            {DAYS.map((d, i) => (
              <li key={d.date} className={"rounded-lg border p-5 sm:p-6 " + (d.race ? "border-primary bg-primary/10 md:col-span-2" : "border-border bg-card")}>
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary font-heading text-sm font-bold text-primary-foreground">{i + 1}</span>
                  <span className="font-heading text-sm uppercase tracking-wider text-muted-foreground">{d.date}</span>
                  {d.race && <span className="ml-auto rounded-full bg-primary px-3 py-1 font-heading text-[11px] font-bold uppercase tracking-wider text-primary-foreground">Carrera</span>}
                </div>
                <h3 className="mt-3 font-heading text-xl font-bold uppercase leading-tight">{d.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-foreground/80 sm:text-base">{d.body}</p>
              </li>
            ))}
          </ol>
          <p className="text-xs text-muted-foreground">Programa sujeto a ajustes operativos del proveedor y del organizador de la carrera.</p>
        </section>

        <figure className="overflow-hidden rounded-lg border border-border">
          <div className="relative">
            <img src={secondary || heroFallback} alt={secondary ? "Passo Pordoi, puerto de montaña real de las Dolomitas: fotografía de paisaje, no la carrera en curso" : "Vista de las Dolomitas"} loading="lazy" width={1920} height={1088} className="h-64 w-full object-cover object-[30%_center] sm:h-96" />
            <div className="absolute inset-0 flex items-end bg-gradient-to-t from-background/80 to-transparent p-6 sm:p-10">
              <p className="max-w-lg font-heading text-2xl font-bold uppercase leading-tight sm:text-4xl">Campolongo, Pordoi, Sella, Gardena, Falzarego.</p>
            </div>
          </div>
          {secondary && (
            <figcaption className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-card px-4 py-3 text-xs leading-relaxed text-foreground/80 sm:text-sm">
              <span className="flex flex-wrap items-center gap-x-1.5">
                {secondaryCreditUrl ? (
                  <a href={secondaryCreditUrl} target="_blank" rel="noopener noreferrer" className="underline decoration-primary/70 underline-offset-2 transition-colors hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">{creditAuthor}</a>
                ) : (
                  <span>{creditAuthor}</span>
                )}
                {secondaryLicenseUrl && (
                  <>
                    <span aria-hidden="true" className="text-muted-foreground">·</span>
                    <a href={secondaryLicenseUrl} target="_blank" rel="noopener noreferrer" className="underline decoration-primary/70 underline-offset-2 transition-colors hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">{creditLicense}</a>
                  </>
                )}
              </span>
              <span className="text-muted-foreground">Paisaje real del Passo Pordoi; no muestra la carrera en curso.</span>
            </figcaption>
          )}
        </figure>

        <section id="incluye" className="space-y-8">
          <div><p className={eyebrow}>Servicios</p><h2 className={h2 + " mt-2"}>Todo lo que necesitás, organizado</h2></div>
          <div className="grid gap-6 md:grid-cols-[1.5fr_1fr]">
            <ul className="space-y-3 rounded-lg border border-border bg-card p-6">
              {INCLUDED.map((t) => <li key={t} className="flex gap-3 text-sm sm:text-base"><Check className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />{t}</li>)}
            </ul>
            <div className="rounded-lg border border-border p-6">
              <p className="font-heading text-sm font-bold uppercase tracking-wider text-foreground/80">No incluye</p>
              <ul className="mt-4 space-y-3">
                {NOT_INCLUDED.map((t) => <li key={t} className="flex gap-3 text-sm text-muted-foreground"><X className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{t}</li>)}
              </ul>
            </div>
          </div>
        </section>

        <section id="precio" className="scroll-mt-6 space-y-8">
          <div><p className={eyebrow}>Tarifas</p><h2 className={h2 + " mt-2"}>Elegí cómo vivirla</h2></div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Bicicleta para Maratona">
            <Button variant={!ownBike?'default':'outline'} aria-pressed={!ownBike} onClick={()=>setOwnBike(false)}><Bike className="mr-2 h-4 w-4"/>Bicicleta incluida</Button>
            <Button variant={ownBike?'default':'outline'} aria-pressed={ownBike} onClick={()=>setOwnBike(true)}>Llevo mi bicicleta</Button>
          </div>
          {loadError&&<p role="alert" className="text-destructive">{loadError}</p>}
          <div className="grid gap-4 md:grid-cols-2">
            {[solo,combo].map((p,i)=><article key={i} className={"flex flex-col rounded-lg border p-6 sm:p-8 "+(i?'border-primary bg-primary/10':'border-border bg-card')}>
              {i?<Route className="h-7 w-7 text-primary"/>:<Mountain className="h-7 w-7 text-primary"/>}
              <h3 className="mt-4 font-heading text-xl font-bold uppercase">{i?'Maratona para participantes de La Conquista Alpina':'Solo Maratona dles Dolomites'}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{i?'Tarifa especial para participantes de La Conquista Alpina, sujeta a verificación. Precio solo del tramo Maratona.':'Una experiencia completa alrededor de la carrera.'}</p>
              <p className="mt-6 font-heading text-5xl font-black text-primary">{p?formatPrice(p.price,p.currency):'Consultando…'}</p>
              <p className="mt-2 text-sm text-muted-foreground">Por persona · habitación doble · {ownBike?'bicicleta propia':'bicicleta incluida'}</p>
              {i&&!ownBike&&<p className="mt-3 text-sm">Alquiler Maratona valorizado en €200 tras bonificación del 50% por alquilar en ambos viajes; sujeto a validación.</p>}
              <Button className="mt-6 w-full" disabled={!p} onClick={()=>reserve(p)}>{nativeOpen?'Reservar':'Solicitar reserva'} {i?'Maratona · La Conquista Alpina':'Solo Maratona'}</Button>
            </article>)}
          </div>
          <p className="border-l-2 border-primary pl-3 text-sm">Seña prevista: EUR 500 + ocho cuotas mensuales, del 21 de octubre de 2026 al 21 de mayo de 2027. {nativeOpen?'La plaza se confirma con la seña acreditada y validada.':'Reservas formales aún cerradas: podés enviar una solicitud, sin cobro ni plaza garantizada.'}</p>
          <p className="text-sm text-muted-foreground">Mismos servicios y entrenamiento previo incluidos. Cannondale SuperSix EVO / Scott Addict, Shimano 105 electrónico; modelo y talle según disponibilidad.</p>
          <article className="rounded-lg border border-primary bg-card p-6 sm:p-8">
            <Route className="h-7 w-7 text-primary"/><h3 className="mt-3 font-heading text-2xl font-bold uppercase">La Conquista Alpina + Maratona · dos grandes desafíos</h3>
            <p className="mt-2 text-sm text-muted-foreground">21 de junio — 5 de julio de 2027 · 15 días calendario en Europa</p>
            <p className="mt-5 font-heading text-5xl font-black text-primary">{combinedPrice !== null ? formatPrice(combinedPrice, "EUR") : "Consultando…"}</p>
            <p className="mt-3 font-medium">Subtotal por persona de los dos programas en habitación doble: {Number.isFinite(alpsDoublePrice) && alpsDoublePrice > 0 ? formatPrice(alpsDoublePrice, "EUR") : "—"} La Conquista Alpina (bicicleta incluida) + {combo ? formatPrice(combo.price, "EUR") : "—"} Maratona ({ownBike ? "bicicleta propia" : "bicicleta incluida"}).</p>
            <p className="mt-3 border-l-2 border-primary pl-3 text-sm leading-relaxed">NO es el costo total del período. Incluye 7 noches de La Conquista Alpina y 5 noches de Maratona. Las 2 noches del 28 al 30/6 y el traslado intermedio siguen pendientes de cotización y NO están incluidos en {combinedPrice !== null ? formatPrice(combinedPrice, "EUR") : "este subtotal"}.</p>
            <Button className="mt-5" disabled={!combo} onClick={()=>reserve(combo)}>{nativeOpen?'Reservar':'Solicitar reserva del'} segmento Maratona {ownBike ? "con bicicleta propia" : "con bicicleta incluida"}</Button>
            <p className="mt-2 text-sm text-muted-foreground">La Conquista Alpina conserva su reserva independiente: este botón no crea una segunda reserva de La Conquista Alpina.</p>
          </article>
          <div className="flex gap-4 border-y border-border py-5"><Route className="h-7 w-7 shrink-0 text-primary"/><div><p className="font-heading font-bold uppercase">Si venís de La Conquista Alpina</p><p className="mt-1 text-sm text-muted-foreground">La Conquista Alpina termina el 28/6 y Maratona empieza el 30/6. Las dos noches y traslados de conexión se cotizan aparte, no incluidos.</p></div></div>
          <Button asChild variant="outline"><a href={wa} target="_blank" rel="noopener noreferrer"><MessageCircle className="mr-2 h-4 w-4"/>Consultar por WhatsApp</a></Button>
        </section>

        <section id="condiciones" className="scroll-mt-6 space-y-6" aria-label="Políticas y condiciones del viaje">
          <div><p className={eyebrow}>Antes de reservar</p><h2 className={h2 + " mt-2"}>Políticas y condiciones</h2></div>
          <EventReglamentoSection metadata={metadata} />
        </section>

        <section id="faq" className="space-y-6">
          <div><p className={eyebrow}>Preguntas frecuentes</p><h2 className={h2 + " mt-2"}>Antes de decidir</h2></div>
          <div className="divide-y divide-border border-y border-border">
            {FAQ.map(([q, a]) => (
              <details key={q} className="group py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-heading text-base font-bold uppercase tracking-wide focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
                  {q}<span className="text-2xl text-primary transition-transform group-open:rotate-45" aria-hidden="true">+</span>
                </summary>
                <p className="mt-3 max-w-3xl text-sm leading-relaxed text-foreground/80 sm:text-base">{a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card p-8 text-center sm:p-12">
          <h2 className={h2}>El 4 de julio te esperamos en la largada</h2>
          <p className="mx-auto mt-4 max-w-lg text-foreground/80">Iniciá tu solicitud y coordinamos los próximos pasos, sin cobro automático.</p>
          <Cta className="mt-8 w-full sm:w-auto" />
        </section>
      </main>
      {selected&&<EventBookingRequestDialog eventId={eventId} selected={selected} contact={contact} onClose={()=>setSelected(null)}/>}
    </div>
  );
}
