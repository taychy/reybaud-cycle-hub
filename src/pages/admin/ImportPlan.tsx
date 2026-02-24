import { useState, useRef } from "react";
import ExcelJS from "exceljs";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Upload, AlertTriangle, CheckCircle2, FileSpreadsheet, Eye } from "lucide-react";
import { toast } from "sonner";
import { parseTrainingExcel, type ParsedTraining } from "@/lib/parseTrainingExcel";

const ImportPlan = () => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<ParsedTraining[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState(false);
  const [detectedMonth, setDetectedMonth] = useState("");

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const buffer = await file.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);

    const { trainings, errors: parseErrors, month } = parseTrainingExcel(workbook);

    setParsed(trainings);
    setErrors(parseErrors);
    setDetectedMonth(month);
    setImported(false);
  };

  const handleImport = async () => {
    if (!detectedMonth) return;
    setImporting(true);

    const { data: { session } } = await supabase.auth.getSession();

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
      const { data: existing } = await supabase
        .from("entrenamientos")
        .select("id")
        .eq("fecha", t.fecha)
        .eq("grupo", t.grupo as any)
        .maybeSingle();

      if (existing) {
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
        if (error) errCount++; else ok++;
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
        if (error) errCount++; else ok++;
      }
    }

    toast.success(`Importados: ${ok} entrenamientos. Errores: ${errCount}`);
    setImported(true);
    setImporting(false);
  };

  const publishPlan = async () => {
    if (!detectedMonth) return;

    const { data, error } = await supabase.rpc("publish_month", {
      p_mes: detectedMonth,
    });

    if (error) {
      console.error("Error publishing:", error);
      toast.error("Error al publicar: " + error.message);
      return;
    }

    toast.success(`Plan de ${detectedMonth} publicado — ${data} entrenamientos visibles`);
  };

  // Deduplicate for preview: show unique fecha rows, grouped
  const uniqueDates = [...new Set(parsed.map((t) => t.fecha))];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-heading font-bold uppercase tracking-wider text-foreground">
          Importar Plan Mensual
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Subí el archivo Excel con el plan semanal de entrenamientos
        </p>
      </div>

      <div
        className="glass-card rounded-lg p-8 border-2 border-dashed border-border hover:border-primary/50 transition-colors cursor-pointer text-center"
        onClick={() => fileRef.current?.click()}
      >
        <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFile} />
        <FileSpreadsheet className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
        <p className="text-sm text-foreground font-medium">Click para seleccionar archivo Excel</p>
        <p className="text-xs text-muted-foreground mt-1">Formato semanal: hojas con Día, Minutos, Trabajo, Dinámica, etc.</p>
      </div>

      {parsed.length > 0 && !imported && (
        <>
          {errors.length > 0 && (
            <div className="glass-card rounded-lg p-4 space-y-2">
              <div className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="w-4 h-4" />
                <span className="text-sm font-medium">{errors.length} advertencias</span>
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
                  {parsed.length} entrenamientos · {uniqueDates.length} días · Mes: {detectedMonth}
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
