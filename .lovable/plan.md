# Rediseño del módulo de WhatsApp: chequeo guiado + alarma mensual

## Objetivo

Reemplazar el flujo actual de "pegar lista y matchear" por un **chequeo asistido alumno por alumno, dentro de cada grupo**, ejecutable los días **5 y 15 de cada mes**, con un **aviso visible en el Centro de Control** mientras la tarea esté pendiente.

---

## 1. Nuevo flujo en `/admin/whatsapp-conciliador`

Wizard de 4 pasos, mobile-friendly:

**Paso 1 — Elegir grupo y fecha objetivo**
- Selector de grupo (Iniciación, Avanzados, Pista, etc.) + fecha objetivo prellenada (5 o 15 del mes en curso).
- Muestra: total de alumnos esperados según `suscripciones` activas + `agenda_grupal`.

**Paso 2 — Lista alfabética del grupo, uno por uno**
Cada fila = un alumno con:
- Foto / inicial + Nombre y Apellido
- Plan vigente + estado de pago del mes (Pagado / Por cobrar / Vencido)
- Teléfono (con botón "abrir WhatsApp")
- 3 botones grandes:
  - ✅ **Está en el grupo de WhatsApp**
  - ❌ **No está** (abre input opcional para nota)
  - ⏭ **Saltar** (lo deja pendiente para revisar después)

Avance automático al siguiente alumno tras marcar. Barra de progreso arriba (`23 / 47`).

**Paso 3 — Inconsistencias de plan**
Lista compacta de los alumnos marcados ❌ que **sí tienen plan activo** (= deberían estar en el grupo). Permite:
- Enviar invitación por WhatsApp con un botón
- Anotar motivo (de baja, cambió de grupo, error de plan, etc.)

**Paso 4 — Resumen y cierre**
- KPIs: confirmados, faltantes, plan a revisar, saltados
- Botón "Cerrar chequeo" → guarda el run como `cerrado`
- Deeplink al alumno desde cada fila para corregir plan / cobrar / dar de baja

---

## 2. Cambios de base de datos

Dos tablas nuevas (RLS solo para `admin`/`super_admin`):

**`whatsapp_check_runs`**
- `grupo`, `fecha_objetivo` (date), `admin_id`
- `total_esperados`, `confirmados`, `faltantes`, `plan_revision`, `saltados`
- `estado`: `pendiente | en_progreso | cerrado`
- `cerrado_at`

**`whatsapp_check_items`**
- `run_id`, `alumno_id`, `nombre_snapshot`
- `resultado`: `presente | ausente | saltado`
- `plan_inconsistente` (bool), `nota`, `checked_at`

Esto permite auditoría y métricas (cuántas veces faltó cada alumno).

---

## 3. Alarma en el Centro de Control (`SuperAdminControl.tsx`)

Card nueva "Chequeo de WhatsApp" con lógica:

| Día del mes | Estado de la card |
|---|---|
| 1–4 y 8–14 y 18–fin | Oculta |
| 5–7 (chequeo del 5) | Naranja: "Pendiente — revisar grupos" |
| 15–17 (chequeo del 15) | Naranja: "Pendiente — revisar grupos" |
| Día 8 / 18 sin cerrar | Roja: "Atrasado" |
| Cerrado | Verde discreta con resumen del último run |

Cada card lista los grupos con su estado (pendiente / en progreso / cerrado) y un botón "Iniciar chequeo" que lleva al wizard con el grupo y fecha precargados.

---

## 4. Limpieza del módulo viejo

- Quitar el textarea, el modal "Cómo extraer la lista" y el snippet de consola.
- Mantener `nameMatch.ts` por si en el futuro lo querés reutilizar.

---

## Lo que NO incluye este plan

- No envía recordatorios por mail/push automáticos.
- No bloquea ninguna acción si no hacés el chequeo (solo avisa).
- No edita el plan inline desde el wizard (te lleva al alumno).
- No se conecta a la API de WhatsApp Business.

---

## ¿Avanzo así?

Decime si querés ajustar algo:
- Otros días distintos al 5 y 15
- Que la alarma también mande mail
- Edición rápida del plan dentro del paso 2
- Mostrar también el último chequeo histórico por alumno
