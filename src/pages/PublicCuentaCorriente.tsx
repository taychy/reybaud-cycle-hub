import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Wallet, Loader2, ShieldAlert, ExternalLink, CheckCircle2, CircleDot } from "lucide-react";
import { formatPrice } from "@/lib/currency";
import { toast } from "sonner";
import { buildWhatsAppUrl } from "@/lib/contactInfo";

interface Deuda {
  tipo: "suscripcion" | "evento_cuota" | "tienda" | "preventa";
  ref_id: string;
  concepto: string;
  due_date: string | null;
  total: number;
  pagado: number;
  por_pagar: number;
  por_pagar_neto: number;
  credito_aplicado: number;
  moneda: string;
  estado: string;
  mp_disponible: boolean;
  payment_payload: Record<string, unknown>;
}
interface Credito { moneda: string; monto: number; }
interface PagoRow { fecha: string; concepto: string; monto: number; moneda: string; tipo: string; }
interface Resp {
  valid: boolean;
  reason?: string;
  saludo?: string;
  deudas?: Deuda[];
  creditos?: Credito[];
  pagos?: PagoRow[];
}

const TIPO_FN: Record<Exclude<Deuda["tipo"], "suscripcion">, string> = {
  evento_cuota: "create-event-mp-preference",
  tienda: "create-store-order-mp-preference",
  preventa: "create-preorder-total-mp-preference",
};

function fmtDate(d: string | null): string {
  if (!d) return "—";
  const p = d.substring(0, 10).split("-");
  if (p.length !== 3) return d;
  return `${p[2]}/${p[1]}/${p[0]}`;
}

