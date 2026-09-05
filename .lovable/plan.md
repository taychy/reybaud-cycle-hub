# QA solo lectura — P0 Cobros recurrentes MP (caso Tamara Mazur)

Sin cambios de código, datos ni configuración. Todo verificado con consultas de lectura.

## Resultado por punto

1. **Una sola ficha recurrente agrupando los 3 cobros — PASS**
   Hay exactamente 1 fila para `f23846c8…`. Agrupa 3 cobros aprobados: 01/07 ARS 68.476, 01/08 ARS 71.240 y 01/09 ARS 71.240. Muestra "3 cobro(s) · 2 sin imputar" (el de septiembre ya quedó vinculado a una mensualidad).

2. **Datos visibles — PASS**
   Descripción "Ruta x 2", email `tammazur@gmail.com`, alumno sugerido "Tamara Raquel Mazur", identificador de plan de MP `3a4f61d7…`, 3 movimientos, 01/07 → 01/09, importe ARS 71.240, estado "Detectado".

3. **Alumno sugerido correcto — PASS**
   Apunta a la ficha activa `Tamara Raquel Mazur` (`tammazur@gmail.com`), que es la que concentra los 5 movimientos de MP. La otra ficha (`tamarar.mazur@gmail.com`, inactiva) no tiene movimientos y ya figura como email adicional de la activa.

4. **Plan sin asignar hasta confirmación — PASS**
   `plan_id` está vacío; la pantalla muestra "sin plan asignado".

5. **Confirmar no toca dinero — PASS**
   La función sólo actualiza la tabla de identidades recurrentes y deja el registro en la bitácora de auditoría. No escribe en mensualidades ni en movimientos de MP. Exige rol admin y exige alumno + plan para confirmar.

6. **La UI permite elegir y corregir — PASS**
   Botón "Vincular" abre una ventana con selector de alumno y de plan, precargados con lo sugerido, y botones "Confirmar vínculo" / "Ignorar".

7. **UX a mejorar antes de P1 — FAIL parcial (nada bloqueante)**
   Detalles observados en la pantalla.

## Problemas de UX detectados (no corregidos)

- **No se puede "desvincular"**: si se guardó un alumno o plan equivocado, se puede reemplazar por otro, pero no dejarlo vacío otra vez.
- **"Ignorar" también guarda** el alumno/plan que quedaron elegidos en pantalla, sin avisarlo.
- **No hay forma de volver a "Detectado"** desde la pantalla una vez confirmado o ignorado.
- **No se ven los cobros**: se muestra el conteo, pero no la lista de los 3 pagos con fecha e importe, que es justo lo que hace falta para decidir.
- **La lista de alumnos se carga completa** en el selector, sin buscador interno; con cientos de fichas es incómodo.
- **El buscador de arriba no encuentra por email adicional** (ej. `tamarar.mazur@gmail.com` no trae esta fila).
- **Sin filtro por estado** (Detectado / Confirmado / Ignorado) ni indicador de "ya confirmado" destacado.

## Riesgos

- El cobro de septiembre ya está vinculado a una mensualidad y los de julio/agosto no: al llegar P1, el motor debe respetar lo ya imputado y no duplicar.
- El importe de julio (68.476) difiere de los otros dos: cualquier conciliación automática debe tolerar variación de precio.
- La ficha inactiva duplicada de Tamara sigue existiendo; conviene confirmar que no vuelva a recibir cobros.

## Siguiente paso propuesto (requiere aprobación)

Ajustes de UX solamente, sin tocar reglas ni datos: mostrar el detalle de cobros dentro de la fila, filtro por estado, buscador dentro del selector de alumno, búsqueda por email adicional, y aclarar el comportamiento de "Ignorar" con opción de volver a "Detectado".
