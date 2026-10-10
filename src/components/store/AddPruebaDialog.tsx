import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Search } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  orderId?: string | null;
  alumnoId?: string | null;
  onCreated?: () => void;
}

interface Producto {
  id: string;
  name: string;
  variants?: any;
  variant_stock?: any;
  stock?: number | null;
}

const AddPruebaDialog = ({ open, onOpenChange, orderId, alumnoId, onCreated }: Props) => {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [query, setQuery] = useState("");
  const [productoId, setProductoId] = useState("");
  const [variante, setVariante] = useState<Record<string, string>>({});
  const [comentario, setComentario] = useState("");
  const [saving, setSaving] = useState(false);
  const [modo,setModo] = useState<"alumno"|"venta">("alumno");
  const [alumnoQuery,setAlumnoQuery] = useState("");
  const [alumnos,setAlumnos] = useState<any[]>([]);
  const [alumnoSeleccionado,setAlumnoSeleccionado] = useState<any|null>(null);
  const [ventaQuery,setVentaQuery] = useState("");
  const [ventas,setVentas] = useState<any[]>([]);
  const [ventaSeleccionada,setVentaSeleccionada] = useState<any|null>(null);
  const { toast } = useToast();
  /** Clave estable por intento: si el request se reintenta, el backend no descuenta stock dos veces. */
  const idemKey = useRef<string>("");

  useEffect(() => {
    if (!open) return;
    setQuery(""); setProductoId(""); setVariante({}); setComentario("");
    setModo("alumno");setAlumnoQuery("");setAlumnos([]);setAlumnoSeleccionado(null);
    setVentaQuery("");setVentas([]);setVentaSeleccionada(null);
    idemKey.current = crypto.randomUUID();
    supabase
      .from("store_products")
      .select("id, name, variants, variant_stock, stock")
      .eq("status", "active")
      .order("name")
      .then(({ data }) => setProductos((data as any[]) || []));
  }, [open]);

  // Si el diálogo se abre sin pedido, permite comenzar una prueba directamente desde
  // un alumno o asociarla a una venta. Desde OrderDetail mantiene el pedido fijo.
  useEffect(()=>{
    if(!open || orderId || alumnoId || modo!=="alumno" || alumnoQuery.trim().length<2){
      setAlumnos([]);return;
    }
    let active=true;
    const timer=setTimeout(async()=>{
      const text=alumnoQuery.trim().replace(/[%_,]/g," ");
      const {data}=await supabase.from("alumnos").select("id,nombre,apellido,email")
        .or("nombre.ilike.%"+text+"%,apellido.ilike.%"+text+"%,email.ilike.%"+text+"%")
        .limit(12);
      if(active)setAlumnos((data as any[])||[]);
    },220);
    return()=>{active=false;clearTimeout(timer);};
  },[open,orderId,alumnoId,modo,alumnoQuery]);

  useEffect(()=>{
    if(!open || orderId || alumnoId || modo!=="venta" || ventaQuery.trim().length<1){
      setVentas([]);return;
    }
    let active=true;
    const timer=setTimeout(async()=>{
      const {data}=await supabase.from("store_orders")
        .select("id,order_number,alumno_id,status,customer_name,alumnos(nombre,apellido)")
        .in("status",["pagado","preparando","en_camioneta","enviado","entregado","listo_retiro"])
        .not("alumno_id","is",null).order("created_at",{ascending:false}).limit(150);
      const q=ventaQuery.trim().toLowerCase();
      const matches=((data as any[])||[]).filter(o=>
        [o.order_number,o.customer_name,o.alumnos?.nombre,o.alumnos?.apellido]
          .some(v=>String(v||"").toLowerCase().includes(q))).slice(0,12);
      if(active)setVentas(matches);
    },220);
    return()=>{active=false;clearTimeout(timer);};
  },[open,orderId,alumnoId,modo,ventaQuery]);

  const idPedido=orderId || (modo==="venta"?ventaSeleccionada?.id:null);
  const idAlumno=alumnoId || (orderId?null:(modo==="alumno"?alumnoSeleccionado?.id:null));
  const tieneResponsable=!!idPedido||!!idAlumno;

  const filtrados = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q ? productos.filter((p) => p.name.toLowerCase().includes(q)) : productos;
    return base.slice(0, 50);
  }, [productos, query]);

  const producto = productos.find((p) => p.id === productoId) || null;

  const specs: { name: string; options: string[] }[] = useMemo(() => {
    const v = producto?.variants;
    if (!Array.isArray(v)) return [];
    return v
      .filter((s: any) => s?.name && Array.isArray(s?.options) && s.options.length)
      .map((s: any) => ({ name: String(s.name), options: s.options.map((o: any) => String(o)) }));
  }, [producto]);

  const faltanVariantes = specs.some((s) => !variante[s.name]);

  const submit = async () => {
    if (!tieneResponsable) {
      toast({ title: "Vinculá la prueba a un alumno o a una venta", variant:"destructive" });
      return;
    }
    if (!productoId) {
      toast({ title: "Elegí el producto", variant: "destructive" });
      return;
    }
    if (faltanVariantes) {
      toast({ title: "Completá talle/color", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await supabase.rpc("crear_prenda_prueba" as any, {
      p_producto_id: productoId,
      p_variante: variante,
      p_order_id: idPedido || null,
      p_alumno_id: idAlumno || null,
      p_comentario: comentario || null,
      p_metodo: "manual",
      p_idempotency_key: idemKey.current,
    });
    setSaving(false);
    if (error) {
      toast({ title: "No se pudo registrar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Prenda enviada a prueba", description: "Salió del stock. No es una venta." });
    onOpenChange(false);
    onCreated?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Agregar prenda de prueba</DialogTitle>
          <DialogDescription className="text-xs">
            La prenda sale del stock pero no se cobra ni suma al total del pedido. Después podés recibir la devolución
            o convertirla en venta.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {!orderId && !alumnoId && (
            <div className="space-y-3 rounded-lg border border-border p-3">
              <Label className="text-xs">¿Cómo se envía esta prueba?</Label>
              <Select value={modo} onValueChange={v=>{
                setModo(v as "alumno"|"venta");setAlumnoSeleccionado(null);setVentaSeleccionada(null);
                setAlumnoQuery("");setVentaQuery("");
              }}>
                <SelectTrigger><SelectValue/></SelectTrigger>
                <SelectContent>
                  <SelectItem value="alumno">Directamente a un alumno</SelectItem>
                  <SelectItem value="venta">Junto con una venta</SelectItem>
                </SelectContent>
              </Select>
              {modo==="alumno"?(
                alumnoSeleccionado ? (
                  <div className="flex justify-between gap-2 items-center text-xs">
                    <span><b>{alumnoSeleccionado.nombre} {alumnoSeleccionado.apellido}</b></span>
                    <Button variant="ghost" size="sm" onClick={()=>{setAlumnoSeleccionado(null);setAlumnoQuery("");}}>Cambiar</Button>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <Input placeholder="Buscar alumno por nombre o email" value={alumnoQuery}
                      onChange={e=>setAlumnoQuery(e.target.value)}/>
                    <div className="max-h-32 overflow-y-auto divide-y divide-border">
                      {alumnos.map(a=><button key={a.id} type="button" className="text-xs w-full text-left p-2 hover:bg-muted"
                        onClick={()=>{setAlumnoSeleccionado(a);setAlumnos([]);}}>
                        {a.nombre} {a.apellido} · {a.email}
                      </button>)}
                    </div>
                  </div>
                )
              ) : ventaSeleccionada ? (
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span><b>Pedido #{ventaSeleccionada.order_number}</b> · {ventaSeleccionada.alumnos?.nombre} {ventaSeleccionada.alumnos?.apellido}</span>
                  <Button size="sm" variant="ghost" onClick={()=>{setVentaSeleccionada(null);setVentaQuery("");}}>Cambiar</Button>
                </div>
              ) : (
                <div className="space-y-1">
                  <Input placeholder="Buscar número de pedido o alumno" value={ventaQuery}
                    onChange={e=>setVentaQuery(e.target.value)}/>
                  <div className="max-h-32 overflow-y-auto divide-y divide-border">
                    {ventas.map(v=><button key={v.id} type="button" className="w-full text-left p-2 text-xs hover:bg-muted"
                      onClick={()=>{setVentaSeleccionada(v);setVentas([]);}}>
                      Pedido #{v.order_number} · {v.alumnos?.nombre} {v.alumnos?.apellido}
                    </button>)}
                  </div>
                </div>
              )}
              <p className="text-[11px] text-muted-foreground">
                La prueba no suma una venta. Queda vinculada a la persona que recibe la prenda.
              </p>
            </div>
          )}
          <div>
            <Label className="text-xs">Producto</Label>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input className="pl-7" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar producto" />
            </div>
            <Select value={productoId} onValueChange={(v) => { setProductoId(v); setVariante({}); }}>
              <SelectTrigger className="mt-2"><SelectValue placeholder="Elegí producto" /></SelectTrigger>
              <SelectContent>
                {filtrados.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {specs.map((s) => (
            <div key={s.name}>
              <Label className="text-xs">{s.name}</Label>
              <Select
                value={variante[s.name] || ""}
                onValueChange={(v) => setVariante((prev) => ({ ...prev, [s.name]: v }))}
              >
                <SelectTrigger><SelectValue placeholder={`Elegí ${s.name.toLowerCase()}`} /></SelectTrigger>
                <SelectContent>
                  {s.options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          ))}

          <div>
            <Label className="text-xs">Nota (opcional)</Label>
            <Textarea rows={2} value={comentario} onChange={(e) => setComentario(e.target.value)} placeholder="Ej: le mando un talle más para probar." />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={saving || !productoId || !tieneResponsable || faltanVariantes}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Enviar a prueba"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AddPruebaDialog;
