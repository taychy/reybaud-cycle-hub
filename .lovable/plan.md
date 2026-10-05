# Auditoría de Facturación: ¿lista para facturar automáticamente?

Auditoría de solo lectura: no se cambió código ni datos.

## Números reales hoy

- Cola de facturación: **501 cobros pendientes** de facturar, por **$42,8 M**. Arrancan en mayo 2026: 176 de junio y 165 de julio.
  - 29 pendientes están en USD/EUR.
  - 58 no tienen DNI/CUIT cargado.
- Facturas:
  - 333 emitidas.
  - **23 en error.**
  - 1 marcada "requiere datos fiscales".
  - **1 marcada emitida pero sin CAE.**
  - 88 emitidas sin vínculo exacto a la cola (anteriores al vínculo).
- **4 cobros tienen 2 facturas emitidas cada uno.** Son de eventos y suscripciones viejas, sin vínculo exacto. Puede ser doble facturación o pagos en cuotas; hay que verificarlo uno por uno.
- Notas de crédito emitidas: 0. Hay 3 emisores activos.

## Diagnóstico punto por punto

| # | Tema | Estado | Detalle |
|---|---|---|---|
| 1 | Del pago a Facturación | PARCIAL | Las cuotas y señas de viajes entran solas a la cola al validarse. Mensualidades, tienda y preventas solo entran cuando alguien toca "Buscar cobros nuevos". |
| 2 | Tablas y estados | PARCIAL | La cola tiene estados cerrados (pendiente / facturada / excluida / anulada). En facturas, el estado es texto libre: no hay un estado "emitiendo". |
| 3 | Funciones y tareas programadas | PARCIAL | Existen auto-facturar, emitir factura, emitir nota de crédito, generar PDF y enviar mail. No hay ninguna tarea programada: todo depende de un clic. |
| 4 | Emisión contra ARCA | PARCIAL | Exige admin, firma con el certificado y elige Factura C, A o B. Riesgo grave: si ARCA autoriza y falla el guardado, igual responde "ok" y se pierde el CAE en la app. No hay modo de prueba (homologación): solo producción. Cambia sola de Factura C a A/B si ARCA rechaza la C. |
| 5 | Evitar doble factura | PARCIAL | No se pueden crear dos facturas para el mismo cobro. Pero dos emisiones simultáneas de la misma factura no tienen bloqueo, ni hay control de número de comprobante repetido. Las notas de crédito sí tienen bloqueo. |
| 6 | Medios de pago | PARCIAL | El efectivo queda fuera al buscar cobros nuevos, pero la configuración del emisor lo admite si se carga a mano. Las reglas no son coherentes entre sí. |
| 7 | Qué se factura y por cuánto | NO LISTO | Se factura el monto cobrado en `pagado_at`. Pero USD/EUR se mandan a ARCA como si fueran pesos: no hay conversión. |
| 8 | Datos fiscales del cliente | LISTO (estricto) | Siempre exige DNI o CUIT válido (con dígito verificador). Si falta, la factura queda "requiere datos fiscales". No existe la opción de consumidor final anónimo. |
| 9 | Errores y reintentos | PARCIAL | El error queda guardado en la factura y se reintenta a mano. No hay reintento automático, ni alertas, ni registro centralizado. |
| 10 | Notas de crédito | LISTO | Quedan vinculadas a la factura original, controlan el saldo, bloquean duplicados y respetan el tipo. Solo en ARS. |
| 11 | Cobertura por tipo de cobro | PARCIAL | Cubre escuela, viajes/eventos (incluido Training Camp) y tienda. **Turnera no tiene ningún camino de facturación.** |
| 12 | Período facturado | NO LISTO | La fecha y el período de servicio son siempre los de hoy, no los del cobro. Facturar hoy un pago de junio lo registra como octubre. |
| 13 | Permisos | LISTO | Solo admin ve y emite. El certificado no es legible desde la app. Las notas de crédito solo se crean por el circuito controlado. |
| 14 | Qué está listo para automatizar | PARCIAL | Ver la recomendación. |

## Bloqueos concretos para automatizar

1. Se puede perder el CAE si falla el guardado después de que ARCA autoriza.
2. Falta el bloqueo "emitiendo" y la verificación del número antes de emitir, para que dos procesos no emitan la misma factura.
3. Hay que convertir o bloquear las monedas que no son ARS.
4. La fecha y el período de servicio tienen que salir del cobro, dentro de los límites que permite ARCA.
5. Las mensualidades y la tienda no entran solas a la cola.
6. Hay que revisar los 4 cobros con 2 facturas, la emitida sin CAE y las 23 en error.
7. Falta decidir qué pasa con Turnera y con el efectivo.

## Arquitectura recomendada

```text
Cobro confirmado (pagado_at, validado) ──trigger──> facturacion_cola (pendiente)
        │
        ▼
Chequeo previo: identidad fiscal OK, ARS, período ok, emisor con cupo, tipo de cobro habilitado
        │ no ──> queda en bandeja manual con motivo
        ▼ sí
Bloqueo: factura en "emitiendo" + clave única (cola_id)
        │
        ▼
ARCA: consultar el último número → pedir CAE
        │
        ├─ ok   ─> guardar CAE; si el guardado falla: reintentar y consultar a ARCA el comprobante → alerta
        └─ error─> "error", reintentos con espera (máx. 3) → bandeja manual
        │
        ▼
PDF + mail (ya existe)
```

- **Qué la dispara:** el cobro confirmado, en la cola. Un procesador se activa al encolar, nada de chequeos permanentes; una conciliación diaria detecta facturas emitidas sin CAE.
- **Control manual:** interruptor por emisor y por tipo de cobro (ya existe). Arrancar solo con cobros nuevos, nunca con los 501 atrasados. La bandeja actual sigue para excepciones.

## Recomendación

**C) Todavía no conviene activarla.**

Cuando estén corregidos los puntos 1, 2 y 4, pasaría a **B: activarla solo para cuotas de viajes y eventos en ARS, con DNI/CUIT válido, cobradas desde el día de activación.** Es el único tipo de cobro que hoy entra solo a la cola.

Mensualidades y tienda vienen después (punto 5). USD/EUR y Turnera quedan para el final.

## Pendiente aparte (no incluido en esta auditoría)

El error de Training Camp San Luis ("v_event has no field nature") sigue sin corregir. El alta de participantes en Admin lee el tipo de evento de un campo que no existe. La corrección mínima es leerlo desde la configuración del evento, en el alta y en la protección de paquetes.
