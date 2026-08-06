import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { z } from "zod";
import { ChevronDown, Loader2, CheckCircle2, Calendar, MapPin, Users, Instagram, Phone, Copy, Upload, CreditCard, Building2 } from "lucide-react";
import heroAsset from "@/assets/formacion-inicial-hero.png.asset.json";
import { ESCUELA_TRANSFER_INFO } from "@/lib/contactInfo";
const heroImg = heroAsset.url;

const COHORT = "formacion_inicial_2026_2";

interface Stage {
  id: string;
  nombre: string;
  precio: number;
  precio_cuota: number | null;
  cuotas_cantidad: number | null;
  fecha_desde: string;
  fecha_hasta: string;
  vigente: boolean;
}

interface Program {
  id: string;
  nombre: string;
  descripcion: string;
  cohort_slug: string;
  fecha_inicio_programa: string;
  fecha_fin_programa: string;
  fecha_cierre_inscripcion: string;
  max_inscripciones: number;
  inscripciones_actuales: number;
  cupos_libres: number;
  moneda: string;
  features: string[];
  stages: Stage[];
  stage_vigente: Stage | null;
}

const formSchema = z.object({
  nombre: z.string().trim().min(2, "Nombre requerido").max(80),
  apellido: z.string().trim().min(2, "Apellido requerido").max(80),
  email: z.string().trim().email("Email inválido").max(255),
  telefono: z.string().trim().max(30).optional().or(z.literal("")),
  modo_pago: z.enum(["contado", "cuotas"]),
  metodo_pago_inicial: z.enum(["mp", "transferencia"]),
});

const MAX_COMPROBANTE_MB = 6;
const COMPROBANTE_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result || "");
      const idx = s.indexOf("base64,");
      resolve(idx >= 0 ? s.slice(idx + 7) : s);
    };
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  dt.setDate(dt.getDate() + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

function fmtMoney(n: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n);
}

function fmtDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  return dt.toLocaleDateString("es-AR", { day: "numeric", month: "long" });
}

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export default function FormacionInicial() {
  const [program, setProgram] = useState<Program | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [modoPago, setModoPago] = useState<"contado" | "cuotas">("contado");
  const [metodoPago, setMetodoPago] = useState<"mp" | "transferencia">("mp");
  const [form, setForm] = useState({ nombre: "", apellido: "", email: "", telefono: "" });
  const [comprobante, setComprobante] = useState<File | null>(null);
  const [transferSent, setTransferSent] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.title = "Programa de Iniciación 2026/2 — Ciclismo Reybaud";
    (async () => {
      const { data, error } = await supabase.rpc("get_public_program", { _cohort_slug: COHORT });
      if (error || !data) {
        toast.error("No se pudo cargar el programa");
      } else {
        setProgram(data as unknown as Program);
      }
      setLoading(false);
    })();
  }, []);

  const stageVigente = program?.stage_vigente;
  const inscripcionesAbiertas = useMemo(() => {
    if (!program) return false;
    const today = new Date().toISOString().slice(0, 10);
    return (
      program.cupos_libres > 0 &&
      today <= program.fecha_cierre_inscripcion &&
      !!stageVigente
    );
  }, [program, stageVigente]);

  const cuotaAmount = stageVigente?.precio_cuota ? Number(stageVigente.precio_cuota) : 0;
  const totalAmount = stageVigente ? Number(stageVigente.precio) : 0;
  const cuota1Vence = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return addDaysISO(today, 30);
  }, []);

  function copy(text: string, label: string) {
    navigator.clipboard.writeText(text).then(
      () => toast.success(`${label} copiado`),
      () => toast.error("No se pudo copiar"),
    );
  }

  function pickComprobante(f: File | null) {
    if (!f) { setComprobante(null); return; }
    if (!COMPROBANTE_TYPES.includes(f.type)) {
      toast.error("Formato inválido. Usá JPG, PNG, WEBP o PDF.");
      return;
    }
    if (f.size > MAX_COMPROBANTE_MB * 1024 * 1024) {
      toast.error(`El archivo supera los ${MAX_COMPROBANTE_MB} MB.`);
      return;
    }
    setComprobante(f);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting || !program) return;

    const parsed = formSchema.safeParse({ ...form, modo_pago: modoPago, metodo_pago_inicial: metodoPago });
    if (!parsed.success) {
      toast.error(parsed.error.errors[0]?.message ?? "Datos inválidos");
      return;
    }

    if (metodoPago === "transferencia" && !comprobante) {
      toast.error("Subí el comprobante de transferencia para continuar.");
      return;
    }

    setSubmitting(true);
    try {
      let comprobante_base64: string | null = null;
      let comprobante_filename: string | null = null;
      let comprobante_mime: string | null = null;
      if (metodoPago === "transferencia" && comprobante) {
        comprobante_base64 = await fileToBase64(comprobante);
        comprobante_filename = comprobante.name;
        comprobante_mime = comprobante.type;
      }

      const { data, error } = await supabase.functions.invoke("enroll-programa", {
        body: {
          cohort_slug: COHORT,
          ...parsed.data,
          comprobante_base64,
          comprobante_filename,
          comprobante_mime,
        },
      });
      if (error || !data?.ok) {
        toast.error(data?.error || error?.message || "No se pudo procesar la inscripción");
        return;
      }
      if (data.mode === "transfer") {
        toast.success("¡Gracias! Recibimos tu comprobante.");
        setTransferSent(true);
        return;
      }
      if (data.init_point) {
        toast.success("¡Genial! Te llevamos al pago…");
        window.location.href = data.init_point;
      } else {
        toast.error("Respuesta inesperada del servidor.");
      }
    } catch (err) {
      console.error(err);
      toast.error("Error inesperado. Intentá de nuevo.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!program) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6 text-center">
        <div>
          <h1 className="font-heading text-3xl mb-3">Programa no disponible</h1>
          <p className="text-muted-foreground mb-6">Pronto abrimos una nueva edición.</p>
          <Link to="/" className="text-primary underline">Volver al inicio</Link>
        </div>
      </div>
    );
  }

  const cerrado = !inscripcionesAbiertas;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="container mx-auto px-4 sm:px-6 py-10 sm:py-16 grid lg:grid-cols-2 gap-8 lg:gap-12 items-center">
          <div className="order-2 lg:order-1">
            <span className="inline-block text-xs sm:text-sm font-semibold uppercase tracking-widest text-cyan mb-3">
              Edición 2026/2 · Inicio 15 de agosto
            </span>
            <h1 className="font-heading text-4xl sm:text-5xl lg:text-6xl leading-tight mb-4">
              <span className="text-primary">Programa de Formación</span><br />
              <span>Ciclista Nivel Inicial</span>
            </h1>
            <p className="text-xl sm:text-2xl text-muted-foreground mb-4">
              De salir a pedalear…<br />
              <span className="text-foreground">a entrenar como ciclista.</span>
            </p>
            <p className="text-base sm:text-lg text-muted-foreground mb-6 max-w-xl">
              Un programa de 8 semanas para adultos que ya pedalean y quieren evolucionar con método y seguridad.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button size="lg" onClick={() => scrollTo("inscripcion")} disabled={cerrado}>
                {cerrado ? "Inscripciones cerradas" : "Quiero anotarme"}
              </Button>
              <Button size="lg" variant="outline" onClick={() => scrollTo("que-es")}>
                Ver más
              </Button>
            </div>
            {inscripcionesAbiertas && (
              <p className="mt-4 text-sm text-cyan font-medium">
                {program.cupos_libres === 1
                  ? "¡Solo queda 1 lugar!"
                  : `Quedan ${program.cupos_libres} de ${program.max_inscripciones} lugares`}
              </p>
            )}
          </div>
          <div className="order-1 lg:order-2">
            <img
              src={heroImg}
              alt="Ciclistas rodando en pelotón"
              width={1600}
              height={1200}
              className="rounded-2xl shadow-2xl w-full h-auto object-cover"
            />
          </div>
        </div>
        <button
          onClick={() => scrollTo("te-pasa-esto")}
          className="mx-auto flex items-center justify-center w-12 h-12 rounded-full bg-cyan text-white mb-8 hover:scale-110 transition"
          aria-label="Ver más"
        >
          <ChevronDown className="w-6 h-6" />
        </button>
      </section>

      {/* ¿TE PASA ESTO? */}
      <section id="te-pasa-esto" className="py-16 border-t border-border/40 bg-card/30">
        <div className="container mx-auto px-4 sm:px-6 max-w-3xl">
          <h2 className="font-heading text-3xl sm:text-4xl text-primary mb-8 text-center">¿Te pasa esto?</h2>
          <ul className="space-y-3 text-lg">
            {[
              "Vas al circuito pero sentís que estás estancado",
              "Salís con amigos pero no sabés cómo mejorar",
              "Te gustaría rodar en pelotón pero no te animás",
              "No entendés bien cómo usar los cambios",
              "Querés entrenar… pero no sabés por dónde empezar",
            ].map((t, i) => (
              <li key={i} className="flex gap-3">
                <CheckCircle2 className="w-6 h-6 text-cyan flex-shrink-0 mt-0.5" />
                <span>{t}</span>
              </li>
            ))}
          </ul>
          <div className="mt-8 space-y-1 text-lg text-center">
            <p className="text-muted-foreground">No te falta capacidad.</p>
            <p className="font-semibold">Te falta una guía y un experto que te acompañe.</p>
          </div>
        </div>
      </section>

      {/* QUÉ ES */}
      <section id="que-es" className="py-16">
        <div className="container mx-auto px-4 sm:px-6 max-w-3xl">
          <h2 className="font-heading text-3xl sm:text-4xl text-primary mb-6">¿Qué es este programa?</h2>
          <p className="text-lg mb-4">Este no es un curso para aprender a andar en bici.</p>
          <p className="text-lg mb-6">
            Es un programa de formación para <strong>ciclistas adultos que quieren dar el siguiente paso</strong>.
          </p>
          <p className="text-lg mb-4">Durante 8 semanas vas a aprender a:</p>
          <ul className="space-y-2 text-lg">
            {program.features.map((f, i) => (
              <li key={i} className="flex gap-3">
                <span className="text-primary font-bold">•</span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* PARA QUIÉN */}
      <section className="py-16 border-t border-border/40 bg-card/30">
        <div className="container mx-auto px-4 sm:px-6 max-w-3xl">
          <h2 className="font-heading text-3xl sm:text-4xl text-primary mb-6">Para quién es</h2>
          <p className="text-lg mb-4">Este programa es para vos si:</p>
          <ul className="space-y-3 text-lg mb-6">
            {["Ya pedaleás", "Querés progresar sin lesionarte", "Querés entrenar mejor, no más fuerte", "Buscás acompañamiento real"].map((t, i) => (
              <li key={i} className="flex gap-3">
                <CheckCircle2 className="w-6 h-6 text-cyan flex-shrink-0 mt-0.5" />
                <span>{t}</span>
              </li>
            ))}
          </ul>
          <div className="space-y-1 text-lg">
            <p className="text-muted-foreground">No es alto rendimiento.</p>
            <p className="font-semibold">Es empezar a entrenar bien.</p>
          </div>
        </div>
      </section>

      {/* CUÁNDO */}
      <section className="py-16">
        <div className="container mx-auto px-4 sm:px-6 max-w-3xl">
          <h2 className="font-heading text-3xl sm:text-4xl text-primary mb-8">¿Cuándo empieza?</h2>
          <div className="grid sm:grid-cols-2 gap-6">
            <div className="p-5 rounded-xl border border-border bg-card">
              <Calendar className="w-6 h-6 text-primary mb-3" />
              <p className="text-sm text-muted-foreground uppercase tracking-wide font-semibold mb-1">Inicio de clases</p>
              <p className="text-xl font-heading">Sábado 15 de agosto</p>
              <p className="text-sm text-muted-foreground mt-2">8 clases · Finalización 3 de octubre</p>
              <p className="text-xs text-muted-foreground mt-1">Fechas de recuperación por lluvia: 10 y 17 de octubre</p>
            </div>
            <div className="p-5 rounded-xl border border-border bg-card">
              <MapPin className="w-6 h-6 text-primary mb-3" />
              <p className="text-sm text-muted-foreground uppercase tracking-wide font-semibold mb-1">Cuándo y dónde</p>
              <p className="text-xl font-heading">Sábados 12:00 a 13:30 hs</p>
              <p className="text-sm text-muted-foreground mt-2">Circuito KDT, CABA</p>
            </div>
            <div className="p-5 rounded-xl border border-border bg-card">
              <Users className="w-6 h-6 text-primary mb-3" />
              <p className="text-sm text-muted-foreground uppercase tracking-wide font-semibold mb-1">Cupos</p>
              <p className="text-xl font-heading">{program.cupos_libres} de {program.max_inscripciones} disponibles</p>
              <p className="text-sm text-muted-foreground mt-2">Grupo único, coaches rotando por temática</p>
            </div>
            <div className="p-5 rounded-xl border border-border bg-card">
              <Calendar className="w-6 h-6 text-primary mb-3" />
              <p className="text-sm text-muted-foreground uppercase tracking-wide font-semibold mb-1">Cierre de inscripciones</p>
              <p className="text-xl font-heading">Lunes 10 de agosto</p>
              <p className="text-sm text-muted-foreground mt-2">O antes si se llenan los cupos.</p>
            </div>
          </div>
        </div>
      </section>

      {/* STAFF */}
      <section className="py-16 border-t border-border/40 bg-black text-white">
        <div className="container mx-auto px-4 sm:px-6 max-w-3xl">
          <h2 className="font-heading text-3xl sm:text-4xl mb-6">Staff que te formará</h2>
          <p className="text-lg mb-4">
            Vas a entrenar con profesores con más de 30 años de experiencia en ciclismo competitivo.
          </p>
          <div className="mb-4">
            <p className="text-lg font-semibold mb-2">Trayectoria en competencias:</p>
            <ul className="space-y-1 text-lg pl-4">
              <li>Nacionales</li>
              <li>Panamericanas</li>
              <li>Mundiales</li>
            </ul>
          </div>
          <p className="text-lg text-white/80">No improvisamos.</p>
          <p className="text-lg font-semibold">Formamos ciclistas.</p>
          <div className="flex gap-3 mt-6">
            <a
              href="https://wa.me/5491140311122"
              className="w-10 h-10 rounded-full bg-cyan flex items-center justify-center hover:scale-110 transition"
              target="_blank" rel="noreferrer" aria-label="WhatsApp"
            >
              <Phone className="w-5 h-5" />
            </a>
            <a
              href="https://www.instagram.com/ciclismoreybaud/"
              className="w-10 h-10 rounded-full bg-cyan flex items-center justify-center hover:scale-110 transition"
              target="_blank" rel="noreferrer" aria-label="Instagram"
            >
              <Instagram className="w-5 h-5" />
            </a>
          </div>
        </div>
      </section>

      {/* PRECIO + INSCRIPCIÓN */}
      <section id="inscripcion" className="py-16">
        <div className="container mx-auto px-4 sm:px-6 max-w-4xl">
          <h2 className="font-heading text-3xl sm:text-4xl text-primary mb-8">Precio</h2>

          {stageVigente ? (
            <div className="grid sm:grid-cols-3 gap-3 mb-8">
              {program.stages.map((s) => (
                <div
                  key={s.id}
                  className={`p-4 rounded-xl border ${
                    s.vigente
                      ? "border-primary bg-primary/5 shadow-lg"
                      : "border-border bg-card opacity-60"
                  }`}
                >
                  <p className="text-xs uppercase tracking-wide font-semibold text-muted-foreground mb-2">
                    {s.nombre}
                  </p>
                  <p className="text-2xl font-heading">{fmtMoney(Number(s.precio))}</p>
                  {s.precio_cuota && s.cuotas_cantidad && (
                    <p className="text-sm text-muted-foreground mt-1">
                      ó {s.cuotas_cantidad} cuotas de {fmtMoney(Number(s.precio_cuota))}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-2">
                    {fmtDate(s.fecha_desde)} — {fmtDate(s.fecha_hasta)}
                  </p>
                  {s.vigente && (
                    <p className="text-xs text-primary font-bold mt-2 uppercase tracking-wide">Vigente ahora</p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="p-6 rounded-xl border border-destructive/40 bg-destructive/5 mb-8 text-center">
              <p className="text-lg font-semibold">Las inscripciones para esta edición están cerradas.</p>
              <p className="text-sm text-muted-foreground mt-2">Escribinos por WhatsApp para la próxima edición.</p>
            </div>
          )}

          {inscripcionesAbiertas && !transferSent && (
            <div className="p-6 sm:p-8 rounded-2xl border border-border bg-card">
              <h3 className="font-heading text-2xl mb-2">Completá el formulario y confirmá tu inscripción</h3>
              <p className="text-sm text-muted-foreground mb-6">
                Elegí modalidad y método de pago. Una vez acreditado, recibís por email toda la información de inicio.
              </p>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="nombre">Nombre *</Label>
                    <Input
                      id="nombre" required maxLength={80}
                      value={form.nombre}
                      onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="apellido">Apellido *</Label>
                    <Input
                      id="apellido" required maxLength={80}
                      value={form.apellido}
                      onChange={(e) => setForm((f) => ({ ...f, apellido: e.target.value }))}
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="email">Correo *</Label>
                  <Input
                    id="email" type="email" required maxLength={255}
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="telefono">WhatsApp</Label>
                  <Input
                    id="telefono" type="tel" maxLength={30}
                    placeholder="+54 9 11 ..."
                    value={form.telefono}
                    onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))}
                  />
                </div>

                <div>
                  <Label>Modalidad</Label>
                  <div className="grid sm:grid-cols-2 gap-3 mt-2">
                    <button
                      type="button"
                      onClick={() => setModoPago("contado")}
                      className={`p-4 rounded-xl border text-left transition ${
                        modoPago === "contado" ? "border-primary bg-primary/5" : "border-border"
                      }`}
                    >
                      <p className="font-semibold">Un pago</p>
                      <p className="text-xl font-heading mt-1">{fmtMoney(totalAmount)}</p>
                    </button>
                    {stageVigente!.precio_cuota && stageVigente!.cuotas_cantidad && (
                      <button
                        type="button"
                        onClick={() => setModoPago("cuotas")}
                        className={`p-4 rounded-xl border text-left transition ${
                          modoPago === "cuotas" ? "border-primary bg-primary/5" : "border-border"
                        }`}
                      >
                        <p className="font-semibold">{stageVigente!.cuotas_cantidad} cuotas</p>
                        <p className="text-xl font-heading mt-1">
                          {fmtMoney(cuotaAmount)} c/u
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Hoy pagás la cuota 1. La cuota 2 vence el {fmtDate(cuota1Vence)}.
                        </p>
                      </button>
                    )}
                  </div>
                </div>

                <div>
                  <Label>Método de pago</Label>
                  <div className="grid sm:grid-cols-2 gap-3 mt-2">
                    <button
                      type="button"
                      onClick={() => setMetodoPago("mp")}
                      className={`p-4 rounded-xl border text-left transition flex items-start gap-3 ${
                        metodoPago === "mp" ? "border-primary bg-primary/5" : "border-border"
                      }`}
                    >
                      <CreditCard className="w-5 h-5 mt-0.5 text-primary" />
                      <div>
                        <p className="font-semibold">Mercado Pago</p>
                        <p className="text-xs text-muted-foreground mt-1">Tarjeta, débito o dinero en cuenta.</p>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setMetodoPago("transferencia")}
                      className={`p-4 rounded-xl border text-left transition flex items-start gap-3 ${
                        metodoPago === "transferencia" ? "border-primary bg-primary/5" : "border-border"
                      }`}
                    >
                      <Building2 className="w-5 h-5 mt-0.5 text-primary" />
                      <div>
                        <p className="font-semibold">Transferencia bancaria</p>
                        <p className="text-xs text-muted-foreground mt-1">Con validación por el equipo.</p>
                      </div>
                    </button>
                  </div>
                </div>

                {metodoPago === "transferencia" && (
                  <div className="rounded-xl border border-cyan/40 bg-cyan/5 p-4 sm:p-5 space-y-4">
                    <div>
                      <p className="text-sm font-semibold uppercase tracking-wide text-cyan mb-2">
                        Datos para transferir
                      </p>
                      <p className="text-lg font-heading mb-1">
                        Monto a transferir hoy:{" "}
                        <span className="text-primary">
                          {fmtMoney(modoPago === "cuotas" ? cuotaAmount : totalAmount)}
                        </span>
                      </p>
                      {modoPago === "cuotas" && (
                        <p className="text-xs text-muted-foreground mb-3">
                          La cuota 2 ({fmtMoney(cuotaAmount)}) vence el {fmtDate(cuota1Vence)} y podés pagarla desde tu cuenta corriente.
                        </p>
                      )}
                      <div className="space-y-2 text-sm">
                        {[
                          { label: "Titular", value: ESCUELA_TRANSFER_INFO.titular },
                          { label: "CBU", value: ESCUELA_TRANSFER_INFO.cbu },
                          { label: "Alias", value: ESCUELA_TRANSFER_INFO.alias },
                        ].map((row) => (
                          <div key={row.label} className="flex items-center justify-between gap-3 rounded-lg bg-background/70 px-3 py-2">
                            <div className="min-w-0">
                              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{row.label}</p>
                              <p className="font-mono text-sm break-all">{row.value}</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => copy(row.value, row.label)}
                              className="shrink-0 p-2 rounded-md hover:bg-primary/10 text-muted-foreground hover:text-primary transition"
                              aria-label={`Copiar ${row.label}`}
                            >
                              <Copy className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="comprobante">Subí el comprobante *</Label>
                      <input
                        ref={fileRef}
                        id="comprobante"
                        type="file"
                        accept="image/jpeg,image/png,image/webp,application/pdf"
                        className="hidden"
                        onChange={(e) => pickComprobante(e.target.files?.[0] ?? null)}
                      />
                      <button
                        type="button"
                        onClick={() => fileRef.current?.click()}
                        className="mt-2 w-full flex items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-background/60 px-4 py-3 text-sm hover:border-primary hover:text-primary transition"
                      >
                        <Upload className="w-4 h-4" />
                        {comprobante ? comprobante.name : "Seleccionar imagen o PDF"}
                      </button>
                      <p className="text-[11px] text-muted-foreground mt-1">
                        JPG, PNG, WEBP o PDF · máx {MAX_COMPROBANTE_MB} MB.
                      </p>
                    </div>
                  </div>
                )}

                <Button type="submit" size="lg" className="w-full" disabled={submitting}>
                  {submitting ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Procesando…</>
                  ) : metodoPago === "transferencia" ? (
                    "Enviar comprobante y reservar mi lugar"
                  ) : (
                    "Ir a pagar y asegurar mi lugar"
                  )}
                </Button>

                <p className="text-xs text-muted-foreground text-center">
                  Al inscribirte aceptás los <Link to="/politica-privacidad" className="underline">términos y política de privacidad</Link>.
                </p>
              </form>
            </div>
          )}

          {transferSent && (
            <div className="p-6 sm:p-8 rounded-2xl border border-cyan/40 bg-cyan/5 text-center">
              <CheckCircle2 className="w-12 h-12 text-cyan mx-auto mb-3" />
              <h3 className="font-heading text-2xl mb-2">¡Recibimos tu comprobante!</h3>
              <p className="text-muted-foreground max-w-md mx-auto">
                Vamos a validarlo en las próximas horas y te confirmamos por email tu lugar en el programa.
                {modoPago === "cuotas" && (
                  <>
                    {" "}La cuota 2 quedó registrada en tu cuenta corriente con vencimiento el {fmtDate(cuota1Vence)}.
                  </>
                )}
              </p>
            </div>
          )}
        </div>
      </section>

      <footer className="py-8 border-t border-border/40 text-center text-sm text-muted-foreground">
        <p>© {new Date().getFullYear()} Ciclismo Reybaud · Programa de Iniciación 2026/2</p>
      </footer>
    </div>
  );
}
