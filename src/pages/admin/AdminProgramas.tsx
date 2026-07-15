import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GraduationCap, Users, Calendar, ArrowRight, Plus } from "lucide-react";
import { formatPrice } from "@/lib/currency";

interface CohortRow {
  id: string;
  nombre: string;
  descripcion_corta: string | null;
  precio: number;
  moneda: string;
  activo: boolean;
  visibilidad: string | null;
  landing_public: boolean | null;
  cohort_slug: string | null;
  max_inscripciones: number | null;
  inscripciones_actuales: number | null;
  fecha_inicio_programa: string | null;
  fecha_fin_programa: string | null;
  fecha_cierre_inscripcion: string | null;
  categoria: string | null;
}

const fmtDate = (d: string | null) => {
  if (!d) return "—";
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day).toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" });
};

const daysUntil = (d: string | null): number | null => {
  if (!d) return null;
  const [y, m, day] = d.split("-").map(Number);
  const target = new Date(y, m - 1, day).getTime();
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((target - today) / 86_400_000);
};

const AdminProgramas = () => {
  const [rows, setRows] = useState<CohortRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"activos" | "todos">("activos");

  useEffect(() => {
    (async () => {
      setLoading(true);
      let q = supabase
        .from("planes")
        .select(
          "id, nombre, descripcion_corta, precio, moneda, activo, visibilidad, landing_public, cohort_slug, max_inscripciones, inscripciones_actuales, fecha_inicio_programa, fecha_fin_programa, fecha_cierre_inscripcion, categoria"
        )
        .eq("es_programa_cerrado", true)
        .order("fecha_inicio_programa", { ascending: false, nullsFirst: false });
      if (filter === "activos") q = q.eq("activo", true);
      const { data } = await q;
      setRows((data || []) as any);
      setLoading(false);
    })();
  }, [filter]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-heading font-bold uppercase tracking-wider flex items-center gap-2">
            <GraduationCap className="w-6 h-6 text-primary" /> Programas
          </h1>
          <p className="text-sm text-muted-foreground">
            Cohortes de programas cerrados (Formación Inicial y otros). Cada plan de tipo programa cerrado es una cohorte.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant={filter === "activos" ? "default" : "outline"} size="sm" onClick={() => setFilter("activos")}>
            Activos
          </Button>
          <Button variant={filter === "todos" ? "default" : "outline"} size="sm" onClick={() => setFilter("todos")}>
            Todos
          </Button>
          <Link to="/admin/planes">
            <Button size="sm" variant="secondary">
              <Plus className="w-4 h-4 mr-1" /> Nueva cohorte
            </Button>
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Cargando…</div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center text-muted-foreground">
            No hay cohortes {filter === "activos" ? "activas" : ""}. Creá un plan tipo <b>programa cerrado</b> en{" "}
            <Link to="/admin/planes" className="underline">
              Planes
            </Link>
            .
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {rows.map((r) => {
            const dToStart = daysUntil(r.fecha_inicio_programa);
            const dToClose = daysUntil(r.fecha_cierre_inscripcion);
            const cap = r.max_inscripciones || 0;
            const curr = r.inscripciones_actuales || 0;
            const pct = cap > 0 ? Math.min(100, Math.round((curr / cap) * 100)) : 0;

            let statusLabel = "Sin inicio";
            let statusVariant: "default" | "secondary" | "outline" | "destructive" = "outline";
            if (dToStart !== null) {
              if (dToStart > 0) {
                statusLabel = `Inicia en ${dToStart}d`;
                statusVariant = "default";
              } else if (r.fecha_fin_programa && (daysUntil(r.fecha_fin_programa) ?? -1) >= 0) {
                statusLabel = "En curso";
                statusVariant = "secondary";
              } else {
                statusLabel = "Finalizada";
                statusVariant = "outline";
              }
            }

            return (
              <Card key={r.id} className="hover:border-primary/50 transition-colors">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <CardTitle className="text-base leading-tight">{r.nombre}</CardTitle>
                      {r.descripcion_corta && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{r.descripcion_corta}</p>
                      )}
                    </div>
                    <Badge variant={statusVariant} className="shrink-0">
                      {statusLabel}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {fmtDate(r.fecha_inicio_programa)} → {fmtDate(r.fecha_fin_programa)}
                    </span>
                    {r.fecha_cierre_inscripcion && (
                      <span className={`text-[10px] ${dToClose !== null && dToClose < 7 ? "text-orange-500" : "text-muted-foreground"}`}>
                        Cierre inscr.: {fmtDate(r.fecha_cierre_inscripcion)}
                      </span>
                    )}
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <Users className="w-3 h-3" /> Inscriptos
                      </span>
                      <span className="font-semibold">
                        {curr}
                        {cap > 0 ? ` / ${cap}` : ""}
                      </span>
                    </div>
                    <div className="h-1.5 bg-muted rounded overflow-hidden">
                      <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-sm font-heading font-bold">{formatCurrency(r.precio, r.moneda as any)}</span>
                    <Link to={`/admin/programas/${r.id}`}>
                      <Button size="sm" variant="ghost">
                        Ver detalle <ArrowRight className="w-4 h-4 ml-1" />
                      </Button>
                    </Link>
                  </div>

                  <div className="flex gap-1 flex-wrap">
                    {!r.activo && <Badge variant="outline" className="text-[10px]">Inactivo</Badge>}
                    {r.landing_public && <Badge variant="outline" className="text-[10px]">Landing pública</Badge>}
                    {r.cohort_slug && <Badge variant="outline" className="text-[10px]">{r.cohort_slug}</Badge>}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AdminProgramas;
