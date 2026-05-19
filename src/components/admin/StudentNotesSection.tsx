import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, StickyNote } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Nota {
  id: string;
  contenido: string;
  created_at: string;
  created_by_email: string | null;
}

interface Props {
  alumnoId: string;
}

export function StudentNotesSection({ alumnoId }: Props) {
  const [notas, setNotas] = useState<Nota[]>([]);
  const [loading, setLoading] = useState(true);
  const [nuevo, setNuevo] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("alumno_notas")
      .select("id, contenido, created_at, created_by_email")
      .eq("alumno_id", alumnoId)
      .order("created_at", { ascending: false });
    if (error) {
      toast.error("No se pudieron cargar las notas");
    } else {
      setNotas((data || []) as Nota[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [alumnoId]);

  const addNota = async () => {
    const text = nuevo.trim();
    if (!text) return;
    setSaving(true);
    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    const { error } = await supabase.from("alumno_notas").insert({
      alumno_id: alumnoId,
      contenido: text,
      created_by: user?.id ?? null,
      created_by_email: user?.email ?? null,
    });
    setSaving(false);
    if (error) {
      toast.error("No se pudo agregar la nota");
      return;
    }
    setNuevo("");
    toast.success("Nota agregada");
    load();
  };

  const removeNota = async (id: string) => {
    const { error } = await supabase.from("alumno_notas").delete().eq("id", id);
    if (error) {
      toast.error("No se pudo eliminar");
      return;
    }
    toast.success("Nota eliminada");
    setDeleteId(null);
    load();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <StickyNote className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Notas internas</h3>
        <span className="text-xs text-muted-foreground">({notas.length})</span>
      </div>

      <div className="space-y-2">
        <Textarea
          value={nuevo}
          onChange={(e) => setNuevo(e.target.value)}
          placeholder="Escribí una nueva nota..."
          className="bg-secondary border-border text-sm min-h-[60px]"
        />
        <Button
          variant="gold"
          size="sm"
          onClick={addNota}
          disabled={saving || !nuevo.trim()}
          className="w-full"
        >
          <Plus className="w-3 h-3 mr-1.5" />
          Agregar nota
        </Button>
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground">Cargando...</p>
      ) : notas.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">Sin notas registradas.</p>
      ) : (
        <div className="space-y-2">
          {notas.map((n) => (
            <div
              key={n.id}
              className="bg-secondary/50 rounded-md p-3 space-y-1.5 border border-border/50"
            >
              <p className="text-xs text-foreground whitespace-pre-wrap">{n.contenido}</p>
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span>
                  {new Date(n.created_at).toLocaleString("es-AR", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  {n.created_by_email ? ` · ${n.created_by_email}` : ""}
                </span>
                <button
                  onClick={() => setDeleteId(n.id)}
                  className="text-destructive hover:text-destructive/80 inline-flex items-center gap-1"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar nota</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && removeNota(deleteId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
