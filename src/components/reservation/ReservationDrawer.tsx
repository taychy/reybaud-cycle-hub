import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { formatPrice } from "@/lib/currency";
import {
  CalendarDays, MapPin, Users, Mountain, Loader2, CheckCircle,
  CreditCard, ArrowRight, UserCheck, BedDouble, Check,
} from "lucide-react";
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription,
} from "@/components/ui/drawer";
import type { Tables } from "@/integrations/supabase/types";

type Alumno = Tables<"alumnos">;

interface Event {
  id: string;
  title: string;
  date: string;
  location: string | null;
  price: number | null;
  currency: string;
  level: string | null;
  max_capacity: number | null;
  spots_taken: number;
  type: string;
}

interface PackageRow {
  id: string;
  nombre: string;
  descripcion: string | null;
  precio: number;
  sena: number | null;
  currency: string;
  cupo: number | null;
  activo: boolean;
  sort_order: number;
  used?: number; // reservas activas
}

interface ReservationDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: Event;
  alumno: Alumno;
  onReserved: (reservation: any) => void;
  eventNature?: string;
}

const ReservationDrawer = ({ open, onOpenChange, event, alumno, onReserved, eventNature = "propio_con_reserva" }: ReservationDrawerProps) => {
  const { toast } = useToast();
  const [step, setStep] = useState<"summary" | "package" | "form" | "submitting" | "success">("summary");
  const [notes, setNotes] = useState("");
  const [packages, setPackages] = useState<PackageRow[]>([]);
  const [loadingPackages, setLoadingPackages] = useState(false);
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);

  const isInscriptionOnly = eventNature === "propio_solo_inscripcion";
  const spotsLeft = event.max_capacity != null ? event.max_capacity - event.spots_taken : null;
  const isPaid = event.price != null && event.price > 0;
  const d = new Date(event.date + "T12:00:00");
  const dateStr = d.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });

  // Cargar paquetes cuando abre el drawer (solo si es evento pago con reserva)
  useEffect(() => {
    if (!open || isInscriptionOnly) { setPackages([]); return; }
    let cancelled = false;
    (async () => {
      setLoadingPackages(true);
      const { data } = await supabase
        .from("event_packages" as any)
        .select("*")
        .eq("event_id", event.id)
        .eq("activo", true)
        .order("sort_order", { ascending: true });
      const rows = ((data as unknown as PackageRow[]) || []);
      // Conteo de reservas activas por paquete para cupo
      if (rows.length > 0) {
        const { data: reservas } = await supabase
          .from("event_reservations" as any)
          .select("package_id, reservation_status")
          .eq("event_id", event.id)
          .not("package_id", "is", null);
        const map: Record<string, number> = {};
        ((reservas as any[]) || []).forEach((r) => {
          if (r.reservation_status === "cancelada") return;
          if (!r.package_id) return;
          map[r.package_id] = (map[r.package_id] || 0) + 1;
        });
        rows.forEach((p) => { p.used = map[p.id] || 0; });
      }
      if (!cancelled) setPackages(rows);
      setLoadingPackages(false);
    })();
    return () => { cancelled = true; };
  }, [open, event.id, isInscriptionOnly]);

  const hasPackages = packages.length > 0;
  const selectedPackage = packages.find((p) => p.id === selectedPackageId) || null;

  // Precio efectivo: del paquete elegido, o del evento
  const effectivePrice = selectedPackage ? selectedPackage.precio : event.price;
  const effectiveCurrency = selectedPackage ? selectedPackage.currency : event.currency;

  // Profile completeness
  const missingFields: string[] = [];
  if (!alumno.nombre) missingFields.push("Nombre");
  if (!alumno.apellido) missingFields.push("Apellido");
  if (!alumno.telefono) missingFields.push("Teléfono");

  const labels = isInscriptionOnly
    ? {
        drawerTitle: "Inscripción",
        drawerTitleSuccess: "¡Inscripción confirmada!",
        drawerDesc: event.title,
        drawerDescSuccess: "Tu inscripción fue registrada correctamente.",
        summaryHint: "Estás por inscribirte a este evento. Tu lugar queda confirmado al enviar.",
        confirmBtn: "Confirmar inscripción",
        confirmIcon: UserCheck,
        successTitle: "¡Te inscribiste con éxito!",
        successDesc: "Tu lugar está confirmado. ¡Nos vemos ahí! 🎉",
        successBtn: "Ver mi estado",
        toastTitle: "¡Inscripción confirmada!",
      }
    : {
        drawerTitle: "Reservar lugar",
        drawerTitleSuccess: "¡Reserva enviada!",
        drawerDesc: event.title,
        drawerDescSuccess: "Tu solicitud fue registrada correctamente.",
        summaryHint: 'Estás por iniciar la reserva de este evento. Una vez enviada, vas a poder seguir el estado desde "Mis eventos".',
        confirmBtn: "Confirmar reserva",
        confirmIcon: CreditCard,
        successTitle: "Tu solicitud de reserva fue enviada con éxito.",
        successDesc: 'Ya podés seguir el estado de este evento desde "Mis eventos".',
        successBtn: "Ver mi estado",
        toastTitle: "¡Solicitud de reserva enviada!",
      };

  const goAfterSummary = () => {
    if (hasPackages) setStep("package");
    else setStep("form");
  };

  const goAfterPackage = () => {
    if (!selectedPackageId) {
      toast({ title: "Elegí un paquete para continuar.", variant: "destructive" });
      return;
    }
    setStep("form");
  };

  const handleSubmit = async () => {
    setStep("submitting");

    const reservationStatus = isInscriptionOnly ? "reserva_confirmada" : "solicitud_enviada";
    const paymentStatus = isInscriptionOnly || !effectivePrice ? "no_aplica" : "no_informado";

    const reservationPayload: any = {
      event_id: event.id,
      alumno_id: alumno.id,
      reservation_status: reservationStatus,
      payment_status: paymentStatus,
      estado: reservationStatus,
      metodo_pago: isInscriptionOnly ? "no_aplica" : "pendiente",
      amount_total: effectivePrice,
      amount_paid: 0,
      price_snapshot: effectivePrice,
      currency_snapshot: effectiveCurrency,
      moneda: effectiveCurrency,
      monto: effectivePrice,
      balance_due: isInscriptionOnly ? 0 : effectivePrice,
      participant_notes: notes.trim() || null,
      created_by: "cliente",
      confirmed_at: isInscriptionOnly ? new Date().toISOString() : null,
      cancelled_at: null,
      cancellation_reason: null,
      cancellation_requested_at: null,
      package_id: selectedPackage?.id || null,
      package_nombre_snapshot: selectedPackage?.nombre || null,
    };

    const { data: existing } = await supabase
      .from("event_reservations" as any)
      .select("id, reservation_status")
      .eq("event_id", event.id)
      .eq("alumno_id", alumno.id)
      .maybeSingle();

    let data: any;
    let error: any;

    if (existing) {
      const { data: updated, error: updateError } = await supabase
        .from("event_reservations" as any)
        .update(reservationPayload as any)
        .eq("id", (existing as any).id)
        .select("*")
        .single();
      data = updated;
      error = updateError;
    } else {
      const { data: inserted, error: insertError } = await supabase
        .from("event_reservations" as any)
        .insert(reservationPayload as any)
        .select("*")
        .single();
      data = inserted;
      error = insertError;
    }

    if (error) {
      toast({ title: "Error al registrar.", description: error.message, variant: "destructive" });
      setStep("form");
      return;
    }

    await supabase.from("reservation_status_history" as any).insert({
      reservation_id: (data as any).id,
      new_reservation_status: reservationStatus,
      new_payment_status: paymentStatus,
      changed_by: alumno.user_id,
      changed_by_role: "alumno",
      note: isInscriptionOnly ? "Inscripción confirmada automáticamente" : "Reserva iniciada por el alumno",
    } as any);

    if (!existing || (existing as any).reservation_status === "cancelada") {
      await supabase
        .from("events")
        .update({ spots_taken: event.spots_taken + 1 } as any)
        .eq("id", event.id);
    }

    if (!isInscriptionOnly) {
      try {
        const functionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/notify-event-cash-payment`;
        fetch(functionUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
          body: JSON.stringify({ alumno_id: alumno.id, event_id: event.id, reservation_id: (data as any)?.id }),
        }).catch(() => {});
      } catch { /* fire and forget */ }
    }

    if (event.type === "record_hora") {
      try {
        await supabase.functions.invoke("register-record-participant", {
          body: {
            first_name: alumno.nombre,
            last_name: alumno.apellido || "",
            email: alumno.email,
            team_name: "Sin equipo",
            event_id: event.id,
            reservation_id: (data as any)?.id,
            source: "app",
          },
        });
      } catch { /* fire and forget */ }
    }

    setStep("success");
    onReserved(data);
    toast({ title: labels.toastTitle });
  };

  const handleClose = () => {
    onOpenChange(false);
    setTimeout(() => {
      setStep("summary");
      setNotes("");
      setSelectedPackageId(null);
    }, 300);
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[90vh]">
        <DrawerHeader className="text-left">
          <DrawerTitle className="font-heading text-lg">
            {step === "success" ? labels.drawerTitleSuccess : labels.drawerTitle}
          </DrawerTitle>
          <DrawerDescription>
            {step === "success" ? labels.drawerDescSuccess : labels.drawerDesc}
          </DrawerDescription>
        </DrawerHeader>

        <div className="px-4 pb-6 space-y-4 overflow-y-auto">

          {/* ── Step: Summary ── */}
          {step === "summary" && (
            <>
              <div className="glass-card rounded-xl p-4 space-y-3">
                <h4 className="font-heading font-semibold text-sm text-foreground">{event.title}</h4>
                <div className="space-y-1.5 text-sm text-muted-foreground">
                  <p className="flex items-center gap-2"><CalendarDays className="w-4 h-4 text-primary" /> <span className="capitalize">{dateStr}</span></p>
                  {event.location && <p className="flex items-center gap-2"><MapPin className="w-4 h-4 text-primary" /> {event.location}</p>}
                  {event.level && <p className="flex items-center gap-2"><Mountain className="w-4 h-4 text-primary" /> Nivel: {event.level}</p>}
                  {spotsLeft != null && <p className="flex items-center gap-2"><Users className="w-4 h-4 text-primary" /> {spotsLeft > 0 ? `${spotsLeft} cupos disponibles` : "Sin cupos"}</p>}
                </div>
                {isPaid && !isInscriptionOnly && !hasPackages && (
                  <div className="pt-2 border-t border-border/50">
                    <p className="text-xs text-muted-foreground">Precio por persona</p>
                    <p className="text-xl font-heading font-bold text-primary">{formatPrice(event.price!, event.currency)}</p>
                  </div>
                )}
                {hasPackages && !isInscriptionOnly && (
                  <div className="pt-2 border-t border-border/50">
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <BedDouble className="w-3.5 h-3.5 text-primary" /> Desde
                    </p>
                    <p className="text-xl font-heading font-bold text-primary">
                      {formatPrice(Math.min(...packages.map((p) => p.precio)), packages[0].currency)}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Elegí tu tipo de paquete en el próximo paso.
                    </p>
                  </div>
                )}
              </div>

              <p className="text-xs text-muted-foreground text-center">
                {labels.summaryHint}
              </p>

              {missingFields.length > 0 && (
                <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-400">
                  Recordá completar estos datos en tu perfil: {missingFields.join(", ")}
                </div>
              )}

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={handleClose}>
                  Cancelar
                </Button>
                <Button
                  variant="gold"
                  className="flex-1"
                  onClick={goAfterSummary}
                  disabled={(spotsLeft !== null && spotsLeft <= 0) || loadingPackages}
                >
                  {loadingPackages ? <Loader2 className="w-4 h-4 animate-spin" /> : (<>Continuar <ArrowRight className="w-4 h-4 ml-1" /></>)}
                </Button>
              </div>
            </>
          )}

          {/* ── Step: Package selection ── */}
          {step === "package" && (
            <>
              <div className="space-y-2">
                <h4 className="font-heading font-semibold text-sm text-foreground flex items-center gap-2">
                  <BedDouble className="w-4 h-4 text-primary" /> Elegí tu paquete
                </h4>
                <p className="text-xs text-muted-foreground">
                  Cada opción tiene su propio precio y seña. Vas a poder ver el detalle al confirmar.
                </p>
              </div>

              <div className="space-y-2">
                {packages.map((p) => {
                  const isSelected = p.id === selectedPackageId;
                  const cupoLeft = p.cupo != null ? Math.max(0, p.cupo - (p.used || 0)) : null;
                  const sinCupo = cupoLeft === 0;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => !sinCupo && setSelectedPackageId(p.id)}
                      disabled={sinCupo}
                      className={`w-full text-left rounded-xl border p-3 transition-all ${
                        isSelected
                          ? "border-primary bg-primary/10"
                          : "border-border/60 bg-card/60 hover:border-primary/40"
                      } ${sinCupo ? "opacity-50 cursor-not-allowed" : ""}`}
                    >
                      <div className="flex items-start gap-2">
                        <div className={`mt-0.5 w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${
                          isSelected ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40"
                        }`}>
                          {isSelected && <Check className="w-3 h-3" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-foreground">{p.nombre}</span>
                            <span className="text-base font-heading font-bold text-primary">
                              {formatPrice(p.precio, p.currency)}
                            </span>
                          </div>
                          {p.descripcion && (
                            <p className="text-xs text-muted-foreground mt-1">{p.descripcion}</p>
                          )}
                          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                            {p.sena != null && (
                              <span className="text-[11px] text-muted-foreground">
                                Seña: <span className="text-foreground/80 font-medium">{formatPrice(p.sena, p.currency)}</span>
                              </span>
                            )}
                            {p.cupo != null && (
                              <span className={`text-[11px] px-1.5 py-0.5 rounded ${
                                sinCupo ? "bg-destructive/15 text-destructive" : "bg-muted text-muted-foreground"
                              }`}>
                                {sinCupo ? "Sin cupo" : `${cupoLeft} ${cupoLeft === 1 ? "lugar" : "lugares"}`}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setStep("summary")}>
                  Volver
                </Button>
                <Button variant="gold" className="flex-1" onClick={goAfterPackage} disabled={!selectedPackageId}>
                  Continuar <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </>
          )}

          {/* ── Step: Form ── */}
          {step === "form" && (
            <>
              <div className="glass-card rounded-xl p-4 space-y-3">
                <h4 className="font-heading font-semibold text-sm text-foreground">Tus datos</h4>
                <div className="space-y-1 text-sm">
                  <p className="text-foreground">{alumno.nombre} {alumno.apellido || ""}</p>
                  <p className="text-muted-foreground">{alumno.email}</p>
                  {alumno.telefono && <p className="text-muted-foreground">{alumno.telefono}</p>}
                </div>
                {selectedPackage && (
                  <div className="pt-2 border-t border-border/50">
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Paquete elegido</p>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-sm font-medium text-foreground flex items-center gap-1.5">
                        <BedDouble className="w-3.5 h-3.5 text-primary" /> {selectedPackage.nombre}
                      </span>
                      <span className="text-sm font-heading font-bold text-primary">
                        {formatPrice(selectedPackage.precio, selectedPackage.currency)}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Observaciones (opcional)</Label>
                <Textarea
                  placeholder={
                    event.type === "camp" || event.type === "viaje"
                      ? "Ej: soy celíaco, necesito habitación en planta baja, etc."
                      : "Ej: llego 30 min tarde, voy con un acompañante, etc."
                  }
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  maxLength={500}
                />
              </div>

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setStep(hasPackages ? "package" : "summary")}>
                  Volver
                </Button>
                <Button variant="gold" className="flex-1" onClick={handleSubmit}>
                  <labels.confirmIcon className="w-4 h-4 mr-2" /> {labels.confirmBtn}
                </Button>
              </div>
            </>
          )}

          {/* ── Step: Submitting ── */}
          {step === "submitting" && (
            <div className="text-center py-8 space-y-3">
              <Loader2 className="w-10 h-10 text-primary mx-auto animate-spin" />
              <p className="text-sm text-muted-foreground">
                {isInscriptionOnly ? "Confirmando tu inscripción..." : "Procesando tu reserva..."}
              </p>
            </div>
          )}

          {/* ── Step: Success ── */}
          {step === "success" && (
            <div className="text-center py-6 space-y-4">
              <CheckCircle className="w-14 h-14 text-emerald-400 mx-auto" />
              <div className="space-y-1">
                <h3 className="font-heading font-semibold text-foreground">{labels.successTitle}</h3>
                <p className="text-sm text-muted-foreground">{labels.successDesc}</p>
              </div>
              <Button variant="gold" className="w-full" onClick={handleClose}>
                {labels.successBtn}
              </Button>
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
};

export default ReservationDrawer;
