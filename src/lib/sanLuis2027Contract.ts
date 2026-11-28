/**
 * Training Camp San Luis enero 2027 · borrador contractual y arquitectura de reserva.
 * SOLO ADMINISTRACIÓN. Nada de este módulo abre ventas, cobra, ni se publica.
 * Estructura de 12 secciones tomada del Training Camp San Luis 2026, adaptada a enero 2027.
 */
export const SAN_LUIS_2027_FULL_ID = '408a8eb8-fb62-4a50-ad6d-040bd5716797';
export const SAN_LUIS_2027_MINI_ID = '5380df24-6bbf-4d25-81cd-a1ab2b41bd94';
export const SAN_LUIS_2026_MODEL_ID = '67b4e85d-b00b-4b74-9644-99458d948c65';

export type DraftStatus = 'pendiente_validacion' | 'vigente';
export type Camp = 'full' | 'mini';
export type PhysicalGroup = 'hotel_doble' | 'hotel_individual' | 'cabana_3_plazas';

export interface CampStay { eventId: string; camp: Camp; label: string; checkIn: string; checkOut: string; nights: number; commercialCap: number }
export const SAN_LUIS_2027_STAYS: Record<Camp, CampStay> = {
  full: { eventId: SAN_LUIS_2027_FULL_ID, camp: 'full', label: 'Camp completo', checkIn: '2027-01-18', checkOut: '2027-01-24', nights: 6, commercialCap: 30 },
  mini: { eventId: SAN_LUIS_2027_MINI_ID, camp: 'mini', label: 'Mini Camp', checkIn: '2027-01-21', checkOut: '2027-01-24', nights: 3, commercialCap: 15 },
};

export interface ContractSection { key: string; title: string; body: string; status: 'pendiente_validacion' }

const P = 'pendiente_validacion' as const;
export function buildContractSections(camp: Camp): ContractSection[] {
  const s = SAN_LUIS_2027_STAYS[camp];
  const fechas = camp === 'full' ? 'del lunes 18 al domingo 24 de enero de 2027 (7 días, 6 noches, salida el domingo)' : 'del jueves 21 al domingo 24 de enero de 2027 (4 días, 3 noches, salida el domingo)';
  const extra = camp === 'full' ? ' La noche previa del domingo 17/01 puede solicitarse como opcional: su disponibilidad y precio se confirman aparte y no forman parte del paquete.' : '';
  return [
    { key: 'reserva_pagos', title: '1. Reserva y pagos', status: P, body: `El ${s.label} se realiza ${fechas}. La preinscripción no reserva cupo ni requiere pago. La plaza queda reservada únicamente cuando Ciclismo Reybaud confirma por escrito la disponibilidad de alojamiento y se acredita la seña. El importe de la seña, el plan de cuotas y la fecha límite del saldo se informarán antes de abrir las reservas [PENDIENTE: condiciones de seña y cuotas].` },
    { key: 'precio_inclusiones', title: '2. Precio e inclusiones del paquete', status: P, body: `Las tarifas son por ciclista y estimativas hasta la confirmación del hotel y del kit. Cada paquete incluye solo el tipo de alojamiento y la gastronomía indicados: habitación doble o individual con desayuno, almuerzo y cena; cabaña de 3 plazas con desayuno, almuerzo y cena; o cabaña de 3 plazas con desayuno y sin almuerzo ni cena. El desayuno en cabaña está sujeto a validación del hotel. Los servicios y detalles finales del kit se confirmarán antes de la reserva.${extra}` },
    { key: 'habitaciones', title: '3. Habitaciones y distribución', status: P, body: 'No se ofrecen habitaciones triples de hotel; las únicas plazas de a tres son cabañas. Las habitaciones y cabañas compartidas se asignan según disponibilidad, género y paquete contratado. Las solicitudes de compañero se consideran pero no se garantizan hasta la confirmación final del rooming.' },
    { key: 'cancelaciones', title: '4. Cancelaciones, cambios y transferencia de cupo', status: P, body: 'Las condiciones de cancelación, devolución y transferencia se informarán antes de abrir las reservas y se aceptarán junto con la reserva [PENDIENTE: texto validado]. Toda solicitud se realiza por escrito por los canales oficiales. Reprogramación: si condiciones meteorológicas adversas ponen en riesgo la seguridad, o si sobreviene una imposibilidad de realizar el camp, Ciclismo Reybaud podrá anunciar una nueva fecha. Las inscripciones se trasladarán a esa fecha sin pago adicional; cada participante recibirá aviso y podrá elegir mantener su lugar o solicitar el reintegro por el canal indicado.' },
    { key: 'programa_clima', title: '5. Programa y clima', status: P, body: 'Recorridos, horarios y actividades pueden ajustarse por clima, seguridad, estado de caminos, decisiones de autoridades o disponibilidad de proveedores. Ciclismo Reybaud prioriza la seguridad y procura ofrecer una alternativa equivalente.' },
    { key: 'aptitud_equipo', title: '6. Aptitud física y equipo', status: P, body: 'Cada participante declara condiciones de salud adecuadas y presenta apto médico vigente cuando se solicite. Es obligatorio usar casco, contar con una bicicleta en condiciones seguras y respetar las indicaciones del staff y las normas de tránsito.' },
    { key: 'nivel', title: '7. Nivel ciclista', status: P, body: 'El camp incluye salidas de ruta acordes al nivel informado por la organización. Cada persona debe informar lesiones, limitaciones, medicación relevante o cualquier condición que afecte su participación.' },
    { key: 'dietas', title: '8. Alimentación y necesidades especiales', status: P, body: 'Las necesidades alimentarias deben informarse dentro del plazo que se comunique al confirmar la reserva [PENDIENTE: fecha]. Se hará lo posible por contemplarlas, sin garantizar ausencia total de contaminación cruzada. En cabaña sin almuerzo ni cena, esas comidas quedan a cargo del participante.' },
    { key: 'seguros', title: '9. Seguro y pertenencias', status: P, body: 'Cada participante debe contar con obra social o prepaga y seguro de accidentes personales. Ciclismo Reybaud no responde por pérdida, robo o daño de bicicletas, equipos o pertenencias, salvo responsabilidad comprobable de la organización.' },
    { key: 'convivencia', title: '10. Convivencia y conducta', status: P, body: 'Se espera conducta respetuosa con participantes, staff, alojamiento, proveedores y comunidad local. La organización podrá limitar la participación de quien ponga en riesgo la seguridad o el normal desarrollo del camp.' },
    { key: 'imagen', title: '11. Uso de imagen', status: P, body: 'Podrán registrarse fotos y videos para comunicación de Ciclismo Reybaud. Quien no autorice el uso de su imagen debe informarlo por escrito antes del inicio.' },
    { key: 'canales', title: '12. Canales oficiales', status: P, body: 'Toda información válida sobre pagos, horarios, cambios, logística y reprogramaciones se comunica por los canales oficiales de Ciclismo Reybaud.' },
  ];
}

