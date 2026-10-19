# Reprogramación San Luis · Primera versión segura

## Alcance
Implementar en Reybaud una elección real y editable por reserva, registro administrativo, estados e historial. Acceso público desactivado y operaciones financieras bloqueadas hasta revisión. No publicar, desplegar funciones, enviar mensajes ni modificar reservas, pagos, términos, fechas, paquetes o habitaciones existentes.

## Auditoría confirmada · 19/10/2026
- 32 reservas confirmadas y 8 canceladas.
- Tres transferencias existentes: en reventa, acuerdo definido y acuerdo pendiente; conservarlas.
- Octubre sigue publicado/activo con fechas **22–25/10/2026**. Mostrar la propuesta **5–9/11/2026** sólo dentro del nuevo módulo, sin modificar el evento.
- Cinco paquetes inactivos con precios actuales $75.000 o $75.293: requieren revisión antes de cotizar o vender modalidades nuevas.
- Enero sigue en borrador con fechas **17–24/01/2027**, distintas de la comunicación previa **20–27/01**; no cambiarlas.
- Hay tokens personales, acceso por sesión, encuestas Clasique con fuentes administrativas separadas, devoluciones y pagos directos fuera de caja Reybaud.

## 1. Elección y confirmación
- Seis opciones sin preselección: 5–8/11 (3 noches), 6–9/11 (3 noches), 5–9/11 (4 noches), devolución, crédito para otro Training Camp o ayuda.
- Link individual seguro y acceso desde Mis Reservas, visibles al participante sólo al habilitar el módulo.
- Token personal existente o sesión/OTP verificada; sin búsqueda por email arbitrario ni exposición de terceros. Reutilizar ingreso y retorno seguro.
- Confirmación y consentimiento versionado: es una **solicitud**, no cancela, libera cupos ni ejecuta dinero.
- Fecha/hora, origen, estado, actor e historial; edición con idempotencia y control de concurrencia.
- Página estilo Reybaud para móvil/escritorio, estado de confirmación y consulta opcional a WhatsApp escuela. Sin mensajes automáticos.

## 2. Política especial y jersey
- Por cambio organizado: **100% efectivamente abonado menos reintegros previos, sin penalidad**; no modificar el motor de cancelación voluntaria.
- Separar pagos a Reybaud, pagos directos efectuados y reintegros directos recibidos. Transferencias o monedas ambiguas quedan **pendientes de conciliación**, sin prometer un importe ejecutable ni negar derechos.
- Sólo para devolución/crédito: jersey optativo **$50.000 ARS**, Sí/No sin preselección; dejar la pregunta sin contestar no autoriza deducción.
- Mostrar abonado, reintegros previos, jersey condicionado y neto estimado. No conserva el 100%.
- Si elige Sí: confirmar/corregir talle usando encuesta y fuente administrativa, conservando discrepancias; retiro o envío y consentimiento específico.
- Sin descuento hasta validar stock, talle, entrega, consentimiento y saldo suficiente. Envío adicional sólo informado y aprobado; nunca cargo automático. No inventar stock ni plazos.
- Crédito nominal ARS para otro Training Camp, uso parcial/remanente, sin indexación ni vencimiento definido. Sin inventar plazo de reintegro.

## 3. Gestión administrativa
- Integrar **Reprogramación San Luis** en Gestión de reservas, reutilizando las pantallas existentes.
- Contadores/filtros por elección, respuesta, revisión, jersey y conciliación; respuesta por persona, modalidad/noches, importes y fuentes, talle/entrega, notas y fechas.
- Registro en nombre del participante con fuente, nota y constancia del consentimiento comunicado; no sembrar respuestas.
- Estados de solicitud separados de devolución/crédito real. Pendientes y cumplidos desde registros reales; disponible/usado sólo si existen movimientos reales.
- Historial y CSV sin tokens ni datos bancarios, protegido contra fórmulas.
- Cupos potencialmente liberables y reemplazos por evaluar con modalidad 3/4 noches, no sólo paquete. No cancelar, liberar ni emparejar automáticamente.

## 4. Andamiaje financiero bloqueado
- Registro comercial separado de notas de crédito fiscales, por beneficiario y reserva fuente, con emisión/aplicación/reversión e idempotencia.
- Libro mayor protegido, sin escritura directa: restricciones de doble emisión y saldo, referencias conciliables y bloqueo transaccional para futuras operaciones.
- **Deshabilitar** emisión, aplicación, reversión, devolución, compra de jersey y ejecución de reemplazos hasta probar su integración completa. No crear saldos gastables, obligaciones financieras ni movimientos de cuenta corriente en esta versión.
- Nunca llamar `start_reservation_transfer` al responder: cancela y libera habitación inmediatamente. Pagos directos supervisados requieren consentimiento/comprobante y caja Reybaud $0.

## Detalles técnicos
- Configuración reutilizable por evento separada de fechas y términos históricos; interruptor público apagado por defecto.
- Cambios aditivos mínimos: configuración, solicitudes, historial y andamiaje del libro mayor referenciados a reservas existentes.
- RLS permisiva y GRANT explícitos; roles servidor mediante `has_role(..., 'admin')` / `is_super_admin`, nunca cast de super_admin a app_role.
- Escrituras sólo por funciones servidoras con validación de identidad, pertenencia, estado, activación, consentimiento y opciones. Montos calculados en servidor, nunca confiados al cliente.
- Snapshots acotados de condiciones y resumen económico al responder; historial sin credenciales; control de versiones y concurrencia.
- Ruta independiente `/reprogramacion/:eventId`, sin tocar `/encuesta/:token` ni `/encuesta-talles/:slug`.
- Reversión operativa por desactivación; ningún cambio a lógica ordinaria ni despliegue de funciones.

## Pruebas y entrega
- Tests de seis decisiones, 3/4 noches, 100% sin retención, reintegros previos y jersey $50.000 condicionado.
- Tests de identidad/token/rol, acceso apagado, reserva ajena/cancelada, idempotencia, concurrencia y fuente administrativa.
- Restricciones y bloqueo financiero del crédito; transferencias intactas y pagos directos sin doble contabilización.
- Pruebas SQL reversibles y verificación visual móvil/escritorio; ninguna respuesta de prueba permanente en reservas reales.
- Informar pruebas pasadas y pendientes, enlace PREVIEW y bloqueos antes de habilitar: proveedores/costos, habitaciones 3/4 noches, jersey, conciliación de transferencias, integración financiera, fechas públicas y autorización administrativa.
