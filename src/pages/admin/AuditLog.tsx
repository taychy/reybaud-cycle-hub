import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollText, Shield, Eye } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";

interface AuditEntry {
  id: string;
  user_email: string | null;
  user_role: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: Record<string, any> | null;
  created_at: string;
}

const actionLabels: Record<string, string> = {
  marcar_pagado: "Marcó pago como cobrado",
  pago_chequeado: "Chequeó un pago",
  registrar_pago: "Registró un pago",
  crear_plan: "Creó un plan",
  editar_plan: "Editó un plan",
  eliminar_alumno: "Eliminó un alumno",
  actualizar_precio: "Actualizó precio",
  crear_sede: "Creó una sede",
  importar_alumnos: "Importó alumnos",
  publicar_plan: "Publicó plan mensual",
  registrar_asistencia: "Registró asistencia",
  enviar_feedback: "Envió feedback",
  gestionar_suscripcion_cambiar_plan: "Cambió plan de suscripción",
  gestionar_suscripcion_cancelar: "Canceló suscripción",
  gestionar_suscripcion_pausar: "Pausó suscripción",
  gestionar_suscripcion_reactivar: "Reactivó suscripción",
};

const roleColors: Record<string, string> = {
  admin: "bg-primary/20 text-primary",
  coach: "bg-accent/20 text-accent",
  super_admin: "bg-destructive/20 text-destructive",
};

const fieldLabels: Record<string, string> = {
  accion: "Acción",
  alumno: "Alumno",
  alumno_id: "ID Alumno",
  alumno_nombre: "Alumno",
  plan: "Plan",
  plan_anterior: "Plan anterior",
  plan_nuevo: "Plan nuevo",
  precio_anterior: "Precio anterior",
  precio_nuevo: "Precio nuevo",
  monto: "Monto",
  moneda: "Moneda",
  metodo_pago: "Método de pago",
  motivo: "Motivo",
  notas: "Notas",
  suscripcion_id: "ID Suscripción",
  diferencia: "Diferencia",
  saldo_aplicado: "Saldo aplicado",
  credito_calculado: "Crédito calculado",
  dias_restantes: "Días restantes",
  fecha_inicio: "Fecha inicio",
  fecha_fin: "Fecha fin",
};

