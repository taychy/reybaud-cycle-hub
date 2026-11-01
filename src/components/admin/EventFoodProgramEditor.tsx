/**
 * Configuración administrativa del programa gastronómico de un viaje.
 * Todo se guarda vía RPCs admin-only; nada se activa de oficio.
 * Desayuno siempre incluido por alojamiento: no aparece en el calendario.
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { AlertTriangle, Loader2, Save, Power, CalendarDays } from "lucide-react";
import { toast } from "sonner";
import { formatPrice } from "@/lib/currency";
import {
  buildMealCalendar, calendarReadiness, activeMealsForStay, formatMealDate, MEAL_TYPE_LABELS,
  type CalendarSlot, type MealSlotState, type MealStay,
} from "@/lib/foodSurvey";

const PRECIO_REGULAR = 35000;
const NEXT: Record<MealSlotState, MealSlotState> = { pendiente: "activo", activo: "inactivo", inactivo: "pendiente" };
const STATE_LABEL: Record<MealSlotState, string> = { pendiente: "Sin decidir", activo: "Se ofrece", inactivo: "No se ofrece" };

interface Status {
  event_date: string; event_end_date: string | null; has_campaign: boolean;
  bounds: MealStay | null; pending_requests: number; sin_estadia: number;
  stays: Array<{ choice: string; start: string; end: string; reservas: number; con_pension: number; sin_pension: number }>;
  food_survey: any;
}

const EventFoodProgramEditor = ({ eventId }: { eventId: string }) => {
  const [status, setStatus] = useState<Status | null>(null);
  const [addons, setAddons] = useState<any[]>([]);
  const [cal, setCal] = useState<CalendarSlot[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<null | "enable" | "disable" | "addons" | "meals">(null);

  const load = async () => {
    const { data, error } = await (supabase.rpc as any)("admin_food_program_status", { p_event: eventId });
    if (error) { toast.error("No se pudo leer la configuración", { description: error.message }); return; }
    const st = data as Status;
    setStatus(st);
    setCal(buildMealCalendar(st.bounds, st.food_survey?.calendar));
    const { data: ad } = await supabase.from("event_addons").select("id,nombre,precio,currency,activo,categoria").eq("event_id", eventId);
    setAddons(ad || []);
  };
  useEffect(() => { load(); }, [eventId]);

  const fs = status?.food_survey || {};
  const prog = fs.meal_program || {};
  const addonFor = (t: "almuerzo" | "cena") => addons.find((a) => a.id === prog[`${t}_addon_id`] && a.categoria === "comida_regular");
  const readiness = useMemo(() => calendarReadiness(cal, { almuerzo: !!addonFor("almuerzo"), cena: !!addonFor("cena") }), [cal, addons, status]);
  const savedKey = JSON.stringify(buildMealCalendar(status?.bounds ?? null, fs.calendar));
  const dirty = savedKey !== JSON.stringify(cal);
  const fechas = [...new Set(cal.map((c) => c.fecha))];
  const specials = addons.filter((a) => a.categoria !== "comida_regular" && /cena|almuerzo/i.test(a.nombre));

  const run = async (key: string, fn: () => Promise<{ error: any }>, ok: string) => {
    setBusy(key);
    const { error } = await fn();
    setBusy(null); setConfirm(null);
    if (error) toast.error("No se pudo completar", { description: error.message });
    else { toast.success(ok); await load(); }
  };

  if (!status) return <div className="py-6 flex justify-center"><Loader2 className="w-4 h-4 animate-spin" /></div>;

  return (
    <div className="space-y-4 rounded-lg border border-border p-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-primary" />
          <p className="text-sm font-semibold">Programa gastronómico</p>
          <Badge variant={fs.enabled ? "default" : "outline"}>{fs.enabled ? "Encuesta activa" : "Borrador"}</Badge>
        </div>
        <p className="text-[11px] text-muted-foreground">Desayuno incluido siempre por alojamiento (no se cobra).</p>
      </div>

      {/* Fechas del evento vs estadías reales */}
      {status.has_campaign && status.event_date !== status.bounds?.start && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-[11px] space-y-1">
          <p className="font-medium flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" />Fechas del evento distintas a las estadías reprogramadas</p>
          <p>Evento: {status.event_date} → {status.event_end_date ?? "—"}. Estadías validadas: {status.bounds ? `${status.bounds.start} → ${status.bounds.end}` : "ninguna"}.</p>
          <p>La encuesta usa la estadía validada de cada reserva, no la fecha del evento. La fecha guardada del evento no se cambia desde aquí para no alterar historial, plazos ni cuotas.
            {status.pending_requests > 0 && ` Hay ${status.pending_requests} solicitud(es) de reprogramación sin validar: esas reservas no verán comidas.`}
            {status.sin_estadia > 0 && ` ${status.sin_estadia} reserva(s) activas sin estadía resuelta.`}</p>
        </div>
      )}

      <div className="space-y-1">
        <p className="text-xs font-medium">Estadías reales</p>
        {status.stays.length === 0 && <p className="text-[11px] text-muted-foreground">Sin estadías validadas.</p>}
        {status.stays.map((s) => (
          <p key={s.choice} className="text-[11px] text-muted-foreground">
            {formatMealDate(s.start)}–{formatMealDate(s.end)}: {s.reservas} reserva(s) · {s.con_pension} con pensión · {s.sin_pension} sin pensión
          </p>
        ))}
      </div>

      {/* Extras regulares */}
      <div className="space-y-1">
        <p className="text-xs font-medium">Extras regulares ({formatPrice(PRECIO_REGULAR, "ARS")} por servicio)</p>
        {(["almuerzo", "cena"] as const).map((t) => {
          const a = addonFor(t);
          return <p key={t} className="text-[11px]">{MEAL_TYPE_LABELS[t]}: {a ? `${a.nombre} · ${formatPrice(a.precio, a.currency)} · ${a.activo ? "activo" : "inactivo (borrador)"}` : <span className="text-amber-500">sin asociar</span>}</p>;
        })}
        {specials.length > 0 && <p className="text-[10px] text-muted-foreground">No se usan ni modifican: {specials.map((s) => `${s.nombre} (${formatPrice(s.precio, s.currency)})`).join(", ")}.</p>}
        {(!addonFor("almuerzo") || !addonFor("cena")) && (
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => setConfirm("addons")}>Crear/asociar Extras regulares</Button>
        )}
      </div>

      {/* Calendario */}
      {cal.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium">Calendario (tocá para cambiar: Sin decidir → Se ofrece → No se ofrece)</p>
          <div className="grid grid-cols-[auto_1fr_1fr] gap-1 text-[11px]">
            <span /><span className="font-medium">Almuerzo</span><span className="font-medium">Cena</span>
            {fechas.map((f) => (
              <div key={f} className="contents">
                <span className="pr-2 py-1">{formatMealDate(f)}</span>
                {(["almuerzo", "cena"] as const).map((t) => {
                  const slot = cal.find((c) => c.fecha === f && c.tipo === t);
                  if (!slot) return null;
                  return (
                    <Button key={t} size="sm" type="button" aria-label={`${MEAL_TYPE_LABELS[t]} ${formatMealDate(f)}: ${STATE_LABEL[slot.estado]}`}
                      variant={slot.estado === "activo" ? "default" : slot.estado === "inactivo" ? "secondary" : "outline"}
                      className="h-7 text-[11px]" disabled={!!busy}
                      onClick={() => setCal((p) => p.map((c) => c === slot ? { ...c, estado: NEXT[c.estado] } : c))}>
                      {STATE_LABEL[slot.estado]}
                    </Button>
                  );
                })}
              </div>
            ))}
          </div>
          {readiness.pendientes.length > 0 && <p className="text-[11px] text-amber-500">Faltan decidir {readiness.pendientes.length} servicio(s) con el organizador.</p>}
          {readiness.faltaExtra.length > 0 && <p className="text-[11px] text-amber-500">Falta Extra regular para: {readiness.faltaExtra.join(", ")}.</p>}
          <Button size="sm" disabled={!dirty || !!busy}
            onClick={() => run("save", () => (supabase.rpc as any)("admin_save_food_program", { p_event: eventId, p_calendar: cal }), "Borrador guardado")}>
            {busy === "save" ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Save className="w-3.5 h-3.5 mr-1" />}Guardar borrador
          </Button>
        </div>
      )}

      {/* Vista previa por estadía */}
      <div className="space-y-1">
        <p className="text-xs font-medium">Vista previa por tipo de paquete</p>
        <p className="text-[11px] text-muted-foreground">Con pensión completa: almuerzos y cenas cubiertos, sin Extras. Total ARS 0.</p>
        {status.stays.map((s) => {
          const m = activeMealsForStay(cal, { start: s.start, end: s.end });
          return <p key={s.choice} className="text-[11px] text-muted-foreground">Sin pensión, {formatMealDate(s.start)}–{formatMealDate(s.end)}: {m.length} servicio(s) · todas = {formatPrice(m.length * PRECIO_REGULAR, "ARS")}{m.length ? ` (${m.map((x) => `${MEAL_TYPE_LABELS[x.tipo][0]} ${formatMealDate(x.fecha)}`).join(", ")})` : ""}</p>;
        })}
        <a className="text-[11px] text-primary underline" href={`/pruebas/encuesta-gastronomica?evento=${eventId}`}>Abrir prueba privada (casos QA)</a>
      </div>

      <div className="flex gap-2 flex-wrap border-t border-border pt-3">
        {fs.enabled ? (
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => setConfirm("disable")}><Power className="w-3.5 h-3.5 mr-1" />Desactivar encuesta</Button>
        ) : (
          <Button size="sm" disabled={!!busy} onClick={() => setConfirm("enable")}><Power className="w-3.5 h-3.5 mr-1" />Activar preferencias alimentarias</Button>
        )}
        <Button size="sm" variant="outline" disabled={!readiness.ready || dirty || !!busy || !fs.enabled} onClick={() => setConfirm("meals")}>Habilitar oferta de comidas</Button>
        <p className="text-[11px] text-muted-foreground">{fs.meals_enabled ? "Oferta de comidas habilitada" : "Comidas pendientes: la encuesta recoge preferencias e interés sin compras. La oferta requiere calendario confirmado y Extras regulares autorizados."}</p>
      </div>

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm === "meals" ? "¿Habilitar oferta de comidas?" : confirm === "enable" ? "¿Activar la encuesta?" : confirm === "disable" ? "¿Desactivar la encuesta?" : "¿Crear Extras regulares?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "enable" && "Activa solamente preferencias alimentarias e interés. El calendario puede seguir pendiente. No activa Extras, compras, cobros ni envía mensajes."}
              {confirm === "meals" && "Se valida el calendario completo y se activan solamente los Extras regulares asociados. Las solicitudes no generan compras ni cobros automáticos."}
              {confirm === "disable" && "Se oculta la encuesta. Respuestas, Extras y compras existentes no se modifican."}
              {confirm === "addons" && `Se crean (o se reutilizan si ya existen) "Almuerzo regular" y "Cena regular" a ${formatPrice(PRECIO_REGULAR, "ARS")}, inactivos. Las cenas especiales no se tocan.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => {
              e.preventDefault();
              if (confirm === "addons") run("addons", () => (supabase.rpc as any)("admin_food_program_ensure_addons", { p_event: eventId, p_precio: PRECIO_REGULAR }), "Extras regulares asociados");
              else if (confirm === "meals") run("meals", () => (supabase.rpc as any)("admin_enable_food_meals", { p_event: eventId }), "Oferta de comidas habilitada");
              else run("toggle", () => (supabase.rpc as any)("admin_set_food_survey_enabled", { p_event: eventId, p_enabled: confirm === "enable" }), confirm === "enable" ? "Encuesta activada" : "Encuesta desactivada");
            }}>Confirmar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default EventFoodProgramEditor;
