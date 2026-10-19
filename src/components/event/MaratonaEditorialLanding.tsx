import { ArrowLeft, Bike, CalendarDays, Check, Flag, Hotel, MapPin, MessageCircle, Mountain, Utensils, X } from "lucide-react";
import { formatPrice } from "@/lib/currency";
import { buildWhatsAppUrl } from "@/lib/contactInfo";
import heroFallback from "@/assets/maratona-hero.jpg";

/**
 * Landing editorial exclusiva para eventos con `premium_landing.layout_variant === "editorial_maratona"`.
 * Solo lee datos públicos aprobados (precios finales y alquiler); nunca muestra `metadata.budget`.
 * La foto de portada es reemplazable vía `premium_landing.hero_image`.
 */
interface Props {
  title: string;
  metadata: any;
  onBack: () => void;
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
  "5 noches en hotel 3* superior en Corvara",
  "Desayunos, almuerzos y cenas",
  "Transfers desde y hacia el aeropuerto de Venecia",
  "Asistencia en van con hidratación",
  "Asistencia mecánica",
  "Claudio Reybaud acompañando al grupo",
  "Retiro del kit de carrera",
  "Inscripción a la Maratona ofrecida por el proveedor (cupo sujeto a confirmación administrativa)",
  "Hospitality en la llegada de la carrera",
];
const NOT_INCLUDED = ["Pasajes aéreos", "Alquiler de bicicleta (opcional)", "Seguro de viaje (a confirmar, no incluido por ahora)", "Gastos personales"];

const FAQ = [
  ["¿La bicicleta está incluida?", "No. Podés traer la tuya o alquilar una por €400. Si alquilás bicicleta también en La Gran Conquista Alpina, el alquiler de la Maratona tiene 50% de descuento: €200. El alquiler del viaje alpino no cambia."],
  ["¿Puedo hacer La Gran Conquista Alpina y la Maratona?", "Sí. Quienes participan del viaje alpino acceden a la tarifa de €3.200 para el tramo Maratona, previa verificación. El viaje alpino termina el 28/6 y la Maratona empieza el 30/6: las dos noches y los traslados intermedios se cotizan aparte y no están incluidos en los €3.200."],
  ["¿Qué días tengo que volar?", "Llegada a Venecia el 30 de junio con aterrizaje antes de las 12 h, y regreso el 5 de julio en vuelos posteriores a las 15 h. Te recomendamos consultarnos antes de comprar pasajes."],
  ["¿Cómo es la habitación?", "Las tarifas son por persona en habitación doble. Hay tercera persona en triple con 10% de descuento según disponibilidad del hotel. No hay habitaciones individuales estándar: la ocupación individual se cotiza a pedido."],
  ["¿Tengo que prepararme?", "Sí, es una prueba de montaña exigente. El programa incluye reconocimiento de puertos y acompañamiento en destino; el plan de entrenamiento previo individual no está incluido. Escribinos y te orientamos."],
  ["¿Ya puedo reservar?", "Por ahora recibimos consultas. Las reservas, señas y condiciones de pago se habilitarán más adelante."],
];

const eur = (n: unknown) => (typeof n === "number" && n > 0 ? formatPrice(n, "EUR") : null);

