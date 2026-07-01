/**
 * Shared subscription status logic — ÚNICA FUENTE DE VERDAD.
 *
 * Business rules:
 *  - Plan expires on the last day of the month (fecha_fin).
 *  - Day 1-5 of next month with no approved payment → pago_pendiente (gracia).
 *  - After day 5 with no approved payment → acceso_pausado.
 *
 * MAPPING DB raw → effective → UI label:
 *
 *   DB `suscripciones.estado`  →  getEffectiveSubStatus()  →  Admin "Pagos" UI
 *   ─────────────────────────────────────────────────────────────────────────
 *   activa (fecha_fin >= hoy)     → activa                  → "Pagado"
 *   activa (fecha_fin < hoy, día 1-5 mes siguiente)
 *                                 → pago_pendiente          → "Por cobrar"
 *   activa (fecha_fin < hoy, día >5)
 *                                 → acceso_pausado          → "Vencido"
 *   pendiente                     → pendiente               → "Por cobrar"
 *   pendiente_verificacion        → pendiente_verificacion  → "Informado"
 *   vencida                       → vencida                 → "Vencido"
 *                                                             (excepto si origen_registro∈{automatico,cargado_admin}
 *                                                              → "Pagado" en su período)
 *   conciliado                    → conciliado (raw)        → "Conciliado"
 *   cancelada / cancelada_at      → activa hasta fecha_fin
 *                                   luego cancelada         → "Cancelado"
 *   pausa                         → pausa                   → "Cancelado" en pagos
 *
 * REGLA DE ORO: NUNCA filtres "pagos por cobrar" sólo por `estado='pendiente'`.
 * Usá siempre `isAdminPayableSubscription()` o `getEffectiveSubStatus()` para
 * incluir también las gracia/vencidas. Cualquier KPI/alerta que use el campo
 * raw saltará desfases respecto del módulo `/admin/pagos`.
 *
 * Para totales monetarios usá SIEMPRE `precio_final ?? planes.precio` para
 * respetar descuentos aplicados a la suscripción.
 */


export type EffectiveSubStatus =
  | "activa"
  | "pago_pendiente"
  | "acceso_pausado"
  | "pendiente"
  | "pendiente_verificacion"
  | "vencida"
  | "finalizada"
  | "cancelada"
  | "pausa"
  | "sin_plan";

export interface SubStatusInput {
  estado: string;
  fecha_fin: string | null;
  cancelada_at?: string | null;
  mp_status?: string | null;
  origen_registro?: string | null;
}

export const ADMIN_PAYABLE_EFFECTIVE_STATUSES: EffectiveSubStatus[] = [
  "pendiente",
  "pendiente_verificacion",
  "vencida",
  "pago_pendiente",
  "acceso_pausado",
];

/** Una sub se considera "pagada" cuando MP la aprobó o el admin la marcó como cargada. */
export function isSubPaid(sub: SubStatusInput): boolean {
  if (sub.mp_status === "approved") return true;
  if (sub.origen_registro === "cargado_admin" || sub.origen_registro === "automatico") return true;
  return false;
}

export function isAdminPayableSubscription(sub: SubStatusInput): boolean {
  if (sub.cancelada_at || sub.estado === "cancelada") return false;
  // estado='activa' raw significa que YA está pagada
  if (sub.estado === "activa") return false;
  // Sub finalizada (período cerrado y pagada) tampoco se cobra de nuevo:
  // se debe crear una NUEVA suscripción para el próximo período.
  if (getEffectiveSubStatus(sub) === "finalizada") return false;
  return ADMIN_PAYABLE_EFFECTIVE_STATUSES.includes(getEffectiveSubStatus(sub));
}


/**
 * Computes the effective subscription status based on current date and grace period rules.
 */
