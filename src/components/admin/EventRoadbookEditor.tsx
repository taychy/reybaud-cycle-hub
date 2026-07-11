import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, useSortable, verticalListSortingStrategy, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Map, Plus, Trash2, Save, ChevronDown, GripVertical, Share2, Layers,
  Link2, Copy, Mail, Clock, CheckCircle2,
} from "lucide-react";
import {
  Roadbook, RoadbookDay,
  createEmptyRoadbook, normalizeRoadbook, DEFAULT_ROADBOOK_TDF26,
} from "@/lib/roadbook";

interface Props {
  eventId: string;
  eventTitle?: string;
}

interface Template {
  id: string;
  nombre: string;
  roadbook: Roadbook;
  updated_at: string;
}

interface ProspectLink {
  id: string;
  token: string;
  nombre: string;
  apellido: string;
  email: string;
  expires_at: string;
  opened_at: string | null;
  created_at: string;
}

// ─── helpers ───
const daysBetween = (isoA: string, isoB: string) => {
  return Math.round((new Date(isoA).getTime() - new Date(isoB).getTime()) / 86400000);
};
const formatRelative = (iso: string) => {
  const days = daysBetween(iso, new Date().toISOString());
  const abs = Math.abs(days);
  if (abs === 0) return "hoy";
  if (abs === 1) return days > 0 ? "en 1 día" : "hace 1 día";
  return days > 0 ? `en ${abs} días` : `hace ${abs} días`;
};
const formatTemplateAge = (iso: string) => {
  const abs = Math.abs(daysBetween(new Date().toISOString(), iso));
  if (abs < 1) return "Actualizada hoy";
  if (abs < 7) return `Actualizada hace ${abs} días`;
  if (abs < 30) return `Actualizada hace ${Math.floor(abs / 7)} semana${Math.floor(abs / 7) === 1 ? "" : "s"}`;
  return `Actualizada hace ${Math.floor(abs / 30)} mes${Math.floor(abs / 30) === 1 ? "" : "es"}`;
};
const genToken = () => {
  const abc = "abcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < 20; i++) s += abc[Math.floor(Math.random() * abc.length)];
  return s;
};

// ─── día sortable ───
const DayRow = ({
  d, index, defaultOpen, onUpdate, onRemove,
}: {
  d: RoadbookDay;
  index: number;
  defaultOpen: boolean;
  onUpdate: (patch: Partial<RoadbookDay>) => void;
  onRemove: () => void;
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: d.numero + "-" + index });
  const [open, setOpen] = useState(defaultOpen);
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  return (
    <div ref={setNodeRef} style={style} className="rounded-lg border bg-card">
      <div className="flex items-center gap-2 px-2 py-2">
        <button
          type="button"
          className="p-1.5 text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing touch-none"
          {...attributes}
          {...listeners}
          aria-label="Reordenar"
        >
          <GripVertical className="w-4 h-4" />
        </button>
        <div className="text-xs text-muted-foreground font-medium w-12 shrink-0">Día {d.numero || index + 1}</div>
        <Input
          value={d.titulo}
          onChange={(e) => onUpdate({ titulo: e.target.value })}
          placeholder="Título del día"
          className="h-8 border-0 bg-transparent focus-visible:ring-1 px-2"
        />
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="p-1.5 text-muted-foreground hover:text-foreground shrink-0"
          aria-label={open ? "Colapsar" : "Expandir"}
        >
          <ChevronDown className={"w-4 h-4 transition-transform " + (open ? "rotate-180" : "")} />
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="p-1.5 text-muted-foreground hover:text-destructive shrink-0"
          aria-label="Eliminar día"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {open && (
        <div className="px-3 pb-3 pt-1 space-y-2 border-t">
          <div className="grid grid-cols-12 gap-2">
            <div className="col-span-2 space-y-1">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">#</Label>
              <Input value={d.numero} onChange={(e) => onUpdate({ numero: e.target.value })} className="h-9" />
            </div>
            <div className="col-span-4 space-y-1">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Km</Label>
              <Input value={d.km} onChange={(e) => onUpdate({ km: e.target.value })} placeholder="56,7" className="h-9" />
            </div>
            <div className="col-span-3 space-y-1">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Desnivel</Label>
              <Input value={d.desnivel} onChange={(e) => onUpdate({ desnivel: e.target.value })} placeholder="555 m" className="h-9" />
            </div>
            <div className="col-span-3 space-y-1">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Fecha</Label>
              <Input value={d.fecha} onChange={(e) => onUpdate({ fecha: e.target.value })} placeholder="26/06/26" className="h-9" />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Hotel</Label>
            <Input value={d.hotel} onChange={(e) => onUpdate({ hotel: e.target.value })} className="h-9" />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Link GPX</Label>
            <Input value={d.gpx_url || ""} onChange={(e) => onUpdate({ gpx_url: e.target.value })} placeholder="https://ridewithgps.com/routes/..." className="h-9" />
          </div>
        </div>
      )}
    </div>
  );
};

