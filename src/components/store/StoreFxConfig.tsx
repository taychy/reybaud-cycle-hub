import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Coins } from "lucide-react";

const CURRENCIES = [
  { code: "USD", label: "Dólar" },
  { code: "EUR", label: "Euro" },
  { code: "BRL", label: "Real" },
] as const;

const keyFor = (code: string, suffix: string) => `fx_${code.toLowerCase()}_${suffix}`;
const asNumber = (v: unknown) => Number(typeof v === "string" ? v.replace(",", ".") : v) || 0;

/** Configuración central de la Cotización Reybaud usada en cobros en ARS. */
const StoreFxConfig = () => {
  const { toast } = useToast();
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const keys = [
        "fx_source", "fx_bcra_date", "fx_updated_at",
        ...CURRENCIES.flatMap(({ code }) => [
          keyFor(code, "ars"), keyFor(code, "reference_ars"), keyFor(code, "margin_pct"),
        ]),
      ];
      const { data } = await supabase.from("app_config").select("key,value").in("key", keys);
      const map: Record<string, string> = {};
      for (const row of (data || []) as any[]) map[row.key] = String(row.value ?? "");
      setValues(map);
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const rows: any[] = [];
      for (const { code } of CURRENCIES) {
        const marginKey = keyFor(code, "margin_pct");
        const refKey = keyFor(code, "reference_ars");
        const rateKey = keyFor(code, "ars");
        const margin = asNumber(values[marginKey]);
        if (margin < 0) throw new Error(`El margen de ${code} no puede ser negativo`);
        rows.push({ key: marginKey, value: String(margin), description: `Margen de seguridad Reybaud para ${code}` });

        const reference = asNumber(values[refKey]);
        if (reference > 0) {
          const rate = Math.round(reference * (1 + margin / 100) * 10000) / 10000;
          rows.push({ key: rateKey, value: String(rate), description: `Cotización Reybaud ${code} → ARS` });
          setValues((p) => ({ ...p, [rateKey]: String(rate) }));
        }
      }
      const { error } = await supabase.from("app_config").upsert(rows as any, { onConflict: "key" });
      if (error) throw error;
      toast({ title: "Márgenes de cotización guardados" });
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
        <p className="text-sm font-heading font-semibold">Cotización Reybaud</p>
      </div>
      <p className="text-xs text-muted-foreground">
        Referencia BCRA + margen de seguridad. Se actualiza automáticamente con la primera conversión/cobro del día y se usa para cobrar en pesos precios en moneda extranjera.
      </p>

      <div className="space-y-2">
        {CURRENCIES.map(({ code, label }) => {
          const ref = asNumber(values[keyFor(code, "reference_ars")]);
          const rate = asNumber(values[keyFor(code, "ars")]);
          const marginKey = keyFor(code, "margin_pct");
          return (
            <div key={code} className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-end rounded-lg border border-border/50 p-3">
              <div>
                <Label className="text-xs">{label} ({code})</Label>
                <p className="text-sm font-medium mt-1">${rate ? rate.toLocaleString("es-AR", { maximumFractionDigits: 2 }) : "—"}</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Referencia BCRA</Label>
                <p className="text-sm mt-1">${ref ? ref.toLocaleString("es-AR", { maximumFractionDigits: 2 }) : "—"}</p>
              </div>
              <div>
                <Label className="text-xs">Margen de seguridad %</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.1"
                  value={values[marginKey] || ""}
                  onChange={(e) => setValues((p) => ({ ...p, [marginKey]: e.target.value }))}
                  placeholder={code === "USD" ? "4" : code === "EUR" ? "5" : "7"}
                />
              </div>
              <div className="text-xs text-muted-foreground">
                {rate && ref ? `+${(((rate / ref) - 1) * 100).toFixed(1)}% sobre referencia` : "Pendiente de primera actualización"}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground">
          Fuente: {values.fx_source || "BCRA"} · Referencia: {values.fx_bcra_date || "—"}
        </p>
        <Button onClick={save} disabled={saving}>{saving ? "Guardando..." : "Guardar márgenes"}</Button>
      </div>
    </div>
  );
};

export default StoreFxConfig;
