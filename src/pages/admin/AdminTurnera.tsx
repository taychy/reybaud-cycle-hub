import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { Plus, Trash2, Calendar, Clock, Link as LinkIcon, Copy } from "lucide-react";

const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

const AdminTurnera = () => {
  const [tab, setTab] = useState("servicios");
  const [servicios, setServicios] = useState<any[]>([]);
  const [disponibilidades, setDisponibilidades] = useState<any[]>([]);
  const [reservas, setReservas] = useState<any[]>([]);
  const [coaches, setCoaches] = useState<any[]>([]);
  const [sedes, setSedes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Forms
  const [showServForm, setShowServForm] = useState(false);
  const [servForm, setServForm] = useState({ slug: "", nombre: "", descripcion: "", duracion_minutos: "60", precio: "", modalidad: "presencial", politica_cancelacion: "" });
  const [showDispForm, setShowDispForm] = useState(false);
  const [dispForm, setDispForm] = useState({ coach_id: "", servicio_id: "", dia_semana: "1", hora_inicio: "08:00", hora_fin: "12:00", sede_id: "" });

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);
    const [sRes, dRes, rRes, cRes, seRes] = await Promise.all([
      supabase.from("servicios_turnera").select("*").order("nombre"),
      supabase.from("disponibilidad_coaches").select("*").order("dia_semana"),
      supabase.from("reservas_turnera").select("*").order("fecha", { ascending: false }).limit(100),
      supabase.from("coaches").select("id, nombre").eq("estado", "activo"),
      supabase.from("sedes").select("id, nombre").eq("activa", true),
    ]);
    setServicios((sRes.data as any[]) || []);
    setDisponibilidades((dRes.data as any[]) || []);
    setReservas((rRes.data as any[]) || []);
    setCoaches((cRes.data as any[]) || []);
    setSedes((seRes.data as any[]) || []);
    setLoading(false);
  };

  const addServicio = async () => {
    if (!servForm.nombre || !servForm.slug) return;
    const { error } = await supabase.from("servicios_turnera").insert({
      slug: servForm.slug,
      nombre: servForm.nombre,
      descripcion: servForm.descripcion || null,
      duracion_minutos: Number(servForm.duracion_minutos),
      precio: servForm.precio ? Number(servForm.precio) : null,
      modalidad: servForm.modalidad,
      politica_cancelacion: servForm.politica_cancelacion || null,
    } as any);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Servicio creado" });
    setShowServForm(false);
    setServForm({ slug: "", nombre: "", descripcion: "", duracion_minutos: "60", precio: "", modalidad: "presencial", politica_cancelacion: "" });
    loadAll();
  };

  const deleteServicio = async (id: string) => {
    if (!confirm("¿Eliminar este servicio? Si tiene reservas, se desactivará en lugar de borrarse.")) return;
    const { error } = await supabase.from("servicios_turnera").delete().eq("id", id);
    if (error) {
      // Probablemente FK por reservas existentes → soft delete
      const { error: e2 } = await supabase.from("servicios_turnera").update({ activo: false } as any).eq("id", id);
      if (e2) {
        toast({ title: "No se pudo eliminar", description: error.message, variant: "destructive" });
        return;
      }
      toast({ title: "Servicio desactivado", description: "Tenía reservas asociadas, se ocultó en vez de borrarse." });
    } else {
      toast({ title: "Servicio eliminado" });
    }
    loadAll();
  };

  const addDisponibilidad = async () => {
    if (!dispForm.coach_id || !dispForm.servicio_id) return;
    const { error } = await supabase.from("disponibilidad_coaches").insert({
      coach_id: dispForm.coach_id,
      servicio_id: dispForm.servicio_id,
      dia_semana: Number(dispForm.dia_semana),
      hora_inicio: dispForm.hora_inicio,
      hora_fin: dispForm.hora_fin,
      sede_id: dispForm.sede_id || null,
    } as any);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Disponibilidad creada" });
    setShowDispForm(false);
    loadAll();
  };

  const deleteDisponibilidad = async (id: string) => {
    await supabase.from("disponibilidad_coaches").delete().eq("id", id);
    loadAll();
  };

  const updateReservaEstado = async (id: string, estado_operativo: string) => {
    await supabase.from("reservas_turnera").update({ estado_operativo } as any).eq("id", id);
    toast({ title: `Reserva marcada como ${estado_operativo}` });
    loadAll();
  };

  const coachName = (id: string) => coaches.find(c => c.id === id)?.nombre || "–";
  const servicioName = (id: string) => servicios.find(s => s.id === id)?.nombre || "–";
  const sedeName = (id: string) => sedes.find(s => s.id === id)?.nombre || "–";

  const baseUrl = window.location.origin;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold text-foreground">Turnera</h1>
        <p className="text-sm text-muted-foreground">Servicios, disponibilidad y reservas externas</p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="servicios">Servicios</TabsTrigger>
          <TabsTrigger value="disponibilidad">Disponibilidad</TabsTrigger>
          <TabsTrigger value="reservas">Reservas</TabsTrigger>
        </TabsList>

        <TabsContent value="servicios" className="space-y-4 mt-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">Servicios reservables por link externo.</p>
            <Button size="sm" onClick={() => setShowServForm(true)}><Plus className="w-4 h-4 mr-2" /> Nuevo servicio</Button>
          </div>

          <Dialog open={showServForm} onOpenChange={setShowServForm}>
            <DialogContent>
              <DialogHeader><DialogTitle>Nuevo servicio</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <Input placeholder="Nombre (ej: Clase evaluatoria)" value={servForm.nombre} onChange={e => setServForm({ ...servForm, nombre: e.target.value })} />
                <Input placeholder="Slug (ej: evaluatoria)" value={servForm.slug} onChange={e => setServForm({ ...servForm, slug: e.target.value })} />
                <Textarea placeholder="Descripción" value={servForm.descripcion} onChange={e => setServForm({ ...servForm, descripcion: e.target.value })} />
                <div className="grid grid-cols-2 gap-3">
                  <Input type="number" placeholder="Duración (min)" value={servForm.duracion_minutos} onChange={e => setServForm({ ...servForm, duracion_minutos: e.target.value })} />
                  <Input type="number" placeholder="Precio ($)" value={servForm.precio} onChange={e => setServForm({ ...servForm, precio: e.target.value })} />
                </div>
                <Textarea placeholder="Política de cancelación" value={servForm.politica_cancelacion} onChange={e => setServForm({ ...servForm, politica_cancelacion: e.target.value })} />
                <Button onClick={addServicio} className="w-full">Guardar</Button>
              </div>
            </DialogContent>
          </Dialog>

          {servicios.map(s => (
            <Card key={s.id} className="bg-card border-border">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-foreground">{s.nombre}</p>
                    <p className="text-xs text-muted-foreground">{s.descripcion || "Sin descripción"}</p>
                    <div className="flex gap-2 mt-2">
                      <Badge variant="secondary" className="text-xs">{s.duracion_minutos} min</Badge>
                      {s.precio && <Badge variant="outline" className="text-xs">${Number(s.precio).toLocaleString("es-AR")}</Badge>}
                      <Badge variant="outline" className="text-xs">{s.modalidad}</Badge>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground bg-muted/40 rounded px-2 py-1 flex-1 min-w-0">
                        <LinkIcon className="w-3 h-3 shrink-0" />
                        <span className="font-mono truncate">{baseUrl}/reservar/{s.slug}</span>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-xs shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigator.clipboard.writeText(`${baseUrl}/reservar/${s.slug}`);
                          toast({ title: "Link copiado al portapapeles" });
                        }}
                      >
                        <Copy className="w-3 h-3 mr-1" /> Copiar link
                      </Button>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" className="text-destructive" onClick={() => deleteServicio(s.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="disponibilidad" className="space-y-4 mt-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">Bloques horarios por coach. Determina la asignación automática.</p>
            <Button size="sm" onClick={() => setShowDispForm(true)}><Plus className="w-4 h-4 mr-2" /> Nuevo bloque</Button>
          </div>

          <Dialog open={showDispForm} onOpenChange={setShowDispForm}>
            <DialogContent>
              <DialogHeader><DialogTitle>Nuevo bloque de disponibilidad</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <Select value={dispForm.coach_id} onValueChange={v => setDispForm({ ...dispForm, coach_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Coach" /></SelectTrigger>
                  <SelectContent>{coaches.map(c => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={dispForm.servicio_id} onValueChange={v => setDispForm({ ...dispForm, servicio_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Servicio" /></SelectTrigger>
                  <SelectContent>{servicios.map(s => <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={dispForm.dia_semana} onValueChange={v => setDispForm({ ...dispForm, dia_semana: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{DIAS.map((d, i) => <SelectItem key={i} value={String(i)}>{d}</SelectItem>)}</SelectContent>
                </Select>
                <div className="grid grid-cols-2 gap-3">
                  <Input type="time" value={dispForm.hora_inicio} onChange={e => setDispForm({ ...dispForm, hora_inicio: e.target.value })} />
                  <Input type="time" value={dispForm.hora_fin} onChange={e => setDispForm({ ...dispForm, hora_fin: e.target.value })} />
                </div>
                {sedes.length > 0 && (
                  <Select value={dispForm.sede_id} onValueChange={v => setDispForm({ ...dispForm, sede_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Sede (opcional)" /></SelectTrigger>
                    <SelectContent>{sedes.map(s => <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>)}</SelectContent>
                  </Select>
                )}
                <Button onClick={addDisponibilidad} className="w-full">Guardar</Button>
              </div>
            </DialogContent>
          </Dialog>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Coach</TableHead>
                <TableHead>Servicio</TableHead>
                <TableHead>Día</TableHead>
                <TableHead>Horario</TableHead>
                <TableHead>Sede</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {disponibilidades.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Sin bloques configurados.</TableCell></TableRow>
              ) : (
                disponibilidades.map(d => (
                  <TableRow key={d.id}>
                    <TableCell className="text-sm">{coachName(d.coach_id)}</TableCell>
                    <TableCell className="text-sm">{servicioName(d.servicio_id)}</TableCell>
                    <TableCell><Badge variant="secondary" className="text-xs">{DIAS[d.dia_semana]}</Badge></TableCell>
                    <TableCell className="text-xs font-mono">{d.hora_inicio} – {d.hora_fin}</TableCell>
                    <TableCell className="text-xs">{d.sede_id ? sedeName(d.sede_id) : "–"}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="text-destructive" onClick={() => deleteDisponibilidad(d.id)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TabsContent>

        <TabsContent value="reservas" className="mt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Hora</TableHead>
                <TableHead>Servicio</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead>Contacto</TableHead>
                <TableHead>DNI</TableHead>
                <TableHead>Nota</TableHead>
                <TableHead>Coach</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reservas.length === 0 ? (
                <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground">Sin reservas.</TableCell></TableRow>
              ) : (
                reservas.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs font-mono">{r.fecha}</TableCell>
                    <TableCell className="text-xs font-mono">{r.hora_inicio}</TableCell>
                    <TableCell className="text-xs">{servicioName(r.servicio_id)}</TableCell>
                    <TableCell className="text-sm">{r.nombre} {r.apellido}</TableCell>
                    <TableCell className="text-xs">
                      <div className="flex flex-col gap-0.5">
                        {r.email && <span className="text-foreground break-all">{r.email}</span>}
                        {r.celular && <span className="text-muted-foreground font-mono">{r.celular}</span>}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs font-mono">{r.documento || "–"}</TableCell>
                    <TableCell className="text-xs max-w-[200px]">
                      {r.nota ? <span className="text-muted-foreground line-clamp-2" title={r.nota}>{r.nota}</span> : "–"}
                    </TableCell>
                    <TableCell className="text-sm">{coachName(r.coach_id)}</TableCell>
                    <TableCell><Badge variant="outline" className="text-xs capitalize">{r.estado_operativo}</Badge></TableCell>
                    <TableCell>
                      <Select onValueChange={(v) => updateReservaEstado(r.id, v)}>
                        <SelectTrigger className="w-[130px] h-7 text-xs"><SelectValue placeholder="Cambiar" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="reservada">Reservada</SelectItem>
                          <SelectItem value="realizada">Realizada</SelectItem>
                          <SelectItem value="cancelada_por_alumno">Canc. alumno</SelectItem>
                          <SelectItem value="cancelada_por_admin">Canc. admin</SelectItem>
                          <SelectItem value="ausente_alumno">Ausente</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminTurnera;
