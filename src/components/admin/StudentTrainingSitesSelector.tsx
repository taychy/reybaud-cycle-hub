import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { ChevronDown, Star } from "lucide-react";
import { toast } from "sonner";

interface SedeOption {
  id: string;
  nombre: string;
}

interface Props {
  alumnoId: string;
  sedes: SedeOption[];
  primarySedeId: string | null;
  onPrimaryChange?: (sedeId: string | null) => void;
}

export default function StudentTrainingSitesSelector({
  alumnoId,
  sedes,
  primarySedeId,
  onPrimaryChange,
}: Props) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [principalId, setPrincipalId] = useState<string | null>(primarySedeId);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const selectedSedes = useMemo(
    () => sedes.filter((s) => selectedIds.includes(s.id)),
    [sedes, selectedIds],
  );

  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("alumno_sedes")
      .select("sede_id, es_principal")
      .eq("alumno_id", alumnoId);

    if (error) {
      setSelectedIds(primarySedeId ? [primarySedeId] : []);
      setPrincipalId(primarySedeId);
      setLoading(false);
      return;
    }

    const rows = (data as any[]) || [];
    const ids = rows.map((r) => r.sede_id);
    const principal = rows.find((r) => r.es_principal)?.sede_id || primarySedeId || ids[0] || null;
    setSelectedIds(ids.length ? ids : (primarySedeId ? [primarySedeId] : []));
    setPrincipalId(principal);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alumnoId]);

  const save = async (nextIds: string[], nextPrincipal: string | null) => {
    setSaving(true);
    const principal = nextIds.length === 0
      ? null
      : (nextPrincipal && nextIds.includes(nextPrincipal) ? nextPrincipal : nextIds[0]);

    const { error } = await (supabase as any).rpc("set_alumno_sedes", {
      _alumno_id: alumnoId,
      _sede_ids: nextIds,
      _principal_id: principal,
    });

    if (error) {
      toast.error(error.message || "No se pudieron actualizar las sedes");
      setSaving(false);
      return;
    }

    setSelectedIds(nextIds);
    setPrincipalId(principal);
    onPrimaryChange?.(principal);
    toast.success("Sedes donde entrena actualizadas");
    setSaving(false);
  };

  const toggleSede = (sedeId: string, checked: boolean) => {
    if (saving) return;
    const nextIds = checked
      ? Array.from(new Set([...selectedIds, sedeId]))
      : selectedIds.filter((id) => id !== sedeId);
    const nextPrincipal = !checked && principalId === sedeId ? (nextIds[0] || null) : principalId;
    save(nextIds, nextPrincipal);
  };

  const makePrincipal = (sedeId: string) => {
    if (saving || !selectedIds.includes(sedeId) || sedeId === principalId) return;
    save(selectedIds, sedeId);
  };

  return (
    <div className="flex flex-col items-end gap-2 min-w-0">
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            disabled={loading || saving}
            className="h-8 min-w-36 justify-between bg-secondary border-border text-xs"
          >
            {loading
              ? "Cargando..."
              : selectedIds.length === 0
                ? "Seleccionar sedes"
                : `${selectedIds.length} sede${selectedIds.length === 1 ? "" : "s"}`}
            <ChevronDown className="w-3.5 h-3.5 ml-2" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="z-[200] w-80 p-3" align="end">
          <div className="space-y-3">
            <div>
              <p className="text-sm font-medium">Sedes donde entrena</p>
              <p className="text-xs text-muted-foreground">
                Podés seleccionar más de una. Marcá una como principal.
              </p>
            </div>

            <div className="space-y-1">
              {sedes.map((sede) => {
                const checked = selectedIds.includes(sede.id);
                const principal = principalId === sede.id;
                return (
                  <div
                    key={sede.id}
                    className="flex items-center gap-2 rounded-md px-2 py-2 hover:bg-secondary/50"
                  >
                    <Checkbox
                      checked={checked}
                      disabled={saving}
                      onCheckedChange={(value) => toggleSede(sede.id, value === true)}
                    />
                    <span className="flex-1 text-sm">{sede.nombre}</span>
                    {checked && (
                      <Button
                        type="button"
                        variant={principal ? "secondary" : "ghost"}
                        size="sm"
                        disabled={saving}
                        onClick={() => makePrincipal(sede.id)}
                        className="h-7 px-2 text-[11px]"
                      >
                        <Star className={`w-3 h-3 mr-1 ${principal ? "fill-current" : ""}`} />
                        {principal ? "Principal" : "Hacer principal"}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {selectedSedes.length > 0 ? (
        <div className="flex flex-wrap justify-end gap-1 max-w-80">
          {selectedSedes.map((sede) => (
            <Badge
              key={sede.id}
              variant={sede.id === principalId ? "default" : "outline"}
              className="text-[10px]"
            >
              {sede.nombre}
              {sede.id === principalId ? " · Principal" : ""}
            </Badge>
          ))}
        </div>
      ) : (
        <span className="text-xs text-muted-foreground">Sin sedes asignadas</span>
      )}
    </div>
  );
}
