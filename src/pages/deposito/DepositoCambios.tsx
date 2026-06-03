import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Package, CheckCircle2, Loader2 } from "lucide-react";

const DepositoCambios = () => {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("store_cambios" as any)
      .select("*, store_products(name, image_url), alumnos(nombre, apellido)")
      .in("estado", ["aprobado", "en_deposito", "listo_retiro"])
      .order("created_at", { ascending: true });
    setItems((data as any[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const move = async (id: string, nuevo: string) => {
    const { error } = await supabase.rpc("transition_cambio_estado" as any, {
      p_id: id, p_nuevo_estado: nuevo, p_nota: null,
    });
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Listo" });
    load();
  };

  if (loading) return <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-heading font-bold uppercase tracking-wider">Cambios pendientes</h1>
        <p className="text-sm text-muted-foreground">Recibí la prenda original y preparala para retiro.</p>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">No hay cambios para procesar</p>
      ) : (
        <div className="space-y-2">
          {items.map((c) => (
            <div key={c.id} className="rounded-xl border border-border bg-card p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-sm truncate">{c.store_products?.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {c.alumnos?.nombre} {c.alumnos?.apellido} · {new Date(c.created_at).toLocaleDateString("es-AR")}
                  </p>
                </div>
                <Badge variant="outline" className="text-[10px] uppercase">{c.estado}</Badge>
              </div>
              <div className="text-xs text-muted-foreground space-y-0.5">
                <p><b>Devuelve:</b> {Object.entries(c.variante_origen || {}).map(([k, v]) => `${k}:${v}`).join(" · ") || "—"}</p>
                <p><b>Recibe:</b> {c.variante_destino ? Object.entries(c.variante_destino).map(([k, v]) => `${k}:${v}`).join(" · ") : "Sin variante (devolución)"}</p>
              </div>
              <div className="flex gap-2 pt-1">
                {c.estado === "aprobado" && (
                  <Button size="sm" onClick={() => move(c.id, "en_deposito")}>
                    <Package className="w-3.5 h-3.5 mr-1" /> Recibí prenda
                  </Button>
                )}
                {c.estado === "en_deposito" && (
                  <Button size="sm" onClick={() => move(c.id, "listo_retiro")}>
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Lista para retirar
                  </Button>
                )}
                {c.estado === "listo_retiro" && (
                  <Badge className="bg-green-500/20 text-green-400">Esperando retiro en sede</Badge>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default DepositoCambios;
