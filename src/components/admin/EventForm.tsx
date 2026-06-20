import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  GraduationCap,
  Trophy,
  Mountain,
  ArrowLeft,
  Link2,
  Copy as CopyIcon,
  ExternalLink,
} from "lucide-react";
import { getPublicEventLink, getStudentEventLink, copyToClipboard } from "@/lib/eventLinks";
import { EventInstallmentsEditor } from "./EventInstallmentsEditor";
import { EventAddonsEditor } from "./EventAddonsEditor";
import { EventPackagesEditor } from "./EventPackagesEditor";
import { REGLAMENTO_DEFAULTS_CAMP_VIAJE, isCampOrViajeType } from "@/lib/eventReglamentoDefaults";
import { FileText, Sparkles } from "lucide-react";

/* ─── Types ─── */
export type EventCategory = "escuela" | "carrera" | "camp_viaje";

const categoryCards: {
  key: EventCategory;
  label: string;
  icon: typeof GraduationCap;
  desc: string;
  color: string;
  bg: string;
  ring: string;
  dbType: string;
}[] = [
  {
    key: "escuela",
    label: "Escuela",
    icon: GraduationCap,
    desc: "Clases, reuniones, eventos internos",
    color: "text-sky-300",
    bg: "bg-sky-500/10",
    ring: "ring-sky-500/50",
    dbType: "otro",
  },
  {
    key: "carrera",
    label: "Carrera",
    icon: Trophy,
    desc: "Carreras y competencias externas",
    color: "text-orange-300",
    bg: "bg-orange-500/10",
    ring: "ring-orange-500/50",
    dbType: "carrera",
  },
  {
    key: "camp_viaje",
    label: "Camp / Viaje",
    icon: Mountain,
    desc: "Camps, viajes y training camps",
    color: "text-violet-300",
    bg: "bg-violet-500/10",
    ring: "ring-violet-500/50",
    dbType: "camp",
  },
];

const categoryFromDbType = (t: string): EventCategory => {
  if (["record_hora", "otro"].includes(t)) return "escuela";
  if (t === "carrera") return "carrera";
  return "camp_viaje";
};

export interface EventFormData {
  // Common
  title: string;
  short_description: string;
  description: string;
  date: string;
  start_time: string;
  same_day: boolean;
  end_date: string;
  end_time: string;
  status: string;
  visible_to_students: boolean;
  show_public: boolean;
  type: string; // db enum
  image_url: string;
  payment_mode: "cuotas" | "simple";
  // metadata (JSONB)
  metadata: Record<string, any>;
}

const emptyForm: EventFormData = {
  title: "",
  short_description: "",
  description: "",
  date: "",
  start_time: "",
  same_day: true,
  end_date: "",
  end_time: "",
  status: "borrador",
  visible_to_students: true,
  show_public: false,
  type: "otro",
  image_url: "",
  payment_mode: "cuotas",
  metadata: {},
};

interface EventFormProps {
  initialData?: EventFormData;
  isEditing?: boolean;
  saving: boolean;
  onSave: (data: EventFormData) => void;
  onCancel: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
  eventId?: string;
}

export const eventFormFromRow = (ev: any): EventFormData => ({
  title: ev.title || "",
  short_description: ev.short_description || "",
  description: ev.description || "",
  date: ev.date || "",
  start_time: ev.start_time || "",
  same_day: ev.same_day ?? (!ev.end_date || ev.end_date === ev.date),
  end_date: ev.end_date || "",
  end_time: ev.end_time || "",
  status: ev.status || "borrador",
  visible_to_students: ev.visible_to_students ?? true,
  show_public: ev.show_public ?? false,
  type: ev.type || "otro",
  image_url: ev.image_url || "",
  payment_mode: (ev.payment_mode === "simple" ? "simple" : "cuotas"),
  metadata: ev.metadata || {},
});

