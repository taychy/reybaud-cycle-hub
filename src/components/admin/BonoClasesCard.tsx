import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Target, Plus, History, Undo2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

interface BonoSub {
  id: string;
  clases_totales: number | null;
  clases_consumidas: number | null;
  clases_vencimiento: string | null;
}

interface Coach {
  id: string;
  nombre: string;
}

interface ClaseLog {
  id: string;
  fecha: string;
  notas: string | null;
  coach_id: string | null;
  coaches?: { nombre: string } | null;
}

const parseDateLocal = (iso: string | null) => {
  if (!iso) return null;
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
};

const fmtDate = (iso: string | null) => {
  const d = parseDateLocal(iso);
  if (!d) return "—";
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" });
};

const diasHasta = (iso: string | null) => {
  const d = parseDateLocal(iso);
  if (!d) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
};

export function BonoClasesCard({
  sub,
  planNombre,
  onChange,
}: {
  sub: BonoSub;
  planNombre: string;
  onChange: () => void;
}) {
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [showConsume, setShowConsume] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<ClaseLog[]>([]);
  const [saving, setSaving] = useState(false);
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [coachId, setCoachId] = useState<string>("none");
  const [notas, setNotas] = useState("");

  const totales = sub.clases_totales || 0;
  const consumidas = sub.clases_consumidas || 0;
  const restantes = Math.max(totales - consumidas, 0);
  const dias = diasHasta(sub.clases_vencimiento);
  const vencido = dias !== null && dias < 0;
  const agotado = restantes <= 0;

  useEffect(() => {
    supabase.from("coaches").select("id, nombre").eq("estado", "activo").order("nombre")
      .then(({ data }) => setCoaches((data as Coach[]) || []));
  }, []);

  const loadHistory = async () => {
    const { data } = await supabase
      .from("clases_consumidas")
      .select("id, fecha, notas, coach_id, coaches(nombre)")
      .eq("suscripcion_id", sub.id)
      .order("fecha", { ascending: false });
    setHistory((data as any) || []);
  };

  const openHistory = async () => {
    setShowHistory(true);
    await loadHistory();
  };

  const handleConsume = async () => {
    setSaving(true);
    const { error } = await supabase.rpc("consumir_clase_bono", {
      p_suscripcion_id: sub.id,
      p_fecha: fecha,
      p_notas: notas || null,
      p_coach_id: coachId === "none" ? null : coachId,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message || "No se pudo registrar la clase");
      return;
    }
    toast.success("Clase registrada");
    setShowConsume(false);
    setNotas("");
    setCoachId("none");
    onChange();
  };

  const handleRevert = async (claseId: string) => {
    if (!confirm("¿Deshacer esta clase? Se devuelve al saldo del bono.")) return;
    const { error } = await supabase.rpc("revertir_clase_bono", { p_clase_id: claseId });
    if (error) { toast.error(error.message); return; }
    toast.success("Clase deshecha");
    await loadHistory();
    onChange();
  };

  const pct = totales > 0 ? Math.round((consumidas / totales) * 100) : 0;

  return (
    <div className="mt-2 rounded-md border border-primary/30 bg-primary/5 p-2.5 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-primary">
          <Target className="w-3.5 h-3.5" />
          Bono · {planNombre}
        </div>
        <Badge variant="outline" className={`text-[10px] ${agotado || vencido ? "border-destructive/40 text-destructive" : "border-primary/40 text-primary"}`}>
          {restantes}/{totales} restantes
        </Badge>
      </div>

      {/* Barra */}
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full transition-all ${agotado ? "bg-destructive" : "bg-primary"}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{consumidas} consumidas · {restantes} libres</span>
        {sub.clases_vencimiento ? (
          <span className={vencido ? "text-destructive font-medium flex items-center gap-1" : ""}>
            {vencido && <AlertTriangle className="w-3 h-3" />}
            {vencido ? `Vencido el ${fmtDate(sub.clases_vencimiento)}` : `Vence ${fmtDate(sub.clases_vencimiento)}${dias !== null ? ` (en ${dias}d)` : ""}`}
          </span>
        ) : (
          <span>Sin vencimiento</span>
        )}
      </div>

      <div className="flex gap-1.5">
        <Button
          variant="outline"
          size="sm"
          className="text-[10px] h-6 px-2 flex-1"
          onClick={() => setShowConsume(true)}
          disabled={agotado || vencido}
        >
          <Plus className="w-3 h-3 mr-0.5" /> Registrar clase
        </Button>
        <Button variant="outline" size="sm" className="text-[10px] h-6 px-2" onClick={openHistory}>
          <History className="w-3 h-3 mr-0.5" /> Historial
        </Button>
      </div>

      {/* Dialog: registrar clase */}
      <Dialog open={showConsume} onOpenChange={setShowConsume}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Registrar clase tomada</DialogTitle>
            <DialogDescription>Se descuenta 1 clase del bono ({restantes} disponibles).</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">Fecha</label>
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Coach (opcional)</label>
              <Select value={coachId} onValueChange={setCoachId}>
                <SelectTrigger><SelectValue placeholder="Sin asignar" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin asignar</SelectItem>
                  {coaches.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Notas (opcional)</label>
              <Textarea value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Ej: técnica en pista, 1h" rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConsume(false)}>Cancelar</Button>
            <Button onClick={handleConsume} disabled={saving}>
              {saving ? "Guardando..." : "Registrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: historial */}
      <Dialog open={showHistory} onOpenChange={setShowHistory}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Historial del bono</DialogTitle>
            <DialogDescription>{consumidas} clases registradas de {totales}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {history.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">Sin clases registradas todavía.</p>
            )}
            {history.map((c) => (
              <div key={c.id} className="flex items-start justify-between gap-2 rounded-md border border-border p-2 text-xs">
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{fmtDate(c.fecha)}</div>
                  {c.coaches?.nombre && <div className="text-muted-foreground">Coach: {c.coaches.nombre}</div>}
                  {c.notas && <div className="text-muted-foreground italic truncate">{c.notas}</div>}
                </div>
                <Button variant="ghost" size="sm" className="text-[10px] h-6 px-2 text-destructive" onClick={() => handleRevert(c.id)}>
                  <Undo2 className="w-3 h-3 mr-0.5" /> Deshacer
                </Button>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
