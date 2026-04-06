import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Shield, Trash2, Plus, Search } from "lucide-react";
import { toast } from "sonner";

interface UserRole {
  id: string;
  user_id: string;
  role: string;
  email?: string;
  nombre?: string;
  source?: string;
}

const ROLE_LABELS: Record<string, { label: string; color: string }> = {
  admin: { label: "Admin", color: "bg-red-500/20 text-red-400 border-red-500/30" },
  coach: { label: "Coach", color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  alumno: { label: "Alumno", color: "bg-green-500/20 text-green-400 border-green-500/30" },
  deposito: { label: "Depósito", color: "bg-orange-500/20 text-orange-400 border-orange-500/30" },
};

const ALL_ROLES = ["admin", "coach", "alumno", "deposito"];

const UserRolesManager = () => {
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [addEmail, setAddEmail] = useState("");
  const [addRole, setAddRole] = useState("alumno");
  const [adding, setAdding] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<UserRole | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchRoles = async () => {
    setLoading(true);
    // Get all user_roles
    const { data: rolesData, error } = await supabase
      .from("user_roles")
      .select("id, user_id, role")
      .order("role");

    if (error || !rolesData) {
      toast.error("Error al cargar roles");
      setLoading(false);
      return;
    }

    // Get emails from all profile tables
    const userIds = [...new Set(rolesData.map((r: any) => r.user_id))];

    const [alumnosRes, adminsRes, coachesRes] = await Promise.all([
      supabase.from("alumnos").select("user_id, email, nombre").in("user_id", userIds),
      supabase.from("admin_profiles").select("user_id, email, first_name, last_name").in("user_id", userIds),
      supabase.from("coaches").select("user_id, email, nombre").in("user_id", userIds),
    ]);

    const emailMap = new Map<string, { email: string; nombre: string; source: string }>();

    adminsRes.data?.forEach((a: any) => {
      emailMap.set(a.user_id, { email: a.email, nombre: `${a.first_name} ${a.last_name}`, source: "admin_profiles" });
    });
    coachesRes.data?.forEach((c: any) => {
      if (!emailMap.has(c.user_id)) emailMap.set(c.user_id, { email: c.email, nombre: c.nombre, source: "coaches" });
    });
    alumnosRes.data?.forEach((a: any) => {
      if (!emailMap.has(a.user_id)) emailMap.set(a.user_id, { email: a.email, nombre: a.nombre, source: "alumnos" });
    });

    const enriched: UserRole[] = rolesData.map((r: any) => {
      const info = emailMap.get(r.user_id);
      return {
        ...r,
        email: info?.email || "—",
        nombre: info?.nombre || "—",
        source: info?.source || "—",
      };
    });

    setRoles(enriched);
    setLoading(false);
  };

  useEffect(() => {
    fetchRoles();
  }, []);

  const filtered = roles.filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      r.email?.toLowerCase().includes(q) ||
      r.nombre?.toLowerCase().includes(q) ||
      r.role.toLowerCase().includes(q)
    );
  });

  // Group by user
  const grouped = new Map<string, UserRole[]>();
  filtered.forEach((r) => {
    const key = r.user_id;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(r);
  });

  const handleAdd = async () => {
    if (!addEmail.trim()) {
      toast.error("Ingresá un email");
      return;
    }
    setAdding(true);
    try {
      // Find user_id from alumnos, admin_profiles, or coaches
      const email = addEmail.trim().toLowerCase();

      const [a, ap, c] = await Promise.all([
        supabase.from("alumnos").select("user_id").eq("email", email).maybeSingle(),
        supabase.from("admin_profiles").select("user_id").eq("email", email).maybeSingle(),
        supabase.from("coaches").select("user_id").eq("email", email).maybeSingle(),
      ]);

      const userId = a.data?.user_id || ap.data?.user_id || c.data?.user_id;
      if (!userId) {
        toast.error("No se encontró un usuario con ese email vinculado a una cuenta");
        setAdding(false);
        return;
      }

      // Check if role already exists
      const existing = roles.find((r) => r.user_id === userId && r.role === addRole);
      if (existing) {
        toast.error(`Este usuario ya tiene el rol "${addRole}"`);
        setAdding(false);
        return;
      }

      const { error } = await supabase
        .from("user_roles")
        .insert({ user_id: userId, role: addRole } as any);

      if (error) throw error;

      toast.success(`Rol "${addRole}" asignado a ${email}`);
      setShowAdd(false);
      setAddEmail("");
      setAddRole("alumno");
      fetchRoles();
    } catch (err: any) {
      toast.error(err.message || "Error al agregar rol");
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { error } = await supabase
        .from("user_roles")
        .delete()
        .eq("id", deleteTarget.id);

      if (error) throw error;

      toast.success(`Rol "${deleteTarget.role}" eliminado de ${deleteTarget.email}`);
      setDeleteTarget(null);
      fetchRoles();
    } catch (err: any) {
      toast.error(err.message || "Error al eliminar rol");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4 mt-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-heading font-bold uppercase tracking-wider text-foreground">
            Roles de Acceso
          </h3>
        </div>
        <Button variant="gold" size="sm" onClick={() => setShowAdd(true)}>
          <Plus className="w-4 h-4 mr-1" /> Asignar Rol
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Gestión directa de la tabla de roles. Agregar o quitar roles determina a qué secciones de la app puede acceder cada usuario.
      </p>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por email, nombre o rol..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 bg-secondary border-border"
        />
      </div>

      <div className="glass-card rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="text-muted-foreground">Usuario</TableHead>
              <TableHead className="text-muted-foreground">Email</TableHead>
              <TableHead className="text-muted-foreground">Roles</TableHead>
              <TableHead className="text-muted-foreground text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground py-8">Cargando...</TableCell>
              </TableRow>
            ) : grouped.size === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground py-8">No se encontraron roles</TableCell>
              </TableRow>
            ) : (
              Array.from(grouped.entries()).map(([userId, userRoles]) => (
                <TableRow key={userId} className="border-border">
                  <TableCell className="font-medium text-foreground text-sm">
                    {userRoles[0].nombre}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {userRoles[0].email}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1 flex-wrap">
                      {userRoles.map((r) => {
                        const info = ROLE_LABELS[r.role] || { label: r.role, color: "bg-muted text-muted-foreground" };
                        return (
                          <Badge key={r.id} variant="outline" className={`text-xs ${info.color}`}>
                            {info.label}
                          </Badge>
                        );
                      })}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1 flex-wrap">
                      {userRoles.map((r) => (
                        <Button
                          key={r.id}
                          variant="ghost"
                          size="sm"
                          className="text-xs text-destructive hover:text-destructive"
                          onClick={() => setDeleteTarget(r)}
                        >
                          <Trash2 className="w-3 h-3 mr-1" />
                          {ROLE_LABELS[r.role]?.label || r.role}
                        </Button>
                      ))}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Add role dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="sm:max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="font-heading uppercase tracking-wider">Asignar Rol</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Email del usuario</label>
              <Input
                type="email"
                value={addEmail}
                onChange={(e) => setAddEmail(e.target.value)}
                className="bg-secondary border-border"
                placeholder="usuario@ejemplo.com"
              />
              <p className="text-xs text-muted-foreground">
                El usuario debe tener una cuenta existente (alumno, admin o coach).
              </p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Rol</label>
              <Select value={addRole} onValueChange={setAddRole}>
                <SelectTrigger className="bg-secondary border-border"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ALL_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROLE_LABELS[r]?.label || r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancelar</Button>
            <Button variant="gold" disabled={adding} onClick={handleAdd}>
              {adding ? "Asignando..." : "Asignar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar rol?</AlertDialogTitle>
            <AlertDialogDescription>
              Vas a quitar el rol <strong>"{deleteTarget?.role}"</strong> de <strong>{deleteTarget?.email}</strong>.
              El usuario perderá acceso a esa sección de la app inmediatamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Eliminando..." : "Eliminar rol"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default UserRolesManager;
