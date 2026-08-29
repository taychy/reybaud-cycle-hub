import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useTareas, type Tarea } from "@/hooks/useTareas";
import { GraduacionTareaCard } from "@/components/coach/GraduacionTareaCard";
import { ORIGENES_CAMBIO_GRUPO } from "@/lib/graduacion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, CheckCircle2, ListTodo } from "lucide-react";
import { toast } from "sonner";

const CoachTareas = () => {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUserId(data.session?.user?.id ?? null));
  }, []);

  const { tareas, loading, updateTarea } = useTareas("todas", userId, false);

  const mias = useMemo(
    () => tareas.filter(t => t.rol_destino === "coach" && (!t.asignado_user_id || t.asignado_user_id === userId)),
    [tareas, userId]
  );
  const graduaciones = useMemo(
    () => mias.filter(t => (ORIGENES_CAMBIO_GRUPO as readonly string[]).includes(t.origen)),
    [mias]
  );
  const otras = useMemo(
    () => mias.filter(t => !(ORIGENES_CAMBIO_GRUPO as readonly string[]).includes(t.origen) && t.estado !== "hecha"),
    [mias]
  );

  const marcarHecha = async (t: Tarea, nota?: string) => {
    try {
      await updateTarea(t.id, { estado: "hecha", nota_cierre: nota ?? null, cerrada_por: userId, cerrada_at: new Date().toISOString() } as any, "hecha", nota);
      toast.success("Tarea marcada como hecha");
    } catch {
      toast.error("No se pudo actualizar la tarea");
    }
  };

  const pendientes = graduaciones.filter(t => t.estado !== "hecha");
  const hechas = graduaciones.filter(t => t.estado === "hecha").slice(0, 5);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/coach")}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-base font-semibold text-foreground">Mis tareas</h1>
          <p className="text-xs text-muted-foreground">Graduaciones y pendientes asignados a vos</p>
        </div>
      </header>

      <main className="p-4 space-y-6 max-w-2xl mx-auto">
        {loading ? (
          <p className="text-sm text-muted-foreground animate-pulse text-center py-8">Cargando tareas...</p>
        ) : (
          <>
            <section className="space-y-3">
              <h2 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                Felicitaciones por graduación
              </h2>
              {pendientes.length === 0 ? (
                <Card className="border-border">
                  <CardContent className="py-8 text-center">
                    <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-500 mb-2" />
                    <p className="text-sm text-muted-foreground">No tenés felicitaciones pendientes</p>
                  </CardContent>
                </Card>
              ) : (
                pendientes.map(t => <GraduacionTareaCard key={t.id} tarea={t} onDone={marcarHecha} />)
              )}
              {hechas.map(t => <GraduacionTareaCard key={t.id} tarea={t} onDone={marcarHecha} />)}
            </section>

            {otras.length > 0 && (
              <section className="space-y-2">
                <h2 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Otras tareas</h2>
                {otras.map(t => (
                  <Card key={t.id} className="border-border">
                    <CardContent className="p-4 flex items-start gap-2">
                      <ListTodo className="w-4 h-4 text-muted-foreground mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground">{t.titulo}</p>
                        {t.descripcion && <p className="text-xs text-muted-foreground mt-1">{t.descripcion}</p>}
                        <Badge variant="outline" className="text-[10px] mt-2">{t.estado}</Badge>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => marcarHecha(t)}>Hecha</Button>
                    </CardContent>
                  </Card>
                ))}
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
};

export default CoachTareas;
