// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from "npm:pdf-lib@1.17.1";
import QRCode from "npm:qrcode@1.5.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const BUCKET = "facturas-pdf";
const APP_PORTAL_URL = "https://reybaud-app.com";
const BRAND_ORANGE = rgb(0xff / 255, 0x6b / 255, 0x1a / 255);
const TEXT_DARK = rgb(0.12, 0.12, 0.12);
const TEXT_MUTED = rgb(0.45, 0.45, 0.45);
const LINE = rgb(0.85, 0.85, 0.85);

interface Body {
  factura_id: string;
  force?: boolean;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { factura_id, force }: Body = await req.json();
    if (!factura_id) {
      return json({ error: "factura_id requerido" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: factura } = await supabase
      .from("facturas").select("*").eq("id", factura_id).single();
    if (!factura) return json({ error: "Factura no encontrada" }, 404);

    if (factura.pdf_path && !force) {
      const { data: signed } = await supabase.storage.from(BUCKET)
        .createSignedUrl(factura.pdf_path, 60 * 60 * 24 * 30);
      return json({ path: factura.pdf_path, signed_url: signed?.signedUrl, cached: true });
    }

    const { data: emisor } = factura.emisor_id
      ? await supabase.from("emisores_fiscales").select("*").eq("id", factura.emisor_id).single()
      : { data: null } as any;

    const { data: alumno } = factura.alumno_id
      ? await supabase.from("alumnos").select("nombre, apellido, documento, email").eq("id", factura.alumno_id).single()
      : { data: null } as any;

    // Build auto concept
    const concepto = await buildConcepto(supabase, factura);

    const pdfBytes = await renderInvoicePdf({ factura, emisor, alumno, concepto });

    const path = `${factura_id}.pdf`;
    const { error: upErr } = await supabase.storage.from(BUCKET)
      .upload(path, pdfBytes, { contentType: "application/pdf", upsert: true });
    if (upErr) {
      console.error("upload error", upErr);
      return json({ error: "Error al subir PDF" }, 500);
    }

    await supabase.from("facturas").update({
      pdf_path: path,
      pdf_generated_at: new Date().toISOString(),
    } as any).eq("id", factura_id);

    const { data: signed } = await supabase.storage.from(BUCKET)
      .createSignedUrl(path, 60 * 60 * 24 * 30);

    return json({ path, signed_url: signed?.signedUrl, cached: false });
  } catch (e) {
    console.error("generate-factura-pdf error", e);
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function buildConcepto(supabase: any, factura: any): Promise<string> {
  try {
    if (factura.referencia_tipo === "suscripcion" && factura.referencia_id) {
      const { data: sub } = await supabase
        .from("suscripciones")
        .select("fecha_inicio, planes(nombre)")
        .eq("id", factura.referencia_id)
        .maybeSingle();
      if (sub?.planes?.nombre) {
        const d = sub.fecha_inicio ? new Date(sub.fecha_inicio + "T00:00:00") : new Date();
        const mes = d.toLocaleDateString("es-AR", { month: "long", year: "numeric" });
        return `${sub.planes.nombre} — ${mes.charAt(0).toUpperCase() + mes.slice(1)}`;
      }
    }
    if (factura.referencia_tipo === "pedido") return "Compra Tienda Reybaud";
    if (factura.referencia_tipo === "evento" || factura.referencia_tipo === "viaje") {
      const { data: ev } = await supabase
        .from("eventos").select("nombre").eq("id", factura.referencia_id).maybeSingle();
      if (ev?.nombre) return `Inscripción ${ev.nombre}`;
    }
  } catch (_) { /* fallthrough */ }
  return factura.concepto || "Servicio";
}

async function renderInvoicePdf(args: {
  factura: any; emisor: any; alumno: any; concepto: string;
}): Promise<Uint8Array> {
  const { factura, emisor, alumno, concepto } = args;

  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]); // A4 portrait
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const W = page.getWidth();
  const margin = 40;
  let y = page.getHeight() - margin;

  // ===== TOP BAND =====
  page.drawRectangle({ x: 0, y: y - 8, width: W, height: 8, color: BRAND_ORANGE });

  // ===== HEADER (logo + emisor + comprobante box) =====
  y -= 30;
  const headerTop = y;

  // Logo
  let logoX = margin;
  if (emisor?.logo_url) {
    try {
      const logoBytes = new Uint8Array(await (await fetch(emisor.logo_url)).arrayBuffer());
      const isPng = emisor.logo_url.toLowerCase().includes(".png");
      const logo = isPng ? await doc.embedPng(logoBytes) : await doc.embedJpg(logoBytes);
      const maxW = 110, maxH = 60;
      const scale = Math.min(maxW / logo.width, maxH / logo.height);
      page.drawImage(logo, {
        x: margin, y: y - logo.height * scale, width: logo.width * scale, height: logo.height * scale,
      });
      logoX = margin + logo.width * scale + 14;
    } catch (e) { console.warn("logo fail", e); }
  }

  // Emisor info (left of center)
  let yEmisor = headerTop;
  drawText(page, emisor?.nombre_fiscal || "Razón social", logoX, yEmisor, bold, 13, TEXT_DARK);
  yEmisor -= 14;
  if (emisor?.cuit) { drawText(page, `CUIT: ${emisor.cuit}`, logoX, yEmisor, font, 9, TEXT_MUTED); yEmisor -= 11; }
  if (emisor?.condicion_iva) { drawText(page, emisor.condicion_iva, logoX, yEmisor, font, 9, TEXT_MUTED); yEmisor -= 11; }
  if (emisor?.ingresos_brutos) { drawText(page, `IIBB: ${emisor.ingresos_brutos}`, logoX, yEmisor, font, 9, TEXT_MUTED); yEmisor -= 11; }
  if (emisor?.domicilio_comercial) { drawText(page, emisor.domicilio_comercial, logoX, yEmisor, font, 9, TEXT_MUTED); yEmisor -= 11; }
  if (emisor?.inicio_actividades) {
    const d = new Date(emisor.inicio_actividades + "T00:00:00").toLocaleDateString("es-AR");
    drawText(page, `Inicio actividades: ${d}`, logoX, yEmisor, font, 9, TEXT_MUTED); yEmisor -= 11;
  }

  // Comprobante box (right)
  const boxW = 180, boxH = 96, boxX = W - margin - boxW, boxY = headerTop - boxH;
  page.drawRectangle({ x: boxX, y: boxY, width: boxW, height: boxH, borderColor: LINE, borderWidth: 1, color: rgb(0.99, 0.99, 0.99) });
  // Letter C
  page.drawRectangle({ x: boxX + boxW / 2 - 14, y: boxY + boxH - 32, width: 28, height: 24, borderColor: TEXT_DARK, borderWidth: 1 });
  drawText(page, "C", boxX + boxW / 2 - 7, boxY + boxH - 26, bold, 18, TEXT_DARK);
  drawText(page, "Cód. 011", boxX + boxW / 2 - 18, boxY + boxH - 42, font, 8, TEXT_MUTED);
  drawText(page, "FACTURA", boxX + 10, boxY + 36, bold, 12, TEXT_DARK);
  drawText(page, `Nº ${factura.numero_comprobante || "—"}`, boxX + 10, boxY + 22, font, 10, TEXT_DARK);
  const fEmis = factura.fecha_emision
    ? new Date(factura.fecha_emision).toLocaleDateString("es-AR")
    : new Date().toLocaleDateString("es-AR");
  drawText(page, `Fecha: ${fEmis}`, boxX + 10, boxY + 8, font, 9, TEXT_MUTED);

  y = Math.min(yEmisor, boxY) - 18;

  // Divider
  page.drawLine({ start: { x: margin, y }, end: { x: W - margin, y }, color: LINE, thickness: 0.5 });
  y -= 18;

  // ===== CLIENT =====
  drawText(page, "Cliente", margin, y, bold, 10, TEXT_DARK); y -= 14;
  const clienteName = alumno
    ? `${alumno.nombre}${alumno.apellido ? " " + alumno.apellido : ""}`
    : factura.cliente_nombre;
  drawText(page, clienteName, margin, y, font, 11, TEXT_DARK); y -= 12;
  const condFiscal = factura.condicion_fiscal === "consumidor_final" ? "Consumidor Final" : factura.condicion_fiscal;
  drawText(page, `Condición frente al IVA: ${condFiscal}`, margin, y, font, 9, TEXT_MUTED); y -= 11;
  if (factura.cliente_cuit || alumno?.documento) {
    const doc_ = factura.cliente_cuit || alumno?.documento;
    const docLabel = (doc_ || "").replace(/\D/g, "").length === 11 ? "CUIT" : "DNI";
    drawText(page, `${docLabel}: ${doc_}`, margin, y, font, 9, TEXT_MUTED); y -= 11;
  }
  if (alumno?.email) { drawText(page, `Email: ${alumno.email}`, margin, y, font, 9, TEXT_MUTED); y -= 11; }

  y -= 14;

  // ===== ITEMS TABLE =====
  const tableTop = y;
  // header
  page.drawRectangle({ x: margin, y: y - 18, width: W - 2 * margin, height: 18, color: rgb(0.96, 0.96, 0.96) });
  drawText(page, "Descripción", margin + 8, y - 13, bold, 9, TEXT_DARK);
  drawText(page, "Cant.", W - margin - 200, y - 13, bold, 9, TEXT_DARK);
  drawText(page, "P. Unit.", W - margin - 140, y - 13, bold, 9, TEXT_DARK);
  drawText(page, "Subtotal", W - margin - 70, y - 13, bold, 9, TEXT_DARK);
  y -= 18;

  // row
  y -= 22;
  const moneda = factura.moneda || "ARS";
  const monto = Number(factura.monto || 0);
  drawWrapped(page, concepto, margin + 8, y, font, 10, TEXT_DARK, W - 2 * margin - 220);
  drawText(page, "1", W - margin - 200, y, font, 10, TEXT_DARK);
  drawText(page, formatMoney(monto, moneda), W - margin - 140, y, font, 10, TEXT_DARK);
  drawText(page, formatMoney(monto, moneda), W - margin - 70, y, font, 10, TEXT_DARK);

  y -= 22;
  page.drawLine({ start: { x: margin, y }, end: { x: W - margin, y }, color: LINE, thickness: 0.5 });

  // ===== TOTALS =====
  y -= 22;
  drawText(page, "Importe Neto:", W - margin - 220, y, font, 10, TEXT_MUTED);
  drawText(page, formatMoney(monto, moneda), W - margin - 70, y, font, 10, TEXT_DARK);
  y -= 28;
  page.drawRectangle({ x: W - margin - 230, y: y - 6, width: 230, height: 26, color: rgb(0.98, 0.93, 0.86) });
  drawText(page, "TOTAL:", W - margin - 220, y + 4, bold, 12, TEXT_DARK);
  drawText(page, formatMoney(monto, moneda), W - margin - 70, y + 4, bold, 12, BRAND_ORANGE);

  // ===== AFIP FOOTER (CAE + QR) =====
  let footerY = 150;
  page.drawLine({ start: { x: margin, y: footerY + 90 }, end: { x: W - margin, y: footerY + 90 }, color: LINE, thickness: 0.5 });

  // QR
  if (factura.cae && emisor?.cuit && factura.numero_comprobante) {
    try {
      const qrPayload = buildAfipQrPayload({
        cuit: emisor.cuit.replace(/\D/g, ""),
        ptoVta: emisor.punto_venta,
        nroCmp: parseInt(factura.numero_comprobante.split("-")[1] || "0"),
        importe: monto,
        moneda: moneda === "ARS" ? "PES" : moneda,
        fecha: (factura.fecha_emision || new Date().toISOString()).split("T")[0],
        cae: factura.cae,
        tipoDocRec: (factura.cliente_cuit || "").replace(/\D/g, "").length === 11 ? 80 : (factura.cliente_cuit ? 96 : 99),
        nroDocRec: Number((factura.cliente_cuit || "0").replace(/\D/g, "")) || 0,
      });
      const qrDataUrl = await QRCode.toDataURL(qrPayload, { margin: 0, width: 220 });
      const qrBytes = Uint8Array.from(atob(qrDataUrl.split(",")[1]), c => c.charCodeAt(0));
      const qrImg = await doc.embedPng(qrBytes);
      page.drawImage(qrImg, { x: margin, y: footerY - 10, width: 90, height: 90 });
    } catch (e) { console.warn("qr fail", e); }
  }

  // CAE block
  const caeX = margin + 110;
  drawText(page, "CAE:", caeX, footerY + 70, bold, 10, TEXT_DARK);
  drawText(page, factura.cae || "—", caeX + 40, footerY + 70, font, 10, TEXT_DARK);
  drawText(page, "Vto. CAE:", caeX, footerY + 54, bold, 10, TEXT_DARK);
  drawText(page, factura.cae_vencimiento
    ? new Date(factura.cae_vencimiento + "T00:00:00").toLocaleDateString("es-AR")
    : "—", caeX + 60, footerY + 54, font, 10, TEXT_DARK);
  drawText(page, "Comprobante autorizado", caeX, footerY + 34, font, 8, TEXT_MUTED);
  drawText(page, "Régimen de Transparencia Fiscal al Consumidor (Ley 27.743)", caeX, footerY + 22, font, 7, TEXT_MUTED);

  // ===== CONTACT MESSAGE =====
  let msgY = 60;
  page.drawLine({ start: { x: margin, y: msgY + 32 }, end: { x: W - margin, y: msgY + 32 }, color: LINE, thickness: 0.3 });
  drawText(page, "¿Consultas? Ingresá al portal de la app:", margin, msgY + 18, font, 9, TEXT_MUTED);
  drawText(page, APP_PORTAL_URL, margin + 195, msgY + 18, bold, 9, BRAND_ORANGE);
  if (emisor?.telefono_contacto) {
    const wa = emisor.telefono_contacto.replace(/\D/g, "");
    drawText(page, `WhatsApp: +${wa}`, margin, msgY + 4, font, 9, TEXT_MUTED);
  }
  drawText(page, "Documento generado electrónicamente", W - margin - 180, msgY + 4, font, 7, TEXT_MUTED);

  return await doc.save();
}

function drawText(page: PDFPage, text: string, x: number, y: number, font: PDFFont, size: number, color: any) {
  page.drawText(text, { x, y, size, font, color });
}

function drawWrapped(page: PDFPage, text: string, x: number, y: number, font: PDFFont, size: number, color: any, maxWidth: number) {
  const words = text.split(" ");
  let line = "";
  let curY = y;
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (font.widthOfTextAtSize(test, size) > maxWidth) {
      drawText(page, line, x, curY, font, size, color);
      curY -= size + 2;
      line = w;
    } else { line = test; }
  }
  if (line) drawText(page, line, x, curY, font, size, color);
}

function formatMoney(n: number, moneda: string): string {
  const sym = moneda === "USD" ? "US$ " : moneda === "EUR" ? "€ " : "$ ";
  return sym + n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function buildAfipQrPayload(p: {
  cuit: string; ptoVta: number; nroCmp: number; importe: number; moneda: string;
  fecha: string; cae: string; tipoDocRec: number; nroDocRec: number;
}): string {
  const json = {
    ver: 1,
    fecha: p.fecha,
    cuit: Number(p.cuit),
    ptoVta: p.ptoVta,
    tipoCmp: 11,
    nroCmp: p.nroCmp,
    importe: Number(p.importe.toFixed(2)),
    moneda: p.moneda,
    ctz: 1,
    tipoDocRec: p.tipoDocRec,
    nroDocRec: p.nroDocRec,
    tipoCodAut: "E",
    codAut: Number(p.cae),
  };
  const b64 = btoa(JSON.stringify(json));
  return `https://www.afip.gob.ar/fe/qr/?p=${b64}`;
}
