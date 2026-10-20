# San Luis · Aprobación de salida

Evento: `67b4e85d-b00b-4b74-9644-99458d948c65`. Preparación exclusivamente; no activar ni publicar por este documento.

## Configuración verificada el 20/10/2026
- 32 reservas vigentes. Público desactivado. Cero solicitudes, propuestas, cuentas o movimientos de crédito antes de QA.
- Seis elecciones: 5–8/11 (3 noches), 6–9/11 (3 noches), 5–9/11 (4 noches), devolución, crédito nominal ARS para otro Training Camp y ayuda.
- Sin selección inicial. La edición conserva la elección anterior, pero requiere renovar consentimiento.
- Política del organizador: 100% efectivamente pagado menos reintegros anteriores; no es cancelación voluntaria ni tiene plazo de devolución acordado.
- Jersey optativo ARS 50.000 sólo para devolución/crédito. Consentimiento, talle, entrega, stock y saldo suficiente deben validarse antes de cualquier futura deducción.
- Enero figura 17–24/01/2027 en BD; se conversó 20–27/01. Requiere definición; NO modificar ahora.

## Checklist humano antes de abrir decisiones
- [ ] Confirmar proveedores, costos y alojamiento de las tres ventanas (3/4 noches).
- [ ] Confirmar restricciones de paquetes; ninguna decisión convierte automáticamente paquete, habitación ni fechas.
- [ ] Confirmar stock real, talles sin conflicto, retiro/envío y cualquier costo de envío consentido.
- [ ] Designar responsable para pagos a terceros, transferencias, monedas ambiguas y comprobantes duplicados.
- [ ] Confirmar que las alertas contables NO impiden responder; sí impiden validar cuantías o ejecutar dinero.
- [ ] Validar la página y el lenguaje con la usuaria.
- [ ] Revisar cambios pendientes de TODO el proyecto antes de publicar: mailing y Maratona también pueden salir con el mismo frontend.
- [ ] Autorizar por separado actualización de app y activación de recepción de decisiones.

## Acceso personal, sin enviar todavía
En Administración → Eventos → gestión de San Luis → reserva correcta → **Copiar link de acceso**. El enlace existente usa `https://reybaud-app.com/viaje/mi-reserva?token=…`; desde esa reserva se ofrece la reprogramación cuando esté habilitada. Para titulares con sesión existen Mis Reservas y el acceso a su decisión.

No usar la URL genérica como enlace personal. No listar tokens, pegarlos en reportes, capturas o registros; tratarlos como claves de acceso. El acceso debe seguir ligado a esa reserva, no a búsquedas por nombre/email ni a otra persona.

### WhatsApp manual (borrador, no enviado)
Hola, {nombre}. Reprogramamos el Training Camp San Luis para noviembre. Desde tu acceso personal podés elegir 5–8/11, 6–9/11, 5–9/11, solicitar devolución, crédito para otro Training Camp o ayuda: {enlace_personal_copiado_en_gestion}. La respuesta registra tu solicitud: no cancela la reserva ni devuelve o acredita dinero. Si necesitás ayuda, estamos para acompañarte. Equipo Ciclismo Reybaud.

### Correo (borrador, no enviado)
**Asunto:** Training Camp San Luis · Tu elección para la reprogramación

Hola, {nombre}. Queremos conocer tu decisión ante el cambio de fecha organizado por Reybaud. Usá tu enlace personal {enlace_personal_copiado_en_gestion} para consultar las seis opciones y registrar tu elección. Si no podés asistir, podés solicitar devolución o crédito nominal en ARS para otro Training Camp del 100% efectivamente abonado, menos reintegros previos. No se acordó un plazo de reintegro. El jersey de ARS 50.000 es optativo y no condiciona la devolución. Registrar la elección no devuelve dinero ni habilita crédito. Equipo Ciclismo Reybaud.

Son comunicaciones operativas individuales: no habilitar campañas, envíos automáticos ni mensajes sin confirmación humana. Antes de cualquier automatización revisar permiso administrativo, titular/destinatario correcto, consentimiento y exclusiones aplicables, prueba, idempotencia e historial; este documento no autoriza usar ni modificar el mailing.

## Publicación controlada (NO ejecutada)
1. Revisar cambios finales del proyecto y obtener aprobación explícita de la usuaria para esa versión completa.
2. En Lovable, abrir **Publish → Update** sólo con esa autorización. Esto publica todo el frontend, no una única ruta. No cambiar `public_enabled` ni los bloqueos financieros durante la publicación.
3. Abrir en incógnito `https://reybaud-app.com/reprogramacion/67b4e85d-b00b-4b74-9644-99458d948c65`: debe mostrar “En revisión administrativa”, sin identidad/montos.
4. Revisar móvil y escritorio, accesos históricos y administración; comprobar que la baja del mailing y Maratona no presentan regresiones, sin enviar ni reservar.
5. Con aprobación posterior independiente, habilitar exclusivamente recibir decisiones. No deshabilitar `camp_account_locked` ni `camp_ledger_locked`.
6. Tras habilitación, comprobar titular/token válido, inválido y cruzado, seis opciones sin preselección, consentimiento y registro en la reserva correcta. No crear solicitudes ficticias persistidas en producción; usar una decisión real autorizada o un entorno aislado.
7. Confirmar lectura posterior de esa solicitud y su historial en administración. No afirmar E2E de producción hasta hacerlo.
8. Si falla, cerrar nuevamente la recepción mediante acción administrativa autorizada y revisar la versión; no borrar historial ni revertir pagos/datos.

## Límites de QA
La activación de prueba sólo puede ocurrir dentro de BEGIN…ROLLBACK; no es habilitación pública. Las pruebas de concurrencia de versión/reintentos no equivalen a carga simultánea entre múltiples sesiones. No habilitar ejecución monetaria por el éxito de este QA.