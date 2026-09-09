# Actualización del sistema de emails

La actualización de envío de emails ya empezó, pero el proyecto está en modo plan y no puedo aplicar cambios en el código hasta que apruebes.

## Qué voy a hacer

- Pasar todos los envíos del sistema (avisos de pago, reservas, entregas, encuestas, recordatorios, facturación, coaches, alumnos, proveedores) a la nueva forma de envío administrada por Lovable.
- Mantener los emails de acceso a la cuenta (registro, código de ingreso, recuperación de contraseña, invitaciones) con los mismos textos en español que usás hoy.
- Conservar el historial de emails enviados tal como se ve hoy en el panel, incluida la copia exacta de cada mensaje.
- Mantener el registro de rebotes, quejas y bajas, y seguir marcando como "dado de baja" al contacto en la base de marketing cuando alguien se da de baja.
- Retirar la maquinaria vieja de cola de envíos, que deja de hacer falta.

## Qué no cambia hasta que publiques

Tu app en producción sigue funcionando exactamente igual. Nada de esto se activa hasta que publiques, y una vez publicado el cambio es permanente.

## Detalle técnico

- Hook de auth y plantillas de auth ya regenerados para envío administrado; hay que restaurar los asuntos en español y el nombre del remitente.
- Nuevo helper compartido de envío directo para las ~28 funciones que arman su propio HTML, replicando los registros de `email_send_log` (`sent` con snapshot, `suppressed`, `failed`).
- Receptor de eventos de email para rebote/queja/baja, portando la escritura en `suppressed_emails`, `email_send_log` y el opt-out de `marketing_contacts`.
- Baja de los archivos legacy: cola, despachador, suppression, unsubscribe, envío transaccional y la migración de infraestructura de email. Las tablas de datos se conservan.
- Build limpio al final; no se publica.
