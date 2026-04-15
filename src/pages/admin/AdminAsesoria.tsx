import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, Users, UserCog } from "lucide-react";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

interface Asignacion {
  id: string;
  alumno_id: string;
  coach_id: string;
  activa: boolean;
  fecha_inicio: string;
  fecha_fin: string | null;
  notas: string | null;
  alumnos: { id: string; nombre: string; apellido: string | null; email: string; grupo: string } | null;
  coaches: { id: string; nombre: string; email: string } | null;
}

interface Coach {
  id: string;
  nombre: string;
  email: string;
}

interface Alumno {
  id: string;
  nombre: string;
  apellido: string | null;
  email: string;
  grupo: string;
}

const AdminAsesoria = () => {
  const [asignaciones, setAsignaciones] = useState<Asignacion[]>([]);
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [alumnosPersonalizado, setAlumnosPersonalizado] = useState<Alumno[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [form, setForm] = useState({ alumno_id: "", coach_id: "", notas: "" });

  const fetchAll = async () => {
    const [asigRes, coachRes, alumRes] = await Promise.all([
      supabase
        .from("asesoria_asignaciones")
        .select("id, alumno_id, coach_id, activa, fecha_inicio, fecha_fin, notas, alumnos(id, nombre, apellido, email, grupo), coaches(id, nombre, email)")
        .order("created_at", { ascending: false }),
      supabase.from("coaches").select("id, nombre, email").eq("estado", "activo"),
      supabase.from("alumnos").select("id, nombre, apellido, email, grupo").eq("grupo", "Personalizado" as any).eq("estado", "activo"),
    ]);

    setAsignaciones((asigRes.data as any) || []);
    setCoaches(coachRes.data || []);
    setAlumnosPersonalizado((alumRes.data as any) || []);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const assignedAlumnoIds = asignaciones.filter((a) => a.activa).map((a) => a.alumno_id);
  const availableAlumnos = alumnosPersonalizado.filter((a) => !assignedAlumnoIds.includes(a.id));

  const handleCreate = async () => {
    if (!form.alumno_id || !form.coach_id) return;
    setCreating(true);

    const { error } = await supabase.from("asesoria_asignaciones").insert({
      alumno_id: form.alumno_id,
      coach_id: form.coach_id,
      notas: form.notas.trim() || null,
    } as any);

    setCreating(false);
    if (error) {
      toast.error("Error al crear asignación");
      return;
    }

    toast.success("Asignación creada");
    setShowCreate(false);
    setForm({ alumno_id: "", coach_id: "", notas: "" });
    fetchAll();
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await supabase.from("asesoria_asignaciones").update({ activa: false, fecha_fin: new Date().toISOString().split("T")[0] } as any).eq("id", deleteId);
    toast.success("Asignación desactivada");
    setDeleteId(null);
    fetchAll();
  };

  if (loading) {
    return <div className="flex items-center justify-center py-12"><p className="text-muted-foreground">Cargando...</p></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold text-foreground">Asesoría Personalizada</h1>
          <p className="text-sm text-muted-foreground">Gestión de asignaciones coach ↔ alumno</p>
        </div>
        <Button variant="gold" onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Nueva asignación
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Users className="w-8 h-8 text-primary" />
            <div>
              <p className="text-2xl font-bold">{alumnosPersonalizado.length}</p>
              <p className="text-xs text-muted-foreground">Alumnos personalizados</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <UserCog className="w-8 h-8 text-primary" />
            <div>
              <p className="text-2xl font-bold">{asignaciones.filter((a) => a.activa).length}</p>
              <p className="text-xs text-muted-foreground">Asignaciones activas</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Users className="w-8 h-8 text-amber-500" />
            <div>
              <p className="text-2xl font-bold">{availableAlumnos.length}</p>
              <p className="text-xs text-muted-foreground">Sin coach asignado</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      {asignaciones.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>No hay asignaciones aún</p>
          <p className="text-xs mt-1">Asigná un alumno del grupo "Personalizado" a un coach</p>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Alumno</TableHead>
                <TableHead>Coach</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Desde</TableHead>
                <TableHead>Notas</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {asignaciones.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>
                    <p className="font-medium">{a.alumnos?.nombre} {a.alumnos?.apellido || ""}</p>
                    <p className="text-xs text-muted-foreground">{a.alumnos?.email}</p>
                  </TableCell>
                  <TableCell>{a.coaches?.nombre}</TableCell>
                  <TableCell>
                    <Badge variant={a.activa ? "default" : "secondary"}>
                      {a.activa ? "Activa" : "Inactiva"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">{a.fecha_inicio}</TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{a.notas || "—"}</TableCell>
                  <TableCell>
                    {a.activa && (
                      <Button variant="ghost" size="icon" onClick={() => setDeleteId(a.id)}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nueva asignación</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Alumno *</label>
              {availableAlumnos.length === 0 ? (
                <p className="text-sm text-muted-foreground">No hay alumnos del grupo "Personalizado" sin coach asignado. Cambiá el grupo de un alumno a "Personalizado" primero.</p>
              ) : (
                <Select value={form.alumno_id} onValueChange={(v) => setForm((p) => ({ ...p, alumno_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar alumno" /></SelectTrigger>
                  <SelectContent>
                    {availableAlumnos.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.nombre} {a.apellido || ""} — {a.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Coach *</label>
              <Select value={form.coach_id} onValueChange={(v) => setForm((p) => ({ ...p, coach_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Seleccionar coach" /></SelectTrigger>
                <SelectContent>
                  {coaches.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.nombre} — {c.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Notas</label>
              <Textarea
                value={form.notas}
                onChange={(e) => setForm((p) => ({ ...p, notas: e.target.value }))}
                placeholder="Observaciones, objetivos..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancelar</Button>
            <Button variant="gold" onClick={handleCreate} disabled={creating || !form.alumno_id || !form.coach_id}>
              {creating ? "Creando..." : "Asignar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Desactivar asignación?</AlertDialogTitle>
            <AlertDialogDescription>
              El alumno dejará de estar vinculado a este coach. Los entrenamientos creados se mantienen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Desactivar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminAsesoria;
