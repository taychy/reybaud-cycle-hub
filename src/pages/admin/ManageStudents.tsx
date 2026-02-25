import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Search, UserCheck, UserX, Edit2, Check, X } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import { toast } from "sonner";

type Alumno = Tables<"alumnos">;
const GRUPOS = ["G1", "G2", "G3", "G4", "Principiante", "Sin grupo"] as const;

const ManageStudents = () => {
  const [alumnos, setAlumnos] = useState<Alumno[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editGrupo, setEditGrupo] = useState<string>("");

  const fetchAlumnos = async () => {
    const { data } = await supabase.from("alumnos").select("*").order("nombre");
    setAlumnos(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchAlumnos(); }, []);

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

  const filtered = alumnos.filter(
    (a) =>
      a.nombre.toLowerCase().includes(search.toLowerCase()) ||
      a.email.toLowerCase().includes(search.toLowerCase())
  );

  const pendingCount = alumnos.filter((a) => (a as any).grupo_preferido && a.grupo === "Sin grupo").length;

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-heading font-bold uppercase tracking-wider text-foreground">
            Gestionar Alumnos
          </h2>
          {pendingCount > 0 && (
            <Badge variant="destructive" className="text-xs animate-pulse">
              {pendingCount} pendiente{pendingCount > 1 ? "s" : ""} de validación
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          {alumnos.length} alumnos registrados
        </p>
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

      <div className="glass-card rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="text-muted-foreground">Nombre</TableHead>
              <TableHead className="text-muted-foreground">Email</TableHead>
              <TableHead className="text-muted-foreground">Grupo</TableHead>
              <TableHead className="text-muted-foreground">Estado</TableHead>
              <TableHead className="text-muted-foreground text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  Cargando...
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  No se encontraron alumnos
                </TableCell>
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
                      <span className="ml-2 text-xs text-primary font-normal">
                        Eligió: {grupoPreferido}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{alumno.email}</TableCell>
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
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleEstado(alumno)}
                      className="text-xs"
                    >
                      {alumno.estado === "activo" ? (
                        <><UserX className="w-3 h-3 mr-1" /> Desactivar</>
                      ) : (
                        <><UserCheck className="w-3 h-3 mr-1" /> Activar</>
                      )}
                    </Button>
                  </TableCell>
                </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default ManageStudents;
