UPDATE entrenamientos
SET descripcion = REPLACE(descripcion, E'\n[object Object]', '')
WHERE descripcion LIKE '%[object Object]%';

UPDATE entrenamientos
SET descripcion = REPLACE(descripcion, '[object Object]', '')
WHERE descripcion LIKE '%[object Object]%';