import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, Loader2, AlertTriangle } from "lucide-react";
import { FaltantesForm, MovimientosExistentes, type MovimientoExistente } from "@/components/liquidacion/LiquidacionCargaForm";
import { formatARS, itemTotal, itemValido, mesLabel, toPayload, type Honorario, type ItemDraft } from "@/lib/liquidacionCarga";

type Ctx = {
  error?: "invalid" | "expired";
  coach_nombre?: string;
  mes?: string;
  submission?: { submitted_at: string } | null;
  honorarios?: Honorario[];
  movimientos?: MovimientoExistente[];
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function LiquidacionCargar() {
  const { token = "" } = useParams();
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [items, setItems] = useState<ItemDraft[]>([]);
  const [obs, setObs] = useState("");
  const [ok, setOk] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    document.title = "Liquidación · Reybaud";
    if (!UUID_RE.test(token)) { setCtx({ error: "invalid" }); return; }
    supabase.rpc("get_liquidacion_by_token" as any, { p_token: token }).then(({ data, error }) => {
      setCtx(error ? { error: "invalid" } : (data as Ctx));
    });
  }, [token]);

  if (!ctx) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  }

  if (ctx.error) {
    return (
      <Shell>
        <Card className="bg-card border-border"><CardContent className="p-6 text-center space-y-2">
          <AlertTriangle className="w-8 h-8 text-primary mx-auto" />
          <p className="font-heading text-lg text-foreground">
            {ctx.error === "expired" ? "Este link ya venció" : "Link no válido"}
          </p>
          <p className="text-sm text-muted-foreground">Escribile a administración para que te envíe uno nuevo.</p>
        </CardContent></Card>
      </Shell>
    );
  }

  const mes = ctx.mes!;
  const honorarios = ctx.honorarios || [];
  const enviada = done || !!ctx.submission;
  const totalAgregado = items.reduce((s, i) => s + itemTotal(i, honorarios), 0);

  const enviar = async () => {
    setError(null);
    for (const i of items) {
      const e = itemValido(i, mes);
      if (e) { setError(e); return; }
    }
    setSending(true);
    const { error } = await supabase.rpc("submit_liquidacion_by_token" as any, {
      p_token: token, p_items: toPayload(items, honorarios), p_observaciones: obs || null,
    });
    setSending(false);
    if (error) { setError(error.message || "No pudimos enviar la liquidación"); return; }
    setDone(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <Shell>
      <div className="space-y-1">
        <p className="text-xs uppercase tracking-widest text-primary">Liquidación · <span className="capitalize">{mesLabel(mes)}</span></p>
        <h1 className="font-heading text-2xl text-foreground">{ctx.coach_nombre}</h1>
      </div>

      {enviada && (
        <Card className="border-primary/40 bg-primary/5"><CardContent className="p-4 flex gap-3 items-start">
          <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-foreground">Liquidación enviada</p>
            <p className="text-sm text-muted-foreground">¡Gracias! Administración la va a revisar. Si falta algo, avisale directamente a Natalia.</p>
          </div>
        </CardContent></Card>
      )}

      <Card className="bg-card border-border"><CardContent className="p-4 space-y-3">
        <p className="text-sm font-medium text-foreground">Ya registrado por el sistema</p>
        <MovimientosExistentes movimientos={ctx.movimientos || []} />
      </CardContent></Card>

      {!enviada && (
        <>
          <Card className="bg-card border-border"><CardContent className="p-4 space-y-3">
            <div>
              <p className="text-sm font-medium text-foreground">Agregar faltantes</p>
              <p className="text-xs text-muted-foreground">Solo lo que no aparece arriba: clases no registradas, planillas, reuniones, capacitaciones, viáticos o reintegros.</p>
            </div>
            <FaltantesForm mes={mes} honorarios={honorarios} items={items} onChange={setItems} disabled={sending} />
          </CardContent></Card>

          <Card className="bg-card border-border"><CardContent className="p-4 space-y-3">
            <Textarea placeholder="Comentario para administración (opcional)" value={obs} maxLength={1000}
              onChange={(e) => setObs(e.target.value)} />
            {items.length > 0 && (
              <p className="text-sm flex justify-between"><span className="text-muted-foreground">Total agregado estimado</span>
                <span className="font-semibold text-foreground">{formatARS(totalAgregado)}</span></p>
            )}
            <label className="flex items-start gap-2 text-sm text-foreground cursor-pointer">
              <Checkbox checked={ok} onCheckedChange={(v) => setOk(!!v)} className="mt-0.5" />
              Revisé mi liquidación y está completa
            </label>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button className="w-full" size="lg" disabled={!ok || sending} onClick={enviar}>
              {sending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Enviar liquidación
            </Button>
          </CardContent></Card>
        </>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background pb-[env(safe-area-inset-bottom)]">
      <div className="max-w-xl mx-auto px-4 py-6 space-y-4">{children}</div>
    </div>
  );
}
