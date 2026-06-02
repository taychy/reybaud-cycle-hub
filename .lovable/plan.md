# Sistema de PDF + Email de facturas

## Resumen
Cuando AFIP aprueba el CAE, se genera automáticamente un PDF moderno de la factura, se guarda en storage y se envía por email al alumno con link al portal y a WhatsApp. Admin podrá descargar y reenviar desde el panel.

## 1. Datos del emisor (migration)
Agregar a `emisores_fiscales`:
- `logo_url` (text) — logo subido por admin
- `domicilio_comercial` (text)
- `condicion_iva` (text) — default `'Monotributista'`
- `inicio_actividades` (date)
- `email_contacto` (text)
- `telefono_contacto` (text)
- `website` (text, opcional)

UI: panel admin de emisores con upload de logo (bucket público `emisor-logos`) y form para los campos nuevos.

## 2. Storage
- Bucket público `emisor-logos` (logos de emisores)
- Bucket privado `facturas-pdf` con políticas: admin lee todo, alumno lee solo sus facturas vía signed URLs generadas por edge function.

## 3. Edge function `generate-factura-pdf`
- Input: `factura_id`
- Lee `facturas` + `emisores_fiscales` + `alumnos` + datos de la referencia (suscripcion/pedido/evento) para armar concepto automático tipo `"Plan Mensual Grupal — Junio 2026"`.
- Usa **pdf-lib** (Deno compatible) para renderizar layout moderno A4:
  - Header: logo + razón social + CUIT + IIBB + domicilio + condición IVA + inicio actividades
  - Bloque "FACTURA C" + Nº comprobante + fecha + código (011)
  - Datos del cliente (nombre, doc, condición fiscal "Consumidor Final")
  - Tabla de ítems (1 línea con concepto auto-generado + cantidad 1 + precio + subtotal)
  - Totales (Importe Neto, Total)
  - Footer AFIP: CAE + vencimiento + Ley 27.743 + QR oficial AFIP (JSON base64 con ver/fecha/cuit/ptoVta/tipoCmp/nroCmp/importe/moneda/ctz/tipoDocRec/nroDocRec/tipoCodAut/codAut)
  - Mensaje al cliente: "Accedé a tu portal: reybaud-app.com · WhatsApp: {telefono_contacto del emisor}"
- Sube PDF a `facturas-pdf/{factura_id}.pdf`
- Guarda en columna nueva `facturas.pdf_path`
- Devuelve `{ path, signed_url }`

## 4. Edge function `send-factura-email`
- Input: `factura_id`
- Resuelve email del alumno (`alumnos.email` o auth.users).
- Genera signed URL del PDF (válida 30 días) o lo regenera si falta.
- Llama `enqueue_email` (cola `transactional_emails`) con HTML branded (oscuro+naranja como la app):
  - Subject: `Tu factura {numero_comprobante} de Reybaud Ciclismo`
  - Body: saludo + resumen (concepto + total + CAE) + botón "Descargar PDF" + botón "Ir al portal" + link WhatsApp.

## 5. Auto-dispatch
- Al final de `emit-factura-afip`, cuando el update con CAE es exitoso: `fetch` a `generate-factura-pdf` y luego a `send-factura-email` (fire-and-forget con `EdgeRuntime.waitUntil`, no bloquea respuesta).

## 6. UI admin (`BillingList.tsx`)
Por cada factura `emitida` con CAE agregar dos botones secundarios:
- **Descargar PDF** → llama `generate-factura-pdf` si no existe y abre signed URL en pestaña nueva.
- **Reenviar email** → llama `send-factura-email`, toast confirmación.

## 7. UI alumno (`StudentPayments.tsx`)
Al lado de cada pago con factura emitida, botón "Descargar factura" que abre signed URL.

## Detalles técnicos
- pdf-lib via `npm:pdf-lib@1.17.1`
- QR via `npm:qrcode@1.5.3` (genera PNG buffer → embed en PDF)
- Concepto auto-armado:
  - `referencia_tipo='suscripcion'` → lee plan + período → `"Plan {nombre} — {Mes Año}"`
  - `referencia_tipo='pedido'` → `"Compra Tienda Reybaud"`
  - `referencia_tipo='evento'/'viaje'` → `"Inscripción {nombre_evento}"`
  - fallback: `factura.concepto` actual
- Email HTML con fondo blanco (regla email infra) pero acento naranja Reybaud (#FF6B1A).
- Idempotencia: si `pdf_path` ya existe, `generate-factura-pdf` reusa salvo `force=true`.

## Archivos a tocar
- Migration: `add_emisor_branding_and_factura_pdf.sql` (columnas + 2 buckets + políticas)
- `supabase/functions/generate-factura-pdf/index.ts` (nuevo)
- `supabase/functions/send-factura-email/index.ts` (nuevo)
- `supabase/functions/emit-factura-afip/index.ts` (hook al final)
- `supabase/config.toml` (verify_jwt=false para las 2 nuevas, autenticadas internamente)
- `src/pages/admin/billing/BillingEmisores.tsx` (form + upload logo)
- `src/pages/admin/billing/BillingList.tsx` (botones PDF/Reenviar)
- `src/pages/StudentPayments.tsx` (botón descargar factura)

¿Avanzo con todo esto, o querés ajustar algo antes (por ejemplo dejar fuera la UI del alumno o el upload de logo para una segunda iteración)?
