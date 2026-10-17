import type { ChoiceSurveyConfig } from './choiceSurvey';

export interface StaffJersey {
  id: string;
  recipient_name: string;
  staff_key: string;
  size: string;
  quantity: number;
  active: boolean;
  updated_at?: string;
}

export function staffKey(name: string) {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function summarizeJerseyOrder(survey: ChoiceSurveyConfig, participants: { value: string; count: number }[], staff: StaffJersey[]) {
  const counts = survey.options.filter(o => !o.needs_follow_up).map(o => {
    const participantCount = participants.find(p => p.value === o.value)?.count ?? 0;
    const staffCount = staff.filter(s => s.active && s.size === o.value && Number.isInteger(s.quantity) && s.quantity > 0).reduce((sum, s) => sum + s.quantity, 0);
    return { ...o, participants: participantCount, staff: staffCount, total: participantCount + staffCount };
  });
  return { counts, participants: counts.reduce((n, c) => n + c.participants, 0), staff: counts.reduce((n, c) => n + c.staff, 0), total: counts.reduce((n, c) => n + c.total, 0) };
}