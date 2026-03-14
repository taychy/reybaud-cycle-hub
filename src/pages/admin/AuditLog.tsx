import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollText, Shield } from "lucide-react";
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
  crear_plan: "Creó un plan",
  editar_plan: "Editó un plan",
  eliminar_alumno: "Eliminó un alumno",
  actualizar_precio: "Actualizó precio",
  crear_sede: "Creó una sede",
  importar_alumnos: "Importó alumnos",
  publicar_plan: "Publicó plan mensual",
  registrar_asistencia: "Registró asistencia",
  enviar_feedback: "Envió feedback",
};

const roleColors: Record<string, string> = {
  admin: "bg-primary/20 text-primary",
  coach: "bg-accent/20 text-accent",
  super_admin: "bg-destructive/20 text-destructive",
};

const AuditLog = () => {
  const isMobile = useIsMobile();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  useEffect(() => {
    checkAccessAndLoad();
  }, []);

  const checkAccessAndLoad = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    // Check if super_admin
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

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString("es-AR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

  const getActionLabel = (action: string) => actionLabels[action] || action;

  const getDetailsText = (details: Record<string, any> | null) => {
    if (!details) return "—";
    return Object.entries(details)
      .map(([k, v]) => `${k}: ${v}`)
      .join(", ");
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
        <p className="text-sm text-muted-foreground">Últimos 30 días de acciones realizadas por admins y coaches</p>
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
            <Card key={e.id}>
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{formatDate(e.created_at)}</TableCell>
                    <TableCell className="text-sm">{e.user_email || "—"}</TableCell>
                    <TableCell>
                      <Badge className={`text-[10px] ${roleColors[e.user_role] || ""}`}>{e.user_role}</Badge>
                    </TableCell>
                    <TableCell className="text-sm font-medium">{getActionLabel(e.action)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{e.entity_type}</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{getDetailsText(e.details)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default AuditLog;
