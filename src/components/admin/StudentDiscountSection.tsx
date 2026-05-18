import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tag, Users2, Percent, Plus, Pencil, Trash2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";
import {
  isVigente,
  findConflictingExisting,
  getConflictScopes,
  aplicaLabel,
  type AplicaA,
} from "@/lib/discountConflicts";

type Alumno = Tables<"alumnos">;

interface DescuentoCatalogo {
  id: string;
  nombre: string;
  categoria: string;
  valor: number;
  tipo: string;
  aplica_a: AplicaA;
  activo: boolean;
}

interface DescuentoAlumnoRow {
  id: string;
  descuento_id: string;
  activo: boolean;
  nota: string | null;
  created_at: string;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  descuentos: {
    id: string;
    nombre: string;
    categoria: string;
    valor: number;
    tipo: string;
    aplica_a: AplicaA;
    vigencia_desde: string | null;
    vigencia_hasta: string | null;
  } | null;
}

interface FamilyGroup {
  id: string;
  nombre: string;
  miembros: { alumno_id: string; alumno_nombre: string; recibe_descuento: boolean }[];
}

const categoriaBadge: Record<string, { label: string; className: string }> = {
  familiar: { label: "Familiar", className: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  segunda_actividad: { label: "2ª actividad", className: "bg-purple-500/20 text-purple-400 border-purple-500/30" },
  referido: { label: "Referido", className: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
  beca: { label: "Beca", className: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
  general: { label: "General", className: "bg-muted text-muted-foreground border-border" },
};

const parseFechaLocal = (s: string | null) => {
  if (!s) return null;
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};
const formatDate = (d: string | null) => {
  const dt = parseFechaLocal(d);
  return dt
    ? dt.toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" })
    : "—";
};

interface Props {
  alumno: Alumno;
}

export function StudentDiscountSection({ alumno }: Props) {
  const [discounts, setDiscounts] = useState<DescuentoAlumnoRow[]>([]);
  const [catalogo, setCatalogo] = useState<DescuentoCatalogo[]>([]);
  const [familyGroup, setFamilyGroup] = useState<FamilyGroup | null>(null);
  const [loading, setLoading] = useState(true);

  // Add flow
  const todayStr = new Date().toISOString().slice(0, 10);
  const [addOpen, setAddOpen] = useState(false);
  const [pickedDescuentoId, setPickedDescuentoId] = useState<string>("");
  const [newFechaInicio, setNewFechaInicio] = useState(todayStr);
  const [newFechaFin, setNewFechaFin] = useState("");

  // Conflict confirm
  const [conflictDialog, setConflictDialog] = useState<{
    open: boolean;
    conflictingNames: string[];
    scope: string;
  }>({ open: false, conflictingNames: [], scope: "" });

  // Edit fechas
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFechaInicio, setEditFechaInicio] = useState("");
  const [editFechaFin, setEditFechaFin] = useState("");

  // Remove confirm
  const [removingId, setRemovingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [descRes, familyRes, catRes] = await Promise.all([
      supabase
        .from("descuentos_alumno" as any)
        .select(
          "id, descuento_id, activo, nota, created_at, fecha_inicio, fecha_fin, descuentos!inner(id, nombre, categoria, valor, tipo, aplica_a, vigencia_desde, vigencia_hasta)"
        )
        .eq("alumno_id", alumno.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("grupo_familiar_miembros" as any)
        .select("grupo_id, recibe_descuento, grupo_familiar!inner(id, nombre)")
        .eq("alumno_id", alumno.id),
      supabase
        .from("descuentos" as any)
        .select("id, nombre, categoria, valor, tipo, aplica_a, activo")
        .eq("activo", true)
        .order("nombre"),
    ]);

    setDiscounts((descRes.data as any) || []);
    setCatalogo((catRes.data as any) || []);

    const familyData = familyRes.data as any[];
    if (familyData && familyData.length > 0) {
      const grupoId = familyData[0].grupo_id;
      const grupoNombre = familyData[0].grupo_familiar?.nombre || "";
      const { data: miembrosData } = await supabase
        .from("grupo_familiar_miembros" as any)
        .select("alumno_id, recibe_descuento, alumnos!inner(nombre)")
        .eq("grupo_id", grupoId);
      setFamilyGroup({
        id: grupoId,
        nombre: grupoNombre,
        miembros: ((miembrosData as any[]) || []).map((m: any) => ({
          alumno_id: m.alumno_id,
          alumno_nombre: m.alumnos?.nombre || "—",
          recibe_descuento: m.recibe_descuento,
        })),
      });
    } else {
      setFamilyGroup(null);
    }

    setLoading(false);
  }, [alumno.id]);

  useEffect(() => {
    load();
  }, [load]);

  const vigentes = discounts.filter(
    (d) => d.descuentos && isVigente(d.fecha_inicio, d.fecha_fin, d.activo)
  );
  const inactivos = discounts.filter(
    (d) => d.descuentos && !isVigente(d.fecha_inicio, d.fecha_fin, d.activo)
  );

  const vigentesAsConflictItems = vigentes.map((d) => ({
    id: d.id,
    aplica_a: d.descuentos!.aplica_a,
    nombre: d.descuentos!.nombre,
  }));
  const conflictScopes = getConflictScopes(vigentesAsConflictItems);

  const resetAddForm = () => {
    setPickedDescuentoId("");
    setNewFechaInicio(todayStr);
    setNewFechaFin("");
  };

  // Catálogo filtrado: no listar los que ya están vigentes
  const vigentesIds = new Set(vigentes.map((d) => d.descuento_id));
  const catalogoDisponible = catalogo.filter((c) => !vigentesIds.has(c.id));

  const doInsert = async () => {
    const picked = catalogo.find((c) => c.id === pickedDescuentoId);
    if (!picked) return;
    const { data: userData } = await supabase.auth.getUser();

    // Si existe una asignación vieja (inactiva o vigente) reutilizar
    const existing = discounts.find((d) => d.descuento_id === pickedDescuentoId);
    if (existing) {
      const { error } = await supabase
        .from("descuentos_alumno" as any)
        .update({
          activo: true,
          fecha_inicio: newFechaInicio,
          fecha_fin: newFechaFin || null,
        } as any)
        .eq("id", existing.id);
      if (error) {
        toast.error("Error al asignar", { description: error.message });
        return;
      }
      toast.success("Descuento asignado");
    } else {
      const { error } = await supabase.from("descuentos_alumno" as any).insert({
        descuento_id: picked.id,
        alumno_id: alumno.id,
        asignado_por: userData.user?.id,
        fecha_inicio: newFechaInicio,
        fecha_fin: newFechaFin || null,
        activo: true,
      } as any);
      if (error) {
        toast.error("Error al asignar", { description: error.message });
        return;
      }
      toast.success("Descuento asignado");
    }
    setAddOpen(false);
    resetAddForm();
    await load();
  };

  const handleAdd = () => {
    const picked = catalogo.find((c) => c.id === pickedDescuentoId);
    if (!picked) {
      toast.error("Elegí un descuento");
      return;
    }
    if (!newFechaInicio) {
      toast.error("Fecha de inicio obligatoria");
      return;
    }
    // Chequeo de conflicto contra vigentes
    const conflicts = findConflictingExisting(picked.aplica_a, vigentesAsConflictItems);
    if (conflicts.length > 0) {
      setConflictDialog({
        open: true,
        conflictingNames: conflicts.map((c) => c.nombre || "—"),
        scope: aplicaLabel(picked.aplica_a),
      });
      return;
    }
    doInsert();
  };

  const startEdit = (row: DescuentoAlumnoRow) => {
    setEditingId(row.id);
    setEditFechaInicio(row.fecha_inicio || todayStr);
    setEditFechaFin(row.fecha_fin || "");
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const { error } = await supabase
      .from("descuentos_alumno" as any)
      .update({
        fecha_inicio: editFechaInicio,
        fecha_fin: editFechaFin || null,
      } as any)
      .eq("id", editingId);
    if (error) {
      toast.error("Error al actualizar", { description: error.message });
      return;
    }
    toast.success("Fechas actualizadas");
    setEditingId(null);
    await load();
  };

  const confirmRemove = async () => {
    if (!removingId) return;
    const today = new Date().toISOString().slice(0, 10);
    const { error } = await supabase
      .from("descuentos_alumno" as any)
      .update({ activo: false, fecha_fin: today } as any)
      .eq("id", removingId);
    if (error) {
      toast.error("Error al quitar", { description: error.message });
      return;
    }
    toast.success("Descuento removido");
    setRemovingId(null);
    await load();
  };

  if (loading) {
    return (
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Tag className="w-4 h-4" /> Descuentos
        </h3>
        <p className="text-xs text-muted-foreground">Cargando...</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 flex-wrap">
          <Tag className="w-4 h-4" /> Descuentos
          {vigentes.length > 0 && (
            <Badge
              variant="outline"
              className="text-[10px] bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
            >
              {vigentes.length} vigente{vigentes.length !== 1 ? "s" : ""}
            </Badge>
          )}
          {conflictScopes.length > 0 && (
            <Badge
              variant="outline"
              className="text-[10px] bg-amber-500/10 text-amber-400 border-amber-500/30 gap-1"
              title="Hay 2+ descuentos vigentes sobre el mismo ámbito. Se aplica el de mayor valor."
            >
              <AlertTriangle className="w-3 h-3" />
              Conflicto: {conflictScopes.map(aplicaLabel).join(", ")}
            </Badge>
          )}
        </h3>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs gap-1"
          onClick={() => {
            resetAddForm();
            setAddOpen(true);
          }}
        >
          <Plus className="w-3.5 h-3.5" /> Agregar
        </Button>
      </div>

      {conflictScopes.length > 0 && (
        <div className="text-[10px] text-amber-400/90 bg-amber-500/5 border border-amber-500/20 rounded-md px-2 py-1.5">
          Al cobrar se aplicará automáticamente solo el descuento de mayor valor por ámbito.
        </div>
      )}

      {vigentes.length === 0 && inactivos.length === 0 ? (
        <p className="text-xs text-muted-foreground">Sin descuentos asignados</p>
      ) : (
        <div className="space-y-2">
          {vigentes.map((d) => {
            const cat = categoriaBadge[d.descuentos!.categoria] || categoriaBadge.general;
            const isEditing = editingId === d.id;
            return (
              <div key={d.id} className="rounded-md bg-secondary/50 p-2.5 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                    <Badge variant="outline" className={`text-[10px] ${cat.className}`}>
                      {cat.label}
                    </Badge>
                    <span className="text-xs font-medium text-foreground truncate">
                      {d.descuentos!.nombre}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-xs font-mono text-primary font-semibold">
                      {d.descuentos!.tipo === "fijo"
                        ? `$${d.descuentos!.valor}`
                        : `${d.descuentos!.valor}%`}
                    </span>
                    {!isEditing && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => startEdit(d)}
                          title="Editar fechas"
                        >
                          <Pencil className="w-3 h-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-destructive"
                          onClick={() => setRemovingId(d.id)}
                          title="Quitar"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
                {!isEditing ? (
                  <div className="flex gap-3 text-[10px] text-muted-foreground">
                    <span>Aplica a: {aplicaLabel(d.descuentos!.aplica_a)}</span>
                    <span>Desde: {formatDate(d.fecha_inicio || d.created_at)}</span>
                    <span>Hasta: {d.fecha_fin ? formatDate(d.fecha_fin) : "sin vencimiento"}</span>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-muted-foreground">Desde</label>
                      <Input
                        type="date"
                        value={editFechaInicio}
                        onChange={(e) => setEditFechaInicio(e.target.value)}
                        className="h-7 text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground">Hasta (opcional)</label>
                      <Input
                        type="date"
                        value={editFechaFin}
                        onChange={(e) => setEditFechaFin(e.target.value)}
                        className="h-7 text-xs"
                      />
                    </div>
                    <div className="col-span-2 flex gap-2 justify-end">
                      <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>
                        Cancelar
                      </Button>
                      <Button size="sm" onClick={saveEdit}>
                        Guardar
                      </Button>
                    </div>
                  </div>
                )}
                {d.nota && (
                  <p className="text-[10px] text-muted-foreground italic">{d.nota}</p>
                )}
              </div>
            );
          })}

          {inactivos.length > 0 && (
            <div className="pt-1">
              <p className="text-[10px] text-muted-foreground mb-1">Inactivos / vencidos:</p>
              {inactivos.map((d) => (
                <div
                  key={d.id}
                  className="flex items-center justify-between text-[10px] text-muted-foreground opacity-60 py-0.5"
                >
                  <span>
                    {d.descuentos!.nombre}
                    {d.fecha_fin ? ` (hasta ${formatDate(d.fecha_fin)})` : ""}
                  </span>
                  <span>
                    {d.descuentos!.tipo === "fijo"
                      ? `$${d.descuentos!.valor}`
                      : `${d.descuentos!.valor}%`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Family group */}
      {familyGroup && (
        <div className="space-y-1.5 pt-1">
          <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <Users2 className="w-3.5 h-3.5" /> Grupo familiar: {familyGroup.nombre}
          </h4>
          <div className="space-y-0.5">
            {familyGroup.miembros.map((m) => (
              <div key={m.alumno_id} className="flex items-center justify-between text-[10px]">
                <span
                  className={
                    m.alumno_id === alumno.id
                      ? "text-foreground font-medium"
                      : "text-muted-foreground"
                  }
                >
                  {m.alumno_nombre} {m.alumno_id === alumno.id && "(este alumno)"}
                </span>
                {m.recibe_descuento && (
                  <Badge
                    variant="outline"
                    className="text-[9px] bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                  >
                    <Percent className="w-2.5 h-2.5 mr-0.5" /> Descuento
                  </Badge>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Dialog: agregar descuento */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Agregar descuento</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">Descuento</label>
              <Select value={pickedDescuentoId} onValueChange={setPickedDescuentoId}>
                <SelectTrigger>
                  <SelectValue placeholder="Elegí un descuento" />
                </SelectTrigger>
                <SelectContent>
                  {catalogoDisponible.length === 0 ? (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">
                      No hay descuentos disponibles
                    </div>
                  ) : (
                    catalogoDisponible.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nombre} —{" "}
                        {c.tipo === "fijo" ? `$${c.valor}` : `${c.valor}%`} ·{" "}
                        {aplicaLabel(c.aplica_a)}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">Fecha inicio</label>
                <Input
                  type="date"
                  value={newFechaInicio}
                  onChange={(e) => setNewFechaInicio(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Fecha fin (opcional)</label>
                <Input
                  type="date"
                  value={newFechaFin}
                  onChange={(e) => setNewFechaFin(e.target.value)}
                />
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Dejá la fecha fin vacía si el descuento no vence.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleAdd} disabled={!pickedDescuentoId}>
              Asignar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AlertDialog: conflict confirm */}
      <AlertDialog
        open={conflictDialog.open}
        onOpenChange={(o) => setConflictDialog((s) => ({ ...s, open: o }))}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              Ya tiene descuento sobre {conflictDialog.scope}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Este alumno ya tiene vigente:{" "}
              <span className="font-medium text-foreground">
                {conflictDialog.conflictingNames.join(", ")}
              </span>
              . Si agregás otro sobre el mismo ámbito, al cobrar se aplicará automáticamente
              solo el de mayor valor. ¿Querés agregarlo igual?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConflictDialog({ open: false, conflictingNames: [], scope: "" });
                doInsert();
              }}
            >
              Agregar igual
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* AlertDialog: remove confirm */}
      <AlertDialog open={!!removingId} onOpenChange={(o) => !o && setRemovingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Quitar este descuento?</AlertDialogTitle>
            <AlertDialogDescription>
              La asignación se marca como inactiva y se cierra hoy. Queda en el histórico.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRemove}>Quitar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
