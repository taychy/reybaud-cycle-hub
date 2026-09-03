import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Loader2, ArrowDownRight, ArrowUpRight, Info, AlertTriangle } from "lucide-react";
import {
  calcularResumenMes,
  desgloseOrdenado,
  mesKey,
  mesLabel,
  mesToDateParam,
  ultimosMeses,
  type ResumenMesRaw,
  type ResumenMesCalculado,
} from "@/lib/finanzasResumen";

const MONEDAS = ["ARS", "USD", "EUR"];

function fmt(v: number, moneda: string) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: moneda,
    maximumFractionDigits: 0,
  }).format(v);
}

function Tarjeta({
  titulo,
  valor,
  detalle,
  tooltip,
  tono = "neutro",
  icon: Icon,
}: {
  titulo: string;
  valor: string;
  detalle?: React.ReactNode;
  tooltip?: string;
  tono?: "neutro" | "positivo" | "negativo" | "alerta";
  icon?: React.ElementType;
}) {
  const tonoClass =
    tono === "positivo"
      ? "text-green-500"
      : tono === "negativo"
        ? "text-destructive"
        : tono === "alerta"
          ? "text-yellow-500"
          : "text-foreground";

  return (
    <Card>
      <CardContent className="pt-4 pb-4">
        <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
          {Icon && <Icon className="w-3.5 h-3.5" />}
          <span className="truncate">{titulo}</span>
          {tooltip && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="w-3 h-3 shrink-0 opacity-60" />
                </TooltipTrigger>
                <TooltipContent className="max-w-[260px] text-xs">{tooltip}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
        <div className={`text-xl md:text-2xl font-bold mt-1 ${tonoClass}`}>{valor}</div>
        {detalle && <div className="text-xs text-muted-foreground mt-1">{detalle}</div>}
      </CardContent>
    </Card>
  );
}

/** Resumen simple del mes, en lenguaje humano, arriba del dashboard admin. */
export default function ResumenFinancieroMes() {
  const meses = useMemo(() => ultimosMeses(new Date(), 12), []);
  const [mes, setMes] = useState(() => mesKey(new Date()));
  const [moneda, setMoneda] = useState("ARS");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ResumenMesCalculado | null>(null);

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      setError(null);
      const { data: raw, error: err } = await supabase.rpc("get_resumen_financiero_mes" as any, {
        _mes: mesToDateParam(mes),
        _moneda: moneda,
      });
      if (cancel) return;
      if (err) {
        setError(err.message);
        setData(null);
      } else {
        setData(calcularResumenMes(raw as unknown as ResumenMesRaw));
      }
      setLoading(false);
    })();
    return () => {
      cancel = true;
    };
  }, [mes, moneda]);

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <h2 className="text-base font-semibold mr-auto">Cómo viene el mes</h2>
        <Select value={mes} onValueChange={setMes}>
          <SelectTrigger className="w-[170px] h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {meses.map((m) => (
              <SelectItem key={m} value={m}>
                {mesLabel(m)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={moneda} onValueChange={setMoneda}>
          <SelectTrigger className="w-[90px] h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MONEDAS.map((m) => (
              <SelectItem key={m} value={m}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
          <Loader2 className="w-4 h-4 animate-spin" /> Calculando…
        </div>
      )}

      {error && !loading && (
        <Card className="border-destructive/40">
          <CardContent className="pt-4 text-sm text-destructive">No se pudo cargar el resumen: {error}</CardContent>
        </Card>
      )}

      {data && !loading && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            <Tarjeta
              titulo="Entró este mes"
              valor={fmt(data.entro, moneda)}
              tono="positivo"
              icon={ArrowDownRight}
              detalle="Plata efectivamente recibida"
              tooltip="Movimientos aprobados de ingreso en Mercado Pago del mes. No incluye facturas emitidas, ajustes de cuenta ni imputaciones."
            />
            <Tarjeta
              titulo="Falta cobrar este mes"
              valor={fmt(data.falta_cobrar_mes, moneda)}
              tono="alerta"
              detalle={
                data.vencido_de_antes > 0 ? (
                  <span>
                    Vencido de meses anteriores: <b>{fmt(data.vencido_de_antes, moneda)}</b>
                  </span>
                ) : (
                  "Sin arrastre vencido"
                )
              }
              tooltip="Obligaciones de vw_pagos_por_cobrar con vencimiento dentro del mes. El arrastre vencido se muestra aparte."
            />
            <Tarjeta
              titulo="Salió este mes"
              valor={fmt(data.salio, moneda)}
              tono="negativo"
              icon={ArrowUpRight}
              detalle={`Gastos ${fmt(data.salio_gastos, moneda)} + egresos MP sin gasto ${fmt(data.salio_mp_sin_gasto, moneda)}`}
              tooltip="Gastos del mes más los egresos de Mercado Pago que todavía no fueron convertidos en gasto. Un egreso ya vinculado se cuenta una sola vez."
            />
            <Tarjeta
              titulo="Falta pagar este mes"
              valor={data.falta_pagar === null ? "Sin datos cargados" : fmt(data.falta_pagar, moneda)}
              tono="alerta"
              detalle={
                data.falta_pagar === null
                  ? "No hay compromisos cargados"
                  : `${data.falta_pagar_filas} compromisos${data.liquidaciones_generadas ? "" : " · sin liquidaciones de profesores"}`
              }
              tooltip="Ejecuciones de gastos pendientes/vencidas/parciales del mes más liquidaciones de profesores existentes."
            />
            <Tarjeta
              titulo="Saldo del mes"
              valor={fmt(data.saldoDelMes, moneda)}
              tono={data.saldoDelMes >= 0 ? "positivo" : "negativo"}
              detalle="Entró menos salió"
            />
            <Tarjeta
              titulo="Cómo puede cerrar el mes"
              valor={fmt(data.comoPuedeCerrar, moneda)}
              tono={data.comoPuedeCerrar >= 0 ? "positivo" : "negativo"}
              detalle="Si se cobra y paga todo lo pendiente del mes"
            />
          </div>

          {data.estimacionIncompleta && (
            <div className="flex items-start gap-2 rounded-md border border-yellow-500/30 bg-yellow-500/5 p-2.5 text-xs">
              <AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0 mt-0.5" />
              <div>
                <b className="text-yellow-500">Estimación incompleta.</b>{" "}
                {data.motivosIncompleta.join(" ")}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Entró por área:</span>
            {desgloseOrdenado(data).length === 0 && (
              <span className="text-xs text-muted-foreground">Sin movimientos en el mes</span>
            )}
            {desgloseOrdenado(data).map((d) => (
              <Badge
                key={d.unidad}
                variant="outline"
                className={d.unidad === "sin_identificar" ? "border-orange-500/40 text-orange-400" : ""}
              >
                {d.label}: {fmt(d.total, moneda)}
              </Badge>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
