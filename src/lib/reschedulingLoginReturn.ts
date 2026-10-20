import { getSafeReturnTo } from './pendingOtp';

/** This public participant route performs its own server-side ownership checks. */
export function reschedulingLoginReturn(value: string | null | undefined) {
 const safe = getSafeReturnTo(value);
 return safe && /^\/reprogramacion\/[a-zA-Z0-9-]+$/.test(safe) ? safe : null;
}