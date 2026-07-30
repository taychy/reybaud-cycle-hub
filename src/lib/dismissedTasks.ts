/**
 * Ocultamiento manual de tareas del resumen admin.
 *
 * Una tarea puede estar "gestionada" aunque el dato siga abierto (ej: ya se
 * enviaron las cobranzas pero los alumnos todavía no pagaron). En ese caso el
 * admin la marca como hecha y desaparece hasta que:
 *   · vence el plazo elegido (hoy / 3 días / 7 días), o
 *   · cambia la cantidad de items (aparecieron casos nuevos).
 */

const KEY = "admin_dismissed_tasks_v1";

export interface DismissedEntry {
  until: string; // ISO datetime
  count: number; // cantidad al momento de ocultar
}

type Store = Record<string, DismissedEntry>;

export function taskKey(date: string | null, label: string): string {
  return `${date || "sin_fecha"}|${label}`;
}

function read(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Store) : {};
  } catch {
    return {};
  }
}

function write(s: Store) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* noop */
  }
}

/** Limpia entradas vencidas y devuelve el store vigente. */
export function getDismissed(): Store {
  const s = read();
  const now = Date.now();
  let changed = false;
  Object.entries(s).forEach(([k, v]) => {
    if (new Date(v.until).getTime() <= now) {
      delete s[k];
      changed = true;
    }
  });
  if (changed) write(s);
  return s;
}

/** true si la tarea está oculta (y la cantidad no creció desde entonces). */
export function isDismissed(key: string, count: number, store = getDismissed()): boolean {
  const e = store[key];
  if (!e) return false;
  return count <= e.count;
}

/** days = 0 → hasta el final del día de hoy. */
export function dismissTask(key: string, count: number, days: number) {
  const s = read();
  const until = new Date();
  if (days <= 0) until.setHours(23, 59, 59, 999);
  else until.setTime(until.getTime() + days * 86400000);
  s[key] = { until: until.toISOString(), count };
  write(s);
}

export function restoreTask(key: string) {
  const s = read();
  delete s[key];
  write(s);
}

export function restoreAll() {
  write({});
}
