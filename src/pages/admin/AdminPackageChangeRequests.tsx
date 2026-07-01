import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Package, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { previewPackageChange, applyPackageChange } from "@/lib/packageChangePreview";
import PackageChangePreviewCard from "@/components/admin/PackageChangePreviewCard";

interface Row {
  id: string;
  reservation_id: string;
  alumno_id: string | null;
  event_id: string;
  package_actual_id: string | null;
  package_nuevo_id: string;
  estado: string;
  motivo_alumno: string | null;
  nota_admin: string | null;
  preview_snapshot: any;
  created_at: string;
  alumno_nombre?: string;
  alumno_email?: string;
  event_title?: string;
  package_actual_nombre?: string;
  package_nuevo_nombre?: string;
}

export default function AdminPackageChangeRequests() {
  const [items, setItems] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"pendiente" | "todas">("pendiente");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [livePreview, setLivePreview] = useState<any>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("event_package_change_requests" as any)
      .select("*")
      .order("created_at", { ascending: false });
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); setLoading(false); return; }
    const rows = (data || []) as any[];

    const alumnoIds = Array.from(new Set(rows.map(r => r.alumno_id).filter(Boolean)));
    const eventIds = Array.from(new Set(rows.map(r => r.event_id).filter(Boolean)));
    const pkgIds = Array.from(new Set(rows.flatMap(r => [r.package_actual_id, r.package_nuevo_id]).filter(Boolean)));

    const [alumnos, events, packages] = await Promise.all([
      alumnoIds.length ? supabase.from("alumnos").select("id, nombre, apellido, email").in("id", alumnoIds) : { data: [] as any[] },
      eventIds.length ? supabase.from("events").select("id, title").in("id", eventIds) : { data: [] as any[] },
      pkgIds.length ? supabase.from("event_packages").select("id, nombre").in("id", pkgIds) : { data: [] as any[] },
    ]);

    const aMap: Record<string, any> = {};
    (alumnos.data || []).forEach((a: any) => aMap[a.id] = a);
    const eMap: Record<string, string> = {};
    (events.data || []).forEach((e: any) => eMap[e.id] = e.title);
    const pMap: Record<string, string> = {};
    (packages.data || []).forEach((p: any) => pMap[p.id] = p.nombre);

    setItems(rows.map(r => ({
      ...r,
      alumno_nombre: aMap[r.alumno_id] ? `${aMap[r.alumno_id].nombre || ""} ${aMap[r.alumno_id].apellido || ""}`.trim() : "—",
      alumno_email: aMap[r.alumno_id]?.email || "",
      event_title: eMap[r.event_id] || "—",
      package_actual_nombre: pMap[r.package_actual_id!] || "—",
      package_nuevo_nombre: pMap[r.package_nuevo_id] || "—",
    })));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openRow = async (row: Row) => {
    if (expandedId === row.id) { setExpandedId(null); setLivePreview(null); return; }
    setExpandedId(row.id);
    setLivePreview(null);
    setPreviewLoading(true);
    try {
      const p = await previewPackageChange(row.reservation_id, row.package_nuevo_id);
      setLivePreview(p);
    } catch (e: any) {
      toast({ title: "No se pudo recalcular", description: e.message, variant: "destructive" });
    } finally {
      setPreviewLoading(false);
    }
  };

  const approve = async (row: Row, override = false) => {
    if (!livePreview?.revalidation_token) {
      toast({ title: "Recargá el preview antes de aplicar", variant: "destructive" });
      return;
    }
    setBusyId(row.id);
    try {
      await applyPackageChange({
        reservationId: row.reservation_id,
        packageNuevoId: row.package_nuevo_id,
        revalidationToken: livePreview.revalidation_token,
        requestId: row.id,
        overridePlazaLibre: override,
        adminNote: `Aprobado desde panel${override ? " (override plaza libre)" : ""}`,
      });
      toast({ title: "Cambio aplicado" });
      setExpandedId(null); setLivePreview(null);
      load();
    } catch (e: any) {
      toast({ title: "Error al aplicar", description: e.message, variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (row: Row) => {
    setBusyId(row.id);
    const { error } = await supabase
      .from("event_package_change_requests" as any)
      .update({ estado: "rechazada", resolved_at: new Date().toISOString() })
      .eq("id", row.id);
    setBusyId(null);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Solicitud rechazada" });
    load();
  };

  const filtered = items.filter(r => filter === "todas" ? true : r.estado === "pendiente");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link to="/admin/resumen" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-lg font-heading uppercase tracking-wider flex items-center gap-2">
            <Package className="w-5 h-5 text-primary" />
            Cambios de paquete
          </h1>
        </div>
        <div className="flex gap-1">
          <Button variant={filter === "pendiente" ? "default" : "outline"} size="sm" onClick={() => setFilter("pendiente")}>
            Pendientes
          </Button>
          <Button variant={filter === "todas" ? "default" : "outline"} size="sm" onClick={() => setFilter("todas")}>
            Todas
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground animate-pulse">Cargando…</p>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Sin solicitudes.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {filtered.map(row => (
            <Card key={row.id} className="border-border">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-sm font-heading uppercase tracking-wider">{row.alumno_nombre}</CardTitle>
                    <p className="text-[11px] text-muted-foreground">{row.alumno_email}</p>
                    <p className="text-[11px] text-muted-foreground mt-1">{row.event_title}</p>
                  </div>
                  <Badge variant="outline" className={
                    row.estado === "pendiente" ? "border-yellow-500/40 text-yellow-500" :
                    row.estado === "aplicada" ? "border-emerald-500/40 text-emerald-400" :
                    "border-destructive/40 text-destructive"
                  }>{row.estado}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">{row.package_actual_nombre}</span>
                  <span>→</span>
                  <span className="font-medium">{row.package_nuevo_nombre}</span>
                </div>
                {row.motivo_alumno && (
                  <p className="text-xs italic border-l-2 border-border pl-2 text-muted-foreground">{row.motivo_alumno}</p>
                )}
                <Button variant="outline" size="sm" className="w-full h-7 text-xs" onClick={() => openRow(row)}>
                  {expandedId === row.id ? "Ocultar preview" : "Ver impacto actual"}
                </Button>

                {expandedId === row.id && (
                  <div className="pt-2">
                    <PackageChangePreviewCard preview={livePreview} loading={previewLoading} />
                    {row.estado === "pendiente" && livePreview && livePreview.status !== "no_posible" && (
                      <div className="flex gap-2 pt-3 border-t border-border mt-3">
                        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => reject(row)} disabled={busyId === row.id}>
                          <XCircle className="w-3 h-3 mr-1" /> Rechazar
                        </Button>
                        <div className="flex-1" />
                        {livePreview.status === "requiere_aprobacion" && (
                          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => approve(row, true)} disabled={busyId === row.id}>
                            {busyId === row.id ? <Loader2 className="w-3 h-3 animate-spin" /> : "Aprobar con override"}
                          </Button>
                        )}
                        <Button size="sm" className="h-7 text-xs" onClick={() => approve(row, false)} disabled={busyId === row.id}>
                          {busyId === row.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <><CheckCircle className="w-3 h-3 mr-1" /> Aprobar</>}
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
