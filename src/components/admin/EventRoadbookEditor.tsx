import { useEffect, useState } from "react";
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
import { Map, Plus, Trash2, Save, Sparkles } from "lucide-react";
import {
  Roadbook, RoadbookDay, RoadbookHotel,
  createEmptyRoadbook, normalizeRoadbook, DEFAULT_ROADBOOK_TDF26,
} from "@/lib/roadbook";

interface Props {
  eventId: string;
  eventTitle?: string;
}

const EventRoadbookEditor = ({ eventId, eventTitle }: Props) => {
  const { toast } = useToast();
  const [rb, setRb] = useState<Roadbook>(createEmptyRoadbook());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasContent, setHasContent] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("events" as any)
      .select("roadbook")
      .eq("id", eventId)
      .maybeSingle();
    const raw = (data as any)?.roadbook;
    if (raw) {
      setRb(normalizeRoadbook(raw));
      setHasContent(true);
    } else {
      setRb(createEmptyRoadbook());
      setHasContent(false);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [eventId]);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("events" as any)
      .update({ roadbook: rb as any })
      .eq("id", eventId);
    setSaving(false);
    if (error) {
      toast({ title: "Error al guardar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Roadbook guardado." });
    setHasContent(true);
  };

  const loadTdf26 = () => {
    setRb(structuredClone(DEFAULT_ROADBOOK_TDF26));
    toast({ title: "Plantilla TDF26 cargada. Ajustá lo necesario y guardá." });
  };

  // ───── Día handlers ─────
  const updateDia = (i: number, patch: Partial<RoadbookDay>) =>
    setRb((p) => ({ ...p, dias: p.dias.map((d, idx) => (idx === i ? { ...d, ...patch } : d)) }));
  const addDia = () =>
    setRb((p) => ({
      ...p,
      dias: [...p.dias, { numero: String(p.dias.length + 1), titulo: "", fecha: "", km: "", desnivel: "", hotel: "", gpx_url: "" }],
    }));
  const removeDia = (i: number) =>
    setRb((p) => ({ ...p, dias: p.dias.filter((_, idx) => idx !== i) }));

  // ───── Hotel handlers ─────
  const updateHotel = (i: number, patch: Partial<RoadbookHotel>) =>
    setRb((p) => ({ ...p, alojamientos: p.alojamientos.map((h, idx) => (idx === i ? { ...h, ...patch } : h)) }));
  const addHotel = () => setRb((p) => ({ ...p, alojamientos: [...p.alojamientos, { pais: "", nombre: "", url: "" }] }));
  const removeHotel = (i: number) => setRb((p) => ({ ...p, alojamientos: p.alojamientos.filter((_, idx) => idx !== i) }));

  if (loading) {
    return <p className="text-sm text-muted-foreground animate-pulse">Cargando roadbook…</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Map className="w-5 h-5 text-primary" />
          <h3 className="font-heading font-semibold text-sm uppercase tracking-wide">Roadbook del viaje</h3>
          {hasContent && <Badge variant="outline" className="text-[10px] text-emerald-500 border-emerald-500/30">Guardado</Badge>}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadTdf26}>
            <Sparkles className="w-4 h-4 mr-1" /> Cargar TDF26'
          </Button>
          <Button variant="gold" size="sm" onClick={save} disabled={saving}>
            <Save className="w-4 h-4 mr-1" /> {saving ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Estructura editable del viaje (itinerario, GPX, hoteles, clima, día de salida). Una vez guardado, podés enviarlo por
        email a los participantes desde Novedades → <em>Enviar mail manual</em> → <em>Cargar Roadbook del viaje</em>, y los alumnos
        lo ven dentro de la pantalla del evento.
      </p>

      {/* Encabezado */}
      <div className="rounded-lg border p-3 space-y-3">
        <div className="space-y-1.5">
          <Label>Bajada / intro</Label>
          <Textarea value={rb.intro} onChange={(e) => setRb({ ...rb, intro: e.target.value })} rows={2} />
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Fechas (texto)</Label>
            <Input value={rb.fechas_label} onChange={(e) => setRb({ ...rb, fechas_label: e.target.value })} placeholder="26 de junio — 6 de julio de 2026" />
          </div>
          <div className="space-y-1.5">
            <Label>Recorrido (texto)</Label>
            <Input value={rb.recorrido_label} onChange={(e) => setRb({ ...rb, recorrido_label: e.target.value })} placeholder="Girona · Camprodon · Barcelona" />
          </div>
        </div>
      </div>

      <Accordion type="multiple" defaultValue={["dias"]} className="space-y-2">
        {/* Itinerario / días */}
        <AccordionItem value="dias" className="border rounded-lg px-3">
          <AccordionTrigger className="text-sm">Itinerario · {rb.dias.length} días</AccordionTrigger>
          <AccordionContent>
            <div className="space-y-3">
              {rb.dias.map((d, i) => (
                <div key={i} className="rounded-md border p-3 space-y-2 bg-muted/20">
                  <div className="grid grid-cols-12 gap-2">
                    <div className="col-span-2 space-y-1"><Label className="text-[11px]">#</Label>
                      <Input value={d.numero} onChange={(e) => updateDia(i, { numero: e.target.value })} /></div>
                    <div className="col-span-7 space-y-1"><Label className="text-[11px]">Título</Label>
                      <Input value={d.titulo} onChange={(e) => updateDia(i, { titulo: e.target.value })} /></div>
                    <div className="col-span-3 space-y-1"><Label className="text-[11px]">Fecha</Label>
                      <Input value={d.fecha} onChange={(e) => updateDia(i, { fecha: e.target.value })} placeholder="26/06/26" /></div>
                  </div>
                  <div className="grid grid-cols-12 gap-2">
                    <div className="col-span-3 space-y-1"><Label className="text-[11px]">Km</Label>
                      <Input value={d.km} onChange={(e) => updateDia(i, { km: e.target.value })} /></div>
                    <div className="col-span-3 space-y-1"><Label className="text-[11px]">Desnivel</Label>
                      <Input value={d.desnivel} onChange={(e) => updateDia(i, { desnivel: e.target.value })} placeholder="667 m" /></div>
                    <div className="col-span-6 space-y-1"><Label className="text-[11px]">Hotel</Label>
                      <Input value={d.hotel} onChange={(e) => updateDia(i, { hotel: e.target.value })} /></div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px]">Link GPX</Label>
                    <div className="flex gap-2">
                      <Input value={d.gpx_url || ""} onChange={(e) => updateDia(i, { gpx_url: e.target.value })} placeholder="https://..." />
                      <Button variant="ghost" size="sm" onClick={() => removeDia(i)} className="text-destructive">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={addDia}><Plus className="w-4 h-4 mr-1" /> Agregar día</Button>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Alojamientos */}
        <AccordionItem value="hoteles" className="border rounded-lg px-3">
          <AccordionTrigger className="text-sm">Alojamientos · {rb.alojamientos.length}</AccordionTrigger>
          <AccordionContent>
            <div className="space-y-3">
              {rb.alojamientos.map((h, i) => (
                <div key={i} className="rounded-md border p-3 space-y-2 bg-muted/20">
                  <div className="grid grid-cols-12 gap-2">
                    <div className="col-span-4 space-y-1"><Label className="text-[11px]">País / zona</Label>
                      <Input value={h.pais} onChange={(e) => updateHotel(i, { pais: e.target.value })} /></div>
                    <div className="col-span-8 space-y-1"><Label className="text-[11px]">Nombre</Label>
                      <Input value={h.nombre} onChange={(e) => updateHotel(i, { nombre: e.target.value })} /></div>
                  </div>
                  <div className="flex gap-2 items-end">
                    <div className="flex-1 space-y-1"><Label className="text-[11px]">Link</Label>
                      <Input value={h.url || ""} onChange={(e) => updateHotel(i, { url: e.target.value })} placeholder="https://..." /></div>
                    <Button variant="ghost" size="sm" onClick={() => removeHotel(i)} className="text-destructive">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={addHotel}><Plus className="w-4 h-4 mr-1" /> Agregar alojamiento</Button>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Secciones de texto */}
        {(["bienvenida", "clima", "salida"] as const).map((key) => (
          <AccordionItem key={key} value={key} className="border rounded-lg px-3">
            <AccordionTrigger className="text-sm capitalize">
              {rb[key].titulo || key} {!rb[key].enabled && <Badge variant="outline" className="ml-2 text-[10px]">Oculta</Badge>}
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
                  <Textarea rows={5} value={rb[key].contenido}
                    onChange={(e) => setRb({ ...rb, [key]: { ...rb[key], contenido: e.target.value } })} />
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
};

export default EventRoadbookEditor;
