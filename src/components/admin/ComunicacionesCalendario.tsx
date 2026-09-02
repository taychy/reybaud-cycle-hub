import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChevronLeft, ChevronRight, Loader2, Mail } from "lucide-react";
import EnvioDetalleDrawer, { EstadoBadge, type DetalleEnvio } from "./EnvioDetalleDrawer";
import ComunicacionesDiaDrawer from "./ComunicacionesDiaDrawer";
import {
  estadoDelDia,
  groupByDayAndTemplate,
  localDayKey,
  type EmailLogRow,
  type EstadoAgregado,
  type EventoEmail,
} from "@/lib/emailLog";

const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const puntoClass: Record<EstadoAgregado, string> = {
  enviado: "bg-emerald-500",
  parcial: "bg-amber-500",
  fallo: "bg-destructive",
  pendiente: "bg-muted-foreground",
  suprimido: "bg-muted-foreground",
};

const bordeClass: Record<EstadoAgregado, string> = {
  enviado: "border-emerald-500/40",
  parcial: "border-amber-500/40",
  fallo: "border-destructive/50",
  pendiente: "border-border",
  suprimido: "border-border",
};

/** Calendario mensual de emails automáticos realmente ejecutados. */
export default function ComunicacionesCalendario() {
  const hoy = new Date();
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [mes, setMes] = useState(hoy.getMonth());
  const [rows, setRows] = useState<EmailLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [diaSel, setDiaSel] = useState<string>(localDayKey(hoy.toISOString()));
  const [detalle, setDetalle] = useState<DetalleEnvio | null>(null);

  useEffect(() => {
    let cancel = false;
    const run = async () => {
      setLoading(true);
      const desde = new Date(anio, mes, 1).toISOString();
      const hasta = new Date(anio, mes + 1, 1).toISOString();
      const { data } = await supabase
        .from("email_send_log")
        .select("id, message_id, template_name, recipient_email, status, error_message, metadata, created_at")
        .gte("created_at", desde)
        .lt("created_at", hasta)
        .order("created_at", { ascending: false })
        .limit(5000);
      if (cancel) return;
      setRows((data as any) || []);
      setLoading(false);
    };
    run();
    return () => { cancel = true; };
  }, [anio, mes]);

  const eventosPorDia = useMemo(() => {
    const map = new Map<string, EventoEmail[]>();
    for (const ev of groupByDayAndTemplate(rows)) {
      (map.get(ev.dia) || map.set(ev.dia, []).get(ev.dia)!).push(ev);
    }
    return map;
  }, [rows]);

  const celdas = useMemo(() => {
    const primero = new Date(anio, mes, 1);
    const offset = primero.getDay();
    const diasMes = new Date(anio, mes + 1, 0).getDate();
    const out: Array<{ dia: string; num: number } | null> = [];
    for (let i = 0; i < offset; i++) out.push(null);
    for (let d = 1; d <= diasMes; d++) {
      out.push({ dia: `${anio}-${String(mes + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`, num: d });
    }
    return out;
  }, [anio, mes]);

  const cambiarMes = (delta: number) => {
    const d = new Date(anio, mes + delta, 1);
    setAnio(d.getFullYear());
    setMes(d.getMonth());
  };

  const eventosDelDia = eventosPorDia.get(diaSel) || [];
  const hoyKey = localDayKey(hoy.toISOString());

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => cambiarMes(-1)}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <p className="min-w-[170px] text-center text-sm font-heading font-bold uppercase tracking-wider">
            {MESES[mes]} {anio}
          </p>
          <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => cambiarMes(1)}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
        {loading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
      </div>

      <Card className="p-2 sm:p-3">
        <div className="grid grid-cols-7 gap-1 sm:gap-2">
          {DIAS.map((d) => (
            <div key={d} className="text-center text-[10px] uppercase tracking-wider text-muted-foreground py-1">
              {d}
            </div>
          ))}
          {celdas.map((c, i) => {
            if (!c) return <div key={`e${i}`} />;
            const evs = eventosPorDia.get(c.dia) || [];
            const estado = evs.length ? estadoDelDia(evs) : null;
            const sel = c.dia === diaSel;
            return (
              <button
                key={c.dia}
                onClick={() => setDiaSel(c.dia)}
                className={`min-h-[58px] sm:min-h-[86px] rounded-lg border p-1.5 text-left transition-colors ${
                  sel ? "border-primary bg-primary/10" : `${estado ? bordeClass[estado] : "border-border"} hover:bg-secondary/60`
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-semibold ${c.dia === hoyKey ? "text-primary" : "text-foreground"}`}>
                    {c.num}
                  </span>
                  {estado && <span className={`h-1.5 w-1.5 rounded-full ${puntoClass[estado]}`} />}
                </div>
                <div className="mt-1 hidden sm:block space-y-0.5">
                  {evs.slice(0, 2).map((ev) => (
                    <p key={ev.key} className="truncate text-[10px] text-muted-foreground">
                      <span className={`inline-block h-1.5 w-1.5 rounded-full mr-1 ${puntoClass[ev.estado]}`} />
                      {ev.label} · {ev.enviados}/{ev.total}
                    </p>
                  ))}
                  {evs.length > 2 && (
                    <p className="text-[10px] text-primary">+{evs.length - 2} más</p>
                  )}
                </div>
                {evs.length > 0 && (
                  <p className="sm:hidden text-[10px] text-muted-foreground">{evs.length}</p>
                )}
              </button>
            );
          })}
        </div>
      </Card>

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Envíos del {diaSel.split("-").reverse().join("/")}
        </p>
        {eventosDelDia.length === 0 ? (
          <Card className="p-4 text-sm text-muted-foreground">
            No hay emails automáticos registrados ese día.
          </Card>
        ) : (
          eventosDelDia.map((ev) => (
            <button
              key={ev.key}
              onClick={() => setDetalle({ tipo: "automatico", evento: ev })}
              className="w-full rounded-lg border border-border bg-card p-3 text-left hover:bg-secondary/60 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground flex items-center gap-2">
                    <Mail className="w-3.5 h-3.5 text-primary shrink-0" />
                    <span className="truncate">{ev.label}</span>
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {ev.enviados}/{ev.total} enviados
                    {ev.fallidos > 0 && ` · ${ev.fallidos} con error`}
                    {" · "}
                    {new Date(ev.hasta).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                <EstadoBadge estado={ev.estado} />
              </div>
            </button>
          ))
        )}
      </div>

      <EnvioDetalleDrawer detalle={detalle} onClose={() => setDetalle(null)} />
    </div>
  );
}
