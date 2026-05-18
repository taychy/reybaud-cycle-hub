import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Plus, Trash2, ShoppingBag } from "lucide-react";
import { formatPrice } from "@/lib/currency";

interface Addon {
  id: string;
  nombre: string;
  precio: number;
  currency: string;
  tipo: string;
  max_por_participante: number | null;
  activo: boolean;
}

interface ContractedAddon {
  id: string;
  reservation_id: string;
  addon_id: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
  currency: string;
  notas: string | null;
  addon?: Addon;
}

interface Props {
  reservationId: string;
  eventId: string;
  onChanged?: () => void;
}

export const ReservationAddonsPanel = ({ reservationId, eventId, onChanged }: Props) => {
  const [available, setAvailable] = useState<Addon[]>([]);
  const [contracted, setContracted] = useState<ContractedAddon[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [selectedAddonId, setSelectedAddonId] = useState<string>("");
  const [qty, setQty] = useState("1");
  const [notas, setNotas] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: addons }, { data: contractedRows }] = await Promise.all([
      supabase.from("event_addons" as any).select("*").eq("event_id", eventId).eq("activo", true).order("sort_order"),
      supabase.from("reservation_addons" as any).select("*, addon:event_addons(*)").eq("reservation_id", reservationId).order("created_at"),
    ]);
    setAvailable((addons as unknown as Addon[]) || []);
    setContracted((contractedRows as unknown as ContractedAddon[]) || []);
    setLoading(false);
  }, [eventId, reservationId]);

  useEffect(() => { load(); }, [load]);

  const addContracted = async () => {
    const addon = available.find((a) => a.id === selectedAddonId);
    if (!addon) { toast.error("Seleccioná un extra"); return; }
    const q = parseInt(qty || "1");
    if (isNaN(q) || q <= 0) { toast.error("Cantidad inválida"); return; }
    setAdding(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("reservation_addons" as any).insert({
      reservation_id: reservationId,
      addon_id: addon.id,
      cantidad: q,
      precio_unitario: addon.precio,
      currency: addon.currency,
      notas: notas.trim() || null,
      added_by: user?.id,
    });
    setAdding(false);
    if (error) { toast.error("Error: " + error.message); return; }
    toast.success("Extra agregado");
    setSelectedAddonId("");
    setQty("1");
    setNotas("");
    load();
    onChanged?.();
  };

  const remove = async (c: ContractedAddon) => {
    if (!confirm(`¿Quitar "${c.addon?.nombre || "extra"}"?`)) return;
    const { error } = await supabase.from("reservation_addons" as any).delete().eq("id", c.id);
    if (error) { toast.error("Error: " + error.message); return; }
    toast.success("Extra quitado");
    load();
    onChanged?.();
  };

  if (loading) {
    return <div className="flex justify-center py-3"><Loader2 className="w-4 h-4 animate-spin" /></div>;
  }

  if (available.length === 0 && contracted.length === 0) {
    return null; // sin extras configurados para este evento
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <ShoppingBag className="w-4 h-4 text-violet-400" />
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Extras contratados</h4>
      </div>

      {contracted.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">Sin extras contratados.</p>
      ) : (
        <div className="space-y-2">
          {contracted.map((c) => (
            <div key={c.id} className="flex items-center gap-2 p-2 rounded-lg border border-border/50 bg-muted/10">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium">{c.addon?.nombre || "—"}</span>
                  <span className="text-xs text-muted-foreground">×{c.cantidad}</span>
                  <span className="text-xs font-medium">{formatPrice(c.subtotal, c.currency as any)}</span>
                </div>
                {c.notas && <p className="text-[11px] text-muted-foreground">{c.notas}</p>}
              </div>
              <Button size="icon" variant="ghost" onClick={() => remove(c)} className="h-7 w-7">
                <Trash2 className="w-3.5 h-3.5 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {available.length > 0 && (
        <div className="rounded-lg border border-border/50 p-2 space-y-2 bg-muted/20">
          <p className="text-xs font-medium">Agregar extra</p>
          <div className="grid grid-cols-[1fr_80px] gap-2">
            <Select value={selectedAddonId} onValueChange={setSelectedAddonId}>
              <SelectTrigger className="h-8"><SelectValue placeholder="Elegí un extra" /></SelectTrigger>
              <SelectContent>
                {available.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.nombre} — {formatPrice(a.precio, a.currency as any)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input className="h-8" type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} />
          </div>
          <Input className="h-8" placeholder="Notas (opcional)" value={notas} onChange={(e) => setNotas(e.target.value)} />
          <Button size="sm" onClick={addContracted} disabled={adding || !selectedAddonId} className="w-full gap-1 h-8">
            {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            Agregar
          </Button>
        </div>
      )}
    </div>
  );
};

export default ReservationAddonsPanel;
