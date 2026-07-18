import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ArrowLeft, Search, Star, ClipboardCheck, Loader2, AlertTriangle, MessageSquarePlus, Check } from "lucide-react";
import { toast } from "sonner";

type AlumnoRow = {
  id: string;
  nombre: string;
  apellido: string | null;
  grupo: string | null;
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
  const [notas, setNotas] = useState<Nota[]>([]);
  const [showAlertList, setShowAlertList] = useState(false);
  const [otherCoaches, setOtherCoaches] = useState<CoachOpt[]>([]);
  const [convertingNotaId, setConvertingNotaId] = useState<string | null>(null);
  const [convertCoachSec, setConvertCoachSec] = useState<Record<string, string>>({});

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
        .select("id, nombre, apellido, grupo")
        .eq("grupo", grupoSel as any)
        .eq("estado", "activo")
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
    if (!q) return alumnos;
    return alumnos.filter(a => `${a.nombre} ${a.apellido ?? ""}`.toLowerCase().includes(q));
  }, [alumnos, search]);

  const openPanel = async (a: AlumnoRow) => {
    setOpenAlumno(a);
    setForm(evalsMap[a.id] ? { ...evalsMap[a.id] } : emptyEval(a.id));
    setNotaNueva("");
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
        const { error: nErr } = await supabase
          .from("alumno_evaluaciones_coach_notas")
          .insert({
            alumno_id: form.alumno_id,
            coach_id: coachId,
            autor_nombre: coachNombre || (adminMode ? "Admin" : null),
            nota: notaNueva.trim(),
            snapshot_scores: snap,
          } as any);
        if (nErr) throw nErr;
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
              </section>

              <Button className="w-full" onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Guardar chequeo"}
              </Button>

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
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
