import { useState, useEffect } from "react";
import { formatPrice } from "@/lib/currency";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { DollarSign, History, TrendingUp, TrendingDown } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface Plan {
  id: string;
  nombre: string;
  precio: number;
  activo: boolean;
  moneda: string;
}

interface PrecioHistorial {
  id: string;
  plan_id: string;
  precio_anterior: number;
  precio_nuevo: number;
  fecha_cambio: string;
  fecha_vigencia: string | null;
  aplicar_a: string;
  notas: string | null;
}

const aplicarOptions = [
  { value: "nuevos", label: "Solo nuevos alumnos" },
  { value: "nuevos_renovaciones", label: "Nuevos + renovaciones" },
  { value: "todos", label: "Todos (manualmente)" },
];

const ManagePrecios = () => {
  const [planes, setPlanes] = useState<Plan[]>([]);
  const [historial, setHistorial] = useState<PrecioHistorial[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [histDialogOpen, setHistDialogOpen] = useState(false);
  const [histPlanId, setHistPlanId] = useState<string | null>(null);
  const [form, setForm] = useState({
    precio_nuevo: "",
    fecha_vigencia: "",
    aplicar_a: "nuevos",
    notas: "",
  });

  const fetchAll = async () => {
    const [planesRes, histRes] = await Promise.all([
      supabase.from("planes").select("id, nombre, precio, activo, moneda").order("precio", { ascending: false }),
      supabase.from("precio_historial").select("*").order("fecha_cambio", { ascending: false }).limit(100),
    ]);
    setPlanes((planesRes.data as any[]) || []);
    setHistorial((histRes.data as any[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const openUpdatePrice = (plan: Plan) => {
    setSelectedPlan(plan);
    setForm({ precio_nuevo: "", fecha_vigencia: "", aplicar_a: "nuevos", notas: "" });
    setDialogOpen(true);
  };

  const openHistory = (planId: string) => {
    setHistPlanId(planId);
    setHistDialogOpen(true);
  };

  const handleUpdatePrice = async () => {
    if (!selectedPlan) return;
    const newPrice = Number(form.precio_nuevo);
    if (!newPrice || newPrice <= 0) {
      toast({ title: "Ingresá un precio válido", variant: "destructive" });
      return;
    }
    if (newPrice === selectedPlan.precio) {
      toast({ title: "El precio es el mismo", variant: "destructive" });
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();

      // Insert history
      const { error: histError } = await supabase.from("precio_historial").insert({
        plan_id: selectedPlan.id,
        precio_anterior: selectedPlan.precio,
        precio_nuevo: newPrice,
        fecha_vigencia: form.fecha_vigencia || null,
        aplicar_a: form.aplicar_a,
        modificado_por: session?.user?.id || null,
        notas: form.notas.trim() || null,
      } as any);

      if (histError) {
        toast({ title: "Error al guardar historial", description: histError.message, variant: "destructive" });
        return;
      }

      // Update plan price
      const { error: updateError } = await supabase.from("planes").update({ precio: newPrice } as any).eq("id", selectedPlan.id);

      if (updateError) {
        toast({ title: "Error al actualizar precio", description: updateError.message, variant: "destructive" });
        return;
      }

      toast({ title: "Precio actualizado" });
      setDialogOpen(false);
      fetchAll();
    } catch (err: any) {
      toast({ title: "Error inesperado", description: err.message || "Intentá de nuevo", variant: "destructive" });
    }
  };

  const fmtPrice = (p: number, moneda: string = "ARS") => formatPrice(p, moneda);

  const formatDate = (d: string) => {
    const date = new Date(d);
    return date.toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" });
  };

  const getLatestChange = (planId: string) =>
    historial.find((h) => h.plan_id === planId);

  const planHistory = histPlanId ? historial.filter((h) => h.plan_id === histPlanId) : [];

  if (loading) return <div className="animate-pulse text-muted-foreground p-8">Cargando precios...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold uppercase tracking-wider">Precios</h1>
        <p className="text-sm text-muted-foreground">Administración de precios con historial de cambios</p>
      </div>

      {/* Desktop table */}
      <Card className="hidden md:block">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Plan</TableHead>
                <TableHead>Precio actual</TableHead>
                <TableHead>Precio anterior</TableHead>
                <TableHead>Última actualización</TableHead>
                <TableHead>Aplicó a</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {planes.map((plan) => {
                const latest = getLatestChange(plan.id);
                return (
                  <TableRow key={plan.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <DollarSign className="w-4 h-4 text-primary" />
                        <span className="font-medium">{plan.nombre}</span>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">{plan.moneda}</Badge>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono font-bold">{formatPrice(plan.precio, plan.moneda)}</TableCell>
                    <TableCell className="font-mono text-muted-foreground">
                      {latest ? (
                        <span className="flex items-center gap-1">
                          {formatPrice(latest.precio_anterior, plan.moneda)}
                          {latest.precio_nuevo > latest.precio_anterior
                            ? <TrendingUp className="w-3 h-3 text-primary" />
                            : <TrendingDown className="w-3 h-3 text-destructive" />
                          }
                        </span>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {latest ? formatDate(latest.fecha_cambio) : "—"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {latest ? aplicarOptions.find((a) => a.value === latest.aplicar_a)?.label || latest.aplicar_a : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={plan.activo ? "default" : "secondary"}>
                        {plan.activo ? "Activo" : "Inactivo"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="outline" size="sm" onClick={() => openUpdatePrice(plan)}>
                          Actualizar precio
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => openHistory(plan.id)} title="Historial">
                          <History className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {planes.map((plan) => {
          const latest = getLatestChange(plan.id);
          return (
            <Card key={plan.id}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-medium">{plan.nombre}</h3>
                    <p className="text-xl font-mono font-bold text-primary">{formatPrice(plan.precio, plan.moneda)}</p>
                  </div>
                  <Badge variant={plan.activo ? "default" : "secondary"}>
                    {plan.activo ? "Activo" : "Inactivo"}
                  </Badge>
                </div>
                {latest && (
                  <div className="text-xs text-muted-foreground flex items-center gap-2">
                    <span>Anterior: {formatPrice(latest.precio_anterior, plan.moneda)}</span>
                    <span>·</span>
                    <span>{formatDate(latest.fecha_cambio)}</span>
                  </div>
                )}
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => openUpdatePrice(plan)}>
                    <DollarSign className="w-3 h-3" /> Actualizar precio
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => openHistory(plan.id)}>
                    <History className="w-3 h-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Update price dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Actualizar precio — {selectedPlan?.nombre}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg bg-secondary/30 p-3 text-sm">
              <span className="text-muted-foreground">Precio actual: </span>
              <span className="font-mono font-bold">{selectedPlan && formatPrice(selectedPlan.precio, selectedPlan.moneda)}</span>
            </div>
            <div>
              <label className="text-sm font-medium">Nuevo precio *</label>
              <Input type="number" value={form.precio_nuevo} onChange={(e) => setForm({ ...form, precio_nuevo: e.target.value })} placeholder="0" />
            </div>
            <div>
              <label className="text-sm font-medium">Fecha de entrada en vigencia</label>
              <Input type="date" value={form.fecha_vigencia} onChange={(e) => setForm({ ...form, fecha_vigencia: e.target.value })} />
              <p className="text-xs text-muted-foreground mt-1">Dejá vacío para que aplique inmediatamente</p>
            </div>
            <div>
              <label className="text-sm font-medium">¿A quién aplica?</label>
              <Select value={form.aplicar_a} onValueChange={(v) => setForm({ ...form, aplicar_a: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {aplicarOptions.map((a) => (
                    <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Notas</label>
              <Textarea value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} placeholder="Motivo del cambio..." rows={2} />
            </div>
            <Button variant="gold" className="w-full" onClick={handleUpdatePrice}>
              Confirmar cambio de precio
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* History dialog */}
      <Dialog open={histDialogOpen} onOpenChange={setHistDialogOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Historial de precios — {planes.find((p) => p.id === histPlanId)?.nombre}</DialogTitle>
          </DialogHeader>
          {planHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Sin cambios de precio registrados</p>
          ) : (
            <div className="space-y-3">
              {planHistory.map((h) => (
                <div key={h.id} className="rounded-lg border border-border p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm line-through text-muted-foreground">{formatPrice(h.precio_anterior, planes.find(p => p.id === h.plan_id)?.moneda)}</span>
                      <span className="text-muted-foreground">→</span>
                      <span className="font-mono text-sm font-bold">{formatPrice(h.precio_nuevo, planes.find(p => p.id === h.plan_id)?.moneda)}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{formatDate(h.fecha_cambio)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="outline" className="text-xs">{aplicarOptions.find((a) => a.value === h.aplicar_a)?.label || h.aplicar_a}</Badge>
                    {h.fecha_vigencia && <span>Vigencia: {h.fecha_vigencia}</span>}
                  </div>
                  {h.notas && <p className="text-xs text-muted-foreground">{h.notas}</p>}
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ManagePrecios;
