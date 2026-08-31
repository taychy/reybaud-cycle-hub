import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, Mail, Megaphone } from "lucide-react";
import EnvioDetalleDrawer, { EstadoBadge, type BroadcastDetalle, type DetalleEnvio } from "./EnvioDetalleDrawer";
import { groupByDayAndTemplate, type EmailLogRow, type EstadoAgregado, type EventoEmail } from "@/lib/emailLog";

type Filtro = "todos" | "automaticos" | "masivos" | "exitosos" | "error";

const FILTROS: Array<{ value: Filtro; label: string }> = [
  { value: "todos", label: "Todos" },
  { value: "automaticos", label: "Automáticos" },
  { value: "masivos", label: "Masivos" },
  { value: "exitosos", label: "Exitosos" },
  { value: "error", label: "Con error" },
];

interface Fila {
  id: string;
  fecha: string;
  titulo: string;
  subtitulo: string;
  tipo: "automatico" | "masivo";
  total: number;
  enviados: number;
  fallidos: number;
  estado: EstadoAgregado;
  detalle: DetalleEnvio;
  buscar: string;
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("es-AR", {
    day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit",
  });

/** Historial unificado: automáticos (email_send_log) + masivos (broadcasts). */
export default function ComunicacionesHistorial() {
  const [loading, setLoading] = useState(true);
  const [eventos, setEventos] = useState<EventoEmail[]>([]);
  const [broadcasts, setBroadcasts] = useState<BroadcastDetalle[]>([]);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [q, setQ] = useState("");
  const [limite, setLimite] = useState(50);
  const [detalle, setDetalle] = useState<DetalleEnvio | null>(null);

  useEffect(() => {
    let cancel = false;
    const run = async () => {
      setLoading(true);
      const desde = new Date(Date.now() - 180 * 86400000).toISOString();
      const [logRes, bRes] = await Promise.all([
        supabase
          .from("email_send_log")
          .select("id, message_id, template_name, recipient_email, status, error_message, metadata, created_at")
          .gte("created_at", desde)
          .order("created_at", { ascending: false })
          .limit(8000),
        supabase
          .from("broadcasts")
          .select("id, subject, preheader, content_html, status, total_recipients, sent_count, failed_count, created_at, sent_at")
          .order("created_at", { ascending: false })
          .limit(200),
      ]);
      if (cancel) return;
      setEventos(groupByDayAndTemplate(((logRes.data as any) || []) as EmailLogRow[]));
      setBroadcasts(((bRes.data as any) || []) as BroadcastDetalle[]);
      setLoading(false);
    };
    run();
    return () => { cancel = true; };
  }, []);

  const filas: Fila[] = useMemo(() => {
    const autos: Fila[] = eventos.map((ev) => ({
      id: `auto-${ev.key}`,
      fecha: ev.hasta,
      titulo: ev.label,
      subtitulo: ev.templateName,
      tipo: "automatico",
      total: ev.total,
      enviados: ev.enviados,
      fallidos: ev.fallidos,
      estado: ev.estado,
      detalle: { tipo: "automatico", evento: ev },
      buscar: `${ev.label} ${ev.templateName} ${ev.destinatarios.map((d) => d.email).join(" ")}`.toLowerCase(),
    }));

    const mas: Fila[] = broadcasts.map((b) => {
      const ko = b.failed_count || 0;
      const ok = b.sent_count || 0;
      const estado: EstadoAgregado =
        ko > 0 ? (ok > 0 ? "parcial" : "fallo") : b.status === "sent" ? "enviado" : "pendiente";
      return {
        id: `mas-${b.id}`,
        fecha: b.sent_at || b.created_at,
        titulo: b.subject,
        subtitulo: "Envío masivo",
        tipo: "masivo",
        total: b.total_recipients || 0,
        enviados: ok,
        fallidos: ko,
        estado,
        detalle: { tipo: "masivo", broadcast: b },
        buscar: `${b.subject}`.toLowerCase(),
      };
    });

    let out = [...autos, ...mas].sort((a, b) => (a.fecha < b.fecha ? 1 : -1));

    if (filtro === "automaticos") out = out.filter((f) => f.tipo === "automatico");
    if (filtro === "masivos") out = out.filter((f) => f.tipo === "masivo");
    if (filtro === "exitosos") out = out.filter((f) => f.estado === "enviado");
    if (filtro === "error") out = out.filter((f) => f.estado === "fallo" || f.estado === "parcial");

    const term = q.trim().toLowerCase();
    if (term) out = out.filter((f) => f.buscar.includes(term));
    return out;
  }, [eventos, broadcasts, filtro, q]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por asunto, plantilla o email…"
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {FILTROS.map((f) => (
            <Button
              key={f.value}
              size="sm"
              variant={filtro === f.value ? "default" : "outline"}
              onClick={() => setFiltro(f.value)}
            >
              {f.label}
            </Button>
          ))}
        </div>
      </div>

      {loading ? (
        <Card className="p-6 flex justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </Card>
      ) : filas.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground">No hay envíos que coincidan.</Card>
      ) : (
        <div className="space-y-2">
          {filas.slice(0, limite).map((f) => (
            <button
              key={f.id}
              onClick={() => setDetalle(f.detalle)}
              className="w-full rounded-lg border border-border bg-card p-3 text-left hover:bg-secondary/60 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground flex items-center gap-2">
                    {f.tipo === "masivo" ? (
                      <Megaphone className="w-3.5 h-3.5 text-primary shrink-0" />
                    ) : (
                      <Mail className="w-3.5 h-3.5 text-primary shrink-0" />
                    )}
                    <span className="truncate">{f.titulo}</span>
                  </p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {fmt(f.fecha)} · {f.total} destinatario{f.total === 1 ? "" : "s"}
                    {f.fallidos > 0 && ` · ${f.fallidos} con error`}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <Badge variant="outline" className="text-[10px]">
                    {f.tipo === "masivo" ? "Masivo" : "Automático"}
                  </Badge>
                  <EstadoBadge estado={f.estado} />
                </div>
              </div>
            </button>
          ))}
          {filas.length > limite && (
            <Button variant="outline" className="w-full" onClick={() => setLimite((l) => l + 50)}>
              Ver más ({filas.length - limite} restantes)
            </Button>
          )}
        </div>
      )}

      <EnvioDetalleDrawer detalle={detalle} onClose={() => setDetalle(null)} />
    </div>
  );
}
