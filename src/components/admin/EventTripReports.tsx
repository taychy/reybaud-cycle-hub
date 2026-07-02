/**
 * Reportes agregados a nivel evento:
 *   • Distribución de habitaciones (agrupa por tipo + género, marca incompletos)
 *   • Lista para seguro (nombre, DNI, fecha nacimiento, tel emergencia)
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
  dni: string | null;
  fecha_nacimiento: string | null;
  reservation_status: string;
  habitacion_data: Record<string, any> | null;
  salud_data: Record<string, any> | null;
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
      // reservations activas (no canceladas)
      const { data: reservations } = await supabase
        .from("event_reservations")
        .select("id, alumno_id, external_participant_id, reservation_status")
        .eq("event_id", eventId)
        .neq("reservation_status", "cancelada");

      const list = reservations || [];
      const resIds = list.map(r => r.id);
      const alumnoIds = list.map(r => r.alumno_id).filter(Boolean) as string[];
      const extIds = list.map(r => r.external_participant_id).filter(Boolean) as string[];

      const [aluR, extR, clR] = await Promise.all([
        alumnoIds.length
          ? supabase.from("alumnos").select("id, nombre, apellido, email, telefono, dni, fecha_nacimiento").in("id", alumnoIds)
          : Promise.resolve({ data: [] as any[] }),
        extIds.length
          ? supabase.from("event_external_participants").select("id, nombre, apellido, email, telefono").in("id", extIds)
          : Promise.resolve({ data: [] as any[] }),
        resIds.length
          ? supabase.from("reservation_checklist_data")
              .select("reservation_id, step_key, data")
              .in("reservation_id", resIds)
              .in("step_key", ["habitacion", "salud_emergencia"])
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const aluMap = new Map((aluR.data || []).map((a: any) => [a.id, a]));
      const extMap = new Map((extR.data || []).map((e: any) => [e.id, e]));
      const clByRes: Record<string, Record<string, any>> = {};
      (clR.data || []).forEach((c: any) => {
        clByRes[c.reservation_id] ??= {};
        clByRes[c.reservation_id][c.step_key] = c.data;
      });

      const built: Row[] = list.map(r => {
        const a = r.alumno_id ? aluMap.get(r.alumno_id) : null;
        const e = r.external_participant_id ? extMap.get(r.external_participant_id) : null;
        const p = a || e || {};
        return {
          reservation_id: r.id,
          nombre: p.nombre || "",
          apellido: p.apellido || "",
          email: p.email || "",
          telefono: p.telefono || "",
          dni: (a as any)?.dni ?? null,
          fecha_nacimiento: (a as any)?.fecha_nacimiento ?? null,
          reservation_status: r.reservation_status,
          habitacion_data: clByRes[r.id]?.habitacion ?? null,
          salud_data: clByRes[r.id]?.salud_emergencia ?? null,
        };
      });

      setRows(built);
      setLoading(false);
    })();
  }, [open, eventId]);

  // Agrupación de habitaciones
  const habitaciones = useMemo(() => {
    const grouped: Record<string, Row[]> = {};
    rows.forEach(r => {
      const tipo = r.habitacion_data?.tipo_habitacion || "sin_definir";
      const genero = r.habitacion_data?.genero_habitacion || "sin_definir";
      const key = `${tipo}__${genero}`;
      grouped[key] ??= [];
      grouped[key].push(r);
    });
    return grouped;
  }, [rows]);

  const exportSeguro = () => {
    const header = ["Nombre", "Apellido", "DNI", "Fecha nacimiento", "Email", "Teléfono", "Contacto emergencia", "Tel emergencia", "Obra social"];
    const body = rows.map(r => [
      r.nombre, r.apellido, r.dni ?? "", r.fecha_nacimiento ?? "",
      r.email, r.telefono,
      r.salud_data?.contacto_emergencia_nombre ?? "",
      r.salud_data?.contacto_emergencia_telefono ?? "",
      r.salud_data?.obra_social ?? "",
    ]);
    downloadCSV([header, ...body], `seguro_${eventTitle.replace(/\s+/g, "_")}.csv`);
  };

  const exportHabitaciones = () => {
    const header = ["Tipo habitación", "Género", "Nombre", "Apellido", "Compañero solicitado", "Notas"];
    const body: string[][] = [];
    Object.entries(habitaciones).forEach(([key, list]) => {
      const [tipo, genero] = key.split("__");
      list.forEach(r => {
        body.push([
          tipo, genero,
          r.nombre, r.apellido,
          r.habitacion_data?.companero_solicitado ?? "",
          r.habitacion_data?.notas_habitacion ?? "",
        ]);
      });
    });
    downloadCSV([header, ...body], `habitaciones_${eventTitle.replace(/\s+/g, "_")}.csv`);
  };

  const missingSeguro = rows.filter(r => !r.dni || !r.fecha_nacimiento);
  const missingHab = rows.filter(r => !r.habitacion_data?.tipo_habitacion);

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
                  {rows.length} participante(s) · {Object.keys(habitaciones).length} agrupamiento(s)
                </p>
                <Button size="sm" variant="outline" onClick={exportHabitaciones}>
                  <Download className="w-3.5 h-3.5 mr-1.5" /> CSV
                </Button>
              </div>
              {missingHab.length > 0 && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-2.5 text-xs flex items-start gap-2">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                  <span>{missingHab.length} participante(s) sin habitación asignada.</span>
                </div>
              )}
              <div className="space-y-3">
                {Object.entries(habitaciones).map(([key, list]) => {
                  const [tipo, genero] = key.split("__");
                  return (
                    <div key={key} className="rounded-lg border border-border p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="outline" className="text-[10px] capitalize">{tipo.replace(/_/g, " ")}</Badge>
                        <Badge variant="outline" className="text-[10px] capitalize">{genero.replace(/_/g, " ")}</Badge>
                        <span className="text-xs text-muted-foreground">{list.length} persona(s)</span>
                      </div>
                      <div className="space-y-1">
                        {list.map(r => (
                          <div key={r.reservation_id} className="flex items-center justify-between text-xs">
                            <span className="font-medium">{r.nombre} {r.apellido}</span>
                            {r.habitacion_data?.companero_solicitado && (
                              <span className="text-[10px] text-muted-foreground">→ pide: {r.habitacion_data.companero_solicitado}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
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
                  <span>{missingSeguro.length} participante(s) sin DNI o fecha de nacimiento cargados.</span>
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-1.5 px-2">Nombre</th>
                      <th className="text-left py-1.5 px-2">DNI</th>
                      <th className="text-left py-1.5 px-2">F. nacimiento</th>
                      <th className="text-left py-1.5 px-2">Tel. emergencia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(r => (
                      <tr key={r.reservation_id} className="border-b border-border/50">
                        <td className="py-1.5 px-2 font-medium">{r.nombre} {r.apellido}</td>
                        <td className="py-1.5 px-2">{r.dni || <span className="text-amber-500">falta</span>}</td>
                        <td className="py-1.5 px-2">{r.fecha_nacimiento || <span className="text-amber-500">falta</span>}</td>
                        <td className="py-1.5 px-2">{r.salud_data?.contacto_emergencia_telefono || <span className="text-muted-foreground italic">—</span>}</td>
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
