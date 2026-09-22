# Referencia del pedido en avisos de camioneta

## Cambios
- Extender el generador compartido para aceptar una referencia opcional formada por número, primer producto, variante resumida, cantidad y restantes.
- Usar esa referencia en los avisos de Depósito > Pedidos y en “Recordar retiro” de Camioneta, incluidos pedidos externos.
- Mantener sin cambios saldos, estados de pago, texto de efectivo, confirmación manual y registro de avisos.
- Agregar pruebas unitarias para referencias, variantes, fallbacks y mensajes pagado/efectivo pendiente.

## Validación
- Ejecutar las pruebas relevantes y la comprobación de tipos.
- No publicar ni desplegar.
