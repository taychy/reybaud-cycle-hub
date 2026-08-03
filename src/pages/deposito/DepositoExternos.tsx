import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Camera, PackageSearch, Search } from "lucide-react";
import { toast } from "sonner";
import EtiquetaExternaCapture, { ORIGENES } from "@/components/deposito/EtiquetaExternaCapture";

interface PedidoExterno {
  id: string;
  origen: string;
  externo_ref: string | null;
  cliente_nombre: string;
  cliente_telefono: string | null;
  producto: string | null;
  variante: string | null;
  cantidad: number;
  foto_url: string | null;
  ubicacion: string | null;
  estado: string;
  notas: string | null;
  created_at: string;
}

export const ESTADOS_EXTERNOS = [
  { value: "en_deposito", label: "En depósito" },
  { value: "en_camioneta", label: "En camioneta" },
  { value: "entregado", label: "Entregado" },
  { value: "devuelto", label: "Devuelto" },
  { value: "faltante", label: "Faltante" },
];

const estadoBadge = (estado: string) => {
  const map: Record<string, string> = {
    en_deposito: "border-amber-500/40 text-amber-400",
    en_camioneta: "border-cyan-500/40 text-cyan-400",
    entregado: "border-green-500/40 text-green-400",
    devuelto: "border-muted text-muted-foreground",
    faltante: "border-destructive/50 text-destructive",
  };
  const label = ESTADOS_EXTERNOS.find((e) => e.value === estado)?.label || estado;
  return <Badge variant="outline" className={map[estado] || ""}>{label}</Badge>;
};

const DepositoExternos = () => {
  const [rows, setRows] = useState<PedidoExterno[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [estado, setEstado] = useState("todos");
  const [capture, setCapture] = useState(false);

  const load = async () => {
    const { data } = await (supabase as any)
      .from("pedidos_externos")
      .select("*")
      .order("created_at", { ascending: false });
    setRows((data as PedidoExterno[]) || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const setEstadoRow = async (id: string, nuevo: string) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, estado: nuevo } : r)));
    const { error } = await (supabase as any).from("pedidos_externos").update({ estado: nuevo }).eq("id", id);
    if (error) { toast.error(error.message); load(); return; }
    toast.success("Estado actualizado");
  };

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (estado !== "todos" && r.estado !== estado) return false;
      if (!t) return true;
      return [r.cliente_nombre, r.producto, r.externo_ref, r.ubicacion]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(t));
    });
  }, [rows, q, estado]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-lg font-heading font-bold uppercase tracking-wider">Ventas externas</h1>
          <p className="text-xs text-muted-foreground">Pedidos de Tienda Nube u otras tiendas, registrados con la foto de su etiqueta.</p>
        </div>
        <Button variant="gold" size="sm" onClick={() => setCapture(true)}>
          <Camera className="w-4 h-4 mr-1" /> Foto de etiqueta
        </Button>
      </div>

      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-8" placeholder="Buscar cliente, producto, orden..." value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select value={estado} onValueChange={setEstado}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los estados</SelectItem>
            {ESTADOS_EXTERNOS.map((e) => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="py-16 text-center text-muted-foreground animate-pulse">Cargando...</div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center">
          <PackageSearch className="w-10 h-10 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground mb-4">Sin pedidos externos registrados.</p>
          <Button variant="gold" size="sm" onClick={() => setCapture(true)}>
            <Camera className="w-4 h-4 mr-1" /> Sacar foto de etiqueta
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => (
            <div key={r.id} className="glass-card rounded-lg p-3 flex gap-3">
              {r.foto_url ? (
                <img src={r.foto_url} alt={`Etiqueta de ${r.cliente_nombre}`} className="w-16 h-16 rounded object-cover border border-border" />
              ) : (
                <div className="w-16 h-16 rounded bg-muted/30 flex items-center justify-center">
                  <PackageSearch className="w-5 h-5 text-muted-foreground/60" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{r.cliente_nombre}</span>
                  <Badge variant="secondary" className="text-[10px]">
                    {ORIGENES.find((o) => o.value === r.origen)?.label || r.origen}
                  </Badge>
                  {estadoBadge(r.estado)}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  {r.producto || "Producto sin detalle"}
                  {r.variante && ` · ${r.variante}`} × {Number(r.cantidad)}
                  {r.externo_ref && ` · ${r.externo_ref}`}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Ubicación: {r.ubicacion || "—"}
                </p>
              </div>
              <Select value={r.estado} onValueChange={(v) => setEstadoRow(r.id, v)}>
                <SelectTrigger className="w-36 h-8 text-xs self-center"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ESTADOS_EXTERNOS.map((e) => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      )}

      <EtiquetaExternaCapture open={capture} onOpenChange={setCapture} onSaved={load} />
    </div>
  );
};

export default DepositoExternos;
