export type FrequencyPolicy = { days: number; override: boolean; reason?: string };
export type Candidate = { email?: string; contact_type?: string; [key: string]: unknown };
export function normalizeEmail(value: string) { return value.trim().toLowerCase(); }
export function evaluateRecipients(rows: Candidate[], suppressed: Set<string>, optedOut: Set<string>, lastSent: Map<string, string>, policy: FrequencyPolicy, excluded: Set<string>, now = Date.now()) {
  const seen = new Set<string>();
  const eligible: Candidate[] = [], rejected: { email: string; reason: string }[] = [];
  for (const row of rows) {
    const email = normalizeEmail(row.email || '');
    let reason = '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.endsWith('.invalid')) reason = 'Email inválido';
    else if (suppressed.has(email)) reason = 'Supresión / rebote / queja';
    else if (optedOut.has(email)) reason = 'Sin consentimiento / baja';
    else if (seen.has(email)) reason = 'Duplicado';
    else if (excluded.has(email)) reason = 'Exclusión administrativa';
    else if (!policy.override && lastSent.has(email) && Date.parse(lastSent.get(email) || '') > now - policy.days * 86400000) reason = 'Frecuencia';
    seen.add(email);
    if (reason) rejected.push({ email, reason }); else eligible.push({ ...row, email });
  }
  return { eligible, rejected };
}
export function frequencyPolicy(filters: { marketing_frequency_days?: number; marketing_ignore_frequency?: boolean; marketing_frequency_reason?: string }): FrequencyPolicy {
  const days = filters.marketing_frequency_days ?? 7;
  const override = filters.marketing_ignore_frequency === true;
  const reason = filters.marketing_frequency_reason?.trim();
  if (!Number.isInteger(days) || days < 1 || days > 365) throw new Error('La frecuencia debe ser de 1 a 365 días');
  if (override && (!reason || reason.length < 10)) throw new Error('La excepción de frecuencia requiere un motivo de al menos 10 caracteres');
  return { days, override, reason };
}
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}