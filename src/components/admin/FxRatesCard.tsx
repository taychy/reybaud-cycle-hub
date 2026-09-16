import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Coins, ArrowLeftRight, Loader2 } from "lucide-react";
import {
  FX_CURRENCIES, FX_FOREIGN, convertObligation, fetchCurrentFxBook, formatFxArs,
  fxStatusLabel, type FxBook, type FxConversion,
} from "@/lib/fx";

const formatPaymentAmount = (amount: number, currency: string) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency,
    minimumFractionDigits: currency === "ARS" ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);

/** Cotizaciones Reybaud (solo lectura) + calculadora de cobro para el Resumen. */
const FxRatesCard = () => {
  const [book, setBook] = useState<FxBook | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [monto, setMonto] = useState("");
  const [monedaValor, setMonedaValor] = useState("EUR");
  const [monedaPago, setMonedaPago] = useState("ARS");
  const [resultado, setResultado] = useState<FxConversion | null>(null);
  const [calcError, setCalcError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await fetchCurrentFxBook();
        if (alive) setBook(data);
      } catch (e: any) {
        if (alive) setError(e?.message || "No pudimos obtener la cotización vigente.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const estado = useMemo(() => fxStatusLabel(book), [book]);

  const calcular = () => {
    setCalcError(null);
    setResultado(null);
    const amount = Number(String(monto).replace(",", "."));
    if (!book) { setCalcError("Todavía no hay cotización disponible."); return; }
    if (!amount || amount <= 0) { setCalcError("Ingresá un monto mayor a cero."); return; }
    try {
      setResultado(convertObligation(book, amount, monedaValor, monedaPago));
    } catch (e: any) {
      setCalcError(e?.message || "No pudimos calcular la conversión.");
    }
  };

  const invertir = () => {
    setMonedaValor(monedaPago);
    setMonedaPago(monedaValor);
    setResultado(null);
  };

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-heading uppercase tracking-wider flex items-center gap-2">
          <Coins className="w-4 h-4 text-primary" /> Cotizaciones Reybaud
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Cargando cotización…
          </div>
        ) : error ? (
          <p className="text-xs text-destructive">{error}</p>
        ) : book ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th className="text-left font-medium pb-1">Moneda</th>
                    <th className="text-right font-medium pb-1">Compra</th>
                    <th className="text-right font-medium pb-1">Venta</th>
                  </tr>
                </thead>
                <tbody>
                  {FX_FOREIGN.map((code) => (
                    <tr key={code} className="border-t border-border/50">
                      <td className="py-1.5 font-medium">{code}</td>
                      <td className="py-1.5 text-right tabular-nums">{formatFxArs(book.currencies[code].buy)}</td>
                      <td className="py-1.5 text-right tabular-nums">{formatFxArs(book.currencies[code].sell)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-0.5">
              <p className="text-[11px] text-muted-foreground">
                Fuente: {book.source || "BCRA"} + margen Reybaud
                {book.bcraDate ? ` · Referencia ${book.bcraDate}` : ""}
              </p>
              <p className="text-[11px]">
                {book.fresh ? "🟢" : "🟠"} {estado}
              </p>
            </div>

            {/* Calculadora de cobro */}
            <div className="rounded-lg border border-border/60 p-3 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>
                  <Label className="text-xs">Valor que el cliente debe pagar</Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={monto}
                    onChange={(e) => { setMonto(e.target.value); setResultado(null); }}
                    placeholder="0"
                  />
                </div>
                <div>
                  <Label className="text-xs">Moneda del valor</Label>
                  <Select value={monedaValor} onValueChange={(v) => { setMonedaValor(v); setResultado(null); }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {FX_CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Moneda en que quiere pagar</Label>
                  <Select value={monedaPago} onValueChange={(v) => { setMonedaPago(v); setResultado(null); }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {FX_CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" onClick={calcular}>Calcular</Button>
                <Button size="sm" variant="ghost" onClick={invertir} className="text-xs">
                  <ArrowLeftRight className="w-3.5 h-3.5 mr-1" /> Invertir monedas
                </Button>
              </div>

              {calcError && <p className="text-xs text-destructive">{calcError}</p>}

              {resultado && (
                <div className="rounded-lg bg-muted/40 border border-border/60 p-3">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground">El cliente debe pagar</p>
                  <p className="text-2xl font-heading font-bold tabular-nums">
                    {formatPaymentAmount(resultado.amount, monedaPago)}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-1">{resultado.explanation}</p>
                </div>
              )}
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
};

export default FxRatesCard;
