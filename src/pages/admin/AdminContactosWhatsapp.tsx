import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Download, Users, UserCheck, Clock, Copy, ExternalLink } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { formatPhoneAR } from "@/lib/phoneNormalize";
import { Link } from "react-router-dom";

type Row = {
  id: string;
  created_at: string;
  nombre: string | null;
  apellido: string | null;
  email: string;
  telefono: string | null;
  telefono_normalizado: string | null;
  notas: string | null;
  capturado_por_email: string | null;
  alumno_id: string | null;
  tipo: string;
};

export default function AdminContactosWhatsapp() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("hoy");

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("marketing_contacts")
      .select("id, created_at, nombre, apellido, email, telefono, telefono_normalizado, notas, capturado_por_email, alumno_id, tipo")
      .eq("tipo", "whatsapp_web")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    setRows((data ?? []) as Row[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const todayRows = rows.filter(r => now - new Date(r.created_at).getTime() < dayMs);
  const weekRows = rows.filter(r => now - new Date(r.created_at).getTime() < 7 * dayMs);
  const prospectos = rows.filter(r => !r.alumno_id);
  const alumnos = rows.filter(r => !!r.alumno_id);

  const shown = tab === "hoy" ? todayRows
    : tab === "semana" ? weekRows
    : tab === "prospectos" ? prospectos
    : alumnos;

  const conv = rows.length ? Math.round((alumnos.length / rows.length) * 100) : 0;

  const copyExtensionUrl = () => {
    const url = `${window.location.origin}/reybaud-whatsapp.zip`;
    navigator.clipboard.writeText(url);
    toast({ title: "Link copiado", description: url });
  };

  const downloadExtension = async () => {
    try {
      const res = await fetch("/reybaud-whatsapp.zip");
      if (!res.ok) throw new Error("La extensión aún no está publicada");
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "reybaud-whatsapp.zip";
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-7xl">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Contactos WhatsApp</h1>
          <p className="text-sm text-muted-foreground">Contactos capturados desde WhatsApp Web por el equipo de atención.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={copyExtensionUrl}><Copy className="w-4 h-4 mr-2" />Copiar link</Button>
          <Button onClick={downloadExtension}><Download className="w-4 h-4 mr-2" />Descargar extensión</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi icon={<Clock className="w-4 h-4" />} label="Hoy" value={todayRows.length} />
        <Kpi icon={<Users className="w-4 h-4" />} label="Últ. 7 días" value={weekRows.length} />
        <Kpi icon={<UserCheck className="w-4 h-4" />} label="Convertidos a alumno" value={alumnos.length} />
        <Kpi icon={<Users className="w-4 h-4" />} label="% conversión" value={`${conv}%`} />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Instalación de la extensión (Chrome/Edge/Brave)</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-1">
          <p>1. Descargá el .zip y descomprimilo.</p>
          <p>2. Abrí <code>chrome://extensions</code> y activá <b>Modo desarrollador</b>.</p>
          <p>3. Click en <b>Cargar descomprimida</b> y seleccioná la carpeta.</p>
          <p>4. Abrí <code>web.whatsapp.com</code>. Al costado del chat aparece el panel <b>Reybaud</b> para guardar el contacto.</p>
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="hoy">Hoy ({todayRows.length})</TabsTrigger>
          <TabsTrigger value="semana">Últ. 7 días ({weekRows.length})</TabsTrigger>
          <TabsTrigger value="prospectos">Prospectos ({prospectos.length})</TabsTrigger>
          <TabsTrigger value="alumnos">Alumnos ({alumnos.length})</TabsTrigger>
        </TabsList>
        <TabsContent value={tab}>
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm min-w-[900px]">
                <thead className="bg-muted/40">
                  <tr className="text-left">
                    <th className="p-3">Fecha</th>
                    <th className="p-3">Nombre</th>
                    <th className="p-3">Teléfono</th>
                    <th className="p-3">Email</th>
                    <th className="p-3">Atendió</th>
                    <th className="p-3">Estado</th>
                    <th className="p-3">Notas</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">Cargando…</td></tr>
                  ) : shown.length === 0 ? (
                    <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">Sin contactos</td></tr>
                  ) : shown.map(r => (
                    <tr key={r.id} className="border-t">
                      <td className="p-3 whitespace-nowrap">{new Date(r.created_at).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</td>
                      <td className="p-3">{[r.nombre, r.apellido].filter(Boolean).join(" ") || "—"}</td>
                      <td className="p-3 whitespace-nowrap">{formatPhoneAR(r.telefono_normalizado) || r.telefono || "—"}</td>
                      <td className="p-3">{r.email.startsWith("wa_") ? "—" : r.email}</td>
                      <td className="p-3 text-xs">{r.capturado_por_email ?? "—"}</td>
                      <td className="p-3">
                        {r.alumno_id
                          ? <Badge className="bg-emerald-600">Alumno</Badge>
                          : <Badge variant="outline">Prospecto</Badge>}
                      </td>
                      <td className="p-3 max-w-[280px] truncate" title={r.notas ?? ""}>{r.notas ?? "—"}</td>
                      <td className="p-3">
                        {r.alumno_id && (
                          <Link to={`/admin/alumnos?id=${r.alumno_id}`} className="text-primary text-xs inline-flex items-center gap-1">
                            Ver ficha <ExternalLink className="w-3 h-3" />
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Kpi({ icon, label, value }: { icon: React.ReactNode; label: string; value: number | string }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className="p-2 bg-muted rounded">{icon}</div>
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-xl font-bold">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}
