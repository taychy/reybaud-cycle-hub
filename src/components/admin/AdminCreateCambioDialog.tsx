import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: () => void;
}

const MOTIVOS = ["talle", "color", "defecto", "otro"];

const AdminCreateCambioDialog = ({ open, onOpenChange, onCreated }: Props) => {
  const [alumnoQuery, setAlumnoQuery] = useState("");
  const [alumnos, setAlumnos] = useState<any[]>([]);
  const [alumnoId, setAlumnoId] = useState<string>("");
  const [productos, setProductos] = useState<any[]>([]);
  const [productoId, setProductoId] = useState<string>("");
  const [origen, setOrigen] = useState<"compra" | "preorder">("compra");
  const [motivo, setMotivo] = useState("talle");
  const [comentario, setComentario] = useState("");
  const [motivoAdmin, setMotivoAdmin] = useState("");
  const [varOrigen, setVarOrigen] = useState("");
  const [varDestino, setVarDestino] = useState("");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!open) return;
    setAlumnoQuery(""); setAlumnoId(""); setProductoId("");
    setMotivo("talle"); setComentario(""); setMotivoAdmin("");
    setVarOrigen(""); setVarDestino("");
    supabase.from("store_products").select("id, name").eq("status", "active").order("name").then(({ data }) => {
      setProductos(data || []);
    });
  }, [open]);

  useEffect(() => {
    if (alumnoQuery.length < 2) { setAlumnos([]); return; }
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from("alumnos")
        .select("id, nombre, apellido, email")
        .or(`nombre.ilike.%${alumnoQuery}%,apellido.ilike.%${alumnoQuery}%,email.ilike.%${alumnoQuery}%`)
        .limit(8);
      setAlumnos(data || []);
    }, 250);
    return () => clearTimeout(t);
  }, [alumnoQuery]);

  const parseVar = (s: string): Record<string, string> => {
    const out: Record<string, string> = {};
    s.split(",").map((p) => p.trim()).filter(Boolean).forEach((p) => {
      const [k, v] = p.split(":").map((x) => x?.trim());
      if (k && v) out[k] = v;
    });
    return out;
  };

  const submit = async () => {
    if (!alumnoId || !productoId || !motivoAdmin.trim()) {
      toast({ title: "Faltan datos", description: "Alumno, producto y motivo administrativo son obligatorios.", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await supabase.rpc("admin_create_cambio_indumentaria" as any, {
      p_alumno_id: alumnoId,
      p_producto_id: productoId,
      p_origen_tipo: origen,
      p_compra_id: null,
      p_preorder_id: null,
      p_variante_origen: parseVar(varOrigen),
      p_variante_destino: varDestino ? parseVar(varDestino) : null,
      p_motivo: motivo,
      p_comentario: comentario || null,
      p_motivo_admin: motivoAdmin,
    });
    setSaving(false);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Cambio creado en nombre del alumno" });
    onOpenChange(false);
    onCreated?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Crear cambio en nombre del alumno</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Buscar alumno</Label>
            <Input value={alumnoQuery} onChange={(e) => setAlumnoQuery(e.target.value)} placeholder="Nombre o email" />
            {alumnos.length > 0 && !alumnoId && (
              <div className="mt-1 border border-border rounded-md max-h-40 overflow-auto">
                {alumnos.map((a) => (
                  <button
                    key={a.id}
                    className="w-full text-left px-2 py-1 text-xs hover:bg-muted"
                    onClick={() => { setAlumnoId(a.id); setAlumnoQuery(`${a.nombre} ${a.apellido}`); setAlumnos([]); }}
                  >
                    {a.nombre} {a.apellido} · <span className="text-muted-foreground">{a.email}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <Label className="text-xs">Producto</Label>
            <Select value={productoId} onValueChange={setProductoId}>
              <SelectTrigger><SelectValue placeholder="Elegí producto" /></SelectTrigger>
              <SelectContent>{productos.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Origen</Label>
              <Select value={origen} onValueChange={(v) => setOrigen(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="compra">Compra</SelectItem>
                  <SelectItem value="preorder">Preventa</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Motivo</Label>
              <Select value={motivo} onValueChange={setMotivo}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{MOTIVOS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="text-xs">Variante original (formato: talle:M, color:rojo)</Label>
            <Input value={varOrigen} onChange={(e) => setVarOrigen(e.target.value)} placeholder="talle:M, color:rojo" />
          </div>
          <div>
            <Label className="text-xs">Variante destino (opcional si es devolución)</Label>
            <Input value={varDestino} onChange={(e) => setVarDestino(e.target.value)} placeholder="talle:L, color:rojo" />
          </div>

          <div>
            <Label className="text-xs">Comentario</Label>
            <Textarea value={comentario} onChange={(e) => setComentario(e.target.value)} rows={2} />
          </div>

          <div>
            <Label className="text-xs text-amber-400">Motivo administrativo (obligatorio)</Label>
            <Textarea
              value={motivoAdmin}
              onChange={(e) => setMotivoAdmin(e.target.value)}
              rows={2}
              placeholder="Ej: alumno presencial sin acceso a la app."
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Crear cambio"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AdminCreateCambioDialog;
