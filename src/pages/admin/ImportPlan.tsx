import { useState, useRef } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Upload, AlertTriangle, CheckCircle2, FileSpreadsheet, Eye } from "lucide-react";
import { toast } from "sonner";

interface ParsedTraining {
  fecha: string;
  grupo: string;
  titulo: string;
  descripcion: string;
  tipo: string;
  link_archivo: string;
  valid: boolean;
  error?: string;
}

const VALID_GRUPOS = ["G1", "G2", "G3", "G4"];
const VALID_TIPOS = ["ruta", "rodillo", "gimnasio", "tecnica"];

const ImportPlan = () => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<ParsedTraining[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState(false);
  const [detectedMonth, setDetectedMonth] = useState<string>("");

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const data = evt.target?.result;
      const workbook = XLSX.read(data, { type: "binary" });

      // Try "Plan" sheet first, then first sheet
      const sheetName = workbook.SheetNames.includes("Plan") ? "Plan" : workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet);

      const trainings: ParsedTraining[] = [];
      const errs: string[] = [];

      rows.forEach((row, i) => {
        let fecha = "";
        const rawFecha = row["fecha"] || row["Fecha"] || row["date"];

        if (rawFecha) {
          if (typeof rawFecha === "number") {
            // Excel serial date
            const d = XLSX.SSF.parse_date_code(rawFecha);
            fecha = `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
          } else {
            fecha = String(rawFecha).trim();
          }
        }

        const grupo = String(row["grupo"] || row["Grupo"] || row["group"] || "").toUpperCase().trim();
        const titulo = String(row["titulo"] || row["Titulo"] || row["title"] || "").trim();
        const descripcion = String(row["descripcion"] || row["Descripcion"] || row["description"] || "").trim();
        const tipo = String(row["tipo"] || row["Tipo"] || row["type"] || "").toLowerCase().trim();
        const link = String(row["link_archivo"] || row["Link"] || row["link"] || "").trim();

        if (!fecha) {
          errs.push(`Fila ${i + 2}: Sin fecha`);
          return;
        }

        if (!VALID_GRUPOS.includes(grupo)) {
          errs.push(`Fila ${i + 2}: Grupo inválido "${grupo}"`);
          return;
        }

        if (!titulo) {
          errs.push(`Fila ${i + 2}: Sin título`);
          return;
        }

        trainings.push({
          fecha,
          grupo,
          titulo,
          descripcion,
          tipo: VALID_TIPOS.includes(tipo) ? tipo : "",
          link_archivo: link === "undefined" ? "" : link,
          valid: true,
        });
      });

      // Detect month from first training
      if (trainings.length > 0) {
        setDetectedMonth(trainings[0].fecha.substring(0, 7));
      }

      setParsed(trainings);
      setErrors(errs);
      setImported(false);
    };

    reader.readAsBinaryString(file);
  };

  const handleImport = async () => {
    if (!detectedMonth) return;
    setImporting(true);

    const { data: { session } } = await supabase.auth.getSession();

    // Create plan mensual
    const { data: plan, error: planError } = await supabase
      .from("plan_mensual")
      .insert({
        mes: detectedMonth,
        estado: "borrador" as const,
        cargado_por: session?.user?.id,
      })
      .select()
      .single();

    if (planError || !plan) {
      toast.error("Error creando el plan mensual");
      setImporting(false);
      return;
    }

    let ok = 0;
    let errCount = 0;

    for (const t of parsed) {
      // Check for duplicates
      const { data: existing } = await supabase
        .from("entrenamientos")
        .select("id")
        .eq("fecha", t.fecha)
        .eq("grupo", t.grupo as any)
        .maybeSingle();

      if (existing) {
        // Replace existing
        const { error } = await supabase
          .from("entrenamientos")
          .update({
            titulo: t.titulo,
            descripcion: t.descripcion || null,
            tipo: (t.tipo || null) as any,
            link_archivo: t.link_archivo || null,
            origen_importacion_id: plan.id,
          })
          .eq("id", existing.id);

        if (error) errCount++;
        else ok++;
      } else {
        const { error } = await supabase.from("entrenamientos").insert({
          fecha: t.fecha,
          grupo: t.grupo as any,
          titulo: t.titulo,
          descripcion: t.descripcion || null,
          tipo: (t.tipo || null) as any,
          link_archivo: t.link_archivo || null,
          origen_importacion_id: plan.id,
          visible: false,
        });

        if (error) errCount++;
        else ok++;
      }
    }

    toast.success(`Importados: ${ok} entrenamientos. Errores: ${errCount}`);
    setImported(true);
    setImporting(false);
  };

  const publishPlan = async () => {
    if (!detectedMonth) return;

    // Set all trainings for this month as visible
    const startDate = `${detectedMonth}-01`;
    const endDate = `${detectedMonth}-31`;

    await supabase
      .from("entrenamientos")
      .update({ visible: true })
      .gte("fecha", startDate)
      .lte("fecha", endDate);

    // Update plan status
    await supabase
      .from("plan_mensual")
      .update({ estado: "publicado" as const })
      .eq("mes", detectedMonth);

    toast.success(`Plan de ${detectedMonth} publicado`);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-heading font-bold uppercase tracking-wider text-foreground">
          Importar Plan Mensual
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Subí un archivo Excel con el plan de entrenamientos
        </p>
      </div>

      <div
        className="glass-card rounded-lg p-8 border-2 border-dashed border-border hover:border-primary/50 transition-colors cursor-pointer text-center"
        onClick={() => fileRef.current?.click()}
      >
        <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFile} />
        <FileSpreadsheet className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
        <p className="text-sm text-foreground font-medium">Click para seleccionar archivo Excel</p>
        <p className="text-xs text-muted-foreground mt-1">Columnas: fecha, grupo, titulo, descripcion, tipo, link_archivo</p>
      </div>

      {parsed.length > 0 && !imported && (
        <>
          {errors.length > 0 && (
            <div className="glass-card rounded-lg p-4 space-y-2">
              <div className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="w-4 h-4" />
                <span className="text-sm font-medium">{errors.length} filas con errores</span>
              </div>
              <div className="max-h-32 overflow-y-auto text-xs text-muted-foreground space-y-1">
                {errors.map((e, i) => <p key={i}>{e}</p>)}
              </div>
            </div>
          )}

          <div className="glass-card rounded-lg overflow-hidden">
            <div className="p-3 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium text-foreground">
                  {parsed.length} entrenamientos · Mes: {detectedMonth}
                </span>
              </div>
              <Button variant="gold" size="sm" onClick={handleImport} disabled={importing}>
                {importing ? "Importando..." : "Confirmar importación"}
              </Button>
            </div>
            <div className="max-h-96 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="text-muted-foreground">Fecha</TableHead>
                    <TableHead className="text-muted-foreground">Grupo</TableHead>
                    <TableHead className="text-muted-foreground">Título</TableHead>
                    <TableHead className="text-muted-foreground">Tipo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsed.map((t, i) => (
                    <TableRow key={i} className="border-border">
                      <TableCell className="text-foreground text-xs font-mono">{t.fecha}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs font-mono">{t.grupo}</Badge>
                      </TableCell>
                      <TableCell className="text-foreground text-sm">{t.titulo}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">{t.tipo || "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </>
      )}

      {imported && (
        <div className="glass-card rounded-lg p-6 text-center space-y-4">
          <CheckCircle2 className="w-8 h-8 text-primary mx-auto" />
          <p className="text-foreground font-medium">Importación completada</p>
          <div className="flex justify-center gap-3">
            <Button variant="gold" size="sm" onClick={publishPlan}>
              <Eye className="w-4 h-4 mr-1" /> Publicar mes
            </Button>
            <Button variant="secondary" size="sm" onClick={() => { setParsed([]); setErrors([]); setImported(false); }}>
              Importar otro
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ImportPlan;
