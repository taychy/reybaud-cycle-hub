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
          {feedback.map((f) => (
            <div key={f.id} className="border-l-2 border-primary/50 pl-4 space-y-1">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-foreground">{f.coach?.nombre || "Entrenador"}</p>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">{tipoLabel(f.tipo)}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {new Date(f.fecha + "T12:00:00").toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" })}
              </p>
              <p className="text-sm text-foreground/90 italic">"{f.comentario}"</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