export default function PublicCuentaCorriente() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Resp | null>(null);
  const [paying, setPaying] = useState<string | null>(null);

  const load = async () => {
    if (!token) return;
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("cuenta-publica-resolve", { body: { token } });
    if (error) setData({ valid: false, reason: "error" });
    else setData(data as Resp);
    setLoading(false);
  };

  useEffect(() => { load(); }, [token]);

  const handlePay = async (d: Deuda, customAmount?: number) => {
    setPaying(d.ref_id + (customAmount ? ":custom" : ""));
    const win = window.open("about:blank", "_blank");

    try {
      // Suscripciones: usa endpoint que aplica crédito primero
      if (d.tipo === "suscripcion") {
        const payload = d.payment_payload as { plan_id?: string; alumno_id?: string };
        const { data: res, error } = await supabase.functions.invoke("cuenta-publica-pay", {
          body: {
            token,
            fuente_tabla: "suscripciones",
            fuente_id: d.ref_id,
            plan_id: payload.plan_id,
            alumno_id: payload.alumno_id,
          },
        });
        if (error) throw error;
        const r = res as { paid?: boolean; init_point?: string; applied?: number };
        if (r?.paid) {
          if (win) win.close();
          toast.success(`Deuda saldada con saldo a favor (${formatPrice(r.applied || 0, d.moneda)}).`);
          await load();
          return;
        }
        if (r?.init_point) {
          if (win) win.location.href = r.init_point;
          else window.location.href = r.init_point;
          return;
        }
        throw new Error("Sin init_point");
      }

      // Resto: flujo previo con MP directo
      const payload: Record<string, unknown> = { ...d.payment_payload };
      if (customAmount && customAmount > 0) payload.amount = customAmount;
      const { data: res, error } = await supabase.functions.invoke(TIPO_FN[d.tipo], { body: payload });
      if (error) throw error;
      const url = (res as { init_point?: string; url?: string; checkout_url?: string })?.init_point
        || (res as { url?: string })?.url
        || (res as { checkout_url?: string })?.checkout_url;
      if (url) {
        if (win) win.location.href = url;
        else window.location.href = url;
      } else {
        if (win) win.close();
        toast.error("No se pudo iniciar el pago. Contactá a la administración.");
      }
    } catch (e) {
      console.error(e);
      if (win) win.close();
      toast.error("No se pudo iniciar el pago.");
    } finally {
      setPaying(null);
    }
  };

  const handlePayCustom = (d: Deuda) => {
    const raw = window.prompt(
      `Ingresá el monto que querés abonar (${d.moneda}). Saldo pendiente: ${d.por_pagar_neto}`,
      String(d.por_pagar_neto),
    );
    if (raw == null) return;
    const val = parseFloat(raw.replace(",", "."));
    if (!val || val <= 0) { toast.error("Monto inválido."); return; }
    if (val > d.por_pagar_neto) {
      toast.error(`No podés pagar más que el saldo (${d.por_pagar_neto} ${d.moneda}).`);
      return;
    }
    handlePay(d, val);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data?.valid) {
    const msg = data?.reason === "expired"
      ? "Este link expiró. Pedí uno nuevo a tu coach."
      : data?.reason === "revoked"
      ? "Este link fue desactivado. Pedí uno nuevo a tu coach."
      : "Link no disponible. Pedí uno nuevo a tu coach.";
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="p-8 max-w-md text-center space-y-3">
          <ShieldAlert className="w-10 h-10 text-muted-foreground mx-auto" />
          <p className="text-sm text-muted-foreground">{msg}</p>
          <a
            href={buildWhatsAppUrl("Hola, necesito un nuevo link de mi cuenta corriente.")}
            target="_blank" rel="noreferrer"
            className="text-primary text-sm underline inline-block"
          >
            Escribir a la escuela
          </a>
        </Card>
      </div>
    );
  }

  const deudas = data.deudas || [];
  const creditos = data.creditos || [];
  const pagos = data.pagos || [];

  // Totales netos por moneda (a pagar después de aplicar crédito)
  const totalsNeto: Record<string, number> = {};
  const totalCreditoAplicado: Record<string, number> = {};
  deudas.forEach((d) => {
    totalsNeto[d.moneda] = (totalsNeto[d.moneda] || 0) + Number(d.por_pagar_neto || 0);
    totalCreditoAplicado[d.moneda] = (totalCreditoAplicado[d.moneda] || 0) + Number(d.credito_aplicado || 0);
  });

  return (
    <div className="min-h-screen bg-background pb-20" style={{ paddingTop: "env(safe-area-inset-top)" }}>
      <div className="bg-card border-b border-border">
        <div className="max-w-3xl mx-auto px-4 py-5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/15 border border-primary/30 flex items-center justify-center">
            <Wallet className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Mi cuenta corriente</p>
            <h1 className="text-lg font-heading font-bold text-foreground">Hola, {data.saludo}</h1>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {/* Totales */}
        {Object.keys(totalsNeto).length > 0 ? (
          <Card className="p-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Total a pagar</p>
            <div className="flex flex-wrap gap-4">
              {Object.entries(totalsNeto).map(([m, v]) => (
                <div key={m}>
                  <span className="text-2xl font-bold text-destructive font-mono">{formatPrice(v, m)}</span>
                  <span className="text-xs text-muted-foreground ml-1">{m}</span>
                  {totalCreditoAplicado[m] > 0.01 && (
                    <p className="text-[11px] text-emerald-400 mt-0.5">
                      Se descuenta {formatPrice(totalCreditoAplicado[m], m)} de saldo a favor
                    </p>
                  )}
                </div>
              ))}
            </div>
          </Card>
        ) : (
          <Card className="p-6 text-center">
            <p className="text-emerald-400 font-semibold">¡Estás al día!</p>
            <p className="text-xs text-muted-foreground mt-1">No tenés deudas pendientes.</p>
          </Card>
        )}

        {/* Créditos residuales */}
        {creditos.length > 0 && (
          <Card className="p-4 bg-emerald-500/5 border-emerald-500/30">
            <p className="text-xs uppercase tracking-wider text-emerald-400 mb-2">Saldo a favor disponible</p>
            <div className="flex flex-wrap gap-3">
              {creditos.map((c) => (
                <Badge key={c.moneda} variant="outline" className="text-sm bg-emerald-500/15 text-emerald-400 border-emerald-500/30">
                  {formatPrice(c.monto, c.moneda)} {c.moneda}
                </Badge>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">
              Este saldo queda a favor para tus próximos pagos.
            </p>
          </Card>
        )}

        {/* Tabla de deudas */}
        {deudas.length > 0 && (
          <Card className="overflow-hidden">
            <div className="divide-y divide-border">
              {deudas.map((d) => {
                const neto = Number(d.por_pagar_neto || 0);
                const aplicado = Number(d.credito_aplicado || 0);
                const isFullyCovered = neto <= 0.01 && aplicado > 0.01;
                return (
                  <div key={d.tipo + d.ref_id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-foreground truncate flex items-center gap-1.5">
                        <CircleDot className="w-3 h-3 text-destructive" />{d.concepto}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Vence: {fmtDate(d.due_date)} · {d.moneda}
                      </p>
                      {aplicado > 0.01 && (
                        <p className="text-[11px] text-emerald-400 mt-0.5">
                          Aplicando {formatPrice(aplicado, d.moneda)} de saldo a favor
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      {aplicado > 0.01 && (
                        <p className="text-[11px] text-muted-foreground line-through">{formatPrice(d.por_pagar, d.moneda)}</p>
                      )}
                      <p className="font-mono font-bold text-destructive">{formatPrice(neto, d.moneda)}</p>
                      {d.pagado > 0 && (
                        <p className="text-[10px] text-muted-foreground">Pagado {formatPrice(d.pagado, d.moneda)} de {formatPrice(d.total, d.moneda)}</p>
                      )}
                    </div>
                    <div className="flex flex-col gap-1.5 shrink-0">
                      <Button
                        size="sm"
                        onClick={() => handlePay(d)}
                        disabled={paying?.startsWith(d.ref_id) ?? false}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white"
                      >
                        {paying === d.ref_id ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                          <>
                            {isFullyCovered ? "Saldar con crédito" : `Pagar ${formatPrice(neto, d.moneda)}`}
                            <ExternalLink className="w-3 h-3 ml-1" />
                          </>
                        )}
                      </Button>
                      {d.tipo === "evento_cuota" && !isFullyCovered && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handlePayCustom(d)}
                          disabled={paying?.startsWith(d.ref_id) ?? false}
                          className="text-xs"
                        >
                          {paying === d.ref_id + ":custom" ? <Loader2 className="w-3 h-3 animate-spin" /> : "Otro monto"}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {/* Últimos pagos */}
        {pagos.length > 0 && (
          <Card className="overflow-hidden">
            <div className="p-4 border-b border-border bg-emerald-500/5">
              <p className="text-xs uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Tus últimos {pagos.length} pagos
              </p>
            </div>
            <div className="divide-y divide-border">
              {pagos.map((p, i) => (
                <div key={i} className="px-4 py-3 flex items-center gap-3">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground truncate">{p.concepto}</p>
                    <p className="text-[11px] text-muted-foreground">{fmtDate(p.fecha)}</p>
                  </div>
                  <p className="font-mono font-semibold text-emerald-500 shrink-0">
                    {formatPrice(Number(p.monto) || 0, p.moneda)}
                  </p>
                </div>
              ))}
            </div>
          </Card>
        )}

        <div className="text-center text-xs text-muted-foreground pt-4 space-y-1">
          <p>
            ¿Dudas? <a className="text-primary underline" href={buildWhatsAppUrl("Hola, tengo una consulta sobre mi cuenta corriente.")} target="_blank" rel="noreferrer">Contactanos</a>
          </p>
          <p>Los pagos se procesan vía Mercado Pago.</p>
        </div>
      </div>
    </div>
  );
}
