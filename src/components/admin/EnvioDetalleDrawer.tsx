import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, BookmarkPlus, CheckCircle2, Clock, Loader2, XCircle } from "lucide-react";
import {
  ESTADO_LABEL,
  normalizeStatus,
  snapshotDelEvento,
  type EstadoAgregado,
  type EstadoEnvio,
  type EventoEmail,
  type SnapshotEmail,
} from "@/lib/emailLog";

export interface BroadcastDetalle {
  id: string;
  subject: string;
  preheader: string | null;
  content_html: string | null;
  status: string;
  total_recipients: number | null;
  sent_count: number | null;
  failed_count: number | null;
  created_at: string;
  sent_at: string | null;
}

export type DetalleEnvio =
  | { tipo: "automatico"; evento: EventoEmail }
  | { tipo: "masivo"; broadcast: BroadcastDetalle };

export const estadoClass: Record<EstadoAgregado, string> = {
  enviado: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  parcial: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  fallo: "bg-destructive/10 text-destructive border-destructive/30",
  pendiente: "bg-muted text-muted-foreground border-border",
  suprimido: "bg-muted text-muted-foreground border-border",
};

const EstadoIcon = ({ estado }: { estado: EstadoAgregado }) => {
  if (estado === "enviado") return <CheckCircle2 className="w-3.5 h-3.5" />;
  if (estado === "fallo") return <XCircle className="w-3.5 h-3.5" />;
  if (estado === "parcial") return <AlertTriangle className="w-3.5 h-3.5" />;
  return <Clock className="w-3.5 h-3.5" />;
};

export const EstadoBadge = ({ estado }: { estado: EstadoAgregado }) => (
  <Badge variant="outline" className={`gap-1 text-[11px] ${estadoClass[estado]}`}>
    <EstadoIcon estado={estado} /> {ESTADO_LABEL[estado]}
  </Badge>
);

const fmtFecha = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString("es-AR", {
        day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
      })
    : "—";

interface RecipientRow {
  email: string;
  nombre: string | null;
  estado: EstadoEnvio;
  error: string | null;
  fecha: string | null;
}

const Stat = ({ label, value, tone }: { label: string; value: number | string; tone?: string }) => (
  <div className="rounded-lg border border-border bg-card p-3">
    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
    <p className={`text-xl font-heading font-bold ${tone || "text-foreground"}`}>{value}</p>
  </div>
);

