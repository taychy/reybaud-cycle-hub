import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { ArrowLeft, BellRing, CheckCircle2, XCircle, Loader2, Phone, MessageSquare } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface Row {
  id: string;
  reservation_id: string | null;
  alumno_id: string | null;
  event_id: string;
  package_id: string;
  prospect_nombre: string | null;
  prospect_email: string | null;
  prospect_telefono: string | null;
  genero_preferido: string | null;
  estado: "pendiente" | "contactando_proveedor" | "confirmado" | "rechazado";
  nota_alumno: string | null;
  nota_admin: string | null;
  created_at: string;
  resolved_at: string | null;
  // enriched
  alumno_nombre?: string;
  alumno_email?: string;
  alumno_telefono?: string;
  event_title?: string;
  package_nombre?: string;
}

interface RoomOption {
  id: string;
  nombre: string;
  tipo: string | null;
  genero: string | null;
  capacidad: number;
}

const TIPO_OPTIONS = ["individual", "doble", "triple", "cuadruple", "cabana", "dormitorio", "otro"];
const GEN_OPTIONS = [
  { v: "femenina", l: "Mujeres" },
  { v: "masculina", l: "Varones" },
  { v: "mixta", l: "Mixta" },
];

export default function AdminWaitlistRequests() {
  const [items, setItems] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"pendientes" | "todas">("pendientes");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<Row | null>(null);
  const [rooms, setRooms] = useState<RoomOption[]>([]);
  const [confirmMode, setConfirmMode] = useState<"existing" | "new">("new");
  const [selectedRoom, setSelectedRoom] = useState<string>("");
  const [newRoom, setNewRoom] = useState({ nombre: "", tipo: "otro", genero: "mixta", capacidad: 1 });
  const [notaAdmin, setNotaAdmin] = useState("");

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("event_accommodation_waitlist_requests" as any)
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setLoading(false);
      return;
    }
    const rows = (data || []) as any as Row[];
    const alumnoIds = Array.from(new Set(rows.map((r) => r.alumno_id).filter(Boolean))) as string[];
    const eventIds = Array.from(new Set(rows.map((r) => r.event_id).filter(Boolean)));
    const pkgIds = Array.from(new Set(rows.map((r) => r.package_id).filter(Boolean)));

    const [alumnos, events, packages] = await Promise.all([
      alumnoIds.length ? supabase.from("alumnos").select("id, nombre, apellido, email, telefono").in("id", alumnoIds) : { data: [] as any[] },
      eventIds.length ? supabase.from("events").select("id, title").in("id", eventIds) : { data: [] as any[] },
      pkgIds.length ? supabase.from("event_packages").select("id, nombre").in("id", pkgIds) : { data: [] as any[] },
    ]);
    const aMap: Record<string, any> = {};
    (alumnos.data || []).forEach((a: any) => (aMap[a.id] = a));
    const eMap: Record<string, string> = {};
    (events.data || []).forEach((e: any) => (eMap[e.id] = e.title));
    const pMap: Record<string, string> = {};
    (packages.data || []).forEach((p: any) => (pMap[p.id] = p.nombre));

    setItems(
      rows.map((r) => ({
        ...r,
        alumno_nombre: r.alumno_id && aMap[r.alumno_id] ? `${aMap[r.alumno_id].nombre || ""} ${aMap[r.alumno_id].apellido || ""}`.trim() : r.prospect_nombre || "—",
        alumno_email: r.alumno_id && aMap[r.alumno_id] ? aMap[r.alumno_id].email : r.prospect_email || "",
        alumno_telefono: r.alumno_id && aMap[r.alumno_id] ? aMap[r.alumno_id].telefono : r.prospect_telefono || "",
        event_title: eMap[r.event_id] || "—",
        package_nombre: pMap[r.package_id] || "—",
      })),
    );
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(
    () => items.filter((r) => (filter === "todas" ? true : r.estado === "pendiente" || r.estado === "contactando_proveedor")),
    [items, filter],
  );

  const setEstado = async (row: Row, estado: Row["estado"], nota?: string) => {
    setBusyId(row.id);
    const patch: any = { estado };
    if (nota !== undefined) patch.nota_admin = nota;
    if (estado === "rechazado") {
      patch.resolved_at = new Date().toISOString();
    }
    const { error } = await supabase.from("event_accommodation_waitlist_requests" as any).update(patch).eq("id", row.id);
    setBusyId(null);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Actualizado" });
    load();
  };

  const openConfirmDialog = async (row: Row) => {
    setConfirmDialog(row);
    setNotaAdmin(row.nota_admin || "");
    setConfirmMode("new");
    setSelectedRoom("");
    setNewRoom({
      nombre: "",
      tipo: "otro",
      genero: row.genero_preferido || "mixta",
      capacidad: 1,
    });
    const { data } = await supabase
      .from("event_rooms")
      .select("id, nombre, tipo, genero, capacidad")
      .eq("package_id", row.package_id);
    setRooms(((data as any) || []) as RoomOption[]);
  };

  const submitConfirm = async () => {
    if (!confirmDialog) return;
    setBusyId(confirmDialog.id);
    const { data, error } = await supabase.rpc("confirm_waitlist_request" as any, {
      p_request_id: confirmDialog.id,
      p_room_id: confirmMode === "existing" ? selectedRoom || null : null,
      p_new_room_nombre: confirmMode === "new" ? newRoom.nombre : "",
      p_new_room_tipo: confirmMode === "new" ? newRoom.tipo : "",
      p_new_room_genero: confirmMode === "new" ? newRoom.genero : "",
      p_new_room_capacidad: newRoom.capacidad || 1,
      p_nota_admin: notaAdmin,
    });
    setBusyId(null);
    if (error || !(data as any)?.ok) {
      toast({ title: "No se pudo confirmar", description: error?.message || "Error", variant: "destructive" });
      return;
    }
    toast({ title: "Cupo confirmado", description: "Se aumentó la capacidad del alojamiento." });
    setConfirmDialog(null);
    load();
  };

  const estadoBadge = (e: Row["estado"]) => {
    const map: Record<Row["estado"], string> = {
      pendiente: "border-yellow-500/40 text-yellow-500",
      contactando_proveedor: "border-blue-500/40 text-blue-400",
      confirmado: "border-emerald-500/40 text-emerald-400",
      rechazado: "border-destructive/40 text-destructive",
    };
    const label: Record<Row["estado"], string> = {
      pendiente: "Pendiente",
      contactando_proveedor: "Contactando proveedor",
      confirmado: "Confirmado",
      rechazado: "Rechazado",
    };
    return <Badge variant="outline" className={map[e]}>{label[e]}</Badge>;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link to="/admin/resumen" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-lg font-heading uppercase tracking-wider flex items-center gap-2">
            <BellRing className="w-5 h-5 text-primary" />
            Solicitudes de alojamiento
          </h1>
        </div>
        <div className="flex gap-1">
          <Button variant={filter === "pendientes" ? "default" : "outline"} size="sm" onClick={() => setFilter("pendientes")}>Pendientes</Button>
          <Button variant={filter === "todas" ? "default" : "outline"} size="sm" onClick={() => setFilter("todas")}>Todas</Button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground animate-pulse">Cargando…</p>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Sin solicitudes.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((row) => (
            <Card key={row.id} className="border-border">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-sm font-heading uppercase tracking-wider">{row.alumno_nombre}</CardTitle>
                    <p className="text-[11px] text-muted-foreground">{row.alumno_email}</p>
                    {row.alumno_telefono && (
                      <p className="text-[11px] text-muted-foreground flex items-center gap-1"><Phone className="w-3 h-3" />{row.alumno_telefono}</p>
                    )}
                    <p className="text-[11px] text-muted-foreground mt-1">{row.event_title}</p>
                  </div>
                  {estadoBadge(row.estado)}
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Paquete solicitado</span>
                  <span className="font-medium">{row.package_nombre}</span>
                </div>
                {row.genero_preferido && (
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Preferencia</span>
                    <span className="capitalize">{row.genero_preferido}</span>
                  </div>
                )}
                {row.nota_alumno && (
                  <p className="text-xs italic border-l-2 border-border pl-2 text-muted-foreground flex gap-1">
                    <MessageSquare className="w-3 h-3 mt-0.5 shrink-0" />
                    <span>{row.nota_alumno}</span>
                  </p>
                )}
                {row.nota_admin && (
                  <p className="text-xs border-l-2 border-primary/40 pl-2 text-foreground/80">
                    <strong>Nota interna:</strong> {row.nota_admin}
                  </p>
                )}

                {(row.estado === "pendiente" || row.estado === "contactando_proveedor") && (
                  <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
                    {row.estado === "pendiente" && (
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEstado(row, "contactando_proveedor")} disabled={busyId === row.id}>
                        Contactando proveedor
                      </Button>
                    )}
                    <Button size="sm" className="h-7 text-xs" onClick={() => openConfirmDialog(row)} disabled={busyId === row.id}>
                      <CheckCircle2 className="w-3 h-3 mr-1" /> Confirmar y asignar cupo
                    </Button>
                    <div className="flex-1" />
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEstado(row, "rechazado")} disabled={busyId === row.id}>
                      <XCircle className="w-3 h-3 mr-1" /> Rechazar
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!confirmDialog} onOpenChange={(o) => !o && setConfirmDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Confirmar y asignar cupo</DialogTitle>
            <DialogDescription>
              Aumentá la capacidad de una habitación existente o creá una nueva para <strong>{confirmDialog?.package_nombre}</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="flex gap-2">
              <Button size="sm" variant={confirmMode === "new" ? "default" : "outline"} onClick={() => setConfirmMode("new")}>Nueva habitación</Button>
              <Button size="sm" variant={confirmMode === "existing" ? "default" : "outline"} onClick={() => setConfirmMode("existing")} disabled={rooms.length === 0}>
                Aumentar existente
              </Button>
            </div>

            {confirmMode === "existing" ? (
              <div>
                <Label>Habitación</Label>
                <Select value={selectedRoom} onValueChange={setSelectedRoom}>
                  <SelectTrigger><SelectValue placeholder="Elegí una habitación" /></SelectTrigger>
                  <SelectContent>
                    {rooms.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.nombre} · {r.tipo || "otro"} · {r.genero || "mixta"} · cap {r.capacidad}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="mt-2">
                  <Label>Cupos a sumar</Label>
                  <Input type="number" min={1} value={newRoom.capacidad} onChange={(e) => setNewRoom({ ...newRoom, capacidad: parseInt(e.target.value || "1", 10) })} />
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div>
                  <Label>Nombre</Label>
                  <Input value={newRoom.nombre} onChange={(e) => setNewRoom({ ...newRoom, nombre: e.target.value })} placeholder="Ej: Doble extra 3" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label>Tipo</Label>
                    <Select value={newRoom.tipo} onValueChange={(v) => setNewRoom({ ...newRoom, tipo: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TIPO_OPTIONS.map((t) => (<SelectItem key={t} value={t}>{t}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Género</Label>
                    <Select value={newRoom.genero} onValueChange={(v) => setNewRoom({ ...newRoom, genero: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {GEN_OPTIONS.map((g) => (<SelectItem key={g.v} value={g.v}>{g.l}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>Capacidad</Label>
                  <Input type="number" min={1} value={newRoom.capacidad} onChange={(e) => setNewRoom({ ...newRoom, capacidad: parseInt(e.target.value || "1", 10) })} />
                </div>
              </div>
            )}

            <div>
              <Label>Nota interna</Label>
              <Textarea value={notaAdmin} onChange={(e) => setNotaAdmin(e.target.value)} rows={2} placeholder="Ej: Proveedor confirmó habitación adicional" />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialog(null)}>Cancelar</Button>
            <Button onClick={submitConfirm} disabled={busyId === confirmDialog?.id || (confirmMode === "existing" && !selectedRoom)}>
              {busyId === confirmDialog?.id ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <CheckCircle2 className="w-4 h-4 mr-1" />}
              Confirmar cupo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
