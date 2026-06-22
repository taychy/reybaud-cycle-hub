import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ScanLine, Plus, Package } from "lucide-react";
import ScanCambioDialog from "@/components/deposito/ScanCambioDialog";
import RegistrarCambioPresencialDialog from "@/components/deposito/RegistrarCambioPresencialDialog";
import { formatVariante } from "@/lib/productQr";

const DepositoCambios = () => {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"pendientes" | "esperando" | "presencial">("pendientes");
  const [scanFor, setScanFor] = useState<any | null>(null);
  const [defineFor, setDefineFor] = useState<any | null>(null);
  const [presencialOpen, setPresencialOpen] = useState(false);
  const { toast } = useToast();

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("store_cambios" as any)
      .select("*, producto:store_products!store_cambios_producto_id_fkey(name, image_url), alumnos(nombre, apellido)")
      .in("estado", ["aprobado", "en_deposito", "listo_retiro"])
      .order("created_at", { ascending: true });
    setItems((data as any[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const buckets = useMemo(() => ({
    pendientes: items.filter((c) => c.estado === "aprobado"),
    esperando: items.filter((c) => c.estado === "en_deposito" && c.reemplazo_estado !== "enviado" && c.reemplazo_estado !== "entregado"),
    listoRetiro: items.filter((c) => c.estado === "listo_retiro"),
  }), [items]);

  const procesarConScan = async (cambio: any, devuelto: any, recibido: any | null) => {
    const { error } = await supabase.rpc("deposito_recibir_cambio" as any, {
      p_cambio_id: cambio.id,
      p_metodo: devuelto.metodo,
      p_qr_devuelto_pid: devuelto.productId,
      p_qr_devuelto_variante: devuelto.variante,
      p_entregar_reemplazo: !!recibido,
      p_qr_recibido_pid: recibido?.productId || null,
      p_qr_recibido_variante: recibido?.variante || null,
    });
    if (error) throw error;
    toast({ title: recibido ? "Cambio listo para retirar" : "Recibido en depósito" });
    load();
  };

  const definirReemplazo = async (cambio: any, recibido: any) => {
    const { error } = await supabase.rpc("deposito_definir_reemplazo" as any, {
      p_cambio_id: cambio.id,
      p_metodo: recibido.metodo,
      p_producto_id: recibido.productId,
      p_variante: recibido.variante,
      p_marcar_listo: true,
    });
    if (error) throw error;
    toast({ title: "Reemplazo listo" });
    load();
  };

  const renderItem = (c: any, action: "scan" | "define" | "view") => (
    <div key={c.id} className="rounded-xl border border-border bg-card p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-sm truncate">{c.producto?.name}</p>
          <p className="text-[11px] text-muted-foreground">
            {c.alumnos?.nombre} {c.alumnos?.apellido} · {new Date(c.created_at).toLocaleDateString("es-AR")}
            {c.origen_solicitud === "presencial" && <Badge variant="outline" className="ml-1 text-[9px]">Presencial</Badge>}
          </p>
        </div>
        <Badge variant="outline" className="text-[10px] uppercase">{c.estado}</Badge>
      </div>
      <div className="text-xs text-muted-foreground space-y-0.5">
        <p><b>Devuelve:</b> {formatVariante(c.variante_origen)}</p>
        <p><b>Recibe:</b> {c.variante_destino ? formatVariante(c.variante_destino) : <span className="text-amber-400">Sin definir</span>}</p>
      </div>
      <div className="flex gap-2 pt-1">
        {action === "scan" && (
          <Button size="sm" onClick={() => setScanFor(c)}>
            <ScanLine className="w-3.5 h-3.5 mr-1" /> Escanear recepción
          </Button>
        )}
        {action === "define" && (
          <Button size="sm" onClick={() => setDefineFor(c)}>
            <Package className="w-3.5 h-3.5 mr-1" /> Definir reemplazo
          </Button>
        )}
        {action === "view" && (
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className="bg-green-500/20 text-green-400">Esperando retiro en sede</Badge>
            <Button size="sm" variant="outline" onClick={() => marcarEntregado(c.id)}>
              ✓ Marcar entregado
            </Button>
          </div>
        )}
      </div>
    </div>
  );

  if (loading) return <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-heading font-bold uppercase tracking-wider">Cambios</h1>
          <p className="text-sm text-muted-foreground">Recepción y entrega de mercadería por cambio.</p>
        </div>
        <Button size="sm" onClick={() => setPresencialOpen(true)}>
          <Plus className="w-4 h-4 mr-1" /> Recibir presencial
        </Button>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList className="grid grid-cols-3 w-full">
          <TabsTrigger value="pendientes">
            Pendientes <span className="ml-1 text-[10px] opacity-70">({buckets.pendientes.length})</span>
          </TabsTrigger>
          <TabsTrigger value="esperando">
            Esperando reemplazo <span className="ml-1 text-[10px] opacity-70">({buckets.esperando.length})</span>
          </TabsTrigger>
          <TabsTrigger value="presencial">
            Listos <span className="ml-1 text-[10px] opacity-70">({buckets.listoRetiro.length})</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pendientes" className="mt-3 space-y-2">
          {buckets.pendientes.length === 0
            ? <p className="text-sm text-muted-foreground py-8 text-center">No hay cambios para recibir</p>
            : buckets.pendientes.map((c) => renderItem(c, "scan"))}
        </TabsContent>
        <TabsContent value="esperando" className="mt-3 space-y-2">
          {buckets.esperando.length === 0
            ? <p className="text-sm text-muted-foreground py-8 text-center">No hay cambios esperando reemplazo</p>
            : buckets.esperando.map((c) => renderItem(c, "define"))}
        </TabsContent>
        <TabsContent value="presencial" className="mt-3 space-y-2">
          {buckets.listoRetiro.length === 0
            ? <p className="text-sm text-muted-foreground py-8 text-center">Sin cambios listos para retirar</p>
            : buckets.listoRetiro.map((c) => renderItem(c, "view"))}
        </TabsContent>
      </Tabs>

      {scanFor && (
        <ScanCambioDialog
          open={!!scanFor}
          onOpenChange={(v) => !v && setScanFor(null)}
          title={`Recibir cambio · ${scanFor.producto?.name || ""}`}
          expectedReturnProductId={scanFor.producto_id}
          expectedReturnVariante={scanFor.variante_origen}
          expectedDeliverProductId={scanFor.producto_reemplazo_id || scanFor.producto_id}
          expectedDeliverVariante={scanFor.variante_destino}
          requireReemplazo={!!scanFor.variante_destino}
          onConfirm={({ devuelto, recibido }) => procesarConScan(scanFor, devuelto, recibido)}
        />
      )}

      {defineFor && (
        <ScanCambioDialog
          open={!!defineFor}
          onOpenChange={(v) => !v && setDefineFor(null)}
          title={`Definir reemplazo · ${defineFor.producto?.name || ""}`}
          expectedReturnProductId={defineFor.producto_id}
          expectedReturnVariante={defineFor.variante_origen}
          requireReemplazo
          onConfirm={({ recibido }) => {
            if (!recibido) throw new Error("Falta reemplazo");
            return definirReemplazo(defineFor, recibido);
          }}
        />
      )}

      <RegistrarCambioPresencialDialog
        open={presencialOpen}
        onOpenChange={setPresencialOpen}
        onCreated={load}
      />
    </div>
  );
};

export default DepositoCambios;
