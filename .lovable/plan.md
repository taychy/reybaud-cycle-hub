# Auditoría: error al facturar pagos de Viajes desde Pendientes

## Conclusión (causa raíz confirmada)

Las filas de Viajes generadas por pagos de reservas se guardan con `segmento = 'eventos'`, pero la función `auto-facturar` sólo acepta `escuela | viajes | tienda`. La validación falla y devuelve **HTTP 400**, que el frontend muestra como "Error al preparar factura / Edge Function returned a non-2xx status code".

Evidencia de producción:

- `facturacion_cola` tiene hoy 85 filas con `source='reservation_payment'` y `segmento='eventos'` (todas pendientes, `factura_id` nulo), frente a 31 filas antiguas con `segmento='viajes'` (esas sí funcionan).
- Casos citados: Daniel Pozo $120.800 (efectivo, `referencia_tipo='reservation_payment'`, `segmento='eventos'`) y Andrea Soledad Corsalini (mismas características). Ninguno tiene factura asociada.
- Origen del dato: las funciones de base `enqueue_reservation_payment_facturacion` y `rebuild_facturacion_cola` insertan literalmente `'eventos'` como segmento.
- `emisor_segmento_config` sólo conoce `escuela`, `viajes`, `tienda`: aun sin la validación, el ruteo de emisor no encontraría emisor para "eventos".

## ¿Antes o después de crear la factura?

**Antes.** El corte ocurre en la validación de entrada, previo a cualquier inserción en `facturas` y muy previo a AFIP. No hay facturas huérfanas ni comprobantes emitidos por este error. Tampoco se consumió numeración.

## Efecto secundario observado

En "Facturar seleccionados" (bulk) el fallo se traga silenciosamente (`console.warn` + `continue`), así que un lote 100% de Viajes termina en "Nada para facturar" sin explicar el motivo.

## Propuesta mínima de corrección (no ejecutada)

1. **Normalizar el segmento en origen (migración)**: que `enqueue_reservation_payment_facturacion` y `rebuild_facturacion_cola` inserten `'viajes'`, y un `UPDATE` puntual que pase las 85 filas pendientes de `'eventos'` a `'viajes'`.
2. **Defensa en `auto-facturar`**: mapear alias entrantes (`eventos`/`evento` → `viajes`) antes de validar, para que datos históricos o nuevos callers no vuelvan a romper.
3. **Mensaje de error real en la UI**: en `BillingInvoiceLauncher` y `TrayPendientes`, leer el cuerpo JSON de la respuesta de error de la función y mostrarlo (hoy sólo se ve el genérico "non-2xx"); en el bulk, contabilizar y reportar los fallidos en el toast.

Alcance: 1 migración aditiva + corrección de datos acotada, 1 deploy de edge function, 2 archivos de frontend. Sin emitir facturas ni llamar a AFIP.
