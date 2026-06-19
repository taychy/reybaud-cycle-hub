import jsPDF from "jspdf";
import QRCode from "qrcode";
import { formatPrice } from "@/lib/currency";

export interface PreorderLabelData {
  id: string;
  short_number?: string | number;
  producto_nombre: string;
  cantidad: number;
  variante?: Record<string, any> | null;
  items?: any[] | null;
  precio_total: number;
  sena_monto: number;
  saldo_pendiente: number;
  moneda: string;
  estado_pago_sena?: string | null;
  entrega_metodo?: string | null;
  sede_nombre?: string | null;
  envio_direccion?: string | null;
  envio_contacto?: string | null;
  envio_notas?: string | null;
  alumno_nombre?: string | null;
  alumno_email?: string | null;
  alumno_telefono?: string | null;
  created_at?: string;
}

// A4 landscape: 297 x 210 mm. 4 etiquetas: 2 cols x 2 rows.
// Cada etiqueta: 148.5 x 105 mm aproximadamente.
const A4_W = 297;
const A4_H = 210;
const COLS = 2;
const ROWS = 2;
const CELL_W = A4_W / COLS; // 148.5
const CELL_H = A4_H / ROWS; // 105
const MARGIN = 6;

const buildPayUrl = (p: PreorderLabelData): string => {
  const origin = typeof window !== "undefined" ? window.location.origin : "https://reybaud-app.com";
  return `${origin}/pagar-preventa/${p.id}`;
};

const truncate = (s: string, max: number) => (s.length > max ? s.slice(0, max - 1) + "…" : s);

