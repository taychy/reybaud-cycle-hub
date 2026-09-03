import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  AlertTriangle, CalendarDays, ChevronLeft, ChevronRight, Clock, ExternalLink,
  MapPin, Repeat, User, UserMinus, Users,
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAgendaSemana } from "@/hooks/useAgendaSemana";
import {
  DIAS_SEMANA, DIAS_SEMANA_CORTO, addDays, parseIso, rangoHorarioSemana,
  startOfWeek, toLocalIso, toMinutes, type AgendaEvento,
} from "@/lib/agenda";

type TipoFiltro = "operativo" | "grupal" | "turno" | "disponibilidad" | "todos";

const TIPO_LABEL: Record<string, string> = {
  grupal: "Clase grupal",
  turno: "Turno",
  disponibilidad: "Disponibilidad",
  ausencia: "Ausencia",
};

const TIPO_STYLE: Record<string, string> = {
  grupal: "border-primary/50 bg-primary/10",
  turno: "border-accent/50 bg-accent/10",
  disponibilidad: "border-dashed border-border/70 bg-muted/30",
  ausencia: "border-muted-foreground/40 bg-muted/50",
};

const PX_POR_MINUTO = 0.9;

/**
 * Calendario operativo semanal embebido en el Resumen Admin.
 * NO crea registros: representa las fuentes existentes (clases grupales,
 * turnera, disponibilidad y ausencias) con la misma normalización que
 * `/admin/agenda`.
 */
