import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Warehouse, Plus, Trash2, UserX, UserCheck, MailPlus } from "lucide-react";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";

interface DepositoProfile {
  id: string;
  user_id: string;
  nombre: string;
  email: string;
  estado: string;
  password_set: boolean;
  created_at: string;
  last_invite_sent_at: string | null;
}

const ManageDeposito = () => {
  const [profiles, setProfiles] = useState<DepositoProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ nombre: "", email: "" });
  const [creating, setCreating] = useState(false);
  const [resending, setResending] = useState<string | null>(null);
  const isMobile = useIsMobile();

  const fetchProfiles = async () => {
    const { data } = await supabase
      .from("deposito_profiles")
      .select("*")
      .order("created_at", { ascending: false });
    setProfiles((data as any[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchProfiles(); }, []);

  const handleCreate = async () => {
    if (!createForm.nombre.trim() || !createForm.email.trim()) {
      toast.error("Completá todos los campos");
      return;
    }
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke("invite-deposito", {
        body: { nombre: createForm.nombre.trim(), email: createForm.email.trim() },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(data?.already_existed ? data.message : "Usuario de depósito creado e invitación enviada");
      setShowCreate(false);
      setCreateForm({ nombre: "", email: "" });
      fetchProfiles();
    } catch (err: any) {
      toast.error(err.message || "Error al crear usuario");
    } finally {
      setCreating(false);
    }
  };

  const handleResendInvite = async (profile: DepositoProfile) => {
    if (profile.last_invite_sent_at && Date.now() - new Date(profile.last_invite_sent_at).getTime() < 60_000) {
      toast.error("Esperá 1 minuto antes de reenviar");
      return;
    }
    setResending(profile.id);
    try {
      const { data, error } = await supabase.functions.invoke("invite-deposito", {
        body: { nombre: profile.nombre, email: profile.email },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Invitación reenviada");
      fetchProfiles();
    } catch (err: any) {
      toast.error(err.message || "Error al reenviar");
    } finally {
      setResending(null);
    }
  };

  const toggleEstado = async (profile: DepositoProfile) => {
    const nuevoEstado = profile.estado === "activo" ? "inactivo" : "activo";
    const { error } = await supabase
      .from("deposito_profiles")
      .update({ estado: nuevoEstado })
      .eq("id", profile.id);
    if (error) {
      toast.error("Error al cambiar estado");
      return;
    }
    toast.success(`Usuario ${nuevoEstado === "activo" ? "activado" : "desactivado"}`);
    fetchProfiles();
  };

  const handleDelete = async (profile: DepositoProfile) => {
    if (!confirm(`¿Eliminar a ${profile.nombre}? Esta acción no se puede deshacer.`)) return;
    const { error } = await supabase.from("deposito_profiles").delete().eq("id", profile.id);
    if (error) {
      toast.error("Error al eliminar");
      return;
    }
    await supabase.from("user_roles").delete().eq("user_id", profile.user_id).eq("role", "deposito" as any);
    toast.success("Usuario eliminado");
    fetchProfiles();
  };

  if (loading) {
    return <div className="flex items-center justify-center py-16"><div className="animate-pulse text-muted-foreground">Cargando...</div></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Warehouse className="w-6 h-6 text-primary" />
          <h2 className="text-xl font-heading font-bold uppercase tracking-wider">Usuarios Depósito</h2>
        </div>
        <Button variant="gold" size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4 mr-1" /> Nuevo
        </Button>
      </div>

      {profiles.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">No hay usuarios de depósito registrados.</div>
      ) : isMobile ? (
        <div className="space-y-3">
          {profiles.map((p) => (
            <div key={p.id} className="glass-card rounded-lg p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-medium text-foreground">{p.nombre}</span>
                <Badge variant={p.estado === "activo" ? "default" : "secondary"}>
                  {p.estado}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">{p.email}</p>
              <div className="flex gap-2 pt-1">
                {!p.password_set && (
                  <Button variant="outline" size="sm" disabled={resending === p.id} onClick={() => handleResendInvite(p)}>
                    <MailPlus className="w-3 h-3 mr-1" />
                    {resending === p.id ? "Enviando..." : "Reenviar"}
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={() => toggleEstado(p)}>
                  {p.estado === "activo" ? <UserX className="w-3 h-3 mr-1" /> : <UserCheck className="w-3 h-3 mr-1" />}
                  {p.estado === "activo" ? "Desactivar" : "Activar"}
                </Button>
                <Button variant="destructive" size="sm" onClick={() => handleDelete(p)}>
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="glass-card rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Contraseña</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {profiles.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.nombre}</TableCell>
                  <TableCell className="text-muted-foreground">{p.email}</TableCell>
                  <TableCell>
                    <Badge variant={p.estado === "activo" ? "default" : "secondary"}>{p.estado}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={p.password_set ? "default" : "outline"}>
                      {p.password_set ? "Sí" : "Pendiente"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {!p.password_set && (
                        <Button variant="ghost" size="sm" disabled={resending === p.id} onClick={() => handleResendInvite(p)}>
                          <MailPlus className="w-4 h-4" />
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => toggleEstado(p)}>
                        {p.estado === "activo" ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                      </Button>
                      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => handleDelete(p)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo usuario de depósito</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nombre</Label>
              <Input value={createForm.nombre} onChange={(e) => setCreateForm({ ...createForm, nombre: e.target.value })} placeholder="Nombre completo" />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={createForm.email} onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })} placeholder="email@ejemplo.com" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancelar</Button>
            <Button variant="gold" onClick={handleCreate} disabled={creating}>
              {creating ? "Creando..." : "Crear e invitar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ManageDeposito;
