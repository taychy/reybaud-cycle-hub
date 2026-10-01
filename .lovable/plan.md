# Portada configurable para Viajes/Eventos

## Objetivo
Permitir que cada viaje o evento use una imagen única o un carrusel, sin migración y sin cambiar las imágenes actuales de Austria ni Emilia Romagna.

## Implementación
- Centralizar la interpretación de `metadata.hero_mode`, `metadata.hero_images`, `metadata.hero_autoplay` y `metadata.hero_image_fit`, con fallback estricto a `image_url` y al comportamiento actual.
- Crear un hero reutilizable con anterior/siguiente, indicadores, swipe táctil, autoplay suave opcional y pausa tras interacción.
- Mantener los botones volver, compartir y favorito por encima de las imágenes y fuera de las zonas críticas; conservar exactamente el layout actual cuando no hay carrusel válido.
- En Admin → Eventos/Viajes → editar viaje → Datos generales, sumar selector Imagen única/Carrusel, carga o URL, orden, eliminación, ajuste Contener/Cubrir y autoplay opcional.
- Guardar todo en `events.metadata`; `image_url` seguirá siendo la imagen principal y fallback.

## Compatibilidad
- `hero_mode='carousel'` solo activa el carrusel con 2 o más imágenes válidas.
- Sin `hero_images`, con una sola imagen o en modo `single`, se conserva el hero actual.
- `hero_image_fit='contain'` seguirá mostrando completa la portada de Emilia Romagna; `cover` será el valor por defecto para fotos.
- No se editarán registros, imágenes, precios, fechas ni publicación de Austria o Emilia Romagna.

## Verificación
- Agregar pruebas unitarias para resolución de modo, fallback, deduplicación y compatibilidad con `contain`.
- Ejecutar las pruebas relevantes.
- Verificar visualmente en mobile y desktop tanto el fallback actual como un carrusel temporal solo en el navegador, sin guardar datos reales.
