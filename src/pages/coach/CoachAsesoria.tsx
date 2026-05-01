import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Users, Plus, Calendar, ClipboardList, ChevronRight } from "lucide-react";
import { toast } from "sonner";

interface AsignacionConAlumno {
  id: string;
  alumno_id: string;
  activa: boolean;
  fecha_inicio: string;
  fecha_fin: string | null;
  notas: string | null;
  alumnos: { id: string; nombre: string; apellido: string | null; email: string } | null;
}

interface Entrenamiento {
  id: string;
  titulo: string;
  fecha: string;
  tipo: string | null;
  descripcion: string | null;
  alumno_id: string | null;
}

const CoachAsesoria = () => {
  const navigate = useNavigate();
  const [asignaciones, setAsignaciones] = useState<AsignacionConAlumno[]>([]);
  const [loading, setLoading] = useState(true);
  const [coachId, setCoachId] = useState<string | null>(null);
  const [selectedAlumno, setSelectedAlumno] = useState<AsignacionConAlumno | null>(null);
  const [entrenamientos, setEntrenamientos] = useState<Entrenamiento[]>([]);
  const [loadingTrainings, setLoadingTrainings] = useState(false);

  // Create training dialog
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newTraining, setNewTraining] = useState({
    titulo: "",
    fecha: new Date().toISOString().split("T")[0],
    tipo: "ruta" as string,
    descripcion: "",
  });

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return; // ProtectedRoute handles redirect

      const { data: coach } = await supabase
        .from("coaches")
        .select("id")
        .eq("user_id", session.user.id)
        .single();
      if (!coach) { navigate("/coach"); return; }
      setCoachId(coach.id);

      const { data } = await supabase
        .from("asesoria_asignaciones")
        .select("id, alumno_id, activa, fecha_inicio, fecha_fin, notas, alumnos(id, nombre, apellido, email)")
        .eq("coach_id", coach.id)
        .eq("activa", true)
        .order("created_at", { ascending: false });

      setAsignaciones((data as any) || []);
      setLoading(false);
    };
    init();
  }, [navigate]);

  const loadTrainings = async (alumnoId: string) => {
    setLoadingTrainings(true);
    const { data } = await supabase
      .from("entrenamientos")
      .select("id, titulo, fecha, tipo, descripcion, alumno_id")
      .eq("alumno_id", alumnoId)
      .order("fecha", { ascending: false })
      .limit(20);
    setEntrenamientos((data as any) || []);
    setLoadingTrainings(false);
  };

  const handleSelectAlumno = (asig: AsignacionConAlumno) => {
    setSelectedAlumno(asig);
    loadTrainings(asig.alumno_id);
  };

  const handleCreateTraining = async () => {
    if (!selectedAlumno || !coachId) return;
    setCreating(true);

    const { error } = await supabase.from("entrenamientos").insert({
      titulo: newTraining.titulo.trim(),
      fecha: newTraining.fecha,
      tipo: newTraining.tipo as any,
      descripcion: newTraining.descripcion.trim() || null,
      alumno_id: selectedAlumno.alumno_id,
      grupo: "Personalizado" as any,
      visible: true,
    });

    setCreating(false);
    if (error) {
      toast.error("Error al crear entrenamiento");
      return;
    }

    toast.success("Entrenamiento creado");
    setShowCreate(false);
    setNewTraining({ titulo: "", fecha: new Date().toISOString().split("T")[0], tipo: "ruta", descripcion: "" });
    loadTrainings(selectedAlumno.alumno_id);
  };

  const formatDate = (d: string) => {
    const date = new Date(d + "T12:00:00");
    return date.toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "short" });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Cargando...</p>
      </div>
    );
  }

  // Detail view for a selected student
  if (selectedAlumno) {
    const alumno = selectedAlumno.alumnos;
    return (
      <div className="min-h-screen bg-background p-4 max-w-lg mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={() => setSelectedAlumno(null)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-xl font-heading font-bold text-foreground">
              {alumno?.nombre} {alumno?.apellido || ""}
            </h1>
            <p className="text-sm text-muted-foreground">{alumno?.email}</p>
          </div>
        </div>

        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-heading font-semibold uppercase tracking-wider text-muted-foreground">
            Plan personalizado
          </h2>
          <Button size="sm" variant="gold" onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4 mr-1" />
            Nuevo
          </Button>
        </div>

        {loadingTrainings ? (
          <p className="text-center text-muted-foreground py-8">Cargando...</p>
        ) : entrenamientos.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <ClipboardList className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No hay entrenamientos cargados</p>
            <p className="text-xs mt-1">Creá el primer entrenamiento personalizado</p>
          </div>
        ) : (
          <div className="space-y-2">
            {entrenamientos.map((e) => (
              <Card key={e.id}>
                <CardContent className="p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-foreground">{e.titulo}</p>
                      <p className="text-xs text-muted-foreground capitalize">{formatDate(e.fecha)}</p>
                    </div>
                    {e.tipo && <Badge variant="outline" className="text-xs capitalize">{e.tipo}</Badge>}
                  </div>
                  {e.descripcion && (
                    <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{e.descripcion}</p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Create training dialog */}
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogContent className="max-w-md bg-card border-border">
            <DialogHeader>
              <DialogTitle className="font-heading">Nuevo entrenamiento</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Título *</label>
                <Input
                  value={newTraining.titulo}
                  onChange={(e) => setNewTraining((p) => ({ ...p, titulo: e.target.value }))}
                  placeholder="Ej: Intervalos en zona 4"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Fecha *</label>
                <Input
                  type="date"
                  value={newTraining.fecha}
                  onChange={(e) => setNewTraining((p) => ({ ...p, fecha: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Tipo</label>
                <Select value={newTraining.tipo} onValueChange={(v) => setNewTraining((p) => ({ ...p, tipo: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ruta">Ruta</SelectItem>
                    <SelectItem value="rodillo">Rodillo</SelectItem>
                    <SelectItem value="gimnasio">Gimnasio</SelectItem>
                    <SelectItem value="descanso">Descanso</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Descripción</label>
                <Textarea
                  value={newTraining.descripcion}
                  onChange={(e) => setNewTraining((p) => ({ ...p, descripcion: e.target.value }))}
                  placeholder="Detalle del entrenamiento..."
                  rows={4}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreate(false)}>Cancelar</Button>
              <Button variant="gold" onClick={handleCreateTraining} disabled={creating || !newTraining.titulo.trim()}>
                {creating ? "Creando..." : "Crear"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // List view
  return (
    <div className="min-h-screen bg-background p-4 max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate("/coach")}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-xl font-heading font-bold text-foreground">Asesoría Personalizada</h1>
      </div>

      {asignaciones.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>No tenés alumnos de asesoría asignados</p>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground mb-2">
            {asignaciones.length} alumno{asignaciones.length !== 1 ? "s" : ""} asignado{asignaciones.length !== 1 ? "s" : ""}
          </p>
          {asignaciones.map((asig) => (
            <Card key={asig.id} className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => handleSelectAlumno(asig)}>
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="font-medium text-foreground">
                    {asig.alumnos?.nombre} {asig.alumnos?.apellido || ""}
                  </p>
                  <p className="text-sm text-muted-foreground">{asig.alumnos?.email}</p>
                  {asig.notas && <p className="text-xs text-muted-foreground mt-1">{asig.notas}</p>}
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default CoachAsesoria;
