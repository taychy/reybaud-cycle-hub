import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Lock, Plus, Trash2, Power, ChevronDown, ChevronUp } from "lucide-react";

interface EventInstallment {
  id: string;
  event_id: string;
  number: number;
  label: string;
  description: string | null;
  amount: number;
  currency: string;
  due_date: string | null;
  sort_order: number;
  active: boolean;
  payment_method_hint: string | null;
  external_payment_url_template: string | null;
  // Computed
  has_validated_payments?: boolean;
  validated_payments_count?: number;
}

interface Props {
  eventId: string;
  eventCurrency: string;
  eventPrice: number | null;
}

const FIELDS_CRITICAL = ["amount", "currency", "due_date", "number"] as const;

export const EventInstallmentsEditor = ({ eventId, eventCurrency, eventPrice }: Props) => {
  const [items, setItems] = useState<EventInstallment[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [confirmDeactivate, setConfirmDeactivate] = useState<EventInstallment | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: ins, error } = await supabase
      .from("event_installments")
      .select("*")
      .eq("event_id", eventId)
      .order("sort_order", { ascending: true })
      .order("number", { ascending: true });

    if (error) {
      toast.error("Error al cargar cuotas");
      setLoading(false);
      return;
    }

    // Detectar pagos validados por cuota (vía reservation_installments → reservation_payments)
    const ids = (ins || []).map((i: any) => i.id);
    let usageMap: Record<string, number> = {};

    if (ids.length > 0) {
      const { data: ri } = await supabase
        .from("reservation_installments")
        .select("id,event_installment_id")
        .in("event_installment_id", ids);

      const riIds = (ri || []).map((r: any) => r.id);
      if (riIds.length > 0) {
        const { data: pays } = await supabase
          .from("reservation_payments")
          .select("installment_id,status")
          .in("installment_id", riIds)
          .eq("status", "validado");

        const riToEi: Record<string, string> = {};
        (ri || []).forEach((r: any) => { riToEi[r.id] = r.event_installment_id; });

        (pays || []).forEach((p: any) => {
          const eiId = riToEi[p.installment_id];
          if (eiId) usageMap[eiId] = (usageMap[eiId] || 0) + 1;
        });
      }
    }

    const enriched = (ins || []).map((i: any) => ({
      ...i,
      has_validated_payments: (usageMap[i.id] || 0) > 0,
      validated_payments_count: usageMap[i.id] || 0,
    }));

    setItems(enriched);
    setLoading(false);
  }, [eventId]);

  useEffect(() => { load(); }, [load]);

  /**
   * Espejo temporal unidireccional event_installments → events.metadata.installments.
   * Mantiene compatibilidad con lectores legacy (ReservationStatusCard, AdminEventReservations,
   * ReportPaymentDrawer) hasta que Etapa 3/4 los migre a event_installments / reservation_installments.
   *
   * Reglas:
   * - Solo cuotas activas, ordenadas por sort_order y luego number.
   * - amount como string (formato legacy esperado por metadata.installments).
   * - installments_enabled = true si hay alguna cuota activa, false en caso contrario.
   * - installments = [] cuando no hay activas.
   */
  const syncMetadataMirror = useCallback(async () => {
    // Leer estado fresco desde DB (no confiar en el state local)
    const { data: fresh, error: freshErr } = await supabase
      .from("event_installments")
      .select("number,label,amount,currency,due_date,sort_order")
      .eq("event_id", eventId)
      .eq("active", true)
      .order("sort_order", { ascending: true })
      .order("number", { ascending: true });

    if (freshErr) {
      console.warn("[installments mirror] read failed", freshErr);
      return;
    }

    const mirror = (fresh || []).map((c: any) => ({
      number: c.number,
      label: c.label,
      amount: String(c.amount ?? ""),
      due_date: c.due_date || "",
      currency: c.currency,
    }));

    const { data: ev, error: evErr } = await supabase
      .from("events")
      .select("metadata")
      .eq("id", eventId)
      .maybeSingle();

    if (evErr || !ev) {
      console.warn("[installments mirror] event read failed", evErr);
      return;
    }

    const currentMeta = (ev.metadata as Record<string, any>) || {};
    const nextMeta = {
      ...currentMeta,
      installments: mirror,
      installments_enabled: mirror.length > 0,
    };

    const { error: upErr } = await supabase
      .from("events")
      .update({ metadata: nextMeta })
      .eq("id", eventId);

    if (upErr) {
      console.warn("[installments mirror] write failed", upErr);
    }
  }, [eventId]);

  const handleAdd = async () => {
    const nextNumber = items.filter((i) => i.active).length > 0
      ? Math.max(...items.filter((i) => i.active).map((i) => i.number)) + 1
      : 1;
    const remaining = (eventPrice || 0) - items
      .filter((i) => i.active)
      .reduce((s, c) => s + Number(c.amount || 0), 0);

    setSaving("new");
    const { error } = await supabase.from("event_installments").insert({
      event_id: eventId,
      number: nextNumber,
      label: `Cuota ${nextNumber}`,
      amount: remaining > 0 ? remaining : 0,
      currency: eventCurrency || "ARS",
      sort_order: items.length,
      active: true,
    });
    setSaving(null);

    if (error) {
      if (error.code === "23505") {
        toast.error(`Ya existe una cuota activa con número ${nextNumber}`);
      } else {
        toast.error("Error al crear cuota");
      }
      return;
    }
    toast.success("Cuota agregada");
    await syncMetadataMirror();
    load();
  };

  const handleUpdate = async (item: EventInstallment, patch: Partial<EventInstallment>) => {
    // Bloqueo duro para campos críticos cuando hay pagos validados
    if (item.has_validated_payments) {
      const blocked = Object.keys(patch).filter((k) => (FIELDS_CRITICAL as readonly string[]).includes(k));
      if (blocked.length > 0) {
        toast.error(`No se puede editar ${blocked.join(", ")}: la cuota tiene pagos validados`);
        return;
      }
    }

    setSaving(item.id);
    const { error } = await supabase
      .from("event_installments")
      .update(patch)
      .eq("id", item.id);
    setSaving(null);

    if (error) {
      if (error.code === "23505") {
        toast.error("Ya existe una cuota activa con ese número en este evento");
      } else {
        toast.error("Error al guardar");
      }
      return;
    }
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, ...patch } : i)));
  };

  const handleDeactivate = async (item: EventInstallment) => {
    setSaving(item.id);
    const { error } = await supabase
      .from("event_installments")
      .update({ active: false })
      .eq("id", item.id);
    setSaving(null);
    setConfirmDeactivate(null);

    if (error) {
      toast.error("Error al desactivar");
      return;
    }
    toast.success("Cuota desactivada. Las reservas existentes mantienen su snapshot.");
    load();
  };

  const handleDelete = async (item: EventInstallment) => {
    if (item.has_validated_payments) {
      toast.error("No se puede eliminar: tiene pagos validados. Desactivala en su lugar.");
      return;
    }
    setSaving(item.id);
    const { error } = await supabase
      .from("event_installments")
      .delete()
      .eq("id", item.id);
    setSaving(null);

    if (error) {
      toast.error("Error al eliminar (puede tener reservas materializadas). Probá desactivar.");
      return;
    }
    toast.success("Cuota eliminada");
    load();
  };

  const activeItems = items.filter((i) => i.active);
  const totalActive = activeItems.reduce((s, c) => s + Number(c.amount || 0), 0);
  const inactiveCount = items.length - activeItems.length;
  const diff = (eventPrice || 0) - totalActive;

  if (loading) {
    return <p className="text-xs text-muted-foreground">Cargando cuotas…</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-xs text-muted-foreground">
            Plan de cuotas configurable
          </Label>
          <p className="text-[10px] text-muted-foreground/70">
            Plantilla del evento. Los campos críticos se bloquean cuando hay pagos validados.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={handleAdd}
          disabled={saving === "new"}
        >
          <Plus className="w-3 h-3 mr-1" /> Agregar cuota
        </Button>
      </div>

      {activeItems.length === 0 && (
        <p className="text-xs text-muted-foreground italic">
          Sin cuotas configuradas. El evento se cobra como pago único.
        </p>
      )}

      <div className="space-y-2">
        {activeItems.map((item) => {
          const locked = !!item.has_validated_payments;
          const isOpen = expanded[item.id];
          return (
            <div
              key={item.id}
              className={`rounded-lg border p-3 space-y-2 ${
                locked ? "border-amber-500/30 bg-amber-500/5" : "border-border/50 bg-muted/20"
              }`}
            >
              <div className="grid grid-cols-[auto_60px_1fr_110px_90px_140px_auto] gap-2 items-end">
                <span className="text-xs text-muted-foreground font-mono pb-2">
                  {item.sort_order + 1}
                </span>

                <div className="space-y-1">
                  <Label className="text-[10px]">N°</Label>
                  <Input
                    type="number"
                    value={item.number}
                    disabled={locked}
                    className="h-8 text-xs"
                    onBlur={(e) => {
                      const v = parseInt(e.target.value);
                      if (v && v !== item.number) handleUpdate(item, { number: v });
                    }}
                    onChange={(e) => {
                      const v = parseInt(e.target.value);
                      setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, number: v } : i));
                    }}
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-[10px]">Label</Label>
                  <Input
                    value={item.label}
                    className="h-8 text-xs"
                    onBlur={(e) => {
                      if (e.target.value !== item.label) handleUpdate(item, { label: e.target.value });
                    }}
                    onChange={(e) => {
                      setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, label: e.target.value } : i));
                    }}
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-[10px]">Monto</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={item.amount}
                    disabled={locked}
                    className="h-8 text-xs"
                    onBlur={(e) => {
                      const v = parseFloat(e.target.value);
                      if (!isNaN(v) && v !== Number(item.amount)) handleUpdate(item, { amount: v });
                    }}
                    onChange={(e) => {
                      setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, amount: parseFloat(e.target.value) || 0 } : i));
                    }}
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-[10px]">Moneda</Label>
                  <Select
                    value={item.currency}
                    disabled={locked}
                    onValueChange={(v) => handleUpdate(item, { currency: v })}
                  >
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ARS">ARS</SelectItem>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="EUR">EUR</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-[10px]">Vencimiento</Label>
                  <Input
                    type="date"
                    value={item.due_date || ""}
                    disabled={locked}
                    className="h-8 text-xs"
                    onChange={(e) => handleUpdate(item, { due_date: e.target.value || null })}
                  />
                </div>

                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => setExpanded((p) => ({ ...p, [item.id]: !p[item.id] }))}
                    title="Más opciones"
                  >
                    {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </Button>
                  {locked ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-amber-400"
                      onClick={() => setConfirmDeactivate(item)}
                      title="Desactivar (tiene pagos validados, no se puede borrar)"
                    >
                      <Power className="w-4 h-4" />
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => handleDelete(item)}
                      title="Eliminar"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>

              {locked && (
                <div className="flex items-center gap-2 text-[11px] text-amber-300 px-1">
                  <Lock className="w-3 h-3" />
                  <span>
                    {item.validated_payments_count} pago(s) validado(s) · Monto, moneda, vencimiento y número están bloqueados.
                  </span>
                </div>
              )}

              {isOpen && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-2 border-t border-border/30">
                  <div className="space-y-1 md:col-span-2">
                    <Label className="text-[10px]">Descripción interna</Label>
                    <Textarea
                      value={item.description || ""}
                      className="min-h-[50px] text-xs"
                      onBlur={(e) => {
                        if (e.target.value !== (item.description || "")) {
                          handleUpdate(item, { description: e.target.value || null });
                        }
                      }}
                      onChange={(e) => {
                        setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, description: e.target.value } : i));
                      }}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px]">Sugerencia método de pago</Label>
                    <Input
                      value={item.payment_method_hint || ""}
                      placeholder="Transferencia, MP, efectivo…"
                      className="h-8 text-xs"
                      onBlur={(e) => {
                        if (e.target.value !== (item.payment_method_hint || "")) {
                          handleUpdate(item, { payment_method_hint: e.target.value || null });
                        }
                      }}
                      onChange={(e) => {
                        setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, payment_method_hint: e.target.value } : i));
                      }}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px]">Link externo de pago</Label>
                    <Input
                      value={item.external_payment_url_template || ""}
                      placeholder="https://…"
                      className="h-8 text-xs"
                      onBlur={(e) => {
                        if (e.target.value !== (item.external_payment_url_template || "")) {
                          handleUpdate(item, { external_payment_url_template: e.target.value || null });
                        }
                      }}
                      onChange={(e) => {
                        setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, external_payment_url_template: e.target.value } : i));
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {activeItems.length > 0 && (
        <div className="flex items-center justify-between text-xs px-1">
          <span className={Math.abs(diff) < 0.01 ? "text-emerald-400" : "text-amber-400"}>
            Total cuotas activas: {eventCurrency} {totalActive.toLocaleString()}
            {eventPrice ? ` / Precio: ${eventCurrency} ${eventPrice.toLocaleString()}` : ""}
            {Math.abs(diff) >= 0.01 && eventPrice
              ? ` (dif: ${diff > 0 ? "+" : ""}${diff.toLocaleString()})`
              : ""}
          </span>
          {inactiveCount > 0 && (
            <span className="text-muted-foreground">
              {inactiveCount} cuota(s) desactivada(s) en historial
            </span>
          )}
        </div>
      )}

      <AlertDialog open={!!confirmDeactivate} onOpenChange={(o) => !o && setConfirmDeactivate(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Desactivar cuota?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta cuota tiene pagos validados. Al desactivarla:
              <br />• Las reservas que ya la materializaron mantendrán su snapshot intacto.
              <br />• No aparecerá más para nuevas reservas.
              <br />• Podrás volver a crear una cuota con el mismo número si necesitás corregir.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmDeactivate && handleDeactivate(confirmDeactivate)}>
              Desactivar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
