import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Copy, ExternalLink, MessageCircle, AlertTriangle, CheckCircle2, UserMinus, UserPlus, RefreshCw, Info, HelpCircle } from "lucide-react";
import { extractPhonesFromText, formatPhoneAR, normalizePhoneAR } from "@/lib/phoneNormalize";
import { extractNamesFromText, nameMatchScore } from "@/lib/nameMatch";
import type { Tables } from "@/integrations/supabase/types";

type Alumno = Pick<Tables<"alumnos">, "id" | "nombre" | "apellido" | "email" | "telefono" | "grupo" | "estado">;

interface MatchedAlumno {
  alumno: Alumno;
  via: "telefono" | "nombre";
  source: string; // teléfono o nombre original que matcheó
  score?: number;
}

interface SurplusItem {
  source: string; // lo que vino del WA (nombre o teléfono formateado)
  type: "telefono" | "nombre";
  alumno: Alumno | null; // si matcheó pero está en otro grupo
}

interface Result {
  pastedNames: number;
  pastedPhones: number;
  matched: MatchedAlumno[]; // 🟢
  missing: Alumno[]; // 🟡 alumnos del grupo no encontrados en WA
  surplus: SurplusItem[]; // 🔴 entradas del WA que no son de este grupo
}

const SNIPPET = `(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const panels = [...document.querySelectorAll('div')].filter(d => {
    const s = getComputedStyle(d);
    return (s.overflowY === 'auto' || s.overflowY === 'scroll') && d.clientHeight > 200;
  });
  const panel = panels.sort((a,b) => b.getBoundingClientRect().right - a.getBoundingClientRect().right)[0];
  if (!panel) { alert('No encontré el panel. Abrí "Info del grupo" primero.'); return; }
  const names = new Set();
  const collect = () => {
    panel.querySelectorAll('[role="listitem"], [role="row"], [role="gridcell"]').forEach(row => {
      row.querySelectorAll('span[title], span[dir="auto"]').forEach(s => {
        const t = (s.getAttribute('title') || s.textContent || '').trim();
        if (t && t.length > 1 && t.length < 80
            && !/^[\\+\\d\\s\\-\\(\\)]+$/.test(t)
            && !/^(t[uú]|admin|usted|you)$/i.test(t)) {
          names.add(t);
        }
      });
    });
  };
  panel.scrollTop = 0; await sleep(300);
  let last = -1;
  for (let i = 0; i < 200; i++) {
    collect();
    if (panel.scrollTop === last) break;
    last = panel.scrollTop;
    panel.scrollTop += panel.clientHeight - 50;
    await sleep(220);
  }
  collect();
  const list = [...names].join('\\n');
  let copied = false;
  try {
    if (typeof copy === 'function') { copy(list); copied = true; }
  } catch(e) {}
  if (!copied) {
    try { await navigator.clipboard.writeText(list); copied = true; } catch(e) {}
  }
  console.log('===== INICIO LISTA (' + names.size + ' miembros) =====');
  console.log(list);
  console.log('===== FIN LISTA =====');
  if (copied) {
    console.log('✅ Copiado al portapapeles. Pegá en el conciliador.');
  } else {
    console.log('⚠️ No se pudo copiar automáticamente. Ejecutá: copy(temp1) ó seleccioná la lista de arriba con el mouse y copiala manualmente.');
    window.temp1 = list;
  }
})();`;

