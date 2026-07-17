/**
 * Drawer para autogestión de compañeros de habitación desde el hub del alumno.
 * Muestra:
 *  - Compañeros confirmados (mutuos).
 *  - Invitaciones enviadas (pendientes / rechazadas).
 *  - Invitaciones recibidas de otros participantes (Aceptar / Rechazar).
 *  - Autocomplete para invitar a otros inscriptos del evento.
 */
import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, UserPlus, Check, X, Mail, Users, Clock } from "lucide-react";
import { toast } from "sonner";
import { fetchPackageAvailability, AvailabilityRow, formatAvailabilityRow, generoLabel } from "@/lib/packageAvailability";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  reservationId: string;
  eventId: string;
  alumnoId: string | null;
  packageId?: string | null;
  packageName?: string | null;
  roomGender?: string | null;
  onChanged?: () => void;
}

interface RmRow {
  id: string;
  posicion: number;
  nombre: string | null;
  email: string | null;
  alumno_id: string | null;
  status: string;
  confirmado: boolean;
  reservation_id: string;
  invited_by_alumno_id: string | null;
}

interface Participant {
  alumno_id: string;
  nombre: string;
  email: string;
  reservation_id: string;
}

export default function TripRoommatesDrawer({ open, onOpenChange, reservationId, eventId, alumnoId, packageId, packageName, roomGender, onChanged }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [outgoing, setOutgoing] = useState<RmRow[]>([]);   // rows on my reservation
  const [incoming, setIncoming] = useState<RmRow[]>([]);   // rows on OTHER reservations where I'm the invitee
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [search, setSearch] = useState("");
  const [myEmail, setMyEmail] = useState<string>("");
  const [capacity, setCapacity] = useState<number | null>(null);
  const [availability, setAvailability] = useState<AvailabilityRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const email = userData.user?.email || "";
      setMyEmail(email);

      // Rows on my reservation (outgoing invites / confirmed)
      const { data: outRows } = await supabase
        .from("reservation_roommates")
        .select("*")
        .eq("reservation_id", reservationId)
        .order("posicion");

      // Rows where I'm the invited email (incoming invites)
      const { data: inRows } = email
        ? await supabase
            .from("reservation_roommates")
            .select("*")
            .eq("event_id", eventId)
            .ilike("email", email)
            .neq("reservation_id", reservationId)
        : { data: [] as any[] };

      setOutgoing((outRows || []) as RmRow[]);
      setIncoming((inRows || []) as RmRow[]);

      // Load event participants for autocomplete
      const { data: part } = await supabase.rpc("list_event_participants_for_roommate", { _event_id: eventId });
      setParticipants((part || []) as Participant[]);

      // Fetch real room capacity from event_packages.personas_por_habitacion
      if (packageId) {
        const { data: pkg } = await supabase
          .from("event_packages")
          .select("personas_por_habitacion")
          .eq("id", packageId)
          .maybeSingle();
        setCapacity(pkg?.personas_por_habitacion ?? null);
        const rows = await fetchPackageAvailability(packageId);
        setAvailability(rows);
      } else {
        setCapacity(null);
        setAvailability([]);
      }
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [reservationId, eventId, packageId]);

  useEffect(() => { if (open) load(); }, [open, load]);

  // Derived from real package data (event_packages.personas_por_habitacion) + event_rooms availability
  const requiresLodging = (capacity ?? 0) > 0 && availability.length > 0;
  const label = capacity ? (capacity === 1 ? "Individual" : `${capacity} por habitación`) : "";
  const genderRows = useMemo(
    () => availability.filter(r => !roomGender || r.genero === roomGender || r.genero === "mixta"),
    [availability, roomGender]
  );
  const genderAvailable = genderRows.reduce((s, r) => s + Math.max(0, r.available), 0);
  const genderLabelStr = roomGender ? generoLabel(roomGender) : "";

  const invite = async (p: Participant) => {
    setSaving(true);
    try {
      // Check duplicate
      if (outgoing.some(r => r.email && r.email.toLowerCase() === p.email.toLowerCase())) {
        toast.error("Ya invitaste a esta persona");
        return;
      }
      const usedSlots = outgoing.filter(r => r.status !== "rejected").length;
      if (capacity && usedSlots >= capacity - 1) {
        toast.error(`Tu habitación (${label}) sólo admite ${capacity} personas en total`);
        return;
      }
      if (roomGender && genderAvailable <= 0) {
        toast.error("No hay cupo disponible para agregar más personas a este tipo de habitación");
        return;
      }
      const nextPos = (outgoing[outgoing.length - 1]?.posicion || 0) + 1;
      const { data: inserted, error } = await supabase
        .from("reservation_roommates")
        .insert({
          reservation_id: reservationId,
          event_id: eventId,
          posicion: nextPos,
          nombre: p.nombre,
          email: p.email,
          alumno_id: p.alumno_id,
          status: "pending",
          confirmado: false,
          invited_by_alumno_id: alumnoId,
        })
        .select("*")
        .single();
      if (error) throw error;

      // Fire notification email (best-effort)
      supabase.functions.invoke("send-roommate-notification", {
        body: { kind: "invite", roommate_id: inserted.id },
      }).catch(err => console.warn("notify invite failed:", err));

      toast.success(`Invitación enviada a ${p.nombre}`);
      setSearch("");
      await load();
      onChanged?.();
    } catch (e: any) {
      toast.error(e.message || "No se pudo enviar la invitación");
    } finally {
      setSaving(false);
    }
  };

  const cancelInvite = async (id: string) => {
    setSaving(true);
    try {
      const { error } = await supabase.from("reservation_roommates").delete().eq("id", id);
      if (error) throw error;
      toast.success("Invitación cancelada");
      await load();
      onChanged?.();
    } catch (e: any) {
      toast.error(e.message || "No se pudo cancelar");
    } finally {
      setSaving(false);
    }
  };

  const accept = async (id: string) => {
    setSaving(true);
    try {
      const { error } = await supabase.rpc("accept_roommate_invitation", { _roommate_id: id });
      if (error) throw error;
      supabase.functions.invoke("send-roommate-notification", {
        body: { kind: "accepted", roommate_id: id },
      }).catch(err => console.warn("notify accept failed:", err));
      toast.success("Invitación aceptada");
      await load();
      onChanged?.();
    } catch (e: any) {
      toast.error(e.message || "No se pudo aceptar");
    } finally {
      setSaving(false);
    }
  };

  const reject = async (id: string) => {
    setSaving(true);
    try {
      const { error } = await supabase.rpc("reject_roommate_invitation", { _roommate_id: id });
      if (error) throw error;
      toast.success("Invitación rechazada");
      await load();
      onChanged?.();
    } catch (e: any) {
      toast.error(e.message || "No se pudo rechazar");
    } finally {
      setSaving(false);
    }
  };

  const filteredParticipants = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return participants.slice(0, 8);
    return participants
      .filter(p => p.nombre.toLowerCase().includes(q) || p.email.toLowerCase().includes(q))
      .slice(0, 12);
  }, [search, participants]);

  const alreadyInvitedEmails = useMemo(
    () => new Set(outgoing.filter(r => r.status !== "rejected").map(r => (r.email || "").toLowerCase())),
    [outgoing]
  );

  const confirmed = outgoing.filter(r => r.status === "accepted");
  const pending = outgoing.filter(r => r.status === "pending");
  const rejected = outgoing.filter(r => r.status === "rejected");
  const pendingIncoming = incoming.filter(r => r.status === "pending");

  const slotsRemaining = capacity ? Math.max(0, capacity - 1 - confirmed.length - pending.length) : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto rounded-t-2xl">
        <SheetHeader className="text-left">
          <SheetTitle className="flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            Compañeros de habitación
          </SheetTitle>
          <SheetDescription>
            {label && <Badge variant="outline" className="mr-2">{label}</Badge>}
            {genderLabelStr && <Badge variant="outline" className="mr-2 capitalize">{genderLabelStr}</Badge>}
            {packageName || "Tu paquete"}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-5">
          {!requiresLodging ? (
            <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
              Tu paquete no incluye alojamiento, no hace falta gestionar compañeros.
            </div>
          ) : capacity === 1 ? (
            <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
              Elegiste una habitación individual: no compartís con nadie.
            </div>
          ) : loading ? (
            <div className="py-10 flex items-center justify-center text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin mr-2" /> Cargando…
            </div>
          ) : (
            <>
              {/* Incoming invitations */}
              {pendingIncoming.length > 0 && (
                <section className="space-y-2">
                  <p className="text-xs uppercase tracking-wider font-semibold text-primary">Te invitaron a compartir</p>
                  {pendingIncoming.map(inv => (
                    <div key={inv.id} className="rounded-xl border border-primary/30 bg-primary/5 p-3">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <p className="font-semibold text-sm">Invitación pendiente</p>
                          <p className="text-xs text-muted-foreground">Alguien de este viaje quiere compartir habitación con vos.</p>
                        </div>
                        <Mail className="w-4 h-4 text-primary shrink-0" />
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => accept(inv.id)} disabled={saving} className="flex-1">
                          <Check className="w-3.5 h-3.5 mr-1" /> Aceptar
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => reject(inv.id)} disabled={saving} className="flex-1">
                          <X className="w-3.5 h-3.5 mr-1" /> Rechazar
                        </Button>
                      </div>
                    </div>
                  ))}
                </section>
              )}

              {/* Confirmed */}
              {confirmed.length > 0 && (
                <section className="space-y-2">
                  <p className="text-xs uppercase tracking-wider font-semibold text-emerald-500">Confirmados</p>
                  {confirmed.map(r => (
                    <div key={r.id} className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 flex items-center justify-between">
                      <div>
                        <p className="font-medium text-sm">{r.nombre || r.email}</p>
                        <p className="text-[11px] text-muted-foreground">{r.email}</p>
                      </div>
                      <Badge variant="outline" className="border-emerald-500/40 text-emerald-500">Confirmado</Badge>
                    </div>
                  ))}
                </section>
              )}

              {/* Pending outgoing */}
              {pending.length > 0 && (
                <section className="space-y-2">
                  <p className="text-xs uppercase tracking-wider font-semibold text-amber-500">Pendientes de respuesta</p>
                  {pending.map(r => (
                    <div key={r.id} className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{r.nombre || r.email}</p>
                        <p className="text-[11px] text-muted-foreground truncate">{r.email}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="outline" className="border-amber-500/40 text-amber-500"><Clock className="w-3 h-3 mr-1" /> Esperando</Badge>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => cancelInvite(r.id)} disabled={saving}>
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </section>
              )}

              {rejected.length > 0 && (
                <section className="space-y-2">
                  <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Rechazadas</p>
                  {rejected.map(r => (
                    <div key={r.id} className="rounded-xl border border-border bg-background p-3 flex items-center justify-between gap-2">
                      <p className="text-sm text-muted-foreground line-through truncate">{r.nombre || r.email}</p>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => cancelInvite(r.id)} disabled={saving}>
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))}
                </section>
              )}

              {/* No cupo disponible for this gender/tipo */}
              {slotsRemaining !== null && slotsRemaining > 0 && roomGender && genderAvailable <= 0 && (
                <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                  No hay cupo disponible para agregar más personas a este tipo de habitación.
                  {genderRows.length > 0 && (
                    <ul className="mt-2 text-xs text-muted-foreground space-y-0.5">
                      {genderRows.map((r, i) => (
                        <li key={i}>· {formatAvailabilityRow(r)}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {/* Invite */}
              {slotsRemaining !== null && slotsRemaining > 0 && (!roomGender || genderAvailable > 0) && (
                <section className="space-y-2">
                  <p className="text-xs uppercase tracking-wider font-semibold text-foreground">
                    Invitar compañero{slotsRemaining > 1 ? "s" : ""} <span className="text-muted-foreground normal-case font-normal">· {slotsRemaining} lugar{slotsRemaining > 1 ? "es" : ""} libre{slotsRemaining > 1 ? "s" : ""}</span>
                  </p>
                  <Input
                    placeholder="Buscar por nombre o email…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  <div className="space-y-1.5 max-h-64 overflow-y-auto">
                    {filteredParticipants.length === 0 && (
                      <p className="text-xs text-muted-foreground italic px-1 py-2">No hay más participantes disponibles</p>
                    )}
                    {filteredParticipants.map(p => {
                      const already = alreadyInvitedEmails.has(p.email.toLowerCase());
                      return (
                        <div key={p.alumno_id} className="flex items-center justify-between rounded-lg border border-border bg-background p-2.5">
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{p.nombre}</p>
                            <p className="text-[11px] text-muted-foreground truncate">{p.email}</p>
                          </div>
                          <Button size="sm" variant={already ? "ghost" : "default"} disabled={already || saving} onClick={() => invite(p)}>
                            <UserPlus className="w-3.5 h-3.5 mr-1" />
                            {already ? "Invitado" : "Invitar"}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {slotsRemaining === 0 && (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-500 text-center">
                  ✓ Tu habitación está completa
                </div>
              )}
            </>
          )}
        </div>

        <SheetFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cerrar</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
