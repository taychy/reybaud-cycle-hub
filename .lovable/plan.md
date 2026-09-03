# Tablero ejecutivo del mes en el Resumen de Admin

Corte de datos: 3 de septiembre de 2026, 17:20 UTC.

## Qué se puede mostrar hoy con confianza

Un bloque nuevo dentro de **Resumen** (no una sección nueva), con seis tarjetas de lectura rápida y un desglose por unidad de negocio. Cada tarjeta lleva una etiqueta explícita: **Caja**, **Devengado** o **Proyección**.

```text
+---------------------------------------------------------------+
| Septiembre 2026        [mes v]  [ARS v]     corte 03/09 17:20 |
+---------------------------------------------------------------+
| COBRADO (Caja)  | PAGADO (Caja)  | RESULTADO DE CAJA (Caja)   |
|  $5.122.260     |   $777.610     |   $4.344.650               |
+---------------------------------------------------------------+
| POR COBRAR (Devengado) | POR PAGAR (Devengado) | CIERRE (Proy.)|
|  $13.094.934           |  sin datos            |  ver supuestos|
+---------------------------------------------------------------+
| Escuela  $1.941.940 | Viajes $902.700 | Turnera $2.097.440     |
| Tienda   $0         | Sin identificar $987.074                 |
+---------------------------------------------------------------+
| ! 19 cobros MP sin vincular  ! sin liquidaciones de septiembre |
+---------------------------------------------------------------+
```

## Definiciones que fija el tablero

- **Cobrado (Caja)**: movimientos de Mercado Pago con estado aprobado y dirección ingreso, por `fecha_movimiento`. Es la única fuente que representa dinero realmente entrado. No se suman suscripciones ni facturas, para no duplicar.
- **Pagado (Caja)**: `gastos` del mes con forma de pago registrada, más pagos de liquidaciones y de proveedores de tienda cuando existan.
- **Por cobrar (Devengado)**: suscripciones del mes en estado pendiente o vencida, más cuotas de eventos con vencimiento dentro del mes.
- **Por pagar (Devengado)**: liquidaciones de coaches del mes y gastos recurrentes previstos no pagados.
- **Proyección de cierre**: cobrado a la fecha + por cobrar del mes, menos pagado + por pagar. Sin extrapolación lineal por día, porque el cobro de mensualidades se concentra al inicio del mes y una regla por día inflaría el cierre.
- **Moneda**: cada tarjeta muestra ARS y, aparte, los saldos en EUR/USD. Nunca se convierte sin tipo de cambio cargado.

## Alertas del tablero (datos incompletos)

- Cobros de Mercado Pago sin vincular a alumno, suscripción, reserva ni gasto.
- Meses sin liquidaciones de coaches generadas (el resultado quedaría inflado).
- Movimientos de liquidación en estado pendiente de revisión.
- Cuentas de Mercado Pago sin ruteo de unidad de negocio, o con ruteo múltiple ambiguo.

## Detalle técnico

- **Ubicación**: nuevo componente `src/components/admin/ResumenEjecutivoMes.tsx`, insertado arriba en `AdminDashboard.tsx`. No se toca `SuperAdminDashboard.tsx` en este paso.
- **Datos**: un único hook `useResumenEjecutivo(mes, moneda)` que consulta, en paralelo y sólo lectura: `mp_account_movements` (ingresos y egresos aprobados), `gastos`, `liquidaciones_mensuales` + `movimientos_liquidacion`, `delivery_supplier_payments`, `suscripciones`, `reservation_installments`, `reservation_payments`, `store_orders`, `reservas_turnera`.
- **Atribución por unidad**: se resuelve por vínculo directo del movimiento (`suscripcion_id`, `reservation_payment_id`, `gasto_id`) y no por `cuenta_mp_routing`, que hoy tiene varias filas por cuenta y produce sumas duplicadas. Lo no atribuible se muestra como "Sin identificar", nunca repartido.
- **Sin migraciones ni cambios de datos** en este alcance. El único dato faltante estructural es un costo mensual fijo (alquileres, sueldos fuera de MP) y la generación de liquidaciones del mes; se señalan como alerta en lugar de estimarse.

## Fuera de alcance

- No se crea una sección Finanzas nueva ni se reemplazan las métricas actuales del panel Super Admin.
- No se corrigen los movimientos de Mercado Pago sin vincular; sólo se listan.
- No se hace conversión automática de monedas.
