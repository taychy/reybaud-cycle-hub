# Auditoría: Programa Iniciación (12 vs 9), duplicados y lógica de grupos

Solo lectura. No se modificó código, datos ni configuración.

## 1. Programa Iniciación 2026/2 — lista real

Plan: `Programa Iniciación 2026/2` (`c1e21518-…`, categoría `formacion`, activo). 15 suscripciones históricas, 13 alumnos distintos.

Activos reales HOY (9 alumnos, suscripción `activa` 2026-08-15 → 2026-10-03):
Ariana Koffsmon, Claudio Yubero, Giselle Mosqueira, Hernán Franzoni (`192f3879`), Ludmila Carballo, Marcelo Kauffman, Marina Pasinovich, Oscar Lazarte, Victoria Rodríguez.

Los que sobran y por qué:

| Alumno | Suscripción | Motivo de exclusión |
|---|---|---|
| Hernán Franzoni `7d5f8d1a` | `04c51e36` cancelada 12/08, fin 2026-09-05, `origen_registro=cargado_admin`, motivo "Esta duplicado. Dejo activo…" | Ficha duplicada; la buena es `192f3879` |
| Candelaria Molina Zavalía `614b26e2` | `949e7010` cancelada 31/08, fin 2026-10-03, motivo "prefiere clases personalizadas" | Baja del programa; hoy sin ninguna suscripción activa (el saldo a favor no generó sub de personalizada) |
| Gerardo Adrian Vlceck `04517813` | `5190d5ae` vencida (fin 31/08, paga) + `3e76f45f` pendiente (01–30/09) | Renovación impaga: efectivo `pendiente`, no cuenta como activa |
| Scarlett Barros `31049071` | `d3b9083b` cancelada, motivo "xxxx" | Registro de prueba desde landing |

## 2. Por qué el chip dice 12 (y por qué el resumen nuevo dice 10, no 9)

- Chip histórico `plan_<id>`: `planCounts` recorre **todos** los alumnos (sin filtrar estado) y usa `getActiveSub(a.id) || getAnySub(a.id)`, donde `getAnySub` es simplemente la suscripción con `fecha_fin` más alta. Por eso suma los 9 reales + Hernán duplicado + Candelaria + Gerardo = 12. Es un chip de "última suscripción conocida", no de plan vigente.
- Bloque nuevo `Distribución de activos > Por plan activo`: usa estado efectivo (`getEffectiveSubStatus`). Ahí aparece **10**, no 9: la sub cancelada de Hernán duplicado entra en la regla de gracia (cancelada + período pagado + `fecha_fin` futura ⇒ efectivo `activa`), porque el motivo "Esta duplicado…" no contiene ninguna de las palabras de cierre forzado (`baja`, `cleanup`, `huerfana`, `removido`). El conteo 9 informado en el turno anterior salió de una consulta SQL por estado crudo y no reflejaba la regla de gracia: corrección incluida en esta auditoría.
- Comparación: Ludmila también tiene una cancelada, pero su motivo dice "Plan removido por admin" ⇒ cierre forzado ⇒ correctamente excluida. Es decir, el resultado depende hoy de **texto libre en `cancelada_motivo`**.

Causa raíz Hernán: dos fichas de alumno (`7d5f8d1a` y `192f3879`), ambas `activo`, sin campo de fusión/duplicado en `alumnos`; la ficha vieja quedó con una sub cancelada que la gracia reactiva.
Causa raíz Candelaria: su baja está bien registrada (cancelada, no pagada ⇒ efectivo `cancelada`); sólo aparece en el chip **histórico**, porque es su única suscripción de la historia y `getAnySub` la devuelve.

## 3. "Grupo de formacion ciclista-Nivel inicial (3)"

Es un **plan** (`planes.cfc43af9-…`, categoría `grupal`, `activo=false`), no un grupo. Es el antecesor comercial del Programa Iniciación (cohortes marzo–junio 2026, 21 suscripciones, todas canceladas/finalizadas). El chip muestra 3 porque son los alumnos cuya última suscripción por `fecha_fin` sigue siendo ésa: Trinidad Goyanes (inactiva), Juan Pablo Meluso (inactivo) y, por empate de `fecha_fin` 2026-04-30, Silvina Parodi. Se solapa conceptualmente con Iniciación: debería vivir como histórico, no compitiendo con los planes vigentes.

## 4. Lógica de grupos hoy

