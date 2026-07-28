import { useMemo, useState } from "react";

const toISO = (d: Date) => d.toISOString().split("T")[0];

const addDays = (iso: string, delta: number) => {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d + delta);
  return toISO(dt);
};

export const DAY_LABELS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const MONTH_LABELS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

export const formatDayLabel = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return `${DAY_LABELS[dt.getDay()]} ${d} de ${MONTH_LABELS[m - 1]}`;
};

interface Options {
  /** How many days back from today the user can navigate. */
  maxDaysBack?: number;
}

/**
 * Manages a single "selected day" (YYYY-MM-DD) with prev/next navigation.
 * Cannot go into the future; capped at `maxDaysBack` days into the past.
 */
export function useDayCursor({ maxDaysBack = 60 }: Options = {}) {
  const todayISO = useMemo(() => toISO(new Date()), []);
  const minISO = useMemo(() => addDays(todayISO, -maxDaysBack), [todayISO, maxDaysBack]);
  const [selected, setSelected] = useState(todayISO);

  const canGoNext = selected < todayISO;
  const canGoPrev = selected > minISO;

  const goNext = () => canGoNext && setSelected((d) => addDays(d, 1));
  const goPrev = () => canGoPrev && setSelected((d) => addDays(d, -1));
  const goToday = () => setSelected(todayISO);
  const goTo = (iso: string) => {
    if (iso >= minISO && iso <= todayISO) setSelected(iso);
  };

  return {
    selected,
    isToday: selected === todayISO,
    todayISO,
    minISO,
    canGoNext,
    canGoPrev,
    goNext,
    goPrev,
    goToday,
    goTo,
    label: formatDayLabel(selected),
  };
}
