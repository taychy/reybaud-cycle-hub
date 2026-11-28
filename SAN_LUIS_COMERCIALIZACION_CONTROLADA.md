# San Luis enero 2027 — avance comercial controlado, 28/11/2026

## Acuerdo comercial sobre reprogramación (Scarlett, 28/11/2026; pendiente de revisión legal)
- Si el clima pone en riesgo la seguridad o existe imposibilidad sobrevenida ajena al organizador, Reybaud puede proponer una nueva fecha; la inscripción y los pagos se trasladan sin recargo, con aviso y opción de pedir reintegro.
- Ante pedido de devolución por no poder asistir, **tope propuesto del 15% de lo efectivamente abonado**, exclusivamente para gastos razonables, individualizados, ya incurridos, documentados e irrecuperables (ej.: jersey personalizado ya producido, adelantos de proveedores que no restituyen). Debe detallarse cada concepto antes de resolver el reintegro. El trabajo administrativo estimado no se descuenta automáticamente.
- Si la reprogramación es imputable a Reybaud, corresponde reintegro íntegro.
- Esta es **propuesta comercial interna, no condición vigente ni garantía de validez jurídica**. Aplicar solo tras revisión legal y aprobación del contrato final, considerando el derecho de revocación en ventas online. **Nunca aplicar 15% automáticamente**, ni abrir cobros por esta nota.
- Bajas voluntarias del participante y transferencias de cupo requieren política específica, todavía pendiente.

## Propuesta de bajas voluntarias para enero 2027 (pendiente de aprobación contractual)
- No reproducir automáticamente el corte histórico de 120 días: en enero 2027 toda venta nueva comienza dentro de ese período.
- Ante desistimiento voluntario por escrito, administración relevará gastos ya comprometidos, efectivamente incurridos y no recuperables (alojamiento, gastronomía, servicios, jersey personalizado), informará un detalle comprobable y determinará qué parte de lo abonado puede devolverse. No prometer un porcentaje de devolución sin conocer condiciones de los proveedores.
- Ofrecer transferencia a un reemplazante aprobado por Claudio/administración, siempre que haya cupo compatible y se formalice la reasignación sin duplicar reserva ni pagos. Si el reemplazante cubre el valor de la plaza, recalcular los gastos a descontar para evitar cobrar dos veces.
- Si la baja afecta una habitación compartida, cualquier recategorización o diferencia económica debe comunicarse y ser aceptada antes de imputarla a otra persona.
- Respetar derechos legales aplicables a ventas a distancia, incluidos plazos de revocación cuando correspondan. Esta propuesta no está vigente ni habilita cobro; revisión jurídica y aprobación de condiciones finales pendientes.

## Actualización 28/11 · preparación nativa implementada, cobro NO habilitado
- Migraciones 0130 y 0131 aplicadas: enlaces `trip_capacity_reservation_links`, preparación administrativa atómica por participante y ocho planes **inactivos** en las tablas de planes existentes. Plan 30% inmediato + 35% al 15/12/2026 + 35% al 10/01/2027; el constructor nativo conserva la exigibilidad de vencidos al reservar.
- Retenciones y reservas cuentan una sola vez en el mismo pool de 39. La conversión completa queda serializada por pool, idempotente y revierte grupo, enlaces y cuotas ante cualquier fallo. Cancelación administrativa libera capacidad sin tocar dinero; no reactivación ni liberación manual del hold convertido.
- Identidades se resuelven desde fichas existentes, con nombre/apellido y contacto individual por persona. No se crean ni sobrescriben fichas históricas; Naty debe revisar/crear la ficha mediante los controles administrativos existentes antes de convertir. Se rechaza doble reserva en ambos camps con fechas superpuestas.
- Se reutilizan `build_payment_plan_snapshot`, `materialize_reservation_installments`, `_accept_reservation_terms` y `/condiciones/:token`. El administrador nunca acepta en nombre del participante. Los borradores contractuales no se publican ni se usan como condiciones vigentes; se requieren términos explícitos validados, sin recurrir a valores genéricos.
- **Estado real:** `native_preparation_enabled=false`, `payment_handoff_enabled=false` (con restricción original), 0 reservas, 0 pagos, 0 holds y 0 enlaces; 8 paquetes y 8 planes inactivos. Landing y solicitudes públicas conservadas. Huellas de todos los eventos/paquetes y de solicitudes/leads idénticas antes/después. Contratos internos y metadata de preinscripción intactos.
- **Bloqueos:** condiciones finales de cancelación/reprogramación e inclusiones todavía no aprobadas; instrucciones de pago no aprobadas para este circuito; falta completar habilitación de seña, confirmación y prueba integral contra pasarela/cuenta corriente. No se afirma una seña exitosa ni un end-to-end financiero: está bloqueado. El 15% sigue interno y no vigente. Noche 17 solo consulta, no cargo.
- **Pruebas:** 68 Vitest aprobadas; PostgreSQL descartable con funciones nativas reales (grupos, cuotas y vencidos, aceptación pública por token, doble conversión, última plaza concurrente, límites39/30/15/10/20/9, permisos y rollback). Ninguna reserva/pago ficticio en Cloud. Compilación automática `build OK`; no se ejecutó ni se afirma typecheck manual separado.
- **Navegador:** público móvil390, ocho selecciones y dominio real HTTP200; administración con sesión propia, bandeja real vacía. Panel nuevo bloqueado inspeccionado con datos simulados solo en navegador y escrituras interceptadas; no hubo revisión/conversión sobre clientes reales. Sin errores de página. No publicación, deploy ni mensajes.
- **Archivos de este avance:** `src/components/admin/TripNativeHandoffPanel.tsx`, `src/components/admin/SanLuisEnrollmentRequestsPanel.tsx`, `src/lib/tripNativeHandoff.ts`, su test, `src/lib/sanLuisEnrollment.ts`; `tests/sql/trip_native_{fixture,functions_fixture,regression}.sql`, `trip_native_concurrency.py`, `run_trip_native_local.sh`; migraciones0130/0131, sus metadatos y tipos generados; `AGENTS.md`, `roadmap.md` y este documento. Las nuevas pantallas requieren publicación adicional autorizada; publicarlas no habilita cobros.

### Antecedente de 0129 (conservado como registro del avance anterior)

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
