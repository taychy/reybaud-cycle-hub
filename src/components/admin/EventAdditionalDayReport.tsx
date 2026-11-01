import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/currency";
import { ADDITIONAL_DAY_STATUS_LABELS, showProgramExtensionReview, type AdditionalDayContext } from "@/lib/tripAdditionalDay";
import { useToast } from "@/hooks/use-toast";

type Row = AdditionalDayContext & { name: string; package: string; estimated_amount: number; currency: string; resolution_note: string | null };

export default function EventAdditionalDayReport({ eventId }: { eventId: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await (supabase as any).rpc("admin_trip_additional_day_report", { p_event_id: eventId });
    setRows(data ?? []); setLoading(false);
  }, [eventId]);
  useEffect(() => { load(); }, [load]);
  const copyLink = async (id: string) => {
    const { data, error } = await (supabase as any).rpc("admin_trip_additional_day_link", { p_reservation_id: id });
    if (error || !data) return toast({ title: "No hay enlace personal válido", variant: "destructive" });
    await navigator.clipboard.writeText(`https://reybaud-app.com${data}`);
    toast({ title: "Enlace personal copiado", description: "No se envió ningún mensaje." });
  };
  const resolve = async (id: string) => {
    const note = window.prompt("Resultado de la revisión administrativa");
    if (!note) return;
    const { error } = await (supabase as any).rpc("admin_resolve_trip_additional_day", { p_reservation_id: id, p_note: note });
    if (error) toast({ title: error.message, variant: "destructive" }); else load();
  };
  if (loading) return <p className="text-xs text-muted-foreground">Cargando día adicional…</p>;
  if (rows.length === 0) return null;
  return (
    <section className="rounded-lg border border-border p-3 space-y-3">
      <div><h3 className="font-medium text-sm">Extensión del programa · consulta personalizada</h3><p className="text-xs text-muted-foreground">{rows.length} elegible(s) para extender su participación en el Training Camp. Importes provisionales solo para el equipo; responder no compra ni genera cargos.</p><p className="text-xs text-muted-foreground mt-1">Alojamiento independiente: {rows.filter((r) => r.existing_night).length} de estos participantes tienen noche extra registrada; no son extensiones compradas ni conflictos demostrados.</p></div>
      <div className="space-y-2">{rows.map((r) => (
        <div key={r.reservation_id} className="rounded-md bg-muted/30 p-2 text-xs flex flex-wrap items-center gap-2">
          <span className="font-medium min-w-40">{r.name}</span><span>{r.package}</span>
          <Badge variant="outline">{ADDITIONAL_DAY_STATUS_LABELS[r.status]}</Badge>
          <span>Estimado {formatPrice(r.estimated_amount, r.currency)}</span>
          <span>Estadía elegida: {r.start.split("-").reverse().join("/")} → {r.end.split("-").reverse().join("/")} · paquete original {r.original_nights} noches</span>
          {r.existing_night && <Badge variant="outline">Alojamiento extra independiente</Badge>}
          {r.stale && <Badge variant="outline">Respuesta anterior desactualizada</Badge>}
          <span className="ml-auto flex gap-1">
            <Button size="sm" variant="outline" onClick={() => copyLink(r.reservation_id)}>Ver enlace personal</Button>
            {showProgramExtensionReview(r) && <Button size="sm" variant="outline" onClick={() => resolve(r.reservation_id)}>Marcar resuelto</Button>}
          </span>
          {r.resolution_note && <p className="basis-full text-muted-foreground">Resolución: {r.resolution_note}</p>}
        </div>
      ))}</div>
    </section>
  );
}