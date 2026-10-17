import { choiceAnswerStatus, type ChoiceSurveyAnswer, type ChoiceSurveyConfig } from './choiceSurvey';

export interface ChoiceAdminEntry {
  reservation_id: string;
  status: 'confirmed' | 'pending';
  confirmed_value: string | null;
  candidates: string[];
  notes: string;
  updated_at?: string;
}

export function resolveChoiceSources(survey: ChoiceSurveyConfig, answer?: ChoiceSurveyAnswer | null, admin?: ChoiceAdminEntry) {
  const participant = choiceAnswerStatus(survey, answer) === 'confirmado' ? answer?.respuesta : null;
  const adminValue = admin?.status === 'confirmed' && survey.options.some(o => o.value === admin.confirmed_value && !o.needs_follow_up) ? admin.confirmed_value : null;
  const conflict = Boolean(participant && adminValue && participant !== adminValue);
  const value = conflict ? null : participant || adminValue || null;
  const origin = participant && adminValue ? 'Encuesta + Administración' : participant ? 'Encuesta' : admin ? 'Administración' : 'Sin información';
  return { value, conflict, origin, status: conflict ? 'Revisar discrepancia' : value ? 'Confirmado' : admin?.status === 'pending' ? 'Pendiente administración' : 'Pendiente' };
}

export function summarizeChoiceSources(survey: ChoiceSurveyConfig, rows: { answer?: ChoiceSurveyAnswer; admin?: ChoiceAdminEntry }[]) {
  const resolved = rows.map(r => resolveChoiceSources(survey, r.answer, r.admin));
  return {
    ready: resolved.filter(r => r.value).length,
    pending: resolved.filter(r => !r.value).length,
    conflicts: resolved.filter(r => r.conflict).length,
    adminOnly: resolved.filter(r => r.value && r.origin === 'Administración').length,
    counts: survey.options.filter(o => !o.needs_follow_up).map(o => ({ ...o, count: resolved.filter(r => r.value === o.value).length })),
  };
}