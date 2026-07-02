/**
 * Registro compartido de "pasos" de preparación del viaje.
 * Cada step_key define su label, ícono, descripción y (para los pasos
 * genéricos) el schema de campos que muestra `TripFormDrawer`.
 *
 * Los pasos "clásicos" (bici, pedales, pasaje, seguro) siguen teniendo
 * sus drawers dedicados; los pasos nuevos se manejan por el drawer genérico.
 */
import {
  Bike, Footprints, Plane, ShieldCheck, Utensils, BedDouble,
  Clock as ClockIcon, HeartPulse, MessageSquare,
} from "lucide-react";

export type FieldType = "text" | "textarea" | "number" | "select" | "date" | "time" | "toggle";

export interface FieldSchema {
  key: string;
  label: string;
  type: FieldType;
  placeholder?: string;
  options?: { value: string; label: string }[];
  help?: string;
  colSpan?: 1 | 2;
  required?: boolean;
}

export interface TripStepDef {
  key: string;
  label: string;
  shortLabel?: string;
  description: string;
  icon: typeof Bike;
  /** Si es true → tiene drawer dedicado (bici/pedales/pasaje/seguro). */
  hasDedicatedDrawer?: boolean;
  /** Schema para el drawer genérico. */
  fields?: FieldSchema[];
  /** Grupo visual dentro del resumen. */
  group: "logistica" | "personal";
}

