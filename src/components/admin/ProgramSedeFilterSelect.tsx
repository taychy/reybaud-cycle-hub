import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SEDE_ALL, SEDE_NONE, type SedeOpt } from "@/lib/programSedeFilter";

interface Props {
  sedes: SedeOpt[];
  value: string;
  onChange: (v: string) => void;
}

export default function ProgramSedeFilterSelect({ sedes, value, onChange }: Props) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-10 w-full sm:w-52" aria-label="Filtrar por sede">
        <SelectValue placeholder="Todas las sedes" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={SEDE_ALL}>Todas las sedes</SelectItem>
        {sedes.map((s) => (
          <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>
        ))}
        <SelectItem value={SEDE_NONE}>Sin sede asignada</SelectItem>
      </SelectContent>
    </Select>
  );
}