/** Causales: solo la fuerza mayor probada habilita reprogramar por esta vía; un problema del organizador no es fuerza mayor. */
export type RescheduleCause = 'clima_riesgo_seguridad' | 'imposibilidad_sobrevenida' | 'operativo_organizador';
export const RESCHEDULE_CAUSES: Record<RescheduleCause, { label: string; forceMajeure: boolean; note: string }> = {
  clima_riesgo_seguridad: { label: 'Clima adverso con riesgo para la seguridad', forceMajeure: true, note: 'Requiere evidencia (pronóstico/alerta oficial) guardada con el aviso.' },
  imposibilidad_sobrevenida: { label: 'Imposibilidad sobrevenida ajena al organizador', forceMajeure: true, note: 'Requiere evidencia (autoridad, cierre, caso fortuito) guardada con el aviso.' },
  operativo_organizador: { label: 'Problema operativo del organizador', forceMajeure: false, note: 'No es fuerza mayor: reintegro íntegro y revisión legal de cualquier otra consecuencia.' },
};

export const RESCHEDULING_PROCEDURE = [
  'Admin registra causal, evidencia, fecha original y nueva fecha propuesta (borrador, sin ejecutar).',
  'Revisión y aprobación explícita de un admin para la ejecución en lote.',
  'Aviso a cada participante con fecha original, nueva fecha, motivo, opciones y canal de reintegro; se guarda la fecha del aviso.',
  'Cada participante responde: mantener lugar en la nueva fecha o solicitar reintegro. No se impone la fecha sin posibilidad de respuesta.',
  'El traslado mueve la misma reserva con sus pagos (sin pago adicional, sin duplicar reservas ni pagos), conservando historial.',
  'Los reintegros se calculan sin deducciones automáticas y se ejecutan solo con aprobación manual.',
] as const;

