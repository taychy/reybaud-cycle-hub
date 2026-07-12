import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Copy, Plus, Check, Ticket } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getShareOrigin } from "@/lib/eventLinks";

interface CampEvent { id: string; title: string; date: string; type: string }
interface Descuento {
  id: string;
  codigo: string | null;
  nombre: string;
  valor: number;
  tipo: string;
  activo: boolean;
  aplica_a: string;
  max_usos: number | null;
  usos_actuales: number;
  evento_id: string | null;
  vigencia_hasta: string | null;
}

interface Props {
  descuentoEventoId: string | null;
  descuentoCodigoId: string | null;
  onSelect: (v: { evento_id: string | null; codigo_id: string | null; porcentaje: number | null; url: string | null }) => void;
}

export default function PromoCodePicker({ descuentoEventoId, descuentoCodigoId, onSelect }: Props) {
  const { toast } = useToast();
  const [camps, setCamps] = useState<CampEvent[]>([]);
  const [codes, setCodes] = useState<Descuento[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newCode, setNewCode] = useState({ codigo: "", valor: 10, max_usos: 50, vigencia_hasta: "" });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const today = new Date().toISOString().split("T")[0];
      const { data } = await supabase
        .from("events")
        .select("id, title, date, type")
        .in("type", ["camp", "viaje"])
        .gte("date", today)
        .order("date", { ascending: true });
      setCamps((data as CampEvent[]) || []);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("descuentos")
        .select("id, codigo, nombre, valor, tipo, activo, aplica_a, max_usos, usos_actuales, evento_id, vigencia_hasta")
        .eq("activo", true)
        .in("aplica_a", ["eventos", "todo"])
        .not("codigo", "is", null);
      const rows = ((data as any[]) || []).filter(
        (d: any) => !d.evento_id || d.evento_id === descuentoEventoId,
      ) as Descuento[];
      setCodes(rows);
    })();
  }, [descuentoEventoId]);

  const selectedCamp = camps.find((c) => c.id === descuentoEventoId) || null;
  const selectedCode = codes.find((c) => c.id === descuentoCodigoId) || null;

  const link = useMemo(() => {
    if (!selectedCamp || !selectedCode?.codigo) return "";
    return `${getShareOrigin()}/eventos/${selectedCamp.id}?promo=${selectedCode.codigo}`;
  }, [selectedCamp, selectedCode]);

  const applySelection = (camp: CampEvent | null, code: Descuento | null) => {
    onSelect({
      evento_id: camp?.id || null,
      codigo_id: code?.id || null,
      porcentaje: code?.tipo === "porcentaje" ? Math.round(Number(code.valor)) : null,
      url: camp && code?.codigo ? `${getShareOrigin()}/eventos/${camp.id}?promo=${code.codigo}` : null,
    });
  };

  const handlePickCamp = (id: string) => {
    const c = camps.find((x) => x.id === id) || null;
    applySelection(c, null); // resetea código al cambiar de camp
  };

  const handlePickCode = (id: string) => {
    const c = codes.find((x) => x.id === id) || null;
    applySelection(selectedCamp, c);
  };

  const createCode = async () => {
    if (!selectedCamp) {
      toast({ title: "Elegí primero el camp destino.", variant: "destructive" });
      return;
    }
    const codigo = newCode.codigo.trim().toUpperCase();
    if (!codigo) {
      toast({ title: "Ingresá un código (ej: CAMP10).", variant: "destructive" });
      return;
    }
    setCreating(true);
    const { data, error } = await supabase
      .from("descuentos")
      .insert({
        nombre: `Promo ${codigo} · ${selectedCamp.title}`,
        codigo,
        tipo: "porcentaje",
        valor: newCode.valor,
        activo: true,
        aplica_a: "eventos",
        categoria: "general",
        max_usos: newCode.max_usos > 0 ? newCode.max_usos : null,
        vigencia_hasta: newCode.vigencia_hasta || null,
        evento_id: selectedCamp.id,
      } as any)
      .select("*")
      .single();
    setCreating(false);
    if (error) {
      toast({ title: "No se pudo crear el código", description: error.message, variant: "destructive" });
      return;
    }
    const created = data as unknown as Descuento;
    setCodes((prev) => [created, ...prev]);
    applySelection(selectedCamp, created);
    setNewCode({ codigo: "", valor: 10, max_usos: 50, vigencia_hasta: "" });
    toast({ title: "Código creado y aplicado." });
  };

  const copyLink = async () => {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-1.5">
        <Label className="text-xs">Camp destino</Label>
        <select
          className="h-9 rounded-md border bg-background px-3 text-sm"
          value={descuentoEventoId || ""}
          onChange={(e) => handlePickCamp(e.target.value)}
          disabled={loading}
        >
          <option value="">— Elegí un camp futuro —</option>
          {camps.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title} · {c.date}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-1.5">
        <Label className="text-xs">Código promocional</Label>
        <select
          className="h-9 rounded-md border bg-background px-3 text-sm"
          value={descuentoCodigoId || ""}
          onChange={(e) => handlePickCode(e.target.value)}
          disabled={!selectedCamp}
        >
          <option value="">— {selectedCamp ? "Elegí o creá uno abajo" : "Primero elegí el camp"} —</option>
          {codes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.codigo} · {c.tipo === "porcentaje" ? `${c.valor}%` : `$${c.valor}`}
              {c.max_usos ? ` · ${c.usos_actuales}/${c.max_usos}` : ""}
              {c.evento_id ? " · atado" : " · global"}
            </option>
          ))}
        </select>
      </div>

      {selectedCode && (
        <div className="rounded-md border bg-muted/30 p-3 space-y-2 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono font-semibold text-sm text-primary">{selectedCode.codigo}</span>
            <span className="text-muted-foreground">
              Usos: <strong className="text-foreground">{selectedCode.usos_actuales}</strong>
              {selectedCode.max_usos ? ` / ${selectedCode.max_usos}` : " (sin tope)"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Input value={link} readOnly className="h-8 text-xs font-mono" />
            <Button type="button" size="sm" variant="outline" className="h-8" onClick={copyLink}>
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            </Button>
          </div>
          <p className="text-muted-foreground">
            Este link se completará automáticamente en el botón del email.
          </p>
        </div>
      )}

      {/* Crear código nuevo */}
      <details className="rounded-md border p-3 text-sm">
        <summary className="cursor-pointer flex items-center gap-2 text-xs font-medium">
          <Ticket className="w-3.5 h-3.5" /> Crear código nuevo para este camp
        </summary>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label className="text-xs">Código</Label>
            <Input
              placeholder="CAMP10"
              value={newCode.codigo}
              onChange={(e) => setNewCode({ ...newCode, codigo: e.target.value })}
            />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">% descuento</Label>
            <Input
              type="number"
              min={1}
              max={99}
              value={newCode.valor}
              onChange={(e) => setNewCode({ ...newCode, valor: Number(e.target.value) })}
            />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Cupo total (global)</Label>
            <Input
              type="number"
              min={0}
              value={newCode.max_usos}
              onChange={(e) => setNewCode({ ...newCode, max_usos: Number(e.target.value) })}
            />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Vigencia hasta (opcional)</Label>
            <Input
              type="date"
              value={newCode.vigencia_hasta}
              onChange={(e) => setNewCode({ ...newCode, vigencia_hasta: e.target.value })}
            />
          </div>
          <div className="sm:col-span-2">
            <Button type="button" size="sm" onClick={createCode} disabled={creating || !selectedCamp}>
              {creating ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Plus className="w-3.5 h-3.5 mr-1" />}
              Crear y usar
            </Button>
          </div>
        </div>
      </details>
    </div>
  );
}
