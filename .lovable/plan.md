# MVP Cuenta Corriente v1 — Vista Admin

Objetivo: dar a admin una vista única, por alumno, con cargos / pagos / créditos / saldo separado por moneda, leyendo de las tablas que ya existen. Mínimo de tablas nuevas, cero cambio en flujos de pago actuales.

## Alcance

Incluido:
- Suscripciones (cargos + pagos)
- Reservas de eventos/viajes (cuotas + pagos validados)
- Ajustes manuales simples del admin (cargo o crédito)
- Vista en ficha de alumno, separada por moneda (ARS / USD / EUR)
- Link a la fuente original de cada movimiento

Fuera de alcance (v2+):
- Tienda / pedidos
- Link público tokenizado `/mi-cuenta?token=…`
- Pagos consolidados, MP multi-ítem, imputaciones
- Recordatorios automáticos
- Vista al alumno (logueado o público)

## 1. Base de datos (mínimo)

Una sola tabla nueva: **`cuenta_ajustes`** (cargos/créditos manuales).

```text
cuenta_ajustes
  id, alumno_id, tipo ('cargo' | 'credito'),
  concepto, monto, moneda ('ARS'|'USD'|'EUR'),
  fecha, notas,
  created_by, created_at, updated_at
```

RLS: solo admin/super_admin pueden leer/insertar/editar/borrar. Trigger `updated_at`.

Vista virtual **`vw_cuenta_corriente_movimientos`** (read-only, sin RLS extra: hereda de las tablas base) que hace `UNION ALL` de:

| Fuente | Tipo | Debe (cargo) | Haber (pago/cred) | Moneda |
|---|---|---|---|---|
| `suscripciones` (no canceladas) | cargo_suscripcion | `precio_final` | — | `moneda` |
| `suscripciones` con `metodo_pago`/fecha pago | pago_suscripcion | — | monto pagado | `moneda` |
| `reservation_installments` | cargo_reserva | `amount` | — | `currency` |
| `reservation_payments` (status='validado') | pago_reserva | — | `equivalent_amount_event_currency` | `currency` |
| `cuenta_ajustes` tipo='cargo' | ajuste_cargo | `monto` | — | `moneda` |
| `cuenta_ajustes` tipo='credito' | ajuste_credito | — | `monto` | `moneda` |

Columnas comunes de la vista:
`alumno_id, fecha, tipo, concepto, fuente_tabla, fuente_id, debe, haber, moneda, estado, referencia_extra (jsonb)`

RPC **`get_saldo_alumno(p_alumno_id uuid)`** → devuelve filas `{moneda, total_cargos, total_pagos, saldo}` agrupado por moneda. `SECURITY DEFINER`, restringe por `has_role('admin')` o `is_super_admin`.

## 2. UI Admin

Nuevo componente **`StudentCuentaCorrienteSection`** integrado en la ficha del alumno (`/admin/alumnos/:id`), como una sección/tab más al lado de "Plan", "Pagos", etc.

Estructura:
- **Header con saldos por moneda** (cards): ARS / USD / EUR con saldo en color (rojo si debe, verde si a favor, gris si 0)
- **Tabla cronológica** (filtrable por moneda y tipo):
  - Fecha · Concepto · Origen (chip: Suscripción / Reserva / Ajuste) · Debe · Haber · Moneda · Estado · acción "Ver origen" (navega a la sub/reserva/ajuste)
- **Botón "Agregar ajuste"** → modal pequeño: tipo (cargo/credito), concepto, monto, moneda, fecha, notas

Solo lectura sobre cargos/pagos reales — la única operación de escritura aquí es crear/editar/borrar `cuenta_ajustes`.

## 3. Archivos nuevos / tocados

- Migration: tabla `cuenta_ajustes` + vista `vw_cuenta_corriente_movimientos` + RPC `get_saldo_alumno`
- `src/components/admin/StudentCuentaCorrienteSection.tsx` (vista principal)
- `src/components/admin/AjusteCuentaModal.tsx` (alta/edición de ajuste)
- `src/lib/cuentaCorriente.ts` (helpers: cargar movimientos, agrupar saldos, formatear)
- Edit en `src/pages/admin/StudentDetail.tsx` (o donde viva la ficha) para montar la nueva sección

## Detalles técnicos

- Saldos siempre **separados por moneda**, jamás convertidos.
- La vista no incluye suscripciones `cancelada` ni reservas con `amount_total = 0`.
- Para suscripciones, el "pago" se infiere cuando `estado IN ('activa','pendiente_verificacion')` y existe `fecha_pago`/`metodo_pago`. Si más adelante se introduce `subscription_payments`, la vista se actualiza sin cambiar UI.
- Vínculo a fuente: `fuente_tabla` + `fuente_id` permiten navegar (`/admin/suscripciones/:id`, sheet de reserva, modal de ajuste).
- Sin cambios en flujos de pago, facturación, MP, ni en el dashboard del alumno.

## Camino a v2 (no se hace ahora)

Cuando este MVP esté validado, se podrá sumar sin romper nada: tienda → agregar otro `UNION` a la vista; vista para el alumno logueado; luego link público tokenizado; finalmente `cuenta_pagos` + `cuenta_imputaciones` + MP consolidado.

¿Avanzo con la migration?
