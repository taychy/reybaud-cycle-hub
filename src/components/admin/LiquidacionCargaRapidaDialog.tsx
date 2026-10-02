import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { Copy, Loader2 } from "lucide-react";
import { FaltantesForm, MovimientosExistentes, type MovimientoExistente } from "@/components/liquidacion/LiquidacionCargaForm";
import { itemValido, mesLabel, toPayload, type Honorario, type ItemDraft } from "@/lib/liquidacionCarga";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  coaches: { id: string; nombre: string }[];
  mesInicial: string;
  monthOptions: string[];
  onSaved: () => void;
}

export default function LiquidacionCargaRapidaDialog({ open, onOpenChange, coaches, mesInicial, monthOptions, onSaved }: Props) {
  const [coachId, setCoachId] = useState("");
  const [mes, setMes] = useState(mesInicial);
  const [ctx, setCtx] = useState<{ honorarios: Honorario[]; movimientos: MovimientoExistente[]; submission: any } | null>(null);
  const [items, setItems] = useState<ItemDraft[]>([]);
  const [confirmar, setConfirmar] = useState(true);
  const [obs, setObs] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (open) setMes(mesInicial); }, [open, mesInicial]);

  const load = async () => {
    if (!coachId) { setCtx(null); return; }
    const { data, error } = await supabase.rpc("admin_get_liquidacion_context" as any, { p_coach_id: coachId, p_mes: mes });
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    setCtx(data as any);
  };
  useEffect(() => { setItems([]); load(); /* eslint-disable-next-line */ }, [coachId, mes]);

  const copiarLink = async () => {
    if (!coachId) return;
    const { data, error } = await supabase.rpc("admin_get_liquidacion_link" as any, { p_coach_id: coachId, p_mes: mes });
    if (error) { toast({ title: "No se pudo generar el link", description: error.message, variant: "destructive" }); return; }
    await navigator.clipboard.writeText(`${window.location.origin}/liquidacion/cargar/${data}`);
    toast({ title: "Link copiado", description: `Link seguro de ${mesLabel(mes)} para este profesor.` });
  };

  const guardar = async () => {
    for (const i of items) {
      const e = itemValido(i, mes);
      if (e) { toast({ title: "Revisá los faltantes", description: e, variant: "destructive" }); return; }
    }
    if (items.length === 0 && !confirmar) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("admin_cargar_liquidacion" as any, {
      p_coach_id: coachId, p_mes: mes, p_items: toPayload(items, ctx?.honorarios || []),
      p_confirmar: confirmar && !ctx?.submission, p_observaciones: obs || null,
    });
    setBusy(false);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    const r = data as any;
    toast({ title: "Guardado", description: `${r.items} faltante(s) agregados${r.confirmada ? " · liquidación confirmada" : ""}.` });
    setItems([]); setObs("");
    await load();
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Carga rápida de profesor</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Select value={coachId} onValueChange={setCoachId}>
            <SelectTrigger><SelectValue placeholder="Elegí profesor" /></SelectTrigger>
            <SelectContent>{coaches.map((c) => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={mes} onValueChange={setMes}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{monthOptions.map((m) => <SelectItem key={m} value={m} className="capitalize">{mesLabel(m)}</SelectItem>)}</SelectContent>
          </Select>
        </div>

        {coachId && ctx && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              {ctx.submission
                ? <Badge variant="outline" className="text-emerald-400 border-emerald-500/30">Enviada · {new Date(ctx.submission.submitted_at).toLocaleDateString("es-AR")} · {ctx.submission.submitted_by === "admin" ? "por admin" : "por el profesor"}</Badge>
                : <Badge variant="outline">Sin confirmar</Badge>}
              <Button variant="outline" size="sm" onClick={copiarLink}><Copy className="w-4 h-4 mr-2" /> Copiar link del profesor</Button>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">Ya registrado</p>
              <MovimientosExistentes movimientos={ctx.movimientos} />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">Agregar faltantes</p>
              <FaltantesForm mes={mes} honorarios={ctx.honorarios} items={items} onChange={setItems} disabled={busy} />
            </div>
            {!ctx.submission && (
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox checked={confirmar} onCheckedChange={(v) => setConfirmar(!!v)} />
                Confirmar liquidación en nombre del profesor
              </label>
            )}
            <Textarea placeholder="Observaciones (opcional)" value={obs} maxLength={1000} onChange={(e) => setObs(e.target.value)} />
            <Button className="w-full" disabled={busy || (items.length === 0 && (!confirmar || !!ctx.submission))} onClick={guardar}>
              {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Guardar
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
