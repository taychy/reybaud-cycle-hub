import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Plus, Receipt, Wallet, Trash2, Edit2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface GastoRow {
  id: string;
  categoria: string;
  subcategoria: string | null;
  descripcion: string;
  monto: number;
  moneda: string;
  fecha: string;
  recurrente: boolean;
  frecuencia: string | null;
  proveedor: string | null;
  notas: string | null;
  forma_pago: string;
  created_at: string;
}

const CATEGORIAS_GASTO = [
  "Alquiler", "Sueldos", "Seguros", "Servicios", "Marketing",
  "Equipamiento", "Mantenimiento", "Impuestos", "Comisiones", "Otros",
];

const FORMA_PAGO_LABELS: Record<string, string> = {
  efectivo: "Efectivo",
  tarjeta_credito: "Tarjeta de Crédito",
  mp_personal: "MP Personal",
  mp_josi: "MP Josi",
  mp_escuela: "MP Escuela",
  mp_tienda: "MP Tienda",
  mc_personal: "MC Personal",
  banco: "Banco",
};

const MONEDA_SIMBOLO: Record<string, string> = { ARS: "$", USD: "US$", EUR: "€" };
const fmtMoneda = (n: number, moneda: string) => `${MONEDA_SIMBOLO[moneda] || "$"}${n.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;

const SuperAdminGastos = () => {
  const [loading, setLoading] = useState(true);
  const [gastos, setGastos] = useState<GastoRow[]>([]);
  const [gastoDialogOpen, setGastoDialogOpen] = useState(false);
  const [editingGasto, setEditingGasto] = useState<GastoRow | null>(null);

  const [gastoForm, setGastoForm] = useState({
    categoria: "Otros",
    subcategoria: "",
    descripcion: "",
    monto: "",
    moneda: "ARS",
    fecha: new Date().toISOString().split("T")[0],
    recurrente: false,
    frecuencia: "",
    proveedor: "",
    notas: "",
    forma_pago: "efectivo",
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("gastos").select("*").order("fecha", { ascending: false }).limit(500);
    setGastos((data || []) as GastoRow[]);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSaveGasto = async () => {
    if (!gastoForm.descripcion || !gastoForm.monto) {
      toast({ title: "Completá descripción y monto", variant: "destructive" });
      return;
    }
    const payload = {
      categoria: gastoForm.categoria,
      subcategoria: gastoForm.subcategoria || null,
      descripcion: gastoForm.descripcion,
      monto: Number(gastoForm.monto),
      moneda: gastoForm.moneda,
      fecha: gastoForm.fecha,
      recurrente: gastoForm.recurrente,
      frecuencia: gastoForm.recurrente ? gastoForm.frecuencia || null : null,
      proveedor: gastoForm.proveedor || null,
      notas: gastoForm.notas || null,
      forma_pago: gastoForm.forma_pago,
    };

    if (editingGasto) {
      const { error } = await supabase.from("gastos").update(payload as any).eq("id", editingGasto.id);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Gasto actualizado" });
    } else {
      const { error } = await supabase.from("gastos").insert(payload as any);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Gasto registrado" });
    }

    setGastoDialogOpen(false);
    setEditingGasto(null);
    resetForm();
    loadData();
  };

  const handleDeleteGasto = async (id: string) => {
    const { error } = await supabase.from("gastos").delete().eq("id", id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Gasto eliminado" });
    loadData();
  };

  const resetForm = () => {
    setGastoForm({
      categoria: "Otros", subcategoria: "", descripcion: "", monto: "", moneda: "ARS",
      fecha: new Date().toISOString().split("T")[0], recurrente: false,
      frecuencia: "", proveedor: "", notas: "", forma_pago: "efectivo",
    });
  };

  const openEditGasto = (g: GastoRow) => {
    setEditingGasto(g);
    setGastoForm({
      categoria: g.categoria,
      subcategoria: g.subcategoria || "",
      descripcion: g.descripcion,
      monto: String(g.monto),
      moneda: g.moneda || "ARS",
      fecha: g.fecha,
      recurrente: g.recurrente,
      frecuencia: g.frecuencia || "",
      proveedor: g.proveedor || "",
      notas: g.notas || "",
      forma_pago: g.forma_pago || "efectivo",
    });
    setGastoDialogOpen(true);
  };

  if (loading) return <div className="animate-pulse text-muted-foreground text-center py-12">Cargando gastos...</div>;

  const startOfMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-01`;
  const gastosPorCategoria = gastos
    .filter(g => g.fecha >= startOfMonth)
    .reduce((acc, g) => { acc[g.categoria] = (acc[g.categoria] || 0) + g.monto; return acc; }, {} as Record<string, number>);
  const gastosCatArray = Object.entries(gastosPorCategoria).map(([cat, total]) => ({ cat, total })).sort((a, b) => b.total - a.total);
  const maxGastoCat = Math.max(...gastosCatArray.map(g => g.total), 1);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold uppercase tracking-wider">Gastos</h1>
        <p className="text-sm text-muted-foreground">Registro y control de gastos operativos</p>
      </div>

      {/* Gastos por categoría */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-heading font-bold uppercase tracking-wider flex items-center gap-2">
            <Receipt className="w-4 h-4 text-destructive" />
            Gastos del mes por categoría
          </CardTitle>
        </CardHeader>
        <CardContent>
          {gastosCatArray.length > 0 ? (
            <div className="space-y-3">
              {gastosCatArray.map((g) => (
                <div key={g.cat} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{g.cat}</span>
                    <span className="font-heading font-bold">{fmt(g.total)}</span>
                  </div>
                  <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-destructive/70 rounded-full" style={{ width: `${(g.total / maxGastoCat) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground text-sm">No hay gastos registrados este mes</div>
          )}
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-heading font-bold uppercase tracking-wider flex items-center gap-2">
              <Wallet className="w-4 h-4 text-primary" />
              Gestión de gastos
            </CardTitle>
            <Dialog open={gastoDialogOpen} onOpenChange={(open) => { setGastoDialogOpen(open); if (!open) { setEditingGasto(null); resetForm(); } }}>
              <DialogTrigger asChild>
                <Button size="sm" variant="gold" className="gap-1"><Plus className="w-4 h-4" /> Registrar gasto</Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>{editingGasto ? "Editar gasto" : "Registrar gasto"}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Categoría</Label>
                      <Select value={gastoForm.categoria} onValueChange={(v) => setGastoForm(f => ({ ...f, categoria: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{CATEGORIAS_GASTO.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Fecha</Label>
                      <Input type="date" value={gastoForm.fecha} onChange={(e) => setGastoForm(f => ({ ...f, fecha: e.target.value }))} />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Descripción</Label>
                    <Input value={gastoForm.descripcion} onChange={(e) => setGastoForm(f => ({ ...f, descripcion: e.target.value }))} placeholder="Ej: Alquiler local Palermo" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Monto ($)</Label>
                      <Input type="number" value={gastoForm.monto} onChange={(e) => setGastoForm(f => ({ ...f, monto: e.target.value }))} placeholder="0" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Proveedor</Label>
                      <Input value={gastoForm.proveedor} onChange={(e) => setGastoForm(f => ({ ...f, proveedor: e.target.value }))} placeholder="Opcional" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Forma de pago</Label>
                    <Select value={gastoForm.forma_pago} onValueChange={(v) => setGastoForm(f => ({ ...f, forma_pago: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="efectivo">Efectivo</SelectItem>
                        <SelectItem value="tarjeta_credito">Tarjeta de Crédito</SelectItem>
                        <SelectItem value="mp_personal">Mercado Pago Personal</SelectItem>
                        <SelectItem value="mp_josi">Mercado Pago Josi</SelectItem>
                        <SelectItem value="mp_escuela">Mercado Pago Escuela</SelectItem>
                        <SelectItem value="mp_tienda">Mercado Pago Tienda</SelectItem>
                        <SelectItem value="mc_personal">Mercado Crédito Personal</SelectItem>
                        <SelectItem value="banco">Banco</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-3">
                    <Switch checked={gastoForm.recurrente} onCheckedChange={(v) => setGastoForm(f => ({ ...f, recurrente: v }))} />
                    <Label className="text-xs">Gasto recurrente</Label>
                    {gastoForm.recurrente && (
                      <Select value={gastoForm.frecuencia} onValueChange={(v) => setGastoForm(f => ({ ...f, frecuencia: v }))}>
                        <SelectTrigger className="w-32"><SelectValue placeholder="Frecuencia" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="mensual">Mensual</SelectItem>
                          <SelectItem value="trimestral">Trimestral</SelectItem>
                          <SelectItem value="anual">Anual</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Notas</Label>
                    <Textarea value={gastoForm.notas} onChange={(e) => setGastoForm(f => ({ ...f, notas: e.target.value }))} rows={2} placeholder="Opcional" />
                  </div>
                  <Button onClick={handleSaveGasto} className="w-full" variant="gold">
                    {editingGasto ? "Guardar cambios" : "Registrar gasto"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {gastos.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">No hay gastos registrados.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Categoría</TableHead>
                    <TableHead>Descripción</TableHead>
                    <TableHead>Forma de pago</TableHead>
                    <TableHead>Proveedor</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="w-20">Acción</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {gastos.slice(0, 20).map((g) => (
                    <TableRow key={g.id}>
                      <TableCell className="text-xs">{new Date(g.fecha + "T12:00:00").toLocaleDateString("es-AR")}</TableCell>
                      <TableCell><Badge variant="outline" className="text-xs">{g.categoria}</Badge></TableCell>
                      <TableCell className="text-sm max-w-[200px] truncate">{g.descripcion}</TableCell>
                      <TableCell className="text-xs">{FORMA_PAGO_LABELS[g.forma_pago] || "Efectivo"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{g.proveedor || "—"}</TableCell>
                      <TableCell className="text-right font-heading font-bold">{fmt(g.monto)}</TableCell>
                      <TableCell>
                        {g.recurrente ? (
                          <Badge variant="secondary" className="text-[10px]">{g.frecuencia || "Recurrente"}</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">Único</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEditGasto(g)}><Edit2 className="w-3 h-3" /></Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleDeleteGasto(g.id)}><Trash2 className="w-3 h-3" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default SuperAdminGastos;
