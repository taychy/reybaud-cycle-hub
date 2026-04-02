import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

interface StudentDiscount {
  id: string;
  nombre: string;
  categoria: string;
  valor: number;
  codigo: string | null;
  aplica_a: string;
}

export function useStudentDiscounts(alumnoId: string | null) {
  const [discounts, setDiscounts] = useState<StudentDiscount[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!alumnoId) return;
    setLoading(true);

    const load = async () => {
      const { data } = await supabase
        .from("descuentos_alumno" as any)
        .select("descuento_id, descuentos!inner(id, nombre, categoria, valor, codigo, aplica_a, activo)")
        .eq("alumno_id", alumnoId)
        .eq("activo", true);

      if (data) {
        const mapped = (data as any[])
          .filter((d: any) => d.descuentos?.activo)
          .map((d: any) => ({
            id: d.descuentos.id,
            nombre: d.descuentos.nombre,
            categoria: d.descuentos.categoria,
            valor: d.descuentos.valor,
            codigo: d.descuentos.codigo,
            aplica_a: d.descuentos.aplica_a,
          }));
        setDiscounts(mapped);
      }
      setLoading(false);
    };

    load();
  }, [alumnoId]);

  const getBestDiscount = (context: "planes" | "eventos" | "tienda" | "todo" = "todo"): StudentDiscount | null => {
    const applicable = discounts.filter(
      d => d.aplica_a === "todo" || d.aplica_a === context
    );
    if (applicable.length === 0) return null;
    return applicable.reduce((best, d) => d.valor > best.valor ? d : best, applicable[0]);
  };

  const applyDiscount = (price: number, context: "planes" | "eventos" | "tienda" | "todo" = "todo"): { original: number; final: number; discount: StudentDiscount | null } => {
    const best = getBestDiscount(context);
    if (!best) return { original: price, final: price, discount: null };
    const final = Math.round(price * (1 - best.valor / 100));
    return { original: price, final, discount: best };
  };

  return { discounts, loading, getBestDiscount, applyDiscount };
}
