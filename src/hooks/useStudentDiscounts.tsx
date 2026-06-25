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

interface ActiveSubLite {
  id: string;
  fecha_inicio: string | null;
  categoria: string;
}

const OPERATIONAL_STATES = ["activa", "pendiente_verificacion", "pago_pendiente", "acceso_pausado"];

/**
 * Regla unificada de "segunda actividad":
 *   El alumno tiene 2+ suscripciones vigentes de modalidad NO pausa
 *   (grupal, pista, asesoría u otros). Plan reducido (pausa) NO cuenta.
 *
 * - Para un NUEVO plan que aún no existe en DB: usar `isSecondActivityForNew()`
 *   (>= 1 sub vigente no-pausa ya cuenta como segunda al sumar la nueva).
 * - Para una sub YA creada en DB: usar `isSubSecondary(subId)`
 *   (la sub ya está incluida en el conteo).
 */
export function useStudentDiscounts(alumnoId: string | null) {
  const [discounts, setDiscounts] = useState<StudentDiscount[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeNonPausaSubs, setActiveNonPausaSubs] = useState<ActiveSubLite[]>([]);

  useEffect(() => {
    if (!alumnoId) return;
    setLoading(true);

    const load = async () => {
      const today = new Date().toISOString().split("T")[0];

      const [discountsRes, subsRes] = await Promise.all([
        supabase
          .from("descuentos_alumno" as any)
          .select("descuento_id, descuentos!inner(id, nombre, categoria, valor, tipo, codigo, aplica_a, activo, vigencia_desde, vigencia_hasta)")
          .eq("alumno_id", alumnoId)
          .eq("activo", true),
        supabase
          .from("suscripciones")
          .select("id, fecha_inicio, fecha_fin, estado, cancelada_at, planes(categoria)")
          .eq("alumno_id", alumnoId)
          .in("estado", OPERATIONAL_STATES)
          .is("cancelada_at", null),
      ]);

      // Vigentes no-pausa
      const vigentes = (subsRes.data as any[] | null || [])
        .filter(s => !s.fecha_fin || s.fecha_fin >= today)
        .filter(s => (s.planes?.categoria || "otro") !== "pausa")
        .map(s => ({ id: s.id, fecha_inicio: s.fecha_inicio, categoria: s.planes?.categoria || "otro" }))
        .sort((a, b) => (a.fecha_inicio || "").localeCompare(b.fecha_inicio || ""));
      setActiveNonPausaSubs(vigentes);

      if (discountsRes.data) {
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

  const activeNonPausaCount = activeNonPausaSubs.length;

  /** Para un nuevo plan que aún no existe: ¿sería su segunda actividad? */
  const isSecondActivityForNew = (newPlanCategoria?: string | null) => {
    if (newPlanCategoria === "pausa") return false;
    return activeNonPausaCount >= 1;
  };

  /** Para una sub ya creada: ¿debe recibir descuento de 2da actividad? */
  const isSubSecondary = (subId: string) => {
    if (activeNonPausaCount < 2) return false;
    // El descuento se aplica a TODAS las subs no-pausa excepto la primera (cronológica).
    const idx = activeNonPausaSubs.findIndex(s => s.id === subId);
    return idx > 0;
  };

  /**
   * Aplica descuento. `isSecondarySubscription` debe venir del helper unificado.
   * `segunda_actividad` SIEMPRE aplica solo a "planes".
   */
  const applyDiscount = (
    price: number,
    context: "planes" | "eventos" | "tienda" | "todo" = "todo",
    isSecondarySubscription: boolean = false
  ): DiscountResult => {
    const applicable = discounts.filter(d => {
      // segunda_actividad: sólo en planes y sólo si es 2da
      if (d.categoria === "segunda_actividad") {
        if (context !== "planes") return false;
        if (!isSecondarySubscription) return false;
        return true;
      }
      // Otros descuentos: respetar aplica_a
      if (d.aplica_a !== "todo" && d.aplica_a !== context) return false;
      return true;
    });

    if (applicable.length === 0) return { original: price, final: price, discount: null };

    let bestDiscount: StudentDiscount | null = null;
    let bestFinal = price;

    for (const d of applicable) {
      const finalPrice = d.tipo === "fijo"
        ? Math.max(0, price - d.valor)
        : Math.round(price * (1 - d.valor / 100));
      if (finalPrice < bestFinal) {
        bestFinal = finalPrice;
        bestDiscount = d;
      }
    }

    if (!bestDiscount) return { original: price, final: price, discount: null };
    return { original: price, final: bestFinal, discount: bestDiscount };
  };

  /**
   * Mejor descuento promocional para mostrar en UI.
   * Filtra `segunda_actividad` salvo que el alumno ya califique como 2da.
   */
  const getBestDiscount = (
    context: "planes" | "eventos" | "tienda" | "todo" = "todo"
  ): StudentDiscount | null => {
    const applicable = discounts.filter(d => {
      if (d.categoria === "segunda_actividad") {
        // Sólo lo mostramos si el alumno ya tendría 2da actividad
        if (context !== "planes" && context !== "todo") return false;
        return activeNonPausaCount >= 1;
      }
      return d.aplica_a === "todo" || d.aplica_a === context;
    });
    if (applicable.length === 0) return null;
    return applicable.reduce((best, d) => (d.valor > best.valor ? d : best), applicable[0]);
  };

  return {
    discounts,
    loading,
    getBestDiscount,
    applyDiscount,
    /** @deprecated usar activeNonPausaCount / helpers */
    subscriptionCount: activeNonPausaCount,
    activeNonPausaCount,
    isSecondActivityForNew,
    isSubSecondary,
  };
}
