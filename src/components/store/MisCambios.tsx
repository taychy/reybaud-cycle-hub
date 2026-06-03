import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, Package, CheckCircle2, XCircle, Clock, Truck, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Props {
  alumnoId: string | null;
}

const estadoMeta: Record<string, { label: string; color: string; Icon: any }> = {
  solicitado: { label: "Solicitado", color: "text-muted-foreground", Icon: Clock },
  aprobado: { label: "Aprobado", color: "text-cyan", Icon: CheckCircle2 },
  en_deposito: { label: "En depósito", color: "text-primary", Icon: Package },
  listo_retiro: { label: "Listo para retirar", color: "text-green-400", Icon: Truck },
  entregado: { label: "Entregado", color: "text-green-400", Icon: CheckCircle2 },
  rechazado: { label: "Rechazado", color: "text-destructive", Icon: XCircle },
  cancelado: { label: "Cancelado", color: "text-muted-foreground", Icon: XCircle },
  devolucion_solicitada: { label: "Devolución solicitada", color: "text-amber-400", Icon: AlertTriangle },
};

const MisCambios = ({ alumnoId }: Props) => {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const load = async () => {
    if (!alumnoId) return;
    setLoading(true);
    const { data } = await supabase
      .from("store_cambios" as any)
      .select("*, store_products(name, image_url)")
      .eq("alumno_id", alumnoId)
      .order("created_at", { ascending: false });
    setItems((data as any[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [alumnoId]);

  const cancelar = async (id: string) => {
    const { error } = await supabase.rpc("transition_cambio_estado" as any, {
      p_id: id, p_nuevo_estado: "cancelado", p_nota: "Cancelado por alumno",
    });
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Solicitud cancelada" });
    load();
  };

  if (loading) return <p className="text-center text-sm text-muted-foreground py-8">Cargando…</p>;
  if (items.length === 0) {
    return (
      <div className="text-center py-8 space-y-1">
        <RefreshCw className="w-8 h-8 text-muted-foreground/40 mx-auto" />
        <p className="text-sm text-muted-foreground">No tenés solicitudes de cambio</p>
        <p className="text-[11px] text-muted-foreground/70">Podés iniciar un cambio desde la pestaña Compras o Preventas.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((c) => {
        const meta = estadoMeta[c.estado] || estadoMeta.solicitado;
        const Icon = meta.Icon;
        return (
          <div key={c.id} className="rounded-xl border border-border bg-card p-3 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold truncate">{c.store_products?.name || "Producto"}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {new Date(c.created_at).toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" })}
                  {c.iniciado_por === "admin" && <span className="ml-1 text-amber-400">· iniciado por admin</span>}
                </p>
              </div>
              <span className={`inline-flex items-center gap-1 text-[10px] font-heading font-bold uppercase ${meta.color}`}>
                <Icon className="w-3 h-3" /> {meta.label}
              </span>
            </div>
            <div className="text-[11px] text-muted-foreground space-y-0.5">
              {Object.keys(c.variante_origen || {}).length > 0 && (
                <p>Original: {Object.entries(c.variante_origen).map(([k, v]) => `${k}: ${v}`).join(" · ")}</p>
              )}
              {c.variante_destino && Object.keys(c.variante_destino).length > 0 && (
                <p>Nueva: {Object.entries(c.variante_destino).map(([k, v]) => `${k}: ${v}`).join(" · ")}</p>
              )}
              {c.comentario && <p className="italic">"{c.comentario}"</p>}
            </div>
            {c.estado === "solicitado" && (
              <Button variant="ghost" size="sm" className="text-destructive h-7" onClick={() => cancelar(c.id)}>
                Cancelar solicitud
              </Button>
            )}
            {c.estado === "listo_retiro" && (
              <Badge variant="outline" className="text-green-400 border-green-400/30">
                Acercate a la sede a retirar
              </Badge>
            )}
            {Number(c.diferencia_precio) !== 0 && c.estado_pago_diferencia === "pendiente" && (
              <Badge variant="outline" className="text-amber-400 border-amber-400/30">
                Diferencia a pagar en sede: {c.moneda} {c.diferencia_precio}
              </Badge>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default MisCambios;
