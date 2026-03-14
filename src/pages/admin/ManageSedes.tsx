import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, MapPin, Pencil } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface Sede {
  id: string;
  nombre: string;
  direccion: string | null;
  ciudad: string | null;
  provincia: string | null;
  activa: boolean;
}

const ManageSedes = () => {
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSede, setEditingSede] = useState<Sede | null>(null);
  const [form, setForm] = useState({ nombre: "", direccion: "", ciudad: "", provincia: "" });

  const fetchSedes = async () => {
    const { data } = await supabase.from("sedes").select("*").order("nombre");
    setSedes((data as any[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchSedes(); }, []);

  const openCreate = () => {
    setEditingSede(null);
    setForm({ nombre: "", direccion: "", ciudad: "", provincia: "" });
    setDialogOpen(true);
  };

  const openEdit = (sede: Sede) => {
    setEditingSede(sede);
    setForm({
      nombre: sede.nombre,
      direccion: sede.direccion || "",
      ciudad: sede.ciudad || "",
      provincia: sede.provincia || "",
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.nombre.trim()) {
      toast({ title: "El nombre es obligatorio", variant: "destructive" });
      return;
    }

    const payload = {
      nombre: form.nombre.trim(),
      direccion: form.direccion.trim() || null,
      ciudad: form.ciudad.trim() || null,
      provincia: form.provincia.trim() || null,
    };

    if (editingSede) {
      const { error } = await supabase.from("sedes").update(payload as any).eq("id", editingSede.id);
      if (error) { toast({ title: "Error al actualizar", variant: "destructive" }); return; }
      toast({ title: "Sede actualizada" });
    } else {
      const { error } = await supabase.from("sedes").insert(payload as any);
      if (error) { toast({ title: "Error al crear", variant: "destructive" }); return; }
      toast({ title: "Sede creada" });
    }

    setDialogOpen(false);
    fetchSedes();
  };

  const toggleActive = async (sede: Sede) => {
    await supabase.from("sedes").update({ activa: !sede.activa } as any).eq("id", sede.id);
    fetchSedes();
  };

  if (loading) return <div className="animate-pulse text-muted-foreground p-8">Cargando sedes...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold uppercase tracking-wider">Sedes</h1>
          <p className="text-sm text-muted-foreground">Gestión de ubicaciones</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="gold" onClick={openCreate}>
              <Plus className="w-4 h-4" /> Nueva sede
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingSede ? "Editar sede" : "Nueva sede"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Nombre *</label>
                <Input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Ej: Sede Norte" />
              </div>
              <div>
                <label className="text-sm font-medium">Dirección</label>
                <Input value={form.direccion} onChange={(e) => setForm({ ...form, direccion: e.target.value })} placeholder="Dirección completa" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">Ciudad</label>
                  <Input value={form.ciudad} onChange={(e) => setForm({ ...form, ciudad: e.target.value })} />
                </div>
                <div>
                  <label className="text-sm font-medium">Provincia</label>
                  <Input value={form.provincia} onChange={(e) => setForm({ ...form, provincia: e.target.value })} />
                </div>
              </div>
              <Button variant="gold" className="w-full" onClick={handleSave}>
                {editingSede ? "Guardar cambios" : "Crear sede"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sede</TableHead>
                <TableHead>Ubicación</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sedes.map((sede) => (
                <TableRow key={sede.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-primary" />
                      <span className="font-medium">{sede.nombre}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {[sede.direccion, sede.ciudad, sede.provincia].filter(Boolean).join(", ") || "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={sede.activa ? "default" : "secondary"}>
                      {sede.activa ? "Activa" : "Inactiva"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(sede)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Switch checked={sede.activa} onCheckedChange={() => toggleActive(sede)} />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {sedes.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    No hay sedes registradas
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default ManageSedes;
