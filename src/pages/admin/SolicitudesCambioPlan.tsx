import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRightLeft, CheckCircle, XCircle, CalendarClock } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { formatPrice } from "@/lib/currency";

interface Solicitud {
  id: string;
  alumno_id: string;
  sub_actual_id: string | null;
  plan_actual_nombre: string | null;
  plan_nuevo_nombre: string | null;
  diferencia: number | null;
  scope: string;
  estado: string;
  nota: string | null;
  created_at: string;
  alumno_nombre?: string;
  alumno_email?: string;
}

const formatDate = (iso: string) => {
  try {
    return new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch { return iso; }
};

export default function SolicitudesCambioPlan() {
  const [items, setItems] = useState<Solicitud[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"pendiente" | "todas">("pendiente");

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("solicitudes_cambio_plan" as any)
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setLoading(false);
      return;
    }
    const list = (data || []) as any[];
    const ids = Array.from(new Set(list.map(s => s.alumno_id).filter(Boolean)));
    let alumnoMap: Record<string, { nombre: string; email: string }> = {};
    if (ids.length) {
      const { data: alumnos } = await supabase.from("alumnos").select("id, nombre, email").in("id", ids);
      (alumnos || []).forEach((a: any) => { alumnoMap[a.id] = { nombre: a.nombre, email: a.email }; });
    }
    setItems(list.map(s => ({
      ...s,
      alumno_nombre: alumnoMap[s.alumno_id]?.nombre || "—",
      alumno_email: alumnoMap[s.alumno_id]?.email || "",
    })));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const setEstado = async (id: string, nuevo: "resuelto" | "rechazado") => {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("solicitudes_cambio_plan" as any)
      .update({ estado: nuevo, resuelto_at: new Date().toISOString(), resuelto_por: user?.id ?? null })
      .eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: nuevo === "resuelto" ? "Marcada como resuelta" : "Marcada como rechazada" });
    load();
  };

  const filtered = items.filter(s => filter === "todas" ? true : s.estado === "pendiente");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link to="/admin/resumen" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-lg font-heading uppercase tracking-wider flex items-center gap-2">
            <ArrowRightLeft className="w-5 h-5 text-primary" />
            Solicitudes de cambio de plan
          </h1>
        </div>
        <div className="flex gap-1">
          <Button variant={filter === "pendiente" ? "default" : "outline"} size="sm" onClick={() => setFilter("pendiente")}>
            Pendientes
          </Button>
          <Button variant={filter === "todas" ? "default" : "outline"} size="sm" onClick={() => setFilter("todas")}>
            Todas
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground animate-pulse">Cargando...</p>
      ) : filtered.length === 0 ? (
        <Card className="border-border">
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            {filter === "pendiente" ? "No hay solicitudes pendientes." : "No hay solicitudes registradas."}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map(s => (
            <Card key={s.id} className="border-border">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-sm font-heading uppercase tracking-wider">
                      {s.alumno_nombre}
                    </CardTitle>
                    <p className="text-[11px] text-muted-foreground">{s.alumno_email}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge variant="outline" className={
                      s.estado === "pendiente" ? "border-yellow-500/40 text-yellow-500" :
                      s.estado === "resuelto" ? "border-emerald-500/40 text-emerald-400" :
                      "border-destructive/40 text-destructive"
                    }>
                      {s.estado}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <CalendarClock className="w-3 h-3" />
                      {s.scope === "siguiente" ? "Próximo período" : "Este período"}
                    </span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Plan actual</span>
                  <span className="text-foreground">{s.plan_actual_nombre || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Plan nuevo</span>
                  <span className="text-foreground font-medium">{s.plan_nuevo_nombre || "—"}</span>
                </div>
                {s.diferencia !== null && s.diferencia !== undefined && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Diferencia</span>
                    <span className={s.diferencia > 0 ? "text-amber-400 font-medium" : s.diferencia < 0 ? "text-emerald-400 font-medium" : "text-foreground"}>
                      {s.diferencia > 0 ? "+" : ""}{formatPrice(s.diferencia)}
                    </span>
                  </div>
                )}
                {s.nota && (
                  <p className="text-xs text-muted-foreground italic border-l-2 border-border pl-2">{s.nota}</p>
                )}
                <p className="text-[10px] text-muted-foreground">Solicitada: {formatDate(s.created_at)}</p>

                {s.estado === "pendiente" && (
                  <div className="flex gap-2 pt-2 border-t border-border">
                    <Link
                      to={`/admin/alumnos?buscar=${encodeURIComponent(s.alumno_nombre || "")}`}
                      className="text-xs text-primary hover:underline self-center"
                    >
                      Abrir ficha →
                    </Link>
                    <div className="flex-1" />
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEstado(s.id, "rechazado")}>
                      <XCircle className="w-3 h-3 mr-1" /> Rechazar
                    </Button>
                    <Button size="sm" variant="default" className="h-7 text-xs" onClick={() => setEstado(s.id, "resuelto")}>
                      <CheckCircle className="w-3 h-3 mr-1" /> Marcar resuelta
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
