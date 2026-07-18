// Parseo flexible de Excel para listas de entrega.
// Detecta columnas por nombre de encabezado (case-insensitive, sin acentos).

import ExcelJS from "exceljs";

export interface DeliveryExcelRow {
  cliente_nombre: string;
  producto: string;
  variante?: string | null;
  cantidad: number;
  notas?: string | null;
}

const norm = (s: any): string =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const HEADER_ALIASES: Record<keyof DeliveryExcelRow, string[]> = {
  cliente_nombre: ["cliente", "nombre", "cliente nombre", "customer", "nombre cliente", "comprador", "destinatario"],
  producto: ["producto", "product", "item", "articulo", "descripcion", "detalle"],
  variante: ["variante", "variant", "talle color", "talle y color", "detalles", "atributos", "opciones"],
  cantidad: ["cantidad", "qty", "quantity", "cant", "unidades"],
  notas: ["notas", "observaciones", "nota", "note", "notes", "comentario", "comentarios"],
};

const matchField = (header: string): keyof DeliveryExcelRow | null => {
  const n = norm(header);
  if (!n) return null;
  for (const key of Object.keys(HEADER_ALIASES) as (keyof DeliveryExcelRow)[]) {
    if (HEADER_ALIASES[key].some((alias) => n === alias || n.includes(alias))) {
      return key;
    }
  }
  return null;
};

export async function parseDeliveryExcel(file: File): Promise<{ rows: DeliveryExcelRow[]; errors: string[] }> {
  const buffer = await file.arrayBuffer();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.worksheets[0];
  if (!ws) return { rows: [], errors: ["El archivo no tiene hojas."] };

  const errors: string[] = [];
  const rows: DeliveryExcelRow[] = [];

  // Detectar fila de headers: primera fila con >=2 celdas que matchean campos.
  let headerRowIdx = -1;
  const map: Record<number, keyof DeliveryExcelRow> = {};
  for (let r = 1; r <= Math.min(10, ws.rowCount); r++) {
    const row = ws.getRow(r);
    const tmpMap: Record<number, keyof DeliveryExcelRow> = {};
    row.eachCell((cell, col) => {
      const val = cell.value;
      const text = typeof val === "object" && val !== null && "text" in (val as any) ? (val as any).text : val;
      const f = matchField(String(text ?? ""));
      if (f) tmpMap[col] = f;
    });
    if (
      Object.values(tmpMap).includes("cliente_nombre") &&
      Object.values(tmpMap).includes("producto")
    ) {
      headerRowIdx = r;
      Object.assign(map, tmpMap);
      break;
    }
  }

  if (headerRowIdx === -1) {
    return {
      rows: [],
      errors: [
        "No pude detectar las columnas. Asegurate de tener encabezados con al menos 'Cliente' y 'Producto' (podés usar variaciones como 'Nombre', 'Item', etc.).",
      ],
    };
  }

  const getText = (cell: ExcelJS.Cell): string => {
    const v = cell.value;
    if (v == null) return "";
    if (typeof v === "object") {
      if ("text" in (v as any)) return String((v as any).text ?? "");
      if ("richText" in (v as any)) return ((v as any).richText || []).map((rt: any) => rt.text).join("");
      if ("result" in (v as any)) return String((v as any).result ?? "");
      if ("hyperlink" in (v as any)) return String((v as any).text ?? (v as any).hyperlink ?? "");
    }
    return String(v);
  };

  for (let r = headerRowIdx + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const record: Partial<DeliveryExcelRow> = {};
    let hasAny = false;
    for (const [colStr, field] of Object.entries(map)) {
      const col = Number(colStr);
      const text = getText(row.getCell(col)).trim();
      if (text) hasAny = true;
      if (field === "cantidad") {
        const n = parseFloat(text.replace(",", "."));
        record.cantidad = Number.isFinite(n) && n > 0 ? n : 1;
      } else {
        (record as any)[field] = text || null;
      }
    }
    if (!hasAny) continue;
    if (!record.cliente_nombre || !record.producto) {
      errors.push(`Fila ${r}: faltan Cliente o Producto — omitida.`);
      continue;
    }
    rows.push({
      cliente_nombre: record.cliente_nombre!,
      producto: record.producto!,
      variante: record.variante ?? null,
      cantidad: record.cantidad ?? 1,
      notas: record.notas ?? null,
    });
  }

  return { rows, errors };
}

export function buildDeliveryExcelTemplate(): Promise<Blob> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Entregas");
  ws.columns = [
    { header: "Cliente", key: "cliente", width: 30 },
    { header: "Producto", key: "producto", width: 40 },
    { header: "Variante", key: "variante", width: 25 },
    { header: "Cantidad", key: "cantidad", width: 10 },
    { header: "Notas", key: "notas", width: 30 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.addRow({ cliente: "Juan Pérez", producto: "Remera Reybaud", variante: "Talle M / Negro", cantidad: 1, notas: "" });
  ws.addRow({ cliente: "Juan Pérez", producto: "Bidón 750ml", variante: "", cantidad: 2, notas: "" });
  ws.addRow({ cliente: "María López", producto: "Casco", variante: "Talle M / Rojo", cantidad: 1, notas: "Retira en local" });
  return wb.xlsx.writeBuffer().then((buf) => new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
}