const drawLabel = async (
  doc: jsPDF,
  p: PreorderLabelData,
  ox: number,
  oy: number,
) => {
  const x = ox + MARGIN;
  const y = oy + MARGIN;
  const w = CELL_W - MARGIN * 2;
  const h = CELL_H - MARGIN * 2;

  // Border
  doc.setDrawColor(180);
  doc.setLineWidth(0.3);
  doc.roundedRect(x, y, w, h, 2, 2);

  // Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(20);
  const numero = p.short_number ?? p.id.slice(0, 8).toUpperCase();
  doc.text(`REYBAUD · PREVENTA #${numero}`, x + 3, y + 6);

  doc.setLineWidth(0.2);
  doc.line(x + 3, y + 8, x + w - 3, y + 8);

  let cursorY = y + 13;
  const leftW = w - 38; // dejar espacio para QR (32mm) a la derecha
  const leftX = x + 3;

  // Cliente
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("CLIENTE:", leftX, cursorY);
  doc.setFont("helvetica", "normal");
  doc.text(truncate(p.alumno_nombre || "—", 35), leftX + 18, cursorY);
  cursorY += 4;

  if (p.alumno_telefono) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(`Tel: ${truncate(p.alumno_telefono, 25)}`, leftX, cursorY);
    cursorY += 3.5;
  }
  if (p.alumno_email) {
    doc.setFontSize(8);
    doc.text(truncate(p.alumno_email, 38), leftX, cursorY);
    cursorY += 3.5;
  }

  cursorY += 1;

  // Entrega
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  if (p.entrega_metodo === "envio" || p.envio_direccion) {
    doc.text("ENVIO A:", leftX, cursorY);
    cursorY += 3.5;
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(truncate(p.envio_direccion || "—", 90), leftW);
    doc.text(lines, leftX, cursorY);
    cursorY += lines.length * 3.2;
    if (p.envio_contacto) {
      doc.setFontSize(7.5);
      doc.text(`Contacto: ${truncate(p.envio_contacto, 40)}`, leftX, cursorY);
      cursorY += 3;
    }
  } else {
    doc.text(`RETIRO: ${truncate(p.sede_nombre || "Sede", 30)}`, leftX, cursorY);
    cursorY += 4;
  }

  cursorY += 1;
  doc.setLineWidth(0.15);
  doc.setDrawColor(200);
  doc.line(leftX, cursorY, leftX + leftW, cursorY);
  cursorY += 3;

  // Detalle
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.text("DETALLE:", leftX, cursorY);
  cursorY += 3.5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);

  const detail: string[] = [];
  const varianteStr = p.variante
    ? Object.entries(p.variante).map(([k, v]) => `${k}: ${v}`).join(" · ")
    : "";
  detail.push(
    `• ${p.cantidad}× ${truncate(p.producto_nombre, 40)}${varianteStr ? ` (${varianteStr})` : ""}`,
  );
  if (Array.isArray(p.items)) {
    p.items.slice(0, 4).forEach((it: any) => {
      const nombre = it.producto_nombre || it.nombre || "Item";
      const vs = it.variante
        ? " · " + Object.entries(it.variante).map(([k, v]) => `${k}:${v}`).join(", ")
        : "";
      detail.push(`  - ${truncate(nombre + vs, 55)}`);
    });
  }
  detail.forEach((d) => {
    const lines = doc.splitTextToSize(d, leftW);
    doc.text(lines, leftX, cursorY);
    cursorY += lines.length * 3.2;
  });

  // Totales en el bottom-left
  const totalsY = y + h - 18;
  doc.setLineWidth(0.15);
  doc.setDrawColor(200);
  doc.line(leftX, totalsY - 2, leftX + leftW, totalsY - 2);

  const senaConfirmada = p.estado_pago_sena === "confirmada";
  const senaPagada = Number(p.sena_monto || 0);
  const saldo = Number(p.saldo_pendiente || 0);
  // Si la seña NO está confirmada, lo "adeudado" real es seña + saldo
  const pendienteReal = senaConfirmada ? saldo : senaPagada + saldo;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text(`TOTAL: ${formatPrice(p.precio_total || 0, p.moneda)}`, leftX, totalsY + 2);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);

  if (senaConfirmada) {
    doc.text(`Pagado: ${formatPrice(senaPagada, p.moneda)}`, leftX, totalsY + 6);
  } else {
    doc.setTextColor(180, 60, 30);
    doc.text(`Seña SIN acreditar`, leftX, totalsY + 6);
    doc.setTextColor(20);
  }

  doc.setFont("helvetica", "bold");
  if (pendienteReal > 0) {
    doc.setTextColor(180, 60, 30);
    const etiqueta = senaConfirmada ? "SALDO" : "PENDIENTE";
    doc.text(`${etiqueta}: ${formatPrice(pendienteReal, p.moneda)}`, leftX, totalsY + 10);
  } else {
    doc.setTextColor(20, 120, 60);
    doc.text(`PAGADO ✓`, leftX, totalsY + 10);
  }
  doc.setTextColor(20);

  if (p.created_at) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(120);
    doc.text(
      `Fecha: ${new Date(p.created_at).toLocaleDateString("es-AR")}`,
      leftX,
      totalsY + 14,
    );
    doc.setTextColor(20);
  }

  // QR
  const qrSize = 32;
  const qrX = x + w - qrSize - 3;
  const qrY = y + h - qrSize - 12;
  try {
    if (pendienteReal > 0) {
      const url = buildPayUrl(p);
      const dataUrl = await QRCode.toDataURL(url, { margin: 0, width: 256 });
      doc.addImage(dataUrl, "PNG", qrX, qrY, qrSize, qrSize);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(senaConfirmada ? 20 : 180, senaConfirmada ? 20 : 60, senaConfirmada ? 20 : 30);
      doc.text(senaConfirmada ? "PAGAR SALDO" : "PAGAR SEÑA", qrX + qrSize / 2, qrY + qrSize + 3, { align: "center" });
      doc.setTextColor(20);
    } else {
      doc.setDrawColor(20, 120, 60);
      doc.setLineWidth(0.5);
      doc.roundedRect(qrX, qrY, qrSize, qrSize, 2, 2);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(20, 120, 60);
      doc.text("PAGADO ✓", qrX + qrSize / 2, qrY + qrSize / 2 + 1, { align: "center" });
      doc.setTextColor(20);
    }
  } catch (err) {
    console.warn("QR error", err);
  }
};

export const printPreorderLabels = async (preorders: PreorderLabelData[]) => {
  if (!preorders.length) return;
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const perPage = COLS * ROWS;

  for (let i = 0; i < preorders.length; i++) {
    if (i > 0 && i % perPage === 0) doc.addPage();
    const idx = i % perPage;
    const col = idx % COLS;
    const row = Math.floor(idx / COLS);
    const ox = col * CELL_W;
    const oy = row * CELL_H;
    await drawLabel(doc, preorders[i], ox, oy);
  }

  // Trigger download via anchor (evita el popup blocker que dispara window.open)
  const blob = doc.output("blob");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const stamp = new Date().toISOString().slice(0, 10);
  a.download = preorders.length === 1
    ? `etiqueta-preventa-${preorders[0].short_number || preorders[0].id.slice(0, 8)}.pdf`
    : `etiquetas-preventas-${stamp}-${preorders.length}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 30000);
};

export const printSinglePreorderLabel = async (p: PreorderLabelData) => {
  await printPreorderLabels([p]);
};
