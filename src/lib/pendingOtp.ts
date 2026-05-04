export const OTP_LENGTH = 8;
export const OTP_REQUEST_COOLDOWN_MS = 8_000;

export type PendingOtpContext = "main" | "staff";

export interface PendingOtpState {
  status: "pending_otp";
  email: string;
  returnTo: string | null;
  requestedAt: number;
  context: PendingOtpContext;
  otpLength: number;
}

const PENDING_OTP_STORAGE_KEY = "reybaud_pending_otp";

let inFlightOtpRequest = false;

const canUseStorage = () => typeof window !== "undefined" && !!window.localStorage;

const isPendingOtpState = (value: unknown): value is PendingOtpState => {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<PendingOtpState>;
  return (
    state.status === "pending_otp" &&
    typeof state.email === "string" &&
    typeof state.requestedAt === "number" &&
    (state.context === "main" || state.context === "staff")
  );
};

export const loadPendingOtpState = (context?: PendingOtpContext): PendingOtpState | null => {
  if (!canUseStorage()) return null;

  try {
    const raw = window.localStorage.getItem(PENDING_OTP_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!isPendingOtpState(parsed)) {
      window.localStorage.removeItem(PENDING_OTP_STORAGE_KEY);
      return null;
    }

    if (context && parsed.context !== context) return null;
    return parsed;
  } catch {
    window.localStorage.removeItem(PENDING_OTP_STORAGE_KEY);
    return null;
  }
};

export const savePendingOtpState = ({
  email,
  returnTo,
  context,
}: Pick<PendingOtpState, "email" | "returnTo" | "context">) => {
  if (!canUseStorage()) return;

  const state: PendingOtpState = {
    status: "pending_otp",
    email,
    returnTo,
    context,
    requestedAt: Date.now(),
    otpLength: OTP_LENGTH,
  };

  window.localStorage.setItem(PENDING_OTP_STORAGE_KEY, JSON.stringify(state));
};

export const clearPendingOtpState = () => {
  if (!canUseStorage()) return;
  window.localStorage.removeItem(PENDING_OTP_STORAGE_KEY);
};

export const startOtpRequest = () => {
  if (inFlightOtpRequest) return false;
  inFlightOtpRequest = true;
  return true;
};

export const finishOtpRequest = () => {
  inFlightOtpRequest = false;
};

export const canRequestOtpAgain = (context: PendingOtpContext, email: string) => {
  const pending = loadPendingOtpState(context);
  if (!pending || pending.email !== email) return true;
  return Date.now() - pending.requestedAt > OTP_REQUEST_COOLDOWN_MS;
};

export const normalizeOtpCode = (value: string) => value.replace(/\D/g, "").slice(0, OTP_LENGTH);

export const getOtpErrorMessage = (error: { message?: string; code?: string; status?: number }) => {
  const message = error.message || "";
  const code = error.code || "";

  console.warn("OTP verify failed", {
    code,
    status: error.status,
    message,
    at: new Date().toISOString(),
  });

  if (code === "otp_expired" || /^otp_expired$/i.test(message) || /^token expired$/i.test(message)) {
    return "El código venció. Pedí uno nuevo.";
  }

  return "No pudimos validar el código. Pedí uno nuevo o intentá nuevamente.";
};

export const getSafeReturnTo = (returnTo: string | null | undefined) => {
  if (!returnTo || !returnTo.startsWith("/") || returnTo.startsWith("//")) return null;
  if (returnTo === "/" || returnTo.startsWith("/admin/login")) return null;
  return returnTo;
};