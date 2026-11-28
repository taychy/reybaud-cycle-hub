import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowDown, ArrowLeft, ArrowRight, Bike, CalendarDays, Check, MapPin, Mountain, Users, Utensils, BedDouble } from "lucide-react";
import logo from "@/assets/logo.png";
import scenery from "@/assets/events/san-luis-sierras.jpg.asset.json";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import SanLuisPreRegistrationForm from "@/components/event/SanLuisPreRegistrationForm";
import { CampKey, SAN_LUIS_INTAKE_ENABLED, sanLuisCamps, sanLuisPackages } from "@/lib/sanLuisPreRegistration";
import { formatPrice } from "@/lib/currency";

const faqs = [
  ["¿Preinscribirme confirma mi reserva?", "No. Es una expresión de interés, sin cobro ni bloqueo de cupo. Te contactaremos con disponibilidad y condiciones definitivas antes de avanzar. Las tarifas son estimadas y están pendientes de reconfirmación del hotel y del kit; todavía no hay condiciones de pago definitivas."],
  ["¿Cuáles son las fechas y el checkout?", "El camp completo va del lunes 18 al domingo 24 de enero de 2027 (7 días, 6 noches). El Mini Camp va del jueves 21 al domingo 24 (4 días, 3 noches). En ambos, el checkout es el domingo. Los horarios y recorridos se comunicarán cuando estén confirmados."],
  ["¿Puedo ir con un acompañante?", "Podés indicarlo en el comentario. Las tarifas mostradas son por ciclista; la propuesta y disponibilidad para acompañantes se consultan por separado. No damos por confirmada su plaza."],
  ["¿Qué comidas contempla cada modalidad?", "Doble, individual y cabaña con pensión completa contemplan desayuno, almuerzo y cena. La cabaña sin pensión no contempla almuerzo ni cena. El desayuno de las cabañas está sujeto a validación del hotel. La oferta final de alojamiento y servicios debe reconfirmarse."],
  ["¿Cómo se distribuyen las habitaciones y cabañas?", "La doble es para 2 personas, la individual para 1 y la cabaña para 3. No se ofrecen habitaciones triples convencionales. Las dos tarifas de cabaña comparten el mismo inventario físico, no son cupos adicionales. La distribución se coordina según disponibilidad; el precio es por ciclista, no por habitación."],
  ["¿Puedo llegar el domingo 17 de enero?", "Solo para el camp completo podés expresar interés en una noche extra el domingo 17/01. Su precio y disponibilidad están pendientes del hotel. No está incluida en la tarifa, no se suma al total ni se cobra en la preinscripción."],
];