const EventRoadbookEditor = ({ eventId, eventTitle }: Props) => {
  const { toast } = useToast();
  const [rb, setRb] = useState<Roadbook>(createEmptyRoadbook());
  const [loadedRb, setLoadedRb] = useState<Roadbook | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Plantillas
  const [templates, setTemplates] = useState<Template[]>([]);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");

  // Prospectos
  const [links, setLinks] = useState<ProspectLink[]>([]);
  const [prosNombre, setProsNombre] = useState("");
  const [prosApellido, setProsApellido] = useState("");
  const [prosEmail, setProsEmail] = useState("");
  const [prosExpira, setProsExpira] = useState("15");
  const [prosSending, setProsSending] = useState(false);
  const [prosMode, setProsMode] = useState<"existing" | "new">("existing");
  const [alumnoSearch, setAlumnoSearch] = useState("");
  const [alumnoResults, setAlumnoResults] = useState<Array<{ id: string; nombre: string; apellido: string | null; email: string }>>([]);
  const [alumnoSearching, setAlumnoSearching] = useState(false);
  const [selectedAlumnoId, setSelectedAlumnoId] = useState<string | null>(null);

  const dirty = useMemo(() => {
    if (!loadedRb) return false;
    return JSON.stringify(rb) !== JSON.stringify(loadedRb);
  }, [rb, loadedRb]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("events" as any).select("roadbook").eq("id", eventId).maybeSingle();
    const raw = (data as any)?.roadbook;
    const normalized = raw ? normalizeRoadbook(raw) : createEmptyRoadbook();
    setRb(normalized);
    setLoadedRb(normalized);
    setLoading(false);
  }, [eventId]);

  const loadTemplates = useCallback(async () => {
    const { data } = await supabase
      .from("roadbook_templates" as any)
      .select("id, nombre, roadbook, updated_at")
      .order("updated_at", { ascending: false });
    setTemplates(((data as any) || []) as Template[]);
  }, []);

  const loadLinks = useCallback(async () => {
    const { data } = await supabase
      .from("roadbook_prospect_links" as any)
      .select("id, token, nombre, apellido, email, expires_at, opened_at, created_at")
      .eq("event_id", eventId)
      .order("created_at", { ascending: false });
    setLinks(((data as any) || []) as ProspectLink[]);
  }, [eventId]);

  useEffect(() => { load(); loadTemplates(); loadLinks(); }, [load, loadTemplates, loadLinks]);

  // Búsqueda de alumnos existentes (debounced)
  useEffect(() => {
    const q = alumnoSearch.trim();
    if (q.length < 2) { setAlumnoResults([]); return; }
    let cancelled = false;
    setAlumnoSearching(true);
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from("alumnos")
        .select("id, nombre, apellido, email")
        .or(`nombre.ilike.%${q}%,apellido.ilike.%${q}%,email.ilike.%${q}%`)
        .limit(8);
      if (!cancelled) {
        setAlumnoResults((data as any[]) || []);
        setAlumnoSearching(false);
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [alumnoSearch]);

  const pickAlumno = (a: { id: string; nombre: string; apellido: string | null; email: string }) => {
    setSelectedAlumnoId(a.id);
    setProsNombre(a.nombre || "");
    setProsApellido(a.apellido || "");
    setProsEmail(a.email || "");
    setAlumnoSearch(`${a.nombre} ${a.apellido || ""}`.trim());
    setAlumnoResults([]);
  };
  const clearAlumnoPick = () => {
    setSelectedAlumnoId(null);
    setAlumnoSearch("");
    setProsNombre(""); setProsApellido(""); setProsEmail("");
  };

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from("events" as any).update({ roadbook: rb as any }).eq("id", eventId);
    setSaving(false);
    if (error) return toast({ title: "Error al guardar", description: error.message, variant: "destructive" });
    setLoadedRb(structuredClone(rb));
    toast({ title: "Roadbook guardado" });
  };

  const applyRoadbook = (nextRb: Roadbook) => {
    if (dirty && !confirm("Tenés cambios sin guardar. ¿Reemplazar por esta plantilla igual?")) return;
    setRb(nextRb);
    toast({ title: "Plantilla cargada. Ajustá y guardá." });
  };

  const saveAsTemplate = async () => {
    if (!newTemplateName.trim()) return;
    const { error } = await supabase.from("roadbook_templates" as any).insert({
      nombre: newTemplateName.trim(),
      roadbook: rb as any,
    });
    if (error) return toast({ title: "Error", description: error.message, variant: "destructive" });
    setNewTemplateName("");
    setSaveTemplateOpen(false);
    loadTemplates();
    toast({ title: "Plantilla guardada" });
  };

  // ─── días ───
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const dayIds = rb.dias.map((d, i) => d.numero + "-" + i);
  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = dayIds.indexOf(String(active.id));
    const newIdx = dayIds.indexOf(String(over.id));
    if (oldIdx < 0 || newIdx < 0) return;
    setRb((p) => ({ ...p, dias: arrayMove(p.dias, oldIdx, newIdx) }));
  };
  const updateDia = (i: number, patch: Partial<RoadbookDay>) =>
    setRb((p) => ({ ...p, dias: p.dias.map((d, idx) => (idx === i ? { ...d, ...patch } : d)) }));
  const addDia = () =>
    setRb((p) => ({
      ...p,
      dias: [...p.dias, { numero: String(p.dias.length + 1), titulo: "", fecha: "", km: "", desnivel: "", hotel: "", gpx_url: "" }],
    }));
  const removeDia = (i: number) => setRb((p) => ({ ...p, dias: p.dias.filter((_, idx) => idx !== i) }));

  // ─── prospectos ───
  const generateLink = async () => {
    if (!prosNombre.trim() || !prosApellido.trim() || !prosEmail.trim()) {
      return toast({ title: "Completá nombre, apellido y email", variant: "destructive" });
    }
    setProsSending(true);
    const token = genToken();
    const expiresDays = parseInt(prosExpira, 10) || 15;
    const expires = new Date(Date.now() + expiresDays * 86400000).toISOString();
    const { data, error } = await supabase.from("roadbook_prospect_links" as any).insert({
      event_id: eventId,
      token,
      nombre: prosNombre.trim(),
      apellido: prosApellido.trim(),
      email: prosEmail.trim().toLowerCase(),
      expires_at: expires,
    }).select("id, token").single();
    if (error || !data) {
      setProsSending(false);
      return toast({ title: "Error", description: error?.message || "No se pudo crear el link", variant: "destructive" });
    }
    // Enviar email
    const { error: fnErr } = await supabase.functions.invoke("send-prospect-roadbook", {
      body: { link_id: (data as any).id },
    });
    setProsSending(false);
    if (fnErr) {
      toast({ title: "Link creado pero falló el envío", description: fnErr.message, variant: "destructive" });
    } else {
      toast({ title: "Link enviado", description: `${prosEmail} recibirá el mail en breve.` });
    }
    setProsNombre(""); setProsApellido(""); setProsEmail("");
    setSelectedAlumnoId(null); setAlumnoSearch(""); setAlumnoResults([]);
    loadLinks();
  };

  const copyLink = (token: string) => {
    const url = `${window.location.origin}/roadbook/${token}`;
    navigator.clipboard.writeText(url);
    toast({ title: "Link copiado" });
  };

  const removeLink = async (id: string) => {
    if (!confirm("¿Eliminar este link? El prospecto ya no podrá acceder.")) return;
    await supabase.from("roadbook_prospect_links" as any).delete().eq("id", id);
    loadLinks();
  };

  if (loading) return <p className="text-sm text-muted-foreground animate-pulse">Cargando roadbook…</p>;

  const statusBadge = dirty ? (
    <Badge variant="outline" className="text-[10px] text-muted-foreground border-muted-foreground/30">Sin guardar</Badge>
  ) : loadedRb ? (
    <Badge variant="outline" className="text-[10px] text-emerald-500 border-emerald-500/30">Guardado</Badge>
  ) : null;

  return (
    <div className="space-y-4">
      {/* ─── Sticky bar ─── */}
      <div className="sticky top-0 z-10 -mx-3 sm:-mx-4 px-3 sm:px-4 py-3 bg-background/95 backdrop-blur border-b flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <Map className="w-5 h-5 text-primary shrink-0" />
          <h3 className="font-heading font-semibold text-sm uppercase tracking-wide truncate">Roadbook del viaje</h3>
          {statusBadge}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Layers className="w-4 h-4 mr-1.5" /> Plantillas
                <ChevronDown className="w-3.5 h-3.5 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel>Plantillas guardadas</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => applyRoadbook(structuredClone(DEFAULT_ROADBOOK_TDF26))}>
                <Layers className="w-4 h-4 mr-2 text-muted-foreground" /> Camp Girona · TDF26 (built-in)
              </DropdownMenuItem>
              {templates.length > 0 && <DropdownMenuSeparator />}
              {templates.map((t) => (
                <DropdownMenuItem key={t.id} onClick={() => applyRoadbook(normalizeRoadbook(t.roadbook))}>
                  <Layers className="w-4 h-4 mr-2 text-muted-foreground" /> {t.nombre}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setSaveTemplateOpen(true)}>
                <Plus className="w-4 h-4 mr-2" /> Guardar actual como plantilla
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="outline"
            size="sm"
            onClick={() => document.getElementById(`roadbook-share-${eventId}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}
          >
            <Share2 className="w-4 h-4 mr-1.5" /> Compartir
          </Button>
          <Button variant="gold" size="sm" onClick={save} disabled={saving || !dirty}>
            <Save className="w-4 h-4 mr-1.5" /> {saving ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      </div>

      {/* ─── Información general ─── */}
      <div className="rounded-xl border p-4 space-y-3 bg-card">
        <div className="flex items-center gap-2">
          <div className="w-1 h-4 bg-primary rounded" />
          <h4 className="font-heading text-sm uppercase tracking-wide">Información general</h4>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Bajada / intro</Label>
          <Textarea value={rb.intro} onChange={(e) => setRb({ ...rb, intro: e.target.value })} rows={2} />
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Fechas</Label>
            <Input value={rb.fechas_label} onChange={(e) => setRb({ ...rb, fechas_label: e.target.value })} placeholder="22 al 25 de octubre de 2026" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Recorrido</Label>
            <Input value={rb.recorrido_label} onChange={(e) => setRb({ ...rb, recorrido_label: e.target.value })} placeholder="San Luis · Argentina" />
          </div>
        </div>
      </div>

      {/* ─── Itinerario ─── */}
      <div className="rounded-xl border p-4 space-y-3 bg-card">
        <div className="flex items-center gap-2">
          <div className="w-1 h-4 bg-primary rounded" />
          <h4 className="font-heading text-sm uppercase tracking-wide">Itinerario · {rb.dias.length} días</h4>
        </div>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={dayIds} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {rb.dias.map((d, i) => (
                <DayRow
                  key={dayIds[i]}
                  d={d}
                  index={i}
                  defaultOpen={i === 0}
                  onUpdate={(patch) => updateDia(i, patch)}
                  onRemove={() => removeDia(i)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
        <Button variant="outline" size="sm" onClick={addDia}>
          <Plus className="w-4 h-4 mr-1" /> Agregar día
        </Button>
      </div>

      {/* ─── Otras secciones (accordion colapsado por default) ─── */}
      <div className="rounded-xl border p-4 space-y-2 bg-card">
        <Accordion type="multiple" className="space-y-2">
          <AccordionItem value="hoteles" className="border rounded-lg px-3">
            <AccordionTrigger className="text-sm py-3">Alojamientos · {rb.alojamientos.filter((h) => h.nombre).length}</AccordionTrigger>
            <AccordionContent>
              <div className="space-y-2">
                {rb.alojamientos.map((h, i) => (
                  <div key={i} className="rounded-md border p-3 space-y-2 bg-muted/20">
                    <div className="grid grid-cols-12 gap-2">
                      <div className="col-span-4 space-y-1">
                        <Label className="text-[11px]">País / zona</Label>
                        <Input value={h.pais} onChange={(e) => setRb((p) => ({ ...p, alojamientos: p.alojamientos.map((x, idx) => idx === i ? { ...x, pais: e.target.value } : x) }))} />
                      </div>
                      <div className="col-span-8 space-y-1">
                        <Label className="text-[11px]">Nombre</Label>
                        <Input value={h.nombre} onChange={(e) => setRb((p) => ({ ...p, alojamientos: p.alojamientos.map((x, idx) => idx === i ? { ...x, nombre: e.target.value } : x) }))} />
                      </div>
                    </div>
                    <div className="flex gap-2 items-end">
                      <div className="flex-1 space-y-1">
                        <Label className="text-[11px]">Link</Label>
                        <Input value={h.url || ""} onChange={(e) => setRb((p) => ({ ...p, alojamientos: p.alojamientos.map((x, idx) => idx === i ? { ...x, url: e.target.value } : x) }))} placeholder="https://..." />
                      </div>
                      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setRb((p) => ({ ...p, alojamientos: p.alojamientos.filter((_, idx) => idx !== i) }))}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={() => setRb((p) => ({ ...p, alojamientos: [...p.alojamientos, { pais: "", nombre: "", url: "" }] }))}>
                  <Plus className="w-4 h-4 mr-1" /> Agregar alojamiento
                </Button>
              </div>
            </AccordionContent>
          </AccordionItem>

          {(["bienvenida", "clima", "salida"] as const).map((key) => (
            <AccordionItem key={key} value={key} className="border rounded-lg px-3">
              <AccordionTrigger className="text-sm py-3 capitalize">
                {rb[key].titulo || key}
                {!rb[key].enabled && <Badge variant="outline" className="ml-2 text-[10px]">Oculta</Badge>}
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Switch checked={rb[key].enabled} onCheckedChange={(v) => setRb({ ...rb, [key]: { ...rb[key], enabled: v } })} />
                    <Label className="text-sm">Mostrar esta sección</Label>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[11px]">Título</Label>
                    <Input value={rb[key].titulo} onChange={(e) => setRb({ ...rb, [key]: { ...rb[key], titulo: e.target.value } })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[11px]">Contenido (doble salto = nuevo párrafo)</Label>
                    <Textarea rows={5} value={rb[key].contenido} onChange={(e) => setRb({ ...rb, [key]: { ...rb[key], contenido: e.target.value } })} />
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>

      {/* ─── Plantillas guardadas (card visible) ─── */}
      <div className="rounded-xl border p-4 space-y-3 bg-card">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-primary" />
          <h4 className="font-heading text-sm uppercase tracking-wide">Plantillas guardadas</h4>
        </div>
        {templates.length === 0 && (
          <p className="text-xs text-muted-foreground">Aún no guardaste plantillas. Guardá el roadbook actual para reutilizarlo en próximos viajes.</p>
        )}
        <div className="space-y-2">
          {templates.map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-3 rounded-lg border p-3 bg-muted/10">
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{t.nombre}</div>
                <div className="text-[11px] text-muted-foreground">{formatTemplateAge(t.updated_at)}</div>
              </div>
              <Button size="sm" variant="outline" onClick={() => applyRoadbook(normalizeRoadbook(t.roadbook))}>Usar</Button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setSaveTemplateOpen(true)}
            className="w-full rounded-lg border border-dashed border-muted-foreground/40 py-3 text-sm text-muted-foreground hover:text-foreground hover:border-foreground/50 transition-colors flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" /> Guardar este roadbook como plantilla
          </button>
        </div>
      </div>

      {/* ─── Compartir con prospectos ─── */}
      <div id={`roadbook-share-${eventId}`} className="rounded-xl border p-4 space-y-3 bg-card">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Link2 className="w-4 h-4 text-primary" />
            <h4 className="font-heading text-sm uppercase tracking-wide">Compartir con clientes potenciales</h4>
          </div>
          <Badge variant="outline" className="text-[10px] text-cyan-500 border-cyan-500/40">Vista teaser</Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          Sin hoteles exactos ni links de GPX. Un link nuevo por cada prospecto.
        </p>

        <div className="rounded-lg border p-3 space-y-2 bg-muted/10">
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Nombre" value={prosNombre} onChange={(e) => setProsNombre(e.target.value)} />
            <Input placeholder="Apellido" value={prosApellido} onChange={(e) => setProsApellido(e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Input className="col-span-2" placeholder="email@prospecto.com" type="email" value={prosEmail} onChange={(e) => setProsEmail(e.target.value)} />
            <Select value={prosExpira} onValueChange={setProsExpira}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7 días</SelectItem>
                <SelectItem value="15">15 días</SelectItem>
                <SelectItem value="30">30 días</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button className="w-full" onClick={generateLink} disabled={prosSending}>
            {prosSending ? "Generando…" : "Generar y enviar link"}
          </Button>
        </div>

        {links.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">Links enviados ({links.length})</div>
            {links.map((l) => {
              const expired = new Date(l.expires_at).getTime() < Date.now();
              const opened = !!l.opened_at;
              const statusEl = expired ? (
                <Badge variant="outline" className="text-[10px] border-destructive/50 text-destructive"><Clock className="w-3 h-3 mr-1" /> Expirado</Badge>
              ) : opened ? (
                <Badge variant="outline" className="text-[10px] border-emerald-500/40 text-emerald-500"><CheckCircle2 className="w-3 h-3 mr-1" /> Abrió {formatRelative(l.opened_at!)}</Badge>
              ) : (
                <Badge variant="outline" className="text-[10px] text-muted-foreground">Sin abrir</Badge>
              );
              return (
                <div key={l.id} className="flex items-center justify-between gap-3 rounded-lg border p-3 bg-muted/5">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{l.nombre} {l.apellido}</div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {l.email} · {expired ? `venció ${formatRelative(l.expires_at)}` : `vence ${formatRelative(l.expires_at)}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {statusEl}
                    <Button size="icon" variant="ghost" onClick={() => copyLink(l.token)} aria-label="Copiar link">
                      <Copy className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="text-destructive" onClick={() => removeLink(l.id)} aria-label="Eliminar">
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── Dialog guardar plantilla ─── */}
      <Dialog open={saveTemplateOpen} onOpenChange={setSaveTemplateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Guardar como plantilla</DialogTitle>
            <DialogDescription>Reutilizá esta estructura en futuros viajes.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Nombre de la plantilla</Label>
            <Input
              value={newTemplateName}
              onChange={(e) => setNewTemplateName(e.target.value)}
              placeholder={eventTitle ? `Roadbook · ${eventTitle}` : "Camp base"}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSaveTemplateOpen(false)}>Cancelar</Button>
            <Button onClick={saveAsTemplate} disabled={!newTemplateName.trim()}>Guardar plantilla</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EventRoadbookEditor;
