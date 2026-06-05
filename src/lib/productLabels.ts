import jsPDF from "jspdf";
import QRCode from "qrcode";
import { formatPrice } from "@/lib/currency";

export type LabelLayout = "4" | "8" | "21";

export interface ProductLabelItem {
  product_id: string;
  product_name: string;
  sku_base: string | null;
  variant_key: string | null; // "Talle:M|Color:Negro" o null
  price: number;
  currency: string;
  category_name?: string | null;
}

// ---------- SKU helpers ----------

const abbrevOption = (val: string): string => {
  const clean = (val || "").toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const alnum = clean.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (!alnum) return "X";
  // Talles cortos (S, M, L, XL, etc.) los devolvemos enteros si son ≤3
  if (alnum.length <= 3) return alnum;
  return alnum.slice(0, 2);
};

export const buildSku = (sku_base: string | null, variant_key: string | null): string => {
  const base = (sku_base || "0000").toString();
  if (!variant_key) return `RYB-${base}`;
  const parts = variant_key.split("|").map((p) => {
    const idx = p.indexOf(":");
    const val = idx >= 0 ? p.slice(idx + 1) : p;
    return abbrevOption(val);
  });
  return `RYB-${base}-${parts.join("-")}`;
};

// ---------- Layout configs (mm, A4 portrait 210x297) ----------

interface LayoutCfg {
  cols: number;
  rows: number;
  cellW: number;
  cellH: number;
  marginX: number; // página
  marginY: number;
  gapX: number;
  gapY: number;
  qrSize: number;
  showImage: boolean;
  fontTitle: number;
  fontName: number;
  fontSku: number;
  fontPrice: number;
  fontVariant: number;
}

const LAYOUTS: Record<LabelLayout, LayoutCfg> = {
  // 4 por hoja: 2x2, etiqueta grande 95x140mm aprox
  "4": {
    cols: 2, rows: 2, cellW: 95, cellH: 140,
    marginX: 10, marginY: 8, gapX: 5, gapY: 5,
    qrSize: 30, showImage: false,
    fontTitle: 11, fontName: 13, fontSku: 16, fontPrice: 14, fontVariant: 10,
  },
  // 8 por hoja: 2x4, etiqueta 95x67mm
  "8": {
    cols: 2, rows: 4, cellW: 95, cellH: 67,
    marginX: 10, marginY: 8, gapX: 5, gapY: 4,
    qrSize: 22, showImage: false,
    fontTitle: 9, fontName: 11, fontSku: 12, fontPrice: 11, fontVariant: 8.5,
  },
  // 21 por hoja: 3x7, etiqueta 63x40mm (Avery L7160 style)
  "21": {
    cols: 3, rows: 7, cellW: 63, cellH: 40,
    marginX: 10, marginY: 8, gapX: 2, gapY: 0,
    qrSize: 14, showImage: false,
    fontTitle: 6.5, fontName: 7.5, fontSku: 9, fontPrice: 8, fontVariant: 7,
  },
};

const truncate = (s: string, max: number) => (s.length > max ? s.slice(0, max - 1) + "…" : s);

const variantPretty = (variant_key: string | null): string => {
  if (!variant_key) return "";
  return variant_key
    .split("|")
    .map((p) => {
      const idx = p.indexOf(":");
      return idx >= 0 ? p.slice(idx + 1) : p;
    })
    .join(" · ");
};

const drawProductLabel = async (
  doc: jsPDF,
  item: ProductLabelItem,
  cfg: LayoutCfg,
  ox: number,
  oy: number,
) => {
  const pad = cfg.cols === 3 ? 1.5 : 3;
  const x = ox;
  const y = oy;
  const w = cfg.cellW;
  const h = cfg.cellH;

  // Border
  doc.setDrawColor(160);
  doc.setLineWidth(0.25);
  doc.roundedRect(x, y, w, h, 1.5, 1.5);

  // QR (UUID del producto interno) en esquina derecha
  const qrX = x + w - cfg.qrSize - pad;
  const qrY = y + pad;
  try {
    const dataUrl = await QRCode.toDataURL(item.product_id, { margin: 0, width: 256 });
    doc.addImage(dataUrl, "PNG", qrX, qrY, cfg.qrSize, cfg.qrSize);
  } catch (err) {
    console.warn("QR error", err);
  }

  // Header: brand
  doc.setFont("helvetica", "bold");
  doc.setFontSize(cfg.fontTitle);
  doc.setTextColor(20);
  doc.text("REYBAUD", x + pad, y + pad + cfg.fontTitle * 0.35);

  // SKU debajo del título (pequeño tamaño layout 21, mediano resto)
  const sku = buildSku(item.sku_base, item.variant_key);
  const skuY = y + pad + cfg.fontTitle * 0.35 + (cfg.cols === 3 ? 3 : 4.5);
  doc.setFont("courier", "bold");
  doc.setFontSize(cfg.fontSku);
  doc.text(sku, x + pad, skuY);

  // Product name (debajo del SKU). Ocupa el ancho menos QR.
  const nameY = skuY + (cfg.cols === 3 ? 4 : 6);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(cfg.fontName);
  doc.setTextColor(20);
  const nameMaxW = w - cfg.qrSize - pad * 3;
  const nameLines = doc.splitTextToSize(truncate(item.product_name, 60), nameMaxW);
  const maxNameLines = cfg.cols === 3 ? 2 : cfg.rows === 4 ? 2 : 3;
  doc.text(nameLines.slice(0, maxNameLines), x + pad, nameY);

  // Variant
  const variant = variantPretty(item.variant_key);
  if (variant) {
    const vY = nameY + nameLines.slice(0, maxNameLines).length * (cfg.fontName * 0.42) + (cfg.cols === 3 ? 1.5 : 2.5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(cfg.fontVariant);
    doc.setTextColor(80);
    const vLines = doc.splitTextToSize(truncate(variant, 50), w - pad * 2);
    doc.text(vLines.slice(0, 1), x + pad, vY);
    doc.setTextColor(20);
  }

  // Price abajo
  const priceY = y + h - pad - 1;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(cfg.fontPrice);
  doc.setTextColor(20);
  doc.text(formatPrice(item.price || 0, item.currency || "ARS"), x + pad, priceY);
};

export interface PrintOptions {
  layout: LabelLayout;
  filename?: string;
}

export const printProductLabels = async (
  items: ProductLabelItem[],
  opts: PrintOptions,
) => {
  if (!items.length) return;
  const cfg = LAYOUTS[opts.layout];
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const perPage = cfg.cols * cfg.rows;

  for (let i = 0; i < items.length; i++) {
    if (i > 0 && i % perPage === 0) doc.addPage();
    const idx = i % perPage;
    const col = idx % cfg.cols;
    const row = Math.floor(idx / cfg.cols);
    const ox = cfg.marginX + col * (cfg.cellW + cfg.gapX);
    const oy = cfg.marginY + row * (cfg.cellH + cfg.gapY);
    await drawProductLabel(doc, items[i], cfg, ox, oy);
  }

  const blob = doc.output("blob");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const stamp = new Date().toISOString().slice(0, 10);
  a.download = opts.filename || `etiquetas-productos-${stamp}-${items.length}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 30000);
};
