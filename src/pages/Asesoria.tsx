import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowLeft, Star, User, Send, MessageCircle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import logo from "@/assets/logo.png";

type TipoAsesoria = "personalizada_expertos" | "personalizada_claudio";

interface Plan {
  id: string;
  nombre: string;
  descripcion_corta: string | null;
  descripcion: string | null;
  precio: number;
  moneda: string;
  frecuencia: string;
}

const formatPrice = (precio: number, moneda: string) => {
  if (moneda === "USD") return `USD $${precio}`;
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(precio);
};

const asesoriaFeatures: Record<string, string[]> = {
  "Asesoría Personalizada Team": [
    "Asesoramiento personalizado",
    "Seguimiento semanal del team",
    "Ajustes según tu progreso",
    "Soporte directo por WhatsApp",
  ],
  "Asesoría Personalizada Claudio": [
    "Asesoría 100% personalizada",
    "Dirección de Claudio Reybaud",
    "Análisis de rendimiento",
    "Comunicación directa",
  ],
};

const Asesoria = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [tipoSeleccionado, setTipoSeleccionado] = useState<TipoAsesoria | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [planesGrupales, setPlanesGrupales] = useState<Plan[]>([]);
  const [planesAsesoria, setPlanesAsesoria] = useState<Plan[]>([]);

  const [form, setForm] = useState({
    nombre_completo: "",
    email: "",
    whatsapp: "",
    fecha_nacimiento: "",
    descripcion: "",
  });

  useEffect(() => {
    supabase
      .from("planes")
      .select("id, nombre, descripcion_corta, descripcion, precio, moneda, frecuencia")
      .eq("activo", true)
      .eq("visibilidad", "visible")
      .order("precio", { ascending: false })
      .then(({ data }) => {
        const all = (data as Plan[]) || [];
        // Separate asesoría plans from group plans
        const asesoria = all.filter((p) =>
          p.nombre.toLowerCase().includes("asesoría") || p.nombre.toLowerCase().includes("asesoria")
        );
        const grupales = all.filter(
          (p) => !p.nombre.toLowerCase().includes("asesoría") && !p.nombre.toLowerCase().includes("asesoria")
        );
        setPlanesAsesoria(asesoria);
        setPlanesGrupales(grupales);
        setLoading(false);
      });
  }, []);

  const handlePostularme = (tipo: TipoAsesoria) => {
    setTipoSeleccionado(tipo);
    setDialogOpen(true);
  };

  const handleChange = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tipoSeleccionado) return;
    setSubmitting(true);

    const { error } = await supabase.from("postulaciones_asesoria").insert({
      tipo_asesoria: tipoSeleccionado,
      nombre_completo: form.nombre_completo.trim(),
      email: form.email.trim().toLowerCase(),
      whatsapp: form.whatsapp.trim(),
      fecha_nacimiento: form.fecha_nacimiento || null,
      descripcion: form.descripcion.trim() || null,
    });

    setSubmitting(false);

    if (error) {
      toast({ title: "Error", description: "No se pudo enviar tu postulación. Intentá de nuevo.", variant: "destructive" });
      return;
    }

    toast({ title: "¡Postulación enviada!", description: "Nos comunicaremos con vos a la brevedad." });
    setDialogOpen(false);
    setForm({ nombre_completo: "", email: "", whatsapp: "", fecha_nacimiento: "", descripcion: "" });
  };

  const selectedAsesoria = planesAsesoria.find((p) =>
    tipoSeleccionado === "personalizada_claudio"
      ? p.nombre.toLowerCase().includes("claudio")
      : p.nombre.toLowerCase().includes("team")
  );
  const tituloServicio = selectedAsesoria
    ? `${selectedAsesoria.nombre} — ${selectedAsesoria.descripcion_corta || ""}`
    : "";

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="max-w-5xl mx-auto space-y-12 animate-fade-in">
        {/* Header */}
        <div className="text-center space-y-3">
          <img src={logo} alt="Ciclismo Reybaud" className="w-20 h-20 mx-auto mb-2" />
          <h1 className="text-3xl font-heading font-bold uppercase tracking-wider text-foreground">
            Servicios & Valores
          </h1>
          <p className="text-muted-foreground text-sm max-w-lg mx-auto">
            Encontrá el plan que mejor se adapte a tus objetivos deportivos
          </p>
        </div>

        {/* Planes grupales */}
        {planesGrupales.length > 0 && (
          <section className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {planesGrupales.map((plan) => (
                <div key={plan.id} className="glass-card rounded-lg p-5 space-y-3 text-center">
                  <h3 className="font-heading font-semibold uppercase tracking-wider text-sm text-foreground">
                    {plan.nombre}
                  </h3>
                  <p className="text-xs text-muted-foreground">{plan.descripcion_corta || plan.descripcion}</p>
                  <p className="text-2xl font-heading font-bold gold-text-gradient">
                    {formatPrice(plan.precio, plan.moneda)}
                  </p>
                  <span className="text-xs text-muted-foreground">/mes</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Asesorías personalizadas */}
        {planesAsesoria.length > 0 && (
          <section className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
              {planesAsesoria.map((plan) => {
                const isClaudio = plan.nombre.toLowerCase().includes("claudio");
                const tipo: TipoAsesoria = isClaudio ? "personalizada_claudio" : "personalizada_expertos";
                const features = asesoriaFeatures[plan.nombre] || [
                  "Asesoramiento personalizado",
                  "Seguimiento continuo",
                  "Soporte directo",
                ];

                return (
                  <div
                    key={plan.id}
                    className={`relative glass-card rounded-lg p-6 space-y-5 flex flex-col ${
                      isClaudio ? "ring-2 ring-primary card-glow" : ""
                    }`}
                  >
                    {isClaudio && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full gold-gradient text-xs font-heading font-semibold uppercase tracking-wider text-primary-foreground flex items-center gap-1">
                        <Star className="w-3 h-3" />
                        Premium
                      </div>
                    )}

                    <div className="space-y-1 text-center">
                      <h3 className="font-heading font-semibold uppercase tracking-wider text-foreground">
                        {plan.nombre.replace(" Team", "").replace(" Claudio", "")}
                      </h3>
                      <p className="text-sm text-muted-foreground flex items-center justify-center gap-1.5">
                        <User className="w-3.5 h-3.5" />
                        {plan.descripcion_corta}
                      </p>
                    </div>

                    <div className="text-center">
                      <span className="text-3xl font-heading font-bold gold-text-gradient">
                        {formatPrice(plan.precio, plan.moneda)}
                      </span>
                      <span className="text-muted-foreground text-sm"> /mes</span>
                    </div>

                    <ul className="space-y-2 flex-1">
                      {features.map((f) => (
                        <li key={f} className="flex items-start gap-2 text-sm text-secondary-foreground">
                          <span className="text-primary mt-0.5">✓</span>
                          {f}
                        </li>
                      ))}
                    </ul>

                    <Button
                      variant={isClaudio ? "gold" : "gold-outline"}
                      className="w-full"
                      onClick={() => handlePostularme(tipo)}
                    >
                      Postularme
                      <Send className="w-4 h-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Back link */}
        <div className="text-center">
          <button
            onClick={() => navigate("/")}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
          >
            <ArrowLeft className="w-3 h-3" />
            Volver al inicio
          </button>
        </div>
      </div>

      {/* Form dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="font-heading uppercase tracking-wider text-foreground text-center">
              Postulación
            </DialogTitle>
            <p className="text-xs text-muted-foreground text-center">{tituloServicio}</p>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Nombre completo *</label>
              <Input
                required
                value={form.nombre_completo}
                onChange={(e) => handleChange("nombre_completo", e.target.value)}
                placeholder="Tu nombre completo"
                className="bg-secondary border-border"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Email *</label>
              <Input
                type="email"
                required
                value={form.email}
                onChange={(e) => handleChange("email", e.target.value)}
                placeholder="tu@email.com"
                className="bg-secondary border-border"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">WhatsApp *</label>
              <Input
                type="tel"
                required
                value={form.whatsapp}
                onChange={(e) => handleChange("whatsapp", e.target.value)}
                placeholder="+54 9 11 1234 5678"
                className="bg-secondary border-border"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Fecha de nacimiento</label>
              <Input
                type="date"
                value={form.fecha_nacimiento}
                onChange={(e) => handleChange("fecha_nacimiento", e.target.value)}
                className="bg-secondary border-border"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Contanos un poco sobre vos
              </label>
              <Textarea
                value={form.descripcion}
                onChange={(e) => handleChange("descripcion", e.target.value)}
                placeholder="¿Qué venís haciendo deportivamente? ¿Qué buscás? ¿Tenés objetivos específicos?"
                rows={4}
                className="bg-secondary border-border resize-none"
              />
            </div>

            <Button type="submit" variant="gold" className="w-full" disabled={submitting}>
              {submitting ? "Enviando..." : "Enviar postulación"}
              <Send className="w-4 h-4" />
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      {/* WhatsApp floating button */}
      <a
        href="https://wa.me/5491140312299?text=Hola%2C%20quiero%20consultar%20sobre%20los%20servicios"
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-[#25D366] hover:bg-[#1ebe57] text-white rounded-full px-5 py-3 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105"
      >
        <MessageCircle className="w-5 h-5" />
        <span className="text-sm font-medium">Consultanos</span>
      </a>
    </div>
  );
};

export default Asesoria;
