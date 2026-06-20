// Defaults para reglamento y políticas de eventos tipo camp / viaje.
// Si el evento es de otra categoría, los campos quedan vacíos para que el admin los cargue.

export const REGLAMENTO_DEFAULTS_CAMP_VIAJE = {
  politica_sena:
    "La seña confirma tu lugar en el evento y NO es reembolsable. Se descuenta del total del paquete contratado.",
  politica_cancelacion:
    "• Hasta 30 días antes del inicio: devolución del saldo abonado (la seña no se reintegra).\n" +
    "• Entre 30 y 15 días antes: 50% del saldo abonado (la seña no se reintegra).\n" +
    "• Menos de 15 días antes o no presentarse: sin devolución.\n" +
    "• Casos de fuerza mayor (lesión con certificado médico, fallecimiento de familiar directo) se evalúan individualmente y pueden generar crédito a favor para futuros eventos.",
  politica_pagos:
    "• El saldo puede abonarse en cuotas según el plan elegido al reservar.\n" +
    "• Métodos de pago: Mercado Pago (link), transferencia bancaria o efectivo.\n" +
    "• La última cuota vence 7 días antes del inicio del evento.\n" +
    "• Si una cuota queda impaga, el equipo se contactará para regularizar antes de liberar el cupo.",
  reglamento_texto:
    "PARTICIPACIÓN Y RESPONSABILIDAD\n" +
    "• El participante declara estar en condiciones físicas para realizar la actividad y, si corresponde, contar con certificado médico vigente.\n" +
    "• Es responsabilidad del participante contar con seguro de viaje y/o accidentes personales propio.\n\n" +
    "EQUIPAMIENTO OBLIGATORIO\n" +
    "• Casco homologado (uso obligatorio en todas las salidas).\n" +
    "• Bicicleta en buen estado mecánico, revisada antes del viaje.\n" +
    "• Luz delantera y trasera para salidas con poca luz.\n" +
    "• Kit básico de reparación (cámara, infladores, herramientas).\n\n" +
    "DURANTE EL EVENTO\n" +
    "• Respetar los horarios de salida y el ritmo del grupo asignado.\n" +
    "• Seguir las indicaciones de coaches y guías en todo momento.\n" +
    "• Respetar a compañeros/as, staff, alojamiento y entorno natural.\n" +
    "• Está prohibido el consumo de alcohol durante las salidas en bici.\n\n" +
    "ALOJAMIENTO Y CONVIVENCIA\n" +
    "• Cuidar el alojamiento y los espacios comunes.\n" +
    "• Respetar los horarios de descanso del grupo.\n" +
    "• Cualquier daño causado al alojamiento corre por cuenta del participante.\n\n" +
    "DERECHO DE ADMISIÓN\n" +
    "La organización se reserva el derecho de admisión y permanencia ante incumplimiento del reglamento, sin generar derecho a reembolso.\n\n" +
    "USO DE IMAGEN\n" +
    "Durante el evento se toman fotos y videos que pueden usarse con fines de difusión de la escuela. Si no querés aparecer, avisanos al inicio del viaje.",
} as const;

export type ReglamentoFields = {
  politica_sena?: string;
  politica_cancelacion?: string;
  politica_pagos?: string;
  reglamento_texto?: string;
  reglamento_url?: string;
  terminos_version?: string;
};

export const extractReglamento = (metadata: any): ReglamentoFields => {
  const m = metadata || {};
  return {
    politica_sena: m.politica_sena || "",
    politica_cancelacion: m.politica_cancelacion || "",
    politica_pagos: m.politica_pagos || "",
    reglamento_texto: m.reglamento_texto || "",
    reglamento_url: m.reglamento || m.reglamento_url || "",
    terminos_version: m.terminos_version || "1",
  };
};

export const hasAnyReglamento = (r: ReglamentoFields): boolean =>
  !!(r.politica_sena || r.politica_cancelacion || r.politica_pagos || r.reglamento_texto || r.reglamento_url);

// True for trip / camp categories — where we precarga the defaults.
export const isCampOrViajeType = (eventType?: string | null): boolean => {
  if (!eventType) return false;
  return ["camp", "viaje", "training_camp"].includes(eventType);
};
