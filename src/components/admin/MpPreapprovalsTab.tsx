import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Repeat, Loader2, Search } from "lucide-react";
import { formatPrice } from "@/lib/currency";

interface PreapprovalRow {
  preapproval_id: string;
  mp_plan_id: string | null;
  payer_email: string | null;
  descripcion_mp: string | null;
  importe_referencia: number | null;
  moneda: string | null;
  estado: string;
  origen_alumno: string | null;
  alumno_id: string | null;
  alumno_nombre: string | null;
  plan_id: string | null;
  plan_nombre: string | null;
  movimientos_vistos: number;
  movimientos_sin_imputar: number;
  primera_fecha: string | null;
  ultima_fecha: string | null;
}

const ESTADO_BADGE: Record<string, { label: string; className: string }> = {
  detectado: { label: "Detectado", className: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30" },
  confirmado: { label: "Confirmado", className: "bg-green-500/10 text-green-400 border-green-500/30" },
  ignorado: { label: "Ignorado", className: "bg-muted text-muted-foreground border-border" },
};

const fmtFecha = (iso: string | null) => {
  if (!iso) return "—";
  const d = iso.slice(0, 10).split("-");
  return `${d[2]}/${d[1]}/${d[0]}`;
};

/**
 * Gestión de identidad recurrente de Mercado Pago (P0).
 * Sólo mapea preapproval → alumno → plan. Confirmar NO imputa pagos
 * ni modifica mensualidades: eso queda para etapas posteriores.
 */
const MpPreapprovalsTab = () => {
  const { toast } = useToast();
  const [rows, setRows] = useState<PreapprovalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [alumnos, setAlumnos] = useState<{ id: string; label: string }[]>([]);
  const [planes, setPlanes] = useState<{ id: string; nombre: string }[]>([]);

  const [editing, setEditing] = useState<PreapprovalRow | null>(null);
  const [selAlumno, setSelAlumno] = useState<string>("");
  const [selPlan, setSelPlan] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data: pre }, { data: als }, { data: pls }] = await Promise.all([
      supabase.from("vw_mp_preapprovals_admin").select("*").order("ultima_fecha", { ascending: false }),
      supabase.from("alumnos").select("id, nombre, apellido, email").order("nombre"),
      supabase.from("planes").select("id, nombre").order("nombre"),
    ]);
    setRows((pre as unknown as PreapprovalRow[]) || []);
    setAlumnos(((als as { id: string; nombre: string; apellido: string | null; email: string | null }[]) || []).map((a) => ({
      id: a.id,
      label: `${a.nombre} ${a.apellido || ""}`.trim() + (a.email ? ` · ${a.email}` : ""),
    })));
    setPlanes(((pls as { id: string; nombre: string }[]) || []));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.preapproval_id, r.payer_email, r.descripcion_mp, r.alumno_nombre, r.plan_nombre]
        .some((v) => (v || "").toLowerCase().includes(q))
    );
  }, [rows, busca]);

  const openEdit = (r: PreapprovalRow) => {
    setEditing(r);
    setSelAlumno(r.alumno_id || "");
    setSelPlan(r.plan_id || "");
  };

  const guardar = async (estado: "confirmado" | "ignorado" | "detectado") => {
    if (!editing) return;
    if (estado === "confirmado" && (!selAlumno || !selPlan)) {
      toast({ title: "Faltan datos", description: "Para confirmar hay que elegir alumno y plan.", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await supabase.rpc("confirm_mp_preapproval_mapping", {
      _preapproval_id: editing.preapproval_id,
      _alumno_id: selAlumno || null,
      _plan_id: selPlan || null,
      _estado: estado,
      _notas: null,
    });
    setSaving(false);
    if (error) {
      toast({ title: "No se pudo guardar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Mapeo guardado", description: "No se imputó ningún pago ni se modificó ninguna mensualidad." });
    setEditing(null);
    load();
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Repeat className="w-4 h-4" />
            Suscripciones recurrentes de Mercado Pago
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Acá se vincula cada cobro automático de Mercado Pago con el alumno y el plan que le corresponden.
            Confirmar un vínculo sólo guarda la identidad: no imputa pagos ni cambia mensualidades.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="relative max-w-sm">
            <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Buscar por alumno, email o descripción"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>

          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
              <Loader2 className="w-4 h-4 animate-spin" /> Cargando…
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6">No hay suscripciones recurrentes registradas.</p>
          ) : (
            <div className="space-y-2">
              {filtered.map((r) => {
                const badge = ESTADO_BADGE[r.estado] || ESTADO_BADGE.detectado;
                return (
                  <div
                    key={r.preapproval_id}
                    className="rounded-lg border border-border p-3 flex flex-col md:flex-row md:items-center gap-3"
                  >
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-sm">{r.descripcion_mp || "Sin descripción"}</span>
                        <Badge variant="outline" className={badge.className}>{badge.label}</Badge>
                        {r.origen_alumno === "sugerido_sync" || r.origen_alumno === "sugerido_bootstrap" ? (
                          <Badge variant="outline" className="text-[10px]">alumno sugerido</Badge>
                        ) : null}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {r.payer_email || "sin email"} · {r.alumno_nombre || "sin alumno"} ·{" "}
                        {r.plan_nombre || "sin plan asignado"}
                      </p>
                      <p className="text-[11px] text-muted-foreground font-mono truncate">
                        {r.preapproval_id}{r.mp_plan_id ? ` · plan MP ${r.mp_plan_id}` : ""}
                      </p>
                    </div>
                    <div className="text-xs text-muted-foreground md:text-right shrink-0">
                      <div>{r.movimientos_vistos} cobro(s) · {r.movimientos_sin_imputar} sin imputar</div>
                      <div>{fmtFecha(r.primera_fecha)} → {fmtFecha(r.ultima_fecha)}</div>
                      {r.importe_referencia != null && (
                        <div>{formatPrice(Number(r.importe_referencia), r.moneda || "ARS")}</div>
                      )}
                    </div>
                    <Button size="sm" variant="outline" onClick={() => openEdit(r)}>
                      Vincular
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Vincular suscripción recurrente</DialogTitle>
            <DialogDescription>
              Elegí a quién pertenece este cobro automático y con qué plan se corresponde.
              Guardar no imputa ningún pago ni activa mensualidades.
            </DialogDescription>
          </DialogHeader>

          {editing && (
            <div className="space-y-3">
              <div className="text-xs text-muted-foreground space-y-0.5">
                <div>{editing.descripcion_mp || "Sin descripción"} · {editing.payer_email || "sin email"}</div>
                <div className="font-mono">{editing.preapproval_id}</div>
              </div>

              <div className="space-y-1.5">
                <Label>Alumno</Label>
                <Select value={selAlumno} onValueChange={setSelAlumno}>
                  <SelectTrigger><SelectValue placeholder="Elegir alumno" /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {alumnos.map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Plan</Label>
                <Select value={selPlan} onValueChange={setSelPlan}>
                  <SelectTrigger><SelectValue placeholder="Elegir plan" /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {planes.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="ghost" disabled={saving} onClick={() => guardar("ignorado")}>
              Ignorar
            </Button>
            <Button disabled={saving} onClick={() => guardar("confirmado")}>
              {saving && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
              Confirmar vínculo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MpPreapprovalsTab;
