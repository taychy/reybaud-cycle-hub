import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, Package } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface StockProduct {
  id: string;
  name: string;
  image_url: string | null;
  stock: number;
  min_stock: number;
  status: string;
}

const StoreStock = () => {
  const [products, setProducts] = useState<StockProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editStock, setEditStock] = useState(0);
  const [editMinStock, setEditMinStock] = useState(0);
  const { toast } = useToast();

  const load = async () => {
    const { data } = await supabase.from("store_products").select("id, name, image_url, stock, min_stock, status").order("stock", { ascending: true });
    setProducts((data as any[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const saveStock = async (id: string) => {
    await supabase.from("store_products").update({ stock: editStock, min_stock: editMinStock } as any).eq("id", id);
    toast({ title: "Stock actualizado" });
    setEditingId(null);
    load();
  };

  if (loading) return <div className="animate-pulse text-muted-foreground">Cargando stock...</div>;

  const lowStock = products.filter((p) => p.stock <= p.min_stock);
  const okStock = products.filter((p) => p.stock > p.min_stock);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-heading font-bold">Control de Stock</h1>

      {/* Alerts */}
      {lowStock.length > 0 && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-destructive" />
            <h2 className="text-sm font-heading font-bold uppercase text-destructive">{lowStock.length} productos con stock bajo</h2>
          </div>
          <div className="divide-y divide-border rounded-lg border border-border bg-card">
            {lowStock.map((p) => (
              <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                <div className="w-10 h-10 rounded bg-secondary overflow-hidden shrink-0">
                  {p.image_url ? <img src={p.image_url} className="w-full h-full object-cover" /> : <Package className="w-5 h-5 text-muted-foreground m-auto mt-2.5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground truncate">{p.name}</p>
                  <p className="text-xs text-muted-foreground">{p.stock === 0 ? "Sin stock" : `${p.stock} unidades (mín: ${p.min_stock})`}</p>
                </div>
                {editingId === p.id ? (
                  <div className="flex items-center gap-2">
                    <Input type="number" value={editStock} onChange={(e) => setEditStock(Number(e.target.value))} className="w-20 h-8" />
                    <Input type="number" value={editMinStock} onChange={(e) => setEditMinStock(Number(e.target.value))} className="w-20 h-8" />
                    <Button size="sm" onClick={() => saveStock(p.id)}>OK</Button>
                  </div>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => { setEditingId(p.id); setEditStock(p.stock); setEditMinStock(p.min_stock); }}>Editar</Button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All products stock table */}
      <div className="rounded-xl border border-border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="px-4 py-3 text-left font-heading text-xs uppercase">Producto</th>
              <th className="px-4 py-3 text-center font-heading text-xs uppercase">Stock actual</th>
              <th className="px-4 py-3 text-center font-heading text-xs uppercase">Stock mínimo</th>
              <th className="px-4 py-3 text-center font-heading text-xs uppercase">Alerta</th>
              <th className="px-4 py-3 text-right font-heading text-xs uppercase">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {products.map((p) => (
              <tr key={p.id} className="hover:bg-muted/30">
                <td className="px-4 py-2 font-medium text-foreground">{p.name}</td>
                <td className="px-4 py-2 text-center">
                  {editingId === p.id ? (
                    <Input type="number" value={editStock} onChange={(e) => setEditStock(Number(e.target.value))} className="w-20 h-8 mx-auto" />
                  ) : (
                    <span className={p.stock <= p.min_stock ? "text-destructive font-bold" : ""}>{p.stock}</span>
                  )}
                </td>
                <td className="px-4 py-2 text-center">
                  {editingId === p.id ? (
                    <Input type="number" value={editMinStock} onChange={(e) => setEditMinStock(Number(e.target.value))} className="w-20 h-8 mx-auto" />
                  ) : (
                    <span>{p.min_stock}</span>
                  )}
                </td>
                <td className="px-4 py-2 text-center">
                  {p.stock === 0 ? (
                    <span className="text-[10px] font-heading font-bold bg-destructive/20 text-destructive px-2 py-0.5 rounded uppercase">Sin stock</span>
                  ) : p.stock <= p.min_stock ? (
                    <span className="text-[10px] font-heading font-bold bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded uppercase">Bajo</span>
                  ) : (
                    <span className="text-[10px] font-heading font-bold bg-green-500/20 text-green-400 px-2 py-0.5 rounded uppercase">OK</span>
                  )}
                </td>
                <td className="px-4 py-2 text-right">
                  {editingId === p.id ? (
                    <div className="flex gap-1 justify-end">
                      <Button size="sm" onClick={() => saveStock(p.id)}>Guardar</Button>
                      <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>Cancelar</Button>
                    </div>
                  ) : (
                    <Button variant="ghost" size="sm" onClick={() => { setEditingId(p.id); setEditStock(p.stock); setEditMinStock(p.min_stock); }}>Editar</Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {products.length === 0 && <div className="p-8 text-center text-muted-foreground">No hay productos</div>}
      </div>
    </div>
  );
};

export default StoreStock;
