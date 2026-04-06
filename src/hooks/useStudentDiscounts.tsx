import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

interface StudentDiscount {
  id: string;
  nombre: string;
  categoria: string;
  valor: number;
  tipo: string; // "porcentaje" | "fijo"
  codigo: string | null;
  aplica_a: string;
  vigencia_desde: string | null;
  vigencia_hasta: string | null;
}

export interface DiscountResult {
  original: number;
  final: number;
  discount: StudentDiscount | null;
}

export function useStudentDiscounts(alumnoId: string | null) {
  const [discounts, setDiscounts] = useState<StudentDiscount[]>([]);
  const [loading, setLoading] = useState(false);
  const [subscriptionCount, setSubscriptionCount] = useState(0);

  useEffect(() => {
    if (!alumnoId) return;
    setLoading(true);

    const load = async () => {
      // Load discounts and active subscription count in parallel
      const [discountsRes, subsRes] = await Promise.all([
        supabase
          .from("descuentos_alumno" as any)
          .select("descuento_id, descuentos!inner(id, nombre, categoria, valor, tipo, codigo, aplica_a, activo, vigencia_desde, vigencia_hasta)")
          .eq("alumno_id", alumnoId)
          .eq("activo", true),
        supabase
          .from("suscripciones")
          .select("id")
          .eq("alumno_id", alumnoId)
          .in("estado", ["activa", "pendiente_verificacion", "pausa"]),
      ]);

      const activeSubCount = subsRes.data?.length || 0;
      setSubscriptionCount(activeSubCount);

      if (discountsRes.data) {
        const today = new Date().toISOString().split("T")[0];
        const mapped = (discountsRes.data as any[])
          .filter((d: any) => d.descuentos?.activo)
          .map((d: any) => ({
            id: d.descuentos.id,
            nombre: d.descuentos.nombre,
            categoria: d.descuentos.categoria,
            valor: d.descuentos.valor,
            tipo: d.descuentos.tipo || "porcentaje",
            codigo: d.descuentos.codigo,
            aplica_a: d.descuentos.aplica_a,
            vigencia_desde: d.descuentos.vigencia_desde,
            vigencia_hasta: d.descuentos.vigencia_hasta,
          }))
          .filter((d: StudentDiscount) => {
            if (d.vigencia_desde && d.vigencia_desde > today) return false;
            if (d.vigencia_hasta && d.vigencia_hasta < today) return false;
            return true;
          });
        setDiscounts(mapped);
      }
      setLoading(false);
    };

    load();
  }, [alumnoId]);

  /**
   * Apply discount with awareness of subscription context.
   * @param isSecondarySubscription - true if this is the 2nd+ subscription for the student
   */
  const applyDiscount = (
    price: number,
    context: "planes" | "eventos" | "tienda" | "todo" = "todo",
    isSecondarySubscription: boolean = false
  ): DiscountResult => {
    const applicable = discounts.filter(d => {
      // Context filter
      if (d.aplica_a !== "todo" && d.aplica_a !== context) return false;

      // "segunda_actividad" discounts only apply to the 2nd+ subscription
      if (d.categoria === "segunda_actividad" && !isSecondarySubscription) return false;

      // Non-segunda_actividad discounts should NOT apply if marked for 2nd activity context
      // Actually, general discounts can apply to any subscription
      return true;
    });

    if (applicable.length === 0) return { original: price, final: price, discount: null };

    // Find the best discount by effective savings
    let bestDiscount: StudentDiscount | null = null;
    let bestFinal = price;

    for (const d of applicable) {
      let finalPrice: number;
      if (d.tipo === "fijo") {
        finalPrice = Math.max(0, price - d.valor);
      } else {
        finalPrice = Math.round(price * (1 - d.valor / 100));
      }
      if (finalPrice < bestFinal) {
        bestFinal = finalPrice;
        bestDiscount = d;
      }
    }

    if (!bestDiscount) return { original: price, final: price, discount: null };
    return { original: price, final: bestFinal, discount: bestDiscount };
  };

  const getBestDiscount = (context: "planes" | "eventos" | "tienda" | "todo" = "todo"): StudentDiscount | null => {
    const applicable = discounts.filter(
      d => d.aplica_a === "todo" || d.aplica_a === context
    );
    if (applicable.length === 0) return null;
    return applicable.reduce((best, d) => d.valor > best.valor ? d : best, applicable[0]);
  };

  return { discounts, loading, getBestDiscount, applyDiscount, subscriptionCount };
}
