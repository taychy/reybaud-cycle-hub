import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Loader2, Save, Users, Copy, Download, MessageCircle, Eye } from "lucide-react";
import WaitlistQuestionsEditor from "@/components/waitlist/WaitlistQuestionsEditor";
import {
  WaitlistQuestion,
  WaitlistEntryState,
  STATE_LABELS,
  STATE_COLORS,
  WAITLIST_ENTRY_STATES,
} from "@/lib/waitlistTypes";

interface EventRow {
  id: string;
  title: string;
  estado_publicacion: string;
  waitlist_habilitada: boolean;
  waitlist_mensaje: string | null;
  waitlist_questions: WaitlistQuestion[];
}

interface EntryRow {
  id: string;
  event_id: string;
  alumno_id: string | null;
  nombre: string;
  email: string;
  telefono: string | null;
  dni: string | null;
  respuestas: Record<string, any>;
  estado: WaitlistEntryState;
  admin_notas: string | null;
  created_at: string;
}

const ESTADO_PUB_LABELS: Record<string, string> = {
  borrador: "Borrador",
  proximamente: "Próximamente",
  publicado: "Publicado",
  agotado: "Agotado",
  cerrado: "Cerrado",
};

export default function AdminEventWaitlist() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();

  const [event, setEvent] = useState<EventRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [templates, setTemplates] = useState<{ id: string; nombre: string; preguntas: WaitlistQuestion[] }[]>([]);

  const [entries, setEntries] = useState<EntryRow[]>([]);
  const [filterEstado, setFilterEstado] = useState<string>("todos");
  const [search, setSearch] = useState("");
  const [viewing, setViewing] = useState<EntryRow | null>(null);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    const [{ data: e }, { data: es }, { data: tpl }] = await Promise.all([
      supabase.from("events").select("id, title, estado_publicacion, waitlist_habilitada, waitlist_mensaje, waitlist_questions").eq("id", id).maybeSingle(),
      supabase.from("event_waitlist_entries" as any).select("*").eq("event_id", id).order("created_at", { ascending: false }),
      supabase.from("waitlist_question_templates" as any).select("id, nombre, preguntas").order("nombre"),
    ]);
    if (e) {
      setEvent({
        ...(e as any),
        waitlist_questions: Array.isArray((e as any).waitlist_questions) ? (e as any).waitlist_questions : [],
      });
    }
    setEntries(((es as any[]) || []) as EntryRow[]);
    setTemplates(((tpl as any[]) || []) as any);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [id]);

  const saveConfig = async () => {
    if (!event) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("events")
        .update({
          estado_publicacion: event.estado_publicacion,
          waitlist_habilitada: event.waitlist_habilitada,
          waitlist_mensaje: event.waitlist_mensaje,
          waitlist_questions: (event.waitlist_questions || []).map((q, i) => ({ ...q, orden: i })) as any,
        } as any)
        .eq("id", event.id);
      if (error) throw error;
      toast({ title: "Configuración guardada" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const applyTemplate = (tplId: string) => {
    const t = templates.find((x) => x.id === tplId);
    if (!t || !event) return;
    setEvent({
      ...event,
      waitlist_questions: (t.preguntas || []).map((q, i) => ({ ...q, orden: i })),
    });
    toast({ title: "Plantilla copiada", description: "Podés editar las preguntas para este evento." });
  };

  const changeState = async (entryId: string, estado: WaitlistEntryState) => {
    const { data: { session } } = await supabase.auth.getSession();
    const patch: any = { estado };
    if (estado !== "nuevo") {
      patch.contactado_at = new Date().toISOString();
      patch.contactado_por = session?.user.id || null;
    }
    const { error } = await supabase.from("event_waitlist_entries" as any).update(patch).eq("id", entryId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    setEntries((prev) => prev.map((r) => (r.id === entryId ? { ...r, estado } : r)));
  };

  const updateNota = async (entryId: string, admin_notas: string) => {
    const { error } = await supabase.from("event_waitlist_entries" as any).update({ admin_notas }).eq("id", entryId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    setEntries((prev) => prev.map((r) => (r.id === entryId ? { ...r, admin_notas } : r)));
  };

  const filtered = useMemo(() => {
    return entries.filter((r) => {
      if (filterEstado !== "todos" && r.estado !== filterEstado) return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !r.nombre.toLowerCase().includes(q) &&
          !r.email.toLowerCase().includes(q) &&
          !(r.telefono || "").toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [entries, filterEstado, search]);

  const kpis = useMemo(() => {
    const acc: Record<string, number> = { total: entries.length, nuevo: 0, contactado: 0, convertido: 0, descartado: 0 };
    entries.forEach((r) => { acc[r.estado] = (acc[r.estado] || 0) + 1; });
    return acc;
  }, [entries]);

  const copyEmails = () => {
    const emails = filtered.map((r) => r.email).join(", ");
    navigator.clipboard.writeText(emails);
    toast({ title: `${filtered.length} emails copiados` });
  };

  const exportCsv = () => {
    if (!event) return;
    const questions = event.waitlist_questions || [];
    const headers = ["nombre", "email", "telefono", "dni", "estado", "created_at", ...questions.map((q) => q.label)];
    const rows = filtered.map((r) => [
      r.nombre,
      r.email,
      r.telefono || "",
      r.dni || "",
      r.estado,
      r.created_at,
      ...questions.map((q) => {
        const v = r.respuestas?.[q.id];
        return Array.isArray(v) ? v.join(" | ") : v ?? "";
      }),
    ]);
    const csv = [headers, ...rows]
      .map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lista-espera-${event.title.slice(0, 40).replace(/\s+/g, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return <div className="py-16 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>;
  if (!event) return <div className="py-16 text-center text-muted-foreground">Evento no encontrado.</div>;

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <div>
        <Link to="/admin/eventos" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
          <ArrowLeft className="w-3 h-3" /> Volver a eventos
        </Link>
        <h1 className="text-2xl font-heading font-bold mt-2">Lista de espera</h1>
        <p className="text-sm text-muted-foreground">{event.title}</p>
      </div>

      <Tabs defaultValue="anotados" className="space-y-4">
        <TabsList>
          <TabsTrigger value="anotados">Anotados ({entries.length})</TabsTrigger>
          <TabsTrigger value="config">Configuración</TabsTrigger>
        </TabsList>

        <TabsContent value="anotados" className="space-y-4">
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            <KpiCard label="Total" value={kpis.total} />
            <KpiCard label="Nuevos" value={kpis.nuevo || 0} tone="primary" />
            <KpiCard label="Contactados" value={kpis.contactado || 0} tone="sky" />
            <KpiCard label="Convertidos" value={kpis.convertido || 0} tone="emerald" />
            <KpiCard label="Descartados" value={kpis.descartado || 0} tone="muted" />
          </div>

          {/* Filtros */}
          <Card>
            <CardContent className="pt-4 flex flex-col md:flex-row gap-2 md:items-center">
              <Input
                placeholder="Buscar por nombre, email, teléfono…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="md:max-w-xs"
              />
              <Select value={filterEstado} onValueChange={setFilterEstado}>
                <SelectTrigger className="md:w-[180px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos los estados</SelectItem>
                  {WAITLIST_ENTRY_STATES.map((s) => (
                    <SelectItem key={s} value={s}>{STATE_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex-1" />
              <Button variant="outline" size="sm" onClick={copyEmails} className="gap-1">
                <Copy className="w-4 h-4" /> Copiar emails
              </Button>
              <Button variant="outline" size="sm" onClick={exportCsv} className="gap-1">
                <Download className="w-4 h-4" /> Exportar CSV
              </Button>
            </CardContent>
          </Card>

          {/* Tabla */}
          <Card>
            <CardContent className="pt-4">
              {filtered.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {entries.length === 0
                    ? "Nadie se anotó todavía. Compartí el link del evento para nutrir la base."
                    : "No hay resultados con esos filtros."}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
                      <tr>
                        <th className="text-left py-2 px-2">Nombre</th>
                        <th className="text-left py-2 px-2">Email</th>
                        <th className="text-left py-2 px-2">Tel</th>
                        <th className="text-left py-2 px-2">Fecha</th>
                        <th className="text-left py-2 px-2">Estado</th>
                        <th className="text-right py-2 px-2">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((r) => (
                        <tr key={r.id} className="border-b border-border/50 hover:bg-muted/20">
                          <td className="py-2 px-2 font-medium">{r.nombre}</td>
                          <td className="py-2 px-2 text-muted-foreground">{r.email}</td>
                          <td className="py-2 px-2 text-muted-foreground">{r.telefono || "—"}</td>
                          <td className="py-2 px-2 text-xs text-muted-foreground">
                            {new Date(r.created_at).toLocaleDateString()}
                          </td>
                          <td className="py-2 px-2">
                            <Select value={r.estado} onValueChange={(v) => changeState(r.id, v as WaitlistEntryState)}>
                              <SelectTrigger className="h-7 text-xs w-[130px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {WAITLIST_ENTRY_STATES.map((s) => (
                                  <SelectItem key={s} value={s}>{STATE_LABELS[s]}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="py-2 px-2 text-right">
                            <div className="flex justify-end gap-1">
                              <Button variant="ghost" size="icon" onClick={() => setViewing(r)} title="Ver respuestas">
                                <Eye className="w-4 h-4" />
                              </Button>
                              {r.telefono && (
                                <a
                                  href={`https://wa.me/${r.telefono.replace(/\D/g, "")}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  title="WhatsApp"
                                >
                                  <Button variant="ghost" size="icon">
                                    <MessageCircle className="w-4 h-4" />
                                  </Button>
                                </a>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="config" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Publicación</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-xs">Estado</Label>
                <Select
                  value={event.estado_publicacion}
                  onValueChange={(v) => setEvent({ ...event, estado_publicacion: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(ESTADO_PUB_LABELS).map(([k, l]) => (
                      <SelectItem key={k} value={k}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground mt-1">
                  <b>Próximamente</b>: aparece en el listado con badge y CTA de lista de espera (sin paquetes/precios).{" "}
                  <b>Publicado</b>: reserva normal. <b>Agotado</b>: se muestra publicado pero sin cupos, con CTA de lista de espera.{" "}
                  <b>Borrador</b>: oculto. <b>Cerrado</b>: solo lectura.
                </p>
              </div>

              <div className="flex items-center justify-between rounded-md border border-border p-3">
                <div>
                  <p className="text-sm font-medium">Habilitar formulario de lista de espera</p>
                  <p className="text-xs text-muted-foreground">
                    Podés dejarla activa incluso con el evento publicado, útil si ya se llenó.
                  </p>
                </div>
                <Switch
                  checked={event.waitlist_habilitada}
                  onCheckedChange={(v) => setEvent({ ...event, waitlist_habilitada: v })}
                />
              </div>

              <div>
                <Label className="text-xs">Mensaje para el que se anota</Label>
                <Textarea
                  value={event.waitlist_mensaje || ""}
                  onChange={(e) => setEvent({ ...event, waitlist_mensaje: e.target.value })}
                  rows={3}
                  placeholder="Ej: Estamos definiendo fechas. Anotate y te avisamos apenas abramos las inscripciones."
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center justify-between">
                <span>Preguntas del formulario</span>
                {templates.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Aplicar plantilla:</span>
                    <Select onValueChange={applyTemplate}>
                      <SelectTrigger className="h-8 w-[200px] text-xs">
                        <SelectValue placeholder="Elegir plantilla" />
                      </SelectTrigger>
                      <SelectContent>
                        {templates.map((t) => (
                          <SelectItem key={t.id} value={t.id}>{t.nombre}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <WaitlistQuestionsEditor
                value={event.waitlist_questions || []}
                onChange={(v) => setEvent({ ...event, waitlist_questions: v })}
              />
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button onClick={saveConfig} disabled={saving} className="gap-1">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Guardar configuración
            </Button>
          </div>
        </TabsContent>
      </Tabs>

      {/* Ver respuestas */}
      <Dialog open={!!viewing} onOpenChange={(v) => !v && setViewing(null)}>
        <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{viewing?.nombre}</DialogTitle>
          </DialogHeader>
          {viewing && (
            <div className="space-y-3 text-sm">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{viewing.email}</Badge>
                {viewing.telefono && <Badge variant="outline">Tel: {viewing.telefono}</Badge>}
                {viewing.dni && <Badge variant="outline">DNI: {viewing.dni}</Badge>}
                <Badge className={STATE_COLORS[viewing.estado]}>
                  {STATE_LABELS[viewing.estado]}
                </Badge>
              </div>

              <div className="space-y-2 border-t border-border pt-3">
                {(event.waitlist_questions || []).map((q) => {
                  const v = viewing.respuestas?.[q.id];
                  return (
                    <div key={q.id}>
                      <p className="text-[11px] uppercase text-muted-foreground">{q.label}</p>
                      <p className="text-foreground">
                        {v == null || v === "" ? (
                          <span className="text-muted-foreground italic">—</span>
                        ) : Array.isArray(v) ? (
                          v.join(", ")
                        ) : (
                          String(v)
                        )}
                      </p>
                    </div>
                  );
                })}
                {(event.waitlist_questions || []).length === 0 && (
                  <p className="text-xs text-muted-foreground italic">Sin preguntas configuradas.</p>
                )}
              </div>

              <div className="border-t border-border pt-3">
                <Label className="text-xs">Nota admin</Label>
                <Textarea
                  defaultValue={viewing.admin_notas || ""}
                  rows={2}
                  onBlur={(e) => updateNota(viewing.id, e.target.value)}
                  placeholder="Notas internas…"
                />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function KpiCard({ label, value, tone }: { label: string; value: number; tone?: "primary" | "sky" | "emerald" | "muted" }) {
  const toneCls =
    tone === "primary" ? "text-primary" :
    tone === "sky" ? "text-sky-400" :
    tone === "emerald" ? "text-emerald-400" :
    tone === "muted" ? "text-muted-foreground" :
    "text-foreground";
  return (
    <Card>
      <CardContent className="py-3">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
        <p className={`text-2xl font-heading font-bold ${toneCls}`}>{value}</p>
      </CardContent>
    </Card>
  );
}
