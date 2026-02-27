import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Search, UserCheck, UserX, Edit2, Check, X, CalendarCheck, Trash2, Plus, Eye } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";

type Alumno = Tables<"alumnos">;
const GRUPOS = ["G1", "G2", "G3", "G4", "Principiante", "Sin grupo"] as const;

const ManageStudents = () => {
  const [alumnos, setAlumnos] = useState<Alumno[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editGrupo, setEditGrupo] = useState<string>("");
  const [manualSubAlumno, setManualSubAlumno] = useState<Alumno | null>(null);
  const [manualFechaFin, setManualFechaFin] = useState("");
  const [savingManual, setSavingManual] = useState(false);
  const [deleteAlumno, setDeleteAlumno] = useState<Alumno | null>(null);
  const [detailAlumno, setDetailAlumno] = useState<Alumno | null>(null);

  // Create dialog
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ nombre: "", email: "", telefono: "", documento: "" });
  const [creating, setCreating] = useState(false);

  const isMobile = useIsMobile();

  const fetchAlumnos = async () => {
    const { data } = await supabase.from("alumnos").select("*").order("nombre");
    setAlumnos(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchAlumnos(); }, []);

  const handleCreateAlumno = async () => {
    if (!createForm.nombre.trim() || !createForm.email.trim()) {
      toast.error("Nombre y email son obligatorios");
      return;
    }
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke("invite-user", {
        body: {
          type: "alumno",
          nombre: createForm.nombre.trim(),
          email: createForm.email.trim(),
          telefono: createForm.telefono.trim() || null,
          documento: createForm.documento.trim() || null,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(data?.message || "Alumno creado e invitación enviada");
      setShowCreate(false);
      setCreateForm({ nombre: "", email: "", telefono: "", documento: "" });
      fetchAlumnos();
    } catch (err: any) {
      toast.error(err.message || "Error al crear alumno");
    } finally {
      setCreating(false);
    }
  };

  const toggleEstado = async (alumno: Alumno) => {
    const newEstado = alumno.estado === "activo" ? "inactivo" : "activo";
    await supabase.from("alumnos").update({ estado: newEstado }).eq("id", alumno.id);
    toast.success(`${alumno.nombre} ahora está ${newEstado}`);
    fetchAlumnos();
  };

  const saveGrupo = async (id: string) => {
    await supabase.from("alumnos").update({ grupo: editGrupo as any }).eq("id", id);
    setEditingId(null);
    toast.success("Grupo actualizado");
    fetchAlumnos();
  };

  const handleManualSub = async () => {
    if (!manualSubAlumno || !manualFechaFin) return;
    setSavingManual(true);

    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

    const { data: planes } = await supabase.from("planes").select("id").eq("activo", true).limit(1);
    const planId = planes?.[0]?.id;

    if (!planId) {
      toast.error("No hay planes activos para asociar la suscripción.");
      setSavingManual(false);
      return;
    }

    await supabase
      .from("suscripciones")
      .update({ estado: "vencida" })
      .eq("alumno_id", manualSubAlumno.id)
      .eq("estado", "activa");

    const { error } = await supabase.from("suscripciones").insert({
      alumno_id: manualSubAlumno.id,
      plan_id: planId,
      estado: "activa",
      fecha_inicio: todayStr,
      fecha_fin: manualFechaFin,
      mp_status: "manual",
    });

    if (error) {
      toast.error("Error al crear la suscripción.");
      setSavingManual(false);
      return;
    }

    await supabase.from("alumnos").update({ estado: "activo" }).eq("id", manualSubAlumno.id);

    toast.success(`Suscripción manual creada para ${manualSubAlumno.nombre} hasta ${manualFechaFin}`);
    setManualSubAlumno(null);
    setManualFechaFin("");
    setSavingManual(false);
    fetchAlumnos();
  };

  const handleDeleteAlumno = async () => {
    if (!deleteAlumno) return;
    await supabase.from("entrenamientos_realizados").delete().eq("alumno_id", deleteAlumno.id);
    await supabase.from("suscripciones").delete().eq("alumno_id", deleteAlumno.id);
    const { error } = await supabase.from("alumnos").delete().eq("id", deleteAlumno.id);
    if (error) {
      toast.error("Error al eliminar el alumno.");
    } else {
      toast.success(`${deleteAlumno.nombre} fue eliminado. Deberá registrarse nuevamente para volver a ingresar.`);
    }
    setDeleteAlumno(null);
    fetchAlumnos();
  };

  const filtered = alumnos.filter(
    (a) =>
      a.nombre.toLowerCase().includes(search.toLowerCase()) ||
      a.email.toLowerCase().includes(search.toLowerCase())
  );

  const pendingCount = alumnos.filter((a) => (a as any).grupo_preferido && a.grupo === "Sin grupo").length;

  const openManualSub = (alumno: Alumno) => {
    setManualSubAlumno(alumno);
    const now = new Date();
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    setManualFechaFin(lastDay.toISOString().split("T")[0]);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-xl md:text-2xl font-heading font-bold uppercase tracking-wider text-foreground">
              Gestionar Alumnos
            </h2>
            {pendingCount > 0 && (
              <Badge variant="destructive" className="text-xs animate-pulse">
                {pendingCount} pendiente{pendingCount > 1 ? "s" : ""}
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {alumnos.length} alumnos registrados
          </p>
        </div>
        <Button variant="gold" size={isMobile ? "sm" : "default"} onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4 mr-1" /> {isMobile ? "Nuevo" : "Agregar Alumno"}
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nombre o email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 bg-secondary border-border"
        />
      </div>

      {/* Mobile card list */}
      {isMobile ? (
        <div className="space-y-3">
          {loading ? (
            <p className="text-center text-muted-foreground py-8">Cargando...</p>
          ) : filtered.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No se encontraron alumnos</p>
          ) : (
            filtered.map((alumno) => {
              const grupoPreferido = (alumno as any).grupo_preferido;
              const needsValidation = grupoPreferido && alumno.grupo === "Sin grupo";
              return (
                <div
                  key={alumno.id}
                  className={`glass-card rounded-lg p-4 space-y-2 ${needsValidation ? "border-primary/30 border" : ""}`}
                  onClick={() => setDetailAlumno(alumno)}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-foreground text-sm truncate mr-2">
                      {alumno.nombre}
                    </span>
                    <Eye className="w-4 h-4 text-muted-foreground shrink-0" />
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge
                      variant={alumno.grupo === "Sin grupo" ? "destructive" : "secondary"}
                      className="font-mono text-xs"
                    >
                      {alumno.grupo}
                    </Badge>
                    <Badge variant={alumno.estado === "activo" ? "default" : "outline"} className="text-xs">
                      {alumno.estado}
                    </Badge>
                    {needsValidation && (
                      <span className="text-xs text-primary">Eligió: {grupoPreferido}</span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : (
        /* Desktop table */
        <div className="glass-card rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-muted-foreground">Nombre</TableHead>
                <TableHead className="text-muted-foreground hidden lg:table-cell">Email</TableHead>
                <TableHead className="text-muted-foreground hidden lg:table-cell">DNI/CUIT</TableHead>
                <TableHead className="text-muted-foreground">Grupo</TableHead>
                <TableHead className="text-muted-foreground">Estado</TableHead>
                <TableHead className="text-muted-foreground text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">Cargando...</TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">No se encontraron alumnos</TableCell>
                </TableRow>
              ) : (
                filtered.map((alumno) => {
                  const grupoPreferido = (alumno as any).grupo_preferido;
                  const needsValidation = grupoPreferido && alumno.grupo === "Sin grupo";
                  return (
                    <TableRow key={alumno.id} className={`border-border ${needsValidation ? "bg-primary/5" : ""}`}>
                      <TableCell className="font-medium text-foreground">
                        {alumno.nombre}
                        {needsValidation && (
                          <span className="ml-2 text-xs text-primary font-normal">Eligió: {grupoPreferido}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground hidden lg:table-cell">{alumno.email}</TableCell>
                      <TableCell className="text-muted-foreground font-mono text-xs hidden lg:table-cell">{alumno.documento || "—"}</TableCell>
                      <TableCell>
                        {editingId === alumno.id ? (
                          <div className="flex items-center gap-1">
                            <Select value={editGrupo} onValueChange={setEditGrupo}>
                              <SelectTrigger className="w-28 h-8 bg-secondary border-border text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {GRUPOS.map((g) => (
                                  <SelectItem key={g} value={g}>{g}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => saveGrupo(alumno.id)}>
                              <Check className="w-3 h-3 text-primary" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingId(null)}>
                              <X className="w-3 h-3" />
                            </Button>
                          </div>
                        ) : (
                          <Badge
                            variant={alumno.grupo === "Sin grupo" ? "destructive" : "secondary"}
                            className="font-mono text-xs cursor-pointer"
                            onClick={() => { setEditingId(alumno.id); setEditGrupo(alumno.grupo); }}
                          >
                            {alumno.grupo}
                            <Edit2 className="w-2.5 h-2.5 ml-1" />
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={alumno.estado === "activo" ? "default" : "outline"} className="text-xs">
                          {alumno.estado}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button variant="ghost" size="sm" onClick={() => openManualSub(alumno)} className="text-xs" title="Habilitar suscripción manual">
                          <CalendarCheck className="w-3 h-3 mr-1" /> Habilitar
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => toggleEstado(alumno)} className="text-xs">
                          {alumno.estado === "activo" ? (
                            <><UserX className="w-3 h-3 mr-1" /> Desactivar</>
                          ) : (
                            <><UserCheck className="w-3 h-3 mr-1" /> Activar</>
                          )}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setDeleteAlumno(alumno)} className="text-xs text-destructive hover:text-destructive">
                          <Trash2 className="w-3 h-3 mr-1" /> Eliminar
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Detail dialog (mobile) */}
      <Dialog open={!!detailAlumno} onOpenChange={(open) => { if (!open) setDetailAlumno(null); }}>
        <DialogContent className="sm:max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="font-heading uppercase tracking-wider text-base">
              {detailAlumno?.nombre}
            </DialogTitle>
          </DialogHeader>
          {detailAlumno && (
            <div className="space-y-4 py-2">
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Email</span>
                  <span className="text-foreground text-right break-all ml-4">{detailAlumno.email}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">DNI/CUIT</span>
                  <span className="text-foreground font-mono">{detailAlumno.documento || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Teléfono</span>
                  <span className="text-foreground">{detailAlumno.telefono || "—"}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Grupo</span>
                  <Badge variant={detailAlumno.grupo === "Sin grupo" ? "destructive" : "secondary"} className="font-mono text-xs">
                    {detailAlumno.grupo}
                  </Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Estado</span>
                  <Badge variant={detailAlumno.estado === "activo" ? "default" : "outline"} className="text-xs">
                    {detailAlumno.estado}
                  </Badge>
                </div>
              </div>
              <div className="flex flex-col gap-2 pt-2 border-t border-border">
                <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => {
                  setEditingId(detailAlumno.id);
                  setEditGrupo(detailAlumno.grupo);
                  setDetailAlumno(null);
                }}>
                  <Edit2 className="w-3 h-3 mr-2" /> Cambiar grupo
                </Button>
                <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => {
                  openManualSub(detailAlumno);
                  setDetailAlumno(null);
                }}>
                  <CalendarCheck className="w-3 h-3 mr-2" /> Habilitar suscripción
                </Button>
                <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => {
                  toggleEstado(detailAlumno);
                  setDetailAlumno(null);
                }}>
                  {detailAlumno.estado === "activo" ? (
                    <><UserX className="w-3 h-3 mr-2" /> Desactivar</>
                  ) : (
                    <><UserCheck className="w-3 h-3 mr-2" /> Activar</>
                  )}
                </Button>
                <Button variant="outline" size="sm" className="w-full justify-start text-destructive hover:text-destructive" onClick={() => {
                  setDeleteAlumno(detailAlumno);
                  setDetailAlumno(null);
                }}>
                  <Trash2 className="w-3 h-3 mr-2" /> Eliminar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Manual subscription dialog */}
      <Dialog open={!!manualSubAlumno} onOpenChange={(open) => { if (!open) setManualSubAlumno(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading uppercase tracking-wider">
              Habilitar suscripción manual
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Alumno: <span className="text-foreground font-medium">{manualSubAlumno?.nombre}</span>
            </p>
            <div className="space-y-2">
              <Label htmlFor="fecha-fin">Fecha de vencimiento</Label>
              <Input
                id="fecha-fin"
                type="date"
                value={manualFechaFin}
                onChange={(e) => setManualFechaFin(e.target.value)}
                className="bg-secondary border-border"
              />
              <p className="text-xs text-muted-foreground">
                Útil para pagos en efectivo o meses por adelantado
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManualSubAlumno(null)}>Cancelar</Button>
            <Button variant="gold" disabled={!manualFechaFin || savingManual} onClick={handleManualSub}>
              {savingManual ? "Guardando..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteAlumno} onOpenChange={(open) => { if (!open) setDeleteAlumno(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar a {deleteAlumno?.nombre}?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminarán todos sus datos, suscripciones y registros de entrenamientos. Para volver a usar la app, deberá registrarse nuevamente. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteAlumno} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Create alumno dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="font-heading uppercase tracking-wider">Agregar Alumno</DialogTitle>
            <DialogDescription>Se enviará una invitación por email para que active su cuenta.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nombre completo *</Label>
              <Input value={createForm.nombre} onChange={(e) => setCreateForm({ ...createForm, nombre: e.target.value })} className="bg-secondary border-border" placeholder="Juan Pérez" />
            </div>
            <div className="space-y-2">
              <Label>Email *</Label>
              <Input type="email" value={createForm.email} onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })} className="bg-secondary border-border" placeholder="alumno@ejemplo.com" />
            </div>
            <div className="space-y-2">
              <Label>Teléfono</Label>
              <Input value={createForm.telefono} onChange={(e) => setCreateForm({ ...createForm, telefono: e.target.value })} className="bg-secondary border-border" placeholder="Opcional" />
            </div>
            <div className="space-y-2">
              <Label>DNI/CUIT</Label>
              <Input value={createForm.documento} onChange={(e) => setCreateForm({ ...createForm, documento: e.target.value })} className="bg-secondary border-border" placeholder="Opcional" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancelar</Button>
            <Button variant="gold" disabled={creating} onClick={handleCreateAlumno}>
              {creating ? "Enviando..." : "Enviar invitación"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ManageStudents;
