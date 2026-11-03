import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, AlertCircle } from "lucide-react";
import { formatPrice } from "@/lib/currency";
import { BLOCKED_LABELS, MOTIVO_LABELS, formatMealDay, slotKey, type ExtraMealInfo, type ExtraMealSlot } from "@/lib/extraMealSurvey";

interface ReportRow { reservation_id: string; nombre: string | null; apellido: string | null; info: ExtraMealInfo; answer: any; updated_at: string | null }

const csv = (rows: string[][]) => rows.map((r) => r.map((v) => /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v).join(",")).join("\n");

export default function EventExtraMealSurveyReport({ eventId }: { eventId: string }) {
  const [rows, setRows] = useState<ReportRow[] | null>(null);
  useEffect(() => {
    (supabase as any).rpc("admin_extra_meal_survey_report", { p_event_id: eventId })
      .then(({ data, error }: any) => setRows(error ? null : (data ?? [])));
  }, [eventId]);

  const enabled = rows?.some((r) => r.info?.blocked !== "no_habilitada");
  const price = Number(rows?.find((r) => r.info?.price)?.info.price ?? 0);
  const totals = useMemo(() => {
    const m = new Map<string, number>();
    (rows ?? []).forEach((r) => (r.answer?.requested ?? []).forEach((q: any) => m.set(slotKey(q), (m.get(slotKey(q)) ?? 0) + 1)));
    return [...m.entries()].sort(([a], [b]) => a.split("|")[1].localeCompare(b.split("|")[1]) || a.localeCompare(b));
  }, [rows]);
  if (!rows || !enabled) return null;

  const answered = rows.filter((r) => r.answer).length;
  const requestedOf = (r: ReportRow) => new Set((r.answer?.requested ?? []).map(slotKey));
  const contracted = (r: ReportRow) => (r.info.slots ?? []).filter((s: ExtraMealSlot) => s.status === "contratada" || s.status === "incluida");
  const alerts = (r: ReportRow) => [
    ...(r.info.blocked ? [BLOCKED_LABELS[r.info.blocked] ?? r.info.blocked] : []),
    ...((r.info.warnings ?? []).map((w) => `Compra de ${w.tipo} sin fecha inequívoca: conciliar antes de cobrar`)),
  ];

  const exportCsv = () => {
    const out = [["Participante", "Paquete", "Estado", "Solicitadas", "Ya contratadas/incluidas", "Total referencia", "Alertas", "Actualizada"]];
    rows.forEach((r) => out.push([
      `${r.nombre ?? ""} ${r.apellido ?? ""}`.trim(), r.info.package ?? "", r.answer ? "Respondida" : "Pendiente",
      (r.answer?.requested ?? []).map((q: any) => `${q.tipo} ${q.fecha}`).join("; "),
      contracted(r).map((s) => `${s.tipo} ${s.fecha} (${s.status})`).join("; "),
      String((r.answer?.requested?.length ?? 0) * price), alerts(r).join(" | "), r.updated_at ?? "",
    ]));
    out.push([], ["Totales para cocina"], ...totals.map(([k, n]) => [k.replace("|", " "), String(n)]));
    const blob = new Blob(["\uFEFF" + csv(out)], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "comidas-adicionales.csv"; a.click();
  };

  return (
    <div className="rounded-lg border border-border p-3 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <p className="text-sm font-semibold">Comidas adicionales (solicitudes, no compras)</p>
          <p className="text-xs text-muted-foreground">{answered} respondida(s) · {rows.length - answered} pendiente(s)</p>
        </div>
        <Button size="sm" variant="outline" onClick={exportCsv}><Download className="w-3.5 h-3.5 mr-1.5" /> CSV</Button>
      </div>
      {totals.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {totals.map(([k, n]) => { const [t, f] = k.split("|"); return <Badge key={k} variant="outline" className="text-[10px] capitalize">{t} {formatMealDay(f)}: {n}</Badge>; })}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead><tr className="border-b border-border">
            <th className="text-left py-1.5 px-2">Participante</th><th className="text-left py-1.5 px-2">Estado</th>
            <th className="text-left py-1.5 px-2">Solicitado</th><th className="text-left py-1.5 px-2">Contratado / incluido</th>
          </tr></thead>
          <tbody>
            {rows.map((r) => {
              const req = requestedOf(r); const al = alerts(r);
              return (
                <tr key={r.reservation_id} className="border-b border-border/50 align-top">
                  <td className="py-1.5 px-2 font-medium">{r.nombre} {r.apellido}<div className="text-[10px] text-muted-foreground">{r.info.package}</div></td>
                  <td className="py-1.5 px-2"><Badge variant={r.answer ? "default" : "outline"} className="text-[10px]">{r.answer ? "Respondida" : "Pendiente"}</Badge></td>
                  <td className="py-1.5 px-2">
                    {(r.info.slots ?? []).filter((s) => req.has(slotKey(s))).map((s) => (
                      <div key={slotKey(s)} className="capitalize">{s.tipo} {formatMealDay(s.fecha)} <span className="text-muted-foreground normal-case">· {MOTIVO_LABELS[s.motivo]}</span></div>
                    ))}
                    {r.answer && req.size === 0 && <span className="text-muted-foreground">Ninguna</span>}
                    {req.size > 0 && price > 0 && <div className="text-[10px] text-muted-foreground">Ref. {formatPrice(req.size * price, "ARS" as any)}</div>}
                  </td>
                  <td className="py-1.5 px-2">
                    {contracted(r).map((s) => <div key={slotKey(s)} className="capitalize">{s.tipo} {formatMealDay(s.fecha)} · {s.status === "contratada" ? "ya contratada" : "incluida"}</div>)}
                    {al.map((a) => <div key={a} className="text-[10px] text-amber-500 flex gap-1"><AlertCircle className="w-3 h-3 shrink-0" />{a}</div>)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