export default function MaratonaEditorialLanding({ title, metadata, onBack }: Props) {
  const pl = metadata?.premium_landing || {};
  const pricing = metadata?.pricing || {};
  const rental = metadata?.rental || {};
  const wa = buildWhatsAppUrl(pl.whatsapp?.message || "Hola, quiero recibir información sobre la Maratona dles Dolomites 2027.", pl.whatsapp?.number);
  const solo = eur(pricing.standalone_eur);
  const combo = eur(pricing.alps_participant_eur);
  const bike = eur(rental.maratona_eur ?? pricing.rental_extra_eur);
  const bikeBoth = eur(rental.maratona_eur_when_renting_both_trips ?? pricing.rental_both_trips_eur);

  const Cta = ({ label = "Quiero vivir la Maratona", className = "" }: { label?: string; className?: string }) => (
    <a href={wa} target="_blank" rel="noopener noreferrer" className={"inline-flex min-h-12 items-center justify-center gap-2.5 rounded-xl bg-primary px-6 font-heading text-sm font-bold uppercase tracking-wider text-primary-foreground transition-transform hover:scale-[1.02] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary " + className}>
      <MessageCircle className="h-5 w-5" aria-hidden="true" /> {label}
    </a>
  );
  const h2 = "font-heading text-3xl font-black uppercase leading-none tracking-tight sm:text-5xl";
  const eyebrow = "font-heading text-xs font-semibold uppercase tracking-[0.2em] text-primary";

  return (
    <div className="alpine-event min-h-screen bg-[#101011] text-[#f4f3f1]">
      <header className="relative isolate flex min-h-[92svh] items-end overflow-hidden px-4 pb-10 pt-32">
        <img src={pl.hero_image || heroFallback} alt="Ciclistas subiendo un puerto de las Dolomitas" width={1920} height={1088} loading="eager" decoding="async" className="absolute inset-0 -z-10 h-full w-full object-cover object-[60%_center]" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-black/50 via-black/30 to-[#101011]" />
        <button type="button" onClick={onBack} aria-label="Volver" className="absolute left-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 backdrop-blur focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <p className="absolute right-4 top-6 font-heading text-xs uppercase tracking-[0.25em] text-white/80">Ciclismo Reybaud</p>
        <div className="mx-auto w-full max-w-5xl animate-fade-in">
          <p className={eyebrow}>Corvara · Alta Badia · Italia</p>
          <h1 className="mt-3 max-w-4xl font-heading text-[clamp(3rem,9vw,6.5rem)] font-black uppercase leading-[.9] tracking-tight">{title}</h1>
          <p className="mt-5 max-w-xl text-lg text-zinc-200 sm:text-2xl">El desafío tiene una fecha. La preparación empieza antes.</p>
          <div className="mt-7 flex flex-wrap gap-x-6 gap-y-2 text-sm text-zinc-200 sm:text-base">
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
          <p className="text-base leading-relaxed text-zinc-300 sm:text-lg">
            La Maratona dles Dolomites es una de las grandes pruebas de ciclismo de montaña del mundo. La vivimos en grupo:
            reconocemos los puertos antes de la carrera, planificamos cada día y te acompañamos con asistencia en ruta,
            mecánica y una comunidad que pedalea con vos. Vos te ocupás de disfrutar los pasos míticos; del resto, nos ocupamos nosotros.
          </p>
        </section>

        <section aria-label="Resumen" className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[[CalendarDays, "6 días", "5 noches"], [Flag, "4 de julio", "Día de carrera"], [MapPin, "Corvara", "Base en Alta Badia"], [Hotel, "3* superior", "Media pensión + almuerzos"]].map(([Icon, v, l]: any) => (
            <div key={v} className="rounded-2xl border border-white/10 bg-[#1c1c1e] p-5">
              <Icon className="mb-3 h-6 w-6 text-primary" aria-hidden="true" />
              <p className="font-heading text-2xl font-black uppercase leading-none sm:text-3xl">{v}</p>
              <p className="mt-1.5 text-xs uppercase tracking-[.14em] text-zinc-400">{l}</p>
            </div>
          ))}
        </section>

        <section id="programa" className="scroll-mt-6 space-y-8">
          <div><p className={eyebrow}>Programa</p><h2 className={h2 + " mt-2"}>El camino hasta la largada</h2></div>
          <ol className="grid gap-4 md:grid-cols-2">
            {DAYS.map((d, i) => (
              <li key={d.date} className={"rounded-2xl border p-5 sm:p-6 " + (d.race ? "border-primary bg-primary/10 md:col-span-2" : "border-white/10 bg-[#1c1c1e]")}>
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary font-heading text-sm font-bold text-primary-foreground">{i + 1}</span>
                  <span className="font-heading text-sm uppercase tracking-wider text-zinc-400">{d.date}</span>
                  {d.race && <span className="ml-auto rounded-full bg-primary px-3 py-1 font-heading text-[11px] font-bold uppercase tracking-wider text-primary-foreground">Carrera</span>}
                </div>
                <h3 className="mt-3 font-heading text-xl font-bold uppercase leading-tight">{d.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-300 sm:text-base">{d.body}</p>
              </li>
            ))}
          </ol>
          <p className="text-xs text-zinc-400">Programa sujeto a ajustes operativos del proveedor y del organizador de la carrera.</p>
        </section>

        <section className="relative overflow-hidden rounded-3xl">
          <img src={pl.secondary_image || heroFallback} alt="" loading="lazy" width={1920} height={1088} className="h-64 w-full object-cover object-[30%_center] sm:h-96" />
          <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/80 to-transparent p-6 sm:p-10">
            <p className="max-w-lg font-heading text-2xl font-bold uppercase leading-tight sm:text-4xl">Campolongo, Pordoi, Sella, Gardena, Falzarego.</p>
          </div>
        </section>

        <section id="incluye" className="space-y-8">
          <div><p className={eyebrow}>Servicios</p><h2 className={h2 + " mt-2"}>Todo lo que necesitás, organizado</h2></div>
          <div className="grid gap-6 md:grid-cols-[1.5fr_1fr]">
            <ul className="space-y-3 rounded-2xl border border-white/10 bg-[#1c1c1e] p-6">
              {INCLUDED.map((t) => <li key={t} className="flex gap-3 text-sm sm:text-base"><Check className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />{t}</li>)}
            </ul>
            <div className="rounded-2xl border border-white/10 p-6">
              <p className="font-heading text-sm font-bold uppercase tracking-wider text-zinc-300">No incluye</p>
              <ul className="mt-4 space-y-3">
                {NOT_INCLUDED.map((t) => <li key={t} className="flex gap-3 text-sm text-zinc-400"><X className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{t}</li>)}
              </ul>
            </div>
          </div>
        </section>

        <section id="precio" className="scroll-mt-6 space-y-8">
          <div><p className={eyebrow}>Tarifas</p><h2 className={h2 + " mt-2"}>Elegí cómo vivirla</h2></div>
          <div className="grid gap-4 md:grid-cols-2">
            {solo && (
              <article className="flex flex-col rounded-2xl border border-white/10 bg-[#1c1c1e] p-6 sm:p-8">
                <Mountain className="h-7 w-7 text-primary" aria-hidden="true" />
                <h3 className="mt-4 font-heading text-xl font-bold uppercase">Solo Maratona dles Dolomites</h3>
                <p className="mt-1 text-sm text-zinc-400">Para quienes viajan únicamente a la Maratona.</p>
                <p className="mt-6 font-heading text-5xl font-black text-primary">{solo}</p>
                <p className="text-xs uppercase tracking-wider text-zinc-400">por persona · habitación doble</p>
              </article>
            )}
            {combo && (
              <article className="flex flex-col rounded-2xl border border-primary bg-primary/10 p-6 sm:p-8">
                <Flag className="h-7 w-7 text-primary" aria-hidden="true" />
                <h3 className="mt-4 font-heading text-xl font-bold uppercase">Maratona + La Gran Conquista Alpina</h3>
                <p className="mt-1 text-sm text-zinc-300">Para quienes también participan del viaje alpino (previa verificación).</p>
                <p className="mt-6 font-heading text-5xl font-black text-primary">{combo}</p>
                <p className="text-xs uppercase tracking-wider text-zinc-400">por persona · habitación doble · tramo Maratona</p>
                <p className="mt-3 text-sm text-zinc-300">Precio del tramo Maratona únicamente; no incluye La Gran Conquista Alpina{solo ? `. €300 menos que la tarifa individual.` : "."}</p>
              </article>
            )}
          </div>
          <p className="text-sm text-zinc-400">Ambas tarifas incluyen los mismos servicios y no incluyen alquiler de bicicleta.</p>

          <div className="grid gap-4 md:grid-cols-2">
            {bike && (
              <div className="flex gap-4 rounded-2xl border border-white/10 p-6">
                <Bike className="h-7 w-7 shrink-0 text-primary" aria-hidden="true" />
                <div>
                  <p className="font-heading font-bold uppercase">Bicicleta opcional: {bike}</p>
                  {bikeBoth && <p className="mt-1 text-sm text-zinc-400">Si alquilás bicicleta en ambos viajes, el alquiler de la Maratona baja a {bikeBoth} (50% off). El alquiler del viaje alpino no cambia.</p>}
                </div>
              </div>
            )}
            <div className="flex gap-4 rounded-2xl border border-primary/40 bg-[#1c1c1e] p-6">
              <Utensils className="h-7 w-7 shrink-0 text-primary" aria-hidden="true" />
              <div>
                <p className="font-heading font-bold uppercase">Si venís de Alpes</p>
                <p className="mt-1 text-sm text-zinc-400">El viaje alpino termina el 28/6 y la Maratona empieza el 30/6. Las dos noches y los traslados intermedios se cotizan aparte y no están incluidos en la tarifa.</p>
              </div>
            </div>
          </div>
          <p className="text-xs text-zinc-400">Tercera persona en habitación triple: 10% de descuento según disponibilidad del hotel. Ocupación individual a cotizar. Reservas y pagos aún no habilitados: por ahora recibimos consultas.</p>
          <Cta label="Consultar por WhatsApp" className="w-full sm:w-auto" />
        </section>

        <section id="faq" className="space-y-6">
          <div><p className={eyebrow}>Preguntas frecuentes</p><h2 className={h2 + " mt-2"}>Antes de decidir</h2></div>
          <div className="divide-y divide-white/10 border-y border-white/10">
            {FAQ.map(([q, a]) => (
              <details key={q} className="group py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-heading text-base font-bold uppercase tracking-wide focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
                  {q}<span className="text-2xl text-primary transition-transform group-open:rotate-45" aria-hidden="true">+</span>
                </summary>
                <p className="mt-3 max-w-3xl text-sm leading-relaxed text-zinc-300 sm:text-base">{a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-[#1c1c1e] p-8 text-center sm:p-12">
          <h2 className={h2}>El 4 de julio te esperamos en la largada</h2>
          <p className="mx-auto mt-4 max-w-lg text-zinc-300">Escribinos y armamos juntos tu viaje a la Maratona.</p>
          <Cta className="mt-8 w-full sm:w-auto" />
        </section>
      </main>
    </div>
  );
}
