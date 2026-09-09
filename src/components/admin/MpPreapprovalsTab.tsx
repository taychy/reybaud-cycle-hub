import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Repeat, Loader2, Search, ChevronDown, ChevronRight, X, ShieldCheck, Info,
} from "lucide-react";
import { formatPrice } from "@/lib/currency";

interface PreapprovalRow {
  preapproval_id: string;
  mp_plan_id: string | null;
  payer_email: string | null;
  descripcion_mp: string | null;
  importe_referencia: number | null;
  moneda: string | null;
  estado: string;
  origen_alumno: string | null;
  alumno_id: string | null;
  alumno_nombre: string | null;
  alumno_emails: string | null;
  plan_id: string | null;
  plan_nombre: string | null;
  confirmado_por_email: string | null;
  confirmado_at: string | null;
  movimientos_vistos: number;
  movimientos_sin_imputar: number;
  primera_fecha: string | null;
  ultima_fecha: string | null;
}

interface MovimientoRow {
  movimiento_id: string;
  mp_payment_id: string | null;
  fecha_movimiento: string;
  amount: number | null;
  currency: string | null;
  description: string | null;
  imputado: boolean;
}

interface AlumnoOption {
  id: string;
  nombre: string;
  apellido: string | null;
  email: string | null;
  emails_adicionales: string[] | null;
}

