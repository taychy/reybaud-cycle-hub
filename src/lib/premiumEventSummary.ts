import { DATES_TBD_LABEL, isEventDateTbd } from "./eventDates";

interface EventDates { date: string; end_date: string | null; duration_days: number | null; metadata?: unknown }

const parseDay = (value: string) => {
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null;
};

/** Never infer an end date from duration or publish conflicting stored dates. */
export function premiumDateSummary(event: EventDates) {
  const start = parseDay(event.date);
  const end = event.end_date ? parseDay(event.end_date) : null;
  const span = start && end ? Math.round((end.getTime() - start.getTime()) / 86400000) + 1 : null;
  const conflict = !start || (!!event.end_date && (!end || (span ?? 0) < 1)) || (span !== null && !!event.duration_days && span !== event.duration_days);
  if (conflict || isEventDateTbd(event.metadata)) return { label: DATES_TBD_LABEL, conflict };
  const fmt = (d: Date) => d.toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  return { label: start ? (end && span !== 1 ? `${fmt(start)} — ${fmt(end)}` : fmt(start)) : DATES_TBD_LABEL, conflict };
}