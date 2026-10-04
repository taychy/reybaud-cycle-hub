# Auditoría: Programa Iniciación 2026/2, Agenda y Clase Evaluatoria (solo lectura)

No se modificó nada. Abajo, lo que existe hoy y una propuesta para crear las clases sin duplicar (solo si la aprobás).

## 1. Programa Iniciación 2026/2

- Plan `c1e21518-5bc0-47a7-9342-eee8fa6a9854`: pago único, cohorte cerrada, del 15/08 al 03/10/2026. Cupo 15; cierre de inscripción el 22/08.
- Horario y sede: solo figuran como texto en la descripción ("Sábados 12:00 a 13:30 hs en el Circuito KDT"). El plan no guarda horario en ningún campo propio.
- Sede: una sola fila en `planes_sedes` (KDT), sin día, horario ni cupo cargados.
- Participantes: 12 suscripciones `finalizada` (pagaron y el programa terminó) y 7 `cancelada`.
- Las 8 clases existen en `programa_clases` (orden 1–8, 90 min cada una):
  1 Diagnóstica y Base Técnica · 2 Destrezas Básicas y Cadencia · 3 Introducción al Pelotón · 4 Técnica de Relevos · 5 Pararse en los Pedales · 6 Base Física Aplicada · 7 Autonomía del Ciclista · 8 Integración y Evaluación Final.
- Ninguna clase tiene fecha ni vínculo con Agenda (`agenda_fecha` y `agenda_grupal_id` vacíos). Todas están en `admin_estado = pendiente` y no tienen historial.
- Docentes planificados (`programa_clase_docentes`, todos sin confirmar):
  - Clase 1: Claudio, Scarlett y Daniela.
  - Clase 6: Claudio y Daniela.
  - Las otras 6 clases tienen un docente cada una (Claudio o Daniela).
- Las 8 fechas no están guardadas en ningún lado. Se deducen como sábados consecutivos desde el inicio:
  15/08, 22/08, 29/08, 05/09, 12/09, 19/09, 26/09 y la 8ª reprogramada del 03/10 al 10/10 por lluvia. Esto deja `fecha_fin_programa` (03/10) desactualizada.

## 2. Agenda y clases

- **Agenda (`agenda_grupal`):** es la fuente oficial de fecha, hora, sede y profesor. Admite dos tipos de clase:
  - `recurrente`: día de la semana + vigencia + `fechas_excluidas`.
  - `puntual`: con `fecha`.
  - Además tiene `serie_origen_id` para mover una fecha de una serie.
- **Sábados en KDT hoy:** solo grupos G1–G4 (Jorge, Claudio, Daniela). No hay ninguna fila del Programa de Iniciación, ni a las 12:00 ni con nombre de grupo o nota de iniciación.
- **Clases dictadas (`clases_dictadas`) → liquidación (`movimientos_liquidacion`):** son la fuente de honorarios. No hay clases dictadas en KDT de 11:30 en adelante entre el 15/08 y el 10/10, y ningún movimiento de liquidación menciona iniciación, programa o formación.
- **Vínculo con el programa:** ya existe la RPC de admin `programa_clase_vincular_agenda(clase, agenda, fecha, nota)`, que vincula y deja historial. La vista `vw_programa_clases_estado` cruza clase del programa → Agenda → clase dictada → liquidación.
- **En pantalla:** Admin → Programas → detalle → Playbook → "Clases del programa", con el botón "Vincular". Lo vincula a mano, de a una clase.

## 3. Clase Evaluatoria (Turnera → Agenda)

- Es el servicio de Turnera `clase-evaluatoria`. Cada reserva vive en `reservas_turnera`, con fecha, hora, profesor, sede y estado (`estado_operativo`: reservada, realizada o cancelada).
- La Agenda semanal no copia esas reservas: las lee en vivo de `reservas_turnera` y las muestra como turnos junto a las clases grupales. Por eso no se pueden duplicar.
- `grupoOperativo.ts` usa la evaluatoria (no cancelada) para clasificar al alumno; un programa de formación tiene prioridad sobre la evaluatoria.
- Hay 27 reservas de evaluatoria. Las de KDT del 05/09 y del 19/09 (Jorge, 11:30–13:30) son turnos individuales y no tienen relación con el programa.

## Conclusión: ¿se pueden crear automáticamente sin duplicar?

Sí. El modelo ya lo permite sin cambiar la estructura de la base. La garantía contra duplicados es que cada clase del programa tiene un único `agenda_grupal_id`.

## Propuesta (no ejecutada; requiere tu aprobación)

1. **Crear 8 clases puntuales en Agenda**, una por fecha. La 8ª va el 10/10, no el 03/10.
   - Datos: KDT, 12:00–13:30, grupo "Iniciación 2026/2".
   - Profesor: el primer docente planificado de cada clase.
   - Nota: "Programa Iniciación 2026/2 · Clase N". En la 8ª se agrega "reprogramada por lluvia desde 03/10".
2. **Vincular cada clase** con `programa_clase_vincular_agenda`, que deja el historial. En la 8ª se carga también la nota de excepción.
3. **Evitar duplicados:**
   - Saltear las clases que ya tengan `agenda_grupal_id`.
   - Antes de crear, buscar una clase puntual existente en la misma sede, fecha y hora; si la hay, vincularla en lugar de crear otra.
4. **Lo que no se toca:** no se crean `clases_dictadas` ni liquidaciones. Se siguen cargando por el flujo actual de confirmación y liquidación, así que no se generan honorarios automáticos ni dobles con lo ya importado de Drive.
5. **Opcional:** actualizar `fecha_fin_programa` al 10/10/2026.

## A confirmar antes de ejecutar

- En las clases 1 y 6 hay varios docentes. ¿Se crea una fila de Agenda por docente (cada uno liquida) o una sola con el docente principal?
- ¿El horario real fue 12:00–13:30 en todas las fechas?
- ¿Se ajusta la fecha de fin del programa al 10/10?
