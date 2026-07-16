/**
 * Reportes agregados a nivel evento (sincronizados con el módulo Alojamiento):
 *   • Distribución de habitaciones: usa event_rooms + event_room_assignments
 *     como fuente de verdad (mismo dato que ve el admin en Alojamiento).
 *   • Lista para seguro: nombre, documento, obra social y contactos de
 *     emergencia leídos directo de `alumnos` (autogestionados por el alumno).
 * Ambos exportables a CSV.
 */
import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, Loader2, BedDouble, ShieldCheck, AlertCircle } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId: string;
  eventTitle: string;
}

interface Row {
  reservation_id: string;
  nombre: string;
  apellido: string;
  email: string;
  telefono: string;
  documento: string | null;
  obra_social: string | null;
  contacto_emergencia_nombre: string | null;
  contacto_emergencia_telefono: string | null;
  contacto_emergencia_nombre_2: string | null;
  contacto_emergencia_telefono_2: string | null;
  reservation_status: string;
  is_external: boolean;
  // Asignación real de habitación (fuente: event_room_assignments / event_rooms)
  room_id: string | null;
  room_nombre: string | null;
  room_genero: string | null;
  room_capacidad: number | null;
  package_nombre: string | null;
}

const csvEscape = (v: any) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const downloadCSV = (rows: string[][], filename: string) => {
  const csv = rows.map(r => r.map(csvEscape).join(",")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
};

const EventTripReports = ({ open, onOpenChange, eventId, eventTitle }: Props) => {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    (async () => {
      const { data: reservations } = await supabase
        .from("event_reservations")
        .select("id, alumno_id, external_participant_id, package_id, reservation_status")
        .eq("event_id", eventId)
        .neq("reservation_status", "cancelada");

      const list = reservations || [];
      const resIds = list.map(r => r.id);
      const alumnoIds = list.map(r => r.alumno_id).filter(Boolean) as string[];
      const extIds = list.map(r => r.external_participant_id).filter(Boolean) as string[];
      const pkgIds = Array.from(new Set(list.map(r => r.package_id).filter(Boolean))) as string[];

      const [aluR, extR, pkgR, roomR, asgR] = await Promise.all([
        alumnoIds.length
          ? supabase.from("alumnos").select(
              "id, nombre, apellido, email, telefono, documento, obra_social_nombre, " +
              "contacto_emergencia_nombre, contacto_emergencia_telefono, " +
              "contacto_emergencia_nombre_2, contacto_emergencia_telefono_2"
            ).in("id", alumnoIds)
          : Promise.resolve({ data: [] as any[] }),
        extIds.length
          ? supabase.from("event_external_participants").select("id, nombre, apellido, email, telefono").in("id", extIds)
          : Promise.resolve({ data: [] as any[] }),
        pkgIds.length
          ? supabase.from("event_packages").select("id, nombre, personas_por_habitacion").in("id", pkgIds)
          : Promise.resolve({ data: [] as any[] }),
        (supabase as any).from("event_rooms").select("id, nombre, genero, capacidad, package_id").eq("event_id", eventId),
        resIds.length
          ? (supabase as any).from("event_room_assignments").select("room_id, reservation_id").in("reservation_id", resIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const aluMap = new Map((aluR.data || []).map((a: any) => [a.id, a]));
      const extMap = new Map((extR.data || []).map((e: any) => [e.id, e]));
      const pkgMap = new Map((pkgR.data || []).map((p: any) => [p.id, p]));
      const roomMap = new Map(((roomR as any).data || []).map((r: any) => [r.id, r]));
      const asgMap = new Map(((asgR as any).data || []).map((a: any) => [a.reservation_id, a.room_id]));

      const built: Row[] = list.map(r => {
        const a: any = r.alumno_id ? aluMap.get(r.alumno_id) : null;
        const e: any = r.external_participant_id ? extMap.get(r.external_participant_id) : null;
        const p: any = a || e || {};
        const roomId = asgMap.get(r.id) || null;
        const room: any = roomId ? roomMap.get(roomId) : null;
        const pkg: any = r.package_id ? pkgMap.get(r.package_id) : null;
        return {
          reservation_id: r.id,
          nombre: p.nombre || "",
          apellido: p.apellido || "",
          email: p.email || "",
          telefono: p.telefono || "",
          documento: a?.documento ?? null,
          obra_social: a?.obra_social_nombre ?? null,
          contacto_emergencia_nombre: a?.contacto_emergencia_nombre ?? null,
          contacto_emergencia_telefono: a?.contacto_emergencia_telefono ?? null,
          contacto_emergencia_nombre_2: a?.contacto_emergencia_nombre_2 ?? null,
          contacto_emergencia_telefono_2: a?.contacto_emergencia_telefono_2 ?? null,
          reservation_status: r.reservation_status,
          is_external: !!e && !a,
          room_id: roomId,
          room_nombre: room?.nombre ?? null,
          room_genero: room?.genero ?? null,
          room_capacidad: room?.capacidad ?? null,
          package_nombre: pkg?.nombre ?? null,
        };
      });

      setRows(built);
      setLoading(false);
    })();
  }, [open, eventId]);

  // Agrupación de habitaciones por asignación real
  const habitaciones = useMemo(() => {
    const grouped: Record<string, { label: string; genero: string; capacidad: number | null; rows: Row[] }> = {};
    rows.forEach(r => {
      if (!r.room_id) return;
      const key = r.room_id;
      grouped[key] ??= {
        label: r.room_nombre || "Sin nombre",
        genero: r.room_genero || "sin_definir",
        capacidad: r.room_capacidad,
        rows: [],
      };
      grouped[key].rows.push(r);
    });
    return grouped;
  }, [rows]);

  const sinAsignar = useMemo(() => rows.filter(r => !r.room_id), [rows]);

  const exportSeguro = () => {
    const header = ["Nombre", "Apellido", "Documento", "Email", "Teléfono", "Obra social",
      "Contacto emergencia 1", "Tel emergencia 1", "Contacto emergencia 2", "Tel emergencia 2"];
    const body = rows.map(r => [
      r.nombre, r.apellido, r.documento ?? "",
      r.email, r.telefono,
      r.obra_social ?? "",
      r.contacto_emergencia_nombre ?? "", r.contacto_emergencia_telefono ?? "",
      r.contacto_emergencia_nombre_2 ?? "", r.contacto_emergencia_telefono_2 ?? "",
    ]);
    downloadCSV([header, ...body], `seguro_${eventTitle.replace(/\s+/g, "_")}.csv`);
  };

  const exportHabitaciones = () => {
    const header = ["Habitación", "Género", "Capacidad", "Ocupación", "Nombre", "Apellido", "Paquete"];
    const body: string[][] = [];
    Object.values(habitaciones).forEach(g => {
      g.rows.forEach(r => {
        body.push([
          g.label, g.genero, String(g.capacidad ?? ""), `${g.rows.length}/${g.capacidad ?? "?"}`,
          r.nombre, r.apellido, r.package_nombre ?? "",
        ]);
      });
    });
    sinAsignar.forEach(r => {
      body.push(["(sin asignar)", "", "", "", r.nombre, r.apellido, r.package_nombre ?? ""]);
    });
    downloadCSV([header, ...body], `habitaciones_${eventTitle.replace(/\s+/g, "_")}.csv`);
  };

  const missingSeguro = rows.filter(r => !r.is_external && (!r.documento || !r.contacto_emergencia_telefono));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Reportes del viaje — {eventTitle}</DialogTitle>
          <DialogDescription>Distribución de habitaciones y lista consolidada para seguro.</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <Tabs defaultValue="habitaciones">
            <TabsList className="w-full">
              <TabsTrigger value="habitaciones" className="flex-1"><BedDouble className="w-3.5 h-3.5 mr-1.5" />Habitaciones</TabsTrigger>
              <TabsTrigger value="seguro" className="flex-1"><ShieldCheck className="w-3.5 h-3.5 mr-1.5" />Seguro</TabsTrigger>
            </TabsList>

            <TabsContent value="habitaciones" className="space-y-3 mt-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  {rows.length} participante(s) · {Object.keys(habitaciones).length} habitación(es) asignada(s)
                </p>
                <Button size="sm" variant="outline" onClick={exportHabitaciones}>
                  <Download className="w-3.5 h-3.5 mr-1.5" /> CSV
                </Button>
              </div>
              {sinAsignar.length > 0 && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-2.5 text-xs flex items-start gap-2">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                  <span>{sinAsignar.length} participante(s) sin habitación asignada. Gestioná desde el módulo Alojamiento.</span>
                </div>
              )}
              <div className="space-y-3">
                {Object.entries(habitaciones).map(([roomId, g]) => (
                  <div key={roomId} className="rounded-lg border border-border p-3">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className="font-medium text-sm">{g.label}</span>
                      <Badge variant="outline" className="text-[10px] capitalize">{g.genero.replace(/_/g, " ")}</Badge>
                      <Badge variant="outline" className="text-[10px]">{g.rows.length}/{g.capacidad ?? "?"}</Badge>
                    </div>
                    <div className="space-y-1">
                      {g.rows.map(r => (
                        <div key={r.reservation_id} className="flex items-center justify-between text-xs">
                          <span className="font-medium">{r.nombre} {r.apellido}</span>
                          {r.package_nombre && <span className="text-[10px] text-muted-foreground">{r.package_nombre}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                {sinAsignar.length > 0 && (
                  <div className="rounded-lg border border-dashed border-border p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-medium text-sm text-muted-foreground">Sin asignar</span>
                      <Badge variant="outline" className="text-[10px]">{sinAsignar.length}</Badge>
                    </div>
                    <div className="space-y-1">
                      {sinAsignar.map(r => (
                        <div key={r.reservation_id} className="flex items-center justify-between text-xs">
                          <span>{r.nombre} {r.apellido}</span>
                          {r.package_nombre && <span className="text-[10px] text-muted-foreground">{r.package_nombre}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="seguro" className="space-y-3 mt-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">{rows.length} participante(s)</p>
                <Button size="sm" variant="outline" onClick={exportSeguro}>
                  <Download className="w-3.5 h-3.5 mr-1.5" /> CSV
                </Button>
              </div>
              {missingSeguro.length > 0 && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-2.5 text-xs flex items-start gap-2">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                  <span>{missingSeguro.length} participante(s) sin documento o contacto de emergencia.</span>
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-1.5 px-2">Nombre</th>
                      <th className="text-left py-1.5 px-2">Documento</th>
                      <th className="text-left py-1.5 px-2">Obra social</th>
                      <th className="text-left py-1.5 px-2">Tel. emergencia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(r => (
                      <tr key={r.reservation_id} className="border-b border-border/50">
                        <td className="py-1.5 px-2 font-medium">
                          {r.nombre} {r.apellido}
                          {r.is_external && <Badge variant="outline" className="ml-1 text-[9px]">externo</Badge>}
                        </td>
                        <td className="py-1.5 px-2">{r.documento || <span className="text-amber-500">falta</span>}</td>
                        <td className="py-1.5 px-2">{r.obra_social || <span className="text-muted-foreground italic">—</span>}</td>
                        <td className="py-1.5 px-2">{r.contacto_emergencia_telefono || <span className="text-amber-500">falta</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default EventTripReports;
