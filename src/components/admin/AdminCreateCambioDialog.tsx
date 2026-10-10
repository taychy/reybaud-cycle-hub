import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Search, ShoppingBag } from "lucide-react";
import { sortVariantSpecs, parseVariant } from "@/lib/variantSort";
import { formatVariante } from "@/lib/productQr";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: () => void;
}
interface Producto {
  id: string; name: string; price: number; currency: string | null;
  variants: {name: string; options: string[]}[] | null;
  variant_stock: Record<string, number> | null;
}
type Venta = {
  id: string; order_number?: number | null; created_at: string;
  alumno_id: string | null; customer_name?: string | null;
  status?: string; estado?: string; producto_nombre?: string;
  product_id?: string; variante?: Record<string,string>;
  precio_unitario?: number | null;
  alumnos?: {nombre: string; apellido: string} | null;
};
type Item = {
  id: string; product_id: string | null; product_name: string; quantity: number;
  variant_selection: Record<string,string> | null;
  unit_price: number; precio_cobrado: number | null;
};
const MOTIVOS = [
  {value:"talle", label:"Cambio de talle"},
  {value:"color", label:"Cambio de color"},
  {value:"defecto", label:"Producto con defecto"},
  {value:"otro", label:"Otro motivo"},
];

const AdminCreateCambioDialog = ({open,onOpenChange,onCreated}: Props) => {
  const {toast}=useToast();
  const [origen,setOrigen]=useState<"compra"|"preorder">("compra");
  const [ventas,setVentas]=useState<Venta[]>([]);
  const [productos,setProductos]=useState<Producto[]>([]);
  const [items,setItems]=useState<Item[]>([]);
  const [ventaId,setVentaId]=useState("");
  const [itemId,setItemId]=useState("");
  const [query,setQuery]=useState("");
  const [productoNuevo,setProductoNuevo]=useState("");
  const [destino,setDestino]=useState<Record<string,string>>({});
  const [motivo,setMotivo]=useState("talle");
  const [comentario,setComentario]=useState("");
  const [motivoAdmin,setMotivoAdmin]=useState("");
  const [loading,setLoading]=useState(false);
  const [saving,setSaving]=useState(false);

  useEffect(()=>{
    if(!open) return;
    setOrigen("compra");setVentas([]);setVentaId("");setItemId("");setItems([]);
    setQuery("");setProductoNuevo("");setDestino({});setMotivo("talle");
    setComentario("");setMotivoAdmin("");
    supabase.from("store_products")
      .select("id,name,price,currency,variants,variant_stock")
      .eq("status","active").order("name")
      .then(({data,error})=>{
        if(error) toast({title:"No se pudo cargar el catálogo",description:error.message,variant:"destructive"});
        setProductos((data as any[]) || []);
      });
  },[open]);

  useEffect(()=>{
    if(!open) return;
    let current=true;
    setLoading(true);
    (async()=>{
      const res=origen==="compra"
        ? await supabase.from("store_orders")
            .select("id,order_number,alumno_id,customer_name,status,created_at,alumnos(nombre,apellido)")
            .in("status",["pagado","pendiente_pago_efectivo","preparando","en_camioneta","enviado","listo_retiro","entregado"])
            .not("alumno_id","is",null)
            .order("created_at",{ascending:false}).limit(350)
        : await supabase.from("store_preorders")
            .select("id,alumno_id,producto_nombre,product_id,variante,precio_unitario,estado,created_at")
            .in("estado",["entregada","lista_para_retirar"])
            .not("alumno_id","is",null)
            .order("created_at",{ascending:false}).limit(350);
      if(!current)return;
      if(res.error) toast({title:"No se pudieron consultar las ventas",description:res.error.message,variant:"destructive"});
      let rows=(res.data as any[])||[];
      // En preventas no existe FK declarada a alumnos: consultar los nombres sin
      // forzar un join PostgREST que rompería el selector con un error 400.
      if(origen==="preorder"&&rows.length){
        const ids=Array.from(new Set(rows.map(x=>x.alumno_id).filter(Boolean))) as string[];
        const {data:customers}=await supabase.from("alumnos").select("id,nombre,apellido").in("id",ids);
        const names=new Map((customers||[]).map(x=>[x.id,x]));
        rows=rows.map(x=>({...x,alumnos:names.get(x.alumno_id)||null}));
      }
      if(current)setVentas(rows);
      if(current)setLoading(false);
    })();
    return ()=>{current=false;};
  },[open,origen]);

  const venta=ventas.find(v=>v.id===ventaId)||null;
  const filtered=useMemo(()=>{
    const q=query.trim().toLocaleLowerCase("es-AR");
    return ventas.filter(v=>!q||[
      v.order_number?.toString(),v.customer_name,v.alumnos?.nombre,
      v.alumnos?.apellido,v.producto_nombre,v.id
    ].some(x=>String(x||"").toLocaleLowerCase("es-AR").includes(q))).slice(0,45);
  },[ventas,query]);

  const item=origen==="compra"?items.find(x=>x.id===itemId):null;
  const productoOriginalId=origen==="compra"?item?.product_id:venta?.product_id;
  const varianteOriginal= parseVariant(origen==="compra"?item?.variant_selection:venta?.variante);
  const articuloOriginal=origen==="compra"?item?.product_name:venta?.producto_nombre;
  const productoElegido=productos.find(p=>p.id===productoNuevo)||null;
  const specs=useMemo(()=>sortVariantSpecs(productoElegido?.variants||[]),[productoElegido]);
  const varianteCompleta=specs.every(spec=>!!destino[spec.name]);
  const key=specs.map(spec=>spec.name+":"+destino[spec.name]).join("|");
  const disponible=specs.length?(productoElegido?.variant_stock?.[key]??0):null;
  const mismoProducto=productoNuevo===productoOriginalId;
  const mismaVariante=JSON.stringify(Object.entries(destino).sort())===JSON.stringify(Object.entries(varianteOriginal).sort());
  const valid=!!venta&&!!productoOriginalId&&!!productoNuevo&&varianteCompleta&&!(mismoProducto&&mismaVariante)&&motivoAdmin.trim().length>=3;

  const selectVenta=async(v: Venta)=>{
    setVentaId(v.id);setItemId("");setProductoNuevo("");setDestino({});
    setQuery("");
    if(origen==="compra"){
      const res=await supabase.from("store_order_items")
        .select("id,product_id,product_name,quantity,variant_selection,unit_price,precio_cobrado")
        .eq("order_id",v.id).order("created_at",{ascending:true});
      if(res.error) toast({title:"Error al cargar las prendas de la venta",description:res.error.message,variant:"destructive"});
      const eligible=((res.data as any[])||[]).filter(i=>i.product_id);
      setItems(eligible);
      if(eligible.length===1) seleccionarItem(eligible[0]);
    } else {
      setItems([]);
      if(v.product_id){setProductoNuevo(v.product_id);setDestino(parseVariant(v.variante));}
    }
  };
  const seleccionarItem=(it: Item)=>{
    setItemId(it.id);
    setProductoNuevo(it.product_id||"");
    setDestino(parseVariant(it.variant_selection));
  };
  const cambiarOrigen=(v:"compra"|"preorder")=>{
    setOrigen(v);setVentaId("");setItemId("");setItems([]);
    setQuery("");setProductoNuevo("");setDestino({});
  };
  const submit=async()=>{
    if(!valid){
      toast({title:"Faltan datos del cambio",description:"Seleccioná la venta, su prenda, un reemplazo diferente y el motivo administrativo.",variant:"destructive"});
      return;
    }
    setSaving(true);
    const {error}=await supabase.rpc("admin_crear_cambio_desde_venta" as any,{
      p_origen_tipo:origen,
      p_order_item_id:origen==="compra"?itemId:null,
      p_preorder_id:origen==="preorder"?ventaId:null,
      p_producto_reemplazo_id:productoNuevo,
      p_variante_destino:destino,
      p_motivo:motivo,
      p_comentario:comentario.trim()||null,
      p_motivo_admin:motivoAdmin.trim(),
    });
    setSaving(false);
    if(error){toast({title:"No se pudo crear el cambio",description:error.message,variant:"destructive"});return;}
    toast({title:"Cambio aprobado",description:"Vinculado a la venta original. La devolución física sigue pendiente."});
    onOpenChange(false);onCreated?.();
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Crear cambio sobre una venta</DialogTitle>
          <DialogDescription>
            Primero elegí qué compró el alumno. El sistema conserva la prenda original y registra el reemplazo sin dar la devolución por recibida.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Origen de la venta</Label>
            <Select value={origen} onValueChange={v=>cambiarOrigen(v as "compra"|"preorder")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="compra">Venta de tienda</SelectItem>
                <SelectItem value="preorder">Preventa vendida</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Buscar venta por alumno o número de pedido</Label>
            {!venta ? <>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground"/>
                <Input className="pl-9" placeholder="Alumno o número de pedido" value={query} onChange={e=>setQuery(e.target.value)}/>
              </div>
              <div className="max-h-40 overflow-y-auto rounded-lg border border-border divide-y divide-border">
                {loading?<p className="p-3 text-xs text-muted-foreground">Cargando ventas...</p>
                :filtered.map(v=><button key={v.id} type="button" onClick={()=>selectVenta(v)}
                  className="w-full text-left hover:bg-muted/40 p-2 text-xs">
                  <span className="font-semibold">
                    {origen==="compra"?"Pedido #"+v.order_number:"Preventa · "+(v.producto_nombre||"Producto")}
                  </span>
                  <span className="text-muted-foreground block">
                    {v.alumnos?.nombre} {v.alumnos?.apellido} · {new Date(v.created_at).toLocaleDateString("es-AR")}
                  </span>
                </button>)}
                {!loading&&filtered.length===0&&<p className="p-3 text-xs text-muted-foreground">No hay ventas que coincidan.</p>}
              </div>
            </>:<div className="flex items-center justify-between gap-2 rounded-lg border border-primary/30 p-3">
              <div className="text-sm">
                <p className="font-semibold">{origen==="compra"?"Pedido #"+venta.order_number:"Preventa"}</p>
                <p className="text-xs text-muted-foreground">{venta.alumnos?.nombre} {venta.alumnos?.apellido}</p>
              </div>
              <Button size="sm" variant="outline" onClick={()=>{setVentaId("");setItemId("");setItems([]);setProductoNuevo("");setDestino({});}}>Cambiar</Button>
            </div>}
          </div>

          {origen==="compra"&&venta&&<div className="space-y-2">
            <Label>Prenda que compró (obligatorio)</Label>
            <Select value={itemId} onValueChange={v=>{const it=items.find(i=>i.id===v);if(it)seleccionarItem(it);}}>
              <SelectTrigger><SelectValue placeholder="Elegí la prenda original" /></SelectTrigger>
              <SelectContent>{items.map(i=><SelectItem key={i.id} value={i.id}>
                {i.product_name} · {formatVariante(i.variant_selection)} · ×{i.quantity}
              </SelectItem>)}</SelectContent>
            </Select>
            {!items.length&&<p className="text-xs text-amber-400">Esta venta no contiene prendas con producto identificado.</p>}
          </div>}

          {productoOriginalId&&<div className="rounded-lg bg-muted/35 p-3 text-sm">
            <p className="text-[11px] uppercase text-muted-foreground mb-1">Prenda original (sale de la venta)</p>
            <p className="font-semibold">{articuloOriginal||"Producto"}</p>
            <p>{formatVariante(varianteOriginal)||"Sin variantes"}</p>
            <p className="text-xs text-muted-foreground mt-1">Devolución pendiente hasta que Depósito la reciba y escanee.</p>
          </div>}

          {productoOriginalId&&<>
            <div className="space-y-2">
              <Label>Producto que recibirá como reemplazo</Label>
              <Select value={productoNuevo} onValueChange={v=>{setProductoNuevo(v);setDestino(v===productoOriginalId?varianteOriginal:{});}}>
                <SelectTrigger><SelectValue placeholder="Elegí el reemplazo" /></SelectTrigger>
                <SelectContent>{productos.map(p=><SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {specs.map(spec=><div key={spec.name} className="space-y-1">
              <Label>{spec.name} nuevo</Label>
              <Select value={destino[spec.name]||""}
                onValueChange={v=>setDestino(d=>({...d,[spec.name]:v}))}>
                <SelectTrigger><SelectValue placeholder={"Elegí "+spec.name.toLowerCase()}/></SelectTrigger>
                <SelectContent>{spec.options.map(o=><SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
              </Select>
            </div>)}
            {mismoProducto&&mismaVariante&&<p className="text-xs text-amber-400">Elegí un talle o color diferente del que compró.</p>}
            {disponible!==null&&<p className="text-xs text-muted-foreground">
              Stock registrado del reemplazo: {disponible} unidades
              {disponible<=0&&<span className="text-amber-400"> · sin disponibilidad (no se puede preparar)</span>}
            </p>}
            {productoNuevo!==productoOriginalId&&
              <p className="text-xs text-muted-foreground">Si cambia de producto, la diferencia de precio quedará registrada para revisión administrativa; no se cobra automáticamente.</p>}
          </>}

          <div className="space-y-1">
            <Label>Motivo del cambio</Label>
            <Select value={motivo} onValueChange={setMotivo}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{MOTIVOS.map(x=><SelectItem key={x.value} value={x.value}>{x.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Comentario (opcional)</Label>
            <Textarea rows={2} value={comentario} onChange={e=>setComentario(e.target.value)} placeholder="Alguna indicación sobre el cambio" />
          </div>
          <div className="space-y-1">
            <Label>Motivo administrativo (obligatorio)</Label>
            <Textarea rows={2} value={motivoAdmin} onChange={e=>setMotivoAdmin(e.target.value)}
              placeholder="Ej.: solicitado por WhatsApp, verificado por Administración."/>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={()=>onOpenChange(false)}>Cancelar</Button>
          <Button disabled={saving||!valid} onClick={submit}>
            {saving?<Loader2 className="w-4 h-4 animate-spin"/>:<><ShoppingBag className="w-4 h-4 mr-1"/> Aprobar cambio</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
export default AdminCreateCambioDialog;
