import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowLeft, Search, Star, ClipboardCheck, Loader2, AlertTriangle, MessageSquarePlus, Check, Eye } from "lucide-react";
import { toast } from "sonner";
import { calcularEdad } from "@/lib/dates";

type AlumnoRow = {
  id: string;
  nombre: string;
  apellido: string | null;
  grupo: string | null;
  fecha_nacimiento: string | null;
  es_staff?: boolean | null;
};

type Evaluacion = {
  id?: string;
  alumno_id: string;
  postura: number | null;
  cadencia: number | null;
  manejo: number | null;
  potencia: number | null;
  fisico: number | null;
  constancia: number | null;
  actitud: number | null;
  progreso: number | null;
  postura_nota: string | null;
  cadencia_nota: string | null;
  manejo_nota: string | null;
  potencia_nota: string | null;
  fisico_nota: string | null;
  constancia_nota: string | null;
  actitud_nota: string | null;
  progreso_nota: string | null;
  promedio_tecnico: number | null;
  promedio_rendimiento: number | null;
  updated_at?: string;
};

const TECH_DIMS = [
  { key: "postura", label: "Postura sobre la bici" },
  { key: "cadencia", label: "Cadencia / pedaleo" },
  { key: "manejo", label: "Manejo y trazada" },
  { key: "potencia", label: "Potencia / fuerza" },
] as const;

const RENDI_DIMS = [
  { key: "fisico", label: "Estado físico general" },
  { key: "constancia", label: "Constancia / asistencia" },
  { key: "actitud", label: "Actitud y compromiso" },
  { key: "progreso", label: "Progreso vs. último chequeo" },
] as const;

const emptyEval = (alumno_id: string): Evaluacion => ({
  alumno_id,
  postura: null, cadencia: null, manejo: null, potencia: null,
  fisico: null, constancia: null, actitud: null, progreso: null,
  postura_nota: null, cadencia_nota: null, manejo_nota: null, potencia_nota: null,
  fisico_nota: null, constancia_nota: null, actitud_nota: null, progreso_nota: null,
  promedio_tecnico: null, promedio_rendimiento: null,
});

const levelColor = (n: number | null | undefined) => {
  if (!n) return "bg-muted text-muted-foreground";
  if (n <= 1.5) return "bg-red-500/20 text-red-400 border-red-500/30";
  if (n <= 2.5) return "bg-orange-500/20 text-orange-400 border-orange-500/30";
  if (n <= 3.5) return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
  if (n <= 4.5) return "bg-lime-500/20 text-lime-400 border-lime-500/30";
  return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
};

function StarPicker({ value, onChange }: { value: number | null; onChange: (n: number | null) => void }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map(n => {
        const filled = (value ?? 0) >= n;
        return (
          <button
            type="button"
            key={n}
            onClick={() => onChange(value === n ? null : n)}
            className="p-1 rounded hover:bg-secondary transition"
            aria-label={`${n} estrellas`}
          >
            <Star className={`w-5 h-5 ${filled ? "fill-primary text-primary" : "text-muted-foreground"}`} />
          </button>
        );
      })}
      {value != null && (
        <span className="ml-2 text-xs text-muted-foreground">{value}/5</span>
      )}
    </div>
  );
}

type Nota = {
  id: string;
  nota: string;
  autor_nombre: string | null;
  snapshot_scores: any;
  created_at: string;
  feedback_id: string | null;
};

type CoachOpt = { id: string; nombre: string };

