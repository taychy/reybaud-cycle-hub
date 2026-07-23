import QRCode from "qrcode";
import JSZip from "jszip";
import { supabase } from "@/integrations/supabase/client";
import { buildSku } from "@/lib/productLabels";

/**
 * Etiquetas para impresora Niimbot (rollos térmicos ~40×30mm).
 *
 * Genera PNGs individuales que se importan desde la app Niimbot para imprimir.
 * Cada etiqueta incluye:
 *  - QR grande escaneable (valor = SKU interno del producto+variante)
 *  - Nombre del producto
 *  - Talle / variante
 *  - Texto del SKU (para lectura humana)
 *
 * El código del QR se registra automáticamente en `product_barcodes`
 * (origen "interno") para que aparezca al escanear en Control de Ingreso.
 */

export interface NiimbotLabelInput {
  product_id: string;
  product_name: string;
  sku_base: string | null;
  variant_key: string | null; // "Talle:XL|Color:Negro"
  variante: Record<string, string> | null; // objeto para persistir en product_barcodes
  copies?: number;
}

// Tamaños comunes de rollos Niimbot en mm
export type NiimbotSize = "40x30" | "50x30" | "50x40";

const SIZE_MM: Record<NiimbotSize, { w: number; h: number }> = {
  "40x30": { w: 40, h: 30 },
  "50x30": { w: 50, h: 30 },
  "50x40": { w: 50, h: 40 },
};

// Render density: la mayoría de las Niimbot son ~203 DPI (~8 dots/mm).
// Usamos 12 px/mm para tener margen y que el QR quede nítido.
const PX_PER_MM = 12;

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

const truncate = (s: string, max: number) => (s.length > max ? s.slice(0, max - 1) + "…" : s);

const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

/** Dibuja una etiqueta en un canvas y devuelve un blob PNG. */
const renderLabelPng = async (
  label: NiimbotLabelInput & { sku: string },
  size: NiimbotSize,
): Promise<Blob> => {
  const mm = SIZE_MM[size];
  const W = Math.round(mm.w * PX_PER_MM);
  const H = Math.round(mm.h * PX_PER_MM);

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // Fondo blanco
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  // Layout: QR a la izquierda ocupando ~ el alto de la etiqueta,
  // textos a la derecha.
  const pad = Math.round(2 * PX_PER_MM); // 2mm padding
  const qrSize = H - pad * 2;
  const qrX = pad;
  const qrY = pad;

  // QR
  try {
    const qrDataUrl = await QRCode.toDataURL(label.sku, {
      margin: 0,
      width: qrSize,
      errorCorrectionLevel: "M",
      color: { dark: "#000000", light: "#ffffff" },
    });
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = reject;
      img.src = qrDataUrl;
    });
    ctx.drawImage(img, qrX, qrY, qrSize, qrSize);
  } catch (err) {
    console.warn("QR error", err);
  }

  // Textos
  const textX = qrX + qrSize + Math.round(1.5 * PX_PER_MM);
  const textMaxW = W - textX - pad;

  ctx.fillStyle = "#000000";
  ctx.textBaseline = "top";

  // Marca chica arriba
  const brandSize = Math.round(2.2 * PX_PER_MM);
  ctx.font = `bold ${brandSize}px system-ui, -apple-system, sans-serif`;
  ctx.fillText("REYBAUD", textX, pad);

  // Nombre producto (wrap 2 lineas)
  const nameSize = Math.round(2.8 * PX_PER_MM);
  ctx.font = `bold ${nameSize}px system-ui, -apple-system, sans-serif`;
  const nameY = pad + brandSize + Math.round(1 * PX_PER_MM);
  const words = truncate(label.product_name, 60).split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const tryLine = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(tryLine).width > textMaxW && cur) {
      lines.push(cur);
      cur = w;
      if (lines.length >= 2) break;
    } else {
      cur = tryLine;
    }
  }
  if (cur && lines.length < 2) lines.push(cur);
  lines.slice(0, 2).forEach((ln, i) => {
    ctx.fillText(ln, textX, nameY + i * (nameSize + 2));
  });

  // Variante grande (talle)
  const variant = variantPretty(label.variant_key);
  const variantY = nameY + Math.min(lines.length, 2) * (nameSize + 2) + Math.round(1 * PX_PER_MM);
  if (variant) {
    const vSize = Math.round(3.2 * PX_PER_MM);
    ctx.font = `bold ${vSize}px system-ui, -apple-system, sans-serif`;
    ctx.fillText(truncate(variant, 22), textX, variantY);
  }

  // SKU (texto humano al pie, monospace)
  const skuSize = Math.round(2 * PX_PER_MM);
  ctx.font = `bold ${skuSize}px ui-monospace, "SF Mono", Menlo, monospace`;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(label.sku, qrX, H - pad + Math.round(0.5 * PX_PER_MM));

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob returned null"))),
      "image/png",
    );
  });
};

const triggerDownload = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 30000);
};

/** Registra el SKU como código escaneable en product_barcodes (idempotente). */
const registerBarcode = async (label: NiimbotLabelInput & { sku: string }) => {
  try {
    const { data: existing } = await (supabase as any)
      .from("product_barcodes")
      .select("id")
      .eq("codigo", label.sku)
      .maybeSingle();
    if (existing) return;
    const { data: userRes } = await supabase.auth.getUser();
    await (supabase as any).from("product_barcodes").insert({
      codigo: label.sku,
      store_product_id: label.product_id,
      variante: label.variante || {},
      origen: "interno",
      created_by: userRes.user?.id ?? null,
    });
  } catch (err) {
    // no bloqueamos la impresión si falla el registro
    console.warn("registerBarcode error", err);
  }
};

