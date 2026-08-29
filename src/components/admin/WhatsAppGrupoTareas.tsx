import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRightLeft, Check, RefreshCw } from "lucide-react";
import { toast } from "sonner";

type TareaGrupo = {
  id: string;
  titulo: string;
  estado: string;
  created_at: string;
  updated_at: string;
  metadata: Record<string, any>;
};

/**
 * Tareas pendientes de sincronizar grupos de WhatsApp (una por alumno).
 * Sólo operativo manual: no toca grupos reales ni envía mensajes.
 */
export const WhatsAppGrupoTareas = () => {
  const [tareas, setTareas] = useState<TareaGrupo[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await (supabase as any)
      .from("tareas")
      .select("id, titulo, estado, created_at, updated_at, metadata")
      .eq("origen", "whatsapp_grupo")
      .neq("estado", "hecha")
      .order("updated_at", { ascending: false });
    setTareas(((data || []) as any[]) as TareaGrupo[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const marcarHecha = async (t: TareaGrupo) => {
    setSaving(t.id);
    const { data: { session } } = await supabase.auth.getSession();
    const { error } = await (supabase as any)
      .from("tareas")
      .update({
        estado: "hecha",
        cerrada_por: session?.user?.id ?? null,
        cerrada_at: new Date().toISOString(),
        nota_cierre: "WhatsApp sincronizado manualmente",
      })
      .eq("id", t.id);
    setSaving(null);
    if (error) { toast.error("No se pudo marcar la tarea"); return; }
    toast.success("WhatsApp sincronizado", {
      description: `${t.metadata?.alumno_nombre ?? "Alumno"} quedó confirmado en ${t.metadata?.grupo_destino ?? "—"}`,
    });
    load();
  };

  if (loading) return null;

  return (
    <Card className={tareas.length > 0 ? "border-amber-500/40" : undefined}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ArrowRightLeft className="w-4 h-4 text-amber-600" />
          Cambios de grupo por sincronizar
          {tareas.length > 0 && (
            <Badge variant="outline" className="bg-amber-500/15 text-amber-600 border-amber-500/30">
              {tareas.length}
            </Badge>
          )}
        </CardTitle>
        <Button variant="ghost" size="sm" onClick={load}>
          <RefreshCw className="w-3.5 h-3.5" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {tareas.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No hay cambios de grupo pendientes de actualizar en WhatsApp.
          </p>
        ) : (
          tareas.map(t => {
            const m = t.metadata || {};
            return (
              <div key={t.id} className="flex items-start justify-between gap-3 rounded-md border border-border p-3">
                <div className="min-w-0">
                  <p className="font-semibold text-sm truncate">{m.alumno_nombre || t.titulo}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Quitar de <strong>{m.grupo_origen ?? "sin grupo"}</strong> → agregar a{" "}
                    <strong>{m.grupo_destino ?? "sin grupo"}</strong>
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Cambio de {m.cambiado_por_nombre || "staff"} ·{" "}
                    {new Date(m.cambiado_at || t.updated_at).toLocaleString("es-AR")}
                  </p>
                </div>
                <Button size="sm" disabled={saving === t.id} onClick={() => marcarHecha(t)}>
                  <Check className="w-3.5 h-3.5 mr-1" /> Hecho
                </Button>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
};

export default WhatsAppGrupoTareas;