export default function SanLuis2027() {
  const [camp, setCamp] = useState<CampKey>("full");
  const [packageId, setPackageId] = useState<string>(sanLuisPackages.full[3].id);
  const select = (key: CampKey, id: string) => { setCamp(key); setPackageId(id); };
  useEffect(() => {
    const previous = document.title;
    document.title = "Training Camp San Luis · Enero 2027 | Reybaud";
    const robots = document.createElement("meta"); robots.name = "robots"; robots.content = "noindex, nofollow"; document.head.appendChild(robots);
    return () => { document.title = previous; robots.remove(); };
  }, []);
  const current = sanLuisCamps[camp];
  const selected = sanLuisPackages[camp].find(p => p.id === packageId);
  return <div className="bg-background text-foreground min-h-screen">
    <header className="flex items-center justify-between max-w-6xl mx-auto px-5 py-3 md:px-8">
      <Link to="/eventos" aria-label="Volver a eventos Reybaud"><img src={logo} alt="Reybaud" className="h-12 w-28 object-contain" /></Link>
      <Button variant="ghost" asChild className="min-h-11"><Link to="/eventos"><ArrowLeft className="h-4 w-4" /> Eventos</Link></Button>
    </header>
    <main>
      <section className="relative isolate overflow-hidden min-h-[520px] md:min-h-[570px] flex items-end">
        <img src={scenery.url} alt="Sierras de Potrero de los Funes, San Luis" className="absolute inset-0 -z-20 h-full w-full object-cover" fetchPriority="high" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-background via-background/70 to-background/10" />
        <div className="w-full max-w-6xl mx-auto px-5 py-10 md:px-8 md:py-14 space-y-6">
          <p className="text-accent text-sm font-semibold flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-accent shrink-0" /> {SAN_LUIS_INTAKE_ENABLED ? "Preinscripción abierta · tarifas estimadas, sujetas a confirmación" : "Vista previa · preinscripción próximamente"}</p>
          <div><p className="font-heading text-lg uppercase text-foreground/90 mb-2">Reybaud · Enero 2027</p><h1 className="text-5xl md:text-7xl font-bold leading-[1.05] max-w-3xl">Training Camp<br /><span className="text-primary">San Luis</span></h1></div>
          <p className="max-w-xl text-lg leading-relaxed">Días de ruta, montaña y ciclismo compartido.<br className="hidden sm:block" /> Elegí una semana completa o una escapada de cuatro días.</p>
          <div className="flex flex-wrap gap-4 text-sm"><span className="flex gap-2 items-center"><MapPin className="h-4 w-4 text-accent" /> San Luis, Argentina</span><span className="flex gap-2 items-center"><Bike className="h-4 w-4 text-accent" /> Dirección técnica Reybaud</span></div>
          <div className="flex flex-col sm:flex-row gap-3"><Button asChild className="min-h-12"><a href="#preinscripcion">Quiero preinscribirme <ArrowRight className="h-4 w-4" /></a></Button><Button asChild variant="outline" className="min-h-12"><a href="#propuestas">Ver las modalidades <ArrowDown className="h-4 w-4" /></a></Button></div>
          <p className="text-xs text-muted-foreground">Tarifas estimadas, sujetas a confirmación. Preinscripción sin reserva ni pago.</p>
        </div>
      </section>

      <section id="propuestas" className="scroll-mt-6 max-w-6xl mx-auto px-5 py-10 md:px-8 md:py-16">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-5 mb-8"><div><p className="text-accent text-sm uppercase font-semibold mb-2">Tu camp, a tu medida</p><h2 className="text-3xl md:text-4xl">Dos duraciones. La misma pasión.</h2></div><p className="text-sm text-muted-foreground max-w-sm">Precios en pesos argentinos, por ciclista. Alojamiento y servicios sujetos a confirmación final.</p></div>
        <Tabs value={camp} onValueChange={v => { const key = v as CampKey; select(key, sanLuisPackages[key][3].id); }}>
          <TabsList className="w-full sm:w-auto h-14 mb-6"><TabsTrigger value="full" className="flex-1 sm:px-8 h-12">Camp completo</TabsTrigger><TabsTrigger value="mini" className="flex-1 sm:px-8 h-12">Mini Camp</TabsTrigger></TabsList>
          {(["full", "mini"] as const).map(key => <TabsContent key={key} value={key} className="space-y-6">
            <div className="border-y border-border py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-5">
              <div className="space-y-2"><h3 className="text-2xl">{sanLuisCamps[key].dates} <span className="text-muted-foreground">2027</span></h3><div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground"><span className="flex gap-2 items-center"><CalendarDays className="h-4 w-4" />{sanLuisCamps[key].days} días · {sanLuisCamps[key].nights} noches</span><span className="flex gap-2 items-center"><Users className="h-4 w-4" />Máximo comercial: {sanLuisCamps[key].capacity} ciclistas</span><span>Checkout domingo 24</span></div></div>
              <div className="shrink-0"><p className="text-xs text-accent uppercase font-semibold">Desde · cabaña sin almuerzo ni cena</p><p className="text-3xl font-heading font-semibold">{formatPrice(sanLuisPackages[key][3].price, "ARS")} <span className="text-sm text-muted-foreground font-body">ARS / ciclista</span></p></div>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">{sanLuisPackages[key].map((p, i) => <article key={p.id} className={`rounded-lg border p-5 flex flex-col gap-4 ${packageId === p.id ? "border-primary bg-primary/5" : "border-border bg-card"}`}>
              <div className="flex items-center justify-between"><BedDouble className="h-6 w-6 text-accent" />{i === 3 && <span className="text-xs font-semibold text-accent">Menor tarifa</span>}</div>
              <div><h4 className="text-xl leading-tight min-h-14">{p.label}</h4><p className="text-sm text-muted-foreground mt-1">{p.occupancy === 3 ? "Cabaña de 3 plazas" : `${p.occupancy} ${p.occupancy === 1 ? "persona" : "personas"} por habitación`}</p></div>
              <ul className="text-sm space-y-2 flex-1"><li className="flex gap-2"><Check className="h-4 w-4 shrink-0 text-accent" />{sanLuisCamps[key].nights} noches de alojamiento</li><li className="flex gap-2"><Check className="h-4 w-4 shrink-0 text-accent" />{p.occupancy === 3 ? "Desayuno a validar con hotel" : "Desayuno en la propuesta"}</li><li className="flex gap-2"><Utensils className="h-4 w-4 shrink-0 text-accent" />{p.meals ? "Almuerzo y cena contemplados" : "Sin almuerzo ni cena"}</li></ul>
              <div><p className="text-2xl font-heading font-semibold">{formatPrice(p.price, "ARS")}</p><p className="text-xs text-muted-foreground">ARS estimados por ciclista · no por habitación</p></div>
              <Button variant={packageId === p.id ? "default" : "outline"} className="min-h-11 w-full" aria-pressed={packageId === p.id} aria-label={`Elegir ${p.label}`} onClick={() => select(key, p.id)}>{packageId === p.id ? <><Check className="h-4 w-4" /> Elegido</> : "Elegir modalidad"}</Button>
            </article>)}</div>
          </TabsContent>)}
        </Tabs>
        <div className="mt-6 space-y-2 text-sm text-muted-foreground leading-relaxed"><p>Las cabañas con y sin comidas comparten inventario. No se ofrecen habitaciones triples convencionales.</p><p>Los límites de 30 y 15 son comerciales; la disponibilidad simultánea de hotel y vehículos para el 21–24/01 todavía debe confirmarse. Preinscribirte no bloquea una plaza.</p><p>Los servicios y detalles finales del kit se confirmarán antes de la reserva.</p></div>
      </section>

      <section className="bg-secondary/50 border-y border-border"><div className="max-w-6xl mx-auto px-5 py-10 md:px-8 grid md:grid-cols-3 gap-8">
        <div><Mountain className="h-7 w-7 text-primary mb-3" /><h2 className="text-2xl mb-2">Entrenar en San Luis</h2><p className="text-sm text-muted-foreground leading-relaxed">Un entorno de sierras para dedicarle tiempo al ciclismo de ruta y compartir la experiencia con Reybaud.</p></div>
        <div><Bike className="h-7 w-7 text-accent mb-3" /><h3 className="text-2xl mb-2">Con dirección técnica</h3><p className="text-sm text-muted-foreground leading-relaxed">Dirección técnica Reybaud y acompañamiento en las salidas. Recorridos, horarios y organización por niveles se comunicarán cuando estén confirmados.</p></div>
        <div><Users className="h-7 w-7 text-primary mb-3" /><h3 className="text-2xl mb-2">Sin apuro para decidir</h3><p className="text-sm text-muted-foreground leading-relaxed">Primero expresás tu interés. Después hablamos de disponibilidad, alojamiento y condiciones definitivas. No hay un cobro ahora.</p></div>
      </div></section>

      <section id="preinscripcion" className="scroll-mt-6 max-w-6xl mx-auto px-5 py-12 md:px-8 md:py-16 grid lg:grid-cols-[1fr_1.5fr] gap-10">
        <div><p className="text-accent text-sm uppercase font-semibold mb-2">El primer paso</p><h2 className="text-4xl mb-4">Quiero preinscribirme</h2><p className="text-muted-foreground leading-relaxed">Contanos qué propuesta te interesa. No necesitás ser alumno ni tener una cuenta en Reybaud.</p><div role="region" aria-label="Tu elección actual" className="mt-7 border-t border-border pt-5 space-y-2"><p className="font-semibold">Tu elección actual</p><p>{current.label} · {current.nights} noches</p><p className="text-sm text-muted-foreground">{current.dates} de 2027</p>{selected && <><p>{selected.label}</p><p className="text-sm text-muted-foreground">{formatPrice(selected.price, "ARS")} ARS estimados por ciclista</p></>}</div></div>
        <SanLuisPreRegistrationForm camp={camp} packageId={packageId} onSelectionChange={select} />
      </section>
      <section className="max-w-6xl mx-auto px-5 pb-14 md:px-8"><h2 className="text-3xl mb-6">Antes de sumarte</h2><Accordion type="single" collapsible>{faqs.map(([q, a], i) => <AccordionItem key={q} value={`faq-${i}`}><AccordionTrigger className="text-left gap-4">{q}</AccordionTrigger><AccordionContent className="max-w-3xl text-muted-foreground leading-relaxed">{a}</AccordionContent></AccordionItem>)}</Accordion></section>
    </main>
    <footer className="border-t border-border max-w-6xl mx-auto px-5 py-7 md:px-8 text-xs text-muted-foreground space-y-3"><p>Reybaud · Training Camp San Luis · Enero 2027</p><p>Foto: sierras de Potrero de los Funes, ViviPotreroCommon · <a className="underline" href="https://commons.wikimedia.org/wiki/File:Vista_sierras_Potrero_de_los_Funes.jpg" target="_blank" rel="noopener noreferrer">Wikimedia Commons</a> · <a className="underline" href="https://creativecommons.org/licenses/by-sa/3.0/" target="_blank" rel="noopener noreferrer">CC BY-SA 3.0</a>. Encuadre adaptado. Imagen del destino, no de un recorrido confirmado.</p><Link className="underline" to="/politica-privacidad">Privacidad</Link></footer>
  </div>;
}