export function getEffectiveSubStatus(sub: SubStatusInput): EffectiveSubStatus {
  // Si está cancelada pero la fecha_fin todavía no llegó, conserva el acceso
  // (política: sin reembolso, acceso hasta fin de período).
  // Recién cuando expire la fecha_fin la marcamos como "cancelada".
  if (sub.cancelada_at) {
    if (!sub.fecha_fin) return "cancelada";
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const finParts = sub.fecha_fin.substring(0, 10).split("-");
    const fin = new Date(
      parseInt(finParts[0], 10),
      parseInt(finParts[1], 10) - 1,
      parseInt(finParts[2], 10),
      23, 59, 59
    );
    if (today > fin) return "cancelada";
    // Sigue vigente hasta fecha_fin: tratar como "activa" para acceso completo
    return "activa";
  }

  // If the subscription isn't "activa" in the DB, check for "vencida pero paga"
  if (sub.estado !== "activa") {
    // "vencida" en DB pero con pago aprobado: el período contable está cerrado,
    // PERO el alumno mantiene la ventana de gracia día 1-5 del mes siguiente
    // (igual que una sub activa que acaba de vencer). Pasada la gracia sí
    // pasa a "finalizada" (sin deuda, sin acceso, requiere renovar).
    if (sub.estado === "vencida" && isSubPaid(sub)) {
      if (sub.fecha_fin) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const [fy, fm, fd] = sub.fecha_fin.substring(0, 10).split("-").map((n) => parseInt(n, 10));
        const fin = new Date(fy, fm - 1, fd, 23, 59, 59);
        if (today <= fin) return "activa";
        const isNextMonth =
          (today.getFullYear() === fin.getFullYear() && today.getMonth() === fin.getMonth() + 1) ||
          (today.getFullYear() === fin.getFullYear() + 1 && fin.getMonth() === 11 && today.getMonth() === 0);
        if (isNextMonth && today.getDate() <= 5) return "pago_pendiente";
      }
      return "finalizada";
    }
    return sub.estado as EffectiveSubStatus;
  }


  // Active subscription — check expiry
  if (!sub.fecha_fin) return "activa";

  const today = new Date();
  today.setHours(0, 0, 0, 0);


  // Parse fecha_fin robustly — extract YYYY-MM-DD parts to avoid timezone drift
  const finParts = sub.fecha_fin.substring(0, 10).split("-");
  const finYear = parseInt(finParts[0], 10);
  const finMonth = parseInt(finParts[1], 10) - 1;
  const finDay = parseInt(finParts[2], 10);
  const fin = new Date(finYear, finMonth, finDay, 23, 59, 59);

  // Still within the plan period
  if (today <= fin) return "activa";

  // Plan expired — calculate how many days past expiry
  const dayOfMonth = today.getDate();
  const expMonth = fin.getMonth();
  const expYear = fin.getFullYear();
  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();

  // Check if we're in the month immediately after expiry
  const isNextMonth =
    (currentYear === expYear && currentMonth === expMonth + 1) ||
    (currentYear === expYear + 1 && expMonth === 11 && currentMonth === 0);

  if (isNextMonth && dayOfMonth <= 5) {
    return "pago_pendiente";
  }

  return "acceso_pausado";
}

/**
 * Determines what a student can access based on their best subscription status.
 */
export interface AccessPermissions {
  canViewHome: boolean;
  canViewEvents: boolean;
  canViewProgress: boolean;
  canViewStore: boolean;
  canViewMore: boolean;
  canMarkTraining: boolean;
  canReserveActivities: boolean;
  /** Banner message to show, or null */
  bannerMessage: string | null;
  bannerType: "warning" | "error" | "info" | null;
  status: EffectiveSubStatus;
}

