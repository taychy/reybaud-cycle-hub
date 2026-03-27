import { CheckCircle2, XCircle, Plus } from "lucide-react";

export interface SessionRecord {
  id: string;
  estado: string;
  fecha: string;
  titulo: string;
  tipo: string | null;
  source: "registro" | "asistencia" | "extra";
}

export function SessionHistory({ sessions }: { sessions: SessionRecord[] }) {
  return (
    <div className="rounded-xl border border-border bg-card/80 backdrop-blur-sm p-5 space-y-4 shadow-lg shadow-black/20">
      <h2 className="text-sm font-heading font-semibold uppercase tracking-wider text-muted-foreground">
        Historial de sesiones
      </h2>
      {sessions.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">Todavía no registraste sesiones</p>
      ) : (
        <div className="space-y-2">
          {sessions.slice(0, 15).map((s) => (
            <div key={s.id} className="flex items-center gap-3 py-2 border-b border-border/50 last:border-0">
              {s.estado === "realizada"
                ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                : <XCircle className="w-4 h-4 text-destructive shrink-0" />
              }
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground truncate">{s.titulo}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(s.fecha + "T12:00:00").toLocaleDateString("es-AR", { day: "numeric", month: "short" })}
                  {s.tipo ? ` · ${s.tipo}` : ""}
                  {s.source === "asistencia" ? " · Presencial" : " · Plan"}
                </p>
              </div>
              <span className={`text-xs font-medium ${s.estado === "realizada" ? "text-emerald-500" : "text-destructive"}`}>
                {s.estado === "realizada" ? "Realizada" : "No realizada"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
