// Checklist genérico de "Testeo técnico / Auditoría humana" de viajes.
// Reutilizable para cualquier viaje/camp; se persiste en events.metadata.technical_audit.

export type AuditStatus = "pendiente" | "ok" | "error";
export type AuditLink = "landing" | "lista_espera" | "gestion" | "terminos" | "mis_reservas" | "cambios_paquete" | "comunicaciones";

export interface AuditItemDef { id: string; label: string; link?: AuditLink }
export interface AuditSectionDef { id: string; titulo: string; items: AuditItemDef[] }

export interface AuditItemState {
  status: AuditStatus;
  observaciones?: string;
  responsable?: string;
  updated_at?: string;
  updated_by?: string;
}
export type AuditState = Record<string, AuditItemState>; // key = `${section}.${item}`

export const AUDIT_SECTIONS: AuditSectionDef[] = [
  { id: "landing", titulo: "Landing pública", items: [
    { id: "contenido", label: "Título, texto corto, descripción e imagen correctos", link: "landing" },
    { id: "fechas", label: "Fechas y duración (días/noches) correctas", link: "landing" },
    { id: "precio", label: "Precios y moneda de cada paquete correctos", link: "landing" },
    { id: "incluye", label: "Incluye / No incluye coherentes con el presupuesto", link: "landing" },
    { id: "itinerario", label: "Itinerario/roadbook visible y sin datos que no deban mostrarse", link: "landing" },
    { id: "ctas", label: "Botones de reserva / lista de espera funcionan", link: "landing" },
    { id: "responsive", label: "Se ve bien en celular y computadora", link: "landing" },
    { id: "links", label: "Todos los links abren donde corresponde", link: "landing" },
  ]},
  { id: "reserva", titulo: "Flujo de reserva / pre-reserva", items: [
    { id: "paquete", label: "Selección de paquete correcta", link: "landing" },
    { id: "datos", label: "Formulario de datos del participante completo y obligatorio", link: "landing" },
    { id: "alojamiento", label: "Elección de alojamiento / compañero de habitación", link: "landing" },
    { id: "cupos", label: "Cupos disponibles mostrados correctamente", link: "landing" },
    { id: "sobreventa", label: "No permite reservar con el paquete agotado (sin sobreventa)", link: "landing" },
  ]},
  { id: "pagos", titulo: "Seña / pagos", items: [
    { id: "valor_sena", label: "Valor de la seña correcto en la moneda del viaje", link: "landing" },
    { id: "acepta_condiciones", label: "Aceptación de condiciones obligatoria antes de pagar", link: "landing" },
    { id: "registro_aceptacion", label: "Queda registrada fecha, hora y usuario de la aceptación", link: "gestion" },
    { id: "estados", label: "Estados del pago correctos (pendiente / verificado / pagado)", link: "gestion" },
    { id: "cuotas", label: "Cuotas y vencimientos del plan correctos", link: "mis_reservas" },
  ]},
  { id: "condiciones", titulo: "Condiciones", items: [
    { id: "sena_no_reembolsable", label: "Dice que la seña no es reembolsable", link: "landing" },
    { id: "transferencia", label: "Seña transferible solo si otra persona toma el mismo paquete/cupo, con aprobación de Reybaud", link: "landing" },
    { id: "no_credito", label: "Aclara que no es crédito para otro viaje/paquete y que puede haber diferencias/costos", link: "landing" },
    { id: "terminos", label: "Términos generales accesibles", link: "terminos" },
  ]},
  { id: "cambios", titulo: "Cambios de alojamiento / paquete", items: [
    { id: "solo_admin", label: "Solo Admin puede aplicar el cambio", link: "cambios_paquete" },
    { id: "disponibilidad", label: "Respeta disponibilidad del paquete destino", link: "cambios_paquete" },
    { id: "diferencia", label: "Calcula la diferencia de precio", link: "cambios_paquete" },
    { id: "companero_cancela", label: "Compañero que cancela: opciones single o nuevo compañero aprobado", link: "gestion" },
  ]},
  { id: "cupos", titulo: "Cupos / lista de espera", items: [
    { id: "maximo", label: "Máximo rígido: no se supera la capacidad", link: "landing" },
    { id: "ultimo", label: "Aviso cuando queda 1 lugar", link: "landing" },
    { id: "espera_sin_sena", label: "Lista de espera no cobra seña", link: "lista_espera" },
    { id: "orden", label: "Al liberarse un cupo se avisa en orden de la lista", link: "lista_espera" },
  ]},
  { id: "emails", titulo: "Emails / confirmaciones", items: [
    { id: "reserva", label: "Email de reserva recibido", link: "comunicaciones" },
    { id: "pago", label: "Email de pago / seña recibido", link: "comunicaciones" },
    { id: "cambios", label: "Email de cambios recibido", link: "comunicaciones" },
    { id: "cancelacion", label: "Email de cancelación / transferencia recibido", link: "comunicaciones" },
    { id: "espera", label: "Email de lista de espera recibido", link: "comunicaciones" },
    { id: "alerta_admin", label: "Aviso a administración de nueva reserva recibido", link: "comunicaciones" },
  ]},
  { id: "admin", titulo: "Administración", items: [
    { id: "estado", label: "La reserva aparece con el estado correcto", link: "gestion" },
    { id: "trazabilidad", label: "Historial: quién hizo cada cambio y cuándo", link: "gestion" },
    { id: "datos", label: "Datos del participante completos", link: "gestion" },
    { id: "capacidad", label: "Capacidad / ocupación actualizada", link: "gestion" },
  ]},
  { id: "cancelacion", titulo: "Cancelación / transferencia", items: [
    { id: "cancelar", label: "Cancelar una reserva de prueba conserva el historial", link: "gestion" },
    { id: "transferir", label: "Transferir cupo a otra persona mantiene seña y trazabilidad", link: "gestion" },
    { id: "cupo_liberado", label: "El cupo liberado vuelve a estar disponible", link: "landing" },
    { id: "limpieza", label: "Reservas de prueba anuladas al finalizar", link: "gestion" },
  ]},
];

export const itemKey = (s: string, i: string) => `${s}.${i}`;

export function auditProgress(state: AuditState) {
  const keys = AUDIT_SECTIONS.flatMap((s) => s.items.map((i) => itemKey(s.id, i.id)));
  let ok = 0, error = 0;
  for (const k of keys) {
    const st = state[k]?.status;
    if (st === "ok") ok++; else if (st === "error") error++;
  }
  const total = keys.length;
  return { total, ok, error, pendiente: total - ok - error, pct: total ? Math.round((ok / total) * 100) : 0 };
}
