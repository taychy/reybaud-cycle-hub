import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Copy, RefreshCw, ChevronDown } from "lucide-react";
import { SCOTT_JORNADA_SLUG, SCOTT_JORNADA_URL, type JornadaOwn, type JornadaStatus } from "@/lib/publicJornada";
type Report = { jornada: JornadaStatus; attendees: (JornadaOwn & { id: string; alumno_id: string | null })[] };

export default function PublicJornadaReport() {
  const [expanded, setExpanded] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const load = async () => {
    setBusy(true); setError("");
    try {
      const { data, error: failure } = await supabase.rpc("admin_public_jornada_report", { p_slug: SCOTT_JORNADA_SLUG });
      if (failure || !data) { setError("No pudimos consultar las inscripciones. Comprobá tu acceso administrativo."); return; }
      setReport(data as unknown as Report);
    } catch { setError("No pudimos consultar las inscripciones."); }
    finally { setBusy(false); }
  };
  useEffect(() => { if (expanded) void load(); }, [expanded]);
  return <section className="border-y border-border py-4 space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Button variant="ghost" onClick={() => setExpanded(!expanded)} aria-expanded={expanded} className="px-0 gap-2"><ChevronDown className="w-4 h-4" />Jornada Scott · 28/11 · Asistencia</Button>
      <Button variant="outline" size="sm" onClick={async () => { try { await navigator.clipboard.writeText(SCOTT_JORNADA_URL); setCopied(true); } catch { setError(`Link público: ${SCOTT_JORNADA_URL}`); } }}><Copy className="w-4 h-4 mr-2" />{copied ? "Copiado" : "Copiar link público"}</Button>
    </div>
    {expanded && <>
      <div className="flex justify-between items-center gap-3"><p className="font-semibold">{report ? `${report.jornada.confirmed}/${report.jornada.capacity} confirmados` : "Consultando…"}</p><Button variant="ghost" size="icon" aria-label="Actualizar inscripciones" disabled={busy} onClick={load}><RefreshCw className="w-4 h-4" /></Button></div>
      {error && <p role="alert" className="text-destructive">{error}</p>}
      {report && <div className="overflow-x-auto"><table className="w-full text-sm text-left"><thead><tr className="border-b border-border"><th className="p-2">Persona</th><th className="p-2">WhatsApp</th><th className="p-2">Estado</th><th className="p-2">Origen</th></tr></thead><tbody>
        {report.attendees.map(a => <tr key={a.id} className="border-b border-border"><td className="p-2">{a.first_name} {a.last_name}</td><td className="p-2 whitespace-nowrap">+{a.phone}</td><td className="p-2 whitespace-nowrap">{a.response === "voy" ? "Confirmado" : "No voy / cancelado"}</td><td className="p-2">{a.alumno_id ? "Alumno" : "Público"}</td></tr>)}
      </tbody></table>{!report.attendees.length && <p className="py-4 text-muted-foreground">Todavía no hay respuestas.</p>}</div>}
    </>}
  </section>;
}