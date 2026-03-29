import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useEventFavorites(alumnoId: string | null) {
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!alumnoId) return;
    setLoading(true);
    supabase
      .from("event_favorites")
      .select("event_id")
      .eq("alumno_id", alumnoId)
      .then(({ data }) => {
        if (data) setFavoriteIds(new Set(data.map((f: any) => f.event_id)));
        setLoading(false);
      });
  }, [alumnoId]);

  const toggleFavorite = useCallback(
    async (eventId: string) => {
      if (!alumnoId) return;
      const isFav = favoriteIds.has(eventId);
      // Optimistic update
      setFavoriteIds((prev) => {
        const next = new Set(prev);
        if (isFav) next.delete(eventId);
        else next.add(eventId);
        return next;
      });

      if (isFav) {
        await supabase
          .from("event_favorites")
          .delete()
          .eq("alumno_id", alumnoId)
          .eq("event_id", eventId);
      } else {
        await supabase
          .from("event_favorites")
          .insert({ alumno_id: alumnoId, event_id: eventId } as any);
      }
    },
    [alumnoId, favoriteIds]
  );

  const isFavorite = useCallback(
    (eventId: string) => favoriteIds.has(eventId),
    [favoriteIds]
  );

  return { favoriteIds, isFavorite, toggleFavorite, loading };
}