export function getAccessPermissions(subs: SubStatusInput[]): AccessPermissions {
  // Get the "best" status across all subscriptions
  const statuses = subs.map(getEffectiveSubStatus);

  const hasActive = statuses.includes("activa");
  const hasPendingVerification = statuses.includes("pendiente_verificacion");
  const hasPagoPendiente = statuses.includes("pago_pendiente");
  const hasAccesoPausado = statuses.includes("acceso_pausado");
  // Subs cargadas por admin sin pago (Gustavo Rosa et al): deben restringir igual que acceso_pausado
  const hasDeudaManual = statuses.includes("pendiente") || statuses.includes("vencida");

  // Best status wins
  if (hasActive || hasPendingVerification) {
    return {
      canViewHome: true,
      canViewEvents: true,
      canViewProgress: true,
      canViewStore: true,
      canViewMore: true,
      canMarkTraining: true,
      canReserveActivities: true,
      bannerMessage: null,
      bannerType: null,
      status: hasActive ? "activa" : "pendiente_verificacion",
    };
  }

  if (hasPagoPendiente) {
    const today = new Date();
    const daysLeft = 5 - today.getDate();
    return {
      canViewHome: true,
      canViewEvents: true,
      canViewProgress: false,
      canViewStore: true,
      canViewMore: true,
      canMarkTraining: false,
      canReserveActivities: false,
      bannerMessage: `Tu plan venció. Regularizá tu pago antes del día 5 para mantener tu acceso completo. ${daysLeft > 0 ? `Te quedan ${daysLeft} día${daysLeft !== 1 ? "s" : ""}.` : "Hoy es el último día."}`,
      bannerType: "warning",
      status: "pago_pendiente",
    };
  }

  if (hasAccesoPausado) {
    return {
      canViewHome: true,
      canViewEvents: false,
      canViewProgress: false,
      canViewStore: false,
      canViewMore: true,
      canMarkTraining: false,
      canReserveActivities: false,
      bannerMessage: "Tu acceso está pausado por pago pendiente. Cuando regularices tu mensualidad, reactivamos tu plan.",
      bannerType: "error",
      status: "acceso_pausado",
    };
  }

  if (hasDeudaManual) {
    return {
      canViewHome: true,
      canViewEvents: false,
      canViewProgress: false,
      canViewStore: false,
      canViewMore: true,
      canMarkTraining: false,
      canReserveActivities: false,
      bannerMessage: "Tenés una mensualidad pendiente de pago. Regularizá tu cuota para reactivar el acceso completo.",
      bannerType: "error",
      status: "acceso_pausado",
    };
  }

  // No subs at all, or all cancelled/vencida — alumno needs to pick/regularize a plan
  const hasAnySub = subs.length > 0;
  const allInactive = statuses.every(
    (s) => s === "cancelada" || s === "vencida" || s === "sin_plan"
  );

  return {
    canViewHome: true,
    canViewEvents: true,
    canViewProgress: false,
    canViewStore: true,
    canViewMore: true,
    canMarkTraining: false,
    canReserveActivities: false,
    bannerMessage: hasAnySub && allInactive
      ? "Tu plan ya no está vigente. Elegí un plan para volver a entrenar y reservar actividades."
      : !hasAnySub
        ? "Todavía no tenés un plan activo. Elegí uno para empezar a entrenar."
        : null,
    bannerType: (hasAnySub && allInactive) || !hasAnySub ? "warning" : null,
    status: !hasAnySub ? "sin_plan" : (statuses[0] || "vencida"),
  };
}

/** Human-friendly labels */
export const SUB_STATUS_LABELS: Record<string, string> = {
  activa: "Activo",
  pago_pendiente: "Pago pendiente",
  acceso_pausado: "Acceso pausado",
  pendiente: "Pendiente",
  pendiente_verificacion: "Pendiente de validación",
  vencida: "Vencida",
  finalizada: "Finalizada",
  cancelada: "Cancelada",
  pausa: "Pausada",
  duplicada: "Duplicada",
  sin_plan: "Sin plan activo",
};


/** Status config for badges */
export const SUB_STATUS_BADGE: Record<string, { className: string }> = {
  activa: { className: "bg-emerald-600/20 text-emerald-400 border-emerald-500/30" },
  pago_pendiente: { className: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
  acceso_pausado: { className: "bg-destructive/20 text-destructive border-destructive/30" },
  pendiente: { className: "border-yellow-500/50 text-yellow-400" },
  pendiente_verificacion: { className: "border-yellow-500/50 text-yellow-400" },
  vencida: { className: "bg-destructive/10 text-destructive border-destructive/30" },
  finalizada: { className: "bg-muted/40 text-muted-foreground border-border" },
  cancelada: { className: "text-muted-foreground border-dashed" },
  pausa: { className: "border-amber-500/50 text-amber-400" },
  duplicada: { className: "text-muted-foreground border-dashed bg-muted/30" },
};