const WhatsAppConciliador = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [alumnos, setAlumnos] = useState<Alumno[]>([]);
  const [grupos, setGrupos] = useState<string[]>([]);
  const [selectedGrupo, setSelectedGrupo] = useState<string>("");
  const [pasted, setPasted] = useState<string>("");
  const [result, setResult] = useState<Result | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/admin/login");
        return;
      }
      const { data } = await supabase
        .from("alumnos")
        .select("id, nombre, apellido, email, telefono, grupo, estado")
        .in("estado", ["activo", "vacaciones"]);
      const list = (data || []) as Alumno[];
      setAlumnos(list);
      const uniq = Array.from(new Set(list.map(a => a.grupo).filter(g => g && g !== "Sin grupo")));
      uniq.sort();
      setGrupos(uniq);
      setLoading(false);
    };
    init();
  }, [navigate]);

  const grupoStats = useMemo(() => {
    const map = new Map<string, number>();
    alumnos.forEach(a => {
      if (!a.grupo || a.grupo === "Sin grupo") return;
      map.set(a.grupo, (map.get(a.grupo) || 0) + 1);
    });
    return map;
  }, [alumnos]);

  const previewCount = useMemo(() => {
    return {
      phones: extractPhonesFromText(pasted).length,
      names: extractNamesFromText(pasted).length,
    };
  }, [pasted]);

  const handleAnalyze = () => {
    if (!selectedGrupo) {
      toast({ title: "Falta el grupo", description: "Elegí qué grupo estás conciliando.", variant: "destructive" });
      return;
    }
    if (!pasted.trim()) {
      toast({ title: "Falta el contenido", description: "Pegá la lista del grupo de WhatsApp.", variant: "destructive" });
      return;
    }

    const phones = extractPhonesFromText(pasted);
    const names = extractNamesFromText(pasted);

    const grupoAlumnos = alumnos.filter(a => a.grupo === selectedGrupo);

    // Index por teléfono (todos los alumnos)
    const byPhoneAll = new Map<string, Alumno>();
    for (const a of alumnos) {
      const norm = normalizePhoneAR(a.telefono);
      if (norm && !byPhoneAll.has(norm)) byPhoneAll.set(norm, a);
    }

    const matched: MatchedAlumno[] = [];
    const surplus: SurplusItem[] = [];
    const matchedAlumnoIds = new Set<string>();

    // 1. Match por teléfono (más confiable)
    for (const p of phones) {
      const a = byPhoneAll.get(p);
      if (a && a.grupo === selectedGrupo) {
        if (!matchedAlumnoIds.has(a.id)) {
          matched.push({ alumno: a, via: "telefono", source: formatPhoneAR(p) });
          matchedAlumnoIds.add(a.id);
        }
      } else {
        surplus.push({ source: formatPhoneAR(p), type: "telefono", alumno: a || null });
      }
    }

    // 2. Match por nombre (fuzzy) - solo nombres que NO matchearon ya por teléfono
    for (const n of names) {
      // descartar líneas que sean solo un teléfono ya procesado
      if (/^\+?[\d\s\-\(\)]+$/.test(n)) continue;

      // buscar mejor match en el grupo
      let bestInGrupo: { a: Alumno; score: number } | null = null;
      for (const a of grupoAlumnos) {
        if (matchedAlumnoIds.has(a.id)) continue;
        const fullName = `${a.nombre || ""} ${a.apellido || ""}`.trim();
        const score = nameMatchScore(n, fullName);
        if (score >= 0.7 && (!bestInGrupo || score > bestInGrupo.score)) {
          bestInGrupo = { a, score };
        }
      }
      if (bestInGrupo) {
        matched.push({ alumno: bestInGrupo.a, via: "nombre", source: n, score: bestInGrupo.score });
        matchedAlumnoIds.add(bestInGrupo.a.id);
        continue;
      }

      // ¿está en otro grupo?
      let bestOther: { a: Alumno; score: number } | null = null;
      for (const a of alumnos) {
        if (a.grupo === selectedGrupo) continue;
        const fullName = `${a.nombre || ""} ${a.apellido || ""}`.trim();
        const score = nameMatchScore(n, fullName);
        if (score >= 0.7 && (!bestOther || score > bestOther.score)) {
          bestOther = { a, score };
        }
      }
      surplus.push({ source: n, type: "nombre", alumno: bestOther?.a || null });
    }

    const missing = grupoAlumnos.filter(a => !matchedAlumnoIds.has(a.id));

    setResult({
      pastedNames: names.length,
      pastedPhones: phones.length,
      matched,
      missing,
      surplus,
    });
  };

  const handleReset = () => {
    setPasted("");
    setResult(null);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copiado", description: text.length > 60 ? "Snippet copiado al portapapeles" : text });
  };

  const openWhatsApp = (phone: string) => {
    window.open(`https://wa.me/${phone.replace(/\D/g, "")}`, "_blank");
  };

  const goToAlumno = (alumnoId: string) => {
    navigate(`/admin/alumnos?focus=${alumnoId}`);
  };

  if (loading) {
    return <div className="text-muted-foreground">Cargando…</div>;
  }

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-heading font-bold uppercase tracking-wider text-foreground">
            Conciliador WhatsApp ↔ App
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Comparé qué alumnos están en el grupo de WhatsApp y cuáles deberían estar según la app. Solo lectura, no modifica nada.
          </p>
        </div>
        <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <HelpCircle className="w-4 h-4" />
              Cómo extraer la lista
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Cómo extraer los miembros del grupo de WhatsApp</DialogTitle>
              <DialogDescription>
                WhatsApp Web no deja exportar miembros. Este snippet hace scroll automático y los copia al portapapeles.
              </DialogDescription>
            </DialogHeader>
            <ol className="space-y-3 text-sm list-decimal list-inside">
              <li>Abrí <strong>WhatsApp Web</strong> (web.whatsapp.com) en otra pestaña.</li>
              <li>Entrá al grupo y hacé click en el <strong>nombre del grupo</strong> arriba para abrir "Info del grupo".</li>
              <li>Aseguráte de ver la sección <strong>"Miembros"</strong> en el panel derecho.</li>
              <li>Apretá <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs">F12</kbd> (o click derecho → Inspeccionar). Andá a la pestaña <strong>"Console"</strong>.</li>
              <li>
                Si te aparece un cartel "<em>Don't paste code...</em>", escribí <code>allow pasting</code> y enter.
              </li>
              <li>Pegá el siguiente snippet y apretá Enter:</li>
            </ol>
            <div className="relative">
              <pre className="bg-muted/50 border border-border rounded-md p-3 text-[11px] font-mono overflow-x-auto max-h-64">
                {SNIPPET}
              </pre>
              <Button
                size="sm"
                variant="outline"
                className="absolute top-2 right-2"
                onClick={() => copyToClipboard(SNIPPET)}
              >
                <Copy className="w-3.5 h-3.5 mr-1.5" /> Copiar snippet
              </Button>
            </div>
            <ol start={7} className="space-y-3 text-sm list-decimal list-inside">
              <li>El snippet va a hacer scroll y al terminar te muestra <strong>"✅ N miembros copiados al portapapeles"</strong>.</li>
              <li>Volvé acá, pegá en el cuadro de "Contenido del grupo" y dale Analizar.</li>
            </ol>
            <div className="text-xs text-muted-foreground border-t border-border pt-3 flex items-start gap-2">
              <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>
                Si en el futuro WhatsApp cambia su interfaz y el snippet deja de funcionar, avisame y lo actualizo en minutos.
              </span>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Pegá la lista del grupo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-[280px_1fr] gap-4">
            <div className="space-y-2">
              <Label>Grupo de WhatsApp a conciliar</Label>
              <Select value={selectedGrupo} onValueChange={setSelectedGrupo}>
                <SelectTrigger>
                  <SelectValue placeholder="Elegí un grupo…" />
                </SelectTrigger>
                <SelectContent>
                  {grupos.map(g => (
                    <SelectItem key={g} value={g}>
                      {g} <span className="text-muted-foreground ml-1">({grupoStats.get(g) || 0} activos)</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground flex items-start gap-1.5 mt-2">
                <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                Comparamos contra alumnos en estado <strong>activo</strong> o <strong>vacaciones</strong>.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Contenido del grupo (nombres, teléfonos, o ambos)</Label>
              <Textarea
                value={pasted}
                onChange={e => setPasted(e.target.value)}
                placeholder={`Pegá la lista de miembros del grupo de WhatsApp.\n\nFunciona con nombres (uno por línea), teléfonos, o mezclado.\nUsá el botón "Cómo extraer la lista" arriba si no sabés cómo sacarlos.\n\nEjemplo:\nJuan Pérez\nMaría López\nDaniel Hernández\n+54 9 11 5728-0827`}
                className="min-h-[200px] font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                Detecté: <strong>{previewCount.names}</strong> nombre(s) · <strong>{previewCount.phones}</strong> teléfono(s)
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <Button onClick={handleAnalyze} disabled={!selectedGrupo || !pasted.trim()}>
              Analizar
            </Button>
            {result && (
              <Button variant="outline" onClick={handleReset}>
                <RefreshCw className="w-4 h-4 mr-2" /> Limpiar
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {result && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard
              label="En WhatsApp"
              value={result.pastedNames + result.pastedPhones}
              hint={`${result.pastedNames} nombres · ${result.pastedPhones} tel.`}
            />
            <KpiCard
              label="Coinciden"
              value={result.matched.length}
              hint={`del grupo "${selectedGrupo}"`}
              tone="success"
            />
            <KpiCard
              label="Sobran en WA"
              value={result.surplus.length}
              hint="no son del grupo"
              tone="danger"
            />
            <KpiCard
              label="Faltan en WA"
              value={result.missing.length}
              hint="alumnos no agregados"
              tone="warning"
            />
          </div>

          {result.matched.length === 0 && result.pastedNames + result.pastedPhones > 0 && (
            <Card className="border-amber-500/30 bg-amber-500/5">
              <CardContent className="p-4 text-sm flex items-start gap-2 text-amber-200">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>
                  No matcheé a ningún alumno. Verificá que pegaste nombres reales (no "Tú", "Admin del grupo", etc.) y que el grupo elegido es el correcto.
                </span>
              </CardContent>
            </Card>
          )}

          <Tabs defaultValue="surplus" className="w-full">
            <TabsList className="grid grid-cols-3 w-full sm:w-auto sm:inline-grid">
              <TabsTrigger value="surplus" className="gap-1.5">
                <UserMinus className="w-3.5 h-3.5" />
                Sobran ({result.surplus.length})
              </TabsTrigger>
              <TabsTrigger value="missing" className="gap-1.5">
                <UserPlus className="w-3.5 h-3.5" />
                Faltan ({result.missing.length})
              </TabsTrigger>
              <TabsTrigger value="matched" className="gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                OK ({result.matched.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="surplus" className="space-y-2 mt-4">
              {result.surplus.length === 0 ? (
                <EmptyState text="Ninguna entrada extra: todo lo del WhatsApp pertenece a este grupo." />
              ) : (
                result.surplus.map((s, idx) => {
                  const phone = s.type === "telefono" ? s.source.replace(/\D/g, "") : null;
                  return (
                    <Card key={`${s.source}-${idx}`} className="border-destructive/30">
                      <CardContent className="p-3 flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex-1 min-w-[200px]">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={s.type === "telefono" ? "font-mono text-sm" : "text-sm font-medium"}>
                              {s.source}
                            </span>
                            {s.alumno ? (
                              <>
                                <span className="text-xs text-muted-foreground">→ {s.alumno.nombre} {s.alumno.apellido || ""}</span>
                                <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-400">
                                  está en: {s.alumno.grupo}
                                </Badge>
                              </>
                            ) : (
                              <Badge variant="destructive" className="text-[10px]">
                                No es alumno
                              </Badge>
                            )}
                          </div>
                        </div>
                        <RowActions
                          phone={phone}
                          alumnoId={s.alumno?.id}
                          onCopy={copyToClipboard}
                          onOpenWa={openWhatsApp}
                          onGo={goToAlumno}
                        />
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </TabsContent>

            <TabsContent value="missing" className="space-y-2 mt-4">
              {result.missing.length === 0 ? (
                <EmptyState text="Todos los alumnos del grupo están en el WhatsApp." />
              ) : (
                result.missing.map(a => {
                  const norm = normalizePhoneAR(a.telefono);
                  return (
                    <Card key={a.id} className="border-amber-500/30">
                      <CardContent className="p-3 flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex-1 min-w-[200px]">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm text-foreground">
                              {a.nombre} {a.apellido || ""}
                            </span>
                            <Badge variant="outline" className="text-[10px]">{a.estado}</Badge>
                            {!norm && (
                              <Badge variant="outline" className="text-[10px] border-destructive/40 text-destructive">
                                Sin teléfono
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            {norm ? formatPhoneAR(norm) : a.telefono || "Sin teléfono"} · {a.email}
                          </p>
                        </div>
                        <RowActions phone={norm} alumnoId={a.id} onCopy={copyToClipboard} onOpenWa={openWhatsApp} onGo={goToAlumno} />
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </TabsContent>

            <TabsContent value="matched" className="space-y-2 mt-4">
              {result.matched.length === 0 ? (
                <EmptyState text="Ninguna coincidencia." />
              ) : (
                result.matched.map(m => (
                  <Card key={m.alumno.id}>
                    <CardContent className="p-3 flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex-1 min-w-[200px]">
                        <div className="flex items-center gap-2 flex-wrap">
                          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                          <span className="font-medium text-sm text-foreground">
                            {m.alumno.nombre} {m.alumno.apellido || ""}
                          </span>
                          <Badge variant="outline" className="text-[10px]">
                            {m.via === "telefono" ? "📱 por tel." : `✏️ por nombre${m.score && m.score < 1 ? ` (${Math.round(m.score * 100)}%)` : ""}`}
                          </Badge>
                          <span className="text-xs text-muted-foreground">{m.source}</span>
                        </div>
                      </div>
                      <RowActions
                        phone={normalizePhoneAR(m.alumno.telefono)}
                        alumnoId={m.alumno.id}
                        onCopy={copyToClipboard}
                        onOpenWa={openWhatsApp}
                        onGo={goToAlumno}
                      />
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
};

const KpiCard = ({ label, value, hint, tone }: { label: string; value: number; hint?: string; tone?: "success" | "danger" | "warning" }) => {
  const toneClass =
    tone === "success" ? "text-emerald-500" :
    tone === "danger" ? "text-destructive" :
    tone === "warning" ? "text-amber-400" :
    "text-foreground";
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
        <p className={`text-3xl font-heading font-bold mt-1 ${toneClass}`}>{value}</p>
        {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
      </CardContent>
    </Card>
  );
};

const EmptyState = ({ text }: { text: string }) => (
  <Card className="border-dashed">
    <CardContent className="p-6 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
      {text}
    </CardContent>
  </Card>
);

const RowActions = ({
  phone,
  alumnoId,
  onCopy,
  onOpenWa,
  onGo,
}: {
  phone: string | null;
  alumnoId?: string;
  onCopy: (t: string) => void;
  onOpenWa: (p: string) => void;
  onGo: (id: string) => void;
}) => (
  <div className="flex gap-1.5">
    {phone && (
      <>
        <Button size="sm" variant="outline" onClick={() => onCopy(phone)} title="Copiar teléfono">
          <Copy className="w-3.5 h-3.5" />
        </Button>
        <Button size="sm" variant="outline" onClick={() => onOpenWa(phone)} title="Abrir WhatsApp">
          <MessageCircle className="w-3.5 h-3.5" />
        </Button>
      </>
    )}
    {alumnoId && (
      <Button size="sm" variant="outline" onClick={() => onGo(alumnoId)} title="Ver ficha del alumno">
        <ExternalLink className="w-3.5 h-3.5" />
      </Button>
    )}
  </div>
);

export default WhatsAppConciliador;
