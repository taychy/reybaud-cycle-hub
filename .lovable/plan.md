# Mejorar Resumen de Liquidaciones

## Cambios
- Abrir Liquidaciones en el mes anterior al actual, conservando el selector de meses.
- Encabezar el Resumen como “Liquidaciones por profesor · {mes}”.
- Destacar por profesor Total cargado, Confirmado, Pendiente de revisión y cantidad de movimientos.
- Agregar un botón explícito para mostrar u ocultar el detalle.
- Completar el detalle con Fecha, Tipo, Detalle, Base, Viáticos, Entrada, Estacionamiento, Extras, Total y Estado económico.
- Mostrar un estado vacío claro y ofrecer el mes anterior cuando tenga movimientos.

## Alcance técnico
- Modificar únicamente `src/pages/admin/AdminLiquidaciones.tsx`.
- No cambiar datos, estados, honorarios, reglas, funciones SQL ni la cola global de Revisar.
- Verificar en móvil que septiembre de 2026 abra por defecto, que Jorge y Daniela muestren sus importes esperados y que el detalle de Jorge se expanda correctamente.
- Confirmar compilación y publicar a producción.
