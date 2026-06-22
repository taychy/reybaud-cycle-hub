import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Wallet, Loader2, ShieldAlert, ExternalLink } from "lucide-react";
import { formatPrice } from "@/lib/currency";
import { toast } from "sonner";
import { buildWhatsAppUrl, SCHOOL_WHATSAPP_NUMBER } from "@/lib/contactInfo";

interface Deuda {
  tipo: "suscripcion" | "evento_cuota" | "tienda" | "preventa";
  ref_id: string;
  concepto: string;
  due_date: string | null;
  total: number;
  pagado: number;
  por_pagar: number;
  moneda: string;
  estado: string;
  mp_disponible: boolean;
  payment_payload: Record<string, unknown>;
}
interface Credito { moneda: string; monto: number; }
interface Resp {
  valid: boolean;
  reason?: string;
  saludo?: string;
  deudas?: Deuda[];
  creditos?: Credito[];
}

function fmtDate(d: string | null): string {
  if (!d) return "—";
  const p = d.substring(0, 10).split("-");
  if (p.length !== 3) return d;
  return `${p[2]}/${p[1]}/${p[0]}`;
}

const TIPO_FN: Record<Deuda["tipo"], string> = {
  suscripcion: "create-mp-preference",
  evento_cuota: "create-event-mp-preference",
  tienda: "create-store-order-mp-preference",
  preventa: "create-preorder-total-mp-preference",
};

export default function PublicCuentaCorriente() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Resp | null>(null);
  const [paying, setPaying] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    supabase.functions
      .invoke("cuenta-publica-resolve", { body: { token } })
      .then(({ data, error }) => {
        if (error) {
          setData({ valid: false, reason: "error" });
        } else {
          setData(data as Resp);
        }
        setLoading(false);
      });
  }, [token]);

  const handlePay = async (d: Deuda, customAmount?: number) => {
    setPaying(d.ref_id + (customAmount ? ":custom" : ""));
    // Abrir pestaña ANTES del await para evitar bloqueo de popups
    const win = window.open("about:blank", "_blank");
    try {
      const payload: Record<string, unknown> = { ...d.payment_payload };
      if (customAmount && customAmount > 0) payload.amount = customAmount;
      const { data: res, error } = await supabase.functions.invoke(TIPO_FN[d.tipo], { body: payload });
      if (error) throw error;
      const url = (res as any)?.init_point || (res as any)?.url || (res as any)?.checkout_url;
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
      `Ingresá el monto que querés abonar (${d.moneda}). Saldo pendiente: ${d.por_pagar}`,
      String(d.por_pagar),
    );
    if (raw == null) return;
    const val = parseFloat(raw.replace(",", "."));
    if (!val || val <= 0) {
      toast.error("Monto inválido.");
      return;
    }
    if (val > d.por_pagar) {
      toast.error(`No podés pagar más que el saldo (${d.por_pagar} ${d.moneda}).`);
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
    const msg =
      data?.reason === "expired"
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

  // Totales por moneda
  const totals: Record<string, number> = {};
  deudas.forEach((d) => { totals[d.moneda] = (totals[d.moneda] || 0) + Number(d.por_pagar || 0); });

  return (
    <div className="min-h-screen bg-background pb-20" style={{ paddingTop: "env(safe-area-inset-top)" }}>
      {/* Header */}
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
        {Object.keys(totals).length > 0 ? (
          <Card className="p-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Total a pagar</p>
            <div className="flex flex-wrap gap-4">
              {Object.entries(totals).map(([m, v]) => (
                <div key={m}>
                  <span className="text-2xl font-bold text-destructive font-mono">{formatPrice(v, m)}</span>
                  <span className="text-xs text-muted-foreground ml-1">{m}</span>
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

        {/* Créditos a favor */}
        {creditos.length > 0 && (
          <Card className="p-4 bg-emerald-500/5 border-emerald-500/30">
            <p className="text-xs uppercase tracking-wider text-emerald-400 mb-2">Saldo a favor</p>
            <div className="flex flex-wrap gap-3">
              {creditos.map((c) => (
                <Badge key={c.moneda} variant="outline" className="text-sm bg-emerald-500/15 text-emerald-400 border-emerald-500/30">
                  {formatPrice(c.monto, c.moneda)} {c.moneda}
                </Badge>
              ))}
            </div>
          </Card>
        )}

        {/* Tabla de deudas */}
        {deudas.length > 0 && (
          <Card className="overflow-hidden">
            <div className="divide-y divide-border">
              {deudas.map((d) => (
                <div key={d.tipo + d.ref_id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-foreground truncate">{d.concepto}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Vence: {fmtDate(d.due_date)} · {d.moneda}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono font-bold text-destructive">{formatPrice(d.por_pagar, d.moneda)}</p>
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
                      {paying === d.ref_id ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Pagar {formatPrice(d.por_pagar, d.moneda)} <ExternalLink className="w-3 h-3 ml-1" /></>}
                    </Button>
                    {d.tipo === "evento_cuota" && (
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
              ))}
            </div>
          </Card>
        )}

        {/* Footer */}
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
