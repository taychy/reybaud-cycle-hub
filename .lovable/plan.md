# Auditoría ARCA: consulta de CUIT (solo lectura, sin cambios)

## 1) Funciones/archivos relacionados
- Facturación: `emit-factura-afip`, `emit-nota-credito-afip`, `auto-facturar`, `facturacion-auto-worker`, `generate-factura-pdf`, `send-factura-email`, `_shared/facturacion-emision.ts`, `_shared/fiscal-identity.ts`, tabla `afip_wsaa_tickets`.
- Padrón/CUIT: `consultar-padron-afip` (existía desde 02/06/2026, último cambio 22/09) y `validar-cuit-arca` (creada hoy 06/10).
- Frontend: `BillingDataSelfSection.tsx` (alumno) invoca `consultar-padron-afip`; `ManageStudents.tsx` (admin) invoca `validar-cuit-arca`. Lógica local: `fiscalIdentity.ts`, `documentoAlumno.ts`.

## 2) Consulta de padrón previa
- Sí existía: `consultar-padron-afip`, servicio **`ws_sr_padron_a13`** (endpoint `personaServiceA13`), no constancia de inscripción.
- Devuelve nombre/razón social, condición fiscal y domicilio.
- **Escribe en alumnos** si recibe `alumno_id` (dueño o admin): `documento`, `tipo_documento='cuit'`, `nombre_fiscal`, `condicion_fiscal`, `domicilio_fiscal`, `afip_verificado_at`, `afip_padron_snapshot`.
- Se usa desde los datos de facturación del alumno.

## 3) Certificados
Los 3 emisores (Scarlett, Claudio, Josilene) están activos con certificado y clave cargados, y se usan en producción: 84, 189 y 61 facturas con CAE.

## 4) Antes / ahora / faltante
- Antes: facturación WSAA/WSFE operativa y consulta de padrón A13 conectada al alumno.
- Agregado hoy: `validar-cuit-arca` (constancia, solo lectura, admin), UI en la ficha y TA reutilizable para WSFE.
- Duplicación: hay dos consultas de padrón con servicios distintos.
- Faltante real: autorización del certificado en ARCA para `ws_sr_constancia_inscripcion`. Falta confirmar si A13 sí está autorizado (no se probó hoy).

## 5) "Computador no autorizado a acceder al servicio"
Es un error de WSAA al pedir el ticket: el certificado no tiene relación con ese nombre de servicio. No es un problema de endpoint (el error ocurre antes de llamar al padrón). El nombre `ws_sr_constancia_inscripcion` y el endpoint `personaServiceA5` son los oficiales. Si A13 funciona, la falta de autorización es solo del servicio nuevo.

## Siguiente paso propuesto (requiere aprobación)
1. Probar con un solo CUIT si `consultar-padron-afip` (A13) sigue respondiendo, sin `alumno_id` para no escribir datos.
2. Si responde: hacer que la ficha admin reutilice A13 en modo lectura (sin escribir) y eliminar la duplicación. Si no: habilitar en ARCA el servicio de constancia para un certificado.
