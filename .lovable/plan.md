## Objetivo
Agregar a la ficha del alumno: **familiares en la escuela** (vínculos a alumnos + externos), **contacto de emergencia** (hasta 2) y **obra social/prepaga** (texto libre). Contacto de emergencia y obra social son **autogestionados por el alumno**.

## 1. Base de datos (migración)

**Tabla `alumnos`** — agregar columnas:
- `contacto_emergencia_relacion` (text) — para el contacto 1 ya existente
- `contacto_emergencia_nombre_2`, `contacto_emergencia_telefono_2`, `contacto_emergencia_relacion_2` (text)
- `obra_social_nombre` (text)
- `obra_social_numero_socio` (text)
- `obra_social_plan` (text, opcional)

**Tabla nueva `alumno_familiares`**:
| Campo | Tipo | Nota |
|---|---|---|
| id | uuid PK | |
| alumno_id | uuid FK → alumnos | NOT NULL |
| familiar_alumno_id | uuid FK → alumnos | nullable (si es alumno) |
| familiar_externo_nombre | text | si no es alumno |
| familiar_externo_telefono | text | opcional |
| relacion | text | padre, madre, hijo, hermano, conyuge, otro |
| notas | text | |
| created_at, created_by | | |

- CHECK: `familiar_alumno_id IS NOT NULL OR familiar_externo_nombre IS NOT NULL`
- UNIQUE `(alumno_id, familiar_alumno_id)` cuando no es nulo
- **Trigger reciprocidad**: si se inserta A→B (con familiar_alumno_id), se crea B→A con relación inversa (mapping: padre/madre→hijo, hijo→padre_madre, hermano/conyuge/otro→sí mismo). Sin loop infinito (chequea si ya existe).
- **Trigger de borrado**: al borrar A→B, borrar B→A también.

**RLS**:
- `alumno_familiares`: admin full; alumno puede SELECT donde `alumno_id` corresponde a su perfil (vía `auth.email()`).
- Columnas nuevas de `alumnos`: las policies existentes ya cubren self-update.

## 2. Tarea automática (recordatorio no bloqueante)
Agregar en `generate_tareas_automaticas()` un origen `datos_emergencia_incompletos`:
- Si alumno activo y `contacto_emergencia_nombre IS NULL OR obra_social_nombre IS NULL` después de 30 días desde `created_at`.
- Bucket quincenal, prioridad media, rol_destino `admin`.

## 3. Frontend — Admin (ficha alumno)

**`ManageStudents.tsx`** — en el drawer del alumno, agregar 3 cards nuevas (solo lectura para admin, con CTA "Solicitar al alumno"):
- **Contacto de emergencia** (lista hasta 2)
- **Cobertura médica** (obra social + n° socio + plan)
- **Familiares en la escuela** (lista) con CTA `+ Vincular familiar` → dialog:
  - Toggle: "Alumno de la escuela" / "Externo"
  - Si alumno: search-select de alumnos
  - Si externo: nombre + teléfono
  - Select de relación
  - Notas
  - Botones eliminar por fila

Crear componente nuevo `src/components/admin/StudentEmergencyMedicalSection.tsx` y `StudentFamiliaresSection.tsx` para mantener `ManageStudents.tsx` limpio.

## 4. Frontend — Alumno (autogestión)

En `StudentDashboard.tsx` tab "mas", agregar nueva sección **"Mis datos personales"** con:
- Card "Contacto de emergencia" → edit dialog con 2 contactos
- Card "Cobertura médica" → edit dialog con obra social
- Badge ⚠️ "Completá tus datos" si están vacíos
- Anchor `#datos-emergencia` para deep link

Componente nuevo `src/components/student/EmergencyContactCard.tsx` y `MedicalCoverageCard.tsx`. Updates se hacen contra `alumnos` filtrado por `user_id = auth.uid()` (RLS existente lo permite).

## 5. Memoria
Guardar memoria `mem://features/student-emergency-medical-family` con la lógica (campos, tabla, trigger reciprocidad, autogestión).

---

## Decisiones tomadas (de las preguntas)
- Familiares: alumnos + externos (ambos)
- Contacto emergencia: hasta 2
- Obra social: texto libre (sin select)
- Obligatoriedad: recordatorio no bloqueante (badge + tarea a los 30 días)

Si te parece, lo implemento en este orden: 1) migración + RLS, 2) componentes admin, 3) componentes alumno, 4) tarea automática + memoria.