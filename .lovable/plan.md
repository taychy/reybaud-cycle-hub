# Corregir portada de Emilia Romagna 2027

## Implementación
- Subir los seis originales descargados a almacenamiento permanente, manteniendo nombres y orden.
- Extender la configuración general de portada con `hero_display_style: "contain_blur_background"`.
- Renderizar ese estilo con la foto completa y nítida delante, más una copia desenfocada y oscurecida detrás; conservar navegación, indicadores, gestos y autoplay.
- Aplicar la configuración únicamente al evento indicado, preservando toda su metadata restante y apuntando `image_url` al primer original.
- Verificar la portada a 1720 px y en móvil, ejecutar las pruebas pertinentes y publicar.

## Límites
- No retocar ni recomprimir los originales.
- No borrar imágenes anteriores ni cambiar otros viajes.
- No modificar precios, cupos, pagos ni información operativa.