const AuditLog = () => {
  const isMobile = useIsMobile();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [selected, setSelected] = useState<AuditEntry | null>(null);
  const [entityInfo, setEntityInfo] = useState<{ alumno?: string; email?: string; plan?: string } | null>(null);
  const [loadingEntity, setLoadingEntity] = useState(false);

  useEffect(() => {
    checkAccessAndLoad();
  }, []);

  const checkAccessAndLoad = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const { data: profile } = await supabase
      .from("admin_profiles")
      .select("role")
      .eq("user_id", session.user.id)
      .single();

    if (profile?.role !== "super_admin") {
      setIsSuperAdmin(false);
      setLoading(false);
      return;
    }

    setIsSuperAdmin(true);

    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
    const { data } = await supabase
      .from("audit_log")
      .select("*")
      .gte("created_at", thirtyDaysAgo)
      .order("created_at", { ascending: false })
      .limit(200);

    setEntries((data as any[]) || []);
    setLoading(false);
  };

  const openDetails = async (e: AuditEntry) => {
    setSelected(e);
    setEntityInfo(null);
    if (!e.entity_id) return;

    setLoadingEntity(true);
    try {
      if (e.entity_type === "suscripcion") {
        const { data: sub } = await supabase
          .from("suscripciones")
          .select("id, alumno_id, plan_id, planes(nombre), alumnos(nombre, apellido, email)")
          .eq("id", e.entity_id)
          .maybeSingle();
        if (sub) {
          const a: any = (sub as any).alumnos;
          const p: any = (sub as any).planes;
          setEntityInfo({
            alumno: a ? `${a.nombre ?? ""} ${a.apellido ?? ""}`.trim() : undefined,
            email: a?.email,
            plan: p?.nombre,
          });
        }
      } else if (e.entity_type === "alumno") {
        const { data: al } = await supabase
          .from("alumnos")
          .select("nombre, apellido, email")
          .eq("id", e.entity_id)
          .maybeSingle();
        if (al) {
          setEntityInfo({
            alumno: `${al.nombre ?? ""} ${al.apellido ?? ""}`.trim(),
            email: al.email as any,
          });
        }
      }
    } finally {
      setLoadingEntity(false);
    }
  };

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString("es-AR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

  const formatFullDate = (d: string) =>
    new Date(d).toLocaleString("es-AR", {
      day: "2-digit", month: "long", year: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });

  const getActionLabel = (action: string) => actionLabels[action] || action;

  const formatValue = (v: any): string => {
    if (v === null || v === undefined) return "—";
    if (typeof v === "boolean") return v ? "Sí" : "No";
    if (typeof v === "number") return v.toLocaleString("es-AR");
    if (typeof v === "object") return JSON.stringify(v, null, 2);
    return String(v);
  };

  const getDetailsText = (details: Record<string, any> | null) => {
    if (!details) return "—";
    return Object.entries(details)
      .map(([k, v]) => `${fieldLabels[k] || k}: ${formatValue(v)}`)
      .join(" · ");
  };

  if (loading) {
    return <div className="animate-pulse text-muted-foreground p-8">Cargando historial...</div>;
  }

  if (!isSuperAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Shield className="w-12 h-12 text-muted-foreground" />
        <p className="text-muted-foreground text-center">Solo los Super Admins pueden ver el historial de auditoría.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold uppercase tracking-wider">Historial de actividad</h1>
        <p className="text-sm text-muted-foreground">
          Últimos 30 días. Tocá cualquier fila para ver el detalle completo de la acción.
        </p>
      </div>

      {entries.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <ScrollText className="w-10 h-10 mx-auto mb-3 opacity-50" />
            No hay registros de actividad en los últimos 30 días.
          </CardContent>
        </Card>
      ) : isMobile ? (
        <div className="space-y-2">
          {entries.map((e) => (
            <Card
              key={e.id}
              className="cursor-pointer hover:bg-accent/5 transition-colors"
              onClick={() => openDetails(e)}
            >
              <CardContent className="p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{e.user_email || "—"}</span>
                  <Badge className={`text-[10px] ${roleColors[e.user_role] || ""}`}>{e.user_role}</Badge>
                </div>
                <p className="text-sm">{getActionLabel(e.action)}</p>
                <p className="text-xs text-muted-foreground">{e.entity_type} · {formatDate(e.created_at)}</p>
                {e.details && <p className="text-xs text-muted-foreground truncate">{getDetailsText(e.details)}</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Usuario</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead>Acción</TableHead>
                  <TableHead>Entidad</TableHead>
                  <TableHead>Detalles</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((e) => (
                  <TableRow
                    key={e.id}
                    className="cursor-pointer hover:bg-accent/5"
                    onClick={() => openDetails(e)}
                  >
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{formatDate(e.created_at)}</TableCell>
                    <TableCell className="text-sm">{e.user_email || "—"}</TableCell>
                    <TableCell>
                      <Badge className={`text-[10px] ${roleColors[e.user_role] || ""}`}>{e.user_role}</Badge>
                    </TableCell>
                    <TableCell className="text-sm font-medium">{getActionLabel(e.action)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{e.entity_type}</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[280px] truncate">{getDetailsText(e.details)}</TableCell>
                    <TableCell><Eye className="w-4 h-4 text-muted-foreground" /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={!!selected} onOpenChange={(o) => { if (!o) { setSelected(null); setEntityInfo(null); } }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <ScrollText className="w-5 h-5 text-primary" />
                  {getActionLabel(selected.action)}
                </DialogTitle>
                <DialogDescription>{formatFullDate(selected.created_at)}</DialogDescription>
              </DialogHeader>

              <div className="space-y-4 mt-2">
                {/* Actor */}
                <section className="rounded-lg border p-3 space-y-1">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">Realizado por</div>
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{selected.user_email || "—"}</span>
                    <Badge className={`text-[10px] ${roleColors[selected.user_role] || ""}`}>{selected.user_role}</Badge>
                  </div>
                </section>

                {/* Entity */}
                <section className="rounded-lg border p-3 space-y-2">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">Entidad afectada</div>
                  <div className="text-sm">
                    <span className="text-muted-foreground">Tipo: </span>
                    <span className="font-medium">{selected.entity_type}</span>
                  </div>
                  {selected.entity_id && (
                    <div className="text-xs text-muted-foreground font-mono break-all">ID: {selected.entity_id}</div>
                  )}
                  {loadingEntity && <div className="text-xs text-muted-foreground">Cargando datos del alumno…</div>}
                  {entityInfo?.alumno && (
                    <div className="text-sm pt-1 border-t">
                      <div><span className="text-muted-foreground">Alumno: </span><span className="font-medium">{entityInfo.alumno}</span></div>
                      {entityInfo.email && <div className="text-xs text-muted-foreground">{entityInfo.email}</div>}
                      {entityInfo.plan && <div className="text-sm mt-1"><span className="text-muted-foreground">Plan actual: </span>{entityInfo.plan}</div>}
                    </div>
                  )}
                </section>

                {/* Details */}
                <section className="rounded-lg border p-3 space-y-2">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">Detalles de la acción</div>
                  {!selected.details || Object.keys(selected.details).length === 0 ? (
                    <div className="text-sm text-muted-foreground">Sin detalles adicionales.</div>
                  ) : (
                    <dl className="divide-y">
                      {Object.entries(selected.details).map(([k, v]) => (
                        <div key={k} className="grid grid-cols-[140px_1fr] gap-2 py-1.5 text-sm">
                          <dt className="text-muted-foreground">{fieldLabels[k] || k}</dt>
                          <dd className="font-medium break-words whitespace-pre-wrap">{formatValue(v)}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </section>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AuditLog;
