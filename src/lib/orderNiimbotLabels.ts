import QRCode from "qrcode";
import JSZip from "jszip";
import { formatPrice } from "@/lib/currency";
import {
  buildPreorderPayUrl,
  type PreorderLabelData,
} from "@/lib/preorderLabels";
import { downloadFileBlob, printImageBlobs } from "@/lib/printBlob";

/**
 * Etiquetas de pedidos/preventas para impresora Niimbot (rollo térmico).
 * Jerarquía: #pedido · REYBAUD / cliente / producto / TALLE · CANT. / pago.
 * El QR de cobro se imprime SÓLO si queda saldo pendiente; si está pagado,
 * ese espacio se usa para un "PAGADO ✓" grande.
 */

export type OrderNiimbotSize = "50x40" | "50x30" | "40x30";

const SIZE_MM: Record<OrderNiimbotSize, { w: number; h: number }> = {
  "50x40": { w: 50, h: 40 },
  "50x30": { w: 50, h: 30 },
  "40x30": { w: 40, h: 30 },
};

interface SizeConfig {
  num: number;
  brand: number;
  cliente: number;
  prod: number;
  meta: number;
  payLabel: number;
  payAmount: number;
  paid: number;
  qrRatio: number;
  maxProdLines: number;
}

const CONFIG: Record<OrderNiimbotSize, SizeConfig> = {
  "50x40": { num: 5.2, brand: 2.0, cliente: 3.6, prod: 3.0, meta: 2.5, payLabel: 1.9, payAmount: 3.4, paid: 5.4, qrRatio: 0.42, maxProdLines: 2 },
  "50x30": { num: 4.2, brand: 1.8, cliente: 3.0, prod: 2.5, meta: 2.1, payLabel: 1.7, payAmount: 2.8, paid: 4.4, qrRatio: 0.5, maxProdLines: 1 },
  "40x30": { num: 3.8, brand: 1.6, cliente: 2.7, prod: 2.3, meta: 2.0, payLabel: 1.6, payAmount: 2.5, paid: 3.8, qrRatio: 0.5, maxProdLines: 1 },
};

const PX_PER_MM = 12;

export interface OrderLabelPreview {
  id: string;
  title: string;
  filename: string;
  blob: Blob;
  url: string;
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);

/** "TALLE M · COLOR NEGRO" — incluye el nombre de la variante, no sólo el valor. */
export const variantLabel = (v: any): string => {
  if (!v) return "";
  if (typeof v === "string") return v.toUpperCase();
  try {
    return Object.entries(v)
      .filter(([, val]) => val !== null && val !== "" && val !== undefined)
      .map(([k, val]) => `${String(k).toUpperCase()} ${String(val).toUpperCase()}`)
      .join(" · ");
  } catch {
    return "";
  }
};

interface LabelLine {
  nombre: string;
  meta: string;
}

const itemLines = (p: PreorderLabelData): LabelLine[] => {
  if (Array.isArray(p.items) && p.items.length) {
    return p.items.map((it: any) => {
      const cant = Number(it.cantidad ?? it.quantity ?? 1) || 1;
      const v = variantLabel(it.variante);
      return {
        nombre: it.producto_nombre || it.nombre || "Item",
        meta: [v, `CANT. ${cant}`].filter(Boolean).join(" · "),
      };
    });
  }
  const cant = Number(p.cantidad || 1) || 1;
  const v = variantLabel(p.variante);
  return [{
    nombre: p.producto_nombre,
    meta: [v, `CANT. ${cant}`].filter(Boolean).join(" · "),
  }];
};

/** Dibuja el texto ajustando el tamaño de fuente hasta que entre en maxW. */
const fitText = (
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxW: number,
  sizePx: number,
  weight: string,
) => {
  let size = sizePx;
  ctx.font = `${weight} ${size}px system-ui, -apple-system, sans-serif`;
  while (ctx.measureText(text).width > maxW && size > 8) {
    size -= 1;
    ctx.font = `${weight} ${size}px system-ui, -apple-system, sans-serif`;
  }
  let out = text;
  while (ctx.measureText(out).width > maxW && out.length > 3) {
    out = out.slice(0, -2);
  }
  ctx.fillText(out === text ? text : out + "…", x, y);
  return size;
};

