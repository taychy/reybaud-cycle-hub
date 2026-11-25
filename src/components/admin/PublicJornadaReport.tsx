import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Copy, RefreshCw } from "lucide-react";
import { type JornadaOwn, type JornadaStatus } from "@/lib/publicJornada";
type Report = { jornada: JornadaStatus; attendees: (JornadaOwn & { id: string; alumno_id: string | null })[] };

export default function PublicJornadaReport({ slug, publicUrl }: { slug: string; publicUrl: string }) {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const load = async () => {
    setBusy(true); setError("");
    try {
      const { data, error: failure } = await supabase.rpc("admin_public_jornada_report", { p_slug: slug });
      if (failure || !data) { setError("No pudimos consultar las inscripciones. Comprobá tu acceso administrativo."); return; }
      setReport(data as unknown as Report);
    } catch { setError("No pudimos consultar las inscripciones."); }
    finally { setBusy(false); }
  };
  useEffect(() => { void load(); }, [slug]);
  return <section className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <a href={publicUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-primary underline break-all">{publicUrl}</a>
      <Button variant="outline" size="sm" onClick={async () => { try { await navigator.clipboard.writeText(publicUrl); setCopied(true); } catch { setError(`Link público: ${publicUrl}`); } }}><Copy className="w-4 h-4 mr-2" />{copied ? "Copiado" : "Copiar link público"}</Button>
    </div>
    {<>
      <div className="flex justify-between items-center gap-3"><p className="font-semibold">{report ? `${report.jornada.confirmed}/${report.jornada.capacity} confirmados` : "Consultando…"}</p><Button variant="ghost" size="icon" aria-label="Actualizar inscripciones" disabled={busy} onClick={load}><RefreshCw className="w-4 h-4" /></Button></div>
      {error && <p role="alert" className="text-destructive">{error}</p>}
      {report && <div className="overflow-x-auto"><table className="w-full text-sm text-left"><thead><tr className="border-b border-border"><th className="p-2">Persona</th><th className="p-2">WhatsApp</th><th className="p-2">Estado</th><th className="p-2">Origen</th></tr></thead><tbody>
        {report.attendees.map(a => <tr key={a.id} className="border-b border-border"><td className="p-2">{a.first_name} {a.last_name}</td><td className="p-2 whitespace-nowrap">+{a.phone}</td><td className="p-2 whitespace-nowrap">{a.response === "voy" ? "Confirmado" : "No voy / cancelado"}</td><td className="p-2">{a.alumno_id ? "Alumno" : "Público"}</td></tr>)}
      </tbody></table>{!report.attendees.length && <p className="py-4 text-muted-foreground">Todavía no hay respuestas.</p>}</div>}
    </>}
  </section>;
}