# Auditoría: Alejandro Najmanovich "pagué y no puedo entrar"

Solo lectura. No se modificó código, base de datos ni configuración.

## Diagnóstico en una línea

Alejandro **sí pagó** (hoy, 4/9, $83.500 aprobado), pero ese pago entró por la cuenta de Mercado Pago externa (la de Claudio) y **quedó sin vincular a su cuota de septiembre**. Su cuota sigue marcada como "pendiente", y la app le muestra la pantalla de acceso limitado. **No es un problema de contraseña ni de login.**

## Qué encontré

**Su ficha (todo correcto)**
- Alejandro Najmanovich, email `anajmanovich58@gmail.com`, estado **activo**, grupo **G2**.
- Su usuario de acceso existe, con el **mismo email** que la ficha, correo confirmado, sin bloqueos y correctamente vinculado. Sin duplicados.
- Último ingreso registrado: 30/7. No hay señales de problema de contraseña ni de alta incompleta.

**El pago**
- 4/9/2026 12:08 — **$83.500 ARS, aprobado**, concepto "REYBAUD CLAUDIO GUSTAVO".
- El importe coincide exacto con el precio de su plan de septiembre.
- El pago quedó **asociado a Alejandro pero no a la cuota**: figura sin suscripción vinculada.
- Mismo patrón en meses anteriores (julio y agosto), donde la cuota se resolvió a mano.

**Su cuota**
- Septiembre (1 al 30), plan "Pase Libre Mensual", $83.500 → estado **pendiente** (además con una marca de error "400" del intento de pago por la app).
- Agosto y julio: vencidas (fueron cobradas por fuera).

**Por qué la app lo limita**
La app decide el acceso mirando el estado de la cuota. Como la de septiembre está en "pendiente", cae en la regla de "mensualidad pendiente": puede entrar al inicio, pero **sin eventos, sin tienda, sin progreso y sin marcar entrenamientos**, con el cartel de pago pendiente. Para él eso se siente como "no puedo entrar".

**Clasificación:** caso **B** — inicia sesión, pero la app le restringe el acceso por estado de cuota. No es A (credenciales) ni C.

## No es un caso aislado

Con el mismo patrón hoy hay **14 alumnos activos**: pago aprobado de septiembre por la cuenta externa, cuota de septiembre todavía en "pendiente". Entre ellos: Celuch, Lobbosco, Carlés, Ramirez, Fraser, Tapia, Blasco, Tempone, Graziuso, Pan, Iannicelli, Leis, Banchi. Todos están viendo la app limitada aunque pagaron.

## Corrección mínima y segura (a confirmar antes de ejecutar)

1. **Caso urgente:** vincular el pago del 4/9 a la cuota de septiembre de Alejandro y dejarla como paga. Acceso restablecido al instante, sin tocar su usuario ni su historial.
2. **Los otros 13:** revisar uno por uno que importe y fecha coincidan con la cuota del mes, y aplicar el mismo vínculo. Solo donde la coincidencia sea exacta; el resto queda para revisión manual.
3. **Causa de fondo (etapa siguiente, opcional):** los pagos cobrados por la cuenta externa no se imputan solos a la cuota. Conviene una pantalla de "pagos por imputar" con sugerencia automática por alumno + importe + mes, para que esto no se repita cada inicio de mes.

Nada de esto borra ni altera pagos ni cuotas históricas: solo agrega el vínculo faltante.

## Lo que no puedo afirmar

No tengo evidencia de que Alejandro haya intentado iniciar sesión hoy. Si además dice que "no le acepta el correo", habría que confirmarlo con captura del error; con los datos actuales, su cuenta está sana y lo único que falla es la cuota sin vincular.
