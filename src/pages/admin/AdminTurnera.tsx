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
import { Plus, Trash2, Calendar, Clock, Link as LinkIcon, Copy, X, CopyPlus, Ban, Settings } from "lucide-react";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import { ServicioConfigDialog } from "@/components/admin/ServicioConfigDialog";
import { DisponibilidadAjustadaManager } from "@/components/admin/DisponibilidadAjustadaManager";

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
  const [configServ, setConfigServ] = useState<any | null>(null);

  // Reserva manual (admin)
  const [showReservaForm, setShowReservaForm] = useState(false);
  const [alumnos, setAlumnos] = useState<any[]>([]);
  const [reservaForm, setReservaForm] = useState({
    servicio_id: "",
    coach_id: "",
    alumno_id: "",
    fecha: "",
    hora_inicio: "",
    hora_fin: "",
    sede_id: "",
    nombre: "",
    apellido: "",
    email: "",
    celular: "",
    documento: "",
    nota: "",
    precio: "",
    estado_economico: "pagado",
  });

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

  const fetchAlumnosForReserva = async () => {
    const { data } = await supabase
      .from("alumnos")
      .select("id, nombre, apellido, email, documento, celular")
      .eq("estado", "activo")
      .order("apellido");
    setAlumnos((data as any[]) || []);
  };

  const resetReservaForm = () => {
    setReservaForm({
      servicio_id: "",
      coach_id: "",
      alumno_id: "",
      fecha: "",
      hora_inicio: "",
      hora_fin: "",
      sede_id: "",
      nombre: "",
      apellido: "",
      email: "",
      celular: "",
      documento: "",
      nota: "",
      precio: "",
      estado_economico: "pagado",
    });
  };

  const computeHoraFin = (horaInicio: string, duracionMin: number) => {
    if (!horaInicio || !duracionMin) return "";
    const [h, m] = horaInicio.split(":").map(Number);
    const total = h * 60 + m + duracionMin;
    const hh = Math.floor(total / 60).toString().padStart(2, "0");
    const mm = (total % 60).toString().padStart(2, "0");
    return `${hh}:${mm}`;
  };

  const onReservaServicioChange = (servicioId: string) => {
    const serv = servicios.find((s) => s.id === servicioId);
    const horaFin = serv?.duracion_minutos && reservaForm.hora_inicio
      ? computeHoraFin(reservaForm.hora_inicio, Number(serv.duracion_minutos))
      : reservaForm.hora_fin;
    setReservaForm((p) => ({ ...p, servicio_id: servicioId, hora_fin: horaFin }));
  };

  const onReservaAlumnoChange = (alumnoId: string) => {
    const alum = alumnos.find((a) => a.id === alumnoId);
    setReservaForm((p) => ({
      ...p,
      alumno_id: alumnoId,
      nombre: alum?.nombre || p.nombre,
      apellido: alum?.apellido || p.apellido,
      email: alum?.email || p.email,
      documento: alum?.documento || p.documento,
      celular: alum?.celular || p.celular,
    }));
  };

  const addReserva = async () => {
    const { servicio_id, coach_id, fecha, hora_inicio, hora_fin, nombre, apellido, email } = reservaForm;
    if (!servicio_id || !coach_id || !fecha || !hora_inicio || !hora_fin || !nombre.trim() || !apellido.trim() || !email.trim()) {
      toast({ title: "Faltan datos obligatorios", description: "Completá servicio, coach, fecha, horario, nombre, apellido y email.", variant: "destructive" });
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      toast({ title: "Email inválido", description: "Revisá el formato del email.", variant: "destructive" });
      return;
    }
    const precio = reservaForm.precio ? Number(reservaForm.precio) : null;
    const insert: any = {
      servicio_id,
      coach_id,
      alumno_id: reservaForm.alumno_id || null,
      fecha,
      hora_inicio,
      hora_fin,
      sede_id: reservaForm.sede_id || null,
      nombre: nombre.trim(),
      apellido: apellido.trim(),
      email: email.trim(),
      celular: reservaForm.celular?.trim() || null,
      documento: reservaForm.documento?.trim() || null,
      nota: reservaForm.nota?.trim() || null,
      precio_snapshot: precio,
      moneda_snapshot: "ARS",
      estado_operativo: "reservada",
      estado_economico: reservaForm.estado_economico,
      pago_monto: reservaForm.estado_economico === "pagado" ? precio : null,
      origen_link: "admin",
      acepto_politica: true,
      form_responses: {},
    };
    const { error } = await supabase.from("reservas_turnera").insert(insert);
    if (error) {
      toast({ title: "Error al crear reserva", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Reserva creada" });
    setShowReservaForm(false);
    resetReservaForm();
    loadAll();
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
    if (estado_operativo === "cancelada") {
      supabase.functions.invoke("send-turnera-email", {
        body: { reservation_id: id, tipo: "cancelacion" },
      }).catch(() => {});
    }
    toast({ title: `Reserva marcada como ${estado_operativo}` });
    loadAll();
  };

  const coachName = (id: string) => coaches.find(c => c.id === id)?.nombre || "–";
  const servicioName = (id: string) => servicios.find(s => s.id === id)?.nombre || "–";
  const sedeName = (id: string) => sedes.find(s => s.id === id)?.nombre || "–";

  const baseUrl = "https://reybaud-app.com";

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
          <TabsTrigger value="ajustes">Ajustes</TabsTrigger>
          <TabsTrigger value="reservas">Reservas</TabsTrigger>
        </TabsList>

        <TabsContent value="servicios" className="space-y-4 mt-4">
          <Card className="bg-primary/10 border-primary/40">
            <CardContent className="p-4 space-y-2">
              <p className="text-sm font-medium text-foreground">Link público de turnera</p>
              <p className="text-xs text-muted-foreground">
                Compartí este único link. El alumno elige el servicio desde la página.
              </p>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 text-xs text-foreground bg-muted/60 rounded px-2 py-1.5 flex-1 min-w-0">
                  <LinkIcon className="w-3 h-3 shrink-0" />
                  <span className="font-mono truncate">{baseUrl}/reservar</span>
                </div>
                <Button
                  variant="default"
                  size="sm"
                  className="h-8 px-3 text-xs shrink-0"
                  onClick={() => {
                    navigator.clipboard.writeText(`${baseUrl}/reservar`);
                    toast({ title: "Link copiado al portapapeles" });
                  }}
                >
                  <Copy className="w-3 h-3 mr-1" /> Copiar
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">Servicios reservables.</p>
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
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => setConfigServ(s)} title="Configurar">
                      <Settings className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="text-destructive" onClick={() => deleteServicio(s.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="disponibilidad" className="space-y-4 mt-4">
          <DisponibilidadEditor
            coaches={coaches}
            servicios={servicios}
            sedes={sedes}
            disponibilidades={disponibilidades}
            reload={loadAll}
          />
        </TabsContent>

        <TabsContent value="ajustes" className="space-y-4 mt-4">
          <DisponibilidadAjustadaManager coaches={coaches} />
        </TabsContent>

        <TabsContent value="reservas" className="mt-4 space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">Reservas externas y manuales.</p>
            <Button
              size="sm"
              onClick={() => {
                fetchAlumnosForReserva();
                setShowReservaForm(true);
              }}
            >
              <Plus className="w-4 h-4 mr-2" /> Nueva reserva
            </Button>
          </div>

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

          <Dialog open={showReservaForm} onOpenChange={(o) => { if (!o) { setShowReservaForm(false); resetReservaForm(); } }}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Nueva reserva</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Servicio *</label>
                    <Select value={reservaForm.servicio_id} onValueChange={onReservaServicioChange}>
                      <SelectTrigger><SelectValue placeholder="Elegí servicio" /></SelectTrigger>
                      <SelectContent>{servicios.map(s => <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Coach *</label>
                    <Select value={reservaForm.coach_id} onValueChange={(v) => setReservaForm(p => ({ ...p, coach_id: v }))}>
                      <SelectTrigger><SelectValue placeholder="Elegí coach" /></SelectTrigger>
                      <SelectContent>{coaches.map(c => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Fecha *</label>
                    <Input type="date" value={reservaForm.fecha} onChange={e => setReservaForm(p => ({ ...p, fecha: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Inicio *</label>
                    <Input type="time" value={reservaForm.hora_inicio} onChange={e => {
                      const hi = e.target.value;
                      const serv = servicios.find(s => s.id === reservaForm.servicio_id);
                      const hf = serv?.duracion_minutos ? computeHoraFin(hi, Number(serv.duracion_minutos)) : reservaForm.hora_fin;
                      setReservaForm(p => ({ ...p, hora_inicio: hi, hora_fin: hf }));
                    }} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Fin *</label>
                    <Input type="time" value={reservaForm.hora_fin} onChange={e => setReservaForm(p => ({ ...p, hora_fin: e.target.value }))} />
                  </div>
                </div>

                {sedes.length > 0 && (
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Sede</label>
                    <Select value={reservaForm.sede_id || "__none__"} onValueChange={(v) => setReservaForm(p => ({ ...p, sede_id: v === "__none__" ? "" : v }))}>
                      <SelectTrigger><SelectValue placeholder="Elegí sede (opcional)" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Sin sede</SelectItem>
                        {sedes.map(s => <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Vincular a alumno existente</label>
                  <Select value={reservaForm.alumno_id || "__none__"} onValueChange={(v) => onReservaAlumnoChange(v === "__none__" ? "" : v)}>
                    <SelectTrigger><SelectValue placeholder="Opcional: buscar alumno" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Ninguno / invitado</SelectItem>
                      {alumnos.map(a => <SelectItem key={a.id} value={a.id}>{a.apellido}, {a.nombre} ({a.email || a.documento || "sin contacto"})</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input placeholder="Nombre *" value={reservaForm.nombre} onChange={e => setReservaForm(p => ({ ...p, nombre: e.target.value }))} />
                  <Input placeholder="Apellido *" value={reservaForm.apellido} onChange={e => setReservaForm(p => ({ ...p, apellido: e.target.value }))} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input placeholder="Email *" type="email" value={reservaForm.email} onChange={e => setReservaForm(p => ({ ...p, email: e.target.value }))} />
                  <Input placeholder="Celular" value={reservaForm.celular} onChange={e => setReservaForm(p => ({ ...p, celular: e.target.value }))} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input placeholder="DNI / CUIT" value={reservaForm.documento} onChange={e => setReservaForm(p => ({ ...p, documento: e.target.value }))} />
                  <Input placeholder="Precio ($)" type="number" value={reservaForm.precio} onChange={e => setReservaForm(p => ({ ...p, precio: e.target.value }))} />
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Estado de pago</label>
                  <Select value={reservaForm.estado_economico} onValueChange={(v) => setReservaForm(p => ({ ...p, estado_economico: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pagado">Pagado</SelectItem>
                      <SelectItem value="pendiente_revision">Pendiente de revisión</SelectItem>
                      <SelectItem value="pendiente_pago">Pendiente de pago</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Textarea placeholder="Nota (opcional)" value={reservaForm.nota} onChange={e => setReservaForm(p => ({ ...p, nota: e.target.value }))} />

                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => { setShowReservaForm(false); resetReservaForm(); }}>Cancelar</Button>
                  <Button onClick={addReserva}>Guardar reserva</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </TabsContent>
      </Tabs>

      {configServ && (
        <ServicioConfigDialog
          servicio={configServ}
          open={!!configServ}
          onOpenChange={(o) => !o && setConfigServ(null)}
          onSaved={loadAll}
        />
      )}
    </div>
  );
};

export default AdminTurnera;

// ============================================================
//  DisponibilidadEditor — UX estilo Google Calendar
// ============================================================
type DispEditorProps = {
  coaches: any[];
  servicios: any[];
  sedes: any[];
  disponibilidades: any[];
  reload: () => void;
};

const DIAS_CORTO = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

function DisponibilidadEditor({ coaches, servicios, sedes, disponibilidades, reload }: DispEditorProps) {
  const [coachId, setCoachId] = useState<string>("");
  const [servicioId, setServicioId] = useState<string>("");
  const [sedeId, setSedeId] = useState<string>("none");
  const [saving, setSaving] = useState(false);

  // Set defaults once data is available
  useEffect(() => {
    if (!coachId && coaches.length) setCoachId(coaches[0].id);
    if (!servicioId && servicios.length) setServicioId(servicios[0].id);
  }, [coaches, servicios]);

  const bloquesDelContexto = disponibilidades.filter(
    d => d.coach_id === coachId && d.servicio_id === servicioId && (sedeId === "none" ? !d.sede_id : d.sede_id === sedeId)
  );

  const porDia: Record<number, any[]> = {};
  for (let i = 0; i < 7; i++) porDia[i] = [];
  bloquesDelContexto.forEach(b => porDia[b.dia_semana]?.push(b));
  Object.values(porDia).forEach(arr => arr.sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio)));

  const refresh = async () => reload();

  const addRange = async (dia: number, hora_inicio = "09:00", hora_fin = "17:00") => {
    if (!coachId || !servicioId) {
      toast({ title: "Seleccioná coach y servicio primero", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("disponibilidad_coaches").insert({
      coach_id: coachId,
      servicio_id: servicioId,
      sede_id: sedeId === "none" ? null : sedeId,
      dia_semana: dia,
      hora_inicio,
      hora_fin,
    } as any);
    setSaving(false);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    refresh();
  };

  const removeRange = async (id: string) => {
    await supabase.from("disponibilidad_coaches").delete().eq("id", id);
    refresh();
  };

  const updateRange = async (id: string, patch: any) => {
    const { error } = await supabase.from("disponibilidad_coaches").update(patch).eq("id", id);
    if (error) toast({ title: "Error al guardar", description: error.message, variant: "destructive" });
    refresh();
  };

  const copyDayTo = async (sourceDay: number, targetDays: number[]) => {
    const source = porDia[sourceDay];
    if (!source.length) return;
    setSaving(true);
    for (const td of targetDays) {
      // Borrar lo existente del día destino
      const existing = porDia[td];
      for (const e of existing) await supabase.from("disponibilidad_coaches").delete().eq("id", e.id);
      // Insertar copia
      for (const s of source) {
        await supabase.from("disponibilidad_coaches").insert({
          coach_id: coachId,
          servicio_id: servicioId,
          sede_id: sedeId === "none" ? null : sedeId,
          dia_semana: td,
          hora_inicio: s.hora_inicio,
          hora_fin: s.hora_fin,
        } as any);
      }
    }
    setSaving(false);
    toast({ title: `Horarios copiados a ${targetDays.length} día(s)` });
    refresh();
  };

  const noContext = !coachId || !servicioId;

  return (
    <div className="space-y-4">
      {/* Selector de contexto */}
      <Card className="bg-card border-border">
        <CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Coach</label>
              <Select value={coachId} onValueChange={setCoachId}>
                <SelectTrigger><SelectValue placeholder="Elegí un coach" /></SelectTrigger>
                <SelectContent>{coaches.map(c => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Servicio</label>
              <Select value={servicioId} onValueChange={setServicioId}>
                <SelectTrigger><SelectValue placeholder="Elegí un servicio" /></SelectTrigger>
                <SelectContent>{servicios.map(s => <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {sedes.length > 0 && (
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Sede (opcional)</label>
                <Select value={sedeId} onValueChange={setSedeId}>
                  <SelectTrigger><SelectValue placeholder="Sin sede" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Sin sede —</SelectItem>
                    {sedes.map(s => <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Definí los horarios disponibles para esta combinación. Cada fila es un día de la semana.
          </p>
        </CardContent>
      </Card>

      {/* Grilla semanal */}
      <Card className="bg-card border-border">
        <CardContent className={`p-0 ${noContext ? "opacity-50 pointer-events-none" : ""}`}>
          {DIAS.map((dia, idx) => {
            const rangos = porDia[idx] || [];
            const otros = [0, 1, 2, 3, 4, 5, 6].filter(d => d !== idx);
            

            return (
              <DayRow
                key={idx}
                dia={dia}
                idx={idx}
                rangos={rangos}
                otrosDias={otros}
                onAdd={() => addRange(idx)}
                onRemove={removeRange}
                onUpdate={updateRange}
                onCopyTo={(targets) => copyDayTo(idx, targets)}
                saving={saving}
              />
            );
          })}
        </CardContent>
      </Card>

      {noContext && (
        <p className="text-xs text-muted-foreground text-center">
          Elegí un coach y un servicio arriba para empezar a configurar la disponibilidad.
        </p>
      )}
    </div>
  );
}

// Fila de un día
function DayRow({
  dia, idx, rangos, otrosDias, onAdd, onRemove, onUpdate, onCopyTo, saving,
}: {
  dia: string; idx: number; rangos: any[]; otrosDias: number[];
  onAdd: () => void; onRemove: (id: string) => void;
  onUpdate: (id: string, patch: any) => void;
  onCopyTo: (targets: number[]) => void; saving: boolean;
}) {
  const [targets, setTargets] = useState<number[]>([]);
  const [copyOpen, setCopyOpen] = useState(false);

  const toggleTarget = (d: number) =>
    setTargets(t => t.includes(d) ? t.filter(x => x !== d) : [...t, d]);

  const applyCopy = () => {
    if (targets.length === 0) { setCopyOpen(false); return; }
    onCopyTo(targets);
    setTargets([]);
    setCopyOpen(false);
  };

  return (
    <div className="flex items-start gap-3 px-4 py-3 border-b border-border last:border-0">
      <div className="w-10 pt-2 text-sm font-medium text-muted-foreground shrink-0">{DIAS_CORTO[idx]}</div>

      <div className="flex-1 space-y-2">
        {rangos.length === 0 ? (
          <div className="flex items-center gap-2 h-9">
            <Ban className="w-3.5 h-3.5 text-muted-foreground/60" />
            <span className="text-sm text-muted-foreground/80 italic">No disponible</span>
          </div>
        ) : (
          rangos.map(r => (
            <div key={r.id} className="flex items-center gap-2">
              <Input
                type="time"
                defaultValue={r.hora_inicio.slice(0, 5)}
                onBlur={e => {
                  const v = e.target.value + ":00";
                  if (v !== r.hora_inicio) onUpdate(r.id, { hora_inicio: v });
                }}
                className="h-9 w-[120px] font-mono text-sm"
              />
              <span className="text-muted-foreground text-sm">–</span>
              <Input
                type="time"
                defaultValue={r.hora_fin.slice(0, 5)}
                onBlur={e => {
                  const v = e.target.value + ":00";
                  if (v !== r.hora_fin) onUpdate(r.id, { hora_fin: v });
                }}
                className="h-9 w-[120px] font-mono text-sm"
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                onClick={() => onRemove(r.id)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          ))
        )}
      </div>

      <div className="flex items-center gap-1 shrink-0 pt-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onAdd}
          disabled={saving}
          title="Agregar rango"
        >
          <Plus className="w-4 h-4" />
        </Button>

        {rangos.length > 0 && (
          <DropdownMenu open={copyOpen} onOpenChange={setCopyOpen}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" title="Copiar a otros días">
                <CopyPlus className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel>Copiar a…</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {otrosDias.map(d => (
                <DropdownMenuCheckboxItem
                  key={d}
                  checked={targets.includes(d)}
                  onCheckedChange={() => toggleTarget(d)}
                  onSelect={(e) => e.preventDefault()}
                >
                  {DIAS[d]}
                </DropdownMenuCheckboxItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={applyCopy} disabled={targets.length === 0}>
                Aplicar a {targets.length} día(s)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}

