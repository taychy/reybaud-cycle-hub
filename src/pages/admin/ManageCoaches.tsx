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
import { UserCog, Edit2, Plus, Eye, MailPlus } from "lucide-react";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";

const GRUPOS = ["G1", "G2", "G3", "G4", "Principiante", "Sin grupo"] as const;

interface Coach {
  id: string;
  user_id: string;
  nombre: string;
  email: string;
  grupos: string[];
  estado: string;
  created_at: string;
}

const ManageCoaches = () => {
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"todos" | "pendientes" | "activos">("todos");
  const [editCoach, setEditCoach] = useState<Coach | null>(null);
  const [selectedGrupos, setSelectedGrupos] = useState<string[]>([]);
  const [selectedEstado, setSelectedEstado] = useState("pendiente");
  const [saving, setSaving] = useState(false);
  const [detailCoach, setDetailCoach] = useState<Coach | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ nombre: "", email: "" });
  const [creating, setCreating] = useState(false);

  const isMobile = useIsMobile();

  const fetchCoaches = async () => {
    const { data } = await supabase.from("coaches").select("*").order("created_at", { ascending: false });
    setCoaches((data as any) || []);
    setLoading(false);
  };

  useEffect(() => { fetchCoaches(); }, []);

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

  const handleResendInvite = async (coach: Coach) => {
    if ((coach as any).password_set) {
      const confirmed = window.confirm(`${coach.nombre} ya activó su cuenta. ¿Reenviar invitación de todos modos?`);
      if (!confirmed) return;
    }
    try {
      const { data, error } = await supabase.functions.invoke("invite-user", {
        body: { type: "coach", nombre: coach.nombre, email: coach.email },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`Invitación reenviada a ${coach.email}`);
    } catch (err: any) {
      toast.error(err.message || "Error al reenviar invitación");
    }
  };

  const openEdit = (coach: Coach) => {
    setEditCoach(coach);
    setSelectedGrupos(coach.grupos || []);
    setSelectedEstado(coach.estado);
  };

  const toggleGrupo = (grupo: string) => {
    setSelectedGrupos((prev) =>
      prev.includes(grupo) ? prev.filter((g) => g !== grupo) : [...prev, grupo]
    );
  };

  const handleSave = async () => {
    if (!editCoach) return;
    setSaving(true);
    await supabase
      .from("coaches")
      .update({ grupos: selectedGrupos, estado: selectedEstado } as any)
      .eq("id", editCoach.id);
    toast.success(`Coach ${editCoach.nombre} actualizado`);
    setEditCoach(null);
    setSaving(false);
    fetchCoaches();
  };

  const pendingCount = coaches.filter((c) => !(c as any).password_set && (c as any).invited_at).length;
  const filteredCoaches = coaches.filter((c) => {
    if (statusFilter === "pendientes") return !(c as any).password_set && (c as any).invited_at;
    if (statusFilter === "activos") return (c as any).password_set;
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
                      Clave pendiente
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
                            Clave pendiente
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      {!(coach as any).password_set && (coach as any).invited_at && (
                        <Button variant="ghost" size="sm" onClick={() => handleResendInvite(coach)} className="text-xs">
                          <MailPlus className="w-3 h-3 mr-1" /> Reenviar
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => openEdit(coach)} className="text-xs">
                        <Edit2 className="w-3 h-3 mr-1" /> Editar
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
              </div>
              <div className="flex flex-col gap-2 pt-2 border-t border-border">
                {!(detailCoach as any).password_set && (detailCoach as any).invited_at && (
                  <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => {
                    handleResendInvite(detailCoach);
                    setDetailCoach(null);
                  }}>
                    <MailPlus className="w-3 h-3 mr-2" /> Reenviar invitación
                  </Button>
                )}
                <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => {
                  openEdit(detailCoach);
                  setDetailCoach(null);
                }}>
                  <Edit2 className="w-3 h-3 mr-2" /> Editar coach
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
                {GRUPOS.filter((g) => g !== "Sin grupo").map((grupo) => (
                  <label key={grupo} className="flex items-center gap-2 p-2 rounded-md glass-card cursor-pointer">
                    <Checkbox checked={selectedGrupos.includes(grupo)} onCheckedChange={() => toggleGrupo(grupo)} />
                    <span className="text-sm text-foreground">{grupo}</span>
                  </label>
                ))}
              </div>
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
    </div>
  );
};

export default ManageCoaches;