const ESTADO_BADGE: Record<string, { label: string; className: string }> = {
  detectado: { label: "Detectado", className: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30" },
  confirmado: { label: "Confirmado", className: "bg-green-500/10 text-green-400 border-green-500/30" },
  ignorado: { label: "Ignorado", className: "bg-muted text-muted-foreground border-border" },
};

const fmtFecha = (iso: string | null) => {
  if (!iso) return "—";
  const d = iso.slice(0, 10).split("-");
  return `${d[2]}/${d[1]}/${d[0]}`;
};

const alumnoLabel = (a: AlumnoOption) =>
  `${a.nombre} ${a.apellido || ""}`.trim() + (a.email ? ` · ${a.email}` : "");

/** Buscador remoto de alumnos (nombre, apellido, email y emails adicionales). */
const AlumnoCombobox = ({
  value, valueLabel, onChange,
}: {
  value: string;
  valueLabel: string | null;
  onChange: (id: string, label: string) => void;
}) => {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [opts, setOpts] = useState<AlumnoOption[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancel = false;
    setBusy(true);
    const t = setTimeout(async () => {
      const { data } = await supabase.rpc("buscar_alumnos_mp", { _q: q, _limit: 20 });
      if (cancel) return;
      setOpts((data as AlumnoOption[]) || []);
      setBusy(false);
    }, 250);
    return () => { cancel = true; clearTimeout(t); };
  }, [q, open]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-full justify-between font-normal">
          <span className="truncate">{value ? (valueLabel || "Alumno seleccionado") : "Buscar alumno…"}</span>
          <ChevronDown className="w-4 h-4 opacity-60 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[min(28rem,90vw)]" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Nombre, apellido o email…" value={q} onValueChange={setQ} />
          <CommandList>
            {busy ? (
              <div className="py-4 text-center text-xs text-muted-foreground">Buscando…</div>
            ) : (
              <CommandEmpty>Sin resultados.</CommandEmpty>
            )}
            <CommandGroup>
              {opts.map((a) => {
                const extra = (a.emails_adicionales || []).filter(Boolean);
                return (
                  <CommandItem
                    key={a.id}
                    value={a.id}
                    onSelect={() => { onChange(a.id, alumnoLabel(a)); setOpen(false); }}
                  >
                    <div className="min-w-0">
                      <div className="truncate">{`${a.nombre} ${a.apellido || ""}`.trim()}</div>
                      <div className="text-[11px] text-muted-foreground truncate">
                        {a.email || "sin email"}
                        {extra.length ? ` · +${extra.join(", ")}` : ""}
                      </div>
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

/**
 * Gestión de identidad recurrente de Mercado Pago (P0).
 * Sólo mapea preapproval → alumno → plan. Confirmar NO imputa pagos
 * ni modifica mensualidades: eso queda para etapas posteriores.
 */
const MpPreapprovalsTab = () => {
  const { toast } = useToast();
  const [rows, setRows] = useState<PreapprovalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [estadoFiltro, setEstadoFiltro] = useState<"todos" | "detectado" | "confirmado" | "ignorado">("todos");
  const [planes, setPlanes] = useState<{ id: string; nombre: string }[]>([]);

  const [expandido, setExpandido] = useState<string | null>(null);
  const [movs, setMovs] = useState<Record<string, MovimientoRow[]>>({});
  const [movsLoading, setMovsLoading] = useState<string | null>(null);

  const [editing, setEditing] = useState<PreapprovalRow | null>(null);
  const [selAlumno, setSelAlumno] = useState<string>("");
  const [selAlumnoLabel, setSelAlumnoLabel] = useState<string | null>(null);
  const [selPlan, setSelPlan] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: pre }, { data: pls }] = await Promise.all([
      supabase.from("vw_mp_preapprovals_admin").select("*").order("ultima_fecha", { ascending: false }),
      supabase.from("planes").select("id, nombre").order("nombre"),
    ]);
    setRows((pre as unknown as PreapprovalRow[]) || []);
    setPlanes(((pls as { id: string; nombre: string }[]) || []));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const conteos = useMemo(() => ({
    todos: rows.length,
    detectado: rows.filter((r) => r.estado === "detectado").length,
    confirmado: rows.filter((r) => r.estado === "confirmado").length,
    ignorado: rows.filter((r) => r.estado === "ignorado").length,
  }), [rows]);

  const filtered = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return rows.filter((r) => {
      if (estadoFiltro !== "todos" && r.estado !== estadoFiltro) return false;
      if (!q) return true;
      return [
        r.preapproval_id, r.payer_email, r.descripcion_mp,
        r.alumno_nombre, r.alumno_emails, r.plan_nombre,
      ].some((v) => (v || "").toLowerCase().includes(q));
    });
  }, [rows, busca, estadoFiltro]);

  const toggleDetalle = async (id: string) => {
    if (expandido === id) { setExpandido(null); return; }
    setExpandido(id);
    if (movs[id]) return;
    setMovsLoading(id);
    const { data } = await supabase
      .from("vw_mp_preapproval_movimientos")
      .select("movimiento_id, mp_payment_id, fecha_movimiento, amount, currency, description, imputado")
      .eq("preapproval_id", id)
      .order("fecha_movimiento", { ascending: true });
    setMovs((prev) => ({ ...prev, [id]: (data as unknown as MovimientoRow[]) || [] }));
    setMovsLoading(null);
  };

  const openEdit = (r: PreapprovalRow) => {
    setEditing(r);
    setSelAlumno(r.alumno_id || "");
    setSelAlumnoLabel(r.alumno_nombre?.trim() || null);
    setSelPlan(r.plan_id || "");
  };

  const ejecutar = async (
    row: PreapprovalRow,
    estado: "confirmado" | "ignorado" | "detectado",
    aplicarMapping: boolean,
    alumnoId?: string | null,
    planId?: string | null,
  ) => {
    setSaving(true);
    const { error } = await supabase.rpc("set_mp_preapproval_mapping", {
      _preapproval_id: row.preapproval_id,
      _estado: estado,
      _aplicar_mapping: aplicarMapping,
      _alumno_id: aplicarMapping ? (alumnoId || null) : null,
      _plan_id: aplicarMapping ? (planId || null) : null,
      _notas: null,
    });
    setSaving(false);
    if (error) {
      toast({ title: "No se pudo guardar", description: error.message, variant: "destructive" });
      return;
    }
    toast({
      title: "Vínculo actualizado",
      description: "No se imputó ningún pago ni se modificó ninguna mensualidad.",
    });
    setEditing(null);
    load();
  };

  const guardarDesdeDialogo = async (estado: "confirmado" | "detectado") => {
    if (!editing) return;
    if (estado === "confirmado" && (!selAlumno || !selPlan)) {
      toast({ title: "Faltan datos", description: "Para confirmar hay que elegir alumno y plan.", variant: "destructive" });
      return;
    }
    await ejecutar(editing, estado, true, selAlumno || null, selPlan || null);
  };

  const avisoAlcance = (
    <div className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/10 p-2.5 text-xs text-foreground">
      <ShieldCheck className="w-4 h-4 text-primary shrink-0 mt-0.5" />
      <span><strong>Confirmar vínculo NO imputa pagos ni modifica mensualidades.</strong></span>
    </div>
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Repeat className="w-4 h-4" />
            Suscripciones recurrentes de Mercado Pago
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Acá se vincula cada cobro automático de Mercado Pago con el alumno y el plan que le corresponden.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {avisoAlcance}

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[220px] max-w-sm">
              <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Buscar por alumno, email (incluye adicionales) o descripción"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {([
                ["todos", "Todos"],
                ["detectado", "Detectados"],
                ["confirmado", "Confirmados"],
                ["ignorado", "Ignorados"],
              ] as const).map(([key, label]) => (
                <Button
                  key={key}
                  size="sm"
                  variant={estadoFiltro === key ? "default" : "outline"}
                  onClick={() => setEstadoFiltro(key)}
                >
                  {label} ({conteos[key]})
                </Button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
              <Loader2 className="w-4 h-4 animate-spin" /> Cargando…
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6">No hay suscripciones recurrentes con este filtro.</p>
          ) : (
            <div className="space-y-2">
              {filtered.map((r) => {
                const badge = ESTADO_BADGE[r.estado] || ESTADO_BADGE.detectado;
                const abierto = expandido === r.preapproval_id;
                const detalle = movs[r.preapproval_id];
                return (
                  <div key={r.preapproval_id} className="rounded-lg border border-border">
                    <div className="p-3 flex flex-col md:flex-row md:items-center gap-3">
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-sm">{r.descripcion_mp || "Sin descripción"}</span>
                          <Badge variant="outline" className={badge.className}>{badge.label}</Badge>
                          {r.origen_alumno === "sugerido_sync" || r.origen_alumno === "sugerido_bootstrap" ? (
                            <Badge variant="outline" className="text-[10px]">alumno sugerido</Badge>
                          ) : null}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {r.payer_email || "sin email"} · {r.alumno_nombre?.trim() || "sin alumno"} ·{" "}
                          {r.plan_nombre || "sin plan asignado"}
                        </p>
                        {r.estado === "confirmado" && (r.confirmado_por_email || r.confirmado_at) && (
                          <p className="text-[11px] text-green-400">
                            Confirmado por {r.confirmado_por_email || "un admin"} el {fmtFecha(r.confirmado_at)}
                          </p>
                        )}
                        <p className="text-[11px] text-muted-foreground font-mono truncate">
                          {r.preapproval_id}{r.mp_plan_id ? ` · plan MP ${r.mp_plan_id}` : ""}
                        </p>
                      </div>
                      <div className="text-xs text-muted-foreground md:text-right shrink-0">
                        <div>{r.movimientos_vistos} cobro(s) · {r.movimientos_sin_imputar} sin imputar</div>
                        <div>{fmtFecha(r.primera_fecha)} → {fmtFecha(r.ultima_fecha)}</div>
                        {r.importe_referencia != null && (
                          <div>{formatPrice(Number(r.importe_referencia), r.moneda || "ARS")}</div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Button size="sm" variant="ghost" onClick={() => toggleDetalle(r.preapproval_id)}>
                          {abierto ? <ChevronDown className="w-4 h-4 mr-1" /> : <ChevronRight className="w-4 h-4 mr-1" />}
                          Cobros
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => openEdit(r)}>
                          {r.estado === "detectado" ? "Vincular" : "Corregir"}
                        </Button>
                        {r.estado !== "detectado" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={saving}
                            onClick={() => ejecutar(r, "detectado", false)}
                          >
                            Volver a Detectado
                          </Button>
                        )}
                        {r.estado !== "ignorado" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={saving}
                            onClick={() => ejecutar(r, "ignorado", false)}
                          >
                            Ignorar
                          </Button>
                        )}
                      </div>
                    </div>

                    {abierto && (
                      <div className="border-t border-border bg-secondary/20 px-3 py-2">
                        {movsLoading === r.preapproval_id ? (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Cargando cobros…
                          </div>
                        ) : !detalle || detalle.length === 0 ? (
                          <p className="text-xs text-muted-foreground py-2">Sin cobros registrados.</p>
                        ) : (
                          <div className="space-y-1.5 py-1">
                            {detalle.map((m) => (
                              <div key={m.movimiento_id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                                <span className="w-20 shrink-0">{fmtFecha(m.fecha_movimiento)}</span>
                                <span className="font-medium">
                                  {formatPrice(Number(m.amount || 0), m.currency || "ARS")}
                                </span>
                                <span className="text-muted-foreground truncate max-w-[16rem]">
                                  {m.description || "—"}
                                </span>
                                <span className="text-muted-foreground font-mono">#{m.mp_payment_id || "—"}</span>
                                <Badge
                                  variant="outline"
                                  className={m.imputado
                                    ? "bg-green-500/10 text-green-400 border-green-500/30"
                                    : "bg-yellow-500/10 text-yellow-400 border-yellow-500/30"}
                                >
                                  {m.imputado ? "Imputado" : "Sin imputar"}
                                </Badge>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Vincular suscripción recurrente</DialogTitle>
            <DialogDescription>
              Elegí a quién pertenece este cobro automático y con qué plan se corresponde.
            </DialogDescription>
          </DialogHeader>

          {editing && (
            <div className="space-y-3">
              {avisoAlcance}

              <div className="text-xs text-muted-foreground space-y-0.5">
                <div>{editing.descripcion_mp || "Sin descripción"} · {editing.payer_email || "sin email"}</div>
                <div className="font-mono">{editing.preapproval_id}</div>
                {editing.estado === "confirmado" && (
                  <div className="text-green-400">
                    Confirmado por {editing.confirmado_por_email || "un admin"} el {fmtFecha(editing.confirmado_at)}
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <Label>Alumno</Label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <AlumnoCombobox
                      value={selAlumno}
                      valueLabel={selAlumnoLabel}
                      onChange={(id, label) => { setSelAlumno(id); setSelAlumnoLabel(label); }}
                    />
                  </div>
                  {selAlumno && (
                    <Button
                      variant="ghost" size="icon"
                      title="Dejar sin asignar"
                      onClick={() => { setSelAlumno(""); setSelAlumnoLabel(null); }}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Plan</Label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <Select value={selPlan} onValueChange={setSelPlan}>
                      <SelectTrigger><SelectValue placeholder="Elegir plan" /></SelectTrigger>
                      <SelectContent className="max-h-72">
                        {planes.map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {selPlan && (
                    <Button variant="ghost" size="icon" title="Dejar sin asignar" onClick={() => setSelPlan("")}>
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>

              <div className="flex items-start gap-2 text-[11px] text-muted-foreground">
                <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>
                  Si dejás alumno o plan sin asignar, guardá con “Guardar sin confirmar”: el vínculo vuelve a
                  quedar pendiente de revisión. Todos los cambios quedan registrados.
                </span>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="ghost" disabled={saving} onClick={() => guardarDesdeDialogo("detectado")}>
              Guardar sin confirmar
            </Button>
            <Button disabled={saving} onClick={() => guardarDesdeDialogo("confirmado")}>
              {saving && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
              Confirmar vínculo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MpPreapprovalsTab;
