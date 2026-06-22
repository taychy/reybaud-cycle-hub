import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select as SelectPlan, SelectContent as SelectPlanContent, SelectItem as SelectPlanItem,
  SelectTrigger as SelectPlanTrigger, SelectValue as SelectPlanValue,
} from "@/components/ui/select";
import { Plus, Trash2, ExternalLink, RefreshCw, Wallet, ChevronDown, ChevronUp, XCircle, ArrowRightLeft } from "lucide-react";
import { formatPrice } from "@/lib/currency";
import { getPaymentMethodLabel } from "@/lib/paymentMethods";
import { toast } from "sonner";
import { AjusteCuentaModal, type AjusteCuentaValue } from "./AjusteCuentaModal";
import { logStudentActivity } from "@/lib/logStudentActivity";
import { isDuplicateSubError, DUPLICATE_SUB_MSG } from "@/lib/subscriptionGuard";

interface Props {
  alumnoId: string;
  /** Llamado tras anular o cambiar una suscripción, para que el padre recargue secciones relacionadas. */
  onSubscriptionsChanged?: () => void;
}

interface PlanOption {
  id: string;
  nombre: string;
  precio: number | null;
  moneda: string | null;
  frecuencia: string | null;
}

interface Movimiento {
  alumno_id: string;
  fecha: string;
  tipo: string;
  concepto: string;
  fuente_tabla: string;
  fuente_id: string;
  debe: number;
  haber: number;
  moneda: string;
  estado: string | null;
  referencia_extra: any;
}

interface SaldoRow {
  moneda: string;
  total_cargos: number;
  total_pagos: number;
  saldo: number;
}

