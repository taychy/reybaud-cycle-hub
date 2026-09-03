import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GraduationCap, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  agendaLabel, confirmacionLabel,
  type ProgramaClaseDocente, type ProgramaClaseEstado,
} from "@/lib/programaClases";

const sb: any = supabase;

/** Confirmación individual del profesor para las clases del Playbook del programa. */
const ClasesProgramaCard = ({ coachId }: { coachId: string | null }) => {
  const [clases, setClases] = useState<ProgramaClaseEstado[]>([]);
  const [docentes, setDocentes] = useState<ProgramaClaseDocente[]>([]);
  const [loading, setLoading] = useState(true);
  const [motivoFor, setMotivoFor] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!coachId) { setLoading(false); return; }
    setLoading(true);
    const { data: docs } = await sb
      .from("programa_clase_docentes")
      .select("*")
      .eq("coach_id", coachId);
    const lista = (docs || []) as ProgramaClaseDocente[];
    setDocentes(lista);
    if (lista.length) {
      const { data: cl } = await sb
        .from("vw_programa_clases_estado")
        .select("*")
        .in("id", lista.map((d) => d.clase_id))
        .order("orden");
      setClases((cl || []) as ProgramaClaseEstado[]);
    } else {
      setClases([]);
    }
    setLoading(false);
  }, [coachId]);

  useEffect(() => { load(); }, [load]);

  const byClase = useMemo(() => {
    const m = new Map<string, ProgramaClaseDocente>();
    docentes.forEach((d) => m.set(d.clase_id, d));
    return m;
  }, [docentes]);

  const responder = async (docenteId: string, valor: "confirmado" | "no_puede", motivoTxt?: string) => {
    setSaving(docenteId);
    try {
      const { error } = await sb.rpc("programa_clase_confirmar_docente", {
        p_docente_id: docenteId,
        p_confirmacion: valor,
        p_motivo: motivoTxt || null,
      });
      if (error) throw error;
      toast.success(valor === "confirmado" ? "Clase confirmada" : "Aviso enviado a Admin");
      setMotivoFor(null);
      setMotivo("");
      await load();
    } catch (e: any) {
      toast.error(e.message || "No se pudo guardar");
    } finally {
      setSaving(null);
    }
  };

  if (loading || clases.length === 0) return null;

  return (
    <div className="rounded-2xl border border-border/50 bg-card/60 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <GraduationCap className="w-4 h-4 text-primary" />
        <p className="text-sm font-heading font-semibold uppercase tracking-wide">Clases del programa</p>
      </div>
      {clases.map((c) => {
        const d = byClase.get(c.id);
        if (!d) return null;
        return (
          <div key={c.id} className="rounded-xl border border-border/50 p-3 space-y-2">
            <p className="text-sm font-medium">Clase {c.orden} · {c.titulo}</p>
            <p className="text-xs text-muted-foreground">{agendaLabel(c)}</p>
            <Badge
              variant={d.confirmacion === "confirmado" ? "default" : d.confirmacion === "no_puede" ? "destructive" : "outline"}
              className="text-[10px]"
            >
              {confirmacionLabel(d.confirmacion)}
            </Badge>
            {motivoFor === d.id ? (
              <div className="space-y-2">
                <Input
                  placeholder="¿Por qué no podés?"
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                />
                <div className="flex gap-2">
                  <Button size="sm" variant="destructive" disabled={saving === d.id} onClick={() => responder(d.id, "no_puede", motivo)}>
                    {saving === d.id && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />} Enviar
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setMotivoFor(null)}>Cancelar</Button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button size="sm" disabled={saving === d.id} onClick={() => responder(d.id, "confirmado")}>
                  Confirmar
                </Button>
                <Button size="sm" variant="outline" onClick={() => { setMotivoFor(d.id); setMotivo(""); }}>
                  No puedo
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default ClasesProgramaCard;
