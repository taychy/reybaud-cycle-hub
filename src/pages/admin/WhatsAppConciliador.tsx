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
import { useToast } from "@/hooks/use-toast";
import { Copy, ExternalLink, MessageCircle, AlertTriangle, CheckCircle2, UserMinus, UserPlus, RefreshCw, Info } from "lucide-react";
import { extractPhonesFromText, formatPhoneAR, normalizePhoneAR } from "@/lib/phoneNormalize";
import type { Tables } from "@/integrations/supabase/types";

type Alumno = Pick<Tables<"alumnos">, "id" | "nombre" | "apellido" | "email" | "telefono" | "grupo" | "estado">;

interface Match {
  phone: string; // normalized 549...
  alumno: Alumno | null; // null = no encontrado
}

interface Result {
  pastedTotal: number; // teléfonos extraídos del texto
  pastedInvalid: number; // strings que parecían teléfono pero no se pudieron normalizar
  inWhatsapp: Match[]; // todos los del grupo WA, con su match (si existe)
  surplus: Match[]; // 🔴 sobran en WA (no son alumnos activos del grupo)
  missing: Alumno[]; // 🟡 faltan en WA (alumnos activos del grupo no aparecen)
  matched: Match[]; // 🟢 coinciden
}

const WhatsAppConciliador = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [alumnos, setAlumnos] = useState<Alumno[]>([]);
  const [grupos, setGrupos] = useState<string[]>([]);
  const [selectedGrupo, setSelectedGrupo] = useState<string>("");
  const [pasted, setPasted] = useState<string>("");
  const [result, setResult] = useState<Result | null>(null);

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

  const handleAnalyze = () => {
    if (!selectedGrupo) {
      toast({ title: "Falta el grupo", description: "Elegí qué grupo estás conciliando.", variant: "destructive" });
      return;
    }
    if (!pasted.trim()) {
      toast({ title: "Falta el contenido", description: "Pegá la lista del grupo de WhatsApp.", variant: "destructive" });
      return;
    }

    const grupoAlumnos = alumnos.filter(a => a.grupo === selectedGrupo);
    const phones = extractPhonesFromText(pasted);

    // Conteo de "candidatos" totales aproximados (para detectar inválidos)
    const rawMatches = (pasted.match(/\+?\d[\d\s\-\(\)\.]{7,}\d/g) || []).length;
    const pastedInvalid = Math.max(0, rawMatches - phones.length);

    // Index por teléfono normalizado de los alumnos del grupo
    const byPhone = new Map<string, Alumno>();
    for (const a of grupoAlumnos) {
      const norm = normalizePhoneAR(a.telefono);
      if (norm) byPhone.set(norm, a);
    }

    // También indexamos TODOS los alumnos por teléfono, para detectar
    // "está en otro grupo" en los sobrantes.
    const byPhoneAll = new Map<string, Alumno>();
    for (const a of alumnos) {
      const norm = normalizePhoneAR(a.telefono);
      if (norm && !byPhoneAll.has(norm)) byPhoneAll.set(norm, a);
    }

    const inWhatsapp: Match[] = phones.map(p => ({
      phone: p,
      alumno: byPhone.get(p) || byPhoneAll.get(p) || null,
    }));

    const matched: Match[] = inWhatsapp.filter(m => m.alumno?.grupo === selectedGrupo);
    const surplus: Match[] = inWhatsapp.filter(m => m.alumno?.grupo !== selectedGrupo);

    const matchedPhones = new Set(matched.map(m => m.phone));
    const missing: Alumno[] = grupoAlumnos.filter(a => {
      const norm = normalizePhoneAR(a.telefono);
      if (!norm) return true; // sin teléfono normalizable → no puede aparecer en WA
      return !matchedPhones.has(norm);
    });

    setResult({
      pastedTotal: phones.length,
      pastedInvalid,
      inWhatsapp,
      surplus,
      missing,
      matched,
    });
  };

  const handleReset = () => {
    setPasted("");
    setResult(null);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copiado", description: text });
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
      <div>
        <h1 className="text-2xl font-heading font-bold uppercase tracking-wider text-foreground">
          Conciliador WhatsApp ↔ App
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Comparé qué alumnos están en el grupo de WhatsApp y cuáles deberían estar según la app. Solo lectura, no modifica nada.
        </p>
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
              <Label>Contenido del grupo (formato libre)</Label>
              <Textarea
                value={pasted}
                onChange={e => setPasted(e.target.value)}
                placeholder={`Pegá acá la lista exportada del grupo de WhatsApp.\n\nFunciona con cualquier formato: copiar contactos, exportar chat, lista de teléfonos, etc.\n\nEjemplo:\nJuan Pérez +54 9 11 5728-0827\nMaría López 11-4444-5555\n+5491134567890`}
                className="min-h-[180px] font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                Detectado: <strong>{extractPhonesFromText(pasted).length}</strong> teléfono(s) únicos
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
              value={result.pastedTotal}
              hint="teléfonos únicos pegados"
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

          {result.pastedInvalid > 0 && (
            <Card className="border-amber-500/30 bg-amber-500/5">
              <CardContent className="p-4 text-sm flex items-start gap-2 text-amber-200">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>
                  Detecté <strong>{result.pastedInvalid}</strong> secuencia(s) de números que parecían teléfonos pero no pude normalizar (probablemente extranjeros o muy cortos). No se incluyen en el análisis.
                </span>
              </CardContent>
            </Card>
          )}

          {/* Listas */}
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
                <EmptyState text="Ningún teléfono extra: todos los del WhatsApp pertenecen a este grupo. " />
              ) : (
                result.surplus.map(m => (
                  <Card key={m.phone} className="border-destructive/30">
                    <CardContent className="p-3 flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex-1 min-w-[200px]">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-sm">{formatPhoneAR(m.phone)}</span>
                          {m.alumno ? (
                            <>
                              <span className="text-sm text-foreground">
                                {m.alumno.nombre} {m.alumno.apellido || ""}
                              </span>
                              <Badge variant="outline" className="text-[10px]">
                                {m.alumno.estado}
                              </Badge>
                              <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-400">
                                grupo: {m.alumno.grupo}
                              </Badge>
                            </>
                          ) : (
                            <Badge variant="destructive" className="text-[10px]">
                              No es alumno
                            </Badge>
                          )}
                        </div>
                        {m.alumno?.email && (
                          <p className="text-xs text-muted-foreground mt-1">{m.alumno.email}</p>
                        )}
                      </div>
                      <RowActions phone={m.phone} alumnoId={m.alumno?.id} onCopy={copyToClipboard} onOpenWa={openWhatsApp} onGo={goToAlumno} />
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>

            <TabsContent value="missing" className="space-y-2 mt-4">
              {result.missing.length === 0 ? (
                <EmptyState text="Todos los alumnos del grupo están en el WhatsApp. " />
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
                                Sin teléfono válido
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
                  <Card key={m.phone}>
                    <CardContent className="p-3 flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex-1 min-w-[200px]">
                        <div className="flex items-center gap-2 flex-wrap">
                          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                          <span className="font-medium text-sm text-foreground">
                            {m.alumno?.nombre} {m.alumno?.apellido || ""}
                          </span>
                          <span className="font-mono text-xs text-muted-foreground">
                            {formatPhoneAR(m.phone)}
                          </span>
                        </div>
                      </div>
                      <RowActions phone={m.phone} alumnoId={m.alumno?.id} onCopy={copyToClipboard} onOpenWa={openWhatsApp} onGo={goToAlumno} />
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