export default function EnvioDetalleDrawer({
  detalle,
  onClose,
}: {
  detalle: DetalleEnvio | null;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [recipients, setRecipients] = useState<RecipientRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [nombrePlantilla, setNombrePlantilla] = useState("");
  const [mostrarGuardar, setMostrarGuardar] = useState(false);

  const snapshot: SnapshotEmail | null = useMemo(() => {
    if (!detalle) return null;
    if (detalle.tipo === "masivo") {
      return {
        subject: detalle.broadcast.subject,
        html: detalle.broadcast.content_html,
        text: null,
      };
    }
    return snapshotDelEvento(detalle.evento);
  }, [detalle]);

  useEffect(() => {
    setMostrarGuardar(false);
    if (!detalle) {
      setRecipients([]);
      return;
    }
    setNombrePlantilla(
      detalle.tipo === "masivo" ? detalle.broadcast.subject : detalle.evento.label,
    );

    let cancel = false;
    const run = async () => {
      setLoading(true);
      if (detalle.tipo === "masivo") {
        const { data } = await supabase
          .from("broadcast_recipients")
          .select("email, name, status, error_message, sent_at, created_at")
          .eq("broadcast_id", detalle.broadcast.id)
          .order("created_at", { ascending: false })
          .limit(500);
        if (cancel) return;
        setRecipients(
          (data || []).map((r: any) => ({
            email: r.email,
            nombre: r.name,
            estado: normalizeStatus(r.status),
            error: r.error_message,
            fecha: r.sent_at || r.created_at,
          })),
        );
      } else {
        const emails = Array.from(
          new Set(detalle.evento.destinatarios.map((d) => d.email).filter((e) => e && e !== "—")),
        ).slice(0, 300);
        let nombres = new Map<string, string>();
        if (emails.length) {
          const { data } = await supabase
            .from("alumnos")
            .select("email, nombre, apellido")
            .in("email", emails);
          nombres = new Map(
            (data || []).map((a: any) => [
              String(a.email).toLowerCase(),
              `${a.nombre || ""} ${a.apellido || ""}`.trim(),
            ]),
          );
        }
        if (cancel) return;
        setRecipients(
          detalle.evento.destinatarios.map((d) => ({
            email: d.email,
            nombre: nombres.get(d.email.toLowerCase()) || null,
            estado: d.estado,
            error: d.error,
            fecha: d.fecha,
          })),
        );
      }
      setLoading(false);
    };
    run();
    return () => {
      cancel = true;
    };
  }, [detalle]);

  const guardarPlantilla = async () => {
    if (!snapshot?.html || !nombrePlantilla.trim()) return;
    setGuardando(true);
    const { data: userRes } = await supabase.auth.getUser();
    const { error } = await supabase.from("broadcast_templates").insert({
      name: nombrePlantilla.trim(),
      description:
        detalle?.tipo === "masivo"
          ? `Copiada del envío masivo del ${fmtFecha(detalle.broadcast.sent_at || detalle.broadcast.created_at)}`
          : `Copiada del email automático del ${fmtFecha(detalle && detalle.tipo === "automatico" ? detalle.evento.hasta : null)}`,
      subject: snapshot.subject || nombrePlantilla.trim(),
      content_html: snapshot.html,
      created_by: userRes?.user?.id ?? null,
    });
    setGuardando(false);
    if (error) {
      toast({ title: "No se pudo guardar", description: error.message, variant: "destructive" });
      return;
    }
    setMostrarGuardar(false);
    toast({ title: "Plantilla creada", description: "Ya está disponible en Email masivo." });
  };

  if (!detalle) return null;

  const esAuto = detalle.tipo === "automatico";
  const titulo = esAuto ? detalle.evento.label : detalle.broadcast.subject;
  const fecha = esAuto ? detalle.evento.hasta : detalle.broadcast.sent_at || detalle.broadcast.created_at;
  const total = esAuto ? detalle.evento.total : detalle.broadcast.total_recipients || 0;
  const ok = esAuto ? detalle.evento.enviados : detalle.broadcast.sent_count || 0;
  const ko = esAuto ? detalle.evento.fallidos : detalle.broadcast.failed_count || 0;
  const estado: EstadoAgregado = esAuto
    ? detalle.evento.estado
    : ko > 0
      ? ok > 0
        ? "parcial"
        : "fallo"
      : detalle.broadcast.status === "sent"
        ? "enviado"
        : "pendiente";

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader className="text-left">
          <SheetTitle className="font-heading uppercase tracking-wide text-lg">{titulo}</SheetTitle>
          <SheetDescription className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="text-[11px]">{esAuto ? "Automático" : "Masivo"}</Badge>
            <EstadoBadge estado={estado} />
            <span className="text-xs">{fmtFecha(fecha)}</span>
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <Stat label="Destinatarios" value={total} />
          <Stat label="Enviados" value={ok} tone="text-emerald-400" />
          <Stat label="Fallidos" value={ko} tone={ko > 0 ? "text-destructive" : undefined} />
        </div>

        <Separator className="my-4" />

        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Contenido enviado
          </p>
          {snapshot?.html || snapshot?.subject ? (
            <div className="rounded-lg border border-border p-3 space-y-2">
              {snapshot.subject && (
                <p className="text-sm text-foreground">
                  <span className="text-muted-foreground">Asunto: </span>
                  {snapshot.subject}
                </p>
              )}
              {snapshot.html && (
                <div
                  className="max-h-64 overflow-y-auto rounded bg-background p-3 text-xs prose-sm [&_*]:!text-foreground"
                  dangerouslySetInnerHTML={{ __html: snapshot.html }}
                />
              )}
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
              El contenido exacto de este envío no quedó guardado. No lo reconstruimos con la
              plantilla actual porque pudo haber cambiado desde entonces.
            </p>
          )}

          {snapshot?.html ? (
            mostrarGuardar ? (
              <div className="rounded-lg border border-border p-3 space-y-2">
                <Label className="text-xs">Nombre de la plantilla</Label>
                <Input value={nombrePlantilla} onChange={(e) => setNombrePlantilla(e.target.value)} />
                <div className="flex gap-2">
                  <Button size="sm" onClick={guardarPlantilla} disabled={guardando || !nombrePlantilla.trim()}>
                    {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : "Crear plantilla"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setMostrarGuardar(false)}>
                    Cancelar
                  </Button>
                </div>
              </div>
            ) : (
              <Button size="sm" variant="outline" className="gap-2" onClick={() => setMostrarGuardar(true)}>
                <BookmarkPlus className="w-4 h-4" /> Guardar como plantilla
              </Button>
            )
          ) : (
            <Button size="sm" variant="outline" className="gap-2" disabled title="Sin contenido histórico guardado">
              <BookmarkPlus className="w-4 h-4" /> Guardar como plantilla
            </Button>
          )}
        </div>

        <Separator className="my-4" />

        <div className="space-y-2 pb-8">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Destinatarios ({recipients.length})
          </p>
          {loading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
          {!loading && recipients.length === 0 && (
            <p className="text-xs text-muted-foreground">Sin destinatarios registrados.</p>
          )}
          <div className="space-y-1.5">
            {recipients.map((r, i) => (
              <div
                key={`${r.email}-${i}`}
                className="flex items-start justify-between gap-2 rounded-md border border-border p-2"
              >
                <div className="min-w-0">
                  {r.nombre && <p className="text-xs font-medium text-foreground truncate">{r.nombre}</p>}
                  <p className="text-[11px] text-muted-foreground break-all">{r.email}</p>
                  {r.error && <p className="text-[11px] text-destructive break-words">{r.error}</p>}
                </div>
                <EstadoBadge estado={r.estado} />
              </div>
            ))}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
