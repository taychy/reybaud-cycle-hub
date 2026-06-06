## Fase 1 — Bono de clases personalizadas

Objetivo: que un plan tipo "8 clases personalizadas" (caso Maia) funcione hoy mismo, sin depender aún de la turnera. Cada vez que el alumno toma una clase, se descuenta del bono. Cuando llega a 0 o vence, el alumno queda sin saldo y tenés que renovarle.

Diseño explícito: **no creamos tabla nueva**. Reutilizamos `suscripciones` agregándole 3 campos. Esto deja un único lugar de verdad (igual que los planes grupales) y permite que el bono conviva con el resto del sistema (cuenta corriente, pagos MP, AFIP, dashboard alumno) sin tocar nada más.

### 1. Cambios de base de datos

**Tabla `planes`** — para identificar qué planes son "bono":
- `tipo_consumo` text: `'mensual'` (default) | `'bono'`
- `clases_incluidas` int — cuántas clases trae el bono (ej: 8)
- `vigencia_dias` int — días de validez desde el alta (ej: 60). Si es null, no vence.

**Tabla `suscripciones`** — estado del bono de cada alumno:
- `clases_totales` int — copia de `planes.clases_incluidas` al activar (snapshot, por si después cambia el plan)
- `clases_consumidas` int default 0
- `clases_vencimiento` date — calculado en el alta como `fecha_inicio + vigencia_dias`

**Nueva tabla `clases_consumidas`** — log auditable de cada clase tomada:
- `suscripcion_id`, `alumno_id`, `coach_id` (opcional, para Fase 3), `fecha`, `notas`, `creada_por`, `reserva_id` (null en Fase 1, lo usa la turnera en Fase 2)
- RLS: admin/coach/super_admin escriben; alumno lee solo las suyas.

**Función RPC `consumir_clase_bono(p_suscripcion_id, p_fecha, p_notas, p_coach_id)`**:
- Valida saldo > 0 y no vencido.
- Inserta en `clases_consumidas`.
- Incrementa `suscripciones.clases_consumidas`.
- Si llega al total, marca la sub como `vencida`.
- Todo en una transacción.

**Función RPC `revertir_clase_bono(p_clase_id)`**:
- Borra el registro y decrementa el contador (por si admin se equivoca).

### 2. UI Admin

**Editor de plan** (`AdminPlanes` o donde se editen planes): selector "Tipo de consumo" con dos opciones:
- Mensual / recurrente (default actual)
- Bono de N clases → al elegir esto aparecen los campos `clases_incluidas` y `vigencia_dias`.

**Ficha de alumno → sección Suscripciones**: cuando la sub es tipo bono, se ve:
```
🎯 Personalizado x 8 clases
Consumidas: 3 / 8 · Restantes: 5
Vence: 12 ago 2026 (en 42 días)
[ + Registrar clase tomada ]   [ Ver historial ]
```
Botón "Registrar clase" abre un mini-form: fecha (default hoy), coach (select opcional), notas. Llama al RPC. Al volver, refresca el contador.

"Ver historial" muestra una lista de las clases tomadas con opción "Deshacer" en cada una.

### 3. UI Alumno

En su dashboard, si tiene un bono activo, ve una tarjeta clara:
```
Personalizado · 5 clases restantes de 8
Vence el 12 ago 2026
```
Sin botón de "registrar" (la carga sigue siendo manual desde admin en Fase 1). En Fase 2 será automático desde la turnera.

### 4. Compatibilidad con lo existente

- Los planes mensuales siguen funcionando exactamente igual (default `tipo_consumo = 'mensual'`).
- El flujo de checkout MP, AFIP, cuenta corriente, descuentos, cancelaciones — sin cambios.
- El bono respeta `cancellation grace policy`: si lo cancelás, mantiene saldo hasta `fecha_fin` o hasta agotarse.

### 5. Fuera de alcance (Fase 1)

- Vincular reserva de turnera con consumo de clase → Fase 2.
- Generar honorarios al coach automáticamente → Fase 3.
- Vista en cuenta corriente del alumno con detalle por clase → Fase 4.

### Resultado de la fase

Hoy mismo podés crear el plan "8 clases personalizadas — Maia", asignárselo, cobrarle con MP y empezar a descontarle clases una por una desde la ficha. El sistema te avisa cuando se le acaba o se le vence.

¿Avanzo con la migración + los campos del plan + RPC + UI admin de "Registrar clase"?