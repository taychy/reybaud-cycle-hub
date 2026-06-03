import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCw, Search, Plus, Minus } from "lucide-react";

interface Movement {
  id: string;
  product_id: string;
  tipo: string;
  cantidad: number;
  stock_anterior: number;
  stock_nuevo: number;
  motivo: string | null;
  variante: string | null;
  created_at: string;
  product_name?: string;
}

const DepositoMovimientos = () => {
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterTipo, setFilterTipo] = useState("todos");
  const [search, setSearch] = useState("");

  const fetchMovements = async () => {
    setLoading(true);
    // Fetch movements with product names
    const { data: movData, error } = await supabase
      .from("stock_movements" as any)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      setLoading(false);
      return;
    }

    const rawMovements = (movData || []) as any[];

    // Fetch product names for all product_ids
    const productIds = [...new Set(rawMovements.map((m: any) => m.product_id))];
    const { data: products } = await supabase
      .from("store_products")
      .select("id, name")
      .in("id", productIds);

    const productMap = new Map((products || []).map((p) => [p.id, p.name]));

    setMovements(
      rawMovements.map((m: any) => ({
        ...m,
        product_name: productMap.get(m.product_id) || "—",
      }))
    );
    setLoading(false);
  };

  useEffect(() => { fetchMovements(); }, []);

  const filtered = movements.filter((m) => {
    if (filterTipo !== "todos" && m.tipo !== filterTipo) return false;
    if (search && !(m.product_name || "").toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-heading font-bold uppercase tracking-wider">Historial de Movimientos</h1>
        <Button variant="outline" size="sm" onClick={fetchMovements}>
          <RefreshCw className="w-4 h-4 mr-1" /> Actualizar
        </Button>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por producto..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterTipo} onValueChange={setFilterTipo}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="ingreso">Ingresos</SelectItem>
            <SelectItem value="egreso">Egresos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card className="border-border">
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">Cargando movimientos...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead className="text-center">Tipo</TableHead>
                  <TableHead className="text-center">Cantidad</TableHead>
                  <TableHead className="text-center">Anterior → Nuevo</TableHead>
                  <TableHead>Motivo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {new Date(m.created_at).toLocaleDateString("es-AR", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </TableCell>
                    <TableCell className="font-medium">
                      <div>{m.product_name}</div>
                      {m.variante && (
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          {m.variante.replace(/\|/g, " · ")}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {m.tipo === "ingreso" ? (
                        <Badge className="bg-green-500/10 text-green-500 border-green-500/30">
                          <Plus className="w-3 h-3 mr-1" /> Ingreso
                        </Badge>
                      ) : (
                        <Badge variant="destructive" className="bg-destructive/10">
                          <Minus className="w-3 h-3 mr-1" /> Egreso
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-center font-bold">
                      {m.tipo === "ingreso" ? "+" : "-"}{m.cantidad}
                    </TableCell>
                    <TableCell className="text-center text-sm text-muted-foreground">
                      {m.stock_anterior} → {m.stock_nuevo}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{m.motivo || "—"}</TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No hay movimientos registrados
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default DepositoMovimientos;
