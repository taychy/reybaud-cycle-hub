/** Lógica compartida de "Revisar y completar liquidación" (link de profesor y carga rápida admin). */

export const VIATICO_DEFAULT = 6000;

export const LIQ_TIPO_LABELS: Record<string, string> = {
  grupal_1h30: "Grupal 1h30",
  grupal_2h: "Grupal 2h",
  fondo_salida: "Fondo/Salida",
  extension_fondo: "Extensión fondo",
  tecnica: "Técnica",
  evento_escuela: "Evento Escuela",
  evaluatoria: "Evaluatoria",
  personalizada: "Personalizada",
  planilla: "Planilla",
  reunion_staff: "Reunión de staff",
  capacitacion: "Capacitación",
  elongacion: "Elongación",
  reintegro: "Reintegro",
  otro: "Otro",
  ajuste: "Ajuste",
  viatico: "Viático",
};

export const LIQ_ESTADO_ECON_LABELS: Record<string, string> = {
  pendiente_revision: "En revisión",
  liquidable: "Confirmado",
  liquidada: "Liquidado",
  no_liquidable: "No liquida",
};

export type Honorario = { id: string; nombre: string; categoria: string; valor: number };

export type ItemDraft = {
  key: string;
  fecha: string;
  honorario_id: string; // "" = solo reintegro
  grupo: string;
  detalle: string;
  entrada: string;
  estacionamiento: string;
  viaticos: string;
  extras: string;
  observaciones: string;
};

/** Mismo criterio que `_liq_derivar_tipo` en la base. */
export function derivarTipo(nombre: string | null | undefined): string {
  const n = (nombre || "").toLowerCase();
  if (!n) return "reintegro";
  if (n.startsWith("planilla")) return "planilla";
  if (n.startsWith("reuni")) return "reunion_staff";
  if (n.startsWith("capacitaci")) return "capacitacion";
  if (n.startsWith("extensi")) return "extension_fondo";
  if (n.startsWith("fondo")) return "fondo_salida";
  if (n.startsWith("pista") || n.startsWith("grupal 2h")) return "grupal_2h";
  if (n.startsWith("grupal")) return "grupal_1h30";
  if (n.startsWith("particular")) return "personalizada";
  if (n.startsWith("elongaci")) return "elongacion";
  return "otro";
}

/** Conceptos que no requieren grupo ni alumno. */
export function sinGrupo(tipo: string): boolean {
  return ["planilla", "reunion_staff", "capacitacion", "reintegro", "otro"].includes(tipo);
}

const num = (s: string) => {
  const v = Number(String(s).replace(",", "."));
  return Number.isFinite(v) && v > 0 ? v : 0;
};

export function itemTotal(item: ItemDraft, honorarios: Honorario[]): number {
  const hon = honorarios.find((h) => h.id === item.honorario_id);
  return Number(hon?.valor || 0) + num(item.entrada) + num(item.estacionamiento) + num(item.viaticos) + num(item.extras);
}

export function itemValido(item: ItemDraft, mes: string): string | null {
  if (!item.fecha || !item.fecha.startsWith(mes + "-")) return "La fecha debe ser del mes de la liquidación";
  const montos = [item.entrada, item.estacionamiento, item.viaticos, item.extras].map((s) => Number(String(s || 0).replace(",", ".")));
  if (montos.some((m) => !Number.isFinite(m) || m < 0)) return "Los importes no pueden ser negativos";
  if (!item.honorario_id && montos.every((m) => m === 0)) return "Elegí un concepto o cargá un importe";
  return null;
}

/** Payload para las RPCs: nunca envía valor del honorario (lo resuelve el servidor). */
export function toPayload(items: ItemDraft[], honorarios: Honorario[]) {
  return items.map((i) => {
    const hon = honorarios.find((h) => h.id === i.honorario_id);
    return {
      fecha: i.fecha,
      honorario_id: i.honorario_id || null,
      tipo_actividad: derivarTipo(hon?.nombre),
      grupo: i.grupo.trim() || null,
      detalle: i.detalle.trim() || null,
      entrada: num(i.entrada),
      estacionamiento: num(i.estacionamiento),
      viaticos: num(i.viaticos),
      extras: num(i.extras),
      observaciones: i.observaciones.trim() || null,
    };
  });
}

export function nuevoItem(mes: string): ItemDraft {
  const hoy = new Date();
  const hoyStr = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`;
  return {
    key: Math.random().toString(36).slice(2),
    fecha: hoyStr.startsWith(mes) ? hoyStr : `${mes}-01`,
    honorario_id: "",
    grupo: "",
    detalle: "",
    entrada: "",
    estacionamiento: "",
    viaticos: String(VIATICO_DEFAULT),
    extras: "",
    observaciones: "",
  };
}

export function mesLabel(mes: string): string {
  const [y, m] = mes.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("es-AR", { month: "long", year: "numeric" });
}

export const formatARS = (n: number) => `$${Math.round(Number(n || 0)).toLocaleString("es-AR")}`;
