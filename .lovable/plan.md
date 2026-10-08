# Página de Bormio "La Gran Conquista Alpina": auditoría y plan (todavía sin cambios)

## Lo que ya existe (revisado en la base real)
- **El viaje ya está cargado en borrador:** "Italia, Suiza y Austria: La Gran Conquista". Está oculto: no es público ni visible para alumnos y no tiene reservas.
  - Moneda EUR, pago en cuotas, cupo de 20, 7 noches, y una política de pago internacional ya configurada (EUR efectivo sin recargo; transferencia en ARS +7%).
  - Tiene dos paquetes: **Doble €3.888** e **Individual €4.413**, ambos con seña de €500 y cupo de 10. No tiene etapas de precio ni plan de cuotas.
  - Tiene **fechas cargadas 21/06/2027 al 28/06/2027, que no están confirmadas**. Esas fechas se muestran en la tarjeta y en la página del viaje, y también se usan para calcular las cuotas y los plazos de cambio.
- **Viaje que conviene usar como modelo: Emilia Romagna 2027.** Ya está publicado y usa las mismas piezas: portada con varias fotos, preguntas frecuentes, política de pago internacional, alojamiento, auditoría técnica y audiencia abierta.
- **La página pública es la misma para todos los viajes.** Se arma sola con los datos de cada viaje: portada con fotos, aviso de precio, qué incluye y qué no, itinerario, planes de pago, paquetes, reserva de alumnos e invitados, y cobro con Mercado Pago o efectivo. Agregar Bormio no requiere una página nueva, solo cargar sus datos.

## Diferencias detectadas con tu pedido
1. El precio doble cargado es **€3.888**, pero pediste **€3.890**. Además, la Individual (€4.413) no tiene precio por etapas definido. Necesito que confirmes los precios de la Individual.
2. Las etapas de precio (€3.890 hasta 30/11/2026, €4.279 hasta 31/01/2027 y €4.706,90 después) no están cargadas.
3. **Riesgo principal: las fechas.** La app exige fecha de inicio para todo viaje y hoy tiene una cargada que no está confirmada. Publicar así expondría esa fecha y calcularía cuotas sobre ella.
4. El plan de cuotas automático necesita fecha de viaje y de lanzamiento. Sin fecha confirmada no se puede generar correctamente.

## Propuesta (cambios mínimos)
**Paso A: cargar datos solo de este viaje, sin tocar código ni otros viajes**
- Portada con fotos de las etapas y de las bicis Cannondale SuperSix EVO y Scott Addict (Shimano 105 electrónico). Las fotos las aportás vos o se suben al almacenamiento de imágenes de viajes.
- Descripción, itinerario de 7 etapas (538 km y +11.610 m aprox.: Gavia, Bernina, Stelvio, Resia, Innsbruck, Dolomitas), qué incluye y qué no.
  - Incluye: transfers Milán-Bormio y Ortisei-Milán para personas y equipaje, excepto bike boxes; 7 noches en hoteles 3* con desayuno; alquiler de bici de ruta; van de apoyo diario; traslado de equipaje; preparación específica Reybaud.
  - La asistencia y el avituallamiento figuran como "a validar".
- Etapas de precio en el paquete doble y seña de €500.
- Preguntas frecuentes sin reglas de cancelación (quedan vacías hasta confirmarlas).
- Antes de cargar nada, guardo una copia del estado actual para poder volver atrás.

**Paso B: "fechas a confirmar" (único cambio de código, se activa solo por viaje)**
- Una opción en los datos del viaje que, cuando está prendida, muestra "Fechas a confirmar" en lugar de la fecha en la tarjeta y en la página.
- Mientras esté prendida, la cuota final dice "un mes antes del viaje (fecha a confirmar)" y no se genera el calendario de cuotas.
- Los viajes que no tengan la opción se ven igual que hoy.

**Paso C: revisión y publicación (solo con tu autorización)**
- Primero veo la página en la vista previa con el viaje todavía oculto. Recién después, si lo autorizás, se publica.

## Vuelta atrás
- Datos: restaurar la copia guardada del viaje, sus paquetes y sus etapas de precio, o volver a ponerlo en borrador.
- Código: apagar la opción de fechas a confirmar o deshacer el cambio. Al no haber reservas, no se afecta a nadie.

## Pruebas
- Pruebas automáticas de la nueva opción: prendida muestra "Fechas a confirmar"; apagada se ve exactamente igual que hoy.
- Pruebas de etapas de precio con 30/11/2026 y 31/01/2027 como límites.
- Revisar que Emilia Romagna, Girona y San Luis se sigan viendo igual en la vista previa.
- Correr las pruebas automáticas existentes y comprobar que la app compile.
- Simular una reserva de prueba sin pagar, para ver que la seña sea de €500 y que el recargo en ARS se aplique bien.

## Qué necesito de vos
1. Precio de la habitación Individual en cada etapa.
2. Confirmar €3.890 (en lugar de €3.888) como precio doble de lanzamiento.
3. Fotos de las bicis y de las etapas, o autorización para usar las que ya están cargadas.
4. Si preferís mantener el viaje oculto hasta tener la fecha, puedo saltear el Paso B.
