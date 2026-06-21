
# Cuenta corriente unificada por cliente

## Objetivo
Que en la cuenta corriente de cada alumno aparezcan **todas** sus operaciones (suscripciones, preventas, eventos/viajes, tienda, turnera, ajustes manuales), separadas por moneda (ARS / USD / EUR), con cargos y haberes claros y saldo por moneda.

Caso disparador: la preventa de Daniel Pozo no aparece en su cuenta porque hoy la cuenta solo lee de algunas fuentes; al cobrar la transferencia no hay dónde imputarla.

## Decisiones confirmadas
- **Moneda**: mantener el modelo actual de **una tabla por moneda** (ARS / USD / EUR separadas).
- **Preventas**: el cargo aparece **desde que se crea** la preventa (la seña entra como haber parcial; el saldo final entra como haber cuando se cobra).
- **Eventos con cuotas**: **un único cargo por el total** del evento; cada cuota/pago se imputa como haber parcial (igual que `reservation_installments`).
- **Turnera**: fuera del alcance de esta fase, se suma después.

## Alcance Fase 1

### Fuentes de cargos (debe) unificadas
1. Suscripciones (`suscripciones` + `planes`) — ya está.
2. Preventas (`store_preorders`) — **nuevo**.
3. Eventos / viajes (`event_reservations`) — **nuevo**, un cargo por el total.
4. Tienda (`store_orders`) — **nuevo**.
5. Ajustes manuales del admin (`cuenta_ajustes`) — ya está.

### Fuentes de haberes (haber) unificadas
- Pagos de suscripción (ya).
- Seña + pago final de preventa (`store_preorders.sena_*` + pago final).
- Cuotas de evento (`reservation_installments` / `reservation_payments`).
- Pagos de tienda (`store_orders`).
- Ajustes manuales tipo "haber" / `saldo_a_favor`.

### UI
- La cuenta corriente del alumno muestra **3 pestañas por moneda** (ARS / USD / EUR), cada una con su saldo y su lista cronológica.
- Cada línea muestra: fecha, origen (badge: Suscripción / Preventa / Evento / Tienda / Ajuste), descripción, debe, haber, saldo acumulado, link al detalle.
- Botón "Registrar pago" en cada cargo abierto, que crea el haber correspondiente en la unidad de negocio correcta (no duplica registros).

### Backend
- Una **vista SQL** `vw_cuenta_corriente_unificada(alumno_id, moneda, fecha, origen, origen_id, descripcion, debe, haber)` que hace `UNION ALL` de todas las fuentes.
- Un RPC `get_cuenta_corriente(alumno_id, moneda)` que devuelve las filas ordenadas y el saldo acumulado.
- Para preventas: trigger / lógica que al crear `store_preorders` genere su entrada de cargo, y al registrar la transferencia del saldo final genere el haber.

## Caso Daniel Pozo (qué pasa al aplicar esto)
1. Su preventa aparece como **cargo** desde la fecha de creación.
2. La seña ya cobrada aparece como **haber parcial**.
3. Vos vas al cargo de la preventa, "Registrar pago", elegís **Transferencia**, importe del saldo final → queda como segundo haber y la preventa queda en 0.
4. Todo queda imputado a la unidad de negocio "Tienda/Preventas" sin duplicar nada en la cuenta.

## Plan técnico (resumen)

```text
[ Fase 1 ]
 1. Migración SQL
    - Vista vw_cuenta_corriente_unificada (UNION ALL 5 fuentes)
    - RPC get_cuenta_corriente(alumno_id, moneda)
    - Función registrar_pago_unificado(origen, origen_id, monto, medio, notas)
      que enruta al insert correcto según origen
 2. Refactor frontend
    - Componente CuentaCorriente: tabs ARS / USD / EUR
    - Lista unificada con badge de origen y link al detalle
    - Modal "Registrar pago" usando el RPC
 3. Backfill / verificación
    - Script de lectura para verificar que los saldos por alumno
      coinciden con la suma actual de cada módulo
```

## Fuera de alcance (siguiente fase)
- Turnera (`reservas_turnera`).
- Reportes financieros consolidados multi-moneda con conversión.
- Exportación contable.

## Riesgos
- Pagos viejos sin moneda explícita → asumir ARS por defecto y marcarlos para revisión.
- Eventos con cuotas en otra moneda que el cargo principal → validar en la vista.

¿Avanzo con la migración con este alcance?
