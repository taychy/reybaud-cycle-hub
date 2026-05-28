import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { CalendarClock, Package, CheckCircle2, Clock, XCircle, CreditCard, Truck, Store } from "lucide-react";
import { formatPrice } from "@/lib/currency";

interface Props {
  alumnoId: string | null;
}

const estadoLabel = (e: string) => ({
  pendiente_pago_sena: { label: "Esperando seña", color: "bg-muted text-muted-foreground", icon: Clock },
  reservada: { label: "Reservada", color: "bg-cyan/20 text-cyan", icon: CheckCircle2 },
  en_produccion: { label: "En producción", color: "bg-primary/20 text-primary", icon: Package },
  lista_para_retirar: { label: "Lista para retirar", color: "bg-gold-dark/20 text-gold", icon: Package },
  entregada: { label: "Entregada", color: "bg-green-500/20 text-green-400", icon: CheckCircle2 },
  cancelada: { label: "Cancelada", color: "bg-destructive/20 text-destructive", icon: XCircle },
  vencida: { label: "Vencida", color: "bg-destructive/20 text-destructive", icon: XCircle },
}[e] || { label: e, color: "bg-muted text-muted-foreground", icon: Clock });

const MisPreventas = ({ alumnoId }: Props) => {
  const { toast } = useToast();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [payingId, setPayingId] = useState<string | null>(null);

  const load = async () => {
    if (!alumnoId) { setLoading(false); return; }
    const { data } = await supabase
      .from("store_preorders" as any)
      .select("*")
      .eq("alumno_id", alumnoId)
      .order("created_at", { ascending: false });
    setRows((data as any[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [alumnoId]);

  const pagarSena = async (id: string) => {
    setPayingId(id);
    try {
      const { data, error } = await supabase.functions.invoke("create-preorder-mp-preference", {
        body: { preorder_id: id },
      });
      if (error) throw error;
      const url = (data as any)?.init_point || (data as any)?.sandbox_init_point;
      if (url) window.location.href = url;
      else throw new Error("No se recibió URL de pago");
    } catch (e: any) {
      toast({ title: "Error al iniciar el pago", description: e.message, variant: "destructive" });
    } finally {
      setPayingId(null);
    }
  };

  const cancelar = async (id: string) => {
    if (!confirm("¿Cancelar esta reserva? La seña queda como saldo a favor si ya fue pagada.")) return;
    const { error } = await supabase
      .from("store_preorders" as any)
      .update({ estado: "cancelada" } as any)
      .eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Reserva cancelada" });
    load();
  };

  if (!alumnoId) return null;
  if (loading) return null;
  if (rows.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-heading font-bold uppercase tracking-wider text-foreground">Mis preventas</h3>
        <span className="text-[10px] font-heading text-muted-foreground">{rows.length}</span>
      </div>
      <div className="space-y-2">
        {rows.map((r) => {
          const meta = estadoLabel(r.estado);
          const Icon = meta.icon;
          const canPayMP =
            r.estado_pago_sena !== "confirmada" &&
            ["pendiente_pago_sena", "reservada"].includes(r.estado) &&
            r.estado !== "cancelada";
          const canCancel = ["pendiente_pago_sena", "reservada"].includes(r.estado);
          return (
            <div key={r.id} className="rounded-xl border border-border bg-card p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-heading font-bold text-sm truncate">{r.producto_nombre}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {r.cantidad} unidad{r.cantidad > 1 ? "es" : ""}
                    {r.variante && Object.keys(r.variante || {}).length > 0 && (
                      <> · {Object.entries(r.variante).map(([k, v]) => `${k}: ${v}`).join(" · ")}</>
                    )}
                  </p>
                </div>
                <span className={`shrink-0 inline-flex items-center gap-1 text-[10px] font-heading font-bold uppercase px-2 py-0.5 rounded ${meta.color}`}>
                  <Icon className="w-3 h-3" /> {meta.label}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
                <div>Seña: <b className="text-foreground">{formatPrice(Number(r.sena_monto), r.moneda)}</b></div>
                <div>Saldo: <b className="text-foreground">{formatPrice(Number(r.saldo_pendiente), r.moneda)}</b></div>
              </div>

              <div className="text-[11px] text-muted-foreground">
                Pago seña:{" "}
                <b className={r.estado_pago_sena === "confirmada" ? "text-green-400" : r.estado_pago_sena === "rechazada" ? "text-destructive" : "text-foreground"}>
                  {r.estado_pago_sena?.replace(/_/g, " ")}
                </b>
                {r.forma_pago_sena && <> · {r.forma_pago_sena}</>}
              </div>

              {(canPayMP || canCancel) && (
                <div className="flex gap-2 pt-1">
                  {canPayMP && (
                    <Button
                      size="sm"
                      onClick={() => pagarSena(r.id)}
                      disabled={payingId === r.id}
                      className="flex-1"
                    >
                      <CreditCard className="w-3.5 h-3.5 mr-1" />
                      {payingId === r.id ? "Abriendo MP..." : "Pagar seña con MP"}
                    </Button>
                  )}
                  {canCancel && (
                    <Button size="sm" variant="ghost" onClick={() => cancelar(r.id)}>
                      Cancelar
                    </Button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
};

export default MisPreventas;
