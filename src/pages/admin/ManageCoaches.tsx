import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { UserCog, Edit2, Plus, Eye, MailPlus, Trash2, Calendar, Plane } from "lucide-react";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import CoachAgendaGrupal from "@/components/admin/CoachAgendaGrupal";
import AusenciasCoachManager from "@/components/AusenciasCoachManager";
import { effectiveCoachSedes, diffCoachSedes, resolvePrincipalSede } from "@/lib/coachSedes";
import { buildGrupoOptions, resolveCoachPhone, type AlumnoContactRow } from "@/lib/coachContact";


interface Coach {
  id: string;
  user_id: string;
  nombre: string;
  email: string;
  grupos: string[];
  estado: string;
  created_at: string;
  sede_id: string | null;
}

interface Sede {
  id: string;
  nombre: string;
}

const ManageCoaches = () => {
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"todos" | "pendientes" | "activos">("todos");
  const [editCoach, setEditCoach] = useState<Coach | null>(null);
  const [selectedGrupos, setSelectedGrupos] = useState<string[]>([]);
  const [selectedEstado, setSelectedEstado] = useState("pendiente");
  const [selectedSedeId, setSelectedSedeId] = useState<string | null>(null);
  const [selectedSedeIds, setSelectedSedeIds] = useState<string[]>([]);
  const [coachSedesMap, setCoachSedesMap] = useState<Record<string, string[]>>({});
  const [coachesConActividad, setCoachesConActividad] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [detailCoach, setDetailCoach] = useState<Coach | null>(null);
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [whatsapp, setWhatsapp] = useState("");
  const [whatsappSource, setWhatsappSource] = useState<"coach" | "alumno" | "none">("none");
  const [derivedWhatsapp, setDerivedWhatsapp] = useState("");

  const [gruposDisponibles, setGruposDisponibles] = useState<string[]>(buildGrupoOptions([]));



  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ nombre: "", email: "" });
  const [creating, setCreating] = useState(false);

  const isMobile = useIsMobile();

  const fetchCoaches = async () => {
    const hoy = new Date();
    const hoyIso = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`;
    const [{ data }, { data: rel }, { data: ag }, { data: dc }, { data: rt }] = await Promise.all([
      supabase.from("coaches").select("*").order("created_at", { ascending: false }),
      supabase.from("coach_sedes" as any).select("coach_id, sede_id"),
      supabase.from("agenda_grupal").select("coach_id").eq("activo", true),
      supabase.from("disponibilidad_coaches").select("coach_id").eq("activo", true),
      supabase.from("reservas_turnera").select("coach_id").gte("fecha", hoyIso),
    ]);
    setCoaches((data as any) || []);
    const map: Record<string, string[]> = {};
    ((rel as any[]) || []).forEach((r) => {
      (map[r.coach_id] ||= []).push(r.sede_id);
    });
    setCoachSedesMap(map);
    const activos = new Set<string>();
    [...((ag as any[]) || []), ...((dc as any[]) || []), ...((rt as any[]) || [])].forEach((r) => {
      if (r.coach_id) activos.add(r.coach_id);
    });
    setCoachesConActividad(activos);
    setLoading(false);
  };

  /** Sedes del coach: relación many-to-many, con fallback al sede_id legado. */
  const sedesDeCoach = (coach: Coach) => effectiveCoachSedes(coachSedesMap[coach.id], coach.sede_id);
  const nombreSede = (id: string) => sedes.find((s) => s.id === id)?.nombre || "—";
  /** Coach activo sin clases grupales, disponibilidad ni turnos próximos. */
  const sinActividad = (coach: Coach) =>
    coach.estado === "activo" && !coachesConActividad.has(coach.id);

  useEffect(() => { fetchCoaches(); }, []);

  useEffect(() => {
    supabase.from("sedes").select("id, nombre").eq("activa", true).order("nombre").then(({ data }) => {
      setSedes(data || []);
    });
  }, []);

  // Opciones de "Grupos asignados": base conocida + grupos reales de alumnos.
  useEffect(() => {
    supabase
      .from("alumnos")
      .select("grupo")
      .not("grupo", "is", null)
      .then(({ data }) => {
        const reales = ((data as any[]) || []).map((r) => r.grupo as string);
        setGruposDisponibles(buildGrupoOptions(reales));
      });
  }, []);


  const handleCreateCoach = async () => {
    if (!createForm.nombre.trim() || !createForm.email.trim()) {
      toast.error("Nombre y email son obligatorios");
      return;
    }
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke("invite-user", {
        body: { type: "coach", nombre: createForm.nombre.trim(), email: createForm.email.trim() },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(data?.message || "Coach creado e invitación enviada");
      setShowCreate(false);
      setCreateForm({ nombre: "", email: "" });
      fetchCoaches();
    } catch (err: any) {
      toast.error(err.message || "Error al crear coach");
    } finally {
      setCreating(false);
    }
  };

  const [resending, setResending] = useState<string | null>(null);
  const [deleteCoach, setDeleteCoach] = useState<Coach | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [agendaCoach, setAgendaCoach] = useState<Coach | null>(null);
  const [ausenciasCoach, setAusenciasCoach] = useState<Coach | null>(null);

  const handleResendInvite = async (coach: Coach) => {
    const lastSent = (coach as any).last_invite_sent_at;
    if (lastSent && Date.now() - new Date(lastSent).getTime() < 60_000) {
      toast.error("Esperá 1 minuto antes de reenviar la invitación");
      return;
    }
    setResending(coach.id);
    try {
      const { data, error } = await supabase.functions.invoke("resend-invite", {
        body: { user_type: "coach", email: coach.email },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`Invitación reenviada a ${coach.email}`);
      fetchCoaches();
    } catch (err: any) {
      toast.error(err.message || "Error al reenviar invitación");
    } finally {
      setResending(null);
    }
  };

  const handleDeleteCoach = async () => {
    if (!deleteCoach) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from("coaches").delete().eq("id", deleteCoach.id);
      if (error) throw error;
      toast.success(`Coach ${deleteCoach.nombre} eliminado`);
      setDeleteCoach(null);
      setDetailCoach(null);
      fetchCoaches();
    } catch (err: any) {
      toast.error(err.message || "Error al eliminar coach");
    } finally {
      setDeleting(false);
    }
  };

  const openEdit = async (coach: Coach) => {
    setEditCoach(coach);
    setSelectedGrupos(coach.grupos || []);
    setSelectedEstado(coach.estado);
    setSelectedSedeId(coach.sede_id || null);
    setSelectedSedeIds(effectiveCoachSedes(coachSedesMap[coach.id], coach.sede_id));

    const explicito = ((coach as any).whatsapp || "").trim();
    setWhatsapp(explicito);
    setWhatsappSource(explicito ? "coach" : "none");
    setDerivedWhatsapp("");

    if (explicito) return;

    // Sin override explícito: reutilizamos la ficha de alumno/staff vinculada
    // por user_id y, sólo como fallback, por email exacto normalizado.
    const filtros: string[] = [];
    if (coach.user_id) filtros.push(`user_id.eq.${coach.user_id}`);
    if (coach.email) filtros.push(`email.eq.${coach.email.trim().toLowerCase()}`);
    if (!filtros.length) return;

    const { data } = await supabase
      .from("alumnos")
      .select("user_id, email, telefono")
      .or(filtros.join(","))
      .limit(20);

    const resolved = resolveCoachPhone(
      { whatsapp: null, user_id: coach.user_id, email: coach.email },
      ((data as any[]) || []) as AlumnoContactRow[],
    );
    if (resolved.phone) {
      setWhatsapp(resolved.phone);
      setWhatsappSource("alumno");
      setDerivedWhatsapp(resolved.phone);

    }
  };


  const toggleGrupo = (grupo: string) => {
    setSelectedGrupos((prev) =>
      prev.includes(grupo) ? prev.filter((g) => g !== grupo) : [...prev, grupo]
    );
  };

  const toggleSede = (sedeId: string) => {
    setSelectedSedeIds((prev) =>
      prev.includes(sedeId) ? prev.filter((s) => s !== sedeId) : [...prev, sedeId]
    );
  };

  const handleSave = async () => {
    if (!editCoach) return;
    setSaving(true);

    // Sincronización idempotente de las sedes asignadas (sin duplicados).
    const existentes = coachSedesMap[editCoach.id] || (editCoach.sede_id ? [editCoach.sede_id] : []);
    const { toAdd, toRemove } = diffCoachSedes(existentes, selectedSedeIds);
    if (toAdd.length) {
      await supabase
        .from("coach_sedes" as any)
        .upsert(toAdd.map((sede_id) => ({ coach_id: editCoach.id, sede_id })), { onConflict: "coach_id,sede_id" });
    }
    if (toRemove.length) {
      await supabase.from("coach_sedes" as any).delete().eq("coach_id", editCoach.id).in("sede_id", toRemove);
    }

    // `coaches.sede_id` se mantiene como sede principal para código legado.
    const principal = resolvePrincipalSede(selectedSedeId, selectedSedeIds);

    await supabase
      .from("coaches")
      .update({
        grupos: selectedGrupos,
        estado: selectedEstado,
        sede_id: principal,
        // Si el número mostrado vino de la ficha de alumno y no se editó, no lo
        // duplicamos en `coaches.whatsapp`: sigue resolviéndose dinámicamente.
        whatsapp:
          whatsappSource === "alumno" && whatsapp.trim() === derivedWhatsapp
            ? null
            : whatsapp.trim() || null,

      } as any)
      .eq("id", editCoach.id);
    toast.success(`Coach ${editCoach.nombre} actualizado`);
    setEditCoach(null);
    setSaving(false);
    fetchCoaches();
  };


  const pendingCount = coaches.filter((c) => !(c as any).password_set && (c as any).invited_at).length;
  const filteredCoaches = coaches.filter((c) => {
    if (statusFilter === "pendientes") return !(c as any).password_set && (c as any).invited_at;
    if (statusFilter === "activos") return (c as any).password_set || !(c as any).invited_at;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <UserCog className="w-6 h-6 text-primary" />
            <h2 className="text-xl md:text-2xl font-heading font-bold uppercase tracking-wider text-foreground">
              Gestionar Coaches
            </h2>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {coaches.length} coach{coaches.length !== 1 ? "es" : ""} registrado{coaches.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Button variant="gold" size={isMobile ? "sm" : "default"} onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4 mr-1" /> {isMobile ? "Nuevo" : "Agregar Coach"}
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-1">
        {(["todos", "pendientes", "activos"] as const).map((f) => (
          <Button
            key={f}
            variant={statusFilter === f ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter(f)}
            className="text-xs capitalize"
          >
            {f === "pendientes" ? `Pendientes (${pendingCount})` : f}
          </Button>
        ))}
      </div>

      {/* Mobile card list */}
      {isMobile ? (
        <div className="space-y-3">
          {loading ? (
            <p className="text-center text-muted-foreground py-8">Cargando...</p>
          ) : filteredCoaches.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No hay coaches registrados</p>
          ) : (
            filteredCoaches.map((coach) => (
              <div
                key={coach.id}
                className="glass-card rounded-lg p-4 space-y-2"
                onClick={() => setDetailCoach(coach)}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-foreground text-sm truncate mr-2">{coach.nombre}</span>
                  <Eye className="w-4 h-4 text-muted-foreground shrink-0" />
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {coach.grupos && coach.grupos.length > 0 ? (
                    coach.grupos.map((g) => (
                      <Badge key={g} variant="secondary" className="text-xs">{g}</Badge>
                    ))
                  ) : (
                    <span className="text-muted-foreground text-xs">Sin grupo</span>
                  )}
                  <Badge variant={coach.estado === "activo" ? "default" : "outline"} className="text-xs">
                    {coach.estado}
                  </Badge>
                  {!(coach as any).password_set && (coach as any).invited_at && (
                    <Badge variant="outline" className="text-xs border-yellow-500/50 text-yellow-500">
                       Activación pendiente
                    </Badge>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        /* Desktop table */
        <div className="glass-card rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-muted-foreground">Nombre</TableHead>
                <TableHead className="text-muted-foreground">Email</TableHead>
                <TableHead className="text-muted-foreground">Grupos</TableHead>
                <TableHead className="text-muted-foreground">Estado</TableHead>
                <TableHead className="text-muted-foreground text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">Cargando...</TableCell>
                </TableRow>
              ) : filteredCoaches.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">No hay coaches registrados</TableCell>
                </TableRow>
              ) : (
                filteredCoaches.map((coach) => (
                  <TableRow key={coach.id} className="border-border">
                    <TableCell className="font-medium text-foreground">{coach.nombre}</TableCell>
                    <TableCell className="text-muted-foreground">{coach.email}</TableCell>
                    <TableCell>
                      {coach.grupos && coach.grupos.length > 0 ? (
                        <div className="flex gap-1 flex-wrap">
                          {coach.grupos.map((g) => (
                            <Badge key={g} variant="secondary" className="text-xs">{g}</Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-xs">Sin asignar</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Badge variant={coach.estado === "activo" ? "default" : "outline"} className="text-xs">
                          {coach.estado}
                        </Badge>
                        {!(coach as any).password_set && (coach as any).invited_at && (
                          <Badge variant="outline" className="text-xs border-yellow-500/50 text-yellow-500">
                            Activación pendiente
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      {!(coach as any).password_set && (coach as any).invited_at && (
                        <Button variant="ghost" size="sm" disabled={resending === coach.id} onClick={() => handleResendInvite(coach)} className="text-xs">
                          <MailPlus className="w-3 h-3 mr-1" /> {resending === coach.id ? "Enviando…" : "Reenviar"}
                        </Button>
                      )}
                      {(coach as any).last_invite_sent_at && !(coach as any).password_set && (
                        <span className="text-[10px] text-muted-foreground" title="Último envío">
                          Enviado: {new Date((coach as any).last_invite_sent_at).toLocaleDateString("es-AR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                        </span>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => openEdit(coach)} className="text-xs">
                        <Edit2 className="w-3 h-3 mr-1" /> Editar
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setAgendaCoach(coach)} className="text-xs">
                        <Calendar className="w-3 h-3 mr-1" /> Agenda
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setDeleteCoach(coach)} className="text-xs text-destructive hover:text-destructive">
                        <Trash2 className="w-3 h-3 mr-1" /> Eliminar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Detail dialog (mobile) */}
      <Dialog open={!!detailCoach} onOpenChange={(open) => { if (!open) setDetailCoach(null); }}>
        <DialogContent className="sm:max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="font-heading uppercase tracking-wider text-base">
              {detailCoach?.nombre}
            </DialogTitle>
          </DialogHeader>
          {detailCoach && (
            <div className="space-y-4 py-2">
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Email</span>
                  <span className="text-foreground text-right break-all ml-4">{detailCoach.email}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Grupos</span>
                  <div className="flex gap-1 flex-wrap justify-end">
                    {detailCoach.grupos?.length > 0 ? detailCoach.grupos.map((g) => (
                      <Badge key={g} variant="secondary" className="text-xs">{g}</Badge>
                    )) : <span className="text-muted-foreground text-xs">Sin asignar</span>}
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Estado</span>
                  <Badge variant={detailCoach.estado === "activo" ? "default" : "outline"} className="text-xs">
                    {detailCoach.estado}
                  </Badge>
                </div>
                <div className="flex justify-between items-start gap-4">
                  <span className="text-muted-foreground">Sedes</span>
                  <div className="flex gap-1 flex-wrap justify-end">
                    {sedesDeCoach(detailCoach).length > 0 ? (
                      sedesDeCoach(detailCoach).map((id) => (
                        <Badge key={id} variant="secondary" className="text-xs">{nombreSede(id)}</Badge>
                      ))
                    ) : (
                      <span className="text-muted-foreground text-xs">Sin sede</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex flex-col gap-2 pt-2 border-t border-border">
                {!(detailCoach as any).password_set && (detailCoach as any).invited_at && (
                  <Button variant="outline" size="sm" className="w-full justify-start" disabled={resending === detailCoach.id} onClick={() => {
                    handleResendInvite(detailCoach);
                    setDetailCoach(null);
                  }}>
                    <MailPlus className="w-3 h-3 mr-2" /> {resending === detailCoach.id ? "Enviando…" : "Reenviar invitación"}
                  </Button>
                )}
                {(detailCoach as any).last_invite_sent_at && !(detailCoach as any).password_set && (
                  <span className="text-[10px] text-muted-foreground">
                    Último envío: {new Date((detailCoach as any).last_invite_sent_at).toLocaleDateString("es-AR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </span>
                )}
                <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => {
                  openEdit(detailCoach);
                  setDetailCoach(null);
                }}>
                  <Edit2 className="w-3 h-3 mr-2" /> Editar coach
                </Button>
                <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => {
                  setAgendaCoach(detailCoach);
                  setDetailCoach(null);
                }}>
                  <Calendar className="w-3 h-3 mr-2" /> Ver agenda grupal
                </Button>
                <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => {
                  setAusenciasCoach(detailCoach);
                  setDetailCoach(null);
                }}>
                  <Plane className="w-3 h-3 mr-2" /> Ausencias / Vacaciones
                </Button>
                <Button variant="outline" size="sm" className="w-full justify-start text-destructive hover:text-destructive" onClick={() => {
                  setDeleteCoach(detailCoach);
                  setDetailCoach(null);
                }}>
                  <Trash2 className="w-3 h-3 mr-2" /> Eliminar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit coach dialog */}
      <Dialog open={!!editCoach} onOpenChange={(open) => { if (!open) setEditCoach(null); }}>
        <DialogContent className="sm:max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="font-heading uppercase tracking-wider">
              Editar Coach: {editCoach?.nombre}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Teléfono WhatsApp</Label>
              <Input
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                placeholder="Ej: 11 5555-4444"
                className="bg-secondary border-border"
              />
              <p className="text-[11px] text-muted-foreground">
                {whatsappSource === "alumno"
                  ? "Tomado de la ficha de alumno. Si lo editás, queda guardado como número propio del coach."
                  : "Se usa para los recordatorios de turnos por WhatsApp. Dejalo vacío si no corresponde."}
              </p>

            </div>
            <div className="space-y-2">
              <Label>Estado</Label>

              <Select value={selectedEstado} onValueChange={setSelectedEstado}>
                <SelectTrigger className="bg-secondary border-border"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pendiente">Pendiente</SelectItem>
                  <SelectItem value="activo">Activo</SelectItem>
                  <SelectItem value="inactivo">Inactivo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Grupos asignados</Label>
              <div className="grid grid-cols-2 gap-2">
                {buildGrupoOptions([...gruposDisponibles, ...selectedGrupos]).map((grupo) => (
                  <label key={grupo} className="flex items-center gap-2 p-2 rounded-md glass-card cursor-pointer">
                    <Checkbox checked={selectedGrupos.includes(grupo)} onCheckedChange={() => toggleGrupo(grupo)} />
                    <span className="text-sm text-foreground">{grupo}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Sedes asignadas</Label>
              {sedes.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">No hay sedes activas cargadas.</p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {sedes.map((s) => (
                    <label key={s.id} className="flex items-center gap-2 p-2 rounded-md glass-card cursor-pointer">
                      <Checkbox checked={selectedSedeIds.includes(s.id)} onCheckedChange={() => toggleSede(s.id)} />
                      <span className="text-sm text-foreground">{s.nombre}</span>
                    </label>
                  ))}
                </div>
              )}
              <p className="text-[11px] text-muted-foreground">
                Podés marcar varias. Asignar una sede no crea disponibilidad de turnos: eso se configura en Turnera.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditCoach(null)}>Cancelar</Button>
            <Button variant="gold" disabled={saving} onClick={handleSave}>
              {saving ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create coach dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="font-heading uppercase tracking-wider">Agregar Coach</DialogTitle>
            <DialogDescription>Se enviará una invitación por email para que active su cuenta.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nombre completo *</Label>
              <Input value={createForm.nombre} onChange={(e) => setCreateForm({ ...createForm, nombre: e.target.value })} className="bg-secondary border-border" placeholder="Nombre del coach" />
            </div>
            <div className="space-y-2">
              <Label>Email *</Label>
              <Input type="email" value={createForm.email} onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })} className="bg-secondary border-border" placeholder="coach@ejemplo.com" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancelar</Button>
            <Button variant="gold" disabled={creating} onClick={handleCreateCoach}>
              {creating ? "Enviando..." : "Enviar invitación"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteCoach} onOpenChange={(open) => { if (!open) setDeleteCoach(null); }}>
        <DialogContent className="sm:max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="font-heading uppercase tracking-wider">
              Eliminar coach
            </DialogTitle>
            <DialogDescription>
              ¿Seguro que querés eliminar a <strong>{deleteCoach?.nombre}</strong>? Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteCoach(null)}>Cancelar</Button>
            <Button variant="destructive" disabled={deleting} onClick={handleDeleteCoach}>
              {deleting ? "Eliminando..." : "Eliminar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Agenda grupal dialog */}
      <Dialog open={!!agendaCoach} onOpenChange={open => { if (!open) setAgendaCoach(null); }}>
        <DialogContent className="sm:max-w-2xl bg-card border-border max-h-[85vh] overflow-y-auto">
          {agendaCoach && (
            <CoachAgendaGrupal coachId={agendaCoach.id} coachNombre={agendaCoach.nombre} />
          )}
        </DialogContent>
      </Dialog>
      {/* Ausencias dialog */}
      <Dialog open={!!ausenciasCoach} onOpenChange={open => { if (!open) setAusenciasCoach(null); }}>
        <DialogContent className="sm:max-w-2xl bg-card border-border max-h-[85vh] overflow-y-auto">
          {ausenciasCoach && (
            <AusenciasCoachManager coachId={ausenciasCoach.id} coachNombre={ausenciasCoach.nombre} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ManageCoaches;
