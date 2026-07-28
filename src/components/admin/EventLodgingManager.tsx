/**
 * Gestión de alojamiento por evento:
 *   • Definir habitaciones/cabañas físicas (nombre, capacidad, género, paquete)
 *   • Asignar reservas a cada habitación
 *   • Ver plazas ocupadas vs libres para definir últimos cupos
 * Reusable para todo evento tipo viaje/camp.
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  BedDouble,
  Plus,
  Trash2,
  Users,
  Loader2,
  Home,
  UserPlus,
  X,
  AlertCircle,
  Edit2,
  Save,
  Wand2,
  Copy,
} from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId: string;
  eventTitle: string;
}

interface Pkg {
  id: string;
  nombre: string;
  cupo: number | null;
  personas_por_habitacion: number | null;
  cupo_mujeres: number | null;
  cupo_varones: number | null;
  cupo_mixto: number | null;
}

interface Reservation {
  id: string;
  package_id: string | null;
  reservation_status: string;
  nombre: string;
  apellido: string;
  telefono: string;
  habitacion_data: any;
  prefiere_asignacion: boolean | null;
  tipo_vinculo: string | null;
}

interface Room {
  id: string;
  event_id: string;
  package_id: string | null;
  nombre: string;
  capacidad: number;
  genero: "mujeres" | "varones" | "mixto" | null;
  tipo: RoomTipo | null;
  notas: string | null;
  sort_order: number;
}

interface Assignment {
  id: string;
  room_id: string;
  reservation_id: string;
}

type RoomTipo = "individual" | "doble" | "triple" | "cuadruple" | "cabana" | "dormitorio";

const TIPO_OPTIONS: { value: RoomTipo; label: string }[] = [
  { value: "individual", label: "Individual" },
  { value: "doble", label: "Doble" },
  { value: "triple", label: "Triple" },
  { value: "cuadruple", label: "Cuádruple" },
  { value: "cabana", label: "Cabaña" },
  { value: "dormitorio", label: "Dormitorio" },
];

export const tipoLabel = (t: RoomTipo | string | null | undefined): string => {
  if (!t) return "";
  const found = TIPO_OPTIONS.find((o) => o.value === t);
  return found?.label || String(t);
};

// Fallback cuando la habitación no tiene tipo cargado (retrocompatibilidad)
export const inferTipoFromCapacidad = (cap: number): RoomTipo => {
  if (cap <= 1) return "individual";
  if (cap === 2) return "doble";
  if (cap === 3) return "triple";
  if (cap === 4) return "cuadruple";
  return "dormitorio";
};

const GENERO_LABEL: Record<string, string> = {
  mujeres: "Mujeres",
  varones: "Varones",
  mixto: "Mixto",
};

const generoBadge = (g: string | null) => {
  if (!g) return null;
  const cls =
    g === "mujeres"
      ? "bg-pink-500/10 text-pink-500 border-pink-500/30"
      : g === "varones"
        ? "bg-blue-500/10 text-blue-500 border-blue-500/30"
        : "bg-purple-500/10 text-purple-500 border-purple-500/30";
  return (
    <Badge variant="outline" className={`text-[10px] ${cls}`}>
      {GENERO_LABEL[g]}
    </Badge>
  );
};

const tipoBadge = (room: Pick<Room, "tipo" | "capacidad">) => {
  const t = room.tipo || inferTipoFromCapacidad(room.capacidad);
  return (
    <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/30">
      {tipoLabel(t)}
    </Badge>
  );
};

const EventLodgingManager = ({ open, onOpenChange, eventId, eventTitle }: Props) => {
  const [loading, setLoading] = useState(false);
  const [packages, setPackages] = useState<Pkg[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [roommateGroups, setRoommateGroups] = useState<Record<string, string[]>>({}); // reservation_id -> [names of confirmed mates]

  // form nueva habitación
  const [newRoomOpen, setNewRoomOpen] = useState<string | null>(null); // package_id o "sin"
  const [nrNombre, setNrNombre] = useState("");
  const [nrCapacidad, setNrCapacidad] = useState<number>(2);
  const [nrGenero, setNrGenero] = useState<string>("");
  const [nrTipo, setNrTipo] = useState<RoomTipo | "">("");
  const [nrNotas, setNrNotas] = useState("");

  const [editingRoom, setEditingRoom] = useState<string | null>(null);
  const [erNombre, setErNombre] = useState("");
  const [erCapacidad, setErCapacidad] = useState<number>(2);
  const [erGenero, setErGenero] = useState<string>("");
  const [erTipo, setErTipo] = useState<RoomTipo | "">("");
  const [erNotas, setErNotas] = useState("");

  const loadAll = async () => {
    setLoading(true);
    const [pkgR, resR, roomR, alumnosPreR] = await Promise.all([
      supabase
        .from("event_packages")
        .select("id, nombre, cupo, personas_por_habitacion, cupo_mujeres, cupo_varones, cupo_mixto")
        .eq("event_id", eventId)
        .order("sort_order"),
      supabase
        .from("event_reservations")
        .select(
          "id, package_id, reservation_status, alumno_id, external_participant_id, prefiere_asignacion, tipo_vinculo",
        )
        .eq("event_id", eventId),
      (supabase as any).from("event_rooms").select("*").eq("event_id", eventId).order("sort_order").order("nombre"),
      Promise.resolve(null),
    ]);

    const resList = (resR.data || []) as any[];
    const aluIds = resList.map((r) => r.alumno_id).filter(Boolean);
    const extIds = resList.map((r) => r.external_participant_id).filter(Boolean);
    const resIds = resList.map((r) => r.id);

    const [aluR, extR, clR, asgR] = await Promise.all([
      aluIds.length
        ? supabase.from("alumnos").select("id, nombre, apellido, telefono").in("id", aluIds)
        : Promise.resolve({ data: [] as any[] }),
      extIds.length
        ? supabase.from("event_external_participants").select("id, nombre, apellido, telefono").in("id", extIds)
        : Promise.resolve({ data: [] as any[] }),
      resIds.length
        ? supabase
            .from("reservation_checklist_data")
            .select("reservation_id, step_key, data")
            .in("reservation_id", resIds)
            .eq("step_key", "habitacion")
        : Promise.resolve({ data: [] as any[] }),
      resIds.length
        ? (supabase as any)
            .from("event_room_assignments")
            .select("id, room_id, reservation_id")
            .in("reservation_id", resIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const aluMap = new Map((aluR.data || []).map((a: any) => [a.id, a]));
    const extMap = new Map((extR.data || []).map((e: any) => [e.id, e]));
    const clMap = new Map((clR.data || []).map((c: any) => [c.reservation_id, c.data]));

    const built: Reservation[] = resList.map((r) => {
      const a = r.alumno_id ? aluMap.get(r.alumno_id) : null;
      const e = r.external_participant_id ? extMap.get(r.external_participant_id) : null;
      const p: any = a || e || {};
      return {
        id: r.id,
        package_id: r.package_id,
        reservation_status: r.reservation_status,
        nombre: p.nombre || "",
        apellido: p.apellido || "(sin datos)",
        telefono: p.telefono || "",
        habitacion_data: clMap.get(r.id) || null,
        prefiere_asignacion: r.prefiere_asignacion ?? null,
        tipo_vinculo: r.tipo_vinculo ?? null,
      };
    });

    setPackages((pkgR.data || []) as Pkg[]);
    setReservations(built);
    setRooms(((roomR as any).data || []) as Room[]);
    setAssignments(((asgR as any).data || []) as Assignment[]);

    // Cargar grupos de compañeros confirmados (para pre-agrupar en la UI)
    if (resIds.length) {
      const { data: rmData } = await supabase
        .from("reservation_roommates")
        .select("reservation_id, nombre, email, status")
        .in("reservation_id", resIds)
        .eq("status", "accepted");
      const groups: Record<string, string[]> = {};
      (rmData || []).forEach((r: any) => {
        (groups[r.reservation_id] ??= []).push(r.nombre || r.email || "");
      });
      setRoommateGroups(groups);
    } else {
      setRoommateGroups({});
    }

    setLoading(false);
  };

  useEffect(() => {
    if (open) loadAll();
  }, [open, eventId]);

  const assignedReservationIds = useMemo(() => new Set(assignments.map((a) => a.reservation_id)), [assignments]);

  const roomsByPackage = useMemo(() => {
    const m: Record<string, Room[]> = {};
    rooms.forEach((r) => {
      const k = r.package_id || "sin";
      m[k] ??= [];
      m[k].push(r);
    });
    return m;
  }, [rooms]);

  const reservationsByPackage = useMemo(() => {
    const m: Record<string, Reservation[]> = {};
    reservations
      .filter((r) => r.reservation_status !== "cancelada" && r.reservation_status !== "rechazada")
      .forEach((r) => {
        const k = r.package_id || "sin";
        m[k] ??= [];
        m[k].push(r);
      });
    return m;
  }, [reservations]);

  const occupantsByRoom = useMemo(() => {
    const m: Record<string, Reservation[]> = {};
    assignments.forEach((a) => {
      const r = reservations.find((x) => x.id === a.reservation_id);
      if (!r) return;
      m[a.room_id] ??= [];
      m[a.room_id].push(r);
    });
    return m;
  }, [assignments, reservations]);

  const createRoom = async (pkgId: string | null) => {
    if (!nrNombre.trim()) {
      toast.error("Nombre requerido");
      return;
    }
    const { error } = await (supabase as any).from("event_rooms").insert({
      event_id: eventId,
      package_id: pkgId,
      nombre: nrNombre.trim(),
      capacidad: nrCapacidad,
      genero: nrGenero || null,
      tipo: nrTipo || inferTipoFromCapacidad(nrCapacidad),
      notas: nrNotas.trim() || null,
      sort_order: rooms.filter((r) => (r.package_id || null) === pkgId).length,
    });
    if (error) {
      toast.error("No se pudo crear: " + error.message);
      return;
    }
    toast.success("Habitación creada");
    setNewRoomOpen(null);
    setNrNombre("");
    setNrCapacidad(2);
    setNrGenero("");
    setNrTipo("");
    setNrNotas("");
    loadAll();
  };
  const duplicateRoom = async (r: Room) => {
    const baseMatch = r.nombre.match(/^(.*?)(\d+)?$/);
    const baseLabel = (baseMatch?.[1] || r.nombre).trim();
    const existingNombres = new Set(rooms.map((x) => x.nombre));
    let newNombre = `${r.nombre} (copia)`;
    let n = 1;
    while (existingNombres.has(newNombre)) {
      n += 1;
      newNombre = baseLabel ? `${baseLabel} ${n}` : `${r.nombre} (copia ${n})`;
    }
    const { error } = await (supabase as any).from("event_rooms").insert({
      event_id: eventId,
      package_id: r.package_id,
      nombre: newNombre,
      capacidad: r.capacidad,
      genero: r.genero || null,
      tipo: r.tipo || inferTipoFromCapacidad(r.capacidad),
      notas: r.notas || null,
      sort_order: rooms.filter((x) => (x.package_id || null) === (r.package_id || null)).length,
    });
    if (error) {
      toast.error("No se pudo duplicar: " + error.message);
      return;
    }
    toast.success("Habitación duplicada");
    loadAll();
  };
  const deleteRoom = async (roomId: string) => {
    if (!confirm("¿Eliminar habitación y liberar sus ocupantes?")) return;
    const { error } = await (supabase as any).from("event_rooms").delete().eq("id", roomId);
    if (error) return toast.error(error.message);
    toast.success("Habitación eliminada");
    loadAll();
  };

  const startEditRoom = (r: Room) => {
    setEditingRoom(r.id);
    setErNombre(r.nombre);
    setErCapacidad(r.capacidad);
    setErGenero(r.genero || "");
    setErTipo(r.tipo || "");
    setErNotas(r.notas || "");
  };

  const saveEditRoom = async () => {
    if (!editingRoom) return;
    const { error } = await (supabase as any)
      .from("event_rooms")
      .update({
        nombre: erNombre.trim(),
        capacidad: erCapacidad,
        genero: erGenero || null,
        tipo: erTipo || inferTipoFromCapacidad(erCapacidad),
        notas: erNotas.trim() || null,
      })
      .eq("id", editingRoom);
    if (error) return toast.error(error.message);
    toast.success("Actualizada");
    setEditingRoom(null);
    loadAll();
  };

  const assignReservation = async (reservationId: string, roomId: string) => {
    // upsert manual
    const existing = assignments.find((a) => a.reservation_id === reservationId);
    if (existing) {
      const { error } = await (supabase as any)
        .from("event_room_assignments")
        .update({ room_id: roomId })
        .eq("id", existing.id);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await (supabase as any)
        .from("event_room_assignments")
        .insert({ room_id: roomId, reservation_id: reservationId });
      if (error) return toast.error(error.message);
    }
    loadAll();
  };

  const unassign = async (reservationId: string) => {
    const existing = assignments.find((a) => a.reservation_id === reservationId);
    if (!existing) return;
    const { error } = await (supabase as any).from("event_room_assignments").delete().eq("id", existing.id);
    if (error) return toast.error(error.message);
    loadAll();
  };

  const autoGenerateIndividual = async (pkgId: string | null, pkgReservations: Reservation[]) => {
    const unassigned = pkgReservations.filter((r) => !assignedReservationIds.has(r.id));
    if (unassigned.length === 0) {
      toast.info("No hay reservas sin asignar en este paquete");
      return;
    }
    if (
      !confirm(
        `Se crearán ${unassigned.length} habitación(es) individuales y se asignará cada participante automáticamente. ¿Continuar?`,
      )
    )
      return;

    const baseOrder = rooms.filter((r) => (r.package_id || null) === pkgId).length;
    const roomsPayload = unassigned.map((r, idx) => ({
      event_id: eventId,
      package_id: pkgId,
      nombre: `Individual ${baseOrder + idx + 1}`,
      capacidad: 1,
      genero: null,
      tipo: "individual",
      notas: null,
      sort_order: baseOrder + idx,
    }));

    const { data: created, error } = await (supabase as any).from("event_rooms").insert(roomsPayload).select("id");
    if (error) {
      toast.error("No se pudieron crear: " + error.message);
      return;
    }

    const assignPayload = (created || []).map((room: any, idx: number) => ({
      room_id: room.id,
      reservation_id: unassigned[idx].id,
    }));
    if (assignPayload.length) {
      const { error: aErr } = await (supabase as any).from("event_room_assignments").insert(assignPayload);
      if (aErr) {
        toast.error("Habitaciones creadas, pero falló asignación: " + aErr.message);
        loadAll();
        return;
      }
    }
    toast.success(`${unassigned.length} habitación(es) individuales creadas y asignadas`);
    loadAll();
  };

  // Auto-generar habitaciones/cabañas según la configuración del paquete
  // Usa personas_por_habitacion como capacidad, y cupo_mujeres/varones/mixto (o cupo total) para decidir cantidad y género.
  const autoGenerateRooms = async (pkg: Pkg) => {
    const cap = Math.max(1, pkg.personas_por_habitacion || 2);
    const totalCupo = pkg.cupo || 0;
    const cm = pkg.cupo_mujeres || 0;
    const cv = pkg.cupo_varones || 0;
    const cx = pkg.cupo_mixto || 0;
    const hasGenero = cm + cv + cx > 0;

    // Buckets objetivo por género
    const buckets: { genero: "mujeres" | "varones" | "mixto" | null; label: string; plazas: number }[] = hasGenero
      ? [
          { genero: "mujeres" as const, label: "Mujeres", plazas: cm },
          { genero: "varones" as const, label: "Varones", plazas: cv },
          { genero: "mixto" as const, label: "Mixto", plazas: cx },
        ].filter((b) => b.plazas > 0)
      : [{ genero: null, label: "", plazas: totalCupo }];

    if (buckets.every((b) => b.plazas <= 0)) {
      toast.error(
        "El paquete no tiene cupos configurados. Definí 'personas por habitación' y cupos (total o por género).",
      );
      return;
    }

    // Descontar plazas ya existentes por género
    const existingByGenero: Record<string, number> = {};
    (roomsByPackage[pkg.id] || []).forEach((r) => {
      const k = r.genero || "_none";
      existingByGenero[k] = (existingByGenero[k] || 0) + r.capacidad;
    });

    // Tipo derivado de la capacidad del paquete (fuente de verdad para el nombre)
    const autoTipo = inferTipoFromCapacidad(cap);
    const roomLabel = tipoLabel(autoTipo);

    type NewRoom = { genero: "mujeres" | "varones" | "mixto" | null; label: string };
    const toCreate: NewRoom[] = [];
    buckets.forEach((b) => {
      const key = b.genero || "_none";
      const remaining = Math.max(0, b.plazas - (existingByGenero[key] || 0));
      const count = Math.ceil(remaining / cap);
      for (let i = 0; i < count; i++) toCreate.push({ genero: b.genero, label: b.label });
    });

    if (toCreate.length === 0) {
      toast.info("Ya hay habitaciones suficientes para el cupo configurado.");
      return;
    }

    const detalle = buckets
      .map((b) => {
        const key = b.genero || "_none";
        const remaining = Math.max(0, b.plazas - (existingByGenero[key] || 0));
        const count = Math.ceil(remaining / cap);
        return count > 0 ? `${count} ${roomLabel.toLowerCase()}${b.label ? ` (${b.label.toLowerCase()})` : ""}` : null;
      })
      .filter(Boolean)
      .join(", ");

    if (!confirm(`Se crearán: ${detalle}. ¿Continuar?`)) return;

    const baseOrder = (roomsByPackage[pkg.id] || []).length;
    // Numeración por género para nombres limpios
    const counters: Record<string, number> = {};
    (roomsByPackage[pkg.id] || []).forEach((r) => {
      const k = r.genero || "_none";
      counters[k] = (counters[k] || 0) + 1;
    });

    const payload = toCreate.map((r, idx) => {
      const k = r.genero || "_none";
      counters[k] = (counters[k] || 0) + 1;
      const suffix = r.label ? ` ${r.label}` : "";
      return {
        event_id: eventId,
        package_id: pkg.id,
        nombre: `${roomLabel}${suffix} ${counters[k]}`.trim(),
        capacidad: cap,
        genero: r.genero,
        tipo: autoTipo,
        notas: null,
        sort_order: baseOrder + idx,
      };
    });

    const { error } = await (supabase as any).from("event_rooms").insert(payload);
    if (error) {
      toast.error("No se pudieron crear: " + error.message);
      return;
    }
    toast.success(`${toCreate.length} habitación(es) creada(s)`);
    loadAll();
  };
  const noLodgingPkgIds = new Set(packages.filter((p) => /sin alojamiento|sin aloj/i.test(p.nombre)).map((p) => p.id));
  const lodgingReservations = reservations.filter((r) => !r.package_id || !noLodgingPkgIds.has(r.package_id));
  const totalPlazas = rooms.reduce((s, r) => s + r.capacidad, 0);
  const totalOcupadas = assignments.length;
  const totalLibres = totalPlazas - totalOcupadas;
  const totalReservas = lodgingReservations.length;
  const sinAsignar = lodgingReservations.filter((r) => !assignedReservationIds.has(r.id)).length;

  const packageBuckets: { id: string | null; label: string; pkg: Pkg | null }[] = [
    ...packages.map((p) => ({ id: p.id, label: p.nombre, pkg: p })),
    { id: null, label: "Sin paquete", pkg: null },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BedDouble className="w-5 h-5 text-primary" /> Alojamiento — {eventTitle}
          </DialogTitle>
          <DialogDescription>
            Definí habitaciones/cabañas, asigná participantes y controlá los últimos cupos.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Totales */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              <MetricCard label="Reservas" value={totalReservas} icon={<Users className="w-4 h-4" />} />
              <MetricCard label="Plazas totales" value={totalPlazas} icon={<Home className="w-4 h-4" />} />
              <MetricCard label="Ocupadas" value={totalOcupadas} color="text-emerald-500" />
              <MetricCard
                label="Libres"
                value={totalLibres}
                color={totalLibres > 0 ? "text-primary" : "text-muted-foreground"}
              />
              <MetricCard
                label="Sin asignar"
                value={sinAsignar}
                color={sinAsignar > 0 ? "text-amber-500" : "text-emerald-500"}
              />
            </div>

            {sinAsignar > 0 && totalLibres < sinAsignar && (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <span>
                  Hay {sinAsignar} reserva(s) sin asignar y solo {totalLibres} plaza(s) libre(s). Considerá crear
                  habitaciones/cabañas adicionales.
                </span>
              </div>
            )}

            {/* Por paquete */}
            {packageBuckets.map(({ id: pkgId, label, pkg }) => {
              const pkgKey = pkgId || "sin";
              const pkgRooms = roomsByPackage[pkgKey] || [];
              const pkgReservations = reservationsByPackage[pkgKey] || [];
              const pkgUnassigned = pkgReservations.filter((r) => !assignedReservationIds.has(r.id));
              const pkgCapacity = pkgRooms.reduce((s, r) => s + r.capacidad, 0);
              // Ocupación real de camas (incluye ocupantes con reserva cancelada, que siguen bloqueando la plaza)
              let pkgBedsUsed = 0;
              let pkgBedsCancel = 0;
              const freeByGenero: Record<string, number> = {};
              pkgRooms.forEach((room) => {
                const occ = occupantsByRoom[room.id] || [];
                pkgBedsUsed += occ.length;
                pkgBedsCancel += occ.filter(
                  (o) => o.reservation_status === "cancelada" || o.reservation_status === "rechazada",
                ).length;
                const free = Math.max(0, room.capacidad - occ.length);
                if (free > 0) {
                  const g = (room as any).genero || "mixto";
                  freeByGenero[g] = (freeByGenero[g] || 0) + free;
                }
              });
              const pkgFree = Math.max(0, pkgCapacity - pkgBedsUsed);
              const freeDetail = Object.entries(freeByGenero)
                .map(([g, n]) => `${n} ${g}`)
                .join(" · ");

              const sinAlojamiento = /sin alojamiento|sin aloj/i.test(label);
              // Los paquetes que no requieren habitación (ej. "camp de un día") no
              // necesitan tarjeta de alojamiento si aún no tienen ni reservas ni habitaciones.
              if (sinAlojamiento && pkgReservations.length === 0 && pkgRooms.length === 0) return null;
              if (sinAlojamiento && pkgRooms.length === 0) {
                return (
                  <div key={pkgKey} className="rounded-xl border border-dashed border-border/60 bg-muted/20 p-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <h3 className="font-heading font-bold text-sm uppercase tracking-wide text-muted-foreground">
                          {label}
                        </h3>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {pkgReservations.length} reserva(s) · sin alojamiento a asignar
                        </p>
                      </div>
                      <Badge variant="outline" className="text-[10px] text-muted-foreground">
                        No requiere habitación
                      </Badge>
                    </div>
                  </div>
                );
              }

              return (
                <div key={pkgKey} className="rounded-xl border border-border bg-card/50 p-4 space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <h3 className="font-heading font-bold text-sm uppercase tracking-wide flex items-center gap-2">
                        {label}
                      </h3>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {pkgReservations.length} reserva(s) · {pkgCapacity} plaza(s) · {pkgBedsUsed} ocupada(s)
                        {pkgBedsCancel > 0 && ` (${pkgBedsCancel} con reserva cancelada)`}
                        {` · ${pkgFree} libre(s)`}
                        {freeDetail && ` → ${freeDetail}`}
                        {pkg?.cupo != null && ` · cupo paquete: ${pkg.cupo}`}
                        {pkg?.personas_por_habitacion != null && ` · ${pkg.personas_por_habitacion}p/hab`}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {pkg?.personas_por_habitacion === 1 && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => autoGenerateIndividual(pkgId, pkgReservations)}
                          disabled={pkgUnassigned.length === 0}
                        >
                          <UserPlus className="w-3.5 h-3.5 mr-1" /> Auto-generar individuales
                        </Button>
                      )}
                      {pkg && (pkg.personas_por_habitacion || 0) > 1 && (
                        <Button size="sm" variant="secondary" onClick={() => autoGenerateRooms(pkg)}>
                          <Wand2 className="w-3.5 h-3.5 mr-1" /> Auto-generar habitaciones
                        </Button>
                      )}
                      <Button size="sm" variant="outline" onClick={() => setNewRoomOpen(pkgKey)}>
                        <Plus className="w-3.5 h-3.5 mr-1" /> Nueva habitación
                      </Button>
                    </div>
                  </div>

                  {/* Nueva habitación inline */}
                  {newRoomOpen === pkgKey && (
                    <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                        <div>
                          <Label className="text-[10px]">Nombre</Label>
                          <Input
                            value={nrNombre}
                            onChange={(e) => setNrNombre(e.target.value)}
                            placeholder="Cabaña 1"
                            className="h-8"
                          />
                        </div>
                        <div>
                          <Label className="text-[10px]">Tipo</Label>
                          <Select
                            value={nrTipo || "auto"}
                            onValueChange={(v) => setNrTipo(v === "auto" ? "" : (v as RoomTipo))}
                          >
                            <SelectTrigger className="h-8">
                              <SelectValue placeholder="Auto" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="auto">Auto (según capacidad)</SelectItem>
                              {TIPO_OPTIONS.map((o) => (
                                <SelectItem key={o.value} value={o.value}>
                                  {o.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-[10px]">Capacidad</Label>
                          <Input
                            type="number"
                            min={1}
                            value={nrCapacidad}
                            onChange={(e) => setNrCapacidad(parseInt(e.target.value) || 1)}
                            className="h-8"
                          />
                        </div>
                        <div>
                          <Label className="text-[10px]">Género</Label>
                          <Select value={nrGenero || "any"} onValueChange={(v) => setNrGenero(v === "any" ? "" : v)}>
                            <SelectTrigger className="h-8">
                              <SelectValue placeholder="Sin definir" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="any">Sin definir</SelectItem>
                              <SelectItem value="mujeres">Mujeres</SelectItem>
                              <SelectItem value="varones">Varones</SelectItem>
                              <SelectItem value="mixto">Mixto</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-[10px]">Notas</Label>
                          <Input
                            value={nrNotas}
                            onChange={(e) => setNrNotas(e.target.value)}
                            placeholder="opcional"
                            className="h-8"
                          />
                        </div>
                      </div>

                      <div className="flex gap-2 justify-end">
                        <Button size="sm" variant="ghost" onClick={() => setNewRoomOpen(null)}>
                          Cancelar
                        </Button>
                        <Button size="sm" onClick={() => createRoom(pkgId)}>
                          Crear
                        </Button>
                      </div>
                    </div>
                  )}

                  <div className="grid md:grid-cols-2 gap-3">
                    {/* Habitaciones */}
                    <div className="space-y-2">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                        Habitaciones ({pkgRooms.length})
                      </div>
                      {pkgRooms.length === 0 && (
                        <div className="text-xs text-muted-foreground italic p-3 rounded border border-dashed border-border">
                          Sin habitaciones creadas.
                        </div>
                      )}
                      {pkgRooms.map((room) => {
                        const occ = occupantsByRoom[room.id] || [];
                        const free = room.capacidad - occ.length;
                        const full = free <= 0;
                        return (
                          <div
                            key={room.id}
                            className={`rounded-lg border p-2.5 ${full ? "border-emerald-500/40 bg-emerald-500/5" : "border-border bg-background"}`}
                          >
                            {editingRoom === room.id ? (
                              <div className="space-y-2">
                                <div className="grid grid-cols-3 gap-2">
                                  <Input
                                    value={erNombre}
                                    onChange={(e) => setErNombre(e.target.value)}
                                    className="h-8 col-span-2"
                                  />
                                  <Input
                                    type="number"
                                    min={1}
                                    value={erCapacidad}
                                    onChange={(e) => setErCapacidad(parseInt(e.target.value) || 1)}
                                    className="h-8"
                                  />
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  <Select
                                    value={erTipo || "auto"}
                                    onValueChange={(v) => setErTipo(v === "auto" ? "" : (v as RoomTipo))}
                                  >
                                    <SelectTrigger className="h-8">
                                      <SelectValue placeholder="Tipo" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="auto">Tipo — Auto</SelectItem>
                                      {TIPO_OPTIONS.map((o) => (
                                        <SelectItem key={o.value} value={o.value}>
                                          {o.label}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <Select
                                    value={erGenero || "any"}
                                    onValueChange={(v) => setErGenero(v === "any" ? "" : v)}
                                  >
                                    <SelectTrigger className="h-8">
                                      <SelectValue placeholder="Género" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="any">Sin definir</SelectItem>
                                      <SelectItem value="mujeres">Mujeres</SelectItem>
                                      <SelectItem value="varones">Varones</SelectItem>
                                      <SelectItem value="mixto">Mixto</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                <Input
                                  value={erNotas}
                                  onChange={(e) => setErNotas(e.target.value)}
                                  placeholder="Notas"
                                  className="h-8"
                                />

                                <div className="flex gap-2 justify-end">
                                  <Button size="sm" variant="ghost" onClick={() => setEditingRoom(null)}>
                                    Cancelar
                                  </Button>
                                  <Button size="sm" onClick={saveEditRoom}>
                                    <Save className="w-3 h-3 mr-1" />
                                    Guardar
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <div className="flex items-start justify-between gap-2 mb-1.5">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className="font-semibold text-sm">{room.nombre}</span>
                                      {tipoBadge(room)}

                                      {generoBadge(room.genero)}
                                      <Badge variant="outline" className="text-[10px]">
                                        {occ.length}/{room.capacidad}
                                      </Badge>
                                      {full && (
                                        <Badge className="bg-emerald-500 text-white text-[10px]">Completa</Badge>
                                      )}
                                    </div>
                                    {room.notas && (
                                      <p className="text-[10px] text-muted-foreground mt-0.5">{room.notas}</p>
                                    )}
                                  </div>
                                  <div className="flex gap-1 shrink-0">
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-6 w-6"
                                      onClick={() => startEditRoom(room)}
                                    >
                                      <Edit2 className="w-3 h-3" />
                                    </Button>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-6 w-6"
                                      title="Duplicar habitación"
                                      onClick={() => duplicateRoom(room)}
                                    >
                                      <Copy className="w-3 h-3" />
                                    </Button>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-6 w-6 text-destructive"
                                      onClick={() => deleteRoom(room.id)}
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </Button>
                                  </div>
                                </div>
                                <div className="space-y-1">
                                  {occ.map((r) => {
                                    const cancelada =
                                      r.reservation_status === "cancelada" || r.reservation_status === "rechazada";
                                    return (
                                      <div
                                        key={r.id}
                                        className={`flex items-center justify-between text-xs rounded px-2 py-1 ${cancelada ? "bg-destructive/10 border border-destructive/30" : "bg-muted/30"}`}
                                      >
                                        <span className="truncate flex items-center gap-1 flex-wrap">
                                          {cancelada && <AlertCircle className="w-3 h-3 text-destructive shrink-0" />}
                                          <span className={cancelada ? "text-destructive line-through" : ""}>
                                            {r.nombre} {r.apellido}
                                          </span>
                                          {cancelada && (
                                            <Badge
                                              variant="outline"
                                              className="text-[9px] bg-destructive/10 text-destructive border-destructive/30"
                                            >
                                              Reserva cancelada — liberar cama
                                            </Badge>
                                          )}
                                          {r.prefiere_asignacion ? (
                                            <Badge
                                              variant="outline"
                                              className="text-[9px] bg-amber-500/10 text-amber-600 border-amber-500/30"
                                            >
                                              Asígnenme
                                            </Badge>
                                          ) : r.habitacion_data?.companero_solicitado || r.tipo_vinculo ? (
                                            <Badge
                                              variant="outline"
                                              className="text-[9px] bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                                            >
                                              Comparte conocido
                                            </Badge>
                                          ) : null}
                                          {r.habitacion_data?.companero_solicitado && (
                                            <span className="text-[10px] text-muted-foreground ml-1">
                                              → {r.habitacion_data.companero_solicitado}
                                            </span>
                                          )}
                                        </span>
                                        <Button
                                          size="icon"
                                          variant="ghost"
                                          className="h-5 w-5 shrink-0"
                                          onClick={() => unassign(r.id)}
                                        >
                                          <X className="w-3 h-3" />
                                        </Button>
                                      </div>
                                    );
                                  })}
                                  {free > 0 && (
                                    <div className="text-[10px] text-primary italic">{free} plaza(s) libre(s)</div>
                                  )}
                                </div>
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Sin asignar */}
                    <div className="space-y-2">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                        Sin asignar ({pkgUnassigned.length})
                      </div>
                      {pkgUnassigned.length === 0 && (
                        <div className="text-xs text-emerald-500 italic p-3 rounded border border-dashed border-emerald-500/30 bg-emerald-500/5">
                          Todas las reservas asignadas ✓
                        </div>
                      )}
                      {pkgUnassigned.map((r) => {
                        const mates = roommateGroups[r.id] || [];
                        return (
                          <div key={r.id} className="rounded-lg border border-border p-2.5 bg-background space-y-1.5">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-medium text-xs">
                                {r.nombre} {r.apellido}
                              </span>
                              {r.prefiere_asignacion ? (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] bg-amber-500/10 text-amber-600 border-amber-500/30"
                                >
                                  Asígnenme
                                </Badge>
                              ) : r.habitacion_data?.companero_solicitado || r.tipo_vinculo || mates.length > 0 ? (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                                >
                                  Comparte con conocido
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-[10px] bg-muted text-muted-foreground">
                                  Sin preferencia
                                </Badge>
                              )}
                              {r.tipo_vinculo && (
                                <Badge variant="outline" className="text-[10px] capitalize">
                                  {r.tipo_vinculo}
                                </Badge>
                              )}
                              {r.habitacion_data?.genero_habitacion && generoBadge(r.habitacion_data.genero_habitacion)}
                              {r.habitacion_data?.tipo_habitacion && (
                                <Badge variant="outline" className="text-[10px] capitalize">
                                  {String(r.habitacion_data.tipo_habitacion).replace(/_/g, " ")}
                                </Badge>
                              )}
                              {mates.length > 0 && (
                                <Badge
                                  className="text-[10px] bg-primary/15 text-primary border-primary/30"
                                  variant="outline"
                                >
                                  👥 Grupo ({mates.length + 1})
                                </Badge>
                              )}
                            </div>
                            {mates.length > 0 && (
                              <p className="text-[10px] text-primary/80">
                                Comparte con: <strong>{mates.join(", ")}</strong>
                              </p>
                            )}
                            {r.habitacion_data?.companero_solicitado && (
                              <p className="text-[10px] text-muted-foreground">
                                Pide compartir con: <strong>{r.habitacion_data.companero_solicitado}</strong>
                              </p>
                            )}
                            {r.habitacion_data?.notas_habitacion && (
                              <p className="text-[10px] text-muted-foreground italic">
                                "{r.habitacion_data.notas_habitacion}"
                              </p>
                            )}

                            <Select value="" onValueChange={(v) => assignReservation(r.id, v)}>
                              <SelectTrigger className="h-7 text-xs">
                                <SelectValue placeholder="Asignar a habitación..." />
                              </SelectTrigger>
                              <SelectContent>
                                {(() => {
                                  const availableRooms = rooms.filter(
                                    (room) => (occupantsByRoom[room.id] || []).length < room.capacidad,
                                  );
                                  if (availableRooms.length === 0) {
                                    return (
                                      <SelectItem value="_none" disabled>
                                        {rooms.length === 0
                                          ? "Sin habitaciones creadas"
                                          : "No hay habitaciones disponibles"}
                                      </SelectItem>
                                    );
                                  }
                                  return availableRooms.map((room) => {
                                    const occ = (occupantsByRoom[room.id] || []).length;
                                    return (
                                      <SelectItem key={room.id} value={room.id}>
                                        {room.nombre} ({occ}/{room.capacidad})
                                        {room.genero ? ` · ${GENERO_LABEL[room.genero]}` : ""}
                                      </SelectItem>
                                    );
                                  });
                                })()}
                              </SelectContent>
                            </Select>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <DialogFooter className="pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Volver atrás
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const MetricCard = ({
  label,
  value,
  color,
  icon,
}: {
  label: string;
  value: number;
  color?: string;
  icon?: React.ReactNode;
}) => (
  <div className="rounded-lg border border-border bg-card p-2.5 text-center">
    <div className={`flex items-center justify-center gap-1 ${color || "text-foreground"}`}>
      {icon}
      <span className="text-lg font-bold font-heading">{value}</span>
    </div>
    <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</div>
  </div>
);

export default EventLodgingManager;
