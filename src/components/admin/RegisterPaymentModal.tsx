import { useState, useEffect, useMemo } from "react";
import { getEffectiveSubStatus, isAdminPayableSubscription } from "@/lib/subscriptionStatus";
import { supabase } from "@/integrations/supabase/client";
import { isDuplicateSubError, DUPLICATE_SUB_MSG } from "@/lib/subscriptionGuard";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PAYMENT_METHODS } from "@/lib/paymentMethods";
import { logStudentActivity } from "@/lib/logStudentActivity";
import { endOfCalendarMonth } from "@/lib/subscriptionPeriod";
import { useStudentDiscounts } from "@/hooks/useStudentDiscounts";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { DollarSign, RefreshCw } from "lucide-react";

interface RegisterPaymentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-selected alumno. If null, a search field is shown. */
  alumnoId?: string | null;
  alumnoNombre?: string | null;
  /** Pre-selected subscription id */
  subscripcionId?: string | null;
  onSuccess?: () => void;
}

interface PendingSub {
  id: string;
  plan_id: string;
  estado: string;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  precio_base: number | null;
  precio_final: number | null;
  descuento_id: string | null;
  metodo_pago: string;
  alumno_id: string;
  planes: { id: string; nombre: string; precio: number; moneda: string } | null;
  alumnos?: { id: string; nombre: string; email: string } | null;
}

