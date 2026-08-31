import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ScanLine, Plus, Package, Undo2 } from "lucide-react";
import ScanCambioDialog from "@/components/deposito/ScanCambioDialog";
import RegistrarCambioPresencialDialog from "@/components/deposito/RegistrarCambioPresencialDialog";
import { formatVariante } from "@/lib/productQr";
import { estadoCambioClass, estadoCambioLabel } from "@/lib/cambios";
import {
  alertaAntiguedad, diasAfuera, esPrueba, esPruebaActiva,
  resultadoClass, resultadoLabel, tipoRegistro,
} from "@/lib/pruebas";

const DepositoCambios = () => {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"pendientes" | "esperando" | "listos" | "pruebas" | "cerrados">("pendientes");
  const [scanFor, setScanFor] = useState<any | null>(null);
  const [defineFor, setDefineFor] = useState<any | null>(null);
  const [presencialOpen, setPresencialOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const { toast } = useToast();

  const load = async () => {
    setLoading(true);
    // Misma fuente que Admin: traemos todos los estados y separamos por bucket
    // para que Depósito no parezca que "le faltan casos".
    const { data } = await supabase
      .from("store_cambios" as any)
      .select("*, producto:store_products!store_cambios_producto_id_fkey(name, image_url), alumnos(nombre, apellido)")
      .order("created_at", { ascending: false });
    setItems((data as any[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const buckets = useMemo(() => {
    const cambios = items.filter((c) => tipoRegistro(c) !== "prueba");
    return {
      pendientes: cambios.filter((c) => c.estado === "aprobado"),
      esperando: cambios.filter(
        (c) => c.estado === "en_deposito" && c.reemplazo_estado !== "enviado" && c.reemplazo_estado !== "entregado",
      ),
      listoRetiro: cambios.filter((c) => c.estado === "listo_retiro"),
      cerrados: cambios.filter((c) => ["entregado", "rechazado", "cancelado"].includes(c.estado)),
      pruebasActivas: items.filter(esPruebaActiva),
      pruebasCerradas: items.filter((c) => esPrueba(c) && !esPruebaActiva(c)),
    };
  }, [items]);

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

  const marcarEntregado = async (id: string) => {
    const { error } = await supabase.rpc("transition_cambio_estado" as any, {
      p_id: id, p_nuevo_estado: "entregado", p_nota: "Entregado al alumno desde depósito",
    });
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Cambio entregado" });
    load();
  };

  const recibirPrueba = async (id: string) => {
    setBusy(id);
    const { error } = await supabase.rpc("prueba_devolver" as any, { p_cambio_id: id, p_nota: null });
    setBusy(null);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Prueba devuelta · stock reingresado" });
    load();
  };

  const renderItem = (c: any, action: "scan" | "define" | "view" | "readonly") => (
    <div key={c.id} className="rounded-xl border border-border bg-card p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-sm truncate">{c.producto?.name}</p>
          <p className="text-[11px] text-muted-foreground">
            {c.alumnos?.nombre} {c.alumnos?.apellido} · {new Date(c.created_at).toLocaleDateString("es-AR")}
            {c.origen_solicitud === "presencial" && <Badge variant="outline" className="ml-1 text-[9px]">Presencial</Badge>}
          </p>
        </div>
        <Badge className={`text-[10px] uppercase ${estadoCambioClass(c.estado)}`}>{estadoCambioLabel(c.estado)}</Badge>
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

  const renderPrueba = (c: any) => {
    const activa = esPruebaActiva(c);
    const dias = diasAfuera(c);
    const alerta = alertaAntiguedad(dias);
    return (
      <div key={c.id} className="rounded-xl border border-border bg-card p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold text-sm truncate">{c.producto?.name}</p>
            <p className="text-[11px] text-muted-foreground">
              {c.alumnos?.nombre} {c.alumnos?.apellido} · {formatVariante(c.variante_origen)}
            </p>
            <p className="text-[11px] text-muted-foreground">
              Salió el {new Date(c.prueba_salida_at || c.created_at).toLocaleDateString("es-AR")}
              {activa && (
                <span className={alerta === "critico" ? " text-destructive font-semibold" : alerta === "atencion" ? " text-amber-400" : ""}>
                  {" "}· {dias}d afuera
                </span>
              )}
            </p>
          </div>
          <Badge className={`text-[10px] uppercase ${resultadoClass(c)}`}>{resultadoLabel(c)}</Badge>
        </div>
        {activa && (
          <Button size="sm" variant="outline" disabled={busy === c.id} onClick={() => recibirPrueba(c.id)}>
            {busy === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Undo2 className="w-3.5 h-3.5 mr-1" /> Recibir devolución</>}
          </Button>
        )}
      </div>
    );
  };

  if (loading) return <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin" /></div>;

  const vacio = (txt: string) => <p className="text-sm text-muted-foreground py-8 text-center">{txt}</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-heading font-bold uppercase tracking-wider">Cambios</h1>
          <p className="text-sm text-muted-foreground">Recepción y entrega de mercadería por cambio, y prendas enviadas a prueba.</p>
        </div>
        <Button size="sm" onClick={() => setPresencialOpen(true)}>
          <Plus className="w-4 h-4 mr-1" /> Recibir presencial
        </Button>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList className="grid grid-cols-5 w-full">
          <TabsTrigger value="pendientes" className="text-[11px]">
            A recibir <span className="ml-1 opacity-70">({buckets.pendientes.length})</span>
          </TabsTrigger>
          <TabsTrigger value="esperando" className="text-[11px]">
            En depósito <span className="ml-1 opacity-70">({buckets.esperando.length})</span>
          </TabsTrigger>
          <TabsTrigger value="listos" className="text-[11px]">
            Listos <span className="ml-1 opacity-70">({buckets.listoRetiro.length})</span>
          </TabsTrigger>
          <TabsTrigger value="pruebas" className="text-[11px]">
            En prueba <span className="ml-1 opacity-70">({buckets.pruebasActivas.length})</span>
          </TabsTrigger>
          <TabsTrigger value="cerrados" className="text-[11px]">
            Cerrados <span className="ml-1 opacity-70">({buckets.cerrados.length + buckets.pruebasCerradas.length})</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pendientes" className="mt-3 space-y-2">
          {buckets.pendientes.length === 0 ? vacio("No hay cambios para recibir") : buckets.pendientes.map((c) => renderItem(c, "scan"))}
        </TabsContent>
        <TabsContent value="esperando" className="mt-3 space-y-2">
          {buckets.esperando.length === 0 ? vacio("No hay cambios esperando reemplazo") : buckets.esperando.map((c) => renderItem(c, "define"))}
        </TabsContent>
        <TabsContent value="listos" className="mt-3 space-y-2">
          {buckets.listoRetiro.length === 0 ? vacio("Sin cambios listos para retirar") : buckets.listoRetiro.map((c) => renderItem(c, "view"))}
        </TabsContent>
        <TabsContent value="pruebas" className="mt-3 space-y-2">
          <p className="text-[11px] text-muted-foreground">
            Mercadería que está afuera para probar. No es venta: se registra desde el pedido, acá sólo se hace seguimiento.
          </p>
          {buckets.pruebasActivas.length === 0 ? vacio("No hay prendas en prueba") : buckets.pruebasActivas.map(renderPrueba)}
        </TabsContent>
        <TabsContent value="cerrados" className="mt-3 space-y-2">
          <p className="text-[11px] text-muted-foreground">Histórico de solo lectura, para consultar casos ya resueltos.</p>
          {buckets.cerrados.length === 0 && buckets.pruebasCerradas.length === 0
            ? vacio("Sin casos cerrados")
            : (
              <>
                {buckets.cerrados.map((c) => renderItem(c, "readonly"))}
                {buckets.pruebasCerradas.map(renderPrueba)}
              </>
            )}
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
