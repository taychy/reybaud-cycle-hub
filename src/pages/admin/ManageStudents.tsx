import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, UserCheck, UserX, Edit2, Check, X, CalendarCheck, Trash2, Plus, Eye, MailPlus, Upload, Users, CreditCard } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import { ImportStudentsContent } from "./ImportStudents";

type Alumno = Tables<"alumnos">;
type Plan = Tables<"planes">;

interface SuscripcionConPlan {
  id: string;
  alumno_id: string;
  plan_id: string;
  estado: string;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  planes: { id: string; nombre: string; precio: number; moneda: string } | null;
}

const GRUPOS = ["G1", "G2", "G3", "G4", "Principiante", "Sin grupo"] as const;

const ManageStudents = () => {
  const [alumnos, setAlumnos] = useState<Alumno[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"todos" | "pendientes" | "activos" | "inactivos">("todos");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editGrupo, setEditGrupo] = useState<string>("");
  const [manualSubAlumno, setManualSubAlumno] = useState<Alumno | null>(null);
  const [manualFechaFin, setManualFechaFin] = useState("");
  const [savingManual, setSavingManual] = useState(false);
  const [deleteAlumno, setDeleteAlumno] = useState<Alumno | null>(null);
  const [detailAlumno, setDetailAlumno] = useState<Alumno | null>(null);

  // Create dialog
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ nombre: "", email: "", telefono: "", documento: "" });
  const [creating, setCreating] = useState(false);

  const isMobile = useIsMobile();

  const fetchAlumnos = async () => {
    const { data } = await supabase.from("alumnos").select("*").order("nombre");
    setAlumnos(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchAlumnos(); }, []);

  const handleCreateAlumno = async () => {
    if (!createForm.nombre.trim() || !createForm.email.trim()) {
      toast.error("Nombre y email son obligatorios");
      return;
    }
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke("invite-user", {
        body: {
          type: "alumno",
          nombre: createForm.nombre.trim(),
          email: createForm.email.trim(),
          telefono: createForm.telefono.trim() || null,
          documento: createForm.documento.trim() || null,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(data?.message || "Alumno creado e invitación enviada");
      setShowCreate(false);
      setCreateForm({ nombre: "", email: "", telefono: "", documento: "" });
      fetchAlumnos();
    } catch (err: any) {
      toast.error(err.message || "Error al crear alumno");
    } finally {
      setCreating(false);
    }
  };

  const [resending, setResending] = useState<string | null>(null);

  const handleResendInvite = async (alumno: Alumno) => {
    // Spam prevention: check last_invite_sent_at client-side
    const lastSent = (alumno as any).last_invite_sent_at;
    if (lastSent && Date.now() - new Date(lastSent).getTime() < 60_000) {
      toast.error("Esperá 1 minuto antes de reenviar la invitación");
      return;
    }
    setResending(alumno.id);
    try {
      const { data, error } = await supabase.functions.invoke("resend-invite", {
        body: { user_type: "alumno", email: alumno.email },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`Invitación reenviada a ${alumno.email}`);
      fetchAlumnos();
    } catch (err: any) {
      toast.error(err.message || "Error al reenviar invitación");
    } finally {
      setResending(null);
    }
  };

  const toggleEstado = async (alumno: Alumno) => {
    const newEstado = alumno.estado === "activo" ? "inactivo" : "activo";
    await supabase.from("alumnos").update({ estado: newEstado }).eq("id", alumno.id);
    toast.success(`${alumno.nombre} ahora está ${newEstado}`);
    fetchAlumnos();

    // Send email notification when enabling
    if (newEstado === "activo") {
      // Get current subscription end date
      const { data: subs } = await supabase.from("suscripciones").select("fecha_fin").eq("alumno_id", alumno.id).eq("estado", "activa").order("fecha_fin", { ascending: false }).limit(1);
      const fechaFin = subs?.[0]?.fecha_fin || null;
      supabase.functions.invoke("notify-student-update", {
        body: { alumno_id: alumno.id, type: "habilitado", fecha_vencimiento: fechaFin },
      }).catch(() => {});
    }
  };

  const saveGrupo = async (id: string) => {
    await supabase.from("alumnos").update({ grupo: editGrupo as any }).eq("id", id);
    setEditingId(null);
    // Update local state immediately so the UI reflects the change
    setAlumnos(prev => prev.map(a => a.id === id ? { ...a, grupo: editGrupo as any } : a));
    toast.success("Grupo actualizado");
    fetchAlumnos();

    // Send email notification for group assignment
    if (editGrupo && editGrupo !== "Sin grupo") {
      supabase.functions.invoke("notify-student-update", {
        body: { alumno_id: id, type: "grupo_asignado", grupo: editGrupo },
      }).catch(() => {});
    }
  };

  const handleManualSub = async () => {
    if (!manualSubAlumno || !manualFechaFin) return;
    setSavingManual(true);

    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

    const { data: planes } = await supabase.from("planes").select("id").eq("activo", true).limit(1);
    const planId = planes?.[0]?.id;

    if (!planId) {
      toast.error("No hay planes activos para asociar la suscripción.");
      setSavingManual(false);
      return;
    }

    // Check if there's a pending verification subscription
    const { data: pendingSubs } = await supabase
      .from("suscripciones")
      .select("id")
      .eq("alumno_id", manualSubAlumno.id)
      .eq("estado", "pendiente_verificacion");

    const hasPendingPayment = pendingSubs && pendingSubs.length > 0;

    // Mark existing active subs as expired
    await supabase
      .from("suscripciones")
      .update({ estado: "vencida" })
      .eq("alumno_id", manualSubAlumno.id)
      .eq("estado", "activa");

    // Mark pending verification subs as confirmed (activa)
    if (hasPendingPayment) {
      await supabase
        .from("suscripciones")
        .update({ estado: "activa", fecha_inicio: todayStr, fecha_fin: manualFechaFin })
        .eq("alumno_id", manualSubAlumno.id)
        .eq("estado", "pendiente_verificacion");
    } else {
      const { error } = await supabase.from("suscripciones").insert({
        alumno_id: manualSubAlumno.id,
        plan_id: planId,
        estado: "activa",
        fecha_inicio: todayStr,
        fecha_fin: manualFechaFin,
        mp_status: "manual",
      });

      if (error) {
        toast.error("Error al crear la suscripción.");
        setSavingManual(false);
        return;
      }
    }

    await supabase.from("alumnos").update({ estado: "activo" }).eq("id", manualSubAlumno.id);

    // Send appropriate email
    const emailType = hasPendingPayment ? "pago_confirmado" : "habilitado";
    supabase.functions.invoke("notify-student-update", {
      body: { alumno_id: manualSubAlumno.id, type: emailType, fecha_vencimiento: manualFechaFin },
    }).catch(() => {});

    toast.success(`Suscripción manual creada para ${manualSubAlumno.nombre} hasta ${manualFechaFin}`);
    setManualSubAlumno(null);
    setManualFechaFin("");
    setSavingManual(false);
    fetchAlumnos();
  };

  const handleDeleteAlumno = async () => {
    if (!deleteAlumno) return;
    await supabase.from("entrenamientos_realizados").delete().eq("alumno_id", deleteAlumno.id);
    await supabase.from("suscripciones").delete().eq("alumno_id", deleteAlumno.id);
    const { error } = await supabase.from("alumnos").delete().eq("id", deleteAlumno.id);
    if (error) {
      toast.error("Error al eliminar el alumno.");
    } else {
      toast.success(`${deleteAlumno.nombre} fue eliminado. Deberá registrarse nuevamente para volver a ingresar.`);
    }
    setDeleteAlumno(null);
    fetchAlumnos();
  };

  // Suscripciones con plan
  const [suscripciones, setSuscripciones] = useState<SuscripcionConPlan[]>([]);
  const [planes, setPlanes] = useState<Plan[]>([]);
  const [changePlanAlumno, setChangePlanAlumno] = useState<Alumno | null>(null);
  const [newPlanId, setNewPlanId] = useState("");
  const [savingPlan, setSavingPlan] = useState(false);

  useEffect(() => {
    supabase.from("suscripciones").select("id, alumno_id, plan_id, estado, fecha_inicio, fecha_fin, planes(id, nombre, precio, moneda)").then(({ data }) => {
      setSuscripciones((data as any) || []);
    });
    supabase.from("planes").select("*").eq("activo", true).order("nombre").then(({ data }) => {
      setPlanes(data || []);
    });
  }, [alumnos]);

  const getActiveSub = (alumnoId: string) => {
    return suscripciones.find(s => s.alumno_id === alumnoId && (s.estado === "activa" || s.estado === "pendiente_verificacion"));
  };

  const handleChangePlan = async () => {
    if (!changePlanAlumno || !newPlanId) return;
    setSavingPlan(true);
    try {
      const activeSub = getActiveSub(changePlanAlumno.id);
      const selectedPlan = planes.find(p => p.id === newPlanId);
      
      if (activeSub) {
        // Update existing subscription's plan
        const { error } = await supabase.from("suscripciones").update({ plan_id: newPlanId } as any).eq("id", activeSub.id);
        if (error) throw error;
      } else {
        // Create new subscription with this plan
        const today = new Date();
        const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
        const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        const endStr = lastDay.toISOString().split("T")[0];
        const { error } = await supabase.from("suscripciones").insert({
          alumno_id: changePlanAlumno.id,
          plan_id: newPlanId,
          estado: "activa",
          fecha_inicio: todayStr,
          fecha_fin: endStr,
          mp_status: "manual",
        });
        if (error) throw error;
      }

      // Send email notification
      supabase.functions.invoke("notify-student-update", {
        body: {
          alumno_id: changePlanAlumno.id,
          type: "plan_cambiado",
          plan_nombre: selectedPlan?.nombre || "Nuevo plan",
          plan_precio: selectedPlan?.precio,
          plan_moneda: selectedPlan?.moneda,
        },
      }).catch(() => {});

      toast.success(`Plan actualizado para ${changePlanAlumno.nombre}`);
      setChangePlanAlumno(null);
      setNewPlanId("");
      fetchAlumnos(); // triggers suscripciones refetch
    } catch (err: any) {
      toast.error(err.message || "Error al cambiar el plan");
    } finally {
      setSavingPlan(false);
    }
  };

  const isPending = (a: Alumno) => {
    const hasPendingPayment = suscripciones.some(s => s.alumno_id === a.id && s.estado === "pendiente_verificacion");
    const needsPassword = !(a as any).password_set && (a as any).invited_at;
    const noGroup = a.grupo === "Sin grupo" && a.estado === "activo";
    return hasPendingPayment || needsPassword || noGroup;
  };

  const pendingCount = alumnos.filter(isPending).length;
  const activeCount = alumnos.filter(a => a.estado === "activo").length;
  const inactiveCount = alumnos.filter(a => a.estado === "inactivo").length;

  const filtered = alumnos.filter((a) => {
    const matchesSearch = a.nombre.toLowerCase().includes(search.toLowerCase()) ||
      a.email.toLowerCase().includes(search.toLowerCase());
    if (!matchesSearch) return false;
    if (statusFilter === "pendientes") return isPending(a);
    if (statusFilter === "activos") return a.estado === "activo";
    if (statusFilter === "inactivos") return a.estado === "inactivo";
    return true;
  });

  const openManualSub = (alumno: Alumno) => {
    setManualSubAlumno(alumno);
    const now = new Date();
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    setManualFechaFin(lastDay.toISOString().split("T")[0]);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-xl md:text-2xl font-heading font-bold uppercase tracking-wider text-foreground">
              Alumnos
            </h2>
            {pendingCount > 0 && (
              <Badge variant="destructive" className="text-xs animate-pulse">
                {pendingCount} pendiente{pendingCount > 1 ? "s" : ""}
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {alumnos.length} alumnos registrados
          </p>
        </div>
      </div>

      <Tabs defaultValue="lista" className="w-full">
        <TabsList className="bg-secondary">
          <TabsTrigger value="lista" className="gap-1.5">
            <Users className="w-4 h-4" />
            Lista
          </TabsTrigger>
          <TabsTrigger value="importar" className="gap-1.5">
            <Upload className="w-4 h-4" />
            Importar
          </TabsTrigger>
        </TabsList>

        <TabsContent value="lista" className="space-y-5 mt-4">
          <div className="flex items-center justify-end">
            <Button variant="gold" size={isMobile ? "sm" : "default"} onClick={() => setShowCreate(true)}>
              <Plus className="w-4 h-4 mr-1" /> {isMobile ? "Nuevo" : "Agregar Alumno"}
            </Button>
          </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre o email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-secondary border-border"
          />
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          {([
            { key: "todos", label: `Todos (${alumnos.length})` },
            { key: "pendientes", label: `Pendientes (${pendingCount})` },
            { key: "activos", label: `Activos (${activeCount})` },
            { key: "inactivos", label: `Inactivos (${inactiveCount})` },
          ] as const).map((f) => (
            <Button
              key={f.key}
              variant={statusFilter === f.key ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter(f.key as any)}
              className="text-xs"
            >
              {f.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Mobile card list */}
      {isMobile ? (
        <div className="space-y-3">
          {loading ? (
            <p className="text-center text-muted-foreground py-8">Cargando...</p>
          ) : filtered.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No se encontraron alumnos</p>
          ) : (
            filtered.map((alumno) => {
              const grupoPreferido = (alumno as any).grupo_preferido;
              const needsValidation = grupoPreferido && alumno.grupo === "Sin grupo";
              return (
                <div
                  key={alumno.id}
                  className={`glass-card rounded-lg p-4 space-y-2 ${needsValidation ? "border-primary/30 border" : ""}`}
                  onClick={() => setDetailAlumno(alumno)}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-foreground text-sm truncate mr-2">
                      {alumno.nombre}
                    </span>
                    <Eye className="w-4 h-4 text-muted-foreground shrink-0" />
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge
                      variant={alumno.grupo === "Sin grupo" ? "destructive" : "secondary"}
                      className="font-mono text-xs"
                    >
                      {alumno.grupo}
                    </Badge>
                    <Badge variant={alumno.estado === "activo" ? "default" : "outline"} className="text-xs">
                      {alumno.estado}
                    </Badge>
                    {!(alumno as any).password_set && (alumno as any).invited_at && (
                      <Badge variant="outline" className="text-xs border-yellow-500/50 text-yellow-500">
                        Contraseña pendiente
                      </Badge>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : (
        /* Desktop table */
        <div className="glass-card rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-muted-foreground">Nombre</TableHead>
                <TableHead className="text-muted-foreground hidden lg:table-cell">Email</TableHead>
                <TableHead className="text-muted-foreground hidden lg:table-cell">DNI/CUIT</TableHead>
                <TableHead className="text-muted-foreground">Grupo</TableHead>
                <TableHead className="text-muted-foreground">Estado</TableHead>
                <TableHead className="text-muted-foreground text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">Cargando...</TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">No se encontraron alumnos</TableCell>
                </TableRow>
              ) : (
                filtered.map((alumno) => {
                  const grupoPreferido = (alumno as any).grupo_preferido;
                  const needsValidation = grupoPreferido && alumno.grupo === "Sin grupo";
                  return (
                    <TableRow key={alumno.id} className={`border-border ${needsValidation ? "bg-primary/5" : ""}`}>
                      <TableCell className="font-medium text-foreground">
                        {alumno.nombre}
                        {needsValidation && (
                          <span className="ml-2 text-xs text-primary font-normal">Eligió: {grupoPreferido}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground hidden lg:table-cell">{alumno.email}</TableCell>
                      <TableCell className="text-muted-foreground font-mono text-xs hidden lg:table-cell">{alumno.documento || "—"}</TableCell>
                      <TableCell>
                        {editingId === alumno.id ? (
                          <div className="flex items-center gap-1">
                            <select
                              value={editGrupo}
                              onChange={(e) => setEditGrupo(e.target.value)}
                              className="h-8 w-28 rounded-md border border-input bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                            >
                              {GRUPOS.map((g) => (
                                <option key={g} value={g}>
                                  {g}
                                </option>
                              ))}
                            </select>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => saveGrupo(alumno.id)}>
                              <Check className="w-3 h-3 text-primary" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingId(null)}>
                              <X className="w-3 h-3" />
                            </Button>
                          </div>
                        ) : (
                          <Badge
                            variant={alumno.grupo === "Sin grupo" ? "destructive" : "secondary"}
                            className="font-mono text-xs cursor-pointer"
                            onClick={() => { setEditingId(alumno.id); setEditGrupo(alumno.grupo); }}
                          >
                            {alumno.grupo}
                            <Edit2 className="w-2.5 h-2.5 ml-1" />
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={alumno.estado === "activo" ? "default" : "outline"} className="text-xs">
                          {alumno.estado}
                        </Badge>
                        {!(alumno as any).password_set && (alumno as any).invited_at && (
                          <Badge variant="outline" className="text-xs border-yellow-500/50 text-yellow-500 ml-1">
                            Clave pendiente
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right space-x-1">
                        {!(alumno as any).password_set && (alumno as any).invited_at && (
                          <Button variant="ghost" size="sm" disabled={resending === alumno.id} onClick={() => handleResendInvite(alumno)} className="text-xs" title="Reenviar invitación">
                            <MailPlus className="w-3 h-3 mr-1" /> {resending === alumno.id ? "Enviando…" : "Reenviar"}
                          </Button>
                        )}
                        {(alumno as any).last_invite_sent_at && !(alumno as any).password_set && (
                          <span className="text-[10px] text-muted-foreground" title="Último envío">
                            Enviado: {new Date((alumno as any).last_invite_sent_at).toLocaleDateString("es-AR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                          </span>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => openManualSub(alumno)} className="text-xs" title="Habilitar suscripción manual">
                          <CalendarCheck className="w-3 h-3 mr-1" /> Habilitar
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => toggleEstado(alumno)} className="text-xs">
                          {alumno.estado === "activo" ? (
                            <><UserX className="w-3 h-3 mr-1" /> Desactivar</>
                          ) : (
                            <><UserCheck className="w-3 h-3 mr-1" /> Activar</>
                          )}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setDeleteAlumno(alumno)} className="text-xs text-destructive hover:text-destructive">
                          <Trash2 className="w-3 h-3 mr-1" /> Eliminar
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Detail dialog (mobile) */}
      <Dialog open={!!detailAlumno} onOpenChange={(open) => { if (!open) setDetailAlumno(null); }}>
        <DialogContent className="sm:max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="font-heading uppercase tracking-wider text-base">
              {detailAlumno?.nombre}
            </DialogTitle>
          </DialogHeader>
          {detailAlumno && (
            <div className="space-y-4 py-2">
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Email</span>
                  <span className="text-foreground text-right break-all ml-4">{detailAlumno.email}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">DNI/CUIT</span>
                  <span className="text-foreground font-mono">{detailAlumno.documento || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Teléfono</span>
                  <span className="text-foreground">{detailAlumno.telefono || "—"}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Grupo</span>
                  <Select
                    value={editGrupo || detailAlumno.grupo}
                    onValueChange={async (val) => {
                      setEditGrupo(val);
                      await supabase.from("alumnos").update({ grupo: val as any }).eq("id", detailAlumno.id);
                      toast.success("Grupo actualizado");
                      setDetailAlumno({ ...detailAlumno, grupo: val as any });
                      fetchAlumnos();

                      // Send email notification for group assignment
                      if (val !== "Sin grupo") {
                        supabase.functions.invoke("notify-student-update", {
                          body: { alumno_id: detailAlumno.id, type: "grupo_asignado", grupo: val },
                        }).catch(() => {});
                      }
                    }}
                  >
                    <SelectTrigger className="w-36 h-8 bg-secondary border-border text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="z-[100]">
                      {GRUPOS.map((g) => (
                        <SelectItem key={g} value={g}>{g}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Estado</span>
                  <Badge variant={detailAlumno.estado === "activo" ? "default" : "outline"} className="text-xs">
                    {detailAlumno.estado}
                  </Badge>
                </div>
              </div>
              <div className="flex flex-col gap-2 pt-2 border-t border-border">
                <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => {
                  openManualSub(detailAlumno);
                  setDetailAlumno(null);
                }}>
                  <CalendarCheck className="w-3 h-3 mr-2" /> Habilitar suscripción
                </Button>
                <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => {
                  toggleEstado(detailAlumno);
                  setDetailAlumno(null);
                }}>
                  {detailAlumno.estado === "activo" ? (
                    <><UserX className="w-3 h-3 mr-2" /> Desactivar</>
                  ) : (
                    <><UserCheck className="w-3 h-3 mr-2" /> Activar</>
                  )}
                </Button>
                <Button variant="outline" size="sm" className="w-full justify-start text-destructive hover:text-destructive" onClick={() => {
                  setDeleteAlumno(detailAlumno);
                  setDetailAlumno(null);
                }}>
                  <Trash2 className="w-3 h-3 mr-2" /> Eliminar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Manual subscription dialog */}
      <Dialog open={!!manualSubAlumno} onOpenChange={(open) => { if (!open) setManualSubAlumno(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading uppercase tracking-wider">
              Habilitar suscripción manual
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Alumno: <span className="text-foreground font-medium">{manualSubAlumno?.nombre}</span>
            </p>
            <div className="space-y-2">
              <Label htmlFor="fecha-fin">Fecha de vencimiento</Label>
              <Input
                id="fecha-fin"
                type="date"
                value={manualFechaFin}
                onChange={(e) => setManualFechaFin(e.target.value)}
                className="bg-secondary border-border"
              />
              <p className="text-xs text-muted-foreground">
                Útil para pagos en efectivo o meses por adelantado
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManualSubAlumno(null)}>Cancelar</Button>
            <Button variant="gold" disabled={!manualFechaFin || savingManual} onClick={handleManualSub}>
              {savingManual ? "Guardando..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteAlumno} onOpenChange={(open) => { if (!open) setDeleteAlumno(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar a {deleteAlumno?.nombre}?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminarán todos sus datos, suscripciones y registros de entrenamientos. Para volver a usar la app, deberá registrarse nuevamente. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteAlumno} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Create alumno dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="font-heading uppercase tracking-wider">Agregar Alumno</DialogTitle>
            <DialogDescription>Se enviará una invitación por email para que active su cuenta.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nombre completo *</Label>
              <Input value={createForm.nombre} onChange={(e) => setCreateForm({ ...createForm, nombre: e.target.value })} className="bg-secondary border-border" placeholder="Juan Pérez" />
            </div>
            <div className="space-y-2">
              <Label>Email *</Label>
              <Input type="email" value={createForm.email} onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })} className="bg-secondary border-border" placeholder="alumno@ejemplo.com" />
            </div>
            <div className="space-y-2">
              <Label>Teléfono</Label>
              <Input value={createForm.telefono} onChange={(e) => setCreateForm({ ...createForm, telefono: e.target.value })} className="bg-secondary border-border" placeholder="Opcional" />
            </div>
            <div className="space-y-2">
              <Label>DNI/CUIT</Label>
              <Input value={createForm.documento} onChange={(e) => setCreateForm({ ...createForm, documento: e.target.value })} className="bg-secondary border-border" placeholder="Opcional" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancelar</Button>
            <Button variant="gold" disabled={creating} onClick={handleCreateAlumno}>
              {creating ? "Enviando..." : "Enviar invitación"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
        </TabsContent>

        <TabsContent value="importar" className="mt-4">
          <ImportStudentsContent />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ManageStudents;
