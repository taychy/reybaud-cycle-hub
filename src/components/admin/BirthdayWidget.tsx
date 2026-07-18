import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Cake, MessageCircle, Check } from "lucide-react";
import { calcularEdad, mmddCumple } from "@/lib/dates";
import { waLink } from "@/lib/whatsappReminderTemplates";
import { toast } from "sonner";

type CumpleAlumno = {
  id: string;
  nombre: string;
  apellido: string | null;
  telefono: string | null;
  fecha_nacimiento: string;
  ultimo_saludo_cumple_year: number | null;
};

const DEFAULT_TEMPLATE = "¡Feliz cumple {nombre}! 🎂🚴 De todo el equipo Reybaud. Que tengas un año lleno de kilómetros y buenas rutas.";

type Tab = "hoy" | "semana" | "mes";

function inRange(mmdd: string, tab: Tab, ref: Date): boolean {
  const [m, d] = mmdd.split("-").map(Number);
  const today = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  const year = today.getFullYear();
  let candidate = new Date(year, m - 1, d);
  if (candidate < today) candidate = new Date(year + 1, m - 1, d);
  const diffDays = Math.round((candidate.getTime() - today.getTime()) / 86400000);
  if (tab === "hoy") return diffDays === 0;
  if (tab === "semana") return diffDays >= 0 && diffDays <= 7;
  // mes: mismo mes calendario
  return m === today.getMonth() + 1;
}

export default function BirthdayWidget() {
  const [alumnos, setAlumnos] = useState<CumpleAlumno[]>([]);
  const [template, setTemplate] = useState<string>(DEFAULT_TEMPLATE);
  const [tab, setTab] = useState<Tab>("hoy");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("alumnos")
        .select("id, nombre, apellido, telefono, fecha_nacimiento, ultimo_saludo_cumple_year")
        .not("fecha_nacimiento", "is", null)
        .eq("estado", "activo");
      setAlumnos((data || []) as CumpleAlumno[]);

      const { data: tpl } = await supabase
        .from("broadcast_templates")
        .select("content_html")
        .eq("name", "birthday_greeting")
        .maybeSingle();
      if (tpl?.content_html) setTemplate(tpl.content_html);
      setLoading(false);
    })();
  }, []);

  const today = new Date();
  const currentYear = today.getFullYear();

  const filtered = useMemo(() => {
    return alumnos
      .map(a => ({ a, mmdd: mmddCumple(a.fecha_nacimiento)! }))
      .filter(({ mmdd }) => inRange(mmdd, tab, today))
      .sort((x, y) => x.mmdd.localeCompare(y.mmdd))
      .map(({ a }) => a);
  }, [alumnos, tab]);

  const marcarSaludado = async (id: string) => {
    const { error } = await supabase
      .from("alumnos")
      .update({ ultimo_saludo_cumple_year: currentYear } as any)
      .eq("id", id);
    if (error) { toast.error("No se pudo marcar"); return; }
    setAlumnos(prev => prev.map(a => a.id === id ? { ...a, ultimo_saludo_cumple_year: currentYear } : a));
  };

  const handleWA = (a: CumpleAlumno) => {
    if (!a.telefono) { toast.error("Sin teléfono"); return; }
    const edadNueva = (calcularEdad(a.fecha_nacimiento) ?? 0) + (tab === "hoy" ? 0 : 0);
    const msg = template
      .replace(/\{nombre\}/g, a.nombre)
      .replace(/\{edad\}/g, String(edadNueva));
    window.open(waLink(a.telefono, msg), "_blank");
    marcarSaludado(a.id);
  };

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-heading uppercase tracking-wider flex items-center gap-2">
          <Cake className="w-4 h-4 text-pink-500" />
          Cumpleaños
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-1.5 border-b border-border">
          {(["hoy", "semana", "mes"] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 text-xs uppercase tracking-wider transition-colors border-b-2 -mb-px ${
                tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t === "hoy" ? "Hoy" : t === "semana" ? "Esta semana" : "Este mes"}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground py-3">Cargando…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground py-3">Sin cumpleaños en este rango.</p>
        ) : (
          <div className="space-y-1.5">
            {filtered.map(a => {
              const edad = calcularEdad(a.fecha_nacimiento);
              const saludado = a.ultimo_saludo_cumple_year === currentYear;
              const [, mm, dd] = a.fecha_nacimiento.split("-");
              return (
                <div key={a.id} className="flex items-center gap-3 px-3 py-2 rounded-md border border-border/50 hover:bg-muted/30 transition">
                  <div className="text-center w-10 shrink-0">
                    <p className="text-[10px] uppercase text-muted-foreground leading-none">{dd}</p>
                    <p className="text-[10px] uppercase text-muted-foreground leading-none">{mm}</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {a.nombre} {a.apellido ?? ""}
                      {edad !== null && <span className="text-muted-foreground font-normal"> · cumple {edad + (tab === "hoy" ? 0 : 0)}</span>}
                    </p>
                    {a.telefono && <p className="text-[11px] text-muted-foreground">{a.telefono}</p>}
                  </div>
                  {saludado ? (
                    <Button size="sm" variant="ghost" disabled className="gap-1 text-emerald-500">
                      <Check className="w-3.5 h-3.5" /> Saludado
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => handleWA(a)} className="gap-1">
                      <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <p className="text-[10px] text-muted-foreground pt-1">
          Podés editar la plantilla en <span className="font-mono">Plantillas → birthday_greeting</span>. Variables: {"{nombre}"}, {"{edad}"}.
        </p>
      </CardContent>
    </Card>
  );
}
