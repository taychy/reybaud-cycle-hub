# Diagnóstico: por qué no se ve el pago MP 175392747499

Solo análisis. No se modificó nada.

## Respuesta corta

El pago existe y está correctamente vinculado. No se ve porque la pantalla está mostrando **septiembre 2026** y ese pago pertenece a **agosto 2026**. Cambiando el selector de período a "ago 2026" (o "Todos los meses") aparece.

## Causa exacta, punto por punto

1. **Pestaña "Pagos" (mensualidades)**
   - El filtro de período arranca siempre en el mes actual (`filterPeriodo = mes de hoy` = `2026-09`).
   - Una mensualidad entra en el período si su `fecha_fin`/`fecha_inicio` o su fecha de creación caen en ese mes.
   - La suscripción `8aae29fc…` tiene `fecha_inicio 2026-08-01`, `fecha_fin 2026-08-31` y fue creada el `2026-08-30`. Todo es agosto → queda fuera del listado en la vista de septiembre.
   - No es un problema de estado: con `estado = vencida` y `origen_registro = automatico`, la pantalla igual la clasifica como **Pagado** (regla explícita: vencida + origen automático/admin = pagado). Es decir, en "ago 2026" se ve como pago cobrado por $65.500.

2. **Pestaña "Movimientos MP"**
   - Recibe el mismo período y filtra `fecha_movimiento` por mes: con septiembre seleccionado, un movimiento del `2026-08-30` queda excluido por consulta.
   - Además, el filtro de conciliación viene por defecto en **"Pendientes"**, y este movimiento ya está imputado (tiene `suscripcion_id`), así que aunque se elija agosto no aparece hasta poner el filtro en "Todos" o "Imputado".

3. **`pagos_imputaciones` vacío no es la causa**
   - Ni la pestaña de Pagos ni la de Movimientos MP consultan esa tabla. La imputación se considera hecha por el vínculo directo `mp_account_movements.suscripcion_id` / `suscripciones.mp_payment_id`, que sí existe. Por eso el movimiento figura como "Imputado".

4. **Efecto en los totales del encabezado**
   - Los KPIs (cobrado/pendiente) también se calculan sobre el período elegido, así que en septiembre estos $65.500 no suman en ningún total. En agosto sí suman como cobrado.

## Cómo verificarlo sin tocar nada

- En Pagos y Cobranzas, cambiar el selector de mes a **ago 2026**: debería aparecer la fila del alumno con estado Pagado, método Mercado Pago (automático).
- En la pestaña Movimientos MP, con ago 2026 y filtro de conciliación en "Todos": aparece el movimiento aprobado de $65.500 marcado como Imputado.

## Observación (no es bug, es UX)

Nada indica en pantalla que un pago aprobado quede oculto por el mes seleccionado. Si querés, en un paso siguiente se puede: (a) mostrar el mes activo de forma más visible junto a un aviso cuando la búsqueda por alumno no encuentra nada en ese mes, o (b) que buscar por nombre/ID ignore el filtro de período. Eso requiere aprobación aparte.
