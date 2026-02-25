import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShieldCheck, Edit2, Plus, Trash2, UserX, UserCheck } from "lucide-react";
import { toast } from "sonner";

interface AdminProfile {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  role: "super_admin" | "admin" | "support";
  status: string;
  last_login_at: string | null;
  created_at: string;
}

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  support: "Soporte",
};

const ManageAdmins = () => {
  const [admins, setAdmins] = useState<AdminProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserProfile, setCurrentUserProfile] = useState<AdminProfile | null>(null);

  // Create dialog
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ first_name: "", last_name: "", email: "", role: "admin" as string });
  const [creating, setCreating] = useState(false);

  // Edit dialog
  const [editAdmin, setEditAdmin] = useState<AdminProfile | null>(null);
  const [editRole, setEditRole] = useState("admin");
  const [editStatus, setEditStatus] = useState("active");
  const [saving, setSaving] = useState(false);

  const isSuperAdmin = currentUserProfile?.role === "super_admin";

  const fetchAdmins = async () => {
    const { data, error } = await supabase
      .from("admin_profiles")
      .select("*")
      .order("created_at", { ascending: false });
    if (!error && data) setAdmins(data as any);
    setLoading(false);
  };

  const fetchCurrentProfile = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { data } = await supabase
      .from("admin_profiles")
      .select("*")
      .eq("user_id", session.user.id)
      .maybeSingle();
    if (data) setCurrentUserProfile(data as any);
  };

  useEffect(() => {
    fetchAdmins();
    fetchCurrentProfile();
  }, []);

  const handleCreate = async () => {
    if (!createForm.first_name.trim() || !createForm.last_name.trim() || !createForm.email.trim()) {
      toast.error("Completá todos los campos");
      return;
    }
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke("invite-admin", {
        body: {
          first_name: createForm.first_name.trim(),
          last_name: createForm.last_name.trim(),
          email: createForm.email.trim().toLowerCase(),
          role: createForm.role,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Invitación enviada correctamente");
      setShowCreate(false);
      setCreateForm({ first_name: "", last_name: "", email: "", role: "admin" });
      fetchAdmins();
    } catch (err: any) {
      toast.error(err.message || "Error al crear admin");
    } finally {
      setCreating(false);
    }
  };

  const openEdit = (admin: AdminProfile) => {
    setEditAdmin(admin);
    setEditRole(admin.role);
    setEditStatus(admin.status);
  };

  const handleSaveEdit = async () => {
    if (!editAdmin) return;
    setSaving(true);
    const { error } = await supabase
      .from("admin_profiles")
      .update({ role: editRole, status: editStatus } as any)
      .eq("id", editAdmin.id);
    if (error) {
      toast.error("Error al guardar");
    } else {
      toast.success(`Admin ${editAdmin.first_name} actualizado`);
      setEditAdmin(null);
      fetchAdmins();
    }
    setSaving(false);
  };

  const handleDelete = async (admin: AdminProfile) => {
    if (admin.user_id === currentUserProfile?.user_id) {
      const superAdminCount = admins.filter((a) => a.role === "super_admin").length;
      if (superAdminCount <= 1) {
        toast.error("No podés eliminarte si sos el último Super Admin");
        return;
      }
    }
    if (!confirm(`¿Eliminar al admin ${admin.first_name} ${admin.last_name}?`)) return;
    const { error } = await supabase.from("admin_profiles").delete().eq("id", admin.id);
    if (error) {
      toast.error("Error al eliminar");
    } else {
      toast.success("Admin eliminado");
      fetchAdmins();
    }
  };

  const toggleStatus = async (admin: AdminProfile) => {
    const newStatus = admin.status === "active" ? "suspended" : "active";
    await supabase.from("admin_profiles").update({ status: newStatus } as any).eq("id", admin.id);
    toast.success(`Admin ${admin.first_name} ${newStatus === "active" ? "activado" : "suspendido"}`);
    fetchAdmins();
  };

  const formatDate = (d: string | null) => {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-6 h-6 text-primary" />
            <h2 className="text-2xl font-heading font-bold uppercase tracking-wider text-foreground">
              Gestionar Admins
            </h2>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {admins.length} administrador{admins.length !== 1 ? "es" : ""}
          </p>
        </div>
        {isSuperAdmin && (
          <Button variant="gold" onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4 mr-1" /> Agregar Admin
          </Button>
        )}
      </div>

      <div className="glass-card rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="text-muted-foreground">Nombre</TableHead>
              <TableHead className="text-muted-foreground">Email</TableHead>
              <TableHead className="text-muted-foreground">Rol</TableHead>
              <TableHead className="text-muted-foreground">Estado</TableHead>
              <TableHead className="text-muted-foreground">Último acceso</TableHead>
              {isSuperAdmin && <TableHead className="text-muted-foreground text-right">Acciones</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">Cargando...</TableCell>
              </TableRow>
            ) : admins.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">No hay admins registrados</TableCell>
              </TableRow>
            ) : (
              admins.map((admin) => (
                <TableRow key={admin.id} className="border-border">
                  <TableCell className="font-medium text-foreground">
                    {admin.first_name} {admin.last_name}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{admin.email}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-xs">
                      {ROLE_LABELS[admin.role] || admin.role}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={admin.status === "active" ? "default" : "outline"}
                      className="text-xs"
                    >
                      {admin.status === "active" ? "Activo" : "Suspendido"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {formatDate(admin.last_login_at)}
                  </TableCell>
                  {isSuperAdmin && (
                    <TableCell className="text-right space-x-1">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(admin)} className="text-xs">
                        <Edit2 className="w-3 h-3 mr-1" /> Editar
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => toggleStatus(admin)} className="text-xs">
                        {admin.status === "active" ? (
                          <><UserX className="w-3 h-3 mr-1" /> Suspender</>
                        ) : (
                          <><UserCheck className="w-3 h-3 mr-1" /> Activar</>
                        )}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(admin)} className="text-xs text-destructive hover:text-destructive">
                        <Trash2 className="w-3 h-3 mr-1" /> Eliminar
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Create admin dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="font-heading uppercase tracking-wider">Agregar Admin</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nombre</Label>
              <Input
                value={createForm.first_name}
                onChange={(e) => setCreateForm({ ...createForm, first_name: e.target.value })}
                className="bg-secondary border-border"
                placeholder="Nombre"
              />
            </div>
            <div className="space-y-2">
              <Label>Apellido</Label>
              <Input
                value={createForm.last_name}
                onChange={(e) => setCreateForm({ ...createForm, last_name: e.target.value })}
                className="bg-secondary border-border"
                placeholder="Apellido"
              />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={createForm.email}
                onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                className="bg-secondary border-border"
                placeholder="admin@ejemplo.com"
              />
            </div>
            <div className="space-y-2">
              <Label>Rol</Label>
              <Select value={createForm.role} onValueChange={(v) => setCreateForm({ ...createForm, role: v })}>
                <SelectTrigger className="bg-secondary border-border"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="super_admin">Super Admin</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="support">Soporte</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancelar</Button>
            <Button variant="gold" disabled={creating} onClick={handleCreate}>
              {creating ? "Enviando..." : "Enviar invitación"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit admin dialog */}
      <Dialog open={!!editAdmin} onOpenChange={(open) => { if (!open) setEditAdmin(null); }}>
        <DialogContent className="sm:max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="font-heading uppercase tracking-wider">
              Editar: {editAdmin?.first_name} {editAdmin?.last_name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Rol</Label>
              <Select value={editRole} onValueChange={setEditRole}>
                <SelectTrigger className="bg-secondary border-border"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="super_admin">Super Admin</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="support">Soporte</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Estado</Label>
              <Select value={editStatus} onValueChange={setEditStatus}>
                <SelectTrigger className="bg-secondary border-border"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Activo</SelectItem>
                  <SelectItem value="suspended">Suspendido</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditAdmin(null)}>Cancelar</Button>
            <Button variant="gold" disabled={saving} onClick={handleSaveEdit}>
              {saving ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ManageAdmins;
