import ExcelJS from "exceljs";

export interface LiqDetalleRow {
  fecha: string;
  coach: string;
  origen: string;
  tipo: string;
  detalle: string;
  sede: string;
  estado_operativo: string;
  estado_economico: string;
  valor_base: number;
  viaticos: number;
  extras: number;
  total: number;
  observaciones: string;
  reserva_turnera_id: string;
  movimiento_id: string;
}

export interface LiqResumenRow {
  coach: string;
  clases: number;
  turnera: number;
  manuales: number;
  pendientes: number;
  monto_pendiente: number;
  confirmado: number;
  estimado: number;
  estado_liquidacion: string;
}

const HEADER_FILL = "FFF2F2F2";

function styleHeader(row: ExcelJS.Row) {
  row.font = { name: "Arial", bold: true };
  row.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
  });
}

export async function buildLiquidacionesWorkbook(
  mes: string,
  coachLabel: string,
  resumen: LiqResumenRow[],
  detalle: LiqDetalleRow[],
): Promise<Blob> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Reybaud";
  wb.created = new Date();

  const money = '"$"#,##0;("$"#,##0);-';

  const rs = wb.addWorksheet("Resumen");
  rs.addRow([`Liquidaciones ${mes} · ${coachLabel}`]).font = { name: "Arial", bold: true, size: 14 };
  rs.addRow([]);
  const rHead = rs.addRow([
    "Coach", "Clases confirmadas", "Turnera realizadas", "Cargas manuales",
    "Pendientes de revisión", "Monto pendiente", "Confirmado", "Estimado", "Estado liquidación",
  ]);
  styleHeader(rHead);
  resumen.forEach((r) => {
    rs.addRow([r.coach, r.clases, r.turnera, r.manuales, r.pendientes, r.monto_pendiente, r.confirmado, r.estimado, r.estado_liquidacion]);
  });
  const firstData = 4;
  const lastData = firstData + resumen.length - 1;
  if (resumen.length > 0) {
    const totalRow = rs.addRow([
      "TOTAL",
      { formula: `SUM(B${firstData}:B${lastData})` },
      { formula: `SUM(C${firstData}:C${lastData})` },
      { formula: `SUM(D${firstData}:D${lastData})` },
      { formula: `SUM(E${firstData}:E${lastData})` },
      { formula: `SUM(F${firstData}:F${lastData})` },
      { formula: `SUM(G${firstData}:G${lastData})` },
      { formula: `SUM(H${firstData}:H${lastData})` },
      "",
    ]);
    totalRow.font = { name: "Arial", bold: true };
  }
  ["F", "G", "H"].forEach((c) => { rs.getColumn(c).numFmt = money; });
  rs.getColumn("A").width = 28;
  ["B", "C", "D", "E", "F", "G", "H", "I"].forEach((c) => { rs.getColumn(c).width = 18; });

  const ds = wb.addWorksheet("Detalle");
  const dHead = ds.addRow([
    "Fecha", "Coach", "Origen", "Tipo", "Grupo/Alumno", "Sede",
    "Estado operativo", "Estado económico", "Honorario/Valor base", "Viáticos", "Extras", "Total",
    "Observaciones", "Reserva Turnera ID", "Movimiento ID",
  ]);
  styleHeader(dHead);
  detalle.forEach((d) => {
    ds.addRow([
      d.fecha, d.coach, d.origen, d.tipo, d.detalle, d.sede,
      d.estado_operativo, d.estado_economico, d.valor_base, d.viaticos, d.extras, d.total,
      d.observaciones, d.reserva_turnera_id, d.movimiento_id,
    ]);
  });
  ["I", "J", "K", "L"].forEach((c) => { ds.getColumn(c).numFmt = money; });
  ds.getColumn("A").width = 12;
  ["B", "C", "D", "E", "F", "G", "H"].forEach((c) => { ds.getColumn(c).width = 20; });
  ["I", "J", "K", "L"].forEach((c) => { ds.getColumn(c).width = 16; });
  ds.getColumn("M").width = 40;
  ["N", "O"].forEach((c) => { ds.getColumn(c).width = 38; });
  ds.views = [{ state: "frozen", ySplit: 1 }];

  wb.eachSheet((ws) => {
    ws.eachRow((row) => {
      row.eachCell((cell) => {
        if (!cell.font?.bold) cell.font = { name: "Arial" };
      });
    });
  });

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