export interface PrintNiimbotOptions {
  size?: NiimbotSize;
  filenameHint?: string; // ej. "campera-termica"
  /**
   * "label"       → PNG del tamaño del rollo, listo para imprimir desde la app Niimbot.
   * "scan-source" → PNG grande con QR gigante + SKU en texto, pensado para que la
   *                 app Niimbot lo escanee desde la pantalla/papel y COPIE el código
   *                 a una etiqueta nueva en la app.
   */
  mode?: "label" | "scan-source";
}

/**
 * Genera un PNG "fuente" con QR muy grande y quiet zone amplia, pensado
 * para que la app Niimbot pueda escanearlo con la cámara del celular y
 * copiar el código a una etiqueta nueva.
 */
const renderScanSourcePng = async (
  label: NiimbotLabelInput & { sku: string },
): Promise<Blob> => {
  const W = 900;
  const H = 1100;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  // QR grande, centrado, con error correction alto para tolerar reflejos.
  const qrSize = 760;
  const qrX = Math.round((W - qrSize) / 2);
  const qrY = 90;
  try {
    const qrDataUrl = await QRCode.toDataURL(label.sku, {
      margin: 2,
      width: qrSize,
      errorCorrectionLevel: "H",
      color: { dark: "#000000", light: "#ffffff" },
    });
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = reject;
      img.src = qrDataUrl;
    });
    ctx.drawImage(img, qrX, qrY, qrSize, qrSize);
  } catch (err) {
    console.warn("QR error", err);
  }

  ctx.fillStyle = "#000000";
  ctx.textBaseline = "top";
  ctx.textAlign = "center";

  // SKU grande y monoespaciado (respaldo humano)
  ctx.font = `bold 64px ui-monospace, "SF Mono", Menlo, monospace`;
  ctx.fillText(label.sku, W / 2, qrY + qrSize + 30);

  // Nombre + variante debajo
  ctx.font = `500 34px system-ui, -apple-system, sans-serif`;
  const variant = variantPretty(label.variant_key);
  const subtitle = [truncate(label.product_name, 40), variant].filter(Boolean).join(" · ");
  if (subtitle) ctx.fillText(subtitle, W / 2, qrY + qrSize + 110);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob returned null"))),
      "image/png",
    );
  });
};

/**
 * Genera un PNG por etiqueta. Si es 1 sola → descarga PNG.
 * Si son varias → descarga un .zip con todas.
 * Además registra los SKUs en product_barcodes para que se puedan escanear.
 */
export const printNiimbotLabels = async (
  labels: NiimbotLabelInput[],
  opts: PrintNiimbotOptions = {},
): Promise<{ total: number; registered: string[] }> => {
  const size = opts.size || "40x30";
  const mode = opts.mode || "label";
  const render = (l: NiimbotLabelInput & { sku: string }) =>
    mode === "scan-source" ? renderScanSourcePng(l) : renderLabelPng(l, size);
  const suffix = mode === "scan-source" ? "-fuente" : "";

  const expanded: (NiimbotLabelInput & { sku: string })[] = [];
  labels.forEach((l) => {
    const sku = buildSku(l.sku_base, l.variant_key);
    // En modo fuente escaneable, 1 PNG por SKU alcanza (la app lo copia N veces).
    const copies = mode === "scan-source" ? 1 : Math.max(1, l.copies || 1);
    for (let i = 0; i < copies; i++) expanded.push({ ...l, sku });
  });

  // Registrar barcodes únicos (una vez cada uno)
  const uniqueByCode = new Map<string, NiimbotLabelInput & { sku: string }>();
  expanded.forEach((l) => uniqueByCode.set(l.sku, l));
  await Promise.all([...uniqueByCode.values()].map(registerBarcode));

  // En modo fuente, deduplicamos por SKU (no tiene sentido repetir la misma imagen)
  const toRender = mode === "scan-source" ? [...uniqueByCode.values()] : expanded;

  if (toRender.length === 1) {
    const blob = await render(toRender[0]);
    triggerDownload(
      blob,
      `${opts.filenameHint ? slug(opts.filenameHint) + "-" : ""}${slug(toRender[0].sku)}${suffix}.png`,
    );
    return { total: 1, registered: [...uniqueByCode.keys()] };
  }

  const zip = new JSZip();
  const counters = new Map<string, number>();
  for (let i = 0; i < toRender.length; i++) {
    const l = toRender[i];
    const blob = await render(l);
    const n = (counters.get(l.sku) || 0) + 1;
    counters.set(l.sku, n);
    const name = `${String(i + 1).padStart(3, "0")}_${slug(l.sku)}${suffix}_${n}.png`;
    zip.file(name, blob);
  }
  const zipBlob = await zip.generateAsync({ type: "blob" });
  const stamp = new Date().toISOString().slice(0, 10);
  triggerDownload(
    zipBlob,
    `etiquetas-niimbot${suffix}-${opts.filenameHint ? slug(opts.filenameHint) + "-" : ""}${stamp}-${toRender.length}.zip`,
  );
  return { total: toRender.length, registered: [...uniqueByCode.keys()] };
};
