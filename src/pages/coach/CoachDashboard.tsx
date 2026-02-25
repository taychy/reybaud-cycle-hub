import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LogOut, Users, Dumbbell, Plus, Eye, EyeOff, Edit2, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import logo from "@/assets/logo.png";
import type { Tables } from "@/integrations/supabase/types";

type Alumno = Tables<"alumnos">;
type Entrenamiento = Tables<"entrenamientos">;

const TIPOS = ["ruta", "rodillo", "gimnasio", "tecnica"] as const;

const CoachDashboard = () => {
  const navigate = useNavigate();
  const [coachName, setCoachName] = useState("");
  const [grupos, setGrupos] = useState<string[]>([]);
  const [alumnos, setAlumnos] = useState<Alumno[]>([]);
  const [entrenamientos, setEntrenamientos] = useState<Entrenamiento[]>([]);
  const [loading, setLoading] = useState(true);
  const [editDialog, setEditDialog] = useState<Entrenamiento | null>(null);
  const [createDialog, setCreateDialog] = useState(false);
  const [formData, setFormData] = useState({
    titulo: "",
    descripcion: "",
    fecha: "",
    grupo: "",
    tipo: "" as string,
    intensidad: 0,
    resistencia: 0,
    tecnica: 0,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate("/admin/login"); return; }

      // Check coach role
      const { data: isCoach } = await supabase.rpc("has_role", {
        _user_id: session.user.id,
        _role: "coach" as any,
      });

      if (!isCoach) { navigate("/admin/login"); return; }

      // Get coach profile
      const { data: coach } = await supabase
        .from("coaches")
        .select("*")
        .eq("user_id", session.user.id)
        .single();

      if (!coach) { navigate("/admin/login"); return; }

      setCoachName((coach as any).nombre);
      const coachGrupos = (coach as any).grupos || [];
      setGrupos(coachGrupos);

      if (coachGrupos.length > 0) {
        // Fetch alumnos in coach's groups
        const { data: alumnosData } = await supabase
          .from("alumnos")
          .select("*")
          .in("grupo", coachGrupos as any)
          .order("nombre");
        setAlumnos(alumnosData || []);

        // Fetch entrenamientos for coach's groups
        const { data: entData } = await supabase
          .from("entrenamientos")
          .select("*")
          .in("grupo", coachGrupos as any)
          .order("fecha", { ascending: false });
        setEntrenamientos(entData || []);
      }

      setLoading(false);
    };
    init();
  }, [navigate]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/admin/login");
  };

  const refreshEntrenamientos = async () => {
    if (grupos.length === 0) return;
    const { data } = await supabase
      .from("entrenamientos")
      .select("*")
      .in("grupo", grupos as any)
      .order("fecha", { ascending: false });
    setEntrenamientos(data || []);
  };

  const toggleVisible = async (ent: Entrenamiento) => {
    await supabase.from("entrenamientos").update({ visible: !ent.visible }).eq("id", ent.id);
    toast.success(ent.visible ? "Entrenamiento oculto" : "Entrenamiento visible");
    refreshEntrenamientos();
  };

  const deleteEntrenamiento = async (id: string) => {
    await supabase.from("entrenamientos").delete().eq("id", id);
    toast.success("Entrenamiento eliminado");
    refreshEntrenamientos();
  };

  const openCreate = () => {
    setFormData({
      titulo: "",
      descripcion: "",
      fecha: new Date().toISOString().split("T")[0],
      grupo: grupos[0] || "",
      tipo: "",
      intensidad: 0,
      resistencia: 0,
      tecnica: 0,
    });
    setCreateDialog(true);
  };

  const openEdit = (ent: Entrenamiento) => {
    setFormData({
      titulo: ent.titulo,
      descripcion: ent.descripcion || "",
      fecha: ent.fecha,
      grupo: ent.grupo,
      tipo: ent.tipo || "",
      intensidad: ent.intensidad,
      resistencia: ent.resistencia,
      tecnica: ent.tecnica,
    });
    setEditDialog(ent);
  };

  const handleSave = async (isEdit: boolean) => {
    setSaving(true);
    const payload = {
      titulo: formData.titulo,
      descripcion: formData.descripcion || null,
      fecha: formData.fecha,
      grupo: formData.grupo as any,
      tipo: (formData.tipo || null) as any,
      intensidad: formData.intensidad,
      resistencia: formData.resistencia,
      tecnica: formData.tecnica,
    };

    if (isEdit && editDialog) {
      await supabase.from("entrenamientos").update(payload).eq("id", editDialog.id);
      toast.success("Entrenamiento actualizado");
      setEditDialog(null);
    } else {
      await supabase.from("entrenamientos").insert(payload);
      toast.success("Entrenamiento creado");
      setCreateDialog(false);
    }
    setSaving(false);
    refreshEntrenamientos();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Cargando...</p>
      </div>
    );
  }

  const entrenamientoForm = (isEdit: boolean) => (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">Título *</label>
        <Input value={formData.titulo} onChange={(e) => setFormData({ ...formData, titulo: e.target.value })} required className="bg-secondary border-border" />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">Descripción</label>
        <Textarea value={formData.descripcion} onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })} className="bg-secondary border-border resize-none" rows={3} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Fecha *</label>
          <Input type="date" value={formData.fecha} onChange={(e) => setFormData({ ...formData, fecha: e.target.value })} className="bg-secondary border-border" />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Grupo *</label>
          <Select value={formData.grupo} onValueChange={(v) => setFormData({ ...formData, grupo: v })}>
            <SelectTrigger className="bg-secondary border-border"><SelectValue /></SelectTrigger>
            <SelectContent>
              {grupos.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">Tipo</label>
        <Select value={formData.tipo} onValueChange={(v) => setFormData({ ...formData, tipo: v })}>
          <SelectTrigger className="bg-secondary border-border"><SelectValue placeholder="Seleccioná" /></SelectTrigger>
          <SelectContent>
            {TIPOS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-foreground">Intensidad</label>
          <Input type="number" min={0} max={10} value={formData.intensidad} onChange={(e) => setFormData({ ...formData, intensidad: +e.target.value })} className="bg-secondary border-border" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-foreground">Resistencia</label>
          <Input type="number" min={0} max={10} value={formData.resistencia} onChange={(e) => setFormData({ ...formData, resistencia: +e.target.value })} className="bg-secondary border-border" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-foreground">Técnica</label>
          <Input type="number" min={0} max={10} value={formData.tecnica} onChange={(e) => setFormData({ ...formData, tecnica: +e.target.value })} className="bg-secondary border-border" />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={() => { setEditDialog(null); setCreateDialog(false); }}>Cancelar</Button>
        <Button variant="gold" disabled={!formData.titulo || !formData.fecha || !formData.grupo || saving} onClick={() => handleSave(isEdit)}>
          {saving ? "Guardando..." : isEdit ? "Actualizar" : "Crear"}
        </Button>
      </DialogFooter>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={logo} alt="Ciclismo Reybaud" className="w-8 h-8" />
            <div>
              <h1 className="font-heading font-bold text-foreground text-sm uppercase tracking-wider">Coach Panel</h1>
              <p className="text-xs text-muted-foreground">{coachName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {grupos.length > 0 && (
              <div className="flex gap-1">
                {grupos.map((g) => (
                  <Badge key={g} variant="secondary" className="text-xs">{g}</Badge>
                ))}
              </div>
            )}
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        {grupos.length === 0 ? (
          <div className="text-center py-16 space-y-3">
            <p className="text-muted-foreground">
              Todavía no tenés grupos asignados. Un administrador debe asignarte grupos para que puedas empezar a trabajar.
            </p>
          </div>
        ) : (
          <Tabs defaultValue="entrenamientos" className="space-y-6">
            <TabsList className="bg-secondary">
              <TabsTrigger value="entrenamientos" className="gap-1.5">
                <Dumbbell className="w-3.5 h-3.5" /> Entrenamientos
              </TabsTrigger>
              <TabsTrigger value="alumnos" className="gap-1.5">
                <Users className="w-3.5 h-3.5" /> Alumnos
              </TabsTrigger>
            </TabsList>

            <TabsContent value="entrenamientos" className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-heading font-bold text-foreground uppercase tracking-wider">
                  Entrenamientos
                </h2>
                <Button variant="gold" size="sm" onClick={openCreate}>
                  <Plus className="w-4 h-4 mr-1" /> Nuevo
                </Button>
              </div>

              <div className="glass-card rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border hover:bg-transparent">
                      <TableHead className="text-muted-foreground">Fecha</TableHead>
                      <TableHead className="text-muted-foreground">Título</TableHead>
                      <TableHead className="text-muted-foreground">Grupo</TableHead>
                      <TableHead className="text-muted-foreground">Tipo</TableHead>
                      <TableHead className="text-muted-foreground">Visible</TableHead>
                      <TableHead className="text-muted-foreground text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entrenamientos.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                          No hay entrenamientos
                        </TableCell>
                      </TableRow>
                    ) : (
                      entrenamientos.map((ent) => (
                        <TableRow key={ent.id} className="border-border">
                          <TableCell className="text-muted-foreground text-sm">{ent.fecha}</TableCell>
                          <TableCell className="font-medium text-foreground">{ent.titulo}</TableCell>
                          <TableCell><Badge variant="secondary" className="text-xs">{ent.grupo}</Badge></TableCell>
                          <TableCell className="text-muted-foreground text-xs">{ent.tipo || "—"}</TableCell>
                          <TableCell>
                            <button onClick={() => toggleVisible(ent)} className="text-muted-foreground hover:text-foreground">
                              {ent.visible ? <Eye className="w-4 h-4 text-primary" /> : <EyeOff className="w-4 h-4" />}
                            </button>
                          </TableCell>
                          <TableCell className="text-right space-x-1">
                            <Button variant="ghost" size="sm" onClick={() => openEdit(ent)} className="text-xs">
                              <Edit2 className="w-3 h-3" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => deleteEntrenamiento(ent.id)} className="text-xs text-destructive hover:text-destructive">
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            <TabsContent value="alumnos" className="space-y-4">
              <h2 className="text-lg font-heading font-bold text-foreground uppercase tracking-wider">
                Alumnos ({alumnos.length})
              </h2>

              <div className="glass-card rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border hover:bg-transparent">
                      <TableHead className="text-muted-foreground">Nombre</TableHead>
                      <TableHead className="text-muted-foreground">Email</TableHead>
                      <TableHead className="text-muted-foreground">Grupo</TableHead>
                      <TableHead className="text-muted-foreground">Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {alumnos.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                          No hay alumnos en tus grupos
                        </TableCell>
                      </TableRow>
                    ) : (
                      alumnos.map((a) => (
                        <TableRow key={a.id} className="border-border">
                          <TableCell className="font-medium text-foreground">{a.nombre}</TableCell>
                          <TableCell className="text-muted-foreground">{a.email}</TableCell>
                          <TableCell><Badge variant="secondary" className="text-xs">{a.grupo}</Badge></TableCell>
                          <TableCell>
                            <Badge variant={a.estado === "activo" ? "default" : "outline"} className="text-xs">{a.estado}</Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          </Tabs>
        )}
      </main>

      {/* Create dialog */}
      <Dialog open={createDialog} onOpenChange={setCreateDialog}>
        <DialogContent className="sm:max-w-lg bg-card border-border">
          <DialogHeader>
            <DialogTitle className="font-heading uppercase tracking-wider">Nuevo Entrenamiento</DialogTitle>
          </DialogHeader>
          {entrenamientoForm(false)}
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editDialog} onOpenChange={(open) => { if (!open) setEditDialog(null); }}>
        <DialogContent className="sm:max-w-lg bg-card border-border">
          <DialogHeader>
            <DialogTitle className="font-heading uppercase tracking-wider">Editar Entrenamiento</DialogTitle>
          </DialogHeader>
          {entrenamientoForm(true)}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CoachDashboard;
