import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, Loader2, Mail, FileText, Camera, MessageSquare, Hash, Clock } from "lucide-react";

interface Props {
  instanceId: string;
  destinatarioEmail: string | null;
  initialNota?: string | null;
  saving: boolean;
  onConfirm: (payload: { nota: string }) => void;
  onCancel: () => void;
}

interface StageRow {
  id: string;
  orden: number;
  titulo: string;
  instrucciones: string | null;
  nota: string | null;
  foto_url: string | null;
  entidad_ref_texto: string | null;
  entidad_ref_id: string | null;
  completed_at: string | null;
  estado: string;
}

const FinalReportStage = ({ instanceId, destinatarioEmail, initialNota, saving, onConfirm, onCancel }: Props) => {
  const [loading, setLoading] = useState(true);
  const [stages, setStages] = useState<StageRow[]>([]);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [comentario, setComentario] = useState(initialNota || "");

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: instStages } = await (supabase as any)
        .from("process_instance_stages")
        .select("id, orden, template_stage_id, nota, foto_url, entidad_ref_texto, entidad_ref_id, completed_at, estado")
        .eq("instance_id", instanceId)
        .order("orden");
      const tplIds = (instStages || []).map((s: any) => s.template_stage_id);
      const { data: tplStages } = await (supabase as any)
        .from("process_template_stages")
        .select("id, titulo, instrucciones")
        .in("id", tplIds);
      const tplMap = new Map((tplStages || []).map((t: any) => [t.id, t]));
      const rows: StageRow[] = (instStages || []).map((s: any) => {
        const t: any = tplMap.get(s.template_stage_id) || {};
        return {
          id: s.id,
          orden: s.orden,
          titulo: t.titulo || `Etapa ${s.orden}`,
          instrucciones: t.instrucciones || null,
          nota: s.nota,
          foto_url: s.foto_url,
          entidad_ref_texto: s.entidad_ref_texto,
          entidad_ref_id: s.entidad_ref_id,
          completed_at: s.completed_at,
          estado: s.estado,
        };
      });
      setStages(rows);

      // sign photo paths
      const allPaths: string[] = [];
      for (const r of rows) {
        if (!r.foto_url) continue;
        try {
          const parsed = JSON.parse(r.foto_url);
          if (Array.isArray(parsed)) allPaths.push(...parsed);
          else allPaths.push(r.foto_url);
        } catch {
          allPaths.push(r.foto_url);
        }
      }
      const map: Record<string, string> = {};
      for (const p of allPaths) {
        const { data } = await supabase.storage.from("process-photos").createSignedUrl(p, 60 * 60);
        if (data?.signedUrl) map[p] = data.signedUrl;
      }
      setSignedUrls(map);
      setLoading(false);
    })();
  }, [instanceId]);

  const photosFor = (foto_url: string | null): string[] => {
    if (!foto_url) return [];
    try {
      const parsed = JSON.parse(foto_url);
      return Array.isArray(parsed) ? parsed : [foto_url];
    } catch {
      return [foto_url];
    }
  };

  // KPIs extraídos de notas (cuando la etapa de comparación dejó números en texto)
  const kpis = useMemo(() => {
    const allNotes = stages.map((s) => s.nota || "").join("\n");
    const grab = (re: RegExp) => {
      const m = allNotes.match(re);
      return m ? Number(m[1]) : null;
    };
    return {
      faltantes: grab(/faltant\w*[^0-9-]*(-?\d+)/i),
      excedentes: grab(/excedent\w*[^0-9-]*(-?\d+)/i),
      bajoStock: grab(/bajo\s*stock[^0-9-]*(-?\d+)/i),
    };
  }, [stages]);

  const formatDate = (iso: string | null) => {
    if (!iso) return "—";
    try { return new Date(iso).toLocaleString("es-AR"); } catch { return iso; }
  };

  if (loading) {
    return (
      <Card className="border-primary/40">
        <CardContent className="py-10 text-center">
          <Loader2 className="w-6 h-6 animate-spin mx-auto" />
          <p className="text-sm text-muted-foreground mt-2">Armando reporte…</p>
        </CardContent>
      </Card>
    );
  }

  const completedStages = stages.filter((s) => s.estado === "completada");

  return (
    <Card className="border-primary/40">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <FileText className="w-4 h-4 text-primary" />
          Reporte final
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Revisá el resumen de todo el proceso. Al finalizar se envía por mail{destinatarioEmail ? <> a <span className="text-foreground font-medium">{destinatarioEmail}</span></> : <span className="text-amber-400"> (sin destinatario configurado)</span>}.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* KPIs si se detectaron */}
        {(kpis.faltantes !== null || kpis.excedentes !== null || kpis.bajoStock !== null) && (
          <div className="grid grid-cols-3 gap-2">
            {kpis.faltantes !== null && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-center">
                <div className="text-[10px] uppercase text-muted-foreground">Faltantes</div>
                <div className="text-lg font-bold text-destructive">{kpis.faltantes}</div>
              </div>
            )}
            {kpis.excedentes !== null && (
              <div className="rounded-md border border-cyan-500/40 bg-cyan-500/10 p-2 text-center">
                <div className="text-[10px] uppercase text-muted-foreground">Excedentes</div>
                <div className="text-lg font-bold text-cyan-400">{kpis.excedentes}</div>
              </div>
            )}
            {kpis.bajoStock !== null && (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-center">
                <div className="text-[10px] uppercase text-muted-foreground">Bajo stock</div>
                <div className="text-lg font-bold text-amber-400">{kpis.bajoStock}</div>
              </div>
            )}
          </div>
        )}

        {/* Stages timeline */}
        <div className="space-y-3">
          {completedStages.map((s) => {
            const photos = photosFor(s.foto_url);
            return (
              <div key={s.id} className="rounded-md border border-border bg-secondary/30 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-500" />
                    <span className="text-sm font-medium">Etapa {s.orden}: {s.titulo}</span>
                  </div>
                  <Badge variant="outline" className="text-[10px] gap-1">
                    <Clock className="w-2.5 h-2.5" />
                    {formatDate(s.completed_at)}
                  </Badge>
                </div>
                {s.instrucciones && (
                  <p className="text-[11px] text-muted-foreground">{s.instrucciones}</p>
                )}
                {s.nota && (
                  <div className="flex gap-2 text-xs">
                    <MessageSquare className="w-3 h-3 mt-0.5 shrink-0 text-muted-foreground" />
                    <pre className="whitespace-pre-wrap font-sans bg-background/40 rounded p-2 flex-1 text-[11px]">{s.nota}</pre>
                  </div>
                )}
                {(s.entidad_ref_texto || s.entidad_ref_id) && (
                  <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Hash className="w-3 h-3" />
                    Ref: <span className="font-mono">{s.entidad_ref_texto || s.entidad_ref_id}</span>
                  </div>
                )}
                {photos.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {photos.map((p, i) => (
                      <a key={i} href={signedUrls[p]} target="_blank" rel="noreferrer" className="block">
                        {signedUrls[p] ? (
                          <img src={signedUrls[p]} alt="" className="w-20 h-20 object-cover rounded border border-border" />
                        ) : (
                          <div className="w-20 h-20 rounded border border-dashed border-border flex items-center justify-center">
                            <Camera className="w-4 h-4 text-muted-foreground" />
                          </div>
                        )}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Comentario final del gestor */}
        <div>
          <label className="text-sm font-medium block mb-1">Comentario final del gestor (opcional)</label>
          <Textarea
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            rows={4}
            placeholder="Observaciones generales, decisiones tomadas, próximos pasos…"
          />
        </div>

        <div className="flex gap-2">
          <Button
            onClick={() => onConfirm({ nota: comentario.trim() })}
            disabled={saving}
            className="flex-1"
          >
            {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Mail className="w-4 h-4 mr-1" />}
            Finalizar y enviar reporte
          </Button>
          <Button variant="ghost" onClick={onCancel}>Cancelar</Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default FinalReportStage;
