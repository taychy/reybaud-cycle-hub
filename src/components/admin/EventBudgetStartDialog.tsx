import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MONEDAS } from "@/lib/currency";
import { Calculator, CalendarDays, FilePlus2, Search, ChevronRight } from "lucide-react";

export interface BudgetEventOption {
  id: string;
  title: string;
  date: string;
  status: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  events: BudgetEventOption[];
  /** Called with the event id whose budget should be opened. */
  onOpenBudget: (eventId: string) => void;
  /** Called after a new draft event was created (so the list can refresh). */
  onDraftCreated?: () => void;
}

type Mode = "choose" | "nuevo" | "existente";

const TIPOS = [
  { value: "camp", label: "Camp / Viaje" },
  { value: "carrera", label: "Carrera" },
  { value: "record_hora", label: "Escuela" },
];

const todayISO = () => new Date().toISOString().slice(0, 10);

export default function EventBudgetStartDialog({
  open,
  onOpenChange,
  events,
  onOpenBudget,
  onDraftCreated,
}: Props) {
  const [mode, setMode] = useState<Mode>("choose");
  const [saving, setSaving] = useState(false);

  // Nuevo presupuesto
  const [title, setTitle] = useState("");
  const [tipo, setTipo] = useState("camp");
  const [fecha, setFecha] = useState(todayISO());
  const [moneda, setMoneda] = useState("ARS");

  // Evento existente
  const [search, setSearch] = useState("");

  const reset = () => {
    setMode("choose");
    setTitle("");
    setTipo("camp");
    setFecha(todayISO());
    setMoneda("ARS");
    setSearch("");
  };

  const handleOpenChange = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = events.filter((e) => e.status === "borrador" || e.status === "publicado");
    if (!q) return base.slice(0, 30);
    return base
      .filter((e) => e.title.toLowerCase().includes(q) || (e.date || "").includes(q))
      .slice(0, 30);
  }, [events, search]);

  const crearBorrador = async () => {
    if (!title.trim() || !fecha) {
      toast({
        title: "Faltan datos",
        description: "Necesitamos un nombre y una fecha tentativa.",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    const { data: ev, error } = await supabase
      .from("events")
      .insert({
        title: title.trim(),
        type: tipo as any,
        date: fecha,
        currency: moneda,
        status: "borrador",
        estado_publicacion: "borrador",
        visible_to_students: false,
        show_public: false,
        is_active: false,
      } as any)
      .select("id")
      .single();

    if (error || !ev) {
      setSaving(false);
      toast({
        title: "No se pudo crear el presupuesto",
        description: error?.message || "Intentá nuevamente.",
        variant: "destructive",
      });
      return;
    }

    const { error: simError } = await supabase.from("event_cost_simulations").insert({
      event_id: ev.id,
      version: 1,
      nombre: "v1",
      moneda_base: moneda,
    } as any);

    if (simError) {
      // Evitamos dejar un evento huérfano si la simulación no se pudo crear.
      await supabase.from("events").delete().eq("id", ev.id);
      setSaving(false);
      toast({
        title: "No se pudo crear el presupuesto",
        description: simError.message,
        variant: "destructive",
      });
      return;
    }

    setSaving(false);
    toast({
      title: "Presupuesto creado",
      description: "Se creó un evento en borrador (oculto) asociado al presupuesto.",
    });
    onDraftCreated?.();
    handleOpenChange(false);
    onOpenBudget(ev.id);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading uppercase tracking-wider flex items-center gap-2">
            <Calculator className="w-4 h-4 text-primary" /> Crear presupuesto
          </DialogTitle>
          <DialogDescription>
            El presupuesto es el paso previo a publicar un evento.
          </DialogDescription>
        </DialogHeader>

        {mode === "choose" && (
          <div className="space-y-3">
            <button
              onClick={() => setMode("nuevo")}
              className="w-full text-left glass-card rounded-lg p-4 hover:border-primary/50 border border-border/50 transition-colors flex items-center gap-3"
            >
              <FilePlus2 className="w-5 h-5 text-primary shrink-0" />
              <div className="flex-1">
                <div className="text-sm font-semibold">Nuevo presupuesto</div>
                <div className="text-xs text-muted-foreground">
                  Para un evento que todavía no existe. Queda en borrador y oculto.
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>
            <button
              onClick={() => setMode("existente")}
              className="w-full text-left glass-card rounded-lg p-4 hover:border-primary/50 border border-border/50 transition-colors flex items-center gap-3"
            >
              <CalendarDays className="w-5 h-5 text-primary shrink-0" />
              <div className="flex-1">
                <div className="text-sm font-semibold">Presupuesto de evento existente</div>
                <div className="text-xs text-muted-foreground">
                  Elegí un evento ya creado para ver o armar su presupuesto.
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        )}

        {mode === "nuevo" && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Nombre provisional *</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ej: Camp Girona 2027"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Tipo</Label>
                <Select value={tipo} onValueChange={setTipo}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TIPOS.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Moneda base</Label>
                <Select value={moneda} onValueChange={setMoneda}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MONEDAS.map((m) => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Fecha tentativa *</Label>
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
            <p className="text-[11px] text-muted-foreground">
              No se publica nada: el evento se crea en borrador y oculto para alumnos.
            </p>
            <div className="flex justify-between gap-2 pt-1">
              <Button variant="ghost" onClick={() => setMode("choose")}>Volver</Button>
              <Button variant="gold" onClick={crearBorrador} disabled={saving}>
                {saving ? "Creando..." : "Crear y abrir presupuesto"}
              </Button>
            </div>
          </div>
        )}

        {mode === "existente" && (
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                autoFocus
                className="pl-10"
                placeholder="Buscar por nombre o fecha (YYYY-MM-DD)..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="max-h-72 overflow-y-auto space-y-1.5">
              {filtered.length === 0 ? (
                <p className="text-xs text-muted-foreground py-6 text-center">
                  No hay eventos que coincidan.
                </p>
              ) : (
                filtered.map((e) => (
                  <button
                    key={e.id}
                    onClick={() => {
                      handleOpenChange(false);
                      onOpenBudget(e.id);
                    }}
                    className="w-full text-left rounded-lg border border-border/50 bg-card/50 hover:bg-card px-3 py-2.5 transition-colors"
                  >
                    <div className="text-sm font-medium">{e.title}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {e.date} · {e.status}
                    </div>
                  </button>
                ))
              )}
            </div>
            <div className="flex justify-start pt-1">
              <Button variant="ghost" onClick={() => setMode("choose")}>Volver</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
