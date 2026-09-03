import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Info } from "lucide-react";
import {
  distribucionPorGrupo,
  distribucionPorPlan,
  contarMultiPlan,
  contarSinPlanActivo,
  contarStaffConFicha,
  type DistAlumno,
  type PlanEntry,
} from "@/lib/studentDistribution";

interface Props {
  /** Alumnos que entran en el total "Activos" de la pantalla. */
  activos: (DistAlumno & { user_id: string | null })[];
  /** Una fila por (alumno activo, plan activo) según el mismo helper de la pantalla. */
  planEntries: PlanEntry[];
  statusFilter: string;
  onSelectGrupo: (grupo: string) => void;
  onSelectPlan: (planId: string) => void;
  onSelectSinPlanActivo: () => void;
}

const chipBase =
  "rounded-full border px-3 py-1.5 text-xs transition-colors whitespace-nowrap";

export default function AlumnosDistribucion({
  activos,
  planEntries,
  statusFilter,
  onSelectGrupo,
  onSelectPlan,
  onSelectSinPlanActivo,
}: Props) {
  const [staffUserIds, setStaffUserIds] = useState<Set<string> | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [coaches, roles, admins] = await Promise.all([
        supabase.from("coaches").select("user_id"),
        supabase.from("user_roles").select("user_id, role").in("role", ["coach", "admin"]),
        supabase.from("admin_profiles").select("user_id"),
      ]);
      if (cancelled) return;
      const set = new Set<string>();
      for (const row of [...(coaches.data || []), ...(roles.data || []), ...(admins.data || [])]) {
        if ((row as any).user_id) set.add((row as any).user_id as string);
      }
      setStaffUserIds(set);
    })();
    return () => { cancelled = true; };
  }, []);

  const grupos = useMemo(() => distribucionPorGrupo(activos), [activos]);
  const planes = useMemo(() => distribucionPorPlan(planEntries), [planEntries]);
  const multiPlan = useMemo(() => contarMultiPlan(planEntries), [planEntries]);
  const sinPlanActivo = useMemo(() => contarSinPlanActivo(activos, planEntries), [activos, planEntries]);
  const staffCount = useMemo(
    () => (staffUserIds ? contarStaffConFicha(activos, staffUserIds) : null),
    [activos, staffUserIds],
  );

  const total = activos.length;
  if (total === 0) return null;

  return (
    <Card className="p-4 space-y-4 bg-card/60">
      <div className="flex flex-wrap items-baseline gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-foreground">
          Distribución de activos
        </h3>
        <span className="text-xs text-muted-foreground">
          Denominador: <b className="text-foreground">{total} activos</b>
        </span>
      </div>

      {/* Por grupo */}
      <div className="space-y-2">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
          Por grupo · suma {total}
        </p>
        <div className="flex flex-wrap gap-2">
          {grupos.map((g) => {
            const key = g.grupo === "Sin grupo" ? "sin_grupo" : `grupo_${g.grupo}`;
            const active = statusFilter === key;
            return (
              <button
                key={g.grupo}
                onClick={() => onSelectGrupo(g.grupo)}
                className={`${chipBase} ${active ? "bg-primary text-primary-foreground border-primary" : "border-border bg-secondary/40 text-muted-foreground hover:text-foreground"}`}
              >
                {g.grupo} · <b>{g.count}</b>
              </button>
            );
          })}
        </div>
      </div>

      {/* Por plan activo */}
      <div className="space-y-2">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
          Por plan activo
        </p>
        <div className="flex flex-wrap gap-2">
          {planes.map((p) => {
            const active = statusFilter === `active_plan_${p.planId}`;
            return (
              <button
                key={p.planId}
                onClick={() => onSelectPlan(p.planId)}
                className={`${chipBase} ${active ? "bg-primary text-primary-foreground border-primary" : "border-border bg-secondary/40 text-muted-foreground hover:text-foreground"}`}
              >
                {p.planNombre} · <b>{p.count}</b>
              </button>
            );
          })}
          {sinPlanActivo > 0 && (
            <button
              onClick={onSelectSinPlanActivo}
              className={`${chipBase} ${statusFilter === "sin_plan_activo" ? "bg-primary text-primary-foreground border-primary" : "border-dashed border-border bg-secondary/20 text-muted-foreground hover:text-foreground"}`}
            >
              Sin plan activo · <b>{sinPlanActivo}</b>
            </button>
          )}
        </div>
        <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
          <Info className="w-3 h-3 mt-[2px] shrink-0" />
          <span>
            Un alumno puede aparecer en más de un plan; estos números no suman {total}.
            {multiPlan > 0 && ` ${multiPlan} alumno${multiPlan === 1 ? "" : "s"} con más de un plan activo.`}
          </span>
        </p>
      </div>

      {/* Staff */}
      <div className="pt-1 border-t border-border/60">
        <p className="text-[11px] text-muted-foreground">
          {staffCount === null ? (
            "Staff: calculando…"
          ) : (
            <>
              <b className="text-foreground">Staff con ficha de alumno: {staffCount}</b> · incluidos
              dentro de los {total} activos. Se identifican por cruce de identidad (usuario vinculado
              a coach/admin); no existe una categoría “Staff” en la ficha de alumno.
            </>
          )}
        </p>
      </div>
    </Card>
  );
}
