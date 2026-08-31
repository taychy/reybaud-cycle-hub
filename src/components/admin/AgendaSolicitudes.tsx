import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { Check, Inbox, MessageSquare, X } from "lucide-react";
import {
  ALCANCE_LABEL,
  ESTADO_LABEL,
  TIPO_SOLICITUD_LABEL,
  camposModificados,
  resumenBloque,
  type AgendaSolicitud,
} from "@/lib/agendaSolicitudes";

const ESTADO_VARIANT: Record<string, string> = {
  pendiente: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  aprobada: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  rechazada: "bg-muted text-muted-foreground border-border",
};

/** Bandeja admin de solicitudes de cambio de agenda enviadas por los profesores. */
export const AgendaSolicitudes = ({ onResolved }: { onResolved?: () => void }) => {
  const [solicitudes, setSolicitudes] = useState<AgendaSolicitud[]>([]);
  const [coaches, setCoaches] = useState<any[]>([]);
  const [sedes, setSedes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [respuesta, setRespuesta] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [solRes, coachRes, sedeRes] = await Promise.all([
      supabase
        .from("agenda_solicitudes" as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100),
      supabase.from("coaches").select("id, nombre"),
      supabase.from("sedes").select("id, nombre"),
    ]);
    setSolicitudes(((solRes.data as any[]) || []) as AgendaSolicitud[]);
    setCoaches((coachRes.data as any[]) || []);
    setSedes((sedeRes.data as any[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const coachNombre = (id: string) => coaches.find((c) => c.id === id)?.nombre || "Profesor";
  const sedeNombre = (id?: string | null) => (id ? sedes.find((s) => s.id === id)?.nombre || null : null);

  const pendientes = useMemo(() => solicitudes.filter((s) => s.estado === "pendiente"), [solicitudes]);
  const resueltas = useMemo(() => solicitudes.filter((s) => s.estado !== "pendiente").slice(0, 15), [solicitudes]);

  const resolver = async (s: AgendaSolicitud, aprobar: boolean) => {
    setBusy(s.id);
    const { error } = await supabase.rpc("resolver_solicitud_agenda" as any, {
      p_solicitud_id: s.id,
      p_aprobar: aprobar,
      p_respuesta: respuesta[s.id] || null,
    });
    setBusy(null);
    if (error) {
      toast({ title: "No se pudo resolver", description: error.message, variant: "destructive" });
      return;
    }
    toast({
      title: aprobar ? "Solicitud aprobada" : "Solicitud rechazada",
      description: aprobar ? "El cambio ya se aplicó en la agenda." : "No se modificó nada en la agenda.",
    });
    setRespuesta((r) => ({ ...r, [s.id]: "" }));
    await load();
    onResolved?.();
  };

  const Item = ({ s }: { s: AgendaSolicitud }) => {
    const cambios = camposModificados(s.valores_anteriores, s.valores_nuevos);
    const sede = sedeNombre(s.valores_nuevos?.sede_id);
    return (
      <Card className="bg-card border-border">
        <CardContent className="p-3 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className={`text-[10px] ${ESTADO_VARIANT[s.estado] || ""}`}>
              {ESTADO_LABEL[s.estado] || s.estado}
            </Badge>
            <span className="text-sm font-medium text-foreground">{coachNombre(s.coach_id)}</span>
            <Badge variant="secondary" className="text-[10px]">
              {TIPO_SOLICITUD_LABEL[s.tipo] || s.tipo}
            </Badge>
            {s.alcance && (
              <Badge variant="outline" className="text-[10px]">{ALCANCE_LABEL[s.alcance] || s.alcance}</Badge>
            )}
          </div>

          {esSolicitudAjustePuntual(s.tipo) ? (
            <div className="rounded-md border border-primary/30 bg-primary/5 px-2 py-1.5 text-[12px]">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Cambio puntual propuesto</p>
              <p className="text-foreground">
                {s.tipo === "ajuste_eliminar"
                  ? `Quitar: ${resumenAjuste(s.valores_anteriores)}`
                  : resumenAjuste(s.valores_nuevos)}
              </p>
              <p className="text-[11px] text-muted-foreground">
                Aplica a toda la agenda de turnera del profesor esa fecha (no distingue servicio ni sede).
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[12px]">
              <div className="rounded-md border border-border bg-muted/20 px-2 py-1.5">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Antes</p>
                <p className="text-foreground">{resumenBloque(s.valores_anteriores)}</p>
              </div>
              <div className="rounded-md border border-primary/30 bg-primary/5 px-2 py-1.5">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Propuesto</p>
                <p className="text-foreground">{resumenBloque(s.valores_nuevos)}</p>
                {sede && <p className="text-muted-foreground">Sede: {sede}</p>}
              </div>
            </div>
          )}


          <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
            {s.fecha_efectiva && <span>Efectivo desde {String(s.fecha_efectiva).slice(0, 10)}</span>}
            {cambios.length > 0 && <span>Cambia: {cambios.join(", ")}</span>}
            <span>{new Date(s.created_at).toLocaleString("es-AR")}</span>
          </div>

          {s.motivo && (
            <p className="text-[12px] text-foreground flex items-start gap-1.5">
              <MessageSquare className="w-3 h-3 mt-0.5 text-muted-foreground shrink-0" /> {s.motivo}
            </p>
          )}

          {s.estado === "pendiente" ? (
            <div className="space-y-2 pt-1">
              <Textarea
                rows={2}
                placeholder="Respuesta para el profesor (opcional)"
                value={respuesta[s.id] || ""}
                onChange={(e) => setRespuesta((r) => ({ ...r, [s.id]: e.target.value }))}
              />
              <div className="flex gap-2">
                <Button size="sm" variant="gold" disabled={busy === s.id} onClick={() => resolver(s, true)}>
                  <Check className="w-3.5 h-3.5 mr-1" /> Aprobar y aplicar
                </Button>
                <Button size="sm" variant="outline" disabled={busy === s.id} onClick={() => resolver(s, false)}>
                  <X className="w-3.5 h-3.5 mr-1" /> Rechazar
                </Button>
              </div>
            </div>
          ) : (
            s.respuesta_admin && (
              <p className="text-[11px] text-muted-foreground italic">Respuesta: {s.respuesta_admin}</p>
            )
          )}
        </CardContent>
      </Card>
    );
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground text-center py-8 animate-pulse">Cargando solicitudes…</p>;
  }

  return (
    <div className="space-y-4">
      <section className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-primary">
          Pendientes ({pendientes.length})
        </h2>
        {pendientes.length === 0 ? (
          <Card className="bg-card border-border">
            <CardContent className="py-8 text-center space-y-2">
              <Inbox className="w-7 h-7 mx-auto text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No hay solicitudes pendientes.</p>
            </CardContent>
          </Card>
        ) : (
          pendientes.map((s) => <Item key={s.id} s={s} />)
        )}
      </section>

      {resueltas.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Historial</h2>
          {resueltas.map((s) => <Item key={s.id} s={s} />)}
        </section>
      )}
    </div>
  );
};

export default AgendaSolicitudes;
