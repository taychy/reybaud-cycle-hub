# San Luis enero 2027 — avance comercial controlado, 28/11/2026

## Listo
- Solicitudes públicas existentes conservadas, sin cobro ni confirmación automática.
- Inventario máximo compartido real: 39 personas (10 individuales, 20 plazas en 10 dobles, 9 plazas en tres cabañas). Cabaña staff excluida. Techos adicionales completo30/mini15; estadías parametrizadas y noches superpuestas controladas.
- Administración puede retener capacidad de una solicitud aprobada, con hotel validado para todas las personas, precio revisado y motivo. Una fila por solicitud; retención idempotente, sin vencimiento inventado, liberación explícita auditada. No asigna habitación ni crea reserva.
- Lecturas públicas agregadas únicamente; sin identidad, nombres ni solicitudes expuestas. Indicador por paquete no promete hotel confirmado; se actualiza al cambiar selección y cada minuto. Retener revalida dentro del bloqueo transaccional.
- Plan informativo30/35/35, fechas15/12/2026 y10/01/2027, vencidas exigibles al reservar; ocho tarifas sin modificación. Noche17 solo interés/cotización aparte.
- Contratos internos versión2, pendiente_validacion, con plan y stock. Versión1 intacta, 15% no vigente ni aplicado. No se modificó metadata.preregistration ni términos públicos.

## Bloqueos para cobros
- Falta implementar y probar la conversión de retención a reserva nativa por cada participante, con aceptación auditable de términos, materialización del plan y habilitación segura del pago. El alta nativa actual rechaza paquetes inactivos y no enlaza estas solicitudes/retenciones; no se la esquivó ni se activaron paquetes temporalmente.
- Falta revisión/aprobación de condiciones finales y cláusula15% según normativa. No se publicó como vigente ni se descontará automáticamente. Falta confirmación de servicios y hotel por solicitud.
- admin_review_event_enrollment_request sigue sin permitir pendiente_pago/confirmada. Un trigger adicional bloquea nuevas reservas nativas de estos dos eventos, incluso por otro camino, hasta conectar realmente el circuito. No hay pago ni ledger nuevo; no se probó un pago real porque permanece cerrado.
- Antes de habilitar ventas nativas, el mismo pool debe ser autoridad también para reservas, cambios y cancelaciones; no sumar retención y reserva del mismo participante ni liberar por estado de pago arbitrario.

## Pruebas / evidencia
- 65 pruebas unitarias y formularios aprobadas (8 archivos); segunda ejecución focalizada19/19.
- PostgreSQL local descartable: migración aplicada tal cual, límites10/20/9 y39, topes30/15, cabañas con/sin comidas compartidas, rechazo de identidad/importe/estado cambiados con retención, liberación/re-retención, bloqueo de alta nativa, anon sin permiso de leer holds ni ejecutar acción admin.
- Concurrencia real en PostgreSQL: dos compradores por última plaza, exactamente uno aprobado; dos reintentos del ganador no duplican; carrera por última plaza global39; techos independientes30/15. Máximo dos workers. Sin pruebas de escritura en Lovable Cloud.
- Navegador anónimo390px: ocho paquetes con valores reales del RPC, cero errores de página, sin desborde horizontal; tabla de holds denegada.
- Administración con sesión autorizada: bandeja y aviso compartido cargados. Bandeja vacía; acciones no verificadas sobre una solicitud real por no generar datos ficticios/alterar personas.
- Dominio reybaud-app.com/san-luis-2027 conserva formulario publicado de solicitudes. Cambios de pantalla nuevos solo en preview hasta publicación adicional autorizada.
- Compilación automática: build OK. No se ejecutó build/typecheck manual por restricciones del entorno; no se afirma un typecheck separado.
- Auditoría Cloud final: eventos borrador/inactivos; paquetes activos0; reservas0; pagos0; rooms0; holds0; handoff false. Ocho paquetes mapeados. No envíos, WhatsApp, mailing ni publicación.

## Archivos modificados / creados
- src/pages/SanLuis2027.tsx
- src/pages/SanLuis2027.test.tsx
- src/components/admin/SanLuisEnrollmentRequestsPanel.tsx
- src/components/event/SanLuisCommercialStatus.tsx
- src/lib/sanLuisCommercial.ts
- src/lib/sanLuisCommercial.test.ts
- src/lib/sanLuis2027Contract.ts
- src/lib/sanLuisEnrollment.ts
- tests/sql/trip_capacity_fixture.sql
- tests/sql/trip_capacity_regression.sql
- tests/sql/trip_capacity_concurrency.py
- tests/sql/run_trip_capacity_local.sh
- drizzle/migrations/0129_trip_shared_capacity_holds.sql
- drizzle/migrations/meta/0129_snapshot.json (generado)
- drizzle/migrations/meta/_journal.json (generado)
- src/integrations/supabase/types.ts (generado)
- AGENTS.md
- roadmap.md
- SAN_LUIS_COMERCIALIZACION_CONTROLADA.md

## Tablas
Nuevas: trip_capacity_pools, trip_capacity_events, trip_capacity_groups, trip_capacity_packages, trip_capacity_holds. Grants/RLS admin-only; escritura de holds solamente por RPC admin para clientes.
Existentes: event_contract_drafts agrega únicamente versión2 por cada evento; event_enrollment_requests agrega trigger de protección, event_reservations agrega bloqueo de alta; event_enrollment_request_history será el historial de retenciones futuras, sin filas agregadas en este turno. Events, event_packages, preinscripciones, pagos y cuenta corriente no modificados.

## Publicación
No se publicó ni desplegó. Cambios de Cloud ya aplicados; las pantallas nuevas requieren publicación adicional autorizada. Publicar no abre pagos: seguirán bloqueados hasta completar el handoff y revisar condiciones.
