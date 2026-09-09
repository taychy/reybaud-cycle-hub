import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Check, X } from "lucide-react";

export interface AlumnoLite {
  id: string;
  nombre: string;
  apellido: string | null;
  email: string | null;
}

export const alumnoFullName = (a: AlumnoLite | null | undefined): string =>
  a ? `${a.nombre || ""} ${a.apellido || ""}`.trim() : "";

interface Props {
  value: AlumnoLite | null;
  onChange: (a: AlumnoLite | null) => void;
  initialQuery?: string;
  placeholder?: string;
  allowClear?: boolean;
}

/** Buscador simple de alumnos por nombre, apellido o email. */
const AlumnoPicker = ({ value, onChange, initialQuery = "", placeholder = "Buscar por nombre, apellido o email...", allowClear = true }: Props) => {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<AlumnoLite[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (value) { setResults([]); return; }
    const q = query.trim();
    if (q.length < 2) { setResults([]); return; }
    const timer = setTimeout(async () => {
      setSearching(true);
      const parts = q.split(/\s+/).filter(Boolean);
      const or = parts.length === 1
        ? `nombre.ilike.%${q}%,apellido.ilike.%${q}%,email.ilike.%${q}%`
        : `and(nombre.ilike.%${parts[0]}%,apellido.ilike.%${parts.slice(1).join(" ")}%),and(apellido.ilike.%${parts[0]}%,nombre.ilike.%${parts.slice(1).join(" ")}%),nombre.ilike.%${q}%,apellido.ilike.%${q}%,email.ilike.%${q}%`;
      const { data } = await supabase
        .from("alumnos")
        .select("id, nombre, apellido, email")
        .or(or)
        .limit(15);
      setResults(((data as any) || []) as AlumnoLite[]);
      setSearching(false);
    }, 250);
    return () => clearTimeout(timer);
  }, [query, value]);

  if (value) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-primary/40 bg-primary/5 px-2 py-1.5 text-sm">
        <Check className="w-3.5 h-3.5 text-primary shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="font-medium truncate">{alumnoFullName(value)}</div>
          <div className="text-[11px] text-muted-foreground truncate">{value.email || "sin email"}</div>
        </div>
        {allowClear && (
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => onChange(null)} title="Quitar selección">
            <X className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={placeholder} />
      <div className="max-h-56 overflow-y-auto space-y-1">
        {searching && <p className="text-xs text-muted-foreground text-center py-2">Buscando...</p>}
        {!searching && query.trim().length >= 2 && results.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-2">Sin resultados.</p>
        )}
        {results.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => onChange(a)}
            className="w-full text-left p-2 rounded hover:bg-secondary/50 border border-transparent hover:border-border transition"
          >
            <div className="text-sm font-medium">{alumnoFullName(a)}</div>
            <div className="text-xs text-muted-foreground">{a.email || "sin email"}</div>
          </button>
        ))}
      </div>
    </div>
  );
};

export default AlumnoPicker;
