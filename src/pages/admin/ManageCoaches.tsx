import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { UserCog, Edit2 } from "lucide-react";
import { toast } from "sonner";

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
  const [editCoach, setEditCoach] = useState<Coach | null>(null);
  const [selectedGrupos, setSelectedGrupos] = useState<string[]>([]);
  const [selectedEstado, setSelectedEstado] = useState("pendiente");
  const [saving, setSaving] = useState(false);

  const fetchCoaches = async () => {
    const { data } = await supabase.from("coaches").select("*").order("created_at", { ascending: false });
    setCoaches((data as any) || []);
    setLoading(false);
  };

  useEffect(() => { fetchCoaches(); }, []);

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

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-3">
          <UserCog className="w-6 h-6 text-primary" />
          <h2 className="text-2xl font-heading font-bold uppercase tracking-wider text-foreground">
            Gestionar Coaches
          </h2>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          {coaches.length} coach{coaches.length !== 1 ? "es" : ""} registrado{coaches.length !== 1 ? "s" : ""}
        </p>
      </div>

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
            ) : coaches.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">No hay coaches registrados</TableCell>
              </TableRow>
            ) : (
              coaches.map((coach) => (
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
                    <Badge variant={coach.estado === "activo" ? "default" : "outline"} className="text-xs">
                      {coach.estado}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
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
                    <Checkbox
                      checked={selectedGrupos.includes(grupo)}
                      onCheckedChange={() => toggleGrupo(grupo)}
                    />
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
    </div>
  );
};

export default ManageCoaches;
