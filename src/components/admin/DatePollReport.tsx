import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import type { DatePollOption } from "@/lib/datePoll";

type Inv = { recipient_name: string | null; recipient_email: string; choice: string | null; suggestion: string | null; responded_at: string | null; last_sent_at: string | null };
type Poll = { id: string; title: string; options: DatePollOption[] };

/** Reporte de encuestas de fecha del evento (sólo invitaciones reales, sin pruebas). */
export default function DatePollReport({ eventId }: { eventId: string }) {
  const [polls, setPolls] = useState<(Poll & { invites: Inv[] })[]>([]);
  useEffect(() => {
    (async () => {
      const db = supabase as any;
      const { data: ps } = await db.from("date_polls").select("id,title,options").eq("event_id", eventId);
      const out = [];
      for (const p of ps || []) {
        const { data } = await db.from("date_poll_invites").select("recipient_name,recipient_email,choice,suggestion,responded_at,last_sent_at")
          .eq("poll_id", p.id).eq("is_test", false).order("recipient_name");
        out.push({ ...p, invites: data || [] });
      }
      setPolls(out);
    })();
  }, [eventId]);
  if (!polls.length) return null;
  return (
    <>{polls.map((p) => {
      const voted = p.invites.filter((i) => i.choice);
      return (
        <Card key={p.id}><CardContent className="p-4 space-y-3">
          <h3 className="font-display text-lg">Encuesta de fechas · {p.title}</h3>
          <p className="text-sm text-muted-foreground">Invitados: {p.invites.length} · Respondieron: {voted.length}</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {p.options.map((o) => <div key={o.value} className="rounded-md border p-3"><p className="text-sm">{o.label}</p><p className="text-2xl font-bold">{voted.filter((i) => i.choice === o.value).length}</p></div>)}
          </div>
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead><tr className="text-left text-muted-foreground"><th>Persona</th><th>Opción</th><th>Sugerencia</th><th>Fecha</th></tr></thead>
            <tbody>{p.invites.map((i) => (
              <tr key={i.recipient_email} className="border-t"><td className="py-1">{i.recipient_name || i.recipient_email}</td>
                <td>{p.options.find((o) => o.value === i.choice)?.label || "Sin respuesta"}</td><td>{i.suggestion || ""}</td>
                <td>{i.responded_at ? new Date(i.responded_at).toLocaleString("es-AR") : ""}</td></tr>
            ))}</tbody>
          </table></div>
        </CardContent></Card>
      );
    })}</>
  );
}