const renderOrderLabel = async (
  p: PreorderLabelData,
  size: OrderNiimbotSize,
): Promise<Blob> => {
  const mm = SIZE_MM[size];
  const cfg = CONFIG[size];
  const W = Math.round(mm.w * PX_PER_MM);
  const H = Math.round(mm.h * PX_PER_MM);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo generar la etiqueta.");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#000000";
  ctx.textBaseline = "top";

  const pad = Math.round(1.2 * PX_PER_MM);
  const innerW = W - pad * 2;
  const numero = String(p.short_number ?? p.id.slice(0, 8).toUpperCase()).replace(/^#/, "");

  const senaConfirmada = p.estado_pago_sena === "confirmada";
  const pendiente = senaConfirmada
    ? Number(p.saldo_pendiente || 0)
    : Number(p.sena_monto || 0) + Number(p.saldo_pendiente || 0);
  const pagado = pendiente <= 0;

  // ── Header: #75 · REYBAUD
  const numPx = Math.round(cfg.num * PX_PER_MM);
  const brandPx = Math.round(cfg.brand * PX_PER_MM);
  ctx.font = `bold ${brandPx}px system-ui, sans-serif`;
  const brandW = ctx.measureText("REYBAUD").width;
  ctx.font = `900 ${numPx}px system-ui, -apple-system, sans-serif`;
  ctx.fillText(`#${numero}`, pad, pad);
  ctx.font = `bold ${brandPx}px system-ui, sans-serif`;
  ctx.fillText("REYBAUD", W - pad - brandW, pad + Math.round(numPx * 0.45));

  let y = pad + numPx + Math.round(0.5 * PX_PER_MM);
  ctx.fillRect(pad, y, innerW, 3);
  y += Math.round(0.8 * PX_PER_MM);

  // ── Cliente (grande)
  const cliPx = Math.round(cfg.cliente * PX_PER_MM);
  fitText(ctx, (p.alumno_nombre || "—").toUpperCase(), pad, y, innerW, cliPx, "bold");
  y += cliPx + Math.round(0.6 * PX_PER_MM);

  // ── Sede (si hay una resuelta; si no, "A definir")
  const metaPxSede = Math.round(cfg.meta * PX_PER_MM);
  if (y + metaPxSede <= bottomTop) {
    fitText(ctx, `SEDE: ${(p.sede_nombre || "A definir").toUpperCase()}`, pad, y, innerW, metaPxSede, "bold");
    y += metaPxSede + Math.round(0.3 * PX_PER_MM);
  }

  // ── Zona de pago / QR reservada abajo
  const qrSize = Math.round(mm.h * cfg.qrRatio * PX_PER_MM);
  const bottomTop = H - pad - qrSize;

  // ── Productos
  const prodPx = Math.round(cfg.prod * PX_PER_MM);
  const metaPx = Math.round(cfg.meta * PX_PER_MM);
  const lines = itemLines(p).slice(0, cfg.maxProdLines);
  lines.forEach((ln) => {
    if (y + prodPx > bottomTop) return;
    fitText(ctx, ln.nombre.toUpperCase(), pad, y, innerW, prodPx, "bold");
    y += prodPx + 2;
    if (ln.meta && y + metaPx <= bottomTop) {
      fitText(ctx, ln.meta, pad, y, innerW, metaPx, "bold");
      y += metaPx + Math.round(0.3 * PX_PER_MM);
    }
  });

  if (pagado) {
    // Sin QR: el espacio se usa para el sello PAGADO.
    const paidPx = Math.round(cfg.paid * PX_PER_MM);
    ctx.textBaseline = "middle";
    ctx.font = `900 ${paidPx}px system-ui, -apple-system, sans-serif`;
    const text = "PAGADO ✓";
    const tw = ctx.measureText(text).width;
    const boxY = bottomTop;
    const boxH = H - pad - boxY;
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#000000";
    ctx.strokeRect(pad, boxY, innerW, boxH);
    ctx.fillText(text, pad + (innerW - tw) / 2, boxY + boxH / 2);
    ctx.textBaseline = "top";
  } else {
    const qrX = W - pad - qrSize;
    const qrY = H - pad - qrSize;
    try {
      const qrCanvas = document.createElement("canvas");
      await QRCode.toCanvas(qrCanvas, buildPreorderPayUrl(p), {
        margin: 0,
        width: qrSize,
        errorCorrectionLevel: "M",
      });
      ctx.drawImage(qrCanvas, qrX, qrY, qrSize, qrSize);
    } catch (err) {
      console.warn("QR error", err);
    }

    const payW = W - pad * 2 - qrSize - Math.round(1.2 * PX_PER_MM);
    const labelPx = Math.round(cfg.payLabel * PX_PER_MM);
    const amountPx = Math.round(cfg.payAmount * PX_PER_MM);
    ctx.font = `bold ${labelPx}px system-ui, sans-serif`;
    ctx.fillText("A COBRAR", pad, H - pad - qrSize + Math.round(qrSize * 0.12));
    fitText(
      ctx,
      formatPrice(pendiente, p.moneda),
      pad,
      H - pad - qrSize + Math.round(qrSize * 0.12) + labelPx + 4,
      payW,
      amountPx,
      "900",
    );
  }

  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("No se pudo generar la etiqueta."))),
      "image/png",
    ),
  );
};

export const buildOrderNiimbotPreviews = async (
  orders: PreorderLabelData[],
  size: OrderNiimbotSize = "50x40",
): Promise<OrderLabelPreview[]> => {
  const out: OrderLabelPreview[] = [];
  for (const o of orders) {
    const blob = await renderOrderLabel(o, size);
    const numero = String(o.short_number ?? o.id.slice(0, 8)).replace(/^#/, "");
    out.push({
      id: o.id,
      title: `#${numero} · ${o.alumno_nombre || ""}`.trim(),
      filename: `etiqueta-${slug(numero)}-${slug(o.alumno_nombre || "cliente")}.png`,
      blob,
      url: URL.createObjectURL(blob),
    });
  }
  return out;
};

export const printOrderNiimbotPreviews = async (
  previews: OrderLabelPreview[],
  size: OrderNiimbotSize = "50x40",
) => {
  const mm = SIZE_MM[size];
  await printImageBlobs(
    previews.map((p) => p.blob),
    { pageSize: `${mm.w}mm ${mm.h}mm`, title: "Etiquetas Niimbot" },
  );
};

export const downloadOrderNiimbotPreviews = async (
  previews: OrderLabelPreview[],
) => {
  if (previews.length === 1) {
    downloadFileBlob(previews[0].blob, previews[0].filename);
    return;
  }
  const zip = new JSZip();
  previews.forEach((p, i) =>
    zip.file(`${String(i + 1).padStart(3, "0")}_${p.filename}`, p.blob),
  );
  const blob = await zip.generateAsync({ type: "blob" });
  const stamp = new Date().toISOString().slice(0, 10);
  downloadFileBlob(blob, `etiquetas-niimbot-${stamp}-${previews.length}.zip`);
};
