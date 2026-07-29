/**
 * Utilidades para mandar algo directo a la impresora (sin descargar).
 * Usa un iframe oculto: evita el bloqueo de popups de window.open.
 */

const withHiddenIframe = (
  setup: (iframe: HTMLIFrameElement) => void,
  cleanupDelay = 60000,
) => {
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.style.opacity = "0";
  document.body.appendChild(iframe);
  setup(iframe);
  window.setTimeout(() => {
    if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
  }, cleanupDelay);
};

const triggerIframePrint = (iframe: HTMLIFrameElement) => {
  try {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
  } catch (err) {
    console.warn("print error", err);
  }
};

/** Abre el diálogo de impresión del sistema con un PDF ya generado. */
export const printPdfBlob = (blob: Blob) => {
  const url = URL.createObjectURL(blob);
  withHiddenIframe((iframe) => {
    iframe.onload = () => window.setTimeout(() => triggerIframePrint(iframe), 250);
    iframe.src = url;
  });
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
};

/** Descarga un blob con un nombre de archivo. */
export const downloadFileBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 30000);
};

interface PrintImagesOptions {
  /** Tamaño de página (por ej. "50mm 40mm" para rollos Niimbot). */
  pageSize?: string;
  title?: string;
}

/** Manda una o varias imágenes (PNG) a la impresora, una por página. */
export const printImageBlobs = async (
  blobs: Blob[],
  opts: PrintImagesOptions = {},
) => {
  if (!blobs.length) return;
  const urls = blobs.map((b) => URL.createObjectURL(b));
  const pageSize = opts.pageSize || "auto";
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${
    opts.title || "Etiquetas"
  }</title><style>
    @page { size: ${pageSize}; margin: 0; }
    html, body { margin: 0; padding: 0; background: #fff; }
    .page { page-break-after: always; display: flex; align-items: center; justify-content: center; }
    .page:last-child { page-break-after: auto; }
    img { max-width: 100%; max-height: 100vh; display: block; }
  </style></head><body>${urls
    .map((u) => `<div class="page"><img src="${u}" /></div>`)
    .join("")}</body></html>`;

  withHiddenIframe((iframe) => {
    iframe.onload = () => window.setTimeout(() => triggerIframePrint(iframe), 400);
    iframe.srcdoc = html;
  });
  window.setTimeout(() => urls.forEach((u) => URL.revokeObjectURL(u)), 60000);
};