export function RegisterPaymentModal({
  open,
  onOpenChange,
  alumnoId,
  alumnoNombre,
  subscripcionId,
  onSuccess,
}: RegisterPaymentModalProps) {
  // Student search (when alumnoId not provided)
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{ id: string; nombre: string; email: string }[]>([]);
  const [selectedAlumnoId, setSelectedAlumnoId] = useState<string | null>(alumnoId || null);
  const [selectedAlumnoName, setSelectedAlumnoName] = useState<string | null>(alumnoNombre || null);

  // Pending subscriptions for selected student
  const [pendingSubs, setPendingSubs] = useState<PendingSub[]>([]);
  const [selectedSubId, setSelectedSubId] = useState<string | null>(subscripcionId || null);
  const [loadingSubs, setLoadingSubs] = useState(false);

  // Saldos (para aplicar saldo a favor a la suscripción)
  const [saldos, setSaldos] = useState<Array<{ moneda: string; saldo: number }>>([]);
  const [aplicarCredito, setAplicarCredito] = useState(false);
  const [creditoAplicado, setCreditoAplicado] = useState<string>("");

  // Payment fields
  const [metodo, setMetodo] = useState("efectivo");
  const [montoPagado, setMontoPagado] = useState("");
  const [fechaPago, setFechaPago] = useState(new Date().toISOString().split("T")[0]);
  const [fechaFin, setFechaFin] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [usarPrecioActual, setUsarPrecioActual] = useState(false);
  const [saving, setSaving] = useState(false);

  // Reset state when modal opens/closes or alumnoId changes
  useEffect(() => {
    if (open) {
      setSelectedAlumnoId(alumnoId || null);
      setSelectedAlumnoName(alumnoNombre || null);
      setSelectedSubId(subscripcionId || null);
      setMetodo("efectivo");
      setMontoPagado("");
      setFechaPago(new Date().toISOString().split("T")[0]);
      setFechaFin("");
      setObservaciones("");
      setUsarPrecioActual(false);
      setSearchQuery("");
      setSearchResults([]);
      setAplicarCredito(false);
      setCreditoAplicado("");
      setSaldos([]);
    }
  }, [open, alumnoId, alumnoNombre, subscripcionId]);

  // Search students
  useEffect(() => {
    if (!open || selectedAlumnoId || searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from("alumnos")
        .select("id, nombre, email")
        .or(`nombre.ilike.%${searchQuery}%,email.ilike.%${searchQuery}%`)
        .limit(10);
      setSearchResults(data || []);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, selectedAlumnoId, open]);

  // Load pending subs for selected student
  useEffect(() => {
    if (!selectedAlumnoId || !open) {
      setPendingSubs([]);
      return;
    }
    setLoadingSubs(true);
    supabase
      .from("suscripciones")
      .select("id, plan_id, estado, fecha_inicio, fecha_fin, precio_base, precio_final, descuento_id, metodo_pago, alumno_id, cancelada_at, planes(id, nombre, precio, moneda)")
      .eq("alumno_id", selectedAlumnoId)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        const allSubs = (data as unknown as (PendingSub & { cancelada_at?: string | null })[]) || [];
        const subs = allSubs.filter(isAdminPayableSubscription);
        setPendingSubs(subs);
        // Auto-select if only one or if subscripcionId matches
        if (subscripcionId && subs.find(s => s.id === subscripcionId)) {
          setSelectedSubId(subscripcionId);
        } else if (subs.length === 1) {
          setSelectedSubId(subs[0].id);
        }
        setLoadingSubs(false);
      });
  }, [selectedAlumnoId, open]);

  // Load saldos (para poder aplicar saldo a favor)
  useEffect(() => {
    if (!selectedAlumnoId || !open) {
      setSaldos([]);
      return;
    }
    supabase
      .rpc("get_saldo_alumno" as any, { p_alumno_id: selectedAlumnoId })
      .then(({ data }) => setSaldos(((data as any) || []).map((r: any) => ({ moneda: r.moneda, saldo: Number(r.saldo) || 0 }))));
  }, [selectedAlumnoId, open]);

  // Discounts for selected student (live calc when sub has no saved discount)
  const { applyDiscount, isSubSecondary, activeNonPausaCount } = useStudentDiscounts(selectedAlumnoId);

  // Compute effective price for a sub: respect saved discount, else apply live student discount
  const getEffectivePrice = (sub: PendingSub | undefined): { price: number; discountId: string | null; baseUsed: number } => {
    if (!sub) return { price: 0, discountId: null, baseUsed: 0 };
    const storedBase = sub.precio_base ?? sub.planes?.precio ?? 0;
    const currentBase = sub.planes?.precio ?? storedBase;
    const isSecondary = isSubSecondary(sub.id);
    // If toggle on → use current plan price, ignore stored discount
    if (usarPrecioActual) {
      const result = applyDiscount(currentBase, "planes", isSecondary);
      return { price: result.final, discountId: result.discount?.id ?? null, baseUsed: currentBase };
    }
    // If sub already has saved discount → respect precio_final
    if (sub.descuento_id) {
      return { price: sub.precio_final ?? storedBase, discountId: sub.descuento_id, baseUsed: storedBase };
    }
    // No saved discount → try to apply live student discount
    const result = applyDiscount(storedBase, "planes", isSecondary);
    return { price: result.final, discountId: result.discount?.id ?? null, baseUsed: storedBase };
  };

  // When sub is selected, pre-fill amount and fecha_fin.
  // IMPORTANTE: la fecha_fin debe respetar el PERÍODO de la sub seleccionada
  // (no recalcularla desde la fecha de pago — eso pisa el período cuando se
  // registra un pago retroactivo de un mes anterior).
  useEffect(() => {
    const sub = pendingSubs.find(s => s.id === selectedSubId);
    if (!sub) return;
    const { price } = getEffectivePrice(sub);
    setMontoPagado(String(price));
    // Si la sub ya tiene fecha_fin, respetarla. Si no, calcularla desde fecha_inicio
    // de la sub (no desde fechaPago, que por default es hoy).
    const basePeriodo = sub.fecha_fin?.substring(0, 10)
      || (sub.fecha_inicio ? endOfCalendarMonth(sub.fecha_inicio.substring(0, 10)) : endOfCalendarMonth(fechaPago));
    setFechaFin(basePeriodo);
  }, [selectedSubId, pendingSubs, activeNonPausaCount, usarPrecioActual]);

  const selectedSub = pendingSubs.find(s => s.id === selectedSubId);


  const handleSubmit = async () => {
    if (!selectedSubId || !selectedAlumnoId) {
      toast.error("Seleccioná un alumno y una suscripción pendiente.");
      return;
    }
    if (!fechaPago) {
      toast.error("Ingresá la fecha de pago.");
      return;
    }
    // fecha_fin: respetar la de la sub seleccionada (su período); solo recalcular
    // si la sub no tenía período definido.
    const subForUpdate = pendingSubs.find(s => s.id === selectedSubId);
    const fechaInicioFinal = subForUpdate?.fecha_inicio?.substring(0, 10) || fechaPago;
    const fechaFinNorm = subForUpdate?.fecha_fin?.substring(0, 10)
      || endOfCalendarMonth(fechaInicioFinal);

    setSaving(true);
    try {
      const montoNum = parseFloat(montoPagado) || 0;
      const sub = subForUpdate;
      const { price: expectedAmount, discountId: effDiscountId, baseUsed } = getEffectivePrice(sub);
      const isParcial = montoNum > 0 && montoNum < expectedAmount;
      const excedente = montoNum > expectedAmount ? montoNum - expectedAmount : 0;

      const newEstado = isParcial ? "pendiente" : "activa";
      const notasParts: string[] = [];
      if (observaciones.trim()) notasParts.push(observaciones.trim());
      if (isParcial) notasParts.push(`Pago parcial: ${montoNum} de ${expectedAmount}`);
      if (excedente > 0) notasParts.push(`Excedente acreditado a cuenta: ${excedente}`);
      notasParts.push(`Registrado por admin el ${fechaPago}`);

      const { error } = await supabase
        .from("suscripciones")
        .update({
          estado: newEstado,
          fecha_inicio: fechaInicioFinal,
          fecha_fin: fechaFinNorm,
          metodo_pago: metodo,
          origen_registro: "cargado_admin",
          notas: notasParts.join(" | "),
          precio_base: baseUsed || undefined,
          precio_final: isParcial ? expectedAmount : expectedAmount,
          descuento_id: effDiscountId ?? undefined,
        } as any)
        .eq("id", selectedSubId);

      if (error) {
        if (isDuplicateSubError(error)) { toast.error(DUPLICATE_SUB_MSG); setSaving(false); return; }
        throw error;
      }

      // Activate student if full payment
      if (newEstado === "activa") {
        await supabase.from("alumnos").update({ estado: "activo" }).eq("id", selectedAlumnoId);
      }

      // Log activity
      const planName = sub?.planes?.nombre || "—";
      const methodLabel = PAYMENT_METHODS.find(m => m.key === metodo)?.label || metodo;
      await logStudentActivity({
        alumnoId: selectedAlumnoId,
        eventType: "pago_registrado",
        title: "Pago registrado por admin",
        description: `${methodLabel} — $${montoNum} — ${planName}${isParcial ? " (parcial)" : ""}`,
        actorRole: "admin",
        referenceType: "suscripcion",
        referenceId: selectedSubId,
        referenceLabel: planName,
      });

      // Audit log
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data: adminProfile } = await supabase.from("admin_profiles").select("email, role").eq("user_id", session.user.id).single();
        await supabase.from("audit_log").insert([{
          user_id: session.user.id,
          user_email: adminProfile?.email || session.user.email || "",
          user_role: adminProfile?.role || "admin",
          action: "registrar_pago",
          entity_type: "suscripcion",
          entity_id: selectedSubId,
          details: {
            alumno: selectedAlumnoName || selectedAlumnoId,
            plan: planName,
            monto: montoNum,
            metodo,
            fecha_pago: fechaPago,
            parcial: isParcial,
          },
        }]);
      }

      // Auto-facturar
      if (sub?.planes && newEstado === "activa") {
        supabase.functions.invoke("auto-facturar", {
          body: {
            alumno_id: selectedAlumnoId,
            concepto: `Suscripción ${planName}`,
            monto: montoNum || sub.planes.precio,
            referencia_tipo: "suscripcion",
            referencia_id: selectedSubId,
            segmento: "escuela",
          },
        }).catch(() => {});
      }

      // Registrar excedente como saldo a favor (cuenta_ajustes credito)
      if (excedente > 0) {
        const { data: { user } } = await supabase.auth.getUser();
        const moneda = sub?.planes?.moneda || "ARS";
        const { error: ajusteErr } = await supabase.from("cuenta_ajustes").insert({
          alumno_id: selectedAlumnoId,
          tipo: "credito",
          concepto: `Excedente de pago — ${planName}`,
          monto: excedente,
          moneda,
          fecha: fechaPago,
          notas: `Pago de ${montoNum} sobre esperado ${expectedAmount}`,
          created_by: user?.id || null,
        });
        if (ajusteErr) console.error("No se pudo registrar saldo a favor:", ajusteErr);
      }

      toast.success(
        isParcial
          ? "Pago parcial registrado"
          : excedente > 0
            ? `Pago registrado · saldo a favor $${excedente}`
            : "Pago registrado correctamente"
      );
      onOpenChange(false);
      onSuccess?.();
    } catch (err: any) {
      toast.error(err.message || "Error al registrar el pago");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-primary" />
            Registrar pago
          </DialogTitle>
          <DialogDescription>
            Registrar un pago externo o manual para un alumno
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Student selection */}
          <div>
            <Label className="text-xs">Alumno</Label>
            {selectedAlumnoId ? (
              <div className="flex items-center justify-between bg-secondary/50 rounded-md px-3 py-2 mt-1">
                <span className="text-sm font-medium">{selectedAlumnoName || selectedAlumnoId}</span>
                {!alumnoId && (
                  <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => { setSelectedAlumnoId(null); setSelectedAlumnoName(null); setSelectedSubId(null); setPendingSubs([]); }}>
                    Cambiar
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-1 mt-1">
                <Input
                  placeholder="Buscar por nombre o email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-9 text-sm"
                />
                {searchResults.length > 0 && (
                  <div className="border rounded-md max-h-32 overflow-y-auto">
                    {searchResults.map(a => (
                      <button
                        key={a.id}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 transition-colors border-b last:border-b-0"
                        onClick={() => { setSelectedAlumnoId(a.id); setSelectedAlumnoName(a.nombre); setSearchQuery(""); setSearchResults([]); }}
                      >
                        <span className="font-medium">{a.nombre}</span>
                        <span className="text-xs text-muted-foreground ml-2">{a.email}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Subscription selection */}
          {selectedAlumnoId && (
            <div>
              <Label className="text-xs">Suscripción pendiente</Label>
              {loadingSubs ? (
                <p className="text-xs text-muted-foreground mt-1">Cargando...</p>
              ) : pendingSubs.length === 0 ? (
                <p className="text-xs text-muted-foreground mt-1">Este alumno no tiene suscripciones pendientes detectadas. Revisá su ficha o el historial de suscripciones.</p>
              ) : (
                <Select value={selectedSubId || ""} onValueChange={setSelectedSubId}>
                  <SelectTrigger className="mt-1 h-9 text-sm"><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                  <SelectContent>
                    {pendingSubs.map(s => {
                      const effective = getEffectiveSubStatus({ estado: s.estado, fecha_fin: s.fecha_fin, cancelada_at: (s as PendingSub & { cancelada_at?: string | null }).cancelada_at });
                      const statusLabel = effective === "pago_pendiente" ? "Pago pendiente" : effective === "acceso_pausado" ? "Acceso pausado" : s.estado;
                      return (
                        <SelectItem key={s.id} value={s.id}>
                          {s.planes?.nombre || "Sin plan"} — {statusLabel} — ${s.precio_final ?? s.precio_base ?? s.planes?.precio ?? 0}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {/* Payment details — only show when sub is selected */}
          {selectedSub && (
            <>
              {/* Plan info */}
              {(() => {
                const moneda = selectedSub.planes?.moneda || "ARS";
                const baseAmount = selectedSub.precio_base ?? selectedSub.planes?.precio ?? 0;
                const { price: effectivePrice, discountId: effDiscountId } = getEffectivePrice(selectedSub);
                const hasDiscount = !!effDiscountId && effectivePrice < baseAmount;
                const live = applyDiscount(baseAmount, "planes", isSubSecondary(selectedSub.id));
                const discountLabel = hasDiscount ? (live.discount?.nombre || "Descuento") : null;
                return (
                  <div className="bg-secondary/30 rounded-md p-3 space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Plan</span>
                      <span className="font-medium">{selectedSub.planes?.nombre || "—"}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Precio base</span>
                      <span className={hasDiscount ? "line-through text-muted-foreground" : "font-medium"}>{moneda} {baseAmount}</span>
                    </div>
                    {hasDiscount && (
                      <div className="flex justify-between text-xs">
                        <span className="text-emerald-500">{discountLabel}</span>
                        <span className="text-emerald-500 font-medium">−{moneda} {baseAmount - effectivePrice}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-xs pt-1 border-t border-border/50">
                      <span className="text-muted-foreground">Monto esperado</span>
                      <span className="font-bold text-foreground">{moneda} {effectivePrice}</span>
                    </div>
                    {selectedSub.fecha_fin && (
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Vencimiento actual</span>
                        <span className="text-destructive font-medium">{selectedSub.fecha_fin}</span>
                      </div>
                    )}
                    {(() => {
                      const storedBase = selectedSub.precio_base ?? selectedSub.planes?.precio ?? 0;
                      const currentBase = selectedSub.planes?.precio ?? storedBase;
                      if (currentBase === storedBase) return null;
                      return (
                        <div className="mt-2 pt-2 border-t border-border/50 flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 text-xs font-medium">
                              <RefreshCw className="w-3 h-3 text-primary" />
                              Usar precio actualizado
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              {moneda} {storedBase} → <span className="text-primary font-medium">{moneda} {currentBase}</span>
                            </p>
                          </div>
                          <Switch checked={usarPrecioActual} onCheckedChange={setUsarPrecioActual} />
                        </div>
                      );
                    })()}
                  </div>
                );
              })()}
              <div>
                <Label className="text-xs">Monto pagado</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={montoPagado}
                  onChange={(e) => setMontoPagado(e.target.value)}
                  className="h-9 text-sm mt-1"
                  placeholder="0.00"
                />
              </div>

              <div>
                <Label className="text-xs">Método de pago</Label>
                <Select value={metodo} onValueChange={setMetodo}>
                  <SelectTrigger className="mt-1 h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.filter(m => m.key !== "mercadopago").map(m => (
                      <SelectItem key={m.key} value={m.key}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs">Fecha de pago</Label>
                <Input
                  type="date"
                  value={fechaPago}
                  onChange={(e) => {
                    setFechaPago(e.target.value);
                    if (e.target.value) setFechaFin(endOfCalendarMonth(e.target.value));
                  }}
                  className="h-9 text-sm mt-1"
                />
              </div>

              <div>
                <Label className="text-xs">Vence (fin de mes calendario)</Label>
                <Input
                  type="date"
                  value={fechaFin}
                  readOnly
                  className="h-9 text-sm mt-1 bg-muted/40 cursor-not-allowed"
                />
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Las mensualidades cierran el último día del mes calendario de la fecha de pago.
                </p>
              </div>

              <div>
                <Label className="text-xs">Observación interna (opcional)</Label>
                <Textarea
                  placeholder="Notas sobre el pago..."
                  value={observaciones}
                  onChange={(e) => setObservaciones(e.target.value)}
                  rows={2}
                  className="text-sm mt-1"
                />
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={saving || !selectedSubId}>
            {saving ? "Registrando..." : "Registrar pago"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
