export type AgeBucket = "current" | "mid" | "overdue";

export const AGE_BUCKETS: { id: AgeBucket; label: string; hint: string; tone: "current" | "mid" | "overdue" }[] = [
  { id: "current", label: "Período actual", hint: "últimos 7 días", tone: "current" },
  { id: "mid", label: "8-30 días", hint: "", tone: "mid" },
  { id: "overdue", label: "Atrasados", hint: "más de 30 días sin facturar", tone: "overdue" },
];

const DAY_MS = 24 * 60 * 60 * 1000;

export function bucketByAge(dateStr: string | null | undefined): AgeBucket {
  if (!dateStr) return "overdue";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "overdue";
  const diffDays = (Date.now() - d.getTime()) / DAY_MS;
  if (diffDays <= 7) return "current";
  if (diffDays <= 30) return "mid";
  return "overdue";
}

export function groupByAge<T>(items: T[], getDate: (item: T) => string | null | undefined): Record<AgeBucket, T[]> {
  const groups: Record<AgeBucket, T[]> = { current: [], mid: [], overdue: [] };
  for (const item of items) {
    groups[bucketByAge(getDate(item))].push(item);
  }
  return groups;
}
