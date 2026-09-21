import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Coins, RefreshCw } from "lucide-react";
import {
  fetchCurrentFxBook,
  formatFxArs,
  fxStatusLabel,
  fxBuyFromReference,
  fxSellFromReference,
  FX_FOREIGN,
  type FxBook,
} from "@/lib/fx";

const LABELS: Record<string, string> = { USD: "Dólar", EUR: "Euro", BRL: "Real" };
const asNumber = (v: unknown) => Number(typeof v === "string" ? v.replace(",", ".") : v) || 0;
const parseMargin = (raw: string | undefined, label: string) => {
  if (raw == null || raw.trim() === "") throw new Error(`Completá ${label}`);
  const value = Number(raw.replace(",", "."));
  if (!Number.isFinite(value)) throw new Error(`${label} debe ser un número válido`);
  return value;
};

/** Configuración central de la Cotización Reybaud: márgenes de Compra y Venta por moneda. */
const StoreFxConfig = () => {
  const { toast } = useToast();
  const [book, setBook] = useState<FxBook | null>(null);
  const [margins, setMargins] = useState<Record<string, { buy: string; sell: string }>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (force = false) => {
    try {
      const data = await fetchCurrentFxBook(force);
      setBook(data);
      setMargins(Object.fromEntries(FX_FOREIGN.map((c) => [c, {
        buy: String(data.currencies[c].buyMarginPct),
        sell: String(data.currencies[c].sellMarginPct),
      }])));
      setError(null);
    } catch (e: any) {
      setError(e?.message || "No pudimos obtener la cotización vigente.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!book) return;
    setSaving(true);
    try {
      const rows: any[] = [];
      for (const code of FX_FOREIGN) {
        const lc = code.toLowerCase();
        const buyMargin = parseMargin(margins[code]?.buy, `el ajuste Compra de ${code}`);
        const sellMargin = parseMargin(margins[code]?.sell, `el margen Venta de ${code}`);
        if (buyMargin <= -100) throw new Error(`El ajuste Compra de ${code} debe ser mayor que -100%`);
        if (sellMargin < 0) throw new Error(`El margen Venta de ${code} no puede ser negativo`);
        const reference = book.currencies[code].reference;
        const buy = fxBuyFromReference(reference, buyMargin);
        const sell = fxSellFromReference(reference, sellMargin);
        rows.push(
          { key: `fx_${lc}_buy_margin_pct`, value: String(buyMargin), description: `Ajuste de compra Reybaud para ${code} (con signo)` },
          { key: `fx_${lc}_sell_margin_pct`, value: String(sellMargin), description: `Margen de venta Reybaud para ${code}` },
        );
        if (reference > 0) {
          rows.push(
            { key: `fx_${lc}_buy_ars`, value: String(buy), description: `Compra Reybaud ${code} → ARS` },
            { key: `fx_${lc}_sell_ars`, value: String(sell), description: `Venta Reybaud ${code} → ARS` },
            { key: `fx_${lc}_ars`, value: String(sell), description: `Cotización Reybaud ${code} → ARS (alias de venta)` },
          );
        }
      }
      rows.push({
        key: "fx_updated_at",
        value: new Date().toISOString(),
        description: "Última actualización de Cotización Reybaud",
      });
      const { error: upErr } = await supabase.from("app_config").upsert(rows as any, { onConflict: "key" });
      if (upErr) throw upErr;
      await load();
      toast({ title: "Márgenes de cotización guardados" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "No se pudo guardar", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const actualizarAhora = async () => {
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  };

  if (loading) return null;

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Coins className="w-4 h-4 text-primary" />
        <p className="text-sm font-heading font-semibold">Cotización Reybaud</p>
      </div>
      <p className="text-xs text-muted-foreground">
        El BCRA aporta solo la referencia. Reybaud aplica su propio ajuste: la Compra es lo que reconocemos
        cuando recibimos moneda extranjera (el ajuste puede ser positivo o negativo) y la Venta es lo que
        cobramos cuando la obligación está en moneda extranjera y el cliente paga en pesos.
      </p>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {book && (
        <div className="space-y-2">
          {FX_FOREIGN.map((code) => {
            const row = book.currencies[code];
            const m = margins[code] || { buy: "", sell: "" };
            const buyPreview = fxBuyFromReference(row.reference, asNumber(m.buy));
            const sellPreview = fxSellFromReference(row.reference, asNumber(m.sell));
            return (
              <div key={code} className="grid grid-cols-1 sm:grid-cols-5 gap-2 items-end rounded-lg border border-border/50 p-3">
                <div>
                  <Label className="text-xs">{LABELS[code]} ({code})</Label>
                  <p className="text-xs text-muted-foreground mt-1">Referencia BCRA</p>
                  <p className="text-sm font-medium">{row.reference ? formatFxArs(row.reference) : "—"}</p>
                </div>
                <div>
                  <Label className="text-xs">Ajuste Compra % (+/−)</Label>
                  <Input
                    type="number" min={-99.99} step="0.1"
                    value={m.buy}
                    onChange={(e) => setMargins((p) => ({ ...p, [code]: { ...p[code], buy: e.target.value } }))}
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Compra Reybaud</Label>
                  <p className="text-sm font-medium mt-1 tabular-nums">{formatFxArs(buyPreview)}</p>
                </div>
                <div>
                  <Label className="text-xs">Margen Venta %</Label>
                  <Input
                    type="number" min={0} step="0.1"
                    value={m.sell}
                    onChange={(e) => setMargins((p) => ({ ...p, [code]: { ...p[code], sell: e.target.value } }))}
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Venta Reybaud</Label>
                  <p className="text-sm font-medium mt-1 tabular-nums">{formatFxArs(sellPreview)}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground">
          Fuente: {book?.source || "BCRA"} · Referencia: {book?.bcraDate || "—"} · {book?.fresh ? "🟢" : "🟠"} {fxStatusLabel(book)}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={actualizarAhora} disabled={refreshing}>
            <RefreshCw className={`w-4 h-4 mr-1 ${refreshing ? "animate-spin" : ""}`} />
            Actualizar ahora
          </Button>
          <Button onClick={save} disabled={saving || !book}>{saving ? "Guardando..." : "Guardar márgenes"}</Button>
        </div>
      </div>
    </div>
  );
};

export default StoreFxConfig;
