import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatPrice } from "@/lib/currency";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import {
  AlertTriangle, CheckCircle2, Clock, CreditCard, Loader2,
  Search, TrendingDown,
} from "lucide-react";

type Ambito = "personal" | "emprendimiento" | "mixto";
type EstadoEjec = "pendiente" | "pagado" | "vencido" | "omitido" | "parcial";

export interface AgendaRecurrente {
  id: string;
  concepto: string;
  categoria: string;
  ambito: Ambito;
  responsable: string | null;
  monto_estimado: number;
  moneda: string;
  forma_pago_default: string | null;
}

export interface AgendaEjecucion {
  id: string;
  recurrente_id: string;
  mes: string;
  fecha_vencimiento: string | null;
  monto_previsto: number;
  moneda: string;
  estado: EstadoEjec;
  monto_pagado: number | null;
  fecha_pago: string | null;
  forma_pago: string | null;
}

interface Props {
  ejecuciones: AgendaEjecucion[];
  recurrentes: AgendaRecurrente[];
  deudaSaldos: Record<string, { saldo: number; moneda: string }>;
  onChanged: () => void;
  onOpenDeuda?: (rec: AgendaRecurrente) => void;
}

type FilterTab = "pendientes" | "vencidos" | "pagados";

import {
  GASTO_PAYMENT_METHODS, GASTO_PAYMENT_LABELS, normalizeGastoPaymentMethod,
} from "@/lib/gastoPaymentMethods";

const FORMA_PAGO_OPTS = GASTO_PAYMENT_METHODS.map(m => ({ v: m.value, l: m.label }));
const FORMA_PAGO_LABELS: Record<string, string> = GASTO_PAYMENT_LABELS;



const AMBITO_LABEL: Record<Ambito, string> = {
  emprendimiento: "Empresa",
  personal: "Personal",
  mixto: "Mixto",
};

const fmt = (n: number, m = "ARS") => formatPrice(n || 0, m);

const parseDate = (s: string | null) => {
  if (!s) return null;
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};

const daysTo = (s: string | null) => {
  const d = parseDate(s);
  if (!d) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
};

const relDueLabel = (s: string | null): string => {
  const d = parseDate(s);
  if (!d) return "sin fecha";
  const days = daysTo(s)!;
  const dateStr = d.toLocaleDateString("es-AR");
  if (days === 0) return "vence hoy";
  if (days === 1) return "vence mañana";
  if (days > 1) return `vence ${dateStr}`;
  if (days === -1) return "vencido ayer";
  return `vencido hace ${Math.abs(days)} días`;
};

