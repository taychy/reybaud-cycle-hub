import { useEffect, useMemo, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ChevronDown, ChevronRight, Mail } from "lucide-react";
import { EstadoBadge } from "./EnvioDetalleDrawer";
import { estadoDelDia, type EventoEmail } from "@/lib/emailLog";

interface Props {
  /** YYYY-MM-DD del día abierto, o null si el drawer está cerrado. */
  dia: string | null;
  eventos: EventoEmail[];
  /** Grupo (key de EventoEmail) que se debe abrir expandido al entrar. */
  focusKey?: string | null;
  onClose: () => void;
  /** Abre el detalle completo (contenido + plantilla) de un envío. */
  onVerEnvio: (ev: EventoEmail) => void;
}

const fmtHora = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });

const fmtFechaLarga = (dia: string) => {
  const [y, m, d] = dia.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
};

const Stat = ({ label, value, tone }: { label: string; value: number; tone?: string }) => (
  <div className="rounded-lg border border-border bg-card p-2.5">
    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
    <p className={`text-lg font-heading font-bold ${tone || "text-foreground"}`}>{value}</p>
  </div>
);

/** Detalle COMPLETO de un día del calendario, agrupado por envío lógico. */
export default function ComunicacionesDiaDrawer({ dia, eventos, focusKey, onClose, onVerEnvio }: Props) {
  const [abiertos, setAbiertos] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setAbiertos(focusKey ? { [focusKey]: true } : {});
  }, [dia, focusKey]);

  const resumen = useMemo(() => {
    const total = eventos.reduce((s, e) => s + e.total, 0);
    const enviados = eventos.reduce((s, e) => s + e.enviados, 0);
    const fallidos = eventos.reduce((s, e) => s + e.fallidos, 0);
    const pendientes = eventos.reduce((s, e) => s + e.pendientes, 0);
    return { total, enviados, fallidos, pendientes };
  }, [eventos]);

  if (!dia) return null;

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-xl flex flex-col p-0">
        <SheetHeader className="text-left p-6 pb-4">
          <SheetTitle className="font-heading uppercase tracking-wide text-lg">
            {fmtFechaLarga(dia)}
          </SheetTitle>
          <SheetDescription className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="text-[11px]">
              {eventos.length} envío{eventos.length === 1 ? "" : "s"}
            </Badge>
            {eventos.length > 0 && <EstadoBadge estado={estadoDelDia(eventos)} />}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 pb-10 space-y-4">
          <div className="grid grid-cols-4 gap-2">
            <Stat label="Total" value={resumen.total} />
            <Stat label="Enviados" value={resumen.enviados} tone="text-emerald-400" />
            <Stat
              label="Fallidos"
              value={resumen.fallidos}
              tone={resumen.fallidos > 0 ? "text-destructive" : undefined}
            />
            <Stat label="Pendientes" value={resumen.pendientes} />
          </div>

          <Separator />

          {eventos.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay emails registrados ese día.</p>
          ) : (
            <div className="space-y-2">
              {eventos.map((ev) => {
                const open = !!abiertos[ev.key];
                const dlq = ev.destinatarios.filter(
                  (d) => d.estado === "fallo" && (d.error || "").toLowerCase().includes("dlq"),
                ).length;
                return (
                  <div key={ev.key} className="rounded-lg border border-border bg-card">
                    <button
                      type="button"
                      onClick={() => setAbiertos((s) => ({ ...s, [ev.key]: !s[ev.key] }))}
                      className="w-full p-3 text-left hover:bg-secondary/60 transition-colors rounded-lg"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground flex items-center gap-2">
                            {open ? (
                              <ChevronDown className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                            )}
                            <Mail className="w-3.5 h-3.5 text-primary shrink-0" />
                            <span className="truncate">{ev.label}</span>
                          </p>
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            {fmtHora(ev.hasta)} · Automático · {ev.enviados} enviados
                            {ev.fallidos > 0 && ` · ${ev.fallidos} con error`}
                            {dlq > 0 && ` · ${dlq} en DLQ`}
                            {ev.pendientes > 0 && ` · ${ev.pendientes} pendientes`}
                          </p>
                        </div>
                        <EstadoBadge estado={ev.estado} />
                      </div>
                    </button>

                    {open && (
                      <div className="border-t border-border p-3 space-y-2">
                        <div className="max-h-72 overflow-y-auto space-y-1.5">
                          {ev.destinatarios.map((d) => (
                            <div
                              key={d.id}
                              className="flex items-start justify-between gap-2 rounded-md border border-border p-2"
                            >
                              <div className="min-w-0">
                                <p className="text-[11px] text-muted-foreground break-all">{d.email}</p>
                                {d.error && (
                                  <p className="text-[11px] text-destructive break-words">{d.error}</p>
                                )}
                              </div>
                              <EstadoBadge estado={d.estado} />
                            </div>
                          ))}
                        </div>
                        <Button size="sm" variant="outline" onClick={() => onVerEnvio(ev)}>
                          Ver contenido enviado
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
