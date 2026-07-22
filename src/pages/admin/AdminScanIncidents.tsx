import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertTriangle, CheckCircle2, XCircle, Link2, Loader2, ScanLine, RefreshCw } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const sb: any = supabase;

const motivoLabel: Record<string, string> = {
  desconocido: "Código no reconocido",
  no_corresponde: "No corresponde al pedido",
  otro: "Otro",
};

const estadoColor: Record<string, string> = {
  pendiente: "bg-amber-500/20 text-amber-500",
  resuelto: "bg-green-500/20 text-green-500",
  descartado: "bg-muted text-muted-foreground",
};

interface Incident {
  id: string;
  codigo: string;
  motivo: string;
  estado: string;
  detalle: string | null;
  supplier_order_id: string | null;
  supplier_order_item_id: string | null;
  resolved_at: string | null;
  created_at: string;
}

const AdminScanIncidents = () => {
  const [rows, setRows] = useState<Incident[]>([]);
  const [ordersById, setOrdersById] = useState<Record<string, any>>({});
  const [itemsById, setItemsById] = useState<Record<string, any>>({});
  const [productos, setProductos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [estadoFilter, setEstadoFilter] = useState<string>("pendiente");
  const [search, setSearch] = useState("");
  const [resolving, setResolving] = useState<Incident | null>(null);
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [selectedVariant, setSelectedVariant] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await sb
      .from("scan_incidents")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setLoading(false);
      return;
    }
    setRows(data || []);
    const orderIds = Array.from(new Set((data || []).map((r: any) => r.supplier_order_id).filter(Boolean)));
    const itemIds = Array.from(new Set((data || []).map((r: any) => r.supplier_order_item_id).filter(Boolean)));
    if (orderIds.length) {
      const { data: ords } = await sb.from("supplier_orders").select("id, numero, proveedor_nombre").in("id", orderIds);
      setOrdersById(Object.fromEntries((ords || []).map((o: any) => [o.id, o])));
    }
    if (itemIds.length) {
      const { data: its } = await sb.from("supplier_order_items").select("id, producto_nombre, variante, product_id").in("id", itemIds);
      setItemsById(Object.fromEntries((its || []).map((i: any) => [i.id, i])));
    }
    setLoading(false);
  };

  const loadProductos = async () => {
    const { data } = await sb.from("store_products").select("id, name, variants").eq("status", "activo");
    setProductos(data || []);
  };

  useEffect(() => {
    load();
    loadProductos();
  }, []);

  const filtered = useMemo(() => rows.filter((r) => {
    if (estadoFilter !== "all" && r.estado !== estadoFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      if (!r.codigo.toLowerCase().includes(s)) return false;
    }
    return true;
  }), [rows, estadoFilter, search]);

  const counters = useMemo(() => ({
    pendiente: rows.filter((r) => r.estado === "pendiente").length,
    resuelto: rows.filter((r) => r.estado === "resuelto").length,
    descartado: rows.filter((r) => r.estado === "descartado").length,
  }), [rows]);

  const openResolve = (inc: Incident) => {
    setResolving(inc);
    const item = inc.supplier_order_item_id ? itemsById[inc.supplier_order_item_id] : null;
    setSelectedProductId(item?.product_id || "");
    setSelectedVariant((item?.variante as Record<string, string>) || {});
  };

  const resolveVincular = async () => {
    if (!resolving) return;
    if (!selectedProductId) {
      return toast({ title: "Elegí un producto", variant: "destructive" });
    }
    setSaving(true);
    try {
      const { data: userData } = await sb.auth.getUser();
      // Create barcode link (or update if exists)
      const { data: existing } = await sb.from("product_barcodes").select("id").eq("codigo", resolving.codigo).maybeSingle();
      let barcodeId: string;
      if (existing?.id) {
        const { error } = await sb.from("product_barcodes").update({
          store_product_id: selectedProductId,
          variante: selectedVariant,
        }).eq("id", existing.id);
        if (error) throw error;
        barcodeId = existing.id;
      } else {
        const { data: ins, error } = await sb.from("product_barcodes").insert({
          codigo: resolving.codigo,
          store_product_id: selectedProductId,
          variante: selectedVariant,
          origen: "ean",
          created_by: userData?.user?.id || null,
        }).select("id").single();
        if (error) throw error;
        barcodeId = ins.id;
      }
      const { error: upErr } = await sb.from("scan_incidents").update({
        estado: "resuelto",
        accion_resolucion: "vinculado",
        resolved_barcode_id: barcodeId,
        resolved_by: userData?.user?.id || null,
        resolved_at: new Date().toISOString(),
      }).eq("id", resolving.id);
      if (upErr) throw upErr;
      toast({ title: "Incidente resuelto", description: "Código vinculado al producto." });
      setResolving(null);
      load();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const descartar = async (inc: Incident) => {
    if (!confirm("¿Descartar este incidente? No se vinculará ningún código.")) return;
    const { data: userData } = await sb.auth.getUser();
    const { error } = await sb.from("scan_incidents").update({
      estado: "descartado",
      accion_resolucion: "descartado",
      resolved_by: userData?.user?.id || null,
      resolved_at: new Date().toISOString(),
    }).eq("id", inc.id);
    if (error) return toast({ title: "Error", description: error.message, variant: "destructive" });
    toast({ title: "Incidente descartado" });
    load();
  };

  const reabrir = async (inc: Incident) => {
    const { error } = await sb.from("scan_incidents").update({
      estado: "pendiente",
      accion_resolucion: null,
      resolved_by: null,
      resolved_at: null,
    }).eq("id", inc.id);
    if (error) return toast({ title: "Error", description: error.message, variant: "destructive" });
    load();
  };

  const productSelected = productos.find((p) => p.id === selectedProductId);
  const productVariants = (productSelected?.variants || []) as Array<{ name: string; options: string[] }>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-heading font-bold flex items-center gap-2">
            <ScanLine className="w-6 h-6" /> Incidentes de escaneo
          </h1>
          <p className="text-sm text-muted-foreground">Códigos que no matchean el pedido o no están vinculados a ningún producto.</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} className="gap-2">
          <RefreshCw className="w-4 h-4" /> Refrescar
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Pendientes</div>
          <div className="text-2xl font-heading font-bold text-amber-500">{counters.pendiente}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Resueltos</div>
          <div className="text-2xl font-heading font-bold text-green-500">{counters.resuelto}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Descartados</div>
          <div className="text-2xl font-heading font-bold text-muted-foreground">{counters.descartado}</div>
        </CardContent></Card>
      </div>

      <div className="flex flex-wrap gap-2">
        <Input placeholder="Buscar código…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
        <Select value={estadoFilter} onValueChange={setEstadoFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="pendiente">Pendientes</SelectItem>
            <SelectItem value="resuelto">Resueltos</SelectItem>
            <SelectItem value="descartado">Descartados</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="text-muted-foreground animate-pulse p-6">Cargando incidentes…</div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">
          {estadoFilter === "pendiente" ? "🎉 No hay incidentes pendientes." : "Sin incidentes en este estado."}
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((inc) => {
            const ord = inc.supplier_order_id ? ordersById[inc.supplier_order_id] : null;
            const item = inc.supplier_order_item_id ? itemsById[inc.supplier_order_item_id] : null;
            return (
              <div key={inc.id} className="rounded-xl border border-border bg-card p-3 space-y-2">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <code className="font-mono text-sm font-bold">{inc.codigo}</code>
                      <Badge className={estadoColor[inc.estado]}>{inc.estado}</Badge>
                      <Badge variant="outline" className="text-xs">{motivoLabel[inc.motivo] || inc.motivo}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {ord && <>Pedido <span className="font-medium">{ord.numero}</span> · {ord.proveedor_nombre} · </>}
                      {new Date(inc.created_at).toLocaleString("es-AR")}
                    </div>
                    {item && (
                      <div className="text-xs mt-1">
                        Escaneado sobre línea: <span className="font-medium">{item.producto_nombre}</span>
                        {item.variante && Object.keys(item.variante).length > 0 && (
                          <span className="text-muted-foreground"> · {Object.entries(item.variante).map(([k, v]) => `${k}:${v}`).join(", ")}</span>
                        )}
                      </div>
                    )}
                    {inc.detalle && <div className="text-xs text-muted-foreground italic mt-1">{inc.detalle}</div>}
                  </div>
                  <div className="flex items-center gap-1">
                    {inc.estado === "pendiente" ? (
                      <>
                        <Button size="sm" variant="default" className="gap-1 h-8" onClick={() => openResolve(inc)}>
                          <Link2 className="w-3.5 h-3.5" /> Vincular
                        </Button>
                        <Button size="sm" variant="ghost" className="gap-1 h-8 text-muted-foreground" onClick={() => descartar(inc)}>
                          <XCircle className="w-3.5 h-3.5" /> Descartar
                        </Button>
                      </>
                    ) : (
                      <Button size="sm" variant="ghost" className="gap-1 h-8" onClick={() => reabrir(inc)}>
                        <AlertTriangle className="w-3.5 h-3.5" /> Reabrir
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={!!resolving} onOpenChange={(o) => !o && setResolving(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="w-5 h-5 text-primary" /> Vincular código
            </DialogTitle>
          </DialogHeader>
          {resolving && (
            <div className="space-y-4">
              <div className="bg-muted/40 rounded p-3">
                <div className="text-xs text-muted-foreground">Código escaneado</div>
                <code className="font-mono text-lg font-bold">{resolving.codigo}</code>
              </div>
              <div>
                <Label>Producto de tienda *</Label>
                <Select value={selectedProductId} onValueChange={(v) => { setSelectedProductId(v); setSelectedVariant({}); }}>
                  <SelectTrigger><SelectValue placeholder="Elegí un producto" /></SelectTrigger>
                  <SelectContent>
                    {productos.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {productVariants.length > 0 && (
                <div className="space-y-2">
                  <Label>Variante *</Label>
                  {productVariants.map((v) => (
                    <Select
                      key={v.name}
                      value={selectedVariant[v.name] || ""}
                      onValueChange={(val) => setSelectedVariant((prev) => ({ ...prev, [v.name]: val }))}
                    >
                      <SelectTrigger><SelectValue placeholder={v.name} /></SelectTrigger>
                      <SelectContent>
                        {(v.options || []).map((opt) => <SelectItem key={opt} value={opt}>{v.name}: {opt}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Una vez vinculado, los próximos escaneos de este código sumarán automáticamente a esta variante.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setResolving(null)} disabled={saving}>Cancelar</Button>
            <Button onClick={resolveVincular} disabled={saving || !selectedProductId}>
              {saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              <CheckCircle2 className="w-4 h-4 mr-1" /> Confirmar vínculo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminScanIncidents;