`alumnos.grupo` es un enum `grupo_ciclismo` (G1, G2, G3, G4, Sin grupo, Principiante, Personalizado, Aspirantes), default `'Sin grupo'`. Activos (177): G2 81, G1 35, G3 27, Aspirantes 15, G4 11, Sin grupo 5, Personalizado 2, Principiante 1.

Escritores del campo:
- `ManageStudents` (edición inline y drawer) → update directo.
- `WhatsAppConciliador` (3 puntos de reasignación).
- RPC `registrar_cambio_grupo_alumno` / `procesar_cambio_grupo_alumno` (Chequeo de Alumnos, graduaciones).
- Baja administrativa: pasa a `Sin grupo`.
- `grupo_preferido` es texto libre y sólo lo escribe el alta pública (`PaymentResult`) para avisar al admin; nunca alimenta `grupo`.

No hay ningún trigger ni regla por plan: **el grupo es 100% manual**.

`Aspirantes` hoy es una mezcla: de los 15 activos, 9 son alumnos del Programa Iniciación con sub activa, 1 con renovación pendiente y 5 no tienen ningún plan activo (Marcelo Felipe, Sebastian Oberti, Gabriel Pellegrino, Candelaria — ya en personalizadas — y Hernán duplicado). Es decir, mezcla **etapa de admisión**, **modalidad programa** y **modalidad personalizada** en un único campo de nivel. Por eso programa grupal y personalizadas caen ambos en Aspirantes: es el único valor "no G1-G4" que el staff usa para todo lo que no es pelotón estable.

## 5. Modelo operativo propuesto (no implementado)

La estructura actual **no** soporta las cuatro preguntas sin normalización: hay una sola dimensión (`grupo`) para nivel + modalidad + admisión, y el plan comercial no distingue programa de clase suelta más allá de `planes.categoria`.

Propuesta mínima (aditiva, sin romper nada):

- A) `grupo` sigue siendo el **pelotón estable**: G1–G4 + `Sin grupo`. Se retiran de a poco `Aspirantes`, `Principiante`, `Personalizado` de esta dimensión.
- B) `modalidad_actual` (nuevo, derivable al inicio desde `planes.categoria` de la sub activa): regular grupal / programa de formación / personalizada / pista / sin clases. Con `planes.categoria` ya existente se puede **derivar en lectura hoy mismo, sin migración**, para el resumen y los filtros.
- C) `estado_admision` (nuevo, chico): aspirante / en evaluación / aceptado. Hoy no existe fuente real; requiere un campo mínimo. Mientras no exista, no inventar: mostrar "Aspirantes" como valor legacy.
- D) Plan/suscripción sigue siendo la dimensión económica, separada del grupo.

Implementable ya sin migración: separar en la UI grupo vs modalidad derivada de `planes.categoria`, y marcar planes inactivos como históricos. Requiere migración mínima: `estado_admision`, y opcionalmente `modalidad_actual` persistida más un campo `fusionado_en` para duplicados de ficha.

## 6. UX propuesta en Admin > Alumnos (sin sección nueva)

1. Fila 1 — Estado: Todos / Activos / Inactivos / etc. (igual que hoy).
2. Fila 2 — Grupo operativo: G1, G2, G3, G4, Sin grupo (+ legacy Aspirantes/Principiante/Personalizado marcados como "legacy" hasta migrar).
3. Fila 3 — Modalidad/Programa (derivada de `planes.categoria` de la sub efectivamente activa): Regular grupal, Programa de formación, Personalizada, Pista, Sin clases.
4. Fila 4 — Plan comercial: sólo planes con alumnos **activos vigentes**; los planes con `activo=false` (p. ej. "Grupo de formacion ciclista-Nivel inicial") se agrupan detrás de un "Ver históricos" y se rotulan como histórico, con semántica explícita "última suscripción conocida".
5. El resumen `Distribución de activos` queda como composición (denominador visible) y los chips como filtro operativo, sin mezclar ambas semánticas.

## 7. Correcciones de datos sugeridas (a decidir, no ejecutadas)

- Unificar/fusionar la ficha duplicada de Hernán Franzoni (`7d5f8d1a` → `192f3879`) o cerrar su sub cancelada con un motivo reconocido, para que la gracia no la reactive. Sin esto, el resumen seguirá diciendo 10.
- Dejar de depender de texto libre en `cancelada_motivo` para decidir cierre forzado; usar un motivo tipificado.
- Definir el grupo/modalidad de Candelaria (hoy Aspirantes sin plan activo, tomando personalizadas) y de los otros 4 Aspirantes sin plan.

No se realizó ningún cambio.
