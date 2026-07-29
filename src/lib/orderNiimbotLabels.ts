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
 * Genera un PNG por pedido, con el mismo criterio visual que las etiquetas
 * de producto: QR + datos clave, legible en 50×40mm.
 */

export type OrderNiimbotSize = "50x40" | "50x30" | "40x30";

const SIZE_MM: Record<OrderNiimbotSize, { w: number; h: number }> = {
  "50x40": { w: 50, h: 40 },
  "50x30": { w: 50, h: 30 },
  "40x30": { w: 40, h: 30 },
};

const PX_PER_MM = 12;

export interface OrderLabelPreview {
  id: string;
  title: string;
  filename: string;
  blob: Blob;
  url: string;
}

const truncate = (s: string, max: number) =>
  s.length > max ? s.slice(0, max - 1) + "…" : s;

const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);

const varText = (v: any): string => {
  if (!v) return "";
  if (typeof v === "string") return v;
  try {
    return Object.entries(v)
      .filter(([, val]) => val !== null && val !== "" && val !== undefined)
      .map(([, val]) => String(val))
      .join(" · ");
  } catch {
    return "";
  }
};

const itemLines = (p: PreorderLabelData): string[] => {
  const lines: string[] = [];
  if (Array.isArray(p.items) && p.items.length) {
    p.items.forEach((it: any) => {
      const nombre = it.producto_nombre || it.nombre || "Item";
      const v = varText(it.variante);
      lines.push(`${nombre}${v ? ` · ${v}` : ""}`);
    });
  } else {
    const v = varText(p.variante);
    lines.push(`${p.cantidad}× ${p.producto_nombre}${v ? ` · ${v}` : ""}`);
  }
  return lines;
};

const renderOrderLabel = async (
  p: PreorderLabelData,
  size: OrderNiimbotSize,
): Promise<Blob> => {
  const mm = SIZE_MM[size];
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

  const pad = Math.round(1.6 * PX_PER_MM);
  const numero = p.short_number ?? p.id.slice(0, 8).toUpperCase();

  // Header: #pedido
  const hSize = Math.round(3.4 * PX_PER_MM);
  ctx.font = `bold ${hSize}px system-ui, -apple-system, sans-serif`;
  ctx.fillText(`#${numero}`, pad, pad);

  ctx.font = `bold ${Math.round(1.9 * PX_PER_MM)}px system-ui, sans-serif`;
  ctx.fillText("REYBAUD", W - pad - ctx.measureText("REYBAUD").width, pad + 4);

  let y = pad + hSize + Math.round(1 * PX_PER_MM);
  ctx.fillRect(pad, y, W - pad * 2, 2);
  y += Math.round(1.2 * PX_PER_MM);

  // Cliente
  const cSize = Math.round(2.6 * PX_PER_MM);
  ctx.font = `bold ${cSize}px system-ui, sans-serif`;
  ctx.fillText(truncate(p.alumno_nombre || "—", 26), pad, y);
  y += cSize + Math.round(0.8 * PX_PER_MM);

  // QR abajo a la derecha
  const qrSize = Math.round(mm.h * 0.42 * PX_PER_MM);
  const qrX = W - pad - qrSize;
  const qrY = H - pad - qrSize;
  const senaConfirmada = p.estado_pago_sena === "confirmada";
  const pendiente = senaConfirmada
    ? Number(p.saldo_pendiente || 0)
    : Number(p.sena_monto || 0) + Number(p.saldo_pendiente || 0);
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

  // Items (a la izquierda del QR)
  const textMaxW = W - pad * 2 - qrSize - Math.round(1.5 * PX_PER_MM);
  const iSize = Math.round(2.1 * PX_PER_MM);
  ctx.font = `500 ${iSize}px system-ui, sans-serif`;
  const maxLines = size === "50x40" ? 4 : 2;
  itemLines(p)
    .slice(0, maxLines)
    .forEach((ln) => {
      let text = ln;
      while (ctx.measureText(text).width > textMaxW && text.length > 4) {
        text = text.slice(0, -2);
      }
      ctx.fillText(text === ln ? ln : text + "…", pad, y);
      y += iSize + 3;
    });

  // Saldo / pagado abajo a la izquierda
  const sSize = Math.round(2.6 * PX_PER_MM);
  ctx.font = `bold ${sSize}px system-ui, sans-serif`;
  ctx.textBaseline = "alphabetic";
  const bottomText =
    pendiente > 0
      ? `A COBRAR ${formatPrice(pendiente, p.moneda)}`
      : "PAGADO ✓";
  ctx.fillText(truncate(bottomText, 24), pad, H - pad);

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
    const numero = String(o.short_number ?? o.id.slice(0, 8));
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
