import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Users } from "lucide-react";
import { toast } from "sonner";
import { formatPrice } from "@/lib/currency";
import { ROOMING_ESTADO_LABEL, isOverdueAssignment, type RoomingEstado } from "@/lib/sharedRoomAssignment";

interface Row {
  id: string;
  reservation_status: string;
  rooming_asignacion_estado: RoomingEstado | null;
  rooming_acompanante_nombre: string | null;
  rooming_asignacion_consentimiento: any;
  prefiere_asignacion: boolean | null;
  external_first_name: string | null;
  external_last_name: string | null;
  alumnos?: { nombre: string | null; apellido: string | null } | null;
}

/**
 * Asignación MANUAL de habitación doble compartida. La conversión a individual
 * se marca aquí para revisión (requiere cupo físico, validado en servidor) y se
 * ejecuta con el cambio de paquete existente, que conserva pagos y ajusta la diferencia.
 */
export default function SharedRoomAssignmentPanel({ eventId, deadline }: { eventId: string; deadline: string | null }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [edit, setEdit] = useState<Record<string, { estado?: RoomingEstado; acomp?: string }>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await (supabase as any)
      .from("event_reservations")
      .select("id, reservation_status, rooming_asignacion_estado, rooming_acompanante_nombre, rooming_asignacion_consentimiento, prefiere_asignacion, external_first_name, external_last_name, alumnos(nombre, apellido)")
      .eq("event_id", eventId)
      .not("rooming_asignacion_estado", "is", null)
      .neq("reservation_status", "cancelada");
    setRows((data as Row[]) || []);
  }, [eventId]);

  useEffect(() => { load(); }, [load]);

  if (rows.length === 0) return null;
  const overdue = rows.filter((r) => isOverdueAssignment(r.rooming_asignacion_estado, deadline));

  const save = async (r: Row) => {
    const e = edit[r.id] || {};
    const estado = e.estado || r.rooming_asignacion_estado;
    if (!estado) return;
    setSaving(r.id);
    const { error } = await supabase.rpc("admin_set_rooming_asignacion" as any, {
      p_reservation_id: r.id, p_estado: estado, p_acompanante: e.acomp ?? null, p_nota: null,
    });
    setSaving(null);
    if (error) { toast.error(error.message); return; }
    toast.success("Estado de habitación actualizado");
    setEdit((s) => ({ ...s, [r.id]: {} }));
    load();
  };

  return (
    <div className="rounded-xl border border-border p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Users className="w-4 h-4 text-primary" />
        <h3 className="font-heading font-semibold text-sm">Habitación doble compartida</h3>
        {deadline && <span className="text-xs text-muted-foreground">Límite de asignación {deadline.split("-").reverse().join("/")}</span>}
      </div>
      {overdue.length > 0 && (
        <p className="flex items-center gap-2 text-xs text-destructive">
          <AlertTriangle className="w-4 h-4" /> {overdue.length} reserva{overdue.length > 1 ? "s" : ""} sin habitación completa al vencer el plazo. Revisá la conversión a individual.
        </p>
      )}
      <div className="space-y-2">
        {rows.map((r) => {
          const nombre = r.alumnos ? `${r.alumnos.nombre || ""} ${r.alumnos.apellido || ""}` : `${r.external_first_name || ""} ${r.external_last_name || ""}`;
          const c = r.rooming_asignacion_consentimiento;
          const e = edit[r.id] || {};
          return (
            <div key={r.id} className="grid gap-2 md:grid-cols-[1.4fr_1fr_1fr_auto] items-center border-b border-border/40 pb-2">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{nombre.trim() || "Participante"}</p>
                <div className="flex flex-wrap gap-1 mt-0.5">
                  <Badge variant="outline" className="text-[10px]">{ROOMING_ESTADO_LABEL[r.rooming_asignacion_estado as RoomingEstado]}</Badge>
                  {c?.acepta && (
                    <Badge variant="secondary" className="text-[10px]">
                      Aceptó diferencia {formatPrice(Number(c.difference), c.currency)} · v{c.version}
                    </Badge>
                  )}
                </div>
              </div>
              <Input
                className="h-9 text-xs"
                placeholder="Acompañante"
                value={e.acomp ?? r.rooming_acompanante_nombre ?? ""}
                onChange={(ev) => setEdit((s) => ({ ...s, [r.id]: { ...e, acomp: ev.target.value } }))}
              />
              <Select
                value={e.estado || r.rooming_asignacion_estado || undefined}
                onValueChange={(v) => setEdit((s) => ({ ...s, [r.id]: { ...e, estado: v as RoomingEstado } }))}
              >
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(ROOMING_ESTADO_LABEL) as RoomingEstado[]).map((k) => (
                    <SelectItem key={k} value={k}>{ROOMING_ESTADO_LABEL[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" variant="outline" disabled={saving === r.id || (!e.estado && e.acomp === undefined)} onClick={() => save(r)}>
                Guardar
              </Button>
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-muted-foreground">
        La conversión a individual se ejecuta con «Cambiar paquete» de la reserva: conserva pagos y ajusta solo la diferencia.
      </p>
    </div>
  );
}