export const INTERNAL_PROPOSALS = [
  { key: 'descuento_15_reintegro_post_reprogramacion', status: 'propuesta_interna_bajo_validacion_legal', vigente: false, publicable: false, aplicaAutomaticamente: false,
    text: 'Preferencia comercial: si tras una reprogramación el participante pide devolución, retener 15%.',
    legalNote: 'No vigente. Requiere revisión legal (Ley 24.240, arts. 10 bis y 37): podría ser abusiva, en especial si la causa es atribuible al organizador. Nunca aplicar a causales operativas del organizador.' },
] as const;

/** Reintegro por reprogramación: siempre el total acreditado, sin el 15% (propuesta no vigente). */
export function reschedulingRefundAmount(paidCredited: number): number {
  return Math.max(0, Math.round(Number(paidCredited) || 0));
}

export const RESERVATION_FLOW = [
  { key: 'solicitud_pendiente', label: 'Solicitud pendiente (preinscripción)' },
  { key: 'verificacion_alojamiento', label: 'Verificación manual de alojamiento, cupo y fechas superpuestas' },
  { key: 'sena', label: 'Seña acreditada' },
  { key: 'reserva_confirmada', label: 'Reserva confirmada' },
  { key: 'cuotas', label: 'Cuotas del saldo' },
  { key: 'terminos', label: 'Aceptación de términos' },
  { key: 'rooming', label: 'Rooming' },
] as const;

export const OPENING_BLOCKERS = [
  { key: 'inventario', label: 'Inventario confirmado por el hotel: dobles, individuales y cabañas de 3 plazas' },
  { key: 'simultaneo', label: 'Límite simultáneo de ciclistas 21–24/01 (camp completo + Mini) confirmado por hotel y vehículos' },
  { key: 'sena_cuotas', label: 'Importe de seña, plan de cuotas y fecha límite del saldo' },
  { key: 'noche_extra', label: 'Disponibilidad y precio de la noche extra del 17/01' },
  { key: 'reprogramacion', label: 'Política de reprogramación revisada legalmente' },
  { key: 'cancelacion', label: 'Texto de cancelación y transferencia validado' },
  { key: 'tarifas_kit', label: 'Reconfirmación de tarifas y kit' },
] as const;

export function packageGroup(nombre: string): PhysicalGroup {
  const n = nombre.toLowerCase();
  if (n.includes('cabaña') || n.includes('cabana')) return 'cabana_3_plazas';
  if (n.includes('individual')) return 'hotel_individual';
  return 'hotel_doble';
}

function nightsOf(checkIn: string, checkOut: string): string[] {
  const [y, m, d] = checkIn.split('-').map(Number); const [y2, m2, d2] = checkOut.split('-').map(Number);
  const out: string[] = []; const end = Date.UTC(y2, m2 - 1, d2);
  for (let t = Date.UTC(y, m - 1, d); t < end; t += 86400000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

export interface Occupant { camp: Camp; group: PhysicalGroup; extraNight17?: boolean }
export interface CapacityInput {
  /** Plazas físicas confirmadas por el hotel por grupo; null = sin confirmar (cierra). */
  inventory: Partial<Record<PhysicalGroup, number | null>>;
  /** Máximo de ciclistas simultáneos confirmado (hotel + vehículos); null = sin confirmar (cierra). */
  simultaneousCap: number | null;
  occupants: Occupant[];
}

/** Plazas que puede confirmar manualmente un admin. Falla cerrado: sin inventario o límite confirmados devuelve 0. */
export function bookableSpots(input: CapacityInput, camp: Camp, group: PhysicalGroup): { spots: number; blockers: string[] } {
  const blockers: string[] = [];
  const inv = input.inventory[group];
  if (inv == null || !Number.isInteger(inv) || inv < 0) blockers.push('inventario');
  if (input.simultaneousCap == null || !Number.isInteger(input.simultaneousCap) || input.simultaneousCap < 0) blockers.push('simultaneo');
  if (blockers.length) return { spots: 0, blockers };
  const stay = SAN_LUIS_2027_STAYS[camp];
  const commercial = stay.commercialCap - input.occupants.filter(o => o.camp === camp).length;
  let spots = commercial;
  for (const night of nightsOf(stay.checkIn, stay.checkOut)) {
    const present = input.occupants.filter(o => nightsOf(SAN_LUIS_2027_STAYS[o.camp].checkIn, SAN_LUIS_2027_STAYS[o.camp].checkOut).includes(night));
    spots = Math.min(spots, inv! - present.filter(o => o.group === group).length, input.simultaneousCap! - present.length);
  }
  return { spots: Math.max(0, spots), blockers };
}
