import { useState, useRef } from "react";
import Papa from "papaparse";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Upload, AlertTriangle, CheckCircle2, FileText } from "lucide-react";
import { toast } from "sonner";

const GRUPOS = ["G1", "G2", "G3", "G4", "Sin grupo"] as const;

interface ParsedStudent {
  nombre: string;
  email: string;
  telefono: string;
  notas: string;
  grupo: string;
  valid: boolean;
  error?: string;
}

function detectName(row: Record<string, string>): string {
  if (row["Name"]) return row["Name"];
  const givenName = row["Given Name"] || row["First Name"] || "";
  const familyName = row["Family Name"] || row["Last Name"] || "";
  if (givenName || familyName) return `${givenName} ${familyName}`.trim();
  for (const key of Object.keys(row)) {
    if (key.toLowerCase().includes("name") && row[key]) return row[key];
  }
  return "";
}

function detectEmail(row: Record<string, string>): string {
  for (const key of Object.keys(row)) {
    if (key.toLowerCase().includes("mail") && row[key]?.includes("@")) {
      return row[key].trim().toLowerCase();
    }
  }
  return "";
}

function detectPhone(row: Record<string, string>): string {
  for (const key of Object.keys(row)) {
    if (key.toLowerCase().includes("phone") && row[key]) return row[key];
  }
  return "";
}

function detectGroup(row: Record<string, string>): string {
  for (const key of Object.keys(row)) {
    if (key.toLowerCase().includes("group") || key.toLowerCase().includes("label") || key.toLowerCase().includes("member")) {
      const val = (row[key] || "").toUpperCase();
      if (val.includes("G1")) return "G1";
      if (val.includes("G2")) return "G2";
      if (val.includes("G3")) return "G3";
      if (val.includes("G4")) return "G4";
    }
  }
  return "";
}

export const ImportStudentsContent = () => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<ParsedStudent[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [defaultGrupo, setDefaultGrupo] = useState<string>("Sin grupo");
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const students: ParsedStudent[] = [];
        const errs: string[] = [];

        (results.data as Record<string, string>[]).forEach((row, i) => {
          const nombre = detectName(row);
          const email = detectEmail(row);
          const telefono = detectPhone(row);
          const grupo = detectGroup(row) || defaultGrupo;

          if (!email) {
            errs.push(`Fila ${i + 2}: Sin email válido (${nombre || "sin nombre"})`);
            return;
          }

          if (!nombre) {
            errs.push(`Fila ${i + 2}: Sin nombre (${email})`);
            return;
          }

          students.push({ nombre, email, telefono, notas: "", grupo, valid: true });
        });

        setParsed(students);
        setErrors(errs);
        setImported(false);
      },
    });
  };

  const updateGrupo = (index: number, grupo: string) => {
    setParsed((prev) => prev.map((s, i) => (i === index ? { ...s, grupo } : s)));
  };

  const applyDefaultGrupo = () => {
    setParsed((prev) => prev.map((s) => ({ ...s, grupo: defaultGrupo })));
  };

  const handleImport = async () => {
    setImporting(true);
    let ok = 0;
    let errCount = 0;
    const importErrors: string[] = [];
    setProgress({ current: 0, total: parsed.length });

    for (const student of parsed) {
      setProgress((prev) => ({ ...prev, current: prev.current + 1 }));

      try {
        const { data, error } = await supabase.functions.invoke("invite-user", {
          body: {
            type: "alumno",
            nombre: student.nombre,
            email: student.email,
            telefono: student.telefono || null,
            grupos: [student.grupo],
          },
        });

        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        ok++;
      } catch (err: any) {
        errCount++;
        importErrors.push(`${student.email}: ${err.message || "Error desconocido"}`);
      }
    }

    // Log the import
    const { data: { session } } = await supabase.auth.getSession();
    await supabase.from("importaciones_usuarios").insert({
      cargado_por: session?.user?.id,
      cantidad_ok: ok,
      cantidad_error: errCount,
      log_errores: importErrors.length > 0 ? importErrors.join("\n") : null,
    });

    toast.success(`Importación completada: ${ok} exitosos, ${errCount} errores`);
    setImported(true);
    setImporting(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-heading font-bold uppercase tracking-wider text-foreground">
          Importar Alumnos
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Subí un CSV exportado desde Google Contacts. Cada alumno recibirá un email de invitación.
        </p>
      </div>

      {/* Upload area */}
      <div
        className="glass-card rounded-lg p-8 border-2 border-dashed border-border hover:border-primary/50 transition-colors cursor-pointer text-center"
        onClick={() => fileRef.current?.click()}
      >
        <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile} />
        <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
        <p className="text-sm text-foreground font-medium">Click para seleccionar archivo CSV</p>
        <p className="text-xs text-muted-foreground mt-1">Formato Google Contacts</p>
      </div>

      {/* Options */}
      {parsed.length > 0 && !imported && (
        <>
          <div className="glass-card rounded-lg p-4 flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-foreground">Grupo por defecto:</span>
              <Select value={defaultGrupo} onValueChange={setDefaultGrupo}>
                <SelectTrigger className="w-28 bg-secondary border-border text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GRUPOS.map((g) => (
                    <SelectItem key={g} value={g}>{g}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="secondary" size="sm" onClick={applyDefaultGrupo}>
                Aplicar a todos
              </Button>
            </div>
          </div>

          {/* Errors */}
          {errors.length > 0 && (
            <div className="glass-card rounded-lg p-4 space-y-2">
              <div className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="w-4 h-4" />
                <span className="text-sm font-medium">{errors.length} contactos descartados</span>
              </div>
              <div className="max-h-32 overflow-y-auto text-xs text-muted-foreground space-y-1">
                {errors.map((e, i) => (
                  <p key={i}>{e}</p>
                ))}
              </div>
            </div>
          )}

          {/* Preview table */}
          <div className="glass-card rounded-lg overflow-hidden">
            <div className="p-3 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium text-foreground">
                  {parsed.length} contactos a importar
                  {importing && ` (${progress.current}/${progress.total})`}
                </span>
              </div>
              <Button variant="gold" size="sm" onClick={handleImport} disabled={importing}>
                {importing ? `Importando ${progress.current}/${progress.total}...` : "Confirmar importación"}
              </Button>
            </div>
            <div className="max-h-96 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="text-muted-foreground">Nombre</TableHead>
                    <TableHead className="text-muted-foreground">Email</TableHead>
                    <TableHead className="text-muted-foreground">Teléfono</TableHead>
                    <TableHead className="text-muted-foreground">Grupo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsed.map((s, i) => (
                    <TableRow key={i} className="border-border">
                      <TableCell className="text-foreground">{s.nombre}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">{s.email}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">{s.telefono || "-"}</TableCell>
                      <TableCell>
                        <Select value={s.grupo} onValueChange={(v) => updateGrupo(i, v)}>
                          <SelectTrigger className="w-24 h-7 bg-secondary border-border text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {GRUPOS.map((g) => (
                              <SelectItem key={g} value={g}>{g}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </>
      )}

      {imported && (
        <div className="glass-card rounded-lg p-6 text-center space-y-2">
          <CheckCircle2 className="w-8 h-8 text-primary mx-auto" />
          <p className="text-foreground font-medium">Importación completada</p>
          <p className="text-sm text-muted-foreground">Cada alumno recibirá un email para crear su contraseña.</p>
          <Button variant="secondary" size="sm" onClick={() => { setParsed([]); setErrors([]); setImported(false); }}>
            Importar otro archivo
          </Button>
        </div>
      )}
    </div>
  );
};

export default ImportStudents;
