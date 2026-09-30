/**
 * Etiquetas operativas fijas para Depósito.
 *
 * Se generan en el navegador como PNG para poder importarlas directamente
 * en la app Niimbot sin depender de archivos externos.
 */

const PX_PER_MM = 12;

const canvasToPngBlob = (canvas: HTMLCanvasElement): Promise<Blob> =>
  new Promise((resolve, reject) => {
    const fallback = () => {
      try {
        const dataUrl = canvas.toDataURL("image/png");
        const [, encoded = ""] = dataUrl.split(",");
        const binary = atob(encoded);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        resolve(new Blob([bytes], { type: "image/png" }));
      } catch (err) {
        reject(err);
      }
    };

    if (typeof canvas.toBlob !== "function") {
      fallback();
      return;
    }

    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else fallback();
    }, "image/png");
  });

const triggerDownload = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 30000);
};

/**
 * Descarga la etiqueta fija para cambios en formato Niimbot 40×30 mm.
 *
 * Texto:
 * IMPORTANTE
 * SIN CAMBIO
 * SI SE RETIRA
 * LA ETIQUETA
 * O SE PRUEBA
 * TRANSPIRADO
 */
export const downloadNoCambioNiimbotLabel = async (): Promise<void> => {
  const widthMm = 40;
  const heightMm = 30;
  const W = Math.round(widthMm * PX_PER_MM);
  const H = Math.round(heightMm * PX_PER_MM);

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo generar la etiqueta.");

  // Fondo blanco
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  // Borde
  const border = Math.round(0.45 * PX_PER_MM);
  const radius = Math.round(1.8 * PX_PER_MM);
  const margin = Math.round(1 * PX_PER_MM);
  const x = margin;
  const y = margin;
  const w = W - margin * 2;
  const h = H - margin * 2;

  ctx.strokeStyle = "#000000";
  ctx.lineWidth = border;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
  ctx.stroke();

  const lines = [
    { text: "IMPORTANTE", sizeMm: 4.2 },
    { text: "SIN CAMBIO", sizeMm: 3.5 },
    { text: "SI SE RETIRA", sizeMm: 3.15 },
    { text: "LA ETIQUETA", sizeMm: 3.15 },
    { text: "O SE PRUEBA", sizeMm: 3.15 },
    { text: "TRANSPIRADO", sizeMm: 3.15 },
  ];

  const innerTop = Math.round(2.1 * PX_PER_MM);
  const innerBottom = Math.round(1.5 * PX_PER_MM);
  const availableH = H - innerTop - innerBottom;
  const lineGap = Math.round(0.55 * PX_PER_MM);

  const fontPx = lines.map((line) => Math.round(line.sizeMm * PX_PER_MM));
  const textH = fontPx.reduce((sum, size) => sum + size, 0) + lineGap * (lines.length - 1);
  let currentY = innerTop + Math.max(0, Math.round((availableH - textH) / 2));

  ctx.fillStyle = "#000000";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  for (let i = 0; i < lines.length; i++) {
    let size = fontPx[i];
    const maxWidth = W - Math.round(4 * PX_PER_MM);

    // Reducir sólo si alguna línea no entra.
    do {
      ctx.font = `900 ${size}px Arial, Helvetica, sans-serif`;
      if (ctx.measureText(lines[i].text).width <= maxWidth || size <= 20) break;
      size -= 1;
    } while (size > 20);

    ctx.fillText(lines[i].text, W / 2, currentY);
    currentY += size + lineGap;
  }

  const blob = await canvasToPngBlob(canvas);
  triggerDownload(blob, "reybaud-sin-cambio-niimbot-40x30.png");
};
