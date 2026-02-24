import ExcelJS from "exceljs";

export interface ParsedTraining {
  fecha: string;
  grupo: string;
  titulo: string;
  descripcion: string;
  tipo: string;
  link_archivo: string;
}

const DAY_OFFSETS: Record<string, number> = {
  LUNES: 0,
  MARTES: 1,
  MIERCOLES: 2,
  MIÉRCOLES: 2,
  JUEVES: 3,
  VIERNES: 4,
  SABADO: 5,
  SÁBADO: 5,
  DOMINGO: 6,
};

function parseMondayDate(headerText: string): Date | null {
  // Extract start date from "SEMANA 1 (02-02-2026 al 08-02-2026)"
  const match = headerText.match(/(\d{2})-(\d{2})-(\d{4})/);
  if (!match) return null;
  return new Date(parseInt(match[3]), parseInt(match[2]) - 1, parseInt(match[1]));
}

function getDayName(text: string): string | null {
  const upper = text.toUpperCase().replace(/\n.*/s, "").trim();
  for (const day of Object.keys(DAY_OFFSETS)) {
    if (upper.startsWith(day)) return day;
  }
  return null;
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function cellText(row: ExcelJS.Row, col: number): string {
  const cell = row.getCell(col);
  if (cell.value == null) return "";
  if (typeof cell.value === "object" && "richText" in cell.value) {
    return (cell.value as any).richText.map((r: any) => r.text).join("").trim();
  }
  return String(cell.value).trim();
}

function cellHyperlink(row: ExcelJS.Row, col: number): string {
  const cell = row.getCell(col);
  if (cell.hyperlink) return cell.hyperlink;
  if (typeof cell.value === "object" && cell.value !== null && "hyperlink" in cell.value) {
    return (cell.value as any).hyperlink || "";
  }
  return "";
}

interface DayBlock {
  trabajo: string;
  dinamica: string;
  rpm: string;
  observaciones: string;
  minutos: number;
  links: string[];
}

interface DayData {
  dayName: string;
  blocks: DayBlock[];
  totalMinutos: number;
}

function inferTipo(blocks: DayBlock[], dayName: string): string {
  const allTrabajo = blocks.map((b) => b.trabajo.toUpperCase()).join(" ");
  if (allTrabajo.includes("DESCANSO") && blocks.length <= 1) return "gimnasio";
  if (allTrabajo.includes("TECNICO") || allTrabajo.includes("TÉCNICO")) return "tecnica";
  if (allTrabajo.includes("RODILLO")) return "rodillo";
  return "ruta";
}

function buildDescription(blocks: DayBlock[]): string {
  const parts: string[] = [];
  const totalMin = blocks.find((b) => b.minutos > 0)?.minutos;
  if (totalMin) parts.push(`⏱ ${totalMin} min`);

  for (const b of blocks) {
    if (
      b.trabajo.toUpperCase().includes("TOTAL MIN") ||
      b.trabajo.toUpperCase().includes("TOTAL HS")
    )
      continue;

    let section = `\n▸ ${b.trabajo}`;
    if (b.rpm) section += ` [${b.rpm}]`;
    if (b.dinamica) section += `\n${b.dinamica}`;
    if (b.observaciones) section += `\n${b.observaciones}`;
    if (b.links.length > 0) {
      section += `\n🔗 ${b.links.join("\n🔗 ")}`;
    }
    parts.push(section);
  }
  return parts.join("\n").trim();
}

function hasSaturdayGroupSplit(blocks: DayBlock[]): boolean {
  return blocks.some(
    (b) =>
      b.dinamica.includes("Grupo 1") ||
      b.dinamica.includes("Grupo 3") ||
      b.dinamica.includes("Grupo 4")
  );
}

function buildSaturdayDescription(
  blocks: DayBlock[],
  groupFilter: "G1G2" | "G3G4"
): string {
  const parts: string[] = [];
  const totalMin = blocks.find((b) => b.minutos > 0)?.minutos;
  if (totalMin) parts.push(`⏱ ${totalMin} min`);

  for (const b of blocks) {
    if (
      b.trabajo.toUpperCase().includes("TOTAL MIN") ||
      b.trabajo.toUpperCase().includes("TOTAL HS")
    )
      continue;

    // Check if this block has group-specific content
    const hasGroupContent =
      b.dinamica.includes("Grupo 1") || b.dinamica.includes("Grupo 3");

    if (hasGroupContent) {
      // Extract relevant group section
      const lines = b.dinamica.split("\n");
      const relevantLines: string[] = [];
      let capturing = false;

      for (const line of lines) {
        const lineUpper = line.toUpperCase();
        if (
          groupFilter === "G1G2" &&
          (lineUpper.includes("GRUPO 1") || lineUpper.includes("GRUPO 2"))
        ) {
          capturing = true;
          relevantLines.push(line);
        } else if (
          groupFilter === "G3G4" &&
          (lineUpper.includes("GRUPO 3") || lineUpper.includes("GRUPO 4"))
        ) {
          capturing = true;
          relevantLines.push(line);
        } else if (
          lineUpper.includes("GRUPO") &&
          !lineUpper.includes(groupFilter === "G1G2" ? "GRUPO 1" : "GRUPO 3") &&
          !lineUpper.includes(groupFilter === "G1G2" ? "GRUPO 2" : "GRUPO 4")
        ) {
          capturing = false;
        } else if (capturing) {
          relevantLines.push(line);
        }
      }

      let section = `\n▸ ${b.trabajo}`;
      if (b.rpm) section += ` [${b.rpm}]`;
      if (relevantLines.length > 0) section += `\n${relevantLines.join("\n")}`;
      if (b.observaciones) section += `\n${b.observaciones}`;
      parts.push(section);
    } else {
      // Shared block
      let section = `\n▸ ${b.trabajo}`;
      if (b.rpm) section += ` [${b.rpm}]`;
      if (b.dinamica) section += `\n${b.dinamica}`;
      if (b.observaciones) section += `\n${b.observaciones}`;
      parts.push(section);
    }
  }
  return parts.join("\n").trim();
}

interface PhysicalExercise {
  name: string;
  url: string;
}

function parsePhysicalExercises(workbook: ExcelJS.Workbook): PhysicalExercise[] {
  const exercises: PhysicalExercise[] = [];
  // Look for the sheet with physical exercises (usually last or named sheet)
  for (const sheet of workbook.worksheets) {
    let found = false;
    sheet.eachRow((row) => {
      for (let c = 1; c <= row.cellCount; c++) {
        const text = cellText(row, c);
        const link = cellHyperlink(row, c);
        if (
          link &&
          (text.toUpperCase().includes("CORE") ||
            text.toUpperCase().includes("FUERZA") ||
            text.toUpperCase().includes("MOVILIDAD") ||
            text.toUpperCase().includes("SALTABILIDAD"))
        ) {
          found = true;
          exercises.push({ name: text, url: link });
        }
      }
    });
    if (found) break;
  }
  return exercises;
}

export function parseTrainingExcel(
  workbook: ExcelJS.Workbook
): { trainings: ParsedTraining[]; errors: string[]; month: string } {
  const trainings: ParsedTraining[] = [];
  const errors: string[] = [];
  let month = "";

  // Parse physical exercises
  const physExercises = parsePhysicalExercises(workbook);
  const physBlock =
    physExercises.length > 0
      ? physExercises.map((e) => `• ${e.name}: ${e.url}`).join("\n")
      : "";

  // Process week sheets (skip first overview sheet, skip non-week sheets)
  for (const sheet of workbook.worksheets) {
    // Find week header - look for "SEMANA" in first few rows
    let mondayDate: Date | null = null;

    for (let r = 1; r <= 3; r++) {
      const row = sheet.getRow(r);
      for (let c = 1; c <= 10; c++) {
        const text = cellText(row, c);
        if (text.toUpperCase().includes("SEMANA") && text.includes("(")) {
          mondayDate = parseMondayDate(text);
          break;
        }
      }
      if (mondayDate) break;
    }

    if (!mondayDate) continue; // Not a week sheet

    if (!month) {
      month = `${mondayDate.getFullYear()}-${String(mondayDate.getMonth() + 1).padStart(2, "0")}`;
    }

    // Find column mapping from header row (row with "Día", "Minutos", etc.)
    let headerRowNum = 0;
    let colMap: Record<string, number> = {};

    for (let r = 1; r <= 5; r++) {
      const row = sheet.getRow(r);
      for (let c = 1; c <= 10; c++) {
        const text = cellText(row, c).toUpperCase();
        if (text === "DÍA" || text === "DIA") {
          headerRowNum = r;
          // Map columns
          row.eachCell((cell, colNum) => {
            const name = cellText(row, colNum).toUpperCase().trim();
            if (name === "DÍA" || name === "DIA") colMap.dia = colNum;
            else if (name === "MINUTOS") colMap.minutos = colNum;
            else if (name === "TRABAJO") colMap.trabajo = colNum;
            else if (name === "DINÁMICA" || name === "DINAMICA") colMap.dinamica = colNum;
            else if (name.includes("MULT") || name.includes("RPM")) colMap.rpm = colNum;
            else if (name.includes("OBSERV")) colMap.obs = colNum;
          });
          break;
        }
      }
      if (headerRowNum) break;
    }

    if (!headerRowNum || !colMap.dia) {
      errors.push(`Hoja "${sheet.name}": no se encontró la estructura esperada`);
      continue;
    }

    // Parse day rows
    const days: DayData[] = [];
    let currentDay: DayData | null = null;

    sheet.eachRow((row, rowNum) => {
      if (rowNum <= headerRowNum) return;

      const diaText = cellText(row, colMap.dia);
      const trabajo = colMap.trabajo ? cellText(row, colMap.trabajo) : "";
      const dinamica = colMap.dinamica ? cellText(row, colMap.dinamica) : "";
      const rpm = colMap.rpm ? cellText(row, colMap.rpm) : "";
      const obs = colMap.obs ? cellText(row, colMap.obs) : "";
      const minStr = colMap.minutos ? cellText(row, colMap.minutos) : "";
      const minutos = parseFloat(minStr) || 0;

      // Collect links from all cells
      const links: string[] = [];
      for (let c = 1; c <= 10; c++) {
        const link = cellHyperlink(row, c);
        if (link) links.push(link);
      }

      if (
        trabajo.toUpperCase().includes("TOTAL MIN") ||
        trabajo.toUpperCase().includes("TOTAL HS")
      ) {
        return; // Skip totals
      }

      const dayName = diaText ? getDayName(diaText) : null;

      if (dayName) {
        // New day
        currentDay = { dayName, blocks: [], totalMinutos: minutos };
        days.push(currentDay);
      }

      if (currentDay && trabajo) {
        currentDay.blocks.push({ trabajo, dinamica, rpm, observaciones: obs, minutos, links });
        if (minutos > currentDay.totalMinutos) currentDay.totalMinutos = minutos;
      }
    });

    // Convert days to trainings
    for (const day of days) {
      const offset = DAY_OFFSETS[day.dayName];
      if (offset == null) {
        errors.push(`Día no reconocido: ${day.dayName}`);
        continue;
      }

      const date = new Date(mondayDate);
      date.setDate(date.getDate() + offset);
      const fecha = formatDate(date);

      const isDescanso =
        day.blocks.length <= 1 &&
        day.blocks[0]?.trabajo.toUpperCase().includes("DESCANSO");

      // Determine title
      const mainWorks = day.blocks
        .map((b) => b.trabajo)
        .filter(
          (t) =>
            !t.toUpperCase().includes("RODAR") &&
            !t.toUpperCase().includes("TOTAL")
        );
      const titulo =
        mainWorks.length > 0
          ? mainWorks.join(" + ")
          : day.blocks[0]?.trabajo || "Entrenamiento";

      const tipo = inferTipo(day.blocks, day.dayName);

      // Saturday group split
      if (day.dayName === "SABADO" || day.dayName === "SÁBADO") {
        if (hasSaturdayGroupSplit(day.blocks)) {
          // G1, G2 get one version
          const descG12 = buildSaturdayDescription(day.blocks, "G1G2");
          // G3, G4 get another
          const descG34 = buildSaturdayDescription(day.blocks, "G3G4");

          for (const g of ["G1", "G2"]) {
            trainings.push({
              fecha,
              grupo: g,
              titulo,
              descripcion: descG12,
              tipo,
              link_archivo: "",
            });
          }
          for (const g of ["G3", "G4"]) {
            trainings.push({
              fecha,
              grupo: g,
              titulo,
              descripcion: descG34,
              tipo,
              link_archivo: "",
            });
          }
          continue;
        }
      }

      // For rest/physical days, append exercise links
      let descripcion = buildDescription(day.blocks);
      if (isDescanso && physBlock) {
        descripcion += `\n\n💪 Preparación Física:\n${physBlock}`;
      }

      // All groups get the same training
      for (const g of ["G1", "G2", "G3", "G4"]) {
        trainings.push({
          fecha,
          grupo: g,
          titulo: isDescanso ? "Descanso + Prep. Física" : titulo,
          descripcion,
          tipo,
          link_archivo: "",
        });
      }
    }
  }

  return { trainings, errors, month };
}
