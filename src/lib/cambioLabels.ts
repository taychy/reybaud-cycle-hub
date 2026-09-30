import QRCode from "qrcode";
import { downloadFileBlob, printImageBlobs } from "@/lib/printBlob";

export type CambioLabelSize = "50x40" | "50x30" | "40x30";

const SIZE_MM: Record<CambioLabelSize, { w: number; h: number }> = {
  "50x40": { w: 50, h: 40 },
  "50x30": { w: 50, h: 30 },
  "40x30": { w: 40, h: 30 },
};

const PX_PER_MM = 12;

export interface CambioLabelData {
  id: string;
  alumno_nombre: string;
  producto: string;
  variante?: string | null;
  sede?: string | null;
  order_number?: number | string | null;
}

export interface CambioLabelPreview {
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

const fitText = (
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxW: number,
  size: number,
  weight = "700",
) => {
  let px = size;
  ctx.font = `${weight} ${px}px system-ui, -apple-system, sans-serif`;
  while (ctx.measureText(text).width > maxW && px > 10) {
    px -= 1;
    ctx.font = `${weight} ${px}px system-ui, -apple-system, sans-serif`;
  }
  let out = text;
  while (ctx.measureText(out).width > maxW && out.length > 4) out = out.slice(0, -2);
  ctx.fillText(out === text ? text : out + "…", x, y);
};

const renderCambioLabel = async (data: CambioLabelData, size: CambioLabelSize): Promise<Blob> => {
  const mm = SIZE_MM[size];
  const W = Math.round(mm.w * PX_PER_MM);
  const H = Math.round(mm.h * PX_PER_MM);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo generar la etiqueta.");

  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#000";
  ctx.textBaseline = "top";

  const pad = Math.round(1.5 * PX_PER_MM);
  const qrSize = Math.min(H - pad * 2, Math.round(20 * PX_PER_MM));
  const qrX = W - pad - qrSize;
  const qrY = H - pad - qrSize;
  const textW = qrX - pad - Math.round(1.2 * PX_PER_MM);

  const qr = document.createElement("canvas");
  await QRCode.toCanvas(qr, `RBCAM1:${data.id}`, {
    width: qrSize,
    margin: 0,
    errorCorrectionLevel: "M",
  });
  ctx.drawImage(qr, qrX, qrY, qrSize, qrSize);

  const titlePx = Math.round(4.3 * PX_PER_MM);
  ctx.font = `900 ${titlePx}px system-ui, -apple-system, sans-serif`;
  ctx.fillText("CAMBIO", pad, pad);

  const refPx = Math.round(1.9 * PX_PER_MM);
  ctx.font = `700 ${refPx}px system-ui, -apple-system, sans-serif`;
  const ref = data.order_number ? `PEDIDO #${data.order_number} · REYBAUD` : "REYBAUD";
  ctx.fillText(ref, pad, pad + titlePx + 2);

  let y = pad + titlePx + refPx + Math.round(1.2 * PX_PER_MM);
  const cliPx = Math.round(3.0 * PX_PER_MM);
  fitText(ctx, data.alumno_nombre.toUpperCase(), pad, y, textW, cliPx, "800");
  y += cliPx + 4;

  const prodPx = Math.round(2.5 * PX_PER_MM);
  fitText(ctx, data.producto.toUpperCase(), pad, y, textW, prodPx, "800");
  y += prodPx + 4;

  if (data.variante) {
    const varPx = Math.round(2.7 * PX_PER_MM);
    fitText(ctx, data.variante.toUpperCase(), pad, y, textW, varPx, "900");
    y += varPx + 4;
  }

  if (data.sede) {
    const sedePx = Math.round(2.1 * PX_PER_MM);
    fitText(ctx, `SEDE: ${data.sede.toUpperCase()}`, pad, y, textW, sedePx, "800");
  }

  ctx.font = `700 ${Math.round(1.5 * PX_PER_MM)}px ui-monospace, monospace`;
  ctx.textBaseline = "alphabetic";
  ctx.fillText("ESCANEAR CAMBIO", qrX, H - Math.round(0.6 * PX_PER_MM));

  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("No se pudo generar la etiqueta."))),
      "image/png",
    ),
  );
};

export const buildCambioLabelPreview = async (
  data: CambioLabelData,
  size: CambioLabelSize = "50x40",
): Promise<CambioLabelPreview> => {
  const blob = await renderCambioLabel(data, size);
  const num = data.order_number ? `pedido-${data.order_number}` : data.id.slice(0, 8);
  const filename = `cambio-${slug(String(num))}-${slug(data.alumno_nombre)}.png`;
  return {
    id: data.id,
    title: data.order_number ? `Cambio · Pedido #${data.order_number}` : "Cambio",
    filename,
    blob,
    url: URL.createObjectURL(blob),
  };
};

export const downloadCambioLabel = (preview: CambioLabelPreview) => {
  downloadFileBlob(preview.blob, preview.filename);
};

export const printCambioLabel = async (
  preview: CambioLabelPreview,
  size: CambioLabelSize,
) => {
  const mm = SIZE_MM[size];
  await printImageBlobs([preview.blob], {
    pageSize: `${mm.w}mm ${mm.h}mm`,
    title: "Etiqueta de cambio",
  });
};
