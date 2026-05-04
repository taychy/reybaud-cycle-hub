export const OTP_LENGTH = 8;

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

export const getSafeReturnTo = (returnTo: string | null | undefined) => {
  if (!returnTo || !returnTo.startsWith("/") || returnTo.startsWith("//")) return null;
  if (returnTo === "/" || returnTo.startsWith("/admin/login")) return null;
  return returnTo;
};