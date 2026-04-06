import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Tag, Users2, Percent } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type Alumno = Tables<"alumnos">;

interface DescuentoAlumnoRow {
  id: string;
  descuento_id: string;
  activo: boolean;
  nota: string | null;
  created_at: string;
  descuentos: {
    id: string;
    nombre: string;
    categoria: string;
    valor: number;
    tipo: string;
    aplica_a: string;
    vigencia_desde: string | null;
    vigencia_hasta: string | null;
  } | null;
}

interface FamilyGroup {
  id: string;
  nombre: string;
  miembros: { alumno_id: string; alumno_nombre: string; recibe_descuento: boolean }[];
}

const categoriaBadge: Record<string, { label: string; className: string }> = {
  familiar: { label: "Familiar", className: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  segunda_actividad: { label: "2ª actividad", className: "bg-purple-500/20 text-purple-400 border-purple-500/30" },
  referido: { label: "Referido", className: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
  beca: { label: "Beca", className: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
  general: { label: "General", className: "bg-muted text-muted-foreground border-border" },
};

const formatDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" }) : "—";

interface Props {
  alumno: Alumno;
}

export function StudentDiscountSection({ alumno }: Props) {
  const [discounts, setDiscounts] = useState<DescuentoAlumnoRow[]>([]);
  const [familyGroup, setFamilyGroup] = useState<FamilyGroup | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [descRes, familyRes] = await Promise.all([
        supabase
          .from("descuentos_alumno" as any)
          .select("id, descuento_id, activo, nota, created_at, descuentos!inner(id, nombre, categoria, valor, tipo, aplica_a, vigencia_desde, vigencia_hasta)")
          .eq("alumno_id", alumno.id),
        supabase
          .from("grupo_familiar_miembros" as any)
          .select("grupo_id, recibe_descuento, grupo_familiar!inner(id, nombre)")
          .eq("alumno_id", alumno.id),
      ]);

      setDiscounts((descRes.data as any) || []);

      // Load family group members if any
      const familyData = familyRes.data as any[];
      if (familyData && familyData.length > 0) {
        const grupoId = familyData[0].grupo_id;
        const grupoNombre = familyData[0].grupo_familiar?.nombre || "";

        const { data: miembrosData } = await supabase
          .from("grupo_familiar_miembros" as any)
          .select("alumno_id, recibe_descuento, alumnos!inner(nombre)")
          .eq("grupo_id", grupoId);

        setFamilyGroup({
          id: grupoId,
          nombre: grupoNombre,
          miembros: (miembrosData as any[] || []).map((m: any) => ({
            alumno_id: m.alumno_id,
            alumno_nombre: m.alumnos?.nombre || "—",
            recibe_descuento: m.recibe_descuento,
          })),
        });
      } else {
        setFamilyGroup(null);
      }

      setLoading(false);
    };
    load();
  }, [alumno.id]);

  if (loading) {
    return (
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Tag className="w-4 h-4" /> Descuentos
        </h3>
        <p className="text-xs text-muted-foreground">Cargando...</p>
      </div>
    );
  }

  const activeDiscounts = discounts.filter(d => d.activo && d.descuentos);
  const inactiveDiscounts = discounts.filter(d => !d.activo && d.descuentos);

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
        <Tag className="w-4 h-4" /> Descuentos
        {activeDiscounts.length > 0 && (
          <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
            {activeDiscounts.length} activo{activeDiscounts.length !== 1 ? "s" : ""}
          </Badge>
        )}
      </h3>

      {activeDiscounts.length === 0 && inactiveDiscounts.length === 0 ? (
        <p className="text-xs text-muted-foreground">Sin descuentos asignados</p>
      ) : (
        <div className="space-y-2">
          {activeDiscounts.map(d => {
            const cat = categoriaBadge[d.descuentos!.categoria] || categoriaBadge.general;
            return (
              <div key={d.id} className="rounded-md bg-secondary/50 p-2.5 space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Badge variant="outline" className={`text-[10px] ${cat.className}`}>{cat.label}</Badge>
                    <span className="text-xs font-medium text-foreground">{d.descuentos!.nombre}</span>
                  </div>
                  <span className="text-xs font-mono text-primary font-semibold">
                    {d.descuentos!.tipo === "fijo" ? `$${d.descuentos!.valor}` : `${d.descuentos!.valor}%`}
                  </span>
                </div>
                <div className="flex gap-3 text-[10px] text-muted-foreground">
                  <span>Aplica a: {d.descuentos!.aplica_a}</span>
                  <span>Desde: {formatDate(d.created_at)}</span>
                  {d.descuentos!.vigencia_hasta && <span>Hasta: {formatDate(d.descuentos!.vigencia_hasta)}</span>}
                </div>
                {d.nota && <p className="text-[10px] text-muted-foreground italic">{d.nota}</p>}
              </div>
            );
          })}

          {inactiveDiscounts.length > 0 && (
            <div className="pt-1">
              <p className="text-[10px] text-muted-foreground mb-1">Inactivos:</p>
              {inactiveDiscounts.map(d => (
                <div key={d.id} className="flex items-center justify-between text-[10px] text-muted-foreground opacity-60 py-0.5">
                  <span>{d.descuentos!.nombre}</span>
                  <span>{d.descuentos!.tipo === "fijo" ? `$${d.descuentos!.valor}` : `${d.descuentos!.valor}%`}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Family group */}
      {familyGroup && (
        <div className="space-y-1.5 pt-1">
          <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <Users2 className="w-3.5 h-3.5" /> Grupo familiar: {familyGroup.nombre}
          </h4>
          <div className="space-y-0.5">
            {familyGroup.miembros.map(m => (
              <div key={m.alumno_id} className="flex items-center justify-between text-[10px]">
                <span className={m.alumno_id === alumno.id ? "text-foreground font-medium" : "text-muted-foreground"}>
                  {m.alumno_nombre} {m.alumno_id === alumno.id && "(este alumno)"}
                </span>
                {m.recibe_descuento && (
                  <Badge variant="outline" className="text-[9px] bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
                    <Percent className="w-2.5 h-2.5 mr-0.5" /> Descuento
                  </Badge>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
