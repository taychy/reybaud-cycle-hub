import { useCallback, useEffect, useMemo, useState } from "react";
import { Calculator, Loader2, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { formatPrice } from "@/lib/currency";
import { calculateProgramBudget } from "@/lib/programBudget";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// These tables are introduced by the migration in this change and are not in the generated client yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb: any = supabase;

const CATEGORIAS = [
  "Docencia",
  "Publicidad",
  "Sede",
  "Seguro",
  "Materiales",
  "Administración",
  "Comisiones",
  "Impuestos",
  "Contingencia",
  "Otro",
];

interface Budget {
  id: string;
  plan_id: string;
  participantes_base: number;
  moneda: string;
}

interface BudgetItem {
  id: string;
  budget_id: string;
  categoria: string;
  concepto: string;
  cantidad: number;
  costo_unitario: number;
  costo_real: number | null;
  orden: number;
}

interface Props {
  planId: string;
  moneda: string;
  precioLista: number;
  cupoMax: number;
  inscriptosActivos: number;
}

export default function ProgramBudgetPanel({ planId, moneda, precioLista, cupoMax, inscriptosActivos }: Props) {
  const [budget, setBudget] = useState<Budget | null>(null);
  const [items, setItems] = useState<BudgetItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await sb
      .from("program_budgets")
      .select("id, plan_id, participantes_base, moneda")
      .eq("plan_id", planId)
      .maybeSingle();

    if (error) {
      toast({ title: "No se pudo cargar el presupuesto", description: error.message, variant: "destructive" });
      setLoading(false);
      return;
    }

    setBudget(data || null);
    if (data) {
      const { data: rows, error: itemsError } = await sb
        .from("program_budget_items")
        .select("id, budget_id, categoria, concepto, cantidad, costo_unitario, costo_real, orden")
        .eq("budget_id", data.id)
        .order("orden");
      if (itemsError) {
        toast({ title: "No se pudieron cargar los costos", description: itemsError.message, variant: "destructive" });
      }
      setItems(rows || []);
    } else {
      setItems([]);
    }
    setLoading(false);
  }, [planId]);

  useEffect(() => {
    load();
  }, [load]);

  const summary = useMemo(
    () => calculateProgramBudget(items, budget?.participantes_base || 10, precioLista),
    [items, budget?.participantes_base, precioLista],
  );

  const createBudget = async () => {
    setSaving(true);
    const base = Math.max(1, Math.min(cupoMax || 10, 10));
    const { data, error } = await sb
      .from("program_budgets")
      .insert({ plan_id: planId, participantes_base: base, moneda })
      .select("id, plan_id, participantes_base, moneda")
      .single();

    if (error || !data) {
      toast({ title: "No se pudo crear el presupuesto", description: error?.message, variant: "destructive" });
      setSaving(false);
      return;
    }

    const { error: itemsError } = await sb.from("program_budget_items").insert([
      {
        budget_id: data.id,
        categoria: "Docencia",
        concepto: "Honorarios profesor",
        cantidad: 8,
        costo_unitario: 40000,
        orden: 0,
      },
      {
        budget_id: data.id,
        categoria: "Publicidad",
        concepto: "Publicidad Meta",
        cantidad: 1,
        costo_unitario: 45000,
        orden: 1,
      },
    ]);

    if (itemsError) {
      await sb.from("program_budgets").delete().eq("id", data.id);
      toast({ title: "No se pudo crear el presupuesto", description: itemsError.message, variant: "destructive" });
      setSaving(false);
      return;
    }

    setSaving(false);
    toast({ title: "Presupuesto creado", description: "Se cargaron docencia y publicidad como base." });
    await load();
  };

  const updateBase = async (value: number) => {
    if (!budget) return;
    const participantes_base = Math.max(1, Math.round(value || 1));
    setBudget({ ...budget, participantes_base });
    const { error } = await sb.from("program_budgets").update({ participantes_base }).eq("id", budget.id);
    if (error) toast({ title: "No se pudo guardar", description: error.message, variant: "destructive" });
  };

  const patchItem = (id: string, patch: Partial<BudgetItem>) => {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const saveItem = async (item: BudgetItem) => {
    const { error } = await sb
      .from("program_budget_items")
      .update({
        categoria: item.categoria,
        concepto: item.concepto,
        cantidad: Number(item.cantidad) || 0,
        costo_unitario: Number(item.costo_unitario) || 0,
        costo_real: item.costo_real === null ? null : Number(item.costo_real) || 0,
      })
      .eq("id", item.id);
    if (error) toast({ title: "No se pudo guardar el costo", description: error.message, variant: "destructive" });
  };

  const addItem = async () => {
    if (!budget) return;
    const { data, error } = await sb
      .from("program_budget_items")
      .insert({
        budget_id: budget.id,
        categoria: "Otro",
        concepto: "",
        cantidad: 1,
        costo_unitario: 0,
        orden: items.length,
      })
      .select("id, budget_id, categoria, concepto, cantidad, costo_unitario, costo_real, orden")
      .single();
    if (error || !data) {
      toast({ title: "No se pudo agregar el costo", description: error?.message, variant: "destructive" });
      return;
    }
    setItems((current) => [...current, data]);
  };

  const deleteItem = async (id: string) => {
    const { error } = await sb.from("program_budget_items").delete().eq("id", id);
    if (error) {
      toast({ title: "No se pudo eliminar", description: error.message, variant: "destructive" });
      return;
    }
    setItems((current) => current.filter((item) => item.id !== id));
  };

  if (loading) {
    return <div className="py-10 flex justify-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" /></div>;
  }

  if (!budget) {
    return (
      <Card>
        <CardContent className="p-8 text-center space-y-4">
          <Calculator className="w-8 h-8 text-primary mx-auto" />
          <div>
            <h3 className="font-semibold">Presupuesto del programa</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Organizá los costos y distribuí el total entre una cantidad conservadora de inscriptos.
            </p>
          </div>
          <Button onClick={createBudget} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Crear presupuesto base
          </Button>
          <p className="text-xs text-muted-foreground">Incluye 8 clases × $40.000 y $45.000 de publicidad; luego podés editar todo.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Calculator className="w-4 h-4 text-primary" /> Presupuesto del programa
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">La publicidad y los demás costos se distribuyen entre los inscriptos usados para calcular.</p>
            </div>
            <div className="w-44 space-y-1">
              <Label htmlFor="participantes-base" className="text-xs">Alumnos para calcular</Label>
              <Input
                id="participantes-base"
                type="number"
                min={1}
                max={cupoMax || undefined}
                value={budget.participantes_base}
                onChange={(event) => setBudget({ ...budget, participantes_base: Number(event.target.value) })}
                onBlur={(event) => updateBase(Number(event.target.value))}
              />
              <p className="text-[10px] text-muted-foreground">Hoy hay {inscriptosActivos} activos · cupo {cupoMax || "—"}</p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <SummaryCard label="Costo presupuestado" value={formatPrice(summary.presupuestoTotal, moneda)} />
            <SummaryCard label="Costo por inscripto" value={formatPrice(summary.costoPorInscripto, moneda)} accent />
            <SummaryCard label="Ingresos proyectados" value={formatPrice(summary.ingresosProyectados, moneda)} />
            <SummaryCard label="Resultado proyectado" value={formatPrice(summary.resultadoProyectado, moneda)} accent={summary.resultadoProyectado >= 0} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Detalle de costos</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">Presupuestado sirve para fijar el precio; real se completa cuando se paga.</p>
          </div>
          <Button size="sm" variant="outline" onClick={addItem}><Plus className="w-4 h-4 mr-1" /> Agregar costo</Button>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="hidden md:grid grid-cols-12 gap-2 px-2 text-[11px] text-muted-foreground">
            <span className="col-span-2">Categoría</span>
            <span className="col-span-3">Concepto</span>
            <span className="col-span-1">Cantidad</span>
            <span className="col-span-2">Costo unitario</span>
            <span className="col-span-2">Total previsto</span>
            <span className="col-span-1">Real</span>
          </div>
          {items.map((item) => {
            const previsto = (Number(item.cantidad) || 0) * (Number(item.costo_unitario) || 0);
            return (
              <div key={item.id} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center rounded-md border p-2">
                <Select value={item.categoria} onValueChange={(value) => {
                  const next = { ...item, categoria: value };
                  patchItem(item.id, { categoria: value });
                  saveItem(next);
                }}>
                  <SelectTrigger className="md:col-span-2 h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>{CATEGORIAS.map((category) => <SelectItem key={category} value={category}>{category}</SelectItem>)}</SelectContent>
                </Select>
                <Input className="md:col-span-3 h-9" placeholder="Concepto" value={item.concepto} onChange={(e) => patchItem(item.id, { concepto: e.target.value })} onBlur={() => saveItem(items.find((row) => row.id === item.id) || item)} />
                <Input className="md:col-span-1 h-9" type="number" min={0} value={item.cantidad} onChange={(e) => patchItem(item.id, { cantidad: Number(e.target.value) })} onBlur={() => saveItem(items.find((row) => row.id === item.id) || item)} />
                <Input className="md:col-span-2 h-9" type="number" min={0} value={item.costo_unitario} onChange={(e) => patchItem(item.id, { costo_unitario: Number(e.target.value) })} onBlur={() => saveItem(items.find((row) => row.id === item.id) || item)} />
                <div className="md:col-span-2 h-9 flex items-center px-3 rounded-md bg-muted/40 text-sm font-medium">{formatPrice(previsto, moneda)}</div>
                <Input className="md:col-span-1 h-9" type="number" min={0} placeholder="Real" value={item.costo_real ?? ""} onChange={(e) => patchItem(item.id, { costo_real: e.target.value === "" ? null : Number(e.target.value) })} onBlur={() => saveItem(items.find((row) => row.id === item.id) || item)} />
                <Button className="md:col-span-1 h-9" variant="ghost" size="icon" onClick={() => deleteItem(item.id)} title="Eliminar"><Trash2 className="w-4 h-4 text-destructive" /></Button>
              </div>
            );
          })}
          <div className="flex justify-between gap-3 border-t pt-3 text-sm">
            <span className="text-muted-foreground">Costo real cargado</span>
            <Badge variant="outline">{formatPrice(summary.costoReal, moneda)}</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-md border bg-card/50 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`font-heading font-bold mt-1 ${accent ? "text-primary" : ""}`}>{value}</div>
    </div>
  );
}
