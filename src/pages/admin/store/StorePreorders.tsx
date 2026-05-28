import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search } from "lucide-react";

interface Preorder {
  id: string;
  alumno_id: string;
  product_id: string;
  cantidad: number;
  variante: any;
  producto_nombre: string;
  precio_unitario: number;
  moneda: string;
  sena_monto: number;
  precio_total: number;
  saldo_pendiente: number;
  estado: string;
  estado_pago_sena: string;
  forma_pago_sena: string | null;
  notas: string | null;
  created_at: string;
}

const ESTADOS = [
  "pendiente_pago_sena",
  "reservada",
  "en_produccion",
  "lista_para_retirar",
  "entregada",
  "cancelada",
  "vencida",
];
const ESTADOS_PAGO = ["pendiente", "pendiente_verificacion", "confirmada", "rechazada"];

const estadoColor = (e: string) => {
  switch (e) {
    case "reservada": return "bg-cyan/20 text-cyan";
    case "en_produccion": return "bg-primary/20 text-primary";
    case "lista_para_retirar": return "bg-gold-dark/20 text-gold";
    case "entregada": return "bg-green-500/20 text-green-400";
    case "cancelada":
    case "vencida": return "bg-destructive/20 text-destructive";
    default: return "bg-muted text-muted-foreground";
  }
};

const StorePreorders = () => {
  const [rows, setRows] = useState<Preorder[]>([]);
  const [alumnosMap, setAlumnosMap] = useState<Record<string, string>>({});
  const [filterEstado, setFilterEstado] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const load = async () => {
    const { data } = await supabase
      .from("store_preorders" as any)
      .select("*")
      .order("created_at", { ascending: false });
    const list = (data as any[]) || [];
    setRows(list);
    if (list.length) {
      const ids = Array.from(new Set(list.map((r) => r.alumno_id)));
      const { data: alus } = await supabase.from("alumnos").select("id, nombre, apellido").in("id", ids);
      const map: Record<string, string> = {};
      (alus || []).forEach((a: any) => { map[a.id] = `${a.nombre || ""} ${a.apellido || ""}`.trim(); });
      setAlumnosMap(map);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = rows.filter((r) => {
    if (filterEstado !== "all" && r.estado !== filterEstado) return false;
    if (search) {
      const s = search.toLowerCase();
      const al = (alumnosMap[r.alumno_id] || "").toLowerCase();
      if (!r.producto_nombre.toLowerCase().includes(s) && !al.includes(s)) return false;
    }
    return true;
  });

  const updateField = async (id: string, patch: Partial<Preorder>) => {
    const { error } = await supabase.from("store_preorders" as any).update(patch as any).eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Actualizado" });
    load();
  };

  const confirmarSena = (r: Preorder) =>
    updateField(r.id, { estado_pago_sena: "confirmada", estado: r.estado === "pendiente_pago_sena" ? "reservada" : r.estado } as any);

  const rechazarSena = (r: Preorder) =>
    updateField(r.id, { estado_pago_sena: "rechazada" } as any);

  if (loading) return <div className="animate-pulse text-muted-foreground">Cargando preventas...</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h1 className="text-2xl font-heading font-bold">Preventas</h1>
        <div className="text-xs text-muted-foreground">{filtered.length} reservas</div>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar por alumno o producto..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={filterEstado} onValueChange={setFilterEstado}>
          <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            {ESTADOS.map((e) => <SelectItem key={e} value={e}>{e.replace(/_/g, " ")}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="px-3 py-3 text-left text-xs font-heading uppercase">Fecha</th>
              <th className="px-3 py-3 text-left text-xs font-heading uppercase">Alumno</th>
              <th className="px-3 py-3 text-left text-xs font-heading uppercase">Producto</th>
              <th className="px-3 py-3 text-center text-xs font-heading uppercase">Cant.</th>
              <th className="px-3 py-3 text-left text-xs font-heading uppercase hidden md:table-cell">Variante</th>
              <th className="px-3 py-3 text-right text-xs font-heading uppercase">Total</th>
              <th className="px-3 py-3 text-right text-xs font-heading uppercase">Seña</th>
              <th className="px-3 py-3 text-center text-xs font-heading uppercase">Pago seña</th>
              <th className="px-3 py-3 text-center text-xs font-heading uppercase">Estado</th>
              <th className="px-3 py-3 text-right text-xs font-heading uppercase">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((r) => (
              <tr key={r.id} className="hover:bg-muted/30">
                <td className="px-3 py-2 text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString("es-AR")}</td>
                <td className="px-3 py-2">{alumnosMap[r.alumno_id] || "—"}</td>
                <td className="px-3 py-2 font-medium">{r.producto_nombre}</td>
                <td className="px-3 py-2 text-center">{r.cantidad}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground hidden md:table-cell">
                  {r.variante && Object.keys(r.variante).length
                    ? Object.entries(r.variante).map(([k, v]) => `${k}: ${v}`).join(" · ")
                    : "—"}
                </td>
                <td className="px-3 py-2 text-right font-heading">{r.moneda} {Number(r.precio_total).toLocaleString("es-AR")}</td>
                <td className="px-3 py-2 text-right">
                  <div className="font-heading">{r.moneda} {Number(r.sena_monto).toLocaleString("es-AR")}</div>
                  <div className="text-[10px] text-muted-foreground">{r.forma_pago_sena || "—"}</div>
                </td>
                <td className="px-3 py-2 text-center">
                  <Select value={r.estado_pago_sena} onValueChange={(v) => updateField(r.id, { estado_pago_sena: v } as any)}>
                    <SelectTrigger className="h-7 text-xs w-[150px] mx-auto"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ESTADOS_PAGO.map((e) => <SelectItem key={e} value={e}>{e.replace(/_/g, " ")}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </td>
                <td className="px-3 py-2 text-center">
                  <Select value={r.estado} onValueChange={(v) => updateField(r.id, { estado: v } as any)}>
                    <SelectTrigger className={`h-7 text-xs w-[170px] mx-auto ${estadoColor(r.estado)}`}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ESTADOS.map((e) => <SelectItem key={e} value={e}>{e.replace(/_/g, " ")}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </td>
                <td className="px-3 py-2 text-right">
                  <div className="flex items-center justify-end gap-1">
                    {r.estado_pago_sena === "pendiente_verificacion" && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => confirmarSena(r)}>Confirmar seña</Button>
                        <Button size="sm" variant="ghost" onClick={() => rechazarSena(r)}>Rechazar</Button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <div className="p-8 text-center text-muted-foreground">No hay preventas.</div>}
      </div>
    </div>
  );
};

export default StorePreorders;