const AdminOperationalCalendar = () => {
  const isMobile = useIsMobile();
  const {
    monday, setMonday, dias, loading, eventos, conflictos, coaches, sedes, solicitudesPendientes,
  } = useAgendaSemana();

  const [sedeFiltro, setSedeFiltro] = useState("all");
  const [coachFiltro, setCoachFiltro] = useState("all");
  const [tipoFiltro, setTipoFiltro] = useState<TipoFiltro>("operativo");
  const hoyIso = toLocalIso(new Date());
  const [diaSel, setDiaSel] = useState<string>(hoyIso);
  const [detalle, setDetalle] = useState<AgendaEvento | null>(null);

  const filtrados = useMemo(
    () =>
      eventos.filter((e) => {
        if (tipoFiltro === "operativo" && e.tipo === "disponibilidad") return false;
        if (!["operativo", "todos"].includes(tipoFiltro) && e.tipo !== tipoFiltro) return false;
        if (sedeFiltro !== "all" && e.tipo !== "ausencia" && (e.sede_id || "none") !== sedeFiltro) return false;
        if (coachFiltro !== "all" && e.coach_id !== coachFiltro) return false;
        return true;
      }),
    [eventos, tipoFiltro, sedeFiltro, coachFiltro],
  );

  const diaActivo = dias.includes(diaSel) ? diaSel : dias[0];
  const delDia = filtrados.filter((e) => e.fecha === diaActivo);
  const conflictosSemana = filtrados.filter((e) => conflictos.has(e.id));
  const conflictosDia = delDia.filter((e) => conflictos.has(e.id));

  const [desdeH, hastaH] = useMemo(() => rangoHorarioSemana(filtrados), [filtrados]);
  const horas = Array.from({ length: hastaH - desdeH }, (_, i) => desdeH + i);
  const altura = (hastaH - desdeH) * 60 * PX_POR_MINUTO;

  const rangoLabel = `${parseIso(dias[0]).toLocaleDateString("es-AR", { day: "numeric", month: "short" })} – ${parseIso(dias[6]).toLocaleDateString("es-AR", { day: "numeric", month: "short" })}`;

  const contarDia = (iso: string, tipo: string) =>
    filtrados.filter((e) => e.fecha === iso && e.tipo === tipo).length;

  const irSemana = (delta: number) => setMonday((m) => addDays(m, delta * 7));
  const irHoy = () => { setMonday(startOfWeek(new Date())); setDiaSel(hoyIso); };

  const EventoChip = ({ e, compact }: { e: AgendaEvento; compact?: boolean }) => {
    const enConflicto = conflictos.has(e.id);
    const recurrente = e.tipo === "grupal" && (e.raw?.tipo_clase ?? "recurrente") !== "puntual";
    return (
      <button
        type="button"
        onClick={() => setDetalle(e)}
        className={`w-full text-left rounded-md border px-1.5 py-1 overflow-hidden transition-colors hover:brightness-110 ${
          enConflicto ? "border-destructive/60 bg-destructive/10" : TIPO_STYLE[e.tipo]
        }`}
      >
        <p className="text-[10px] font-medium text-foreground flex items-center gap-1 truncate">
          <Clock className="w-2.5 h-2.5 shrink-0" />
          {e.hora_inicio}–{e.hora_fin}
          {recurrente && <Repeat className="w-2.5 h-2.5 text-muted-foreground shrink-0" />}
        </p>
        <p className="text-[11px] text-foreground truncate">{e.titulo}</p>
        {!compact && (
          <p className="text-[10px] text-muted-foreground truncate">
            {TIPO_LABEL[e.tipo]} · {e.coach_nombre}
          </p>
        )}
        {enConflicto && (
          <span className="text-[10px] text-destructive font-medium">⚠ Conflicto</span>
        )}
      </button>
    );
  };

  return (
    <Card className="border-border">
      <CardContent className="p-3 sm:p-4 space-y-3">
        {/* Encabezado + navegación */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-heading font-bold uppercase tracking-wider">Agenda de la semana</h2>
          </div>
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => irSemana(-1)} title="Semana anterior">
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" className="h-8" onClick={irHoy}>Hoy</Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => irSemana(1)} title="Semana siguiente">
              <ChevronRight className="w-4 h-4" />
            </Button>
            <span className="text-xs text-muted-foreground ml-1">{rangoLabel}</span>
            <Link to="/admin/agenda" className="ml-2">
              <Button variant="ghost" size="sm" className="h-8 text-xs">
                Abrir Agenda completa <ExternalLink className="w-3 h-3 ml-1" />
              </Button>
            </Link>
          </div>
        </div>

        {/* Filtros */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <Select value={sedeFiltro} onValueChange={setSedeFiltro}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Sede" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las sedes</SelectItem>
              <SelectItem value="none">Sin sede</SelectItem>
              {sedes.filter((s) => s.activa !== false).map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={coachFiltro} onValueChange={setCoachFiltro}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Profesor" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los profesores</SelectItem>
              {coaches.filter((c) => c.estado !== "inactivo").map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={tipoFiltro} onValueChange={(v) => setTipoFiltro(v as TipoFiltro)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Tipo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="operativo">Operativo (clases + turnos)</SelectItem>
              <SelectItem value="grupal">Clases grupales</SelectItem>
              <SelectItem value="turno">Turnos / personalizadas</SelectItem>
              <SelectItem value="disponibilidad">Disponibilidad</SelectItem>
              <SelectItem value="todos">Todo (incluye disponibilidad)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {conflictosSemana.length > 0 && (
          <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0" />
            <p className="text-[11px] text-destructive">
              {conflictosSemana.length} evento(s) con ⚠ conflicto esta semana (mismo profesor superpuesto o dentro de una ausencia).
            </p>
          </div>
        )}

        {loading ? (
          <p className="text-sm text-muted-foreground text-center py-10 animate-pulse">Cargando agenda…</p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-3 items-start">
            {/* Calendario */}
            <div className="lg:col-span-3 min-w-0">
              {isMobile ? (
                <div className="space-y-2">
                  <div className="flex gap-1.5 overflow-x-auto pb-1">
                    {dias.map((iso) => {
                      const d = parseIso(iso);
                      const act = iso === diaActivo;
                      return (
                        <button
                          key={iso}
                          onClick={() => setDiaSel(iso)}
                          className={`shrink-0 rounded-md border px-2.5 py-1.5 text-center ${
                            act ? "border-primary bg-primary/10" : "border-border"
                          }`}
                        >
                          <p className="text-[10px] uppercase text-muted-foreground">{DIAS_SEMANA_CORTO[d.getDay()]}</p>
                          <p className="text-sm font-bold tabular-nums">{d.getDate()}</p>
                          <p className="text-[9px] text-muted-foreground">
                            {filtrados.filter((e) => e.fecha === iso).length}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                  {delDia.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic py-4 text-center">Sin actividad ese día</p>
                  ) : (
                    <div className="space-y-1.5">
                      {delDia.map((e) => <EventoChip key={e.id} e={e} />)}
                    </div>
                  )}
                  <Link to="/admin/agenda">
                    <Button variant="outline" size="sm" className="w-full">Ver semana completa</Button>
                  </Link>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <div className="min-w-[720px]">
                    <div className="grid" style={{ gridTemplateColumns: "48px repeat(7, minmax(0,1fr))" }}>
                      <div />
                      {dias.map((iso) => {
                        const d = parseIso(iso);
                        const esHoy = iso === hoyIso;
                        return (
                          <button
                            key={iso}
                            onClick={() => setDiaSel(iso)}
                            className={`text-center pb-1 border-b ${
                              iso === diaActivo ? "border-primary" : "border-border"
                            }`}
                          >
                            <p className={`text-[10px] uppercase tracking-wider ${esHoy ? "text-primary" : "text-muted-foreground"}`}>
                              {DIAS_SEMANA_CORTO[d.getDay()]}
                            </p>
                            <p className="text-sm font-bold tabular-nums">{d.getDate()}</p>
                          </button>
                        );
                      })}
                    </div>

                    <div className="grid" style={{ gridTemplateColumns: "48px repeat(7, minmax(0,1fr))" }}>
                      {/* Eje horario */}
                      <div className="relative" style={{ height: altura }}>
                        {horas.map((h) => (
                          <div
                            key={h}
                            className="absolute left-0 text-[10px] text-muted-foreground -translate-y-1/2"
                            style={{ top: (h - desdeH) * 60 * PX_POR_MINUTO }}
                          >
                            {String(h).padStart(2, "0")}:00
                          </div>
                        ))}
                      </div>

                      {dias.map((iso) => (
                        <div
                          key={iso}
                          className={`relative border-l border-border ${iso === hoyIso ? "bg-primary/5" : ""}`}
                          style={{ height: altura }}
                        >
                          {horas.map((h) => (
                            <div
                              key={h}
                              className="absolute left-0 right-0 border-t border-border/40"
                              style={{ top: (h - desdeH) * 60 * PX_POR_MINUTO }}
                            />
                          ))}
                          {filtrados
                            .filter((e) => e.fecha === iso)
                            .map((e) => {
                              const top = (toMinutes(e.hora_inicio) - desdeH * 60) * PX_POR_MINUTO;
                              const alto = Math.max(
                                26,
                                (toMinutes(e.hora_fin) - toMinutes(e.hora_inicio)) * PX_POR_MINUTO,
                              );
                              return (
                                <div
                                  key={e.id}
                                  className="absolute left-0.5 right-0.5"
                                  style={{ top: Math.max(0, top), height: alto }}
                                >
                                  <EventoChip e={e} compact />
                                </div>
                              );
                            })}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Panel del día */}
            <div className="rounded-md border border-border bg-muted/20 p-3 space-y-2">
              <p className="text-xs font-semibold text-foreground">
                {DIAS_SEMANA[parseIso(diaActivo).getDay()]}{" "}
                <span className="text-muted-foreground font-normal">
                  {parseIso(diaActivo).toLocaleDateString("es-AR", { day: "numeric", month: "short" })}
                </span>
              </p>
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="secondary" className="text-[10px]">{contarDia(diaActivo, "grupal")} clases</Badge>
                <Badge variant="secondary" className="text-[10px]">{contarDia(diaActivo, "turno")} turnos</Badge>
                {contarDia(diaActivo, "ausencia") > 0 && (
                  <Badge variant="outline" className="text-[10px]">{contarDia(diaActivo, "ausencia")} ausencias</Badge>
                )}
                {conflictosDia.length > 0 && (
                  <Badge variant="destructive" className="text-[10px]">⚠ {conflictosDia.length} conflicto(s)</Badge>
                )}
              </div>

              <div className="space-y-1.5 pt-1">
                {delDia.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground italic">Sin actividad</p>
                ) : (
                  delDia.slice(0, 5).map((e) => (
                    <button
                      key={e.id}
                      onClick={() => setDetalle(e)}
                      className="w-full text-left text-[11px] rounded border border-border bg-card px-2 py-1 hover:border-primary/50"
                    >
                      <span className="font-medium tabular-nums">{e.hora_inicio}</span>{" "}
                      {e.titulo}
                      <span className="block text-muted-foreground">{TIPO_LABEL[e.tipo]} · {e.coach_nombre}</span>
                    </button>
                  ))
                )}
                {delDia.length > 5 && (
                  <p className="text-[10px] text-muted-foreground">+{delDia.length - 5} más</p>
                )}
              </div>

              {solicitudesPendientes > 0 && (
                <Link to="/admin/agenda" className="block text-[11px] text-primary hover:underline">
                  {solicitudesPendientes} solicitud(es) de profesores pendientes →
                </Link>
              )}
              <Link to="/admin/agenda">
                <Button variant="outline" size="sm" className="w-full h-8 text-xs">Ver agenda del día</Button>
              </Link>
            </div>
          </div>
        )}
      </CardContent>

      {/* Detalle del evento */}
      <Sheet open={!!detalle} onOpenChange={(o) => !o && setDetalle(null)}>
        <SheetContent side="right" className="w-full sm:max-w-sm overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="text-sm font-heading uppercase tracking-wider">
              {detalle ? TIPO_LABEL[detalle.tipo] : ""}
            </SheetTitle>
          </SheetHeader>
          {detalle && (
            <div className="space-y-3 py-4 text-sm">
              <p className="text-base font-medium">{detalle.titulo}</p>
              <p className="flex items-center gap-2 text-muted-foreground">
                <Clock className="w-4 h-4" />
                {parseIso(detalle.fecha).toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" })} · {detalle.hora_inicio}–{detalle.hora_fin}
              </p>
              <p className="flex items-center gap-2 text-muted-foreground">
                {detalle.tipo === "ausencia" ? <UserMinus className="w-4 h-4" /> : <Users className="w-4 h-4" />}
                {detalle.coach_nombre}
              </p>
              {detalle.sede_nombre && (
                <p className="flex items-center gap-2 text-muted-foreground">
                  <MapPin className="w-4 h-4" /> {detalle.sede_nombre}
                </p>
              )}
              {detalle.detalle && (
                <p className="flex items-center gap-2 text-muted-foreground">
                  <User className="w-4 h-4" /> {detalle.detalle}
                </p>
              )}
              {detalle.estado && <Badge variant="outline" className="text-[10px]">{detalle.estado}</Badge>}
              {conflictos.has(detalle.id) && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" /> ⚠ Conflicto con otra actividad del profesor.
                </p>
              )}
              {detalle.chips && detalle.chips.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {detalle.chips.map((c) => <Badge key={c} variant="secondary" className="text-[10px]">{c}</Badge>)}
                </div>
              )}
              <div className="pt-2 space-y-2">
                <Link to={detalle.tipo === "turno" ? "/admin/turnera" : "/admin/agenda"}>
                  <Button variant="gold" size="sm" className="w-full">
                    {detalle.tipo === "turno" ? "Abrir en Turnera" : "Editar en Agenda completa"}
                  </Button>
                </Link>
                <p className="text-[11px] text-muted-foreground">
                  El calendario del Resumen es de consulta: la edición se hace en su sección original.
                </p>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </Card>
  );
};

export default AdminOperationalCalendar;
