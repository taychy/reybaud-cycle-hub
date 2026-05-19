import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Phone, Heart, Users, Plus, Trash2, AlertTriangle, UserPlus, Pencil } from "lucide-react";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";

type Alumno = Tables<"alumnos">;

const RELACIONES: { value: string; label: string }[] = [
  { value: "padre", label: "Padre" },
  { value: "madre", label: "Madre" },
  { value: "hijo", label: "Hijo/a" },
  { value: "hermano", label: "Hermano/a" },
  { value: "conyuge", label: "Cónyuge / Pareja" },
  { value: "padre_madre", label: "Padre/Madre" },
  { value: "otro", label: "Otro" },
];

const relLabel = (v: string) => RELACIONES.find((r) => r.value === v)?.label || v;

interface Familiar {
  id: string;
  alumno_id: string;
  familiar_alumno_id: string | null;
  familiar_externo_nombre: string | null;
  familiar_externo_telefono: string | null;
  relacion: string;
  notas: string | null;
  familiar_alumno?: { id: string; nombre: string; apellido: string | null; email: string } | null;
}

interface Props {
  alumno: Alumno;
}

export function StudentEmergencyFamilySection({ alumno: alumnoProp }: Props) {
  const [alumno, setAlumno] = useState<Alumno>(alumnoProp);
  useEffect(() => setAlumno(alumnoProp), [alumnoProp]);

  const [familiares, setFamiliares] = useState<Familiar[]>([]);
  const [loading, setLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [toDelete, setToDelete] = useState<Familiar | null>(null);
  const [editContactoOpen, setEditContactoOpen] = useState(false);
  const [editObraOpen, setEditObraOpen] = useState(false);

  // Add form
  const [tipo, setTipo] = useState<"alumno" | "externo">("alumno");
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<{ id: string; nombre: string; apellido: string | null; email: string }[]>([]);
  const [selectedAlumno, setSelectedAlumno] = useState<{ id: string; nombre: string; apellido: string | null } | null>(null);
  const [externoNombre, setExternoNombre] = useState("");
  const [externoTelefono, setExternoTelefono] = useState("");
  const [relacion, setRelacion] = useState("otro");
  const [notas, setNotas] = useState("");
  const [saving, setSaving] = useState(false);

  const refreshAlumno = useCallback(async () => {
    const { data } = await supabase.from("alumnos").select("*").eq("id", alumno.id).maybeSingle();
    if (data) setAlumno(data as Alumno);
  }, [alumno.id]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("alumno_familiares")
      .select("*, familiar_alumno:alumnos!alumno_familiares_familiar_alumno_id_fkey(id, nombre, apellido, email)")
      .eq("alumno_id", alumno.id)
      .order("created_at", { ascending: false });
    setFamiliares((data as any) || []);
    setLoading(false);
  }, [alumno.id]);

  useEffect(() => {
    load();
  }, [load]);

  // Search alumnos
  useEffect(() => {
    if (tipo !== "alumno" || search.length < 2) {
      setSearchResults([]);
      return;
    }
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from("alumnos")
        .select("id, nombre, apellido, email")
        .or(`nombre.ilike.%${search}%,apellido.ilike.%${search}%,email.ilike.%${search}%`)
        .neq("id", alumno.id)
        .limit(8);
      setSearchResults((data as any) || []);
    }, 250);
    return () => clearTimeout(t);
  }, [search, tipo, alumno.id]);

  const resetForm = () => {
    setTipo("alumno");
    setSearch("");
    setSearchResults([]);
    setSelectedAlumno(null);
    setExternoNombre("");
    setExternoTelefono("");
    setRelacion("otro");
    setNotas("");
  };

  const handleAdd = async () => {
    if (tipo === "alumno" && !selectedAlumno) {
      toast.error("Seleccioná un alumno");
      return;
    }
    if (tipo === "externo" && !externoNombre.trim()) {
      toast.error("Ingresá el nombre del familiar");
      return;
    }
    setSaving(true);
    const payload: any = {
      alumno_id: alumno.id,
      relacion,
      notas: notas.trim() || null,
    };
    if (tipo === "alumno") {
      payload.familiar_alumno_id = selectedAlumno!.id;
    } else {
      payload.familiar_externo_nombre = externoNombre.trim();
      payload.familiar_externo_telefono = externoTelefono.trim() || null;
    }
    const { error } = await supabase.from("alumno_familiares").insert(payload);
    setSaving(false);
    if (error) {
      toast.error(error.message.includes("uq_alumno_familiares_pair") ? "Ese alumno ya está vinculado" : error.message);
      return;
    }
    toast.success("Familiar agregado");
    resetForm();
    setAddOpen(false);
    load();
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    const { error } = await supabase.from("alumno_familiares").delete().eq("id", toDelete.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Vínculo eliminado");
    setToDelete(null);
    load();
  };

  // ========================================
  // RENDER
  // ========================================
  const hasContacto = !!alumno.contacto_emergencia_nombre;
  const hasObraSocial = !!alumno.obra_social_nombre;
  const datosIncompletos = !hasContacto || !hasObraSocial;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Emergencia, cobertura y familia</h3>
        {datosIncompletos && (
          <Badge variant="outline" className="text-amber-600 border-amber-600/40 text-[10px]">
            <AlertTriangle className="w-3 h-3 mr-1" />
            Datos incompletos
          </Badge>
        )}
      </div>

      {/* Contacto emergencia */}
      <div className="rounded-md border border-border p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
            <Phone className="w-3.5 h-3.5 text-primary" />
            Contacto de emergencia
          </div>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditContactoOpen(true)}>
            <Pencil className="w-3 h-3 mr-1" />
            {hasContacto ? "Editar" : "Cargar"}
          </Button>
        </div>
        {hasContacto ? (
          <div className="space-y-1.5 text-xs">
            <ContactoRow
              label="Contacto 1"
              nombre={alumno.contacto_emergencia_nombre}
              telefono={alumno.contacto_emergencia_telefono}
              relacion={alumno.contacto_emergencia_relacion}
            />
            {alumno.contacto_emergencia_nombre_2 && (
              <ContactoRow
                label="Contacto 2"
                nombre={alumno.contacto_emergencia_nombre_2}
                telefono={alumno.contacto_emergencia_telefono_2}
                relacion={alumno.contacto_emergencia_relacion_2}
              />
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic">El alumno aún no cargó su contacto de emergencia.</p>
        )}
      </div>

      {/* Obra social */}
      <div className="rounded-md border border-border p-3 space-y-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
          <Heart className="w-3.5 h-3.5 text-primary" />
          Cobertura médica
        </div>
        {hasObraSocial ? (
          <div className="text-xs space-y-0.5">
            <p className="font-medium text-foreground">{alumno.obra_social_nombre}</p>
            {alumno.obra_social_plan && <p className="text-muted-foreground">Plan: {alumno.obra_social_plan}</p>}
            {alumno.obra_social_numero_socio && (
              <p className="text-muted-foreground">N° socio: {alumno.obra_social_numero_socio}</p>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic">El alumno aún no cargó su obra social.</p>
        )}
      </div>

      {/* Familiares */}
      <div className="rounded-md border border-border p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
            <Users className="w-3.5 h-3.5 text-primary" />
            Familiares en la escuela
            {familiares.length > 0 && (
              <Badge variant="secondary" className="text-[10px] h-4">
                {familiares.length}
              </Badge>
            )}
          </div>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setAddOpen(true)}>
            <Plus className="w-3 h-3 mr-1" />
            Vincular
          </Button>
        </div>
        {loading ? (
          <p className="text-xs text-muted-foreground">Cargando…</p>
        ) : familiares.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">Sin familiares vinculados.</p>
        ) : (
          <div className="space-y-1.5">
            {familiares.map((f) => (
              <div key={f.id} className="flex items-start justify-between gap-2 bg-secondary/40 rounded p-2 text-xs">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-medium text-foreground">
                      {f.familiar_alumno
                        ? `${f.familiar_alumno.nombre} ${f.familiar_alumno.apellido || ""}`.trim()
                        : f.familiar_externo_nombre}
                    </span>
                    <Badge variant="outline" className="text-[10px] h-4">
                      {relLabel(f.relacion)}
                    </Badge>
                    {!f.familiar_alumno && (
                      <Badge variant="outline" className="text-[10px] h-4 text-muted-foreground">
                        Externo
                      </Badge>
                    )}
                  </div>
                  {f.familiar_alumno && (
                    <p className="text-muted-foreground text-[11px] mt-0.5">{f.familiar_alumno.email}</p>
                  )}
                  {!f.familiar_alumno && f.familiar_externo_telefono && (
                    <p className="text-muted-foreground text-[11px] mt-0.5">{f.familiar_externo_telefono}</p>
                  )}
                  {f.notas && <p className="text-muted-foreground text-[11px] mt-0.5 italic">{f.notas}</p>}
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 shrink-0"
                  onClick={() => setToDelete(f)}
                >
                  <Trash2 className="w-3 h-3 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add dialog */}
      <Dialog
        open={addOpen}
        onOpenChange={(o) => {
          setAddOpen(o);
          if (!o) resetForm();
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-4 h-4" />
              Vincular familiar
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={tipo === "alumno" ? "default" : "outline"}
                className="flex-1"
                onClick={() => setTipo("alumno")}
              >
                Alumno de la escuela
              </Button>
              <Button
                size="sm"
                variant={tipo === "externo" ? "default" : "outline"}
                className="flex-1"
                onClick={() => setTipo("externo")}
              >
                Externo
              </Button>
            </div>

            {tipo === "alumno" ? (
              <div className="space-y-2">
                <Label className="text-xs">Buscar alumno</Label>
                {selectedAlumno ? (
                  <div className="flex items-center justify-between bg-secondary/60 rounded p-2 text-xs">
                    <span className="font-medium">
                      {selectedAlumno.nombre} {selectedAlumno.apellido || ""}
                    </span>
                    <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setSelectedAlumno(null)}>
                      Cambiar
                    </Button>
                  </div>
                ) : (
                  <>
                    <Input
                      placeholder="Nombre, apellido o email…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                    {searchResults.length > 0 && (
                      <div className="border border-border rounded-md max-h-40 overflow-y-auto">
                        {searchResults.map((a) => (
                          <button
                            key={a.id}
                            type="button"
                            className="w-full text-left px-3 py-2 hover:bg-accent text-xs border-b border-border last:border-0"
                            onClick={() => {
                              setSelectedAlumno(a);
                              setSearch("");
                              setSearchResults([]);
                            }}
                          >
                            <span className="font-medium">
                              {a.nombre} {a.apellido || ""}
                            </span>
                            <span className="text-muted-foreground ml-2">{a.email}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <div>
                  <Label className="text-xs">Nombre</Label>
                  <Input value={externoNombre} onChange={(e) => setExternoNombre(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Teléfono (opcional)</Label>
                  <Input value={externoTelefono} onChange={(e) => setExternoTelefono(e.target.value)} />
                </div>
              </div>
            )}

            <div>
              <Label className="text-xs">Relación</Label>
              <Select value={relacion} onValueChange={setRelacion}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RELACIONES.filter((r) => r.value !== "padre_madre").map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs">Notas (opcional)</Label>
              <Input value={notas} onChange={(e) => setNotas(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleAdd} disabled={saving}>
              {saving ? "Guardando…" : "Vincular"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar vínculo familiar?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará el vínculo en ambos sentidos si el familiar es alumno de la escuela.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ContactoRow({
  label,
  nombre,
  telefono,
  relacion,
}: {
  label: string;
  nombre: string | null;
  telefono: string | null;
  relacion: string | null;
}) {
  return (
    <div className="bg-secondary/40 rounded p-2">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="font-medium text-foreground">{nombre}</p>
      <div className="flex gap-2 text-muted-foreground text-[11px]">
        {telefono && <span>{telefono}</span>}
        {relacion && <span>· {relacion}</span>}
      </div>
    </div>
  );
}
