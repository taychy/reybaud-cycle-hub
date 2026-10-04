# Dejar Programa Iniciación 2026/3 listo para inscripción

## Resultado
- Corregir el botón principal para que dependa de la fase comercial: preinscripción, inscripción o lista de espera.
- En inscripción, llevar al formulario de esta misma página sin perder el beneficio personal de la URL.
- Confirmar que el precio especial, las dos sedes y sus cupos se presentan correctamente y que el servidor sigue validando el beneficio.

## Verificación
- Revisar en la base que la ventana 03/10–16/10, KDT y Parque Sarmiento, horarios y cupos estén configurados.
- Probar la página pública en escritorio y móvil, incluyendo el enlace personal de prueba sin exponer su código.
- Validar que no se envíen emails ni se modifiquen precios, preinscriptos o suscripciones.

## Publicación
- Revisar el estado de seguridad requerido para publicar.
- Publicar el frontend y confirmar la URL esperada `https://reybaud-app.com`.

## Detalles técnicos
- El cambio queda limitado a la página pública del programa y, solo si falta configuración imprescindible, a los datos comerciales del Programa Iniciación 2026/3 autorizados en este pedido.
- El checkout seguirá enviando `benefit_token` y el servidor resolverá los importes, sin confiar en valores del navegador.
