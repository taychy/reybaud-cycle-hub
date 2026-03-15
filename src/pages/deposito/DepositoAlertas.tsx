import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Package, RefreshCw } from "lucide-react";

interface Product {
  id: string;
  name: string;
  stock: number;
  min_stock: number;
}

const DepositoAlertas = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAlerts = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("store_products")
      .select("id, name, stock, min_stock")
      .eq("status", "active")
      .order("stock", { ascending: true });

    setProducts((data || []).filter((p) => p.stock <= p.min_stock));
    setLoading(false);
  };

  useEffect(() => { fetchAlerts(); }, []);

  const sinStock = products.filter((p) => p.stock === 0);
  const stockBajo = products.filter((p) => p.stock > 0 && p.stock <= p.min_stock);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-heading font-bold uppercase tracking-wider">Alertas de Stock</h1>
        <Button variant="outline" size="sm" onClick={fetchAlerts}>
          <RefreshCw className="w-4 h-4 mr-1" /> Actualizar
        </Button>
      </div>

      {loading ? (
        <div className="text-muted-foreground text-center py-12">Cargando...</div>
      ) : products.length === 0 ? (
        <Card className="border-border">
          <CardContent className="p-12 text-center">
            <Package className="w-12 h-12 mx-auto text-green-500 mb-4" />
            <h3 className="font-heading text-lg font-bold">Todo en orden</h3>
            <p className="text-muted-foreground text-sm">No hay productos con stock bajo o sin stock.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {sinStock.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-heading font-bold uppercase tracking-wider text-destructive flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" /> Sin stock ({sinStock.length})
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {sinStock.map((p) => (
                  <Card key={p.id} className="border-destructive/30 bg-destructive/5">
                    <CardContent className="p-4 flex items-center justify-between">
                      <div>
                        <p className="font-medium text-sm">{p.name}</p>
                        <p className="text-xs text-muted-foreground">Mínimo: {p.min_stock}</p>
                      </div>
                      <Badge variant="destructive">0</Badge>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {stockBajo.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-heading font-bold uppercase tracking-wider text-yellow-500 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" /> Stock bajo ({stockBajo.length})
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {stockBajo.map((p) => (
                  <Card key={p.id} className="border-yellow-500/30 bg-yellow-500/5">
                    <CardContent className="p-4 flex items-center justify-between">
                      <div>
                        <p className="font-medium text-sm">{p.name}</p>
                        <p className="text-xs text-muted-foreground">Mínimo: {p.min_stock}</p>
                      </div>
                      <Badge variant="outline" className="border-yellow-500 text-yellow-500">
                        {p.stock}
                      </Badge>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default DepositoAlertas;