export const TRIP_STEPS: TripStepDef[] = [
  {
    key: "bici",
    label: "Bicicleta y posición",
    shortLabel: "Bici",
    description: "Talle, estatura, fitting",
    icon: Bike,
    hasDedicatedDrawer: true,
    group: "logistica",
  },
  {
    key: "pedales",
    label: "Pedales y calas",
    shortLabel: "Pedales",
    description: "Tipo, cala, marca",
    icon: Footprints,
    hasDedicatedDrawer: true,
    group: "logistica",
  },
  {
    key: "pasaje",
    label: "Pasaje o transporte",
    shortLabel: "Pasaje",
    description: "Vuelo, micro, llegada",
    icon: Plane,
    hasDedicatedDrawer: true,
    group: "logistica",
  },
  {
    key: "seguro",
    label: "Seguro viajero",
    shortLabel: "Seguro",
    description: "Póliza vigente",
    icon: ShieldCheck,
    hasDedicatedDrawer: true,
    group: "logistica",
  },
  {
    key: "alimentacion",
    label: "Alimentación",
    shortLabel: "Comida",
    description: "Dieta, alergias, restricciones",
    icon: Utensils,
    group: "personal",
    fields: [
      {
        key: "dieta", label: "Tipo de dieta", type: "select", colSpan: 2,
        options: [
          { value: "omnivoro", label: "Omnívoro (sin restricciones)" },
          { value: "vegetariano", label: "Vegetariano" },
          { value: "vegano", label: "Vegano" },
          { value: "sin_gluten", label: "Sin gluten (celíaco)" },
          { value: "sin_lactosa", label: "Sin lactosa" },
          { value: "otra", label: "Otra (aclarar abajo)" },
        ],
      },
      { key: "alergias", label: "Alergias alimentarias", type: "textarea", placeholder: "Ej: frutos secos, mariscos…", colSpan: 2 },
      { key: "restricciones", label: "Otras restricciones o preferencias", type: "textarea", placeholder: "Aclará cualquier detalle importante para la cocina", colSpan: 2 },
    ],
  },
  {
    key: "habitacion",
    label: "Habitación",
    shortLabel: "Habitación",
    description: "Género, tipo, compañero",
    icon: BedDouble,
    group: "personal",
    fields: [
      {
        key: "genero_habitacion", label: "Género para asignación", type: "select",
        options: [
          { value: "femenino", label: "Femenino" },
          { value: "masculino", label: "Masculino" },
          { value: "mixto", label: "Sin preferencia / mixto" },
        ],
      },
      {
        key: "tipo_habitacion", label: "Tipo preferido", type: "select",
        options: [
          { value: "single", label: "Single (individual)" },
          { value: "doble", label: "Doble" },
          { value: "triple", label: "Triple" },
          { value: "cuadruple", label: "Cuádruple" },
          { value: "compartir", label: "Compartir (sin preferencia)" },
        ],
      },
      { key: "companero_solicitado", label: "Compañero de habitación (opcional)", type: "text", placeholder: "Nombre y apellido de otro inscripto", colSpan: 2 },
      { key: "notas_habitacion", label: "Comentarios sobre la habitación", type: "textarea", placeholder: "Ronca, se levanta temprano, necesita cama baja, etc.", colSpan: 2 },
    ],
  },
  {
    key: "arribo_partida",
    label: "Arribo y partida",
    shortLabel: "Llegada/salida",
    description: "Horarios, vuelo, traslado",
    icon: ClockIcon,
    group: "logistica",
    fields: [
      { key: "arrival_date", label: "Fecha de llegada", type: "date" },
      { key: "arrival_time", label: "Hora estimada", type: "time" },
      { key: "arrival_transport", label: "Medio de llegada", type: "select",
        options: [
          { value: "vuelo", label: "Vuelo" },
          { value: "auto", label: "Auto" },
          { value: "micro", label: "Micro / bus" },
          { value: "otro", label: "Otro" },
        ],
      },
      { key: "arrival_flight", label: "Nº vuelo / referencia", type: "text", placeholder: "Ej: AA1234" },
      { key: "arrival_airport", label: "Aeropuerto o punto de arribo", type: "text", placeholder: "Ej: BCN — El Prat", colSpan: 2 },
      { key: "needs_transfer", label: "Necesita traslado desde el punto de arribo", type: "toggle", colSpan: 2 },
      { key: "departure_date", label: "Fecha de partida", type: "date" },
      { key: "departure_time", label: "Hora de partida", type: "time" },
      { key: "arrival_notes", label: "Comentarios sobre logística", type: "textarea", colSpan: 2 },
    ],
  },
  {
    key: "salud_emergencia",
    label: "Salud y contacto de emergencia",
    shortLabel: "Salud",
    description: "Obra social, medicación, emergencia",
    icon: HeartPulse,
    group: "personal",
    fields: [
      { key: "obra_social", label: "Obra social / prepaga", type: "text" },
      { key: "numero_afiliado", label: "Nº de afiliado", type: "text" },
      { key: "grupo_sanguineo", label: "Grupo sanguíneo", type: "select",
        options: ["0+", "0-", "A+", "A-", "B+", "B-", "AB+", "AB-", "desconocido"].map(v => ({ value: v, label: v })),
      },
      { key: "medicacion", label: "Medicación habitual", type: "text", placeholder: "Nombre y dosis" },
      { key: "condiciones_medicas", label: "Condiciones médicas a informar", type: "textarea", placeholder: "Alergias, cirugías recientes, asma, etc.", colSpan: 2 },
      { key: "contacto_emergencia_nombre", label: "Contacto de emergencia — nombre", type: "text" },
      { key: "contacto_emergencia_vinculo", label: "Vínculo", type: "text", placeholder: "Ej: madre, pareja…" },
      { key: "contacto_emergencia_telefono", label: "Teléfono de emergencia", type: "text", placeholder: "Con código de país", colSpan: 2 },
    ],
  },
  {
    key: "peticiones",
    label: "Peticiones especiales",
    shortLabel: "Peticiones",
    description: "Cualquier pedido o consulta",
    icon: MessageSquare,
    group: "personal",
    fields: [
      { key: "peticiones", label: "Contanos lo que necesites", type: "textarea", placeholder: "Ej: llegada anticipada, día extra, celebración especial, etc.", colSpan: 2 },
    ],
  },
];

export const getTripStep = (key: string): TripStepDef | undefined =>
  TRIP_STEPS.find(s => s.key === key);
