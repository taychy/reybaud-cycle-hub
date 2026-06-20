import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { formatPrice } from "@/lib/currency";
import {
  CalendarDays, MapPin, Users, Mountain, Loader2, CheckCircle,
  CreditCard, ArrowRight, UserCheck, BedDouble, Check, Heart, UserPlus, Sparkles,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription,
} from "@/components/ui/drawer";
import type { Tables } from "@/integrations/supabase/types";
import { Checkbox } from "@/components/ui/checkbox";
import EventReglamentoSection from "@/components/event/EventReglamentoSection";
import { extractReglamento, hasAnyReglamento } from "@/lib/eventReglamentoDefaults";

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
  metadata?: any;
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
  personas_por_habitacion: number;
  cupo_mujeres: number | null;
  cupo_varones: number | null;
  cupo_mixto: number | null;
  permite_mixto: boolean;
  // counts (active reservations)
  used?: number;
  used_mujeres?: number;
  used_varones?: number;
  used_mixto?: number;
}

type RoomGender = "femenina" | "masculina" | "mixta";
type Vinculo = "pareja" | "amigos";

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
  const [step, setStep] = useState<"summary" | "package" | "room" | "mates" | "form" | "submitting" | "success">("summary");
  const [notes, setNotes] = useState("");
  const [packages, setPackages] = useState<PackageRow[]>([]);
  const [loadingPackages, setLoadingPackages] = useState(false);
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);
  const [roomGender, setRoomGender] = useState<RoomGender | null>(null);
  const [shareChoice, setShareChoice] = useState<"share" | "assign" | null>(null);
  const [vinculo, setVinculo] = useState<Vinculo | null>(null);
  const [mates, setMates] = useState<{ nombre: string; email: string; telefono: string }[]>([]);

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
      // Conteo de reservas activas por paquete (totales + por género)
      if (rows.length > 0) {
        const { data: reservas } = await supabase
          .from("event_reservations" as any)
          .select("package_id, reservation_status, genero_habitacion")
          .eq("event_id", event.id)
          .not("package_id", "is", null);
        const totals: Record<string, number> = {};
        const m: Record<string, number> = {};
        const v: Record<string, number> = {};
        const x: Record<string, number> = {};
        ((reservas as any[]) || []).forEach((r) => {
          if (r.reservation_status === "cancelada") return;
          if (!r.package_id) return;
          totals[r.package_id] = (totals[r.package_id] || 0) + 1;
          if (r.genero_habitacion === "femenina") m[r.package_id] = (m[r.package_id] || 0) + 1;
          else if (r.genero_habitacion === "masculina") v[r.package_id] = (v[r.package_id] || 0) + 1;
          else if (r.genero_habitacion === "mixta") x[r.package_id] = (x[r.package_id] || 0) + 1;
        });
        rows.forEach((p) => {
          p.used = totals[p.id] || 0;
          p.used_mujeres = m[p.id] || 0;
          p.used_varones = v[p.id] || 0;
          p.used_mixto = x[p.id] || 0;
        });
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

  // Disponibilidad por género en el paquete seleccionado
  const genderAvail = (g: RoomGender): number | null => {
    if (!selectedPackage) return null;
    const cupo = g === "femenina" ? selectedPackage.cupo_mujeres
      : g === "masculina" ? selectedPackage.cupo_varones
      : selectedPackage.cupo_mixto;
    const used = g === "femenina" ? (selectedPackage.used_mujeres || 0)
      : g === "masculina" ? (selectedPackage.used_varones || 0)
      : (selectedPackage.used_mixto || 0);
    if (cupo == null) return null; // sin límite
    return Math.max(0, cupo - used);
  };

  const packageHasGenderConfig = !!selectedPackage && (
    selectedPackage.cupo_mujeres != null ||
    selectedPackage.cupo_varones != null ||
    (selectedPackage.permite_mixto && selectedPackage.cupo_mixto != null)
  );

  const roomCapacity = selectedPackage?.personas_por_habitacion || 0;
  const matesNeeded = Math.max(0, roomCapacity - 1); // restantes a declarar

  const goAfterSummary = () => {
    if (hasPackages) setStep("package");
    else setStep("form");
  };

  const goAfterPackage = () => {
    if (!selectedPackageId) {
      toast({ title: "Elegí un paquete para continuar.", variant: "destructive" });
      return;
    }
    // Si el paquete tiene cupos por género, pedir elección de género
    if (packageHasGenderConfig) setStep("room");
    else setStep("form");
  };

  const goAfterRoom = () => {
    if (!roomGender) {
      toast({ title: "Elegí una opción de habitación.", variant: "destructive" });
      return;
    }
    // Mixta obliga a declarar compañeros (grupo cerrado)
    if (roomGender === "mixta") {
      setShareChoice("share");
      if (mates.length !== matesNeeded) {
        setMates(Array.from({ length: matesNeeded }, () => ({ nombre: "", email: "", telefono: "" })));
      }
    }
    // Sin compañeros a declarar (single)
    if (matesNeeded === 0) {
      setStep("form");
      return;
    }
    setStep("mates");
  };

  const goAfterMates = () => {
    if (roomGender === "mixta") {
      // En mixta es obligatorio nombrar a todos
      if (mates.length !== matesNeeded || mates.some((m) => !m.nombre.trim())) {
        toast({ title: `Completá el nombre de los ${matesNeeded === 1 ? "/la compañero/a" : `${matesNeeded} compañeros/as`}.`, variant: "destructive" });
        return;
      }
    } else if (shareChoice === null) {
      toast({ title: "Elegí cómo querés compartir la habitación.", variant: "destructive" });
      return;
    } else if (shareChoice === "share") {
      const filled = mates.filter((m) => m.nombre.trim()).length;
      if (filled === 0) {
        toast({ title: "Ingresá al menos un nombre o elegí que te asignen compañeros/as.", variant: "destructive" });
        return;
      }
    }
    if (roomCapacity === 2 && shareChoice === "share" && mates.some((m) => m.nombre.trim()) && !vinculo) {
      toast({ title: "Indicá si son pareja o amigos/as para asignar el tipo de cama.", variant: "destructive" });
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
      genero_habitacion: roomGender,
      tipo_vinculo: roomCapacity === 2 && shareChoice === "share" && mates.some((m) => m.nombre.trim()) ? vinculo : null,
      prefiere_asignacion: shareChoice === "assign",
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

    // Compañeros de habitación: reemplazar lista para esta reserva
    if (selectedPackage && roomGender && shareChoice === "share") {
      const cleaned = mates
        .map((m, i) => ({ ...m, posicion: i + 1 }))
        .filter((m) => m.nombre.trim());
      await supabase
        .from("reservation_roommates" as any)
        .delete()
        .eq("reservation_id", (data as any).id);
      if (cleaned.length > 0) {
        await supabase.from("reservation_roommates" as any).insert(
          cleaned.map((m) => ({
            reservation_id: (data as any).id,
            posicion: m.posicion,
            nombre: m.nombre.trim(),
            email: m.email.trim() || null,
            telefono: m.telefono.trim() || null,
          })),
        );
      }
    }

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
      setRoomGender(null);
      setShareChoice(null);
      setVinculo(null);
      setMates([]);
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

          {/* ── Step: Room gender ── */}
          {step === "room" && selectedPackage && (
            <>
              <div className="space-y-2">
                <h4 className="font-heading font-semibold text-sm text-foreground flex items-center gap-2">
                  <BedDouble className="w-4 h-4 text-primary" /> Tipo de habitación
                </h4>
                <p className="text-xs text-muted-foreground">
                  {selectedPackage.personas_por_habitacion === 1
                    ? "Habitación individual."
                    : `Cada habitación es para ${selectedPackage.personas_por_habitacion} personas y se comparte según el género elegido.`}
                </p>
              </div>

              <div className="space-y-2">
                {([
                  { g: "femenina" as RoomGender, label: "Solo mujeres", icon: "♀", color: "rose" },
                  { g: "masculina" as RoomGender, label: "Solo varones", icon: "♂", color: "sky" },
                  ...(selectedPackage.permite_mixto ? [{ g: "mixta" as RoomGender, label: "Mixta (grupo cerrado)", icon: "⚥", color: "violet" }] : []),
                ]).map(({ g, label, icon, color }) => {
                  const avail = genderAvail(g);
                  const sinCupo = avail === 0;
                  const isSelected = roomGender === g;
                  const colorClass =
                    color === "rose" ? "border-rose-500/40 bg-rose-500/5"
                    : color === "sky" ? "border-sky-500/40 bg-sky-500/5"
                    : "border-violet-500/40 bg-violet-500/5";
                  return (
                    <button
                      key={g}
                      type="button"
                      onClick={() => !sinCupo && setRoomGender(g)}
                      disabled={sinCupo}
                      className={`w-full text-left rounded-xl border p-3 transition-all ${
                        isSelected ? "border-primary bg-primary/10" : colorClass
                      } ${sinCupo ? "opacity-40 cursor-not-allowed" : "hover:border-primary/60"}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-full border flex items-center justify-center text-lg ${
                          isSelected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground"
                        }`}>
                          {icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground">{label}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {avail == null ? "Cupo abierto" : sinCupo ? "Sin cupo" : `${avail} ${avail === 1 ? "lugar disponible" : "lugares disponibles"}`}
                          </p>
                        </div>
                        {isSelected && <Check className="w-4 h-4 text-primary" />}
                      </div>
                    </button>
                  );
                })}
              </div>

              {roomGender === "mixta" && (
                <div className="p-3 rounded-lg bg-violet-500/10 border border-violet-500/30 text-xs text-violet-200">
                  <strong>Habitación mixta:</strong> tenés que declarar el nombre de todos los/as compañeros/as con quienes la vas a compartir. Solo se confirma si todos ya están inscritos al viaje.
                </div>
              )}

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setStep("package")}>
                  Volver
                </Button>
                <Button variant="gold" className="flex-1" onClick={goAfterRoom} disabled={!roomGender}>
                  Continuar <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </>
          )}

          {/* ── Step: Roommates ── */}
          {step === "mates" && selectedPackage && (
            <>
              <div className="space-y-2">
                <h4 className="font-heading font-semibold text-sm text-foreground flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-primary" /> Compañeros/as de habitación
                </h4>
                <p className="text-xs text-muted-foreground">
                  {roomGender === "mixta"
                    ? `Completá el nombre de los ${matesNeeded === 1 ? "/la compañero/a" : `${matesNeeded} compañeros/as`} con quienes vas a compartir.`
                    : "¿Querés compartir con personas conocidas o que te asignemos compañeros/as?"}
                </p>
              </div>

              {roomGender !== "mixta" && (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShareChoice("share");
                      if (mates.length !== matesNeeded) {
                        setMates(Array.from({ length: matesNeeded }, () => ({ nombre: "", email: "", telefono: "" })));
                      }
                    }}
                    className={`rounded-xl border p-3 text-left ${shareChoice === "share" ? "border-primary bg-primary/10" : "border-border bg-card hover:border-primary/40"}`}
                  >
                    <UserPlus className="w-4 h-4 text-primary mb-1" />
                    <p className="text-sm font-semibold">Comparto con…</p>
                    <p className="text-[11px] text-muted-foreground">Indico nombres</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShareChoice("assign"); setMates([]); setVinculo(null); }}
                    className={`rounded-xl border p-3 text-left ${shareChoice === "assign" ? "border-primary bg-primary/10" : "border-border bg-card hover:border-primary/40"}`}
                  >
                    <Sparkles className="w-4 h-4 text-primary mb-1" />
                    <p className="text-sm font-semibold">Asignenme</p>
                    <p className="text-[11px] text-muted-foreground">Comparto con quien la escuela me indique</p>
                  </button>
                </div>
              )}

              {(shareChoice === "share" || roomGender === "mixta") && matesNeeded > 0 && (
                <div className="space-y-3">
                  {Array.from({ length: matesNeeded }).map((_, i) => {
                    const m = mates[i] || { nombre: "", email: "", telefono: "" };
                    const setM = (patch: Partial<typeof m>) => {
                      const next = [...mates];
                      while (next.length < matesNeeded) next.push({ nombre: "", email: "", telefono: "" });
                      next[i] = { ...next[i], ...patch };
                      setMates(next);
                    };
                    return (
                      <div key={i} className="rounded-lg border border-border/50 p-3 space-y-2 bg-card/50">
                        <p className="text-[11px] text-muted-foreground uppercase tracking-wider">
                          Compañero/a {i + 1}{roomGender === "mixta" ? " *" : ""}
                        </p>
                        <Input
                          value={m.nombre}
                          onChange={(e) => setM({ nombre: e.target.value })}
                          placeholder="Nombre y apellido"
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <Input
                            value={m.email}
                            onChange={(e) => setM({ email: e.target.value })}
                            placeholder="Email (opcional)"
                            type="email"
                          />
                          <Input
                            value={m.telefono}
                            onChange={(e) => setM({ telefono: e.target.value })}
                            placeholder="Teléfono (opcional)"
                          />
                        </div>
                      </div>
                    );
                  })}

                  {roomCapacity === 2 && (
                    <div className="rounded-lg border border-border/50 p-3 space-y-2 bg-card/50">
                      <p className="text-xs text-muted-foreground">¿Cómo van a compartir la habitación?</p>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setVinculo("pareja")}
                          className={`rounded-lg border p-2.5 text-left ${vinculo === "pareja" ? "border-primary bg-primary/10" : "border-border bg-card hover:border-primary/40"}`}
                        >
                          <Heart className="w-3.5 h-3.5 text-primary mb-1" />
                          <p className="text-xs font-semibold">Pareja</p>
                          <p className="text-[10px] text-muted-foreground">Cama matrimonial</p>
                        </button>
                        <button
                          type="button"
                          onClick={() => setVinculo("amigos")}
                          className={`rounded-lg border p-2.5 text-left ${vinculo === "amigos" ? "border-primary bg-primary/10" : "border-border bg-card hover:border-primary/40"}`}
                        >
                          <Users className="w-3.5 h-3.5 text-primary mb-1" />
                          <p className="text-xs font-semibold">Amigos/as</p>
                          <p className="text-[10px] text-muted-foreground">Camas individuales</p>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setStep("room")}>
                  Volver
                </Button>
                <Button variant="gold" className="flex-1" onClick={goAfterMates}>
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
                <Button variant="outline" className="flex-1" onClick={() => setStep(matesNeeded > 0 && packageHasGenderConfig ? "mates" : packageHasGenderConfig ? "room" : hasPackages ? "package" : "summary")}>
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
