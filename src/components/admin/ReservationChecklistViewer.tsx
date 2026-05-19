import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2, Clock, FileText, AlertCircle, ExternalLink, Loader2, Image as ImageIcon, Pencil,
} from "lucide-react";
import TripBikeDrawer from "@/components/reservation/TripBikeDrawer";
import TripPedalsDrawer from "@/components/reservation/TripPedalsDrawer";
import TripDocumentDrawer from "@/components/reservation/TripDocumentDrawer";

interface ChecklistRow {
  id: string;
  step_key: string;
  data: Record<string, any>;
  file_url: string | null;
  completed: boolean;
  needs_advice: boolean;
  updated_at: string;
}

const STEP_LABELS: Record<string, string> = {
  bici: "Bici",
  pedales: "Pedales",
  pasaje: "Pasaje / vuelo",
  seguro: "Seguro de viaje",
  pasaporte: "Pasaporte / DNI",
  documentos: "Documentos",
  alojamiento: "Alojamiento",
  equipaje: "Equipaje",
  alquiler: "Alquiler de bici",
};

const ALL_STEPS = ["bici", "pedales", "pasaje", "seguro"];

const labelFor = (key: string) =>
  STEP_LABELS[key] || key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, " ");

const isImage = (url: string) => /\.(jpe?g|png|webp|gif|jfif|heic)(\?|$)/i.test(url);

const formatDataValue = (key: string, value: any) => {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Sí" : "No";
  return String(value);
};

const dataLabel = (key: string) => {
  const map: Record<string, string> = {
    bike_size: "Talle de bici",
    stature: "Estatura (cm)",
    pedal_type: "Tipo de pedal",
    rental: "Alquila bici",
    luggage: "Equipaje",
    insurance_company: "Aseguradora",
    insurance_number: "N° de póliza",
    flight_number: "N° de vuelo",
    arrival_date: "Llegada",
    departure_date: "Regreso",
  };
  return map[key] || key.replace(/_/g, " ");
};

interface Props {
  reservationId: string;
  alumnoId: string | null;
}

export function ReservationChecklistViewer({ reservationId, alumnoId }: Props) {
  const [rows, setRows] = useState<ChecklistRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!alumnoId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("reservation_checklist_data")
        .select("id, step_key, data, file_url, completed, needs_advice, updated_at")
        .eq("reservation_id", reservationId)
        .order("updated_at", { ascending: true });
      if (!cancelled) {
        setRows((data || []) as ChecklistRow[]);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [reservationId, alumnoId]);

  if (!alumnoId) {
    return (
      <div className="rounded-xl border border-border p-4 text-xs text-muted-foreground">
        El checklist de viaje sólo aplica a alumnos registrados (no a participantes externos).
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-border p-4 flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Cargando preparación del viaje...
      </div>
    );
  }

  const byKey = new Map(rows.map((r) => [r.step_key, r]));
  const knownSteps = Array.from(new Set([...ALL_STEPS, ...rows.map((r) => r.step_key)]));
  const completedCount = rows.filter((r) => r.completed).length;
  const adviceCount = rows.filter((r) => r.needs_advice).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Preparación del viaje
        </h4>
        <div className="flex items-center gap-1.5">
          <Badge variant="outline" className="text-[10px]">
            {completedCount}/{knownSteps.length} pasos
          </Badge>
          {adviceCount > 0 && (
            <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-500">
              {adviceCount} pide ayuda
            </Badge>
          )}
        </div>
      </div>

      <div className="space-y-2">
        {knownSteps.map((key) => {
          const row = byKey.get(key);
          const dataEntries = row?.data
            ? Object.entries(row.data).filter(([, v]) => v !== null && v !== "" && v !== undefined)
            : [];

          return (
            <div
              key={key}
              className={`rounded-lg border p-3 ${
                row?.needs_advice
                  ? "border-amber-500/40 bg-amber-500/5"
                  : row?.completed
                  ? "border-emerald-500/30 bg-emerald-500/5"
                  : "border-border bg-muted/20"
              }`}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  {row?.completed ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  ) : (
                    <Clock className="w-4 h-4 text-muted-foreground shrink-0" />
                  )}
                  <span className="text-sm font-medium">{labelFor(key)}</span>
                  {row?.needs_advice && (
                    <Badge variant="outline" className="text-[9px] border-amber-500/40 text-amber-500">
                      <AlertCircle className="w-2.5 h-2.5 mr-0.5" /> Asesoramiento
                    </Badge>
                  )}
                </div>
                {row?.updated_at && (
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {new Date(row.updated_at).toLocaleDateString("es-AR", {
                      day: "2-digit", month: "short",
                    })}
                  </span>
                )}
              </div>

              {!row && (
                <p className="text-xs text-muted-foreground italic pl-6">Sin completar</p>
              )}

              {row && dataEntries.length > 0 && (
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 pl-6 text-xs mb-2">
                  {dataEntries.map(([k, v]) => (
                    <div key={k} className="flex flex-col">
                      <span className="text-[10px] text-muted-foreground capitalize">{dataLabel(k)}</span>
                      <span className="font-medium">{formatDataValue(k, v)}</span>
                    </div>
                  ))}
                </div>
              )}

              {row?.file_url && (
                <div className="pl-6 mt-2">
                  {isImage(row.file_url) ? (
                    <a
                      href={row.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block group"
                    >
                      <img
                        src={row.file_url}
                        alt={`Archivo ${labelFor(key)}`}
                        className="w-20 h-20 rounded-md object-cover border border-border group-hover:border-primary transition-colors"
                      />
                    </a>
                  ) : (
                    <Button variant="outline" size="sm" asChild className="h-7 text-xs">
                      <a href={row.file_url} target="_blank" rel="noopener noreferrer">
                        <FileText className="w-3 h-3 mr-1" />
                        Ver archivo
                        <ExternalLink className="w-3 h-3 ml-1" />
                      </a>
                    </Button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