export const eventFormToPayload = (form: EventFormData) => {
  const m = form.metadata;
  return {
    title: form.title,
    short_description: form.short_description || null,
    description: form.description || null,
    date: form.date,
    start_time: form.start_time || null,
    same_day: form.same_day,
    end_date: form.same_day ? form.date : form.end_date || null,
    end_time: form.end_time || null,
    status: form.status,
    is_active: form.status === "publicado",
    visible_to_students: form.visible_to_students,
    show_public: form.show_public,
    type: form.type,
    image_url: form.image_url || null,
    metadata: form.metadata,
    payment_mode: form.payment_mode,
    location: m.location_name || m.race_location || m.destination || null,
    price: m.pricing_mode === "no_mostrar" ? null
      : m.pricing_mode === "gratuito" ? 0
      : m.price != null && m.price !== "" ? parseFloat(m.price) : null,
    currency: m.currency || "ARS",
    max_capacity: m.max_capacity ? parseInt(m.max_capacity) : null,
    level: m.recommended_level || m.level || null,
    is_own_event: m.event_nature !== "externo_informativo",
  };
};

/* ─── Component ─── */
const EventForm = ({
  initialData,
  isEditing = false,
  saving,
  onSave,
  onCancel,
  onDuplicate,
  onDelete,
  eventId,
}: EventFormProps) => {
  const [form, setForm] = useState<EventFormData>(initialData || emptyForm);
  const [selectedCategory, setSelectedCategory] = useState<EventCategory | null>(
    initialData ? categoryFromDbType(initialData.type) : null
  );
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Solo se permiten archivos de imagen.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("La imagen no puede superar los 5MB.");
      return;
    }

    setUploading(true);
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${crypto.randomUUID()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("event-images")
      .upload(path, file, { upsert: true });

    if (uploadError) {
      toast.error("Error al subir la imagen.");
      setUploading(false);
      return;
    }

    const { data: publicUrl } = supabase.storage
      .from("event-images")
      .getPublicUrl(path);

    setForm((prev) => ({ ...prev, image_url: publicUrl.publicUrl }));
    toast.success("Imagen subida correctamente.");
    setUploading(false);
  };

  const handleRemoveImage = () => {
    setForm((prev) => ({ ...prev, image_url: "" }));
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const updateMeta = (key: string, value: any) =>
    setForm((prev) => ({ ...prev, metadata: { ...prev.metadata, [key]: value } }));

  const meta = form.metadata;

  // Step 1: Category selection (only for new events)
  if (!selectedCategory) {
    return (
      <div className="space-y-6">
        <div className="text-center space-y-1">
          <h3 className="font-heading text-lg font-semibold uppercase tracking-wider">
            ¿Qué tipo de evento querés crear?
          </h3>
          <p className="text-sm text-muted-foreground">Seleccioná el tipo para ver los campos específicos</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {categoryCards.map((cat) => (
            <button
              key={cat.key}
              onClick={() => {
                setSelectedCategory(cat.key);
                setForm((prev) => ({ ...prev, type: cat.dbType }));
              }}
              className={`group p-6 rounded-xl border border-border/50 ${cat.bg} hover:ring-2 ${cat.ring} transition-all text-center space-y-3`}
            >
              <cat.icon className={`w-10 h-10 mx-auto ${cat.color} group-hover:scale-110 transition-transform`} />
              <div className={`font-heading font-semibold uppercase tracking-wider ${cat.color}`}>{cat.label}</div>
              <p className="text-xs text-muted-foreground">{cat.desc}</p>
            </button>
          ))}
        </div>
        <div className="flex justify-center">
          <Button variant="outline" onClick={onCancel}>Cancelar</Button>
        </div>
      </div>
    );
  }

  const cat = categoryCards.find((c) => c.key === selectedCategory)!;

  return (
    <div className="space-y-5">
      {/* Category header */}
      <div className="flex items-center gap-3">
        {!isEditing && (
          <Button variant="ghost" size="sm" onClick={() => setSelectedCategory(null)} className="gap-1 text-xs">
            <ArrowLeft className="w-3 h-3" /> Cambiar tipo
          </Button>
        )}
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${cat.bg}`}>
          <cat.icon className={`w-4 h-4 ${cat.color}`} />
          <span className={`text-sm font-heading font-semibold uppercase tracking-wider ${cat.color}`}>{cat.label}</span>
        </div>
      </div>

      {/* ─── COMMON FIELDS ─── */}
      <fieldset className="space-y-4 border border-border/30 rounded-lg p-4">
        <legend className="text-xs font-heading uppercase tracking-wider text-muted-foreground px-2">Datos generales</legend>

        <div className="space-y-1.5">
          <Label>Nombre del evento *</Label>
          <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Nombre del evento" />
        </div>

        <div className="space-y-1.5">
          <Label>Descripción corta</Label>
          <Input value={form.short_description} onChange={(e) => setForm({ ...form, short_description: e.target.value })} placeholder="Resumen breve para cards" />
        </div>

        <div className="space-y-1.5">
          <Label>Descripción completa</Label>
          <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Fecha de inicio *</Label>
            <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Hora de inicio</Label>
            <Input type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
          </div>
        </div>

        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border/50">
          <Switch checked={form.same_day} onCheckedChange={(v) => setForm({ ...form, same_day: v, end_date: v ? "" : form.end_date })} />
          <Label className="text-sm">Empieza y termina el mismo día</Label>
        </div>

        {!form.same_day && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Fecha de finalización</Label>
              <Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} min={form.date} />
            </div>
            <div className="space-y-1.5">
              <Label>Hora de finalización</Label>
              <Input type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} />
            </div>
          </div>
        )}

        {form.same_day && (
          <div className="space-y-1.5">
            <Label>Hora de finalización</Label>
            <Input type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} />
          </div>
        )}

        <div className="space-y-2">
          <Label>Imagen del evento</Label>
          {form.image_url ? (
            <div className="relative rounded-lg overflow-hidden border border-border">
              <img
                src={form.image_url}
                alt="Preview"
                className="w-full h-40 object-cover"
              />
              <button
                type="button"
                onClick={handleRemoveImage}
                className="absolute top-2 right-2 bg-background/80 backdrop-blur rounded-full p-1.5 hover:bg-destructive/80 transition-colors"
              >
                <span className="text-xs font-medium text-foreground">✕</span>
              </button>
            </div>
          ) : (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
            >
              <p className="text-sm text-muted-foreground">
                {uploading ? "Subiendo..." : "Hacé clic para subir una imagen"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">JPG, PNG, WEBP — máx. 5MB</p>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            className="hidden"
          />
          <Input
            value={form.image_url}
            onChange={(e) => setForm({ ...form, image_url: e.target.value })}
            placeholder="O pegá una URL directa..."
            className="text-xs"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Estado</Label>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="borrador">Borrador</SelectItem>
                <SelectItem value="publicado">Publicado</SelectItem>
                <SelectItem value="finalizado">Finalizado</SelectItem>
                <SelectItem value="cancelado">Cancelado</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <Switch checked={form.visible_to_students} onCheckedChange={(v) => setForm({ ...form, visible_to_students: v })} />
            <Label className="text-sm">Mostrar en la app</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={form.show_public} onCheckedChange={(v) => setForm({ ...form, show_public: v })} />
            <Label className="text-sm">Vista pública</Label>
          </div>
        </div>
      </fieldset>

      {/* ─── EVENT NATURE & PRICING (common) ─── */}
      <fieldset className="space-y-4 border border-primary/20 rounded-lg p-4">
        <legend className="text-xs font-heading uppercase tracking-wider text-primary px-2">Naturaleza y Precio</legend>

        <div className="space-y-1.5">
          <Label>¿Cómo se gestiona este evento?</Label>
          <Select
            value={meta.event_nature || "propio_con_reserva"}
            onValueChange={(v) => updateMeta("event_nature", v)}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="propio_con_reserva">Organizado por nosotros — con reserva</SelectItem>
              <SelectItem value="propio_solo_inscripcion">Organizado por nosotros — solo inscripción</SelectItem>
              <SelectItem value="propio_informativo">Organizado por nosotros — solo informativo</SelectItem>
              <SelectItem value="externo_informativo">Evento externo — informamos porque es de interés</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {meta.event_nature === "propio_con_reserva" && "Los alumnos podrán reservar su lugar y deberán realizar un pago o seña."}
            {meta.event_nature === "propio_solo_inscripcion" && "Los alumnos se inscriben sin necesidad de pagar. Solo confirman asistencia."}
            {meta.event_nature === "propio_informativo" && "Se muestra en el calendario pero no se puede reservar ni inscribirse."}
            {meta.event_nature === "externo_informativo" && "El organizador es externo. Se muestra como referencia para nuestros alumnos."}
            {!meta.event_nature && "Los alumnos podrán reservar su lugar y deberán realizar un pago o seña."}
          </p>
        </div>

        <div className="space-y-1.5">
          <Label>Precio del evento</Label>
          <Select
            value={meta.pricing_mode || "no_mostrar"}
            onValueChange={(v) => {
              updateMeta("pricing_mode", v);
              if (v === "gratuito") { updateMeta("price", "0"); updateMeta("is_free", true); updateMeta("deposit_amount", ""); }
              else if (v === "no_mostrar") { updateMeta("price", ""); updateMeta("is_free", false); }
              else { updateMeta("is_free", false); }
            }}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="con_valor">Con valor (mostrar precio)</SelectItem>
              <SelectItem value="gratuito">Gratuito</SelectItem>
              <SelectItem value="no_mostrar">No mostrar precio</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {meta.pricing_mode === "con_valor" && (
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Precio</Label>
              <Input type="number" value={meta.price || ""} onChange={(e) => updateMeta("price", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Moneda</Label>
              <Select value={meta.currency || "ARS"} onValueChange={(v) => updateMeta("currency", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ARS">ARS</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Seña / Reserva</Label>
              <Input type="number" value={meta.deposit_amount || ""} onChange={(e) => updateMeta("deposit_amount", e.target.value)} />
            </div>
          </div>
        )}

        {meta.pricing_mode === "con_valor" && (
          <div className="space-y-3 pt-2 border-t border-border/30">
            <div className="space-y-1.5">
              <Label>Modo de cobranza</Label>
              <Select
                value={form.payment_mode}
                onValueChange={(v: "cuotas" | "simple") => setForm({ ...form, payment_mode: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cuotas">Plan de cuotas (fechas y montos predefinidos)</SelectItem>
                  <SelectItem value="simple">Cobranza simple (pagos manuales, sin cuotas)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {form.payment_mode === "simple"
                  ? "Cada pago se carga manualmente o se valida cuando el participante lo informa. Sin plan de cuotas predefinido."
                  : "Se define un plan de cuotas con fechas y montos. Cada pago se imputa a su cuota."}
              </p>
            </div>

            {form.payment_mode === "cuotas" && (
              eventId ? (
                <EventInstallmentsEditor
                  eventId={eventId}
                  eventCurrency={meta.currency || "ARS"}
                  eventPrice={meta.price ? parseFloat(meta.price) : null}
                />
              ) : (
                <p className="text-xs text-muted-foreground italic">
                  Guardá el evento primero para configurar el plan de cuotas.
                </p>
              )
            )}

            {selectedCategory === "camp_viaje" && (
              <div className="pt-2 border-t border-border/30">
                {eventId ? (
                  <EventPackagesEditor eventId={eventId} eventCurrency={meta.currency || "ARS"} />
                ) : (
                  <p className="text-xs text-muted-foreground italic">
                    Guardá el evento primero para configurar paquetes (tipos de habitación con precios diferenciados).
                  </p>
                )}
              </div>
            )}

            <div className="pt-2 border-t border-border/30">
              {eventId ? (
                <EventAddonsEditor eventId={eventId} eventCurrency={meta.currency || "ARS"} />
              ) : (
                <p className="text-xs text-muted-foreground italic">
                  Guardá el evento primero para configurar extras (habitación individual, alquiler de bicicleta, etc.).
                </p>
              )}
            </div>
          </div>
        )}
      </fieldset>

      {/* ─── ESCUELA FIELDS ─── */}
      {selectedCategory === "escuela" && (
        <fieldset className="space-y-4 border border-sky-500/20 rounded-lg p-4">
          <legend className="text-xs font-heading uppercase tracking-wider text-sky-400 px-2">Campos Escuela</legend>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Subtipo</Label>
              <Select value={meta.school_subtype || ""} onValueChange={(v) => updateMeta("school_subtype", v)}>
                <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="reunion_online">Reunión online</SelectItem>
                  <SelectItem value="reunion_presencial">Reunión presencial</SelectItem>
                  <SelectItem value="clase_tecnica">Clase técnica</SelectItem>
                  <SelectItem value="evento_escuela">Evento escuela</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Modalidad</Label>
              <Select value={meta.modality || ""} onValueChange={(v) => updateMeta("modality", v)}>
                <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="online">Online</SelectItem>
                  <SelectItem value="presencial">Presencial</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {meta.modality === "online" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Link de acceso</Label>
                <Input value={meta.meeting_url || ""} onChange={(e) => updateMeta("meeting_url", e.target.value)} placeholder="https://meet.google.com/..." />
              </div>
              <div className="space-y-1.5">
                <Label>Plataforma</Label>
                <Select value={meta.platform || ""} onValueChange={(v) => updateMeta("platform", v)}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="google_meet">Google Meet</SelectItem>
                    <SelectItem value="zoom">Zoom</SelectItem>
                    <SelectItem value="otra">Otra</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {meta.modality === "presencial" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Sede / Lugar</Label>
                <Input value={meta.location_name || ""} onChange={(e) => updateMeta("location_name", e.target.value)} placeholder="Ej: KDT Palermo" />
              </div>
              <div className="space-y-1.5">
                <Label>Dirección</Label>
                <Input value={meta.address || ""} onChange={(e) => updateMeta("address", e.target.value)} />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Profesor / Responsable</Label>
              <Input value={meta.coach_name || ""} onChange={(e) => updateMeta("coach_name", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Cupo máximo</Label>
              <Input type="number" value={meta.max_capacity || ""} onChange={(e) => updateMeta("max_capacity", e.target.value)} placeholder="∞" />
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Switch checked={meta.requires_registration || false} onCheckedChange={(v) => updateMeta("requires_registration", v)} />
              <Label className="text-sm">Requiere inscripción</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={meta.active_students_only || false} onCheckedChange={(v) => updateMeta("active_students_only", v)} />
              <Label className="text-sm">Solo alumnos activos</Label>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Material o indicaciones previas</Label>
            <Textarea value={meta.notes || ""} onChange={(e) => updateMeta("notes", e.target.value)} rows={2} />
          </div>
          <div className="space-y-1.5">
            <Label>Qué llevar</Label>
            <Textarea value={meta.items_to_bring || ""} onChange={(e) => updateMeta("items_to_bring", e.target.value)} rows={2} />
          </div>
        </fieldset>
      )}

      {/* ─── CARRERA FIELDS ─── */}
      {selectedCategory === "carrera" && (
        <fieldset className="space-y-4 border border-orange-500/20 rounded-lg p-4">
          <legend className="text-xs font-heading uppercase tracking-wider text-orange-400 px-2">Campos Carrera</legend>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Organizador</Label>
              <Input value={meta.organizer || ""} onChange={(e) => updateMeta("organizer", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Lugar</Label>
              <Input value={meta.race_location || ""} onChange={(e) => updateMeta("race_location", e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Ciudad</Label>
              <Input value={meta.city || ""} onChange={(e) => updateMeta("city", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Web oficial</Label>
              <Input value={meta.official_website || ""} onChange={(e) => updateMeta("official_website", e.target.value)} placeholder="https://..." />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Link de inscripción</Label>
              <Input value={meta.registration_url || ""} onChange={(e) => updateMeta("registration_url", e.target.value)} placeholder="https://..." />
            </div>
            <div className="space-y-1.5">
              <Label>Fecha límite inscripción</Label>
              <Input type="date" value={meta.registration_deadline || ""} onChange={(e) => updateMeta("registration_deadline", e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Distancias / Categorías</Label>
            <Input value={meta.race_distances || ""} onChange={(e) => updateMeta("race_distances", e.target.value)} placeholder="Ej: 60km, 100km, 200km" />
          </div>

          <div className="space-y-1.5">
            <Label>Reglamento</Label>
            <Textarea value={meta.rules_text || ""} onChange={(e) => updateMeta("rules_text", e.target.value)} rows={2} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Valor inscripción</Label>
              <Input value={meta.registration_price || ""} onChange={(e) => updateMeta("registration_price", e.target.value)} placeholder="Ej: $15.000" />
            </div>
            <div className="space-y-1.5">
              <Label>Tipo de licencia</Label>
              <Input value={meta.license_type || ""} onChange={(e) => updateMeta("license_type", e.target.value)} placeholder="Ej: UCI, Nacional" />
            </div>
          </div>

          <div className="flex items-center gap-6 flex-wrap">
            <div className="flex items-center gap-2">
              <Switch checked={meta.requires_license || false} onCheckedChange={(v) => updateMeta("requires_license", v)} />
              <Label className="text-sm">Requiere licencia</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={meta.is_goal_race || false} onCheckedChange={(v) => updateMeta("is_goal_race", v)} />
              <Label className="text-sm">Carrera objetivo</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={meta.staff_present || false} onCheckedChange={(v) => updateMeta("staff_present", v)} />
              <Label className="text-sm">Staff Reybaud</Label>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Observaciones</Label>
            <Textarea value={meta.extra_notes || ""} onChange={(e) => updateMeta("extra_notes", e.target.value)} rows={2} />
          </div>
        </fieldset>
      )}

      {/* ─── CAMP / VIAJE FIELDS ─── */}
      {selectedCategory === "camp_viaje" && (
        <fieldset className="space-y-4 border border-violet-500/20 rounded-lg p-4">
          <legend className="text-xs font-heading uppercase tracking-wider text-violet-400 px-2">Campos Camp / Viaje</legend>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Subtipo</Label>
              <Select value={meta.trip_subtype || ""} onValueChange={(v) => {
                updateMeta("trip_subtype", v);
                setForm((prev) => ({ ...prev, type: v === "viaje" ? "viaje" : "camp" }));
              }}>
                <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="camp">Camp</SelectItem>
                  <SelectItem value="viaje">Viaje</SelectItem>
                  <SelectItem value="training_camp">Training Camp</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Destino</Label>
              <Input value={meta.destination || ""} onChange={(e) => updateMeta("destination", e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>País / Provincia</Label>
              <Input value={meta.country || ""} onChange={(e) => updateMeta("country", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Ciudad</Label>
              <Input value={meta.city || ""} onChange={(e) => updateMeta("city", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Alojamiento</Label>
              <Input value={meta.lodging_name || ""} onChange={(e) => updateMeta("lodging_name", e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Web / Landing</Label>
              <Input value={meta.info_url || ""} onChange={(e) => updateMeta("info_url", e.target.value)} placeholder="https://..." />
            </div>
            <div className="space-y-1.5">
              <Label>Link de reserva</Label>
              <Input value={meta.booking_url || ""} onChange={(e) => updateMeta("booking_url", e.target.value)} placeholder="https://..." />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Cupos totales</Label>
              <Input type="number" value={meta.total_spots || ""} onChange={(e) => updateMeta("total_spots", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Cupos disponibles</Label>
              <Input type="number" value={meta.available_spots || ""} onChange={(e) => updateMeta("available_spots", e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Incluye <span className="text-[10px] text-muted-foreground">(uno por línea)</span></Label>
            <Textarea value={meta.included_text || ""} onChange={(e) => updateMeta("included_text", e.target.value)} rows={3} placeholder={"Ej:\nAlojamiento 3 noches\nDesayuno y cena\nGuía técnico"} />
          </div>
          <div className="space-y-1.5">
            <Label>No incluye <span className="text-[10px] text-muted-foreground">(uno por línea)</span></Label>
            <Textarea value={meta.not_included_text || ""} onChange={(e) => updateMeta("not_included_text", e.target.value)} rows={3} placeholder={"Ej:\nTraslados al destino\nBebidas alcohólicas"} />
          </div>

          <div className="space-y-1.5">
            <Label>Reglamento / Condiciones</Label>
            <Textarea value={meta.terms_text || ""} onChange={(e) => updateMeta("terms_text", e.target.value)} rows={2} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Nivel recomendado</Label>
              <Input value={meta.recommended_level || ""} onChange={(e) => updateMeta("recommended_level", e.target.value)} placeholder="Ej: Intermedio" />
            </div>
            <div className="space-y-1.5">
              <Label>Link WhatsApp</Label>
              <Input value={meta.whatsapp_url || ""} onChange={(e) => updateMeta("whatsapp_url", e.target.value)} placeholder="https://wa.me/..." />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Responsable</Label>
              <Input value={meta.responsible_person || ""} onChange={(e) => updateMeta("responsible_person", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Estado comercial</Label>
              <Select value={meta.sales_status || ""} onValueChange={(v) => updateMeta("sales_status", v)}>
                <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="preventa">Preventa</SelectItem>
                  <SelectItem value="a_la_venta">A la venta</SelectItem>
                  <SelectItem value="ultimos_cupos">Últimos cupos</SelectItem>
                  <SelectItem value="completo">Completo</SelectItem>
                  <SelectItem value="finalizado">Finalizado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center gap-6 flex-wrap">
            <div className="flex items-center gap-2">
              <Switch checked={meta.show_whatsapp_button || false} onCheckedChange={(v) => updateMeta("show_whatsapp_button", v)} />
              <Label className="text-sm">Botón WhatsApp</Label>
            </div>
          </div>
        </fieldset>
      )}

      {/* ─── CHECKLIST STEPS (camp_viaje) ─── */}
      {selectedCategory === "camp_viaje" && (() => {
        const ALL_STEPS = [
          { id: "reserva", label: "Reserva realizada", locked: true },
          { id: "extras", label: "Configurar mi viaje (habitación, comidas, extras)" },
          { id: "pago", label: "Informar próximo pago" },
          { id: "bici", label: "Bicicleta y posición" },
          { id: "pedales", label: "Pedales y calas" },
          { id: "pasaje", label: "Pasaje o transporte" },
          { id: "seguro", label: "Seguro viajero" },
        ];
        const enabled: string[] = Array.isArray(meta.checklist_steps)
          ? meta.checklist_steps
          : ALL_STEPS.map(s => s.id);
        const toggle = (id: string, checked: boolean) => {
          const next = checked
            ? Array.from(new Set([...enabled, id]))
            : enabled.filter(x => x !== id);
          if (!next.includes("reserva")) next.unshift("reserva");
          updateMeta("checklist_steps", next);
        };
        return (
          <fieldset className="space-y-3 border border-violet-500/20 rounded-lg p-4">
            <legend className="text-xs font-heading uppercase tracking-wider text-violet-400 px-2">Preparación del viaje</legend>
            <p className="text-xs text-muted-foreground">Elegí qué pasos verá el alumno en su checklist. Desactivá los que no apliquen (ej: si no se alquilan bicis, no pidas medidas).</p>
            <div className="grid grid-cols-1 gap-2">
              {ALL_STEPS.map(s => (
                <div key={s.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/20 border border-border/40">
                  <Switch
                    checked={s.locked || enabled.includes(s.id)}
                    disabled={s.locked}
                    onCheckedChange={(v) => toggle(s.id, v)}
                  />
                  <Label className="text-sm">
                    {s.label}
                    {s.locked && <span className="ml-2 text-[10px] text-muted-foreground">(siempre)</span>}
                  </Label>
                </div>
              ))}
            </div>
          </fieldset>
        );
      })()}

      {/* ─── CANCELLATION POLICY (camp_viaje) ─── */}
      {selectedCategory === "camp_viaje" && (
        <fieldset className="space-y-4 border border-violet-500/20 rounded-lg p-4">
          <legend className="text-xs font-heading uppercase tracking-wider text-violet-400 px-2">Política de cancelación</legend>

          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border/50">
            <Switch checked={meta.allow_cancellation || false} onCheckedChange={(v) => updateMeta("allow_cancellation", v)} />
            <Label className="text-sm">Permitir cancelación por parte del participante</Label>
          </div>

          {meta.allow_cancellation && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Días antes del evento para cancelar</Label>
                  <Input
                    type="number"
                    min="0"
                    value={meta.cancellation_days_before ?? 7}
                    onChange={(e) => updateMeta("cancellation_days_before", parseInt(e.target.value) || 0)}
                    placeholder="Ej: 7"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Tipo de política</Label>
                  <Select value={meta.cancellation_type || "sin_penalidad"} onValueChange={(v) => updateMeta("cancellation_type", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sin_penalidad">Sin penalidad</SelectItem>
                      <SelectItem value="seña_no_reembolsable">Seña no reembolsable</SelectItem>
                      <SelectItem value="credito_a_favor">Crédito a favor</SelectItem>
                      <SelectItem value="sujeta_revision">Sujeta a revisión del equipo</SelectItem>
                      <SelectItem value="personalizada">Personalizada</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Texto breve de política (visible para el participante)</Label>
                <Input
                  value={meta.cancellation_text_short || ""}
                  onChange={(e) => updateMeta("cancellation_text_short", e.target.value)}
                  placeholder="Ej: La seña no es reembolsable."
                />
              </div>

              <div className="space-y-1.5">
                <Label>Texto completo de políticas de cancelación</Label>
                <Textarea
                  value={meta.cancellation_text_full || ""}
                  onChange={(e) => updateMeta("cancellation_text_full", e.target.value)}
                  rows={3}
                  placeholder="Política detallada..."
                />
              </div>

              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border/50">
                <Switch checked={meta.require_cancellation_reason || false} onCheckedChange={(v) => updateMeta("require_cancellation_reason", v)} />
                <Label className="text-sm">Pedir motivo de cancelación</Label>
              </div>
            </>
          )}
        </fieldset>
      )}

      {/* COMPARTIR LINKS */}
      {isEditing && eventId && (
        <fieldset className="space-y-3 p-4 rounded-lg border border-border/50 bg-card/30">
          <legend className="px-2 text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <Link2 className="w-3.5 h-3.5" /> Compartir evento
          </legend>
          {[
            { label: "Link público (landing / WhatsApp)", hint: "Abre el detalle del evento sin necesidad de iniciar sesión.", url: getPublicEventLink(eventId) },
            { label: "Link interno para alumnos", hint: "Lleva al alumno logueado al detalle dentro del dashboard.", url: getStudentEventLink(eventId) },
          ].map((item) => (
            <div key={item.label} className="space-y-1">
              <Label className="text-xs">{item.label}</Label>
              <div className="flex gap-2">
                <Input value={item.url} readOnly onFocus={(e) => e.currentTarget.select()} className="text-xs font-mono" />
                <Button type="button" variant="outline" size="icon" onClick={async () => { const ok = await copyToClipboard(item.url); if (ok) toast.success("Link copiado"); else toast.error("No se pudo copiar"); }} title="Copiar">
                  <CopyIcon className="w-4 h-4" />
                </Button>
                <Button type="button" variant="outline" size="icon" onClick={() => window.open(item.url, "_blank", "noopener")} title="Abrir">
                  <ExternalLink className="w-4 h-4" />
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">{item.hint}</p>
            </div>
          ))}
        </fieldset>
      )}

      {/* ─── ACTION BUTTONS ─── */}
      <div className="flex flex-wrap gap-2 pt-2">
        {isEditing ? (
          <>
            <Button variant="gold" onClick={() => onSave(form)} disabled={saving} className="flex-1">
              {saving ? "Guardando..." : "Guardar cambios"}
            </Button>
            {form.status === "publicado" && (
              <Button variant="outline" onClick={() => { setForm({ ...form, status: "borrador" }); onSave({ ...form, status: "borrador" }); }}>
                Despublicar
              </Button>
            )}
            {onDuplicate && <Button variant="outline" onClick={onDuplicate}>Duplicar</Button>}
            {onDelete && <Button variant="destructive" onClick={onDelete}>Eliminar</Button>}
          </>
        ) : (
          <>
            <Button variant="outline" onClick={() => onSave({ ...form, status: "borrador" })} disabled={saving} className="flex-1">
              Guardar borrador
            </Button>
            <Button variant="gold" onClick={() => onSave({ ...form, status: "publicado" })} disabled={saving} className="flex-1">
              {saving ? "Guardando..." : "Publicar evento"}
            </Button>
          </>
        )}
        <Button variant="ghost" onClick={onCancel}>Cancelar</Button>
      </div>
    </div>
  );
};

export default EventForm;