const TIPO_LABEL: Record<string, { label: string; className: string }> = {
  cargo_suscripcion: { label: "Suscripción", className: "bg-primary/15 text-primary border-primary/30" },
  pago_suscripcion: { label: "Pago plan", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  cargo_reserva: { label: "Evento / Viaje", className: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30" },
  pago_reserva: { label: "Pago evento", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  cargo_preventa: { label: "Preventa", className: "bg-fuchsia-500/15 text-fuchsia-400 border-fuchsia-500/30" },
  pago_preventa: { label: "Pago preventa", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  cargo_tienda: { label: "Tienda", className: "bg-violet-500/15 text-violet-400 border-violet-500/30" },
  pago_tienda: { label: "Pago tienda", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  ajuste_cargo: { label: "Ajuste (cargo)", className: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  ajuste_credito: { label: "Ajuste (crédito)", className: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
};

function formatDate(d: string): string {
  if (!d) return "—";
  const parts = d.substring(0, 10).split("-");
  if (parts.length !== 3) return d;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

export function StudentCuentaCorrienteSection({ alumnoId, onSubscriptionsChanged }: Props) {
  const [loading, setLoading] = useState(true);
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [saldos, setSaldos] = useState<SaldoRow[]>([]);
  const [monedaFilter, setMonedaFilter] = useState<string>("all");
  const [tipoFilter, setTipoFilter] = useState<string>("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AjusteCuentaValue | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  // Subscription actions (cancel & change plan) launched from cargo_suscripcion rows
  const [planes, setPlanes] = useState<PlanOption[]>([]);
  const [cancelSub, setCancelSub] = useState<{ id: string; concepto: string } | null>(null);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [changeSub, setChangeSub] = useState<{ id: string; concepto: string; currentPlanId: string | null; currentPrice: number | null; currentMoneda: string | null } | null>(null);
  const [changeNewPlanId, setChangeNewPlanId] = useState<string>("");
  const [changeLoading, setChangeLoading] = useState(false);
  const [absorbCredit, setAbsorbCredit] = useState(true);

  const PREVIEW_LIMIT = 5;

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [movRes, saldoRes] = await Promise.all([
      supabase
        .from("vw_cuenta_corriente_movimientos" as any)
        .select("*")
        .eq("alumno_id", alumnoId)
        .order("fecha", { ascending: false }),
      supabase.rpc("get_saldo_alumno" as any, { p_alumno_id: alumnoId }),
    ]);

    if (movRes.error) {
      console.error(movRes.error);
      toast.error("No se pudieron cargar los movimientos");
    } else {
      setMovimientos(((movRes.data || []) as unknown) as Movimiento[]);
    }
    if (saldoRes.error) {
      console.error(saldoRes.error);
    } else {
      setSaldos((saldoRes.data || []) as SaldoRow[]);
    }
    setLoading(false);
  }, [alumnoId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Cargar lista de planes activos (para el dialog de cambio de plan)
  useEffect(() => {
    let cancel = false;
    supabase
      .from("planes")
      .select("id, nombre, precio, moneda, frecuencia")
      .eq("activo", true)
      .order("nombre")
      .then(({ data }) => {
        if (!cancel) setPlanes(((data as any) || []) as PlanOption[]);
      });
    return () => { cancel = true; };
  }, []);

  // ---- Cancelar suscripción (misma lógica que StudentPlanSection.handleRemovePlan) ----
  const handleCancelSubscription = async () => {
    if (!cancelSub) return;
    setCancelLoading(true);
    try {
      const todayStr = new Date().toISOString().slice(0, 10);
      const { error } = await supabase
        .from("suscripciones")
        .update({
          estado: "cancelada",
          cancelada_motivo: "Anulada desde cuenta corriente",
          cancelada_at: new Date().toISOString(),
          auto_renovacion: false,
          fecha_fin: todayStr,
        } as any)
        .eq("id", cancelSub.id);
      if (error) {
        toast.error("Error al anular: " + (error.message || "Error desconocido"));
        return;
      }
      // Audit log
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data: adminProfile } = await supabase
          .from("admin_profiles")
          .select("email, role")
          .eq("user_id", session.user.id)
          .single();
        await supabase.from("audit_log").insert([{
          user_id: session.user.id,
          user_email: adminProfile?.email || session.user.email || "",
          user_role: adminProfile?.role || "admin",
          action: "anular_suscripcion_cc",
          entity_type: "suscripcion",
          entity_id: cancelSub.id,
          details: { origen: "cuenta_corriente", concepto: cancelSub.concepto },
        }]);
      }
      await logStudentActivity({
        alumnoId,
        eventType: "cambio_plan",
        title: "Suscripción anulada",
        description: `Anulada desde cuenta corriente: ${cancelSub.concepto}`,
        actorRole: "admin",
      });
      toast.success("Suscripción anulada");
      setCancelSub(null);
      await fetchData();
      onSubscriptionsChanged?.();
    } catch (err: any) {
      toast.error(err.message || "Error inesperado");
    } finally {
      setCancelLoading(false);
    }
  };

  // ---- Corregir / cambiar plan de una suscripción existente ----
  const handleChangePlan = async () => {
    if (!changeSub || !changeNewPlanId || changeNewPlanId === changeSub.currentPlanId) {
      setChangeSub(null);
      return;
    }
    setChangeLoading(true);
    try {
      const newPlan = planes.find((p) => p.id === changeNewPlanId);
      const { error } = await supabase
        .from("suscripciones")
        .update({
          plan_id: changeNewPlanId,
          precio_base: newPlan?.precio ?? null,
          precio_final: newPlan?.precio ?? null,
        } as any)
        .eq("id", changeSub.id);
      if (error) {
        if (isDuplicateSubError(error)) {
          toast.error(DUPLICATE_SUB_MSG);
          return;
        }
        toast.error("Error al cambiar de plan: " + (error.message || ""));
        return;
      }

      // Intento de reabsorber el "Excedente" si corresponde
      let absorbedAjusteId: string | null = null;
      let absorbedMonto: number | null = null;
      const oldPrice = Number(changeSub.currentPrice || 0);
      const newPrice = Number(newPlan?.precio || 0);
      const diff = newPrice - oldPrice; // upgrade => positivo
      const sameMoneda = (newPlan?.moneda || "ARS") === (changeSub.currentMoneda || "ARS");
      if (absorbCredit && sameMoneda && diff > 0) {
        // Busca el "Excedente" más reciente en esa moneda cuyo monto sea <= diff
        const { data: candidatos } = await supabase
          .from("cuenta_ajustes")
          .select("id, monto, moneda, concepto, fecha")
          .eq("alumno_id", alumnoId)
          .eq("tipo", "credito")
          .eq("moneda", newPlan?.moneda || "ARS")
          .ilike("concepto", "Excedente%")
          .order("fecha", { ascending: false })
          .limit(10);
        const match = (candidatos || []).find((c: any) => Number(c.monto) <= diff + 0.01);
        if (match) {
          const { error: delErr } = await supabase.from("cuenta_ajustes").delete().eq("id", match.id);
          if (!delErr) {
            absorbedAjusteId = match.id;
            absorbedMonto = Number(match.monto);
          }
        }
      }

      // Audit
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data: adminProfile } = await supabase
          .from("admin_profiles").select("email, role").eq("user_id", session.user.id).single();
        await supabase.from("audit_log").insert([{
          user_id: session.user.id,
          user_email: adminProfile?.email || session.user.email || "",
          user_role: adminProfile?.role || "admin",
          action: "corregir_suscripcion_cc",
          entity_type: "suscripcion",
          entity_id: changeSub.id,
          details: {
            origen: "cuenta_corriente",
            plan_anterior_id: changeSub.currentPlanId,
            plan_nuevo_id: changeNewPlanId,
            plan_nuevo_nombre: newPlan?.nombre,
            precio_anterior: oldPrice,
            precio_nuevo: newPrice,
            diferencia: diff,
            excedente_absorbido_ajuste_id: absorbedAjusteId,
            excedente_absorbido_monto: absorbedMonto,
          },
        }]);
      }
      await logStudentActivity({
        alumnoId,
        eventType: "cambio_plan",
        title: "Suscripción corregida",
        description: `Plan: ${changeSub.concepto} → "${newPlan?.nombre || "—"}"${absorbedMonto ? ` · Excedente absorbido: ${formatPrice(absorbedMonto, newPlan?.moneda || "ARS")}` : ""}`,
        actorRole: "admin",
        referenceType: "plan",
        referenceId: changeNewPlanId,
        referenceLabel: newPlan?.nombre || "—",
      });
      toast.success(absorbedMonto ? `Plan actualizado · Excedente absorbido (${formatPrice(absorbedMonto, newPlan?.moneda || "ARS")})` : "Plan actualizado");
      setChangeSub(null);
      setChangeNewPlanId("");
      await fetchData();
      onSubscriptionsChanged?.();
    } catch (err: any) {
      toast.error(err.message || "Error inesperado");
    } finally {
      setChangeLoading(false);
    }
  };



  const filtered = useMemo(() => {
    return movimientos.filter((m) => {
      if (monedaFilter !== "all" && m.moneda !== monedaFilter) return false;
      if (tipoFilter !== "all" && m.tipo !== tipoFilter) return false;
      return true;
    });
  }, [movimientos, monedaFilter, tipoFilter]);

  const monedasPresentes = useMemo(() => {
    const set = new Set<string>(saldos.map((s) => s.moneda));
    movimientos.forEach((m) => set.add(m.moneda));
    return Array.from(set).sort();
  }, [saldos, movimientos]);

  const handleEditAjuste = (m: Movimiento) => {
    if (m.fuente_tabla !== "cuenta_ajustes") return;
    setEditing({
      id: m.fuente_id,
      tipo: m.tipo === "ajuste_cargo" ? "cargo" : "credito",
      concepto: m.concepto,
      monto: m.tipo === "ajuste_cargo" ? m.debe : m.haber,
      moneda: m.moneda,
      fecha: m.fecha,
      notas: m.referencia_extra?.notas || "",
      medio_pago: m.referencia_extra?.medio_pago || null,
      cuenta_mp_id: m.referencia_extra?.cuenta_mp_id || null,
      referencia_externa: m.referencia_extra?.referencia_externa || null,
    });
    setModalOpen(true);
  };

  const handleDeleteAjuste = async () => {
    if (!deletingId) return;
    const { error } = await supabase.from("cuenta_ajustes").delete().eq("id", deletingId);
    if (error) {
      toast.error("Error al eliminar ajuste");
    } else {
      toast.success("Ajuste eliminado");
      fetchData();
    }
    setDeletingId(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wallet className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-heading font-semibold text-foreground">Cuenta corriente</h3>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setEditing(null);
              setModalOpen(true);
            }}
          >
            <Plus className="h-4 w-4 mr-1" /> Ajuste manual
          </Button>
        </div>
      </div>

      {/* Saldos por moneda */}
      {saldos.length === 0 ? (
        <Card className="p-4 text-sm text-muted-foreground">
          Sin movimientos registrados.
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {saldos.map((s) => {
            const tone =
              s.saldo > 0 ? "text-destructive" : s.saldo < 0 ? "text-emerald-400" : "text-muted-foreground";
            const label =
              s.saldo > 0 ? "Debe" : s.saldo < 0 ? "A favor" : "Sin saldo";
            return (
              <Card key={s.moneda} className="p-4 bg-card/50 border-border">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs uppercase tracking-wider text-muted-foreground">{s.moneda}</span>
                  <span className={`text-[10px] uppercase font-semibold ${tone}`}>{label}</span>
                </div>
                <div className={`text-2xl font-heading font-bold ${tone}`}>
                  {formatPrice(Math.abs(Number(s.saldo) || 0), s.moneda)}
                </div>
                <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
                  <span>Cargos: {formatPrice(Number(s.total_cargos) || 0, s.moneda)}</span>
                  <span>Pagos: {formatPrice(Number(s.total_pagos) || 0, s.moneda)}</span>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={monedaFilter} onValueChange={setMonedaFilter}>
          <SelectTrigger className="h-8 w-32 text-xs">
            <SelectValue placeholder="Moneda" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las monedas</SelectItem>
            {monedasPresentes.map((m) => (
              <SelectItem key={m} value={m}>{m}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={tipoFilter} onValueChange={setTipoFilter}>
          <SelectTrigger className="h-8 w-44 text-xs">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los tipos</SelectItem>
            {Object.entries(TIPO_LABEL).map(([key, v]) => (
              <SelectItem key={key} value={key}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">{filtered.length} movimientos</span>
      </div>

      {/* Tabla de movimientos */}
      <div className="rounded-md border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-secondary/40">
              <TableHead className="text-xs w-24">Fecha</TableHead>
              <TableHead className="text-xs w-32">Origen</TableHead>
              <TableHead className="text-xs">Concepto</TableHead>
              <TableHead className="text-xs w-28">Medio</TableHead>
              <TableHead className="text-xs text-right w-28">Debe</TableHead>
              <TableHead className="text-xs text-right w-28">Haber</TableHead>
              <TableHead className="text-xs w-24">Estado</TableHead>
              <TableHead className="text-xs w-16"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-8">
                  {loading ? "Cargando…" : "Sin movimientos para los filtros seleccionados."}
                </TableCell>
              </TableRow>
            ) : (
              (showAll ? filtered : filtered.slice(0, PREVIEW_LIMIT)).map((m) => {
                const tipoInfo = TIPO_LABEL[m.tipo] || { label: m.tipo, className: "" };
                const isAjuste = m.fuente_tabla === "cuenta_ajustes";
                return (
                  <TableRow key={`${m.fuente_tabla}-${m.fuente_id}-${m.tipo}`} className="text-sm">
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {formatDate(m.fecha)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-[10px] whitespace-nowrap ${tipoInfo.className}`}>
                        {tipoInfo.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-foreground text-sm">{m.concepto}</TableCell>
                    <TableCell className="text-right font-mono text-xs text-destructive whitespace-nowrap">
                      {m.debe > 0 ? formatPrice(Number(m.debe), m.moneda) : "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs text-emerald-400 whitespace-nowrap">
                      {m.haber > 0 ? formatPrice(Number(m.haber), m.moneda) : "—"}
                    </TableCell>
                    <TableCell className="text-[10px] text-muted-foreground capitalize" title={m.estado || ""}>
                      {m.estado || "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        {isAjuste ? (
                          <>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={() => handleEditAjuste(m)}
                              title="Editar ajuste"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => setDeletingId(m.fuente_id)}
                              title="Eliminar ajuste"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        ) : m.tipo === "cargo_suscripcion" && m.estado !== "cancelada" ? (
                          <>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={() => {
                                setChangeSub({
                                  id: m.fuente_id,
                                  concepto: m.concepto,
                                  currentPlanId: m.referencia_extra?.plan_id || null,
                                  currentPrice: Number(m.debe) || 0,
                                  currentMoneda: m.moneda,
                                });
                                setChangeNewPlanId(m.referencia_extra?.plan_id || "");
                                setAbsorbCredit(true);
                              }}
                              title="Corregir / cambiar plan de esta suscripción"
                            >
                              <ArrowRightLeft className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => setCancelSub({ id: m.fuente_id, concepto: m.concepto })}
                              title="Anular suscripción"
                            >
                              <XCircle className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
        {filtered.length > PREVIEW_LIMIT && (
          <div className="border-t border-border bg-secondary/20">
            <Button
              variant="ghost"
              size="sm"
              className="w-full h-9 text-xs rounded-none"
              onClick={() => setShowAll((v) => !v)}
            >
              {showAll ? (
                <><ChevronUp className="h-3.5 w-3.5 mr-1" /> Ver menos</>
              ) : (
                <><ChevronDown className="h-3.5 w-3.5 mr-1" /> Ver los {filtered.length - PREVIEW_LIMIT} movimientos restantes</>
              )}
            </Button>
          </div>
        )}
      </div>

      <AjusteCuentaModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        alumnoId={alumnoId}
        initialValue={editing}
        onSaved={() => {
          setModalOpen(false);
          setEditing(null);
          fetchData();
        }}
      />

      <AlertDialog open={!!deletingId} onOpenChange={(o) => !o && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar ajuste?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. El movimiento será removido de la cuenta corriente del alumno.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteAjuste} className="bg-destructive hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Anular suscripción */}
      <AlertDialog open={!!cancelSub} onOpenChange={(o) => !o && setCancelSub(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Anular esta suscripción?</AlertDialogTitle>
            <AlertDialogDescription>
              Se marcará como <strong>cancelada</strong> con fecha de hoy y se apagará la auto-renovación.
              El cargo se mantiene en la cuenta corriente como histórico.
              <br />
              <span className="text-foreground">{cancelSub?.concepto}</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelLoading}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleCancelSubscription(); }}
              disabled={cancelLoading}
              className="bg-destructive hover:bg-destructive/90"
            >
              {cancelLoading ? "Anulando…" : "Sí, anular"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Corregir / cambiar plan */}
      <Dialog open={!!changeSub} onOpenChange={(o) => { if (!o) { setChangeSub(null); setChangeNewPlanId(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightLeft className="h-4 w-4 text-primary" /> Corregir suscripción
            </DialogTitle>
            <DialogDescription>
              Reemplaza el plan asignado a esta suscripción. Se usa para <strong>corregir</strong> un alta mal cargada (sin prorrateo, conservando fechas). El cargo en cuenta corriente se actualiza automáticamente al precio del nuevo plan.
              <br />
              <span className="text-foreground text-xs">{changeSub?.concepto}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs">Nuevo plan</Label>
              <SelectPlan value={changeNewPlanId} onValueChange={setChangeNewPlanId}>
                <SelectPlanTrigger>
                  <SelectPlanValue placeholder="Elegí un plan…" />
                </SelectPlanTrigger>
                <SelectPlanContent>
                  {planes.map((p) => (
                    <SelectPlanItem key={p.id} value={p.id}>
                      {p.nombre} {p.precio != null ? `· ${formatPrice(p.precio, p.moneda || "ARS")}` : ""}
                    </SelectPlanItem>
                  ))}
                </SelectPlanContent>
              </SelectPlan>
            </div>

            {(() => {
              const newPlan = planes.find((p) => p.id === changeNewPlanId);
              if (!newPlan || !changeSub) return null;
              const oldPrice = Number(changeSub.currentPrice || 0);
              const newPrice = Number(newPlan.precio || 0);
              const moneda = newPlan.moneda || "ARS";
              const sameMoneda = moneda === (changeSub.currentMoneda || "ARS");
              const diff = newPrice - oldPrice;
              return (
                <div className="rounded-md border border-border bg-secondary/30 p-3 text-xs space-y-1">
                  <div className="flex justify-between"><span className="text-muted-foreground">Precio actual</span><span className="font-mono">{formatPrice(oldPrice, changeSub.currentMoneda || "ARS")}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Precio nuevo</span><span className="font-mono">{formatPrice(newPrice, moneda)}</span></div>
                  <div className="flex justify-between border-t border-border pt-1 mt-1">
                    <span className="text-muted-foreground">Diferencia</span>
                    <span className={`font-mono font-semibold ${diff > 0 ? "text-destructive" : diff < 0 ? "text-emerald-400" : ""}`}>
                      {diff > 0 ? "+" : ""}{formatPrice(diff, moneda)}
                    </span>
                  </div>
                  {!sameMoneda && (
                    <p className="text-amber-400 mt-2">⚠ El nuevo plan está en otra moneda ({moneda}). No se intentará reabsorber crédito.</p>
                  )}
                </div>
              );
            })()}

            <label className="flex items-start gap-2 text-xs cursor-pointer select-none">
              <input
                type="checkbox"
                checked={absorbCredit}
                onChange={(e) => setAbsorbCredit(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-border"
              />
              <span className="text-muted-foreground">
                Si el alumno tiene un <strong>Excedente</strong> a favor por igual o menor a la diferencia, eliminarlo automáticamente (reabsorber crédito).
              </span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setChangeSub(null); setChangeNewPlanId(""); }} disabled={changeLoading}>
              Cancelar
            </Button>
            <Button
              onClick={handleChangePlan}
              disabled={changeLoading || !changeNewPlanId || changeNewPlanId === changeSub?.currentPlanId}
            >
              {changeLoading ? "Guardando…" : "Corregir suscripción"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
