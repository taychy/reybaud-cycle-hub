# Caso Marcelo Hamui: diagnóstico y corrección segura

Análisis de solo lectura. No se modificó ningún dato ni código.

## Qué pasó, punto por punto

### 1. Por qué existe la ficha de alumno de Marcelo
No es un "participante externo" del sistema: la ficha se creó por el registro normal de la app
(alumno creado 30/06/2026 22:11, usuario de acceso confirmado 01/07/2026 00:57, y su reserva del
Training Camp el 01/07 14:30). Es decir, se registró como alumno para poder reservar el viaje.
Su ficha quedó con grupo "Sin grupo", perfil incompleto y, hasta agosto, en estado inactivo.

### 2. De dónde salió la mensualidad de $65.500
La creó el checkout de planes de la propia app (pantalla de elección de plan), no un proceso
automático: se insertó la suscripción en estado pendiente el 30/08/2026 11:58:20 y 38 segundos
después llegó el pago aprobado. El período 01/08–31/08 es el que calcula esa pantalla para el mes
en curso.

Punto crítico confirmado en el código: esa pantalla identifica al alumno **leyendo un id guardado
en el navegador** (`registro_alumno_id` en localStorage), sin contrastarlo con la sesión que está
realmente iniciada. Ese id lo escriben registro, login, reingreso y varias pantallas, y queda
guardado indefinidamente. En un dispositivo compartido, el último id escrito manda.

### 3. Por qué el pago de Eugenia quedó en la ficha de Marcelo
Porque la preferencia de pago se generó con la suscripción de Marcelo como referencia externa. El
webhook no mira el email de quien paga: vincula por esa referencia. La cuenta pagadora (Eugenia)
sólo aparece como dato informativo. O sea: el pago se ató a Marcelo desde antes de pagarse, en el
momento en que se creó la suscripción con su id.

Contexto que refuerza la hipótesis del id viejo en el navegador: Eugenia ya había pagado su propio
plan de agosto el 04/08, y ese mismo 30/08 la familia estaba pagando la cuota 3 del Training Camp
de Marcelo. La mensualidad de $65.500 no corresponde a ninguna cuota del viaje.

Lo que **no** está probado documentalmente: qué persona/dispositivo abrió la pantalla, porque no
hay registro de auditoría de ese checkout. Es la primera cosa a instrumentar.

### 4. Por qué "no se lo ve" desde administración
Dos causas verificadas:
- El buscador de alumnos y el de Cuenta corriente exigen coincidencia de texto contigua. Su ficha
  dice "Marcelo Fabian Hamui": buscar "Marcelo Hamui" no encuentra nada.
- Estuvo inactivo hasta que el pago del 30/08 lo reactivó automáticamente ("reingreso" registrado
  11:59:01), por lo que antes no aparecía en las vistas de alumnos activos.
Su cuenta corriente sí existe y tiene saldo deudor de ARS 355.250 (saldo del viaje).

### 5. Otros casos con el mismo patrón
Se revisaron todos los pagos de mensualidad donde el email pagador no coincide con el del alumno.
Casi todos son parejas/empresas pagando el plan de otra persona real: comportamiento legítimo.
El único caso donde el pagador es otro alumno y el titular no tiene historia de alumno regular es
el de Marcelo. No hay contagio masivo.

## Propuesta de corrección

### A. Reparación del caso histórico (aparte, con aprobación explícita)
1. Decidir con Natalia si esa mensualidad se anula y el dinero se acredita a la cuota del viaje de
   Marcelo, o si se acredita como saldo a favor de Eugenia.
2. Ejecutarla con las herramientas ya existentes (reasignación / saldo a favor / imputación),
   dejando registro en auditoría. Sin borrar el pago ni la suscripción.
3. Revisar el estado de Marcelo: si no es alumno regular, volverlo al estado correcto y evitar que
   una futura reactivación automática lo vuelva a listar como activo.

### B. Prevención del bug (lo importante)
1. La pantalla de elección de plan debe validar que el alumno guardado en el navegador coincide
   con la persona con sesión iniciada. Si no coincide, descartar el id viejo y usar el de la
   sesión.
2. Limpiar ese id al cerrar sesión y al iniciar sesión con otra persona.
3. Mostrar el nombre del titular en el paso de confirmación del pago ("Vas a pagar el plan de
   X"), para que un error de identidad sea visible antes de pagar.
4. Registrar en auditoría quién inicia cada checkout de plan (usuario de sesión + alumno destino).

### C. Mejoras menores de búsqueda
Hacer que el buscador de alumnos y el de Cuenta corriente acepten palabras sueltas en cualquier
orden, para que "Marcelo Hamui" encuentre a "Marcelo Fabian Hamui".

## Detalle técnico
- `src/pages/PlanSelection.tsx:63` toma `localStorage.getItem("registro_alumno_id")` y lo usa en
  el insert de `suscripciones` (líneas 664-672) y en el payload a `create-mp-preference` (742).
- `supabase/functions/create-mp-preference/index.ts` valida plan/alumno/suscripción y fija
  `external_reference = suscripcion_id`.
- `supabase/functions/mp-webhook/index.ts` resuelve titularidad por `external_reference`; nunca por
  `payer_email`.
- Filtros de búsqueda: `src/pages/admin/ManageStudents.tsx:498-506` y
  `src/pages/admin/AdminCuentaCorriente.tsx:146-150`.
- Datos: suscripción `8aae29fc…` (creada 30/08 11:58:20), movimiento MP `4db19cde…`
  (pago 175392747499, `assigned_manually=false`), reserva del camp con seña + cuotas 2 y 3 pagas y
  cuota 4 pendiente por ARS 189.750.