export default function CoachChequeoAlumnos({ adminMode = false }: { adminMode?: boolean }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [coachId, setCoachId] = useState<string | null>(null);
  const [coachNombre, setCoachNombre] = useState<string>("");
  const [grupos, setGrupos] = useState<string[]>([]);
  const [grupoSel, setGrupoSel] = useState<string | null>(null);
  const [alumnos, setAlumnos] = useState<AlumnoRow[]>([]);
  const [evalsMap, setEvalsMap] = useState<Record<string, Evaluacion>>({});
  const [search, setSearch] = useState("");

  // Panel state
  const [openAlumno, setOpenAlumno] = useState<AlumnoRow | null>(null);
  const [form, setForm] = useState<Evaluacion | null>(null);
  const [notaNueva, setNotaNueva] = useState("");
  const [notaEnviarFeedback, setNotaEnviarFeedback] = useState(false);
  const [notaCoachSec, setNotaCoachSec] = useState<string>("");
  const [notas, setNotas] = useState<Nota[]>([]);
  const [showAlertList, setShowAlertList] = useState(false);
  const [otherCoaches, setOtherCoaches] = useState<CoachOpt[]>([]);
  const [convertingNotaId, setConvertingNotaId] = useState<string | null>(null);
  const [convertCoachSec, setConvertCoachSec] = useState<Record<string, string>>({});
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      let gruposDisponibles: string[] = [];

      if (adminMode) {
        // admin: todos los grupos existentes en alumnos
        const { data: gs } = await supabase
          .from("alumnos")
          .select("grupo")
          .not("grupo", "is", null);
        gruposDisponibles = Array.from(new Set((gs || []).map((r: any) => r.grupo).filter(Boolean))).sort();
      } else {
        const { data: coach } = await supabase
          .from("coaches")
          .select("id, nombre, grupos")
          .eq("user_id", session.user.id)
          .single();
        if (coach) {
          setCoachId((coach as any).id);
          setCoachNombre((coach as any).nombre || "");
          gruposDisponibles = ((coach as any).grupos || []) as string[];
        }
      }

      setGrupos(gruposDisponibles);
      if (gruposDisponibles.length > 0) setGrupoSel(gruposDisponibles[0]);

      // Otros coaches para asignar co-feedback al convertir
      const { data: cs } = await supabase.from("coaches").select("id, nombre").order("nombre");
      setOtherCoaches(((cs || []) as any[]).map(c => ({ id: c.id, nombre: c.nombre })));

      setLoading(false);
    })();
  }, [adminMode]);

  useEffect(() => {
    if (!grupoSel) return;
    (async () => {
      const { data: al } = await supabase
        .from("alumnos")
        .select("id, nombre, apellido, grupo, fecha_nacimiento, es_staff")
        .eq("grupo", grupoSel as any)
        .eq("estado", "activo")
        .or("es_staff.is.null,es_staff.eq.false")
        .order("nombre");
      const list = (al || []) as AlumnoRow[];
      setAlumnos(list);

      if (list.length > 0) {
        const ids = list.map(a => a.id);
        const { data: evs } = await supabase
          .from("alumno_evaluaciones_coach")
          .select("*")
          .in("alumno_id", ids);
        const m: Record<string, Evaluacion> = {};
        (evs || []).forEach((e: any) => { m[e.alumno_id] = e; });
        setEvalsMap(m);
      } else {
        setEvalsMap({});
      }
    })();
  }, [grupoSel]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    const base = q
      ? alumnos.filter(a => `${a.nombre} ${a.apellido ?? ""}`.toLowerCase().includes(q))
      : alumnos;
    // no chequeados primero, luego chequeados por fecha desc
    return [...base].sort((a, b) => {
      const ea = evalsMap[a.id]?.updated_at;
      const eb = evalsMap[b.id]?.updated_at;
      if (!ea && eb) return -1;
      if (ea && !eb) return 1;
      if (!ea && !eb) return a.nombre.localeCompare(b.nombre);
      return new Date(eb!).getTime() - new Date(ea!).getTime();
    });
  }, [alumnos, search, evalsMap]);

  const totalContables = alumnos.length;
  const chequeados = alumnos.filter(a => !!evalsMap[a.id]?.updated_at).length;
  const pendientes = totalContables - chequeados;
  const pctHecho = totalContables > 0 ? Math.round((chequeados / totalContables) * 100) : 0;

  // Alumnos "a abordar": alguna dimensión evaluada < 3 estrellas
  const DIM_KEYS = ["postura","cadencia","manejo","potencia","fisico","constancia","actitud","progreso"] as const;
  const alumnosAbordar = useMemo(() => {
    return alumnos.filter(a => {
      const ev = evalsMap[a.id];
      if (!ev) return false;
      return DIM_KEYS.some(k => {
        const v = (ev as any)[k];
        return typeof v === "number" && v > 0 && v < 3;
      });
    }).map(a => {
      const ev = evalsMap[a.id]!;
      const lows = DIM_KEYS.filter(k => {
        const v = (ev as any)[k];
        return typeof v === "number" && v > 0 && v < 3;
      });
      return { alumno: a, lowDims: lows, ev };
    });
  }, [alumnos, evalsMap]);

  const handleConvertirNota = async (nota: Nota) => {
    if (!openAlumno) return;
    setConvertingNotaId(nota.id);
    try {
      const coachSec = convertCoachSec[nota.id] || null;
      const { data: fb, error } = await supabase.from("feedback_coach").insert({
        alumno_id: openAlumno.id,
        coach_id: coachId,
        coach_id_secundario: coachSec,
        comentario: nota.nota,
        tipo: "general",
        fecha: (nota.created_at || new Date().toISOString()).split("T")[0],
        origen: "chequeo",
        origen_nota_id: nota.id,
      } as any).select("id").single();
      if (error || !fb) throw error || new Error("insert feedback failed");

      await supabase
        .from("alumno_evaluaciones_coach_notas")
        .update({ feedback_id: (fb as any).id } as any)
        .eq("id", nota.id);

      supabase.functions.invoke("notify-coach-feedback", { body: { feedback_id: (fb as any).id } }).catch(() => {});

      setNotas(prev => prev.map(n => n.id === nota.id ? { ...n, feedback_id: (fb as any).id } : n));
      toast.success("Convertido en feedback y enviado al alumno");
    } catch (e: any) {
      toast.error(e.message || "No se pudo convertir");
    } finally {
      setConvertingNotaId(null);
    }
  };

  const openPanel = async (a: AlumnoRow) => {
    setOpenAlumno(a);
    setForm(evalsMap[a.id] ? { ...evalsMap[a.id] } : emptyEval(a.id));
    setNotaNueva("");
    setNotaEnviarFeedback(false);
    setNotaCoachSec("");
    const { data } = await supabase
      .from("alumno_evaluaciones_coach_notas")
      .select("*")
      .eq("alumno_id", a.id)
      .order("created_at", { ascending: false })
      .limit(20);
    setNotas((data || []) as Nota[]);
  };

  const setField = (k: keyof Evaluacion, v: any) => {
    setForm(prev => prev ? { ...prev, [k]: v } : prev);
  };

  const handleSave = async () => {
    if (!form || !openAlumno) return;
    setSaving(true);
    try {
      const payload: any = {
        alumno_id: form.alumno_id,
        coach_id_ultimo: coachId,
        postura: form.postura, cadencia: form.cadencia, manejo: form.manejo, potencia: form.potencia,
        fisico: form.fisico, constancia: form.constancia, actitud: form.actitud, progreso: form.progreso,
        postura_nota: form.postura_nota || null,
        cadencia_nota: form.cadencia_nota || null,
        manejo_nota: form.manejo_nota || null,
        potencia_nota: form.potencia_nota || null,
        fisico_nota: form.fisico_nota || null,
        constancia_nota: form.constancia_nota || null,
        actitud_nota: form.actitud_nota || null,
        progreso_nota: form.progreso_nota || null,
      };

      const { data: upserted, error } = await supabase
        .from("alumno_evaluaciones_coach")
        .upsert(payload, { onConflict: "alumno_id" })
        .select("*")
        .single();
      if (error) throw error;

      // Timeline nota
      if (notaNueva.trim().length > 0) {
        const snap = {
          postura: form.postura, cadencia: form.cadencia, manejo: form.manejo, potencia: form.potencia,
          fisico: form.fisico, constancia: form.constancia, actitud: form.actitud, progreso: form.progreso,
        };
        const { data: notaIns, error: nErr } = await supabase
          .from("alumno_evaluaciones_coach_notas")
          .insert({
            alumno_id: form.alumno_id,
            coach_id: coachId,
            autor_nombre: coachNombre || (adminMode ? "Admin" : null),
            nota: notaNueva.trim(),
            snapshot_scores: snap,
          } as any)
          .select("id, created_at")
          .single();
        if (nErr) throw nErr;

        // Convertir en feedback + enviar al alumno si el coach lo pidió
        if (notaEnviarFeedback && notaIns) {
          const dimAll = [...TECH_DIMS, ...RENDI_DIMS] as ReadonlyArray<{ key: string; label: string }>;
          const detalleLines = dimAll
            .map(d => {
              const nota = ((form as any)[`${d.key}_nota`] as string | null)?.trim();
              const score = (form as any)[d.key] as number | null;
              if (!nota) return null;
              const star = score ? ` (${score}★)` : "";
              return `• ${d.label}${star}: ${nota}`;
            })
            .filter(Boolean)
            .join("\n");
          const comentarioFull = detalleLines
            ? `${notaNueva.trim()}\n\n---DETALLE---\n${detalleLines}`
            : notaNueva.trim();
          const { data: fb, error: fbErr } = await supabase.from("feedback_coach").insert({
            alumno_id: form.alumno_id,
            coach_id: coachId,
            coach_id_secundario: notaCoachSec || null,
            comentario: comentarioFull,
            tipo: "general",
            fecha: ((notaIns as any).created_at || new Date().toISOString()).split("T")[0],
            origen: "chequeo",
            origen_nota_id: (notaIns as any).id,
          } as any).select("id").single();
          if (fbErr) throw fbErr;

          await supabase
            .from("alumno_evaluaciones_coach_notas")
            .update({ feedback_id: (fb as any).id } as any)
            .eq("id", (notaIns as any).id);

          supabase.functions.invoke("notify-coach-feedback", { body: { feedback_id: (fb as any).id } }).catch(() => {});
        }
      }

      setEvalsMap(prev => ({ ...prev, [form.alumno_id]: upserted as any }));
      toast.success("Chequeo guardado");
      setOpenAlumno(null);
    } catch (e: any) {
      toast.error(e.message || "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  const handleMarkStaff = async () => {
    if (!openAlumno) return;
    if (!confirm(`Marcar a ${openAlumno.nombre} como staff? Va a salir del listado de chequeo y no contará en el porcentaje.`)) return;
    try {
      const { error } = await supabase
        .from("alumnos")
        .update({ es_staff: true } as any)
        .eq("id", openAlumno.id);
      if (error) throw error;
      setAlumnos(prev => prev.filter(a => a.id !== openAlumno.id));
      toast.success("Marcado como staff. Excluido del chequeo.");
      setOpenAlumno(null);
    } catch (e: any) {
      toast.error(e.message || "No se pudo marcar");
    }
  };

  const renderStars = (n: number | null | undefined) => {
    if (!n) return null;
    return (
      <div className="flex items-center gap-0.5">
        {[1,2,3,4,5].map(i => (
          <Star key={i} className={`w-3 h-3 ${i <= n ? "fill-primary text-primary" : "text-muted-foreground/30"}`} />
        ))}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(adminMode ? "/admin" : "/coach")}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-heading font-bold text-foreground uppercase tracking-wider">
              Chequeo de alumnos
            </h1>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        <p className="text-xs text-muted-foreground">
          Uso interno del staff. El alumno no ve esta información.
        </p>

        {/* Grupo selector */}
        <div className="flex gap-2 flex-wrap">
          {grupos.length === 0 && (
            <p className="text-sm text-muted-foreground">No tenés grupos asignados.</p>
          )}
          {grupos.map(g => (
            <button
              key={g}
              onClick={() => setGrupoSel(g)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${
                grupoSel === g
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-muted-foreground border-border hover:border-primary/50"
              }`}
            >
              {g}
            </button>
          ))}
        </div>

        {grupoSel && (
          <>
            {/* Alerta: alumnos a abordar (con dimensiones < 3) */}
            {alumnosAbordar.length > 0 && (
              <div className="rounded-xl border border-red-500/40 bg-red-500/10 overflow-hidden">
                <button
                  onClick={() => setShowAlertList(v => !v)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-red-500/15 transition"
                >
                  <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-red-300">
                      {alumnosAbordar.length} {alumnosAbordar.length === 1 ? "alumno a abordar" : "alumnos a abordar"}
                    </p>
                    <p className="text-[11px] text-red-300/80">
                      Tienen alguna dimensión por debajo de 3 estrellas. Tocá para ver.
                    </p>
                  </div>
                  <span className="text-[11px] text-red-300 font-medium">
                    {showAlertList ? "Ocultar" : "Ver"}
                  </span>
                </button>
                {showAlertList && (
                  <div className="border-t border-red-500/30 divide-y divide-red-500/20">
                    {alumnosAbordar.map(({ alumno, lowDims, ev }) => (
                      <button
                        key={alumno.id}
                        onClick={() => openPanel(alumno)}
                        className="w-full text-left px-4 py-2.5 hover:bg-red-500/10 transition flex items-center gap-3"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            {alumno.nombre} {alumno.apellido ?? ""}
                            {calcularEdad(alumno.fecha_nacimiento) !== null && (
                              <span className="text-muted-foreground/80 font-normal"> · {calcularEdad(alumno.fecha_nacimiento)}</span>
                            )}
                          </p>
                          <p className="text-[11px] text-red-300/90 truncate">
                            {lowDims.map(k => `${k} ${(ev as any)[k]}★`).join(" · ")}
                          </p>
                        </div>
                        <Badge variant="outline" className="text-[10px] border-red-500/40 text-red-300">
                          Abordar
                        </Badge>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Stats de avance */}
            {totalContables > 0 && (
              <div className="rounded-lg border border-border bg-card/60 px-3 py-2 flex items-center justify-between text-[12px]">
                <div className="text-muted-foreground">
                  <span className="text-foreground font-semibold">{chequeados}</span> chequeados
                  {" · "}
                  <span className="text-foreground font-semibold">{pendientes}</span> pendientes
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-20 h-1.5 rounded-full bg-secondary overflow-hidden">
                    <div className="h-full bg-primary" style={{ width: `${pctHecho}%` }} />
                  </div>
                  <span className="text-foreground font-semibold">{pctHecho}%</span>
                </div>
              </div>
            )}

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar alumno..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            <div className="space-y-2">
              {filtered.length === 0 && (
                <p className="text-center text-muted-foreground text-sm py-8">Sin alumnos.</p>
              )}
              {filtered.map(a => {
                const ev = evalsMap[a.id];
                return (
                  <Card
                    key={a.id}
                    className="cursor-pointer hover:border-primary/50 transition"
                    onClick={() => openPanel(a)}
                  >
                    <CardContent className="p-3 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-foreground truncate">
                          {a.nombre} {a.apellido ?? ""}
                          {calcularEdad(a.fecha_nacimiento) !== null && (
                            <span className="text-muted-foreground font-normal"> · {calcularEdad(a.fecha_nacimiento)}</span>
                          )}
                        </p>
                        {ev?.updated_at ? (
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            Últ. chequeo: {new Date(ev.updated_at).toLocaleDateString("es-AR")}
                          </p>
                        ) : (
                          <p className="text-[11px] text-muted-foreground/60 mt-0.5">
                            Sin chequeo
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${levelColor(ev?.promedio_tecnico ? Number(ev.promedio_tecnico) : null)}`}
                        >
                          T {ev?.promedio_tecnico ? Number(ev.promedio_tecnico).toFixed(1) : "—"}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${levelColor(ev?.promedio_rendimiento ? Number(ev.promedio_rendimiento) : null)}`}
                        >
                          R {ev?.promedio_rendimiento ? Number(ev.promedio_rendimiento).toFixed(1) : "—"}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </>
        )}
      </main>

      <Sheet open={!!openAlumno} onOpenChange={o => !o && setOpenAlumno(null)}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>
              {openAlumno ? `${openAlumno.nombre} ${openAlumno.apellido ?? ""}` : ""}
            </SheetTitle>
          </SheetHeader>

          {form && (
            <div className="space-y-6 mt-4">
              {/* Técnico */}
              <section>
                <h3 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-3">
                  Nivel técnico
                </h3>
                <div className="space-y-4">
                  {TECH_DIMS.map(d => (
                    <div key={d.key} className="space-y-1.5">
                      <label className="text-sm text-foreground">{d.label}</label>
                      <StarPicker
                        value={(form as any)[d.key]}
                        onChange={v => setField(d.key as any, v)}
                      />
                      <Input
                        placeholder="Comentario (opcional)"
                        value={(form as any)[`${d.key}_nota`] ?? ""}
                        onChange={e => setField(`${d.key}_nota` as any, e.target.value)}
                        className="text-xs h-8"
                      />
                    </div>
                  ))}
                </div>
              </section>

              {/* Rendimiento */}
              <section>
                <h3 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-3">
                  Rendimiento y actitud
                </h3>
                <div className="space-y-4">
                  {RENDI_DIMS.map(d => (
                    <div key={d.key} className="space-y-1.5">
                      <label className="text-sm text-foreground">{d.label}</label>
                      <StarPicker
                        value={(form as any)[d.key]}
                        onChange={v => setField(d.key as any, v)}
                      />
                      <Input
                        placeholder="Comentario (opcional)"
                        value={(form as any)[`${d.key}_nota`] ?? ""}
                        onChange={e => setField(`${d.key}_nota` as any, e.target.value)}
                        className="text-xs h-8"
                      />
                    </div>
                  ))}
                </div>
              </section>

              {/* Nota timeline */}
              <section>
                <h3 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">
                  Nota de esta actualización
                </h3>
                <Textarea
                  placeholder="Ej: mejoró mucho la postura; hoy le costó la cadencia en subida..."
                  value={notaNueva}
                  onChange={e => setNotaNueva(e.target.value)}
                  rows={3}
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Se guarda con fecha, autor y snapshot de los puntajes.
                </p>

                <div className="mt-3 rounded-lg border border-border/60 bg-secondary/30 p-3 space-y-2">
                  <label className={`flex items-start gap-2 ${notaNueva.trim().length > 0 ? "cursor-pointer" : "cursor-not-allowed opacity-70"}`}>
                    <input
                      type="checkbox"
                      checked={notaEnviarFeedback}
                      onChange={e => setNotaEnviarFeedback(e.target.checked)}
                      disabled={notaNueva.trim().length === 0}
                      className="mt-0.5 accent-primary"
                    />
                    <span className="text-[13px] text-foreground leading-snug">
                      Convertir en feedback y enviárselo al alumno por mail
                      <span className="block text-[11px] text-muted-foreground mt-0.5">
                        {notaNueva.trim().length === 0
                          ? "Escribí una nota arriba para habilitar el envío."
                          : "El alumno verá esta nota como feedback firmado por vos."}
                      </span>
                    </span>
                  </label>
                  {notaEnviarFeedback && notaNueva.trim().length > 0 && (
                    <select
                      value={notaCoachSec}
                      onChange={e => setNotaCoachSec(e.target.value)}
                      className="w-full rounded border border-border bg-card px-2 py-1.5 text-[12px] text-foreground"
                    >
                      <option value="">Co-entrenador (opcional)</option>
                      {otherCoaches.filter(c => c.id !== coachId).map(c => (
                        <option key={c.id} value={c.id}>{c.nombre}</option>
                      ))}
                    </select>
                  )}
                  {notaEnviarFeedback && notaNueva.trim().length > 0 && (
                    <button
                      type="button"
                      onClick={() => setPreviewOpen(true)}
                      className="inline-flex items-center gap-1.5 text-[12px] text-primary hover:underline"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      Ver preview del mail
                    </button>
                  )}
                </div>
              </section>


              <Button className="w-full" onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : (notaEnviarFeedback ? "Guardar chequeo y enviar por mail" : "Guardar chequeo")}
              </Button>

              <button
                type="button"
                onClick={handleMarkStaff}
                className="w-full text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2 py-1"
              >
                Marcar como staff (excluir del chequeo)
              </button>

              {/* Timeline */}
              {notas.length > 0 && (
                <section>
                  <h3 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">
                    Historial ({notas.length})
                  </h3>
                  <div className="space-y-3">
                    {notas.map(n => (
                      <div key={n.id} className="border-l-2 border-primary/40 pl-3 py-1">
                        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                          <span>{n.autor_nombre || "Staff"}</span>
                          <span>{new Date(n.created_at).toLocaleDateString("es-AR")}</span>
                        </div>
                        <p className="text-sm text-foreground mt-1 whitespace-pre-wrap">{n.nota}</p>
                        {n.snapshot_scores && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {Object.entries(n.snapshot_scores).map(([k, v]) => (
                              v != null && (
                                <span key={k} className="text-[10px] bg-secondary text-muted-foreground px-1.5 py-0.5 rounded">
                                  {k} {String(v)}
                                </span>
                              )
                            ))}
                          </div>
                        )}

                        {/* Convertir en feedback */}
                        <div className="mt-2 pt-2 border-t border-border/40 space-y-1.5">
                          {n.feedback_id ? (
                            <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400">
                              <Check className="w-3 h-3" /> Enviado como feedback al alumno
                            </span>
                          ) : (
                            <>
                              <select
                                value={convertCoachSec[n.id] || ""}
                                onChange={e => setConvertCoachSec(prev => ({ ...prev, [n.id]: e.target.value }))}
                                className="w-full rounded border border-border bg-card px-2 py-1 text-[11px] text-foreground"
                              >
                                <option value="">Co-entrenador (opcional)</option>
                                {otherCoaches.filter(c => c.id !== coachId).map(c => (
                                  <option key={c.id} value={c.id}>{c.nombre}</option>
                                ))}
                              </select>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-[11px] gap-1.5"
                                onClick={() => handleConvertirNota(n)}
                                disabled={convertingNotaId === n.id}
                              >
                                {convertingNotaId === n.id
                                  ? <Loader2 className="w-3 h-3 animate-spin" />
                                  : <MessageSquarePlus className="w-3 h-3" />}
                                Convertir en feedback + enviar al alumno
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Preview del mail de feedback */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto p-0">
          <DialogHeader className="px-4 pt-4 pb-2 border-b border-border">
            <DialogTitle className="text-sm">Preview del mail</DialogTitle>
            <p className="text-[11px] text-muted-foreground">
              Así lo va a recibir el alumno cuando guardes.
            </p>
          </DialogHeader>
          {(() => {
            const firstName = (openAlumno?.nombre || "").split(" ")[0] || "alumno";
            const secName = otherCoaches.find(c => c.id === notaCoachSec)?.nombre;
            const coachName = [coachNombre || "Tu entrenador", secName].filter(Boolean).join(" y ");
            const comentario = (notaNueva || "").replace(/</g, "&lt;");
            const to = "alumno@ejemplo.com";
            const subject = `📝 Nuevo feedback de ${coachName}`;
            const html = `
              <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; background:#fff;">
                <h2 style="color: #d4820a; margin-bottom: 12px;">📝 Nuevo feedback</h2>
                <p style="color: #333; margin-bottom: 12px;">
                  Hola <strong>${firstName}</strong>, recibiste un feedback de <strong>${coachName}</strong>.
                </p>
                <div style="background:#f7f4ef;border-left:4px solid #d4820a;padding:14px 16px;border-radius:6px;margin:16px 0;">
                  <p style="margin:0 0 6px;color:#8a5a12;font-size:12px;text-transform:uppercase;letter-spacing:0.06em;">General</p>
                  <p style="margin:0;color:#222;white-space:pre-wrap;font-size:15px;line-height:1.5;">${comentario}</p>
                </div>
                <div style="text-align:center;margin-top:20px;">
                  <a href="https://reybaud-app.com" style="display:inline-block;padding:12px 24px;background:#d4820a;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">
                    Ver en la app
                  </a>
                </div>
                <p style="color:#999;font-size:12px;margin-top:24px;text-align:center;">
                  Ciclismo Reybaud — Escuela de ciclismo
                </p>
              </div>
            `;
            return (
              <div>
                <div className="px-4 py-3 text-[11px] text-muted-foreground border-b border-border space-y-0.5 bg-secondary/30">
                  <div><span className="text-foreground/70">De:</span> Ciclismo Reybaud &lt;info@reybaud-app.com&gt;</div>
                  <div><span className="text-foreground/70">Para:</span> {openAlumno?.nombre} {openAlumno?.apellido || ""} &lt;{to}&gt;</div>
                  <div><span className="text-foreground/70">Asunto:</span> {subject}</div>
                </div>
                <div className="bg-white" dangerouslySetInnerHTML={{ __html: html }} />
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
