import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { SPECIAL_JORNADA_SUBTYPE, getSpecialJornada, isValidJornadaSlug, jornadaPublicUrl } from "@/lib/specialJornada";

type Props = {
  metadata: Record<string, any>;
  title: string;
  date: string;
  onMetadataChange: (m: Record<string, any>) => void;
};

/** Configures an Escuela event as "Jornada especial" whose CTA opens its public attendance form (public_jornadas). */
export default function SpecialJornadaFields({ metadata, title, date, onMetadataChange }: Props) {
  const enabled = metadata.school_subtype === SPECIAL_JORNADA_SUBTYPE;
  const slug: string = metadata.special_jornada?.slug || "";
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string>("");
  const link = getSpecialJornada(metadata);

  const setSlug = (value: string) => {
    const clean = value.toLowerCase().replace(/[^a-z0-9-]/g, "");
    const prevPath = metadata.special_jornada?.path;
    onMetadataChange({ ...metadata, special_jornada: { slug: clean, ...(prevPath === `/${clean}` ? { path: prevPath } : {}) } });
    setStatus("");
  };

  const toggle = (on: boolean) => {
    if (on) onMetadataChange({ ...metadata, school_subtype: SPECIAL_JORNADA_SUBTYPE, event_nature: "propio_informativo", special_jornada: metadata.special_jornada || { slug: "" } });
    else { const { special_jornada: _s, ...rest } = metadata; onMetadataChange({ ...rest, school_subtype: rest.school_subtype === SPECIAL_JORNADA_SUBTYPE ? undefined : rest.school_subtype }); }
  };

  const check = async () => {
    if (!isValidJornadaSlug(slug)) { setStatus("Identificador inválido: usá minúsculas, números y guiones."); return; }
    setBusy(true);
    const { data, error } = await supabase.from("public_jornadas").select("title,capacity,is_open").eq("slug", slug).maybeSingle();
    setBusy(false);
    if (error) setStatus("No pudimos verificar la inscripción.");
    else setStatus(data ? `Inscripción encontrada: ${data.title} · cupo ${data.capacity} · ${data.is_open ? "abierta" : "cerrada"}` : "No existe todavía. Podés crearla abajo.");
  };

  const create = async () => {
    const capacity = parseInt(String(metadata.max_capacity || ""), 10);
    if (!isValidJornadaSlug(slug) || !title.trim() || !date || !(capacity > 0)) { toast.error("Completá nombre, fecha, cupo máximo e identificador válido."); return; }
    setBusy(true);
    const { error } = await supabase.rpc("admin_upsert_public_jornada", { p_slug: slug, p_title: title.trim(), p_activity_date: date, p_capacity: capacity, p_is_open: true });
    setBusy(false);
    if (error) { toast.error(error.message || "No pudimos guardar la inscripción"); return; }
    toast.success("Inscripción de la jornada guardada");
    void check();
  };

  return (
    <fieldset className="space-y-3 border border-sky-500/30 rounded-lg p-4">
      <legend className="text-xs font-heading uppercase tracking-wider text-sky-300 px-2">Jornada especial (Escuela)</legend>
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="jornada-especial">Es una jornada especial con inscripción pública gratuita</Label>
        <Switch id="jornada-especial" checked={enabled} onCheckedChange={toggle} />
      </div>
      {enabled && <>
        <p className="text-xs text-muted-foreground">El botón "Inscribirme" abre la inscripción de la jornada (sin pago, reserva ni login). Los cupos se cuentan solo allí.</p>
        <div className="space-y-1.5">
          <Label htmlFor="jornada-slug">Identificador de la inscripción</Label>
          <div className="flex gap-2">
            <Input id="jornada-slug" value={slug} maxLength={80} placeholder="taller-mantenimiento-marzo" onChange={(e) => setSlug(e.target.value)} />
            <Button type="button" variant="outline" disabled={busy} onClick={check}>Verificar</Button>
          </div>
          {status && <p className="text-xs" role="status">{status}</p>}
          {status.startsWith("No existe") && <Button type="button" size="sm" variant="outline" disabled={busy} onClick={create}>Crear inscripción con nombre, fecha y cupo de este evento</Button>}
        </div>
        {link ? <p className="text-xs break-all">Link público: <a className="text-primary underline" href={jornadaPublicUrl(link)} target="_blank" rel="noopener noreferrer">{jornadaPublicUrl(link)}</a></p>
          : <p className="text-xs text-amber-400">Sin inscripción válida: el evento no mostrará botón de inscripción.</p>}
      </>}
    </fieldset>
  );
}