const AgendaMes = ({ ejecuciones, recurrentes, deudaSaldos, onChanged, onOpenDeuda }: Props) => {
  const [tab, setTab] = useState<FilterTab>("pendientes");
  const [search, setSearch] = useState("");
  // Per-row local state
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [methods, setMethods] = useState<Record<string, string>>({});
  const [paying, setPaying] = useState<Record<string, boolean>>({});
  const [fadingOut, setFadingOut] = useState<Set<string>>(new Set());
  const [confirmPartial, setConfirmPartial] = useState<null | { e: AgendaEjecucion; rec: AgendaRecurrente; monto: number; forma_pago: string; falta: number }>(null);

  const rows = useMemo(() => {
    const recMap = new Map(recurrentes.map(r => [r.id, r]));
    return ejecuciones
      .map(e => ({ e, rec: recMap.get(e.recurrente_id) }))
      .filter((x): x is { e: AgendaEjecucion; rec: AgendaRecurrente } => !!x.rec);
  }, [ejecuciones, recurrentes]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const byTab = rows.filter(({ e }) => {
      if (tab === "pagados") return e.estado === "pagado";
      if (tab === "vencidos") return e.estado === "vencido";
      // pendientes: pendiente + vencido + parcial (todo lo que no está pagado)
      return e.estado === "pendiente" || e.estado === "vencido" || e.estado === "parcial";
    });
    const byQuery = q
      ? byTab.filter(({ rec }) =>
          [rec.concepto, rec.categoria, rec.responsable].filter(Boolean).join(" ").toLowerCase().includes(q))
      : byTab;
    return byQuery.sort((a, b) => {
      if (tab === "pagados") {
        return (b.e.fecha_pago || "").localeCompare(a.e.fecha_pago || "");
      }
      return (a.e.fecha_vencimiento || "").localeCompare(b.e.fecha_vencimiento || "");
    });
  }, [rows, tab, search]);

  const getSuggested = (e: AgendaEjecucion, rec: AgendaRecurrente) => {
    const raw = e.monto_previsto || rec.monto_estimado || 0;
    return String(Math.round(raw));
  };

  const getAmount = (e: AgendaEjecucion, rec: AgendaRecurrente) =>
    amounts[e.id] ?? getSuggested(e, rec);

  const isEdited = (e: AgendaEjecucion, rec: AgendaRecurrente) =>
    (amounts[e.id] ?? null) !== null && amounts[e.id] !== getSuggested(e, rec);

  const getMethod = (e: AgendaEjecucion, rec: AgendaRecurrente) =>
    methods[e.id] ?? normalizeGastoPaymentMethod(e.forma_pago ?? rec.forma_pago_default);


  const doPay = async (
    e: AgendaEjecucion,
    rec: AgendaRecurrente,
    monto: number,
    forma_pago: string,
    modo: "total" | "parcial" | "exacto",
  ) => {
    setPaying(p => ({ ...p, [e.id]: true }));

    // "total" → ajusta previsto al monto pagado (queda saldada, sincroniza catálogo)
    // "parcial" → no toca previsto (queda parcial y arrastra al próximo mes)
    // "exacto" → monto == previsto, sin ajustes
    const ajustarPrevisto = modo === "total";

    const { error } = await supabase.rpc("register_gasto_pago_v2" as any, {
      p_ejec_id: e.id,
      p_monto: monto,
      p_fecha: new Date().toISOString().split("T")[0],
      p_forma_pago: forma_pago,
      p_notas: modo === "parcial" ? "Pago parcial" : null,
      p_es_excedente: false,
      p_motivo_excedente: null,
      p_nuevo_previsto: ajustarPrevisto ? monto : null,
      p_sync_catalogo: ajustarPrevisto,
    });

    if (error) {
      setPaying(p => ({ ...p, [e.id]: false }));
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }

    toast({
      title: modo === "parcial" ? "Pago parcial registrado" : "Pago registrado",
      description: rec.concepto,
    });
    setFadingOut(prev => new Set(prev).add(e.id));
    setTimeout(() => {
      setPaying(p => { const n = { ...p }; delete n[e.id]; return n; });
      onChanged();
      setFadingOut(prev => { const n = new Set(prev); n.delete(e.id); return n; });
    }, 320);
  };

  const handlePay = async (e: AgendaEjecucion, rec: AgendaRecurrente) => {
    const monto = Number(getAmount(e, rec));
    if (!monto || monto <= 0) {
      toast({ title: "Monto inválido", description: "Ingresá un monto válido antes de pagar.", variant: "destructive" });
      return;
    }
    const forma_pago = getMethod(e, rec);
    const previsto = e.monto_previsto || 0;

    // Si paga menos que lo previsto → preguntar total vs parcial
    if (previsto > 0 && monto < previsto) {
      setConfirmPartial({ e, rec, monto, forma_pago, falta: previsto - monto });
      return;
    }
    // Monto == previsto o mayor → pago directo
    await doPay(e, rec, monto, forma_pago, "exacto");
  };

  const counts = useMemo(() => {
    let pend = 0, venc = 0, pag = 0;
    for (const { e } of rows) {
      if (e.estado === "pagado") pag++;
      else if (e.estado === "vencido") { venc++; pend++; }
      else if (e.estado === "pendiente" || e.estado === "parcial") pend++;
    }
    return { pend, venc, pag };
  }, [rows]);

  return (
    <Card className="p-4 space-y-4">
      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Buscar concepto, categoría o responsable"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 h-9 text-sm"
          />
        </div>
        <div className="inline-flex bg-muted/40 rounded-lg p-1 gap-1">
          {([
            { k: "pendientes", l: "Pendientes", n: counts.pend },
            { k: "vencidos", l: "Vencidos", n: counts.venc },
            { k: "pagados", l: "Pagados", n: counts.pag },
          ] as { k: FilterTab; l: string; n: number }[]).map(({ k, l, n }) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={`px-3 h-8 rounded-md text-xs font-medium transition-colors inline-flex items-center gap-1.5 ${
                tab === k ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {l}
              {n > 0 && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                  tab === k ? "bg-muted text-foreground" : "bg-muted/60 text-muted-foreground"
                }`}>{n}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Lista */}
      {filtered.length === 0 ? (
        <div className="py-16 text-center text-sm text-muted-foreground">
          No hay gastos en esta vista.
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(({ e, rec }) => {
            const deuda = deudaSaldos[rec.id];
            const hasDeuda = !!deuda && deuda.saldo > 0;
            const isPaid = e.estado === "pagado";
            const days = daysTo(e.fecha_vencimiento);
            const isVencido = e.estado === "vencido" || (days !== null && days < 0 && !isPaid);
            const isProximo = !isPaid && !isVencido && days !== null && days >= 0 && days <= 7;
            const fading = fadingOut.has(e.id);
            const paidEdited = isPaid && e.monto_pagado != null && Math.round(e.monto_pagado) !== Math.round(e.monto_previsto || 0);
            const currentAmount = getAmount(e, rec);
            const edited = isEdited(e, rec);

            return (
              <div
                key={e.id}
                className={`relative rounded-lg border transition-all duration-300 ${
                  fading ? "opacity-0 -translate-y-1" : "opacity-100"
                } ${
                  hasDeuda
                    ? "border-destructive/60 bg-destructive/[0.07]"
                    : isVencido
                      ? "border-destructive/50 bg-destructive/[0.06]"
                      : "border-border bg-card"
                }`}
              >
                {(hasDeuda || isVencido) && (
                  <span
                    className="absolute left-0 top-0 bottom-0 w-1 rounded-l-lg bg-destructive"
                    aria-hidden
                  />
                )}
                <div className={`flex flex-col md:flex-row md:items-center gap-3 p-3 ${(hasDeuda || isVencido) ? "pl-4" : ""}`}>

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm text-foreground truncate">{rec.concepto}</span>
                      {isPaid ? (
                        <Badge className="bg-green-500/15 text-green-500 border-green-500/30 gap-1 text-[10px] h-5">
                          <CheckCircle2 className="w-3 h-3" /> Pagado
                        </Badge>
                      ) : isVencido ? (
                        <Badge variant="destructive" className="gap-1 text-[10px] h-5">
                          <AlertTriangle className="w-3 h-3" /> Vencido
                        </Badge>
                      ) : isProximo ? (
                        <Badge className="bg-orange-500/15 text-orange-500 border-orange-500/30 gap-1 text-[10px] h-5">
                          <Clock className="w-3 h-3" /> Próximo
                        </Badge>
                      ) : null}
                      {hasDeuda && (
                        <button
                          type="button"
                          onClick={() => onOpenDeuda?.(rec)}
                          className="inline-flex items-center gap-1 text-[10px] px-1.5 h-5 rounded border border-destructive/40 text-destructive hover:bg-destructive/10 transition-colors"
                          title="Ver deuda acumulada"
                        >
                          <CreditCard className="w-3 h-3" />
                          Deuda {fmt(deuda!.saldo, deuda!.moneda)}
                        </button>
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
                      {rec.categoria} · {AMBITO_LABEL[rec.ambito]}
                      {rec.responsable && ` · ${rec.responsable}`}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      {isPaid
                        ? `pagado ${parseDate(e.fecha_pago)?.toLocaleDateString("es-AR") || "—"}${e.forma_pago ? ` · ${FORMA_PAGO_LABELS[e.forma_pago] || e.forma_pago}` : ""}`
                        : relDueLabel(e.fecha_vencimiento)}
                    </div>
                  </div>

                  {/* Acciones */}
                  {isPaid ? (
                    <div className="flex flex-col items-end shrink-0">
                      <div className="font-heading font-bold text-sm text-foreground">
                        {fmt(e.monto_pagado || 0, e.moneda)}
                      </div>
                      {paidEdited && (
                        <div className="text-[10px] text-muted-foreground italic">monto editado</div>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 shrink-0 flex-wrap">
                      <div className="relative">
                        <Input
                          type="number"
                          inputMode="numeric"
                          value={currentAmount}
                          onChange={ev => setAmounts(a => ({ ...a, [e.id]: ev.target.value }))}
                          className="h-9 w-32 pr-14 text-sm font-medium text-right"
                          disabled={paying[e.id]}
                        />
                        <span
                          className={`absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-sm ${
                            edited
                              ? "bg-orange-500/15 text-orange-500"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {edited ? "editado" : "último"}
                        </span>
                      </div>
                      <Select
                        value={getMethod(e, rec)}
                        onValueChange={v => setMethods(m => ({ ...m, [e.id]: v }))}
                        disabled={paying[e.id]}
                      >
                        <SelectTrigger className="h-9 w-36 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {FORMA_PAGO_OPTS.map(o => (
                            <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        variant="gold"
                        className="h-9 gap-1"
                        onClick={() => handlePay(e, rec)}
                        disabled={paying[e.id]}
                      >
                        {paying[e.id] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <TrendingDown className="w-3.5 h-3.5" />}
                        Pagar
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
};

export default AgendaMes;
