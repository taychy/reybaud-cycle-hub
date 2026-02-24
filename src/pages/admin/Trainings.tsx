import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Eye, EyeOff, Dumbbell } from "lucide-react";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";

type Entrenamiento = Tables<"entrenamientos">;
const GRUPOS = ["Todos", "G1", "G2", "G3", "G4"] as const;

const Trainings = () => {
  const [entrenamientos, setEntrenamientos] = useState<Entrenamiento[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterGrupo, setFilterGrupo] = useState("Todos");
  const [filterMonth, setFilterMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  const fetch = async () => {
    let query = supabase
      .from("entrenamientos")
      .select("*")
      .gte("fecha", `${filterMonth}-01`)
      .lte("fecha", `${filterMonth}-31`)
      .order("fecha")
      .order("grupo");

    if (filterGrupo !== "Todos") {
      query = query.eq("grupo", filterGrupo as any);
    }

    const { data } = await query;
    setEntrenamientos(data || []);
    setLoading(false);
  };

  useEffect(() => { fetch(); }, [filterGrupo, filterMonth]);

  const toggleVisible = async (ent: Entrenamiento) => {
    await supabase.from("entrenamientos").update({ visible: !ent.visible }).eq("id", ent.id);
    toast.success(ent.visible ? "Entrenamiento ocultado" : "Entrenamiento visible");
    fetch();
  };

  const tipoColor: Record<string, string> = {
    ruta: "bg-green-900/30 text-green-400",
    rodillo: "bg-blue-900/30 text-blue-400",
    gimnasio: "bg-orange-900/30 text-orange-400",
    tecnica: "bg-purple-900/30 text-purple-400",
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-heading font-bold uppercase tracking-wider text-foreground">
          Entrenamientos
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          {entrenamientos.length} entrenamientos en {filterMonth}
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <input
          type="month"
          value={filterMonth}
          onChange={(e) => setFilterMonth(e.target.value)}
          className="bg-secondary border border-border rounded-md px-3 py-1.5 text-sm text-foreground"
        />
        <Select value={filterGrupo} onValueChange={setFilterGrupo}>
          <SelectTrigger className="w-28 bg-secondary border-border">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {GRUPOS.map((g) => (
              <SelectItem key={g} value={g}>{g}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="glass-card rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="text-muted-foreground">Fecha</TableHead>
              <TableHead className="text-muted-foreground">Grupo</TableHead>
              <TableHead className="text-muted-foreground">Título</TableHead>
              <TableHead className="text-muted-foreground">Tipo</TableHead>
              <TableHead className="text-muted-foreground">Visible</TableHead>
              <TableHead className="text-muted-foreground text-right">Acción</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  Cargando...
                </TableCell>
              </TableRow>
            ) : entrenamientos.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8">
                  <Dumbbell className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
                  <p className="text-muted-foreground text-sm">No hay entrenamientos para este mes</p>
                </TableCell>
              </TableRow>
            ) : (
              entrenamientos.map((ent) => (
                <TableRow key={ent.id} className="border-border">
                  <TableCell className="text-foreground text-xs font-mono">{ent.fecha}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-xs font-mono">{ent.grupo}</Badge>
                  </TableCell>
                  <TableCell className="text-foreground text-sm">{ent.titulo}</TableCell>
                  <TableCell>
                    {ent.tipo && (
                      <span className={`text-xs px-2 py-0.5 rounded-full ${tipoColor[ent.tipo] || ""}`}>
                        {ent.tipo}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={ent.visible ? "default" : "outline"} className="text-xs">
                      {ent.visible ? "Sí" : "No"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => toggleVisible(ent)}>
                      {ent.visible ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default Trainings;
