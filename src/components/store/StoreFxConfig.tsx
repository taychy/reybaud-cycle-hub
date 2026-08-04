import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Coins } from "lucide-react";

const KEYS = [
  { key: "fx_usd_ars", label: "Dólar (USD → ARS)" },
  { key: "fx_eur_ars", label: "Euro (EUR → ARS)" },
] as const;

/** Tipo de cambio fijo usado para cobrar en pesos productos con precio en USD/EUR. */
const StoreFxConfig = () => {
  const { toast } = useToast();
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("app_config")
        .select("key, value")
        .in("key", KEYS.map((k) => k.key));
      const map: Record<string, string> = {};
      for (const row of (data || []) as any[]) {
        map[row.key] = String(typeof row.value === "object" ? "" : row.value ?? "");
      }
      setValues(map);
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      for (const k of KEYS) {
        const num = Number(values[k.key]);
        if (!num || num <= 0) continue;
        const { error } = await supabase
          .from("app_config")
          .upsert(
            { key: k.key, value: String(num) as any, description: `Tipo de cambio fijo ${k.label}` } as any,
            { onConflict: "key" },
          );
        if (error) throw error;
      }
      toast({ title: "Tipo de cambio guardado" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "No se pudo guardar", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return null;

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Coins className="w-4 h-4 text-primary" />
        <p className="text-sm font-heading font-semibold">Tipo de cambio para cobros</p>
      </div>
      <p className="text-xs text-muted-foreground">
        Mercado Pago cobra siempre en pesos. Los productos con precio en USD o EUR se convierten con este valor al momento de pagar.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
        {KEYS.map((k) => (
          <div key={k.key} className="space-y-1">
            <Label className="text-xs">{k.label}</Label>
            <Input
              type="number"
              min={0}
              value={values[k.key] || ""}
              onChange={(e) => setValues((p) => ({ ...p, [k.key]: e.target.value }))}
              placeholder="Ej: 1350"
            />
          </div>
        ))}
        <Button onClick={save} disabled={saving}>{saving ? "Guardando..." : "Guardar"}</Button>
      </div>
    </div>
  );
};

export default StoreFxConfig;
