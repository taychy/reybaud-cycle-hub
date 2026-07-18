import { MessageSquare } from "lucide-react";

export interface FeedbackRecord {
  id: string;
  fecha: string;
  comentario: string;
  tipo: string;
  coach: { nombre: string } | null;
}

const tipoLabel = (tipo: string) => {
  switch (tipo) {
    case "tecnica": return "Técnica";
    case "rendimiento": return "Rendimiento";
    case "actitud": return "Actitud";
    case "recomendacion": return "Recomendación";
    default: return "General";
  }
};

export function CoachFeedbackCard({ feedback }: { feedback: FeedbackRecord[] }) {
  return (
    <div className="rounded-xl border border-border bg-card/80 backdrop-blur-sm p-5 space-y-4 shadow-lg shadow-black/20">
      <h2 className="text-sm font-heading font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
        <MessageSquare className="w-4 h-4" /> Feedback del entrenador
      </h2>
      {feedback.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">Todavía no tenés feedback de tu entrenador</p>
      ) : (
        <div className="space-y-4">
          {feedback.map((f) => {
            const [generalRaw, detalleRaw = ""] = (f.comentario || "").split("---DETALLE---");
            const detalleItems = detalleRaw
              .split("\n")
              .map(l => l.trim())
              .filter(l => l.startsWith("•"))
              .map(l => l.replace(/^•\s*/, ""));
            return (
              <div key={f.id} className="border-l-2 border-primary/50 pl-4 space-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-foreground">{f.coach?.nombre || "Entrenador"}</p>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">{tipoLabel(f.tipo)}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {new Date(f.fecha + "T12:00:00").toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" })}
                </p>
                <p className="text-sm text-foreground/90 italic">"{generalRaw.trim()}"</p>
                {detalleItems.length > 0 && (
                  <div className="mt-2 rounded-md border border-border/60 bg-secondary/30 p-3 space-y-1.5">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                      Detalle por característica
                    </p>
                    <ul className="space-y-1">
                      {detalleItems.map((item, i) => {
                        const [head, ...rest] = item.split(":");
                        const body = rest.join(":").trim();
                        return (
                          <li key={i} className="text-[13px] text-foreground/90 leading-snug">
                            <span className="font-medium text-foreground">{head}:</span>{" "}
                            <span className="text-foreground/80">{body}</span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
