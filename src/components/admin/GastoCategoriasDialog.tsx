import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Loader2, Plus, Archive, Trash2, Check, X } from "lucide-react";
import type { GastoCategoria, GastoRegla, ReglaCampo } from "@/lib/gastoReglas";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const CAMPOS: { value: ReglaCampo; label: string }[] = [
  { value: "texto", label: "Descripción o proveedor" },
  { value: "descripcion", label: "Sólo descripción" },
  { value: "proveedor", label: "Sólo proveedor" },
];

/** Administración de categorías de gastos y reglas de categorización automática. */
export default function GastoCategoriasDialog({ open, onOpenChange }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [cats, setCats] = useState<(GastoCategoria & { usos?: number })[]>([]);
  const [reglas, setReglas] = useState<GastoRegla[]>([]);
  const [nuevo, setNuevo] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editNombre, setEditNombre] = useState("");
  const [tab, setTab] = useState<"categorias" | "reglas">("categorias");
  const [nuevaRegla, setNuevaRegla] = useState<{ patron: string; campo: ReglaCampo; categoria_id: string }>({
    patron: "",
    campo: "texto",
    categoria_id: "",
  });

  useEffect(() => {
    if (open) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function load() {
    setLoading(true);
    const [c, r, g] = await Promise.all([
      supabase.from("gasto_categorias" as any).select("id, nombre, activa, archivada_at, orden").order("orden").order("nombre"),
      supabase.from("gasto_reglas_categoria" as any).select("id, nombre, campo, patron, categoria_id, prioridad, activa, created_at").order("prioridad"),
      supabase.from("gastos").select("categoria_id"),
    ]);
    const usos = new Map<string, number>();
    for (const row of ((g.data as any[]) ?? [])) {
      if (row.categoria_id) usos.set(row.categoria_id, (usos.get(row.categoria_id) ?? 0) + 1);
    }
    setCats((((c.data as any[]) ?? []) as GastoCategoria[]).map((x) => ({ ...x, usos: usos.get(x.id) ?? 0 })));
    setReglas(((r.data as any[]) ?? []) as GastoRegla[]);
    setLoading(false);
  }

  async function crearCategoria() {
    const nombre = nuevo.trim();
    if (!nombre) return;
    const { error } = await supabase.from("gasto_categorias" as any).insert({ nombre } as any);
    if (error) {
      toast({ title: "No se pudo crear", description: error.message, variant: "destructive" });
      return;
    }
    setNuevo("");
    toast({ title: "Categoría creada" });
    load();
  }

  async function renombrar(id: string) {
    const nombre = editNombre.trim();
    if (!nombre) return;
    const { error } = await supabase.from("gasto_categorias" as any).update({ nombre } as any).eq("id", id);
    if (error) {
      toast({ title: "No se pudo renombrar", description: error.message, variant: "destructive" });
      return;
    }
    setEditId(null);
    toast({ title: "Categoría renombrada", description: "Los gastos existentes conservan su historia." });
    load();
  }

  async function toggleActiva(c: GastoCategoria) {
    const { error } = await supabase
      .from("gasto_categorias" as any)
      .update({ activa: !c.activa, archivada_at: c.activa ? new Date().toISOString() : null } as any)
      .eq("id", c.id);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else load();
  }

  async function eliminar(c: GastoCategoria & { usos?: number }) {
    const { data, error } = await supabase.rpc("eliminar_gasto_categoria" as any, { _categoria_id: c.id });
    if (error) {
      toast({ title: "No se pudo eliminar", description: error.message, variant: "destructive" });
      return;
    }
    toast({
      title: data === "eliminada" ? "Categoría eliminada" : "Categoría archivada",
      description:
        data === "eliminada"
          ? "Nunca se había usado."
          : "Tiene gastos asociados, así que se archivó para no perder la historia.",
    });
    load();
  }

  async function crearRegla() {
    if (!nuevaRegla.patron.trim() || !nuevaRegla.categoria_id) return;
    const cat = cats.find((c) => c.id === nuevaRegla.categoria_id);
    const { error } = await supabase.from("gasto_reglas_categoria" as any).insert({
      nombre: `${nuevaRegla.patron.trim()} → ${cat?.nombre ?? ""}`,
      campo: nuevaRegla.campo,
      patron: nuevaRegla.patron.trim(),
      categoria_id: nuevaRegla.categoria_id,
      prioridad: 50,
    } as any);
    if (error) {
      toast({ title: "No se pudo crear la regla", description: error.message, variant: "destructive" });
      return;
    }
    setNuevaRegla({ patron: "", campo: "texto", categoria_id: "" });
    toast({ title: "Regla creada", description: "Se aplicará a los próximos gastos, no a los ya corregidos a mano." });
    load();
  }

  async function toggleRegla(r: GastoRegla) {
    const { error } = await supabase.from("gasto_reglas_categoria" as any).update({ activa: !r.activa } as any).eq("id", r.id);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else load();
  }

  async function borrarRegla(r: GastoRegla) {
    const { error } = await supabase.from("gasto_reglas_categoria" as any).delete().eq("id", r.id);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else load();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Categorías de gastos</DialogTitle>
          <DialogDescription>
            Definí las categorías y las reglas que las asignan solas cuando entra un egreso.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2 border-b border-border">
          {(["categorias", "reglas"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-2 text-sm font-medium transition-colors ${
                tab === t ? "border-b-2 border-orange-500 text-orange-400" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t === "categorias" ? `Categorías (${cats.length})` : `Reglas automáticas (${reglas.length})`}
            </button>
          ))}
        </div>

        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <Loader2 className="w-4 h-4 animate-spin" /> Cargando…
          </div>
        )}

        {!loading && tab === "categorias" && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input
                placeholder="Nueva categoría"
                value={nuevo}
                onChange={(e) => setNuevo(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && crearCategoria()}
              />
              <Button onClick={crearCategoria} className="gap-1 shrink-0">
                <Plus className="w-4 h-4" /> Agregar
              </Button>
            </div>

            <div className="space-y-1.5">
              {cats.map((c) => (
                <div key={c.id} className="flex items-center gap-2 rounded-md border border-border p-2">
                  {editId === c.id ? (
                    <>
                      <Input value={editNombre} onChange={(e) => setEditNombre(e.target.value)} className="h-8" />
                      <Button size="sm" variant="ghost" onClick={() => renombrar(c.id)}>
                        <Check className="w-4 h-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditId(null)}>
                        <X className="w-4 h-4" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <button
                        className="text-sm text-left flex-1 hover:underline"
                        onClick={() => {
                          setEditId(c.id);
                          setEditNombre(c.nombre);
                        }}
                      >
                        {c.nombre}
                      </button>
                      <Badge variant="outline" className="text-[10px]">
                        {c.usos} gastos
                      </Badge>
                      {!c.activa && (
                        <Badge variant="outline" className="text-[10px] border-muted-foreground/40">
                          Archivada
                        </Badge>
                      )}
                      <Switch checked={c.activa} onCheckedChange={() => toggleActiva(c)} />
                      <Button
                        size="sm"
                        variant="ghost"
                        title={c.usos ? "Tiene gastos: se archiva" : "Nunca usada: se elimina"}
                        onClick={() => eliminar(c)}
                      >
                        {c.usos ? <Archive className="w-4 h-4" /> : <Trash2 className="w-4 h-4 text-destructive" />}
                      </Button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {!loading && tab === "reglas" && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-2 items-end">
              <div>
                <Label className="text-xs">Texto a buscar</Label>
                <Input
                  placeholder="ej: DIESEL VP"
                  value={nuevaRegla.patron}
                  onChange={(e) => setNuevaRegla((r) => ({ ...r, patron: e.target.value }))}
                />
              </div>
              <div>
                <Label className="text-xs">Dónde</Label>
                <Select value={nuevaRegla.campo} onValueChange={(v) => setNuevaRegla((r) => ({ ...r, campo: v as ReglaCampo }))}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CAMPOS.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Categoría</Label>
                <Select
                  value={nuevaRegla.categoria_id}
                  onValueChange={(v) => setNuevaRegla((r) => ({ ...r, categoria_id: v }))}
                >
                  <SelectTrigger className="w-[190px]">
                    <SelectValue placeholder="Elegir" />
                  </SelectTrigger>
                  <SelectContent>
                    {cats
                      .filter((c) => c.activa)
                      .map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.nombre}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button size="sm" onClick={crearRegla} className="gap-1">
              <Plus className="w-4 h-4" /> Crear regla
            </Button>

            <div className="space-y-1.5">
              {reglas.length === 0 && (
                <div className="text-xs text-muted-foreground">
                  Todavía no hay reglas. Sin reglas, los egresos nuevos quedan en <b>Por categorizar</b>.
                </div>
              )}
              {reglas.map((r) => {
                const cat = cats.find((c) => c.id === r.categoria_id);
                return (
                  <div key={r.id} className="flex items-center gap-2 rounded-md border border-border p-2 text-sm">
                    <span className="font-mono text-xs bg-secondary px-1.5 py-0.5 rounded">{r.patron}</span>
                    <span className="text-muted-foreground text-xs">
                      {CAMPOS.find((c) => c.value === r.campo)?.label}
                    </span>
                    <span className="text-muted-foreground">→</span>
                    <span className="flex-1">{cat?.nombre ?? "—"}</span>
                    <Badge variant="outline" className="text-[10px]">
                      prioridad {r.prioridad}
                    </Badge>
                    <Switch checked={r.activa} onCheckedChange={() => toggleRegla(r)} />
                    <Button size="sm" variant="ghost" onClick={() => borrarRegla(r)}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                );
              })}
            </div>
            <div className="text-[11px] text-muted-foreground">
              Las reglas sólo se aplican a gastos nuevos o sin categoría. Un gasto corregido a mano nunca se vuelve a
              cambiar solo.
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